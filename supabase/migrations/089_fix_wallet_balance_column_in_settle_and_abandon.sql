-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 089
-- CORRECCIÓN DEFINITIVA DE COLUMNA WALLETS (AVAILABLE_BALANCE) EN SETTLEMENT Y ABANDON
-- ==============================================================================
-- Causa Raíz Identificada (Error: column "balance" does not exist):
-- La tabla `public.wallets` contiene `available_balance`, `held_balance` y `total_balance`.
-- Las RPCs settle_game_session y abandon_game_table_secure referenciaron `balance`
-- provocando fallos al abandonar mesas o liquidar partidas.
--
-- Esta migración:
-- 1. Añade columna de compatibilidad `balance NUMERIC(14,2)` a `public.wallets` y sincroniza con trigger.
-- 2. Actualiza `settle_game_session` con `available_balance` y `ledger_entries` canónico.
-- 3. Actualiza `abandon_game_table_secure` con `available_balance` y `ledger_entries` canónico.
-- ==============================================================================

-- 1. ADICIÓN SEGURA DE COLUMNA DE COMPATIBILIDAD BALANCE EN WALLETS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'wallets' 
      AND column_name = 'balance'
  ) THEN
    ALTER TABLE public.wallets ADD COLUMN balance NUMERIC(14,2) DEFAULT 0.00;
    UPDATE public.wallets SET balance = available_balance;
  END IF;
END $$;

-- Trigger bidireccional para mantener balance sincronizado con available_balance
CREATE OR REPLACE FUNCTION public.fn_wallets_sync_balance_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.available_balance IS NOT NULL AND (NEW.balance IS NULL OR NEW.balance != NEW.available_balance) THEN
    NEW.balance := NEW.available_balance;
  ELSIF NEW.balance IS NOT NULL AND NEW.available_balance IS NULL THEN
    NEW.available_balance := NEW.balance;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallets_sync_balance_column ON public.wallets;
CREATE TRIGGER trg_wallets_sync_balance_column
BEFORE INSERT OR UPDATE ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.fn_wallets_sync_balance_column();

-- 2. ACTUALIZACIÓN CANÓNICA DE SETTLE_GAME_SESSION
CREATE OR REPLACE FUNCTION public.settle_game_session(
  p_session_id UUID,
  p_winner_user_ids UUID[],
  p_winner_team INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_player_count INT;
  v_gross_pool NUMERIC(14,2);
  v_prize_pool NUMERIC(14,2);
  v_platform_fee NUMERIC(14,2);
  v_settlement_id UUID;
  v_player RECORD;
  v_winner_id UUID;
  v_winner_wallet RECORD;
  v_winner_count INT;
  v_individual_prize NUMERIC(14,2);
  v_distributed_sum NUMERIC(14,2) := 0.00;
  v_winner_ledger_id UUID;
  v_settlement_type settlement_type_enum;
  v_existing_settlement RECORD;
  v_is_participant BOOLEAN := FALSE;
  v_effective_idempotency TEXT;
BEGIN
  -- 1. Identificación del invocador y control de autorización
  v_caller_id := auth.uid();
  
  -- Bloqueo pesimista de fila para evitar condiciones de carrera (TOCTOU)
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión de juego % no encontrada', p_session_id;
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa de juego no encontrada';
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.game_table_players
      WHERE table_id = v_table.id AND user_id = v_caller_id
    ) INTO v_is_participant;

    IF NOT v_is_participant AND NOT public.has_role(v_caller_id, 'OPERATOR') AND NOT public.has_role(v_caller_id, 'ADMIN') AND NOT public.has_role(v_caller_id, 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'UNAUTHORIZED: No tienes permisos para liquidar esta partida';
    END IF;
  END IF;

  -- 2. Manejo de Idempotencia estricta
  v_effective_idempotency := COALESCE(p_idempotency_key, 'settle_' || p_session_id::TEXT);

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE idempotency_key = v_effective_idempotency
     OR session_id = p_session_id;

  IF FOUND THEN
    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        closed_at = COALESCE(closed_at, NOW()),
        current_players_count = 0,
        updated_at = NOW()
    WHERE id = v_table.id;

    UPDATE public.game_table_players
    SET status = 'LEFT'::player_table_status_enum,
        left_at = COALESCE(left_at, NOW()),
        updated_at = NOW()
    WHERE table_id = v_table.id
      AND status != 'LEFT'::player_table_status_enum;

    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'settlement_id', v_existing_settlement.id,
      'gross_pool', v_existing_settlement.gross_pool,
      'prize_pool', v_existing_settlement.prize_pool,
      'platform_fee', v_existing_settlement.platform_fee,
      'message', 'Partida ya liquidada previamente de forma segura'
    );
  END IF;

  -- 3. Cálculo de Pozos Financieros (Regla 90% Ganador / 10% Plataforma)
  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  IF v_player_count < 1 THEN
    v_player_count := 2;
  END IF;

  v_gross_pool := ROUND((v_table.entry_fee * v_player_count)::NUMERIC, 2);
  v_prize_pool := ROUND((v_gross_pool * 0.90)::NUMERIC, 2);
  v_platform_fee := ROUND((v_gross_pool - v_prize_pool)::NUMERIC, 2);

  v_winner_count := COALESCE(array_length(p_winner_user_ids, 1), 0);

  -- 4. Determinar tipo de liquidación
  IF v_winner_count = 0 THEN
    v_settlement_type := 'DRAW_REFUND'::settlement_type_enum;
  ELSIF v_winner_count = 1 THEN
    v_settlement_type := 'STANDARD_PAYOUT'::settlement_type_enum;
  ELSE
    v_settlement_type := 'SPLIT_PAYOUT'::settlement_type_enum;
  END IF;

  -- 5. Crear Registro Maestro en public.game_settlements
  INSERT INTO public.game_settlements (
    session_id,
    table_id,
    settlement_type,
    gross_pool,
    prize_pool,
    platform_fee,
    total_distributed,
    idempotency_key,
    settled_at,
    settled_by
  ) VALUES (
    p_session_id,
    v_table.id,
    v_settlement_type,
    v_gross_pool,
    v_prize_pool,
    v_platform_fee,
    CASE WHEN v_winner_count > 0 THEN v_prize_pool ELSE v_gross_pool END,
    v_effective_idempotency,
    NOW(),
    COALESCE(v_caller_id::text, 'SERVER_ENGINE')
  ) RETURNING id INTO v_settlement_id;

  -- 6. Distribución y Acreditación de Ganadores
  IF v_winner_count > 0 THEN
    v_individual_prize := TRUNC((v_prize_pool / v_winner_count)::NUMERIC, 2);

    FOREACH v_winner_id IN ARRAY p_winner_user_ids
    LOOP
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_winner_id AND currency = 'VES'
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.wallets (user_id, currency, available_balance, held_balance, balance, created_at, updated_at)
        VALUES (v_winner_id, 'VES', 0.00, 0.00, 0.00, NOW(), NOW())
        RETURNING * INTO v_winner_wallet;
      END IF;

      UPDATE public.wallets
      SET available_balance = available_balance + v_individual_prize,
          balance = available_balance + v_individual_prize,
          updated_at = NOW()
      WHERE id = v_winner_wallet.id;

      INSERT INTO public.ledger_entries (
        wallet_id,
        user_id,
        amount,
        currency,
        entry_type,
        direction,
        reference_id,
        reference_table,
        reference_type,
        balance_before,
        balance_after,
        balance_after_available,
        balance_after_held,
        idempotency_key,
        description,
        metadata,
        created_at
      ) VALUES (
        v_winner_wallet.id,
        v_winner_id,
        v_individual_prize,
        'VES',
        'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
        'CREDIT'::ledger_direction_enum,
        v_settlement_id,
        'game_settlements',
        'game_settlement',
        COALESCE(v_winner_wallet.available_balance, 0.00),
        COALESCE(v_winner_wallet.available_balance, 0.00) + v_individual_prize,
        COALESCE(v_winner_wallet.available_balance, 0.00) + v_individual_prize,
        COALESCE(v_winner_wallet.held_balance, 0.00),
        v_effective_idempotency || '_payout_' || v_winner_id::text,
        'Premio de victoria en ' || v_table.game_type,
        jsonb_build_object(
          'session_id', p_session_id,
          'table_id', v_table.id,
          'game_type', v_table.game_type,
          'idempotency_key', v_effective_idempotency,
          'description', 'Premio de victoria en ' || v_table.game_type
        ),
        NOW()
      ) RETURNING id INTO v_winner_ledger_id;

      INSERT INTO public.game_settlement_recipients (
        settlement_id,
        user_id,
        payout_amount,
        ledger_entry_id,
        created_at
      ) VALUES (
        v_settlement_id,
        v_winner_id,
        v_individual_prize,
        v_winner_ledger_id,
        NOW()
      );

      v_distributed_sum := v_distributed_sum + v_individual_prize;
    END LOOP;
  ELSE
    -- Reembolso íntegro en caso de empate técnico o sin ganadores
    FOR v_player IN (
      SELECT DISTINCT user_id FROM public.game_table_players WHERE table_id = v_table.id
    ) LOOP
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_player.user_id AND currency = 'VES'
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET available_balance = available_balance + v_table.entry_fee,
            balance = available_balance + v_table.entry_fee,
            updated_at = NOW()
        WHERE id = v_winner_wallet.id;

        INSERT INTO public.ledger_entries (
          wallet_id,
          user_id,
          amount,
          currency,
          entry_type,
          direction,
          reference_id,
          reference_table,
          reference_type,
          balance_before,
          balance_after,
          balance_after_available,
          balance_after_held,
          idempotency_key,
          description,
          metadata,
          created_at
        ) VALUES (
          v_winner_wallet.id,
          v_player.user_id,
          v_table.entry_fee,
          'VES',
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_settlement_id,
          'game_settlements',
          'game_settlement',
          COALESCE(v_winner_wallet.available_balance, 0.00),
          COALESCE(v_winner_wallet.available_balance, 0.00) + v_table.entry_fee,
          COALESCE(v_winner_wallet.available_balance, 0.00) + v_table.entry_fee,
          COALESCE(v_winner_wallet.held_balance, 0.00),
          v_effective_idempotency || '_refund_' || v_player.user_id::text,
          'Reembolso por empate técnico o anulación segura',
          jsonb_build_object(
            'session_id', p_session_id,
            'table_id', v_table.id,
            'reason', 'Empate técnico o anulación segura'
          ),
          NOW()
        );
      END IF;
    END LOOP;
  END IF;

  -- 7. Actualizar Estados de Sesión y Mesa
  UPDATE public.game_sessions
  SET status = 'SETTLED'::session_status_enum,
      winner_user_id = p_winner_user_ids[1],
      winner_team = p_winner_team,
      ended_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      current_players_count = 0,
      updated_at = NOW()
  WHERE id = v_table.id;

  -- 8. Liberar asientos de los jugadores
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = COALESCE(left_at, NOW()),
      updated_at = NOW()
  WHERE table_id = v_table.id
    AND status != 'LEFT'::player_table_status_enum;

  RETURN jsonb_build_object(
    'success', true,
    'already_settled', false,
    'settlement_id', v_settlement_id,
    'gross_pool', v_gross_pool,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee,
    'winner_count', v_winner_count
  );
END;
$$;

-- 3. ACTUALIZACIÓN CANÓNICA DE ABANDON_GAME_TABLE_SECURE
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_table RECORD;
  v_session RECORD;
  v_player RECORD;
  v_wallet RECORD;
  v_active_players_count INT;
  v_refund_amount NUMERIC(14,2) := 0.00;
  v_effective_idempotency TEXT;
  v_settle_result JSONB;
  v_remaining_player RECORD;
  v_next_player RECORD;
  v_session_is_active BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para abandonar o salir de la mesa.';
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abandon_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text
  );

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada.';
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE id = p_session_id AND table_id = p_table_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE table_id = p_table_id
      AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'IN_PROGRESS')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  v_session_is_active := (v_session.id IS NOT NULL AND v_session.status::text IN ('ACTIVE', 'IN_PROGRESS'));

  SELECT * INTO v_player
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND user_id = v_caller_id
    AND status IN ('PLAYING', 'JOINED', 'READY')
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
    FROM public.game_table_players
    WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

    RETURN jsonb_build_object(
      'success', true,
      'already_left', true,
      'table_id', p_table_id,
      'remaining_players', v_active_players_count
    );
  END IF;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE id = v_player.id;

  IF NOT v_session_is_active THEN
    IF v_table.entry_fee > 0 THEN
      SELECT * INTO v_wallet
      FROM public.wallets
      WHERE user_id = v_caller_id AND currency = 'VES'
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET available_balance = available_balance + v_table.entry_fee,
            balance = available_balance + v_table.entry_fee,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.ledger_entries (
          wallet_id,
          user_id,
          amount,
          currency,
          entry_type,
          direction,
          reference_id,
          reference_table,
          reference_type,
          balance_before,
          balance_after,
          balance_after_available,
          balance_after_held,
          idempotency_key,
          description,
          metadata,
          created_at
        ) VALUES (
          v_wallet.id,
          v_caller_id,
          v_table.entry_fee,
          'VES',
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          p_table_id,
          'game_tables',
          'game_tables',
          COALESCE(v_wallet.available_balance, 0.00),
          COALESCE(v_wallet.available_balance, 0.00) + v_table.entry_fee,
          COALESCE(v_wallet.available_balance, 0.00) + v_table.entry_fee,
          COALESCE(v_wallet.held_balance, 0.00),
          v_effective_idempotency || '_refund',
          'Reembolso por abandono voluntario de mesa previa al inicio',
          jsonb_build_object('reason', 'Reembolso por abandono voluntario de mesa previa al inicio'),
          NOW()
        );
        v_refund_amount := v_table.entry_fee;
      END IF;
    END IF;
  END IF;

  SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

  IF v_session_is_active THEN
    IF v_active_players_count = 1 THEN
      SELECT user_id INTO v_remaining_player
      FROM public.game_table_players
      WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY')
      LIMIT 1;

      IF v_remaining_player.user_id IS NOT NULL THEN
        v_settle_result := public.settle_game_session(
          v_session.id,
          ARRAY[v_remaining_player.user_id],
          NULL,
          'forfeit_' || v_session.id::text || '_' || v_remaining_player.user_id::text
        );
      END IF;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = p_table_id;

      RETURN jsonb_build_object(
        'success', true,
        'table_id', p_table_id,
        'session_id', v_session.id,
        'action', 'FORFEIT_SETTLED',
        'winner_user_id', v_remaining_player.user_id,
        'settlement', v_settle_result
      );
    ELSIF v_active_players_count = 0 THEN
      UPDATE public.game_sessions
      SET status = 'ABANDONED'::session_status_enum,
          ended_at = NOW()
      WHERE id = v_session.id;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = p_table_id;

      RETURN jsonb_build_object(
        'success', true,
        'table_id', p_table_id,
        'session_id', v_session.id,
        'action', 'TABLE_ABANDONED_ALL'
      );
    ELSE
      IF v_session.current_turn_user_id = v_caller_id THEN
        SELECT user_id INTO v_next_player
        FROM public.game_table_players
        WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY')
        ORDER BY seat_number ASC
        LIMIT 1;

        UPDATE public.game_sessions
        SET current_turn_user_id = v_next_player.user_id,
            turn_deadline_at = NOW() + INTERVAL '10 seconds'
        WHERE id = v_session.id;
      END IF;

      UPDATE public.game_tables
      SET current_players_count = v_active_players_count,
          updated_at = NOW()
      WHERE id = p_table_id;

      RETURN jsonb_build_object(
        'success', true,
        'table_id', p_table_id,
        'session_id', v_session.id,
        'action', 'PLAYER_LEFT_MULTIPLAYER',
        'remaining_players', v_active_players_count
      );
    END IF;
  ELSE
    IF v_active_players_count = 0 THEN
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = p_table_id;
    ELSE
      UPDATE public.game_tables
      SET current_players_count = v_active_players_count,
          updated_at = NOW()
      WHERE id = p_table_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'table_id', p_table_id,
      'refund_amount', v_refund_amount,
      'remaining_players', v_active_players_count
    );
  END IF;
END;
$$;
