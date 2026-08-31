-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 087
-- CORRECCIÓN DEL CICLO DE VIDA Y LIMPIEZA INMEDIATA DE MESAS PÚBLICAS
-- ==============================================================================
-- 1. Actualiza settle_game_session para:
--    - Marcar game_tables con status = 'CLOSED', closed_at = NOW() y current_players_count = 0.
--    - Liberar atómicamente todos los asientos en game_table_players (status = 'LEFT', left_at = NOW()).
--    - Blindar la rama de idempotencia para asegurar que mesas previamente liquidadas
--      queden marcadas como CLOSED y con closed_at.
-- 2. Actualiza abandon_game_table_secure para:
--    - Asignar closed_at = NOW() y current_players_count = 0 en cualquier escenario donde
--      la mesa pase a estado CLOSED.
-- 3. Crea RPC canónica get_public_available_tables() para filtrado de alta precisión en DB.
-- 4. Concilia y limpia cualquier mesa huérfana o finalizada en el entorno.
-- ==============================================================================

-- 1. ACTUALIZACIÓN CANÓNICA DE SETTLE_GAME_SESSION
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
  
  -- Verificar existencia de la sesión con bloqueo de fila para evitar condiciones de carrera (TOCTOU)
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

  -- Si es invocado por un usuario autenticado, validar que sea participante o rol administrativo
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
    -- Garantizar que mesa y jugadores queden en estado terminal limpio
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
    v_player_count := 2; -- Fallback seguro de quorum
  END IF;

  v_gross_pool := ROUND((v_table.entry_fee * v_player_count)::NUMERIC, 2);
  v_prize_pool := ROUND((v_gross_pool * 0.90)::NUMERIC, 2);
  v_platform_fee := ROUND((v_gross_pool - v_prize_pool)::NUMERIC, 2);

  v_winner_count := COALESCE(array_length(p_winner_user_ids, 1), 0);

  -- 4. Determinar tipo de liquidación
  IF v_winner_count = 0 THEN
    v_settlement_type := 'REFUND_TECHNICAL_DRAW'::settlement_type_enum;
  ELSIF v_winner_count = 1 THEN
    v_settlement_type := 'WINNER_TAKES_ALL'::settlement_type_enum;
  ELSE
    v_settlement_type := 'SPLIT_POT'::settlement_type_enum;
  END IF;

  -- 5. Crear Registro Maestro de Liquidación en game_settlements
  INSERT INTO public.game_settlements (
    session_id,
    table_id,
    settlement_type,
    gross_pool,
    prize_pool,
    platform_fee,
    currency,
    idempotency_key,
    created_at
  ) VALUES (
    p_session_id,
    v_table.id,
    v_settlement_type,
    v_gross_pool,
    v_prize_pool,
    v_platform_fee,
    v_table.currency,
    v_effective_idempotency,
    NOW()
  ) RETURNING id INTO v_settlement_id;

  -- 6. Distribución y Acreditación de Ganadores
  IF v_winner_count > 0 THEN
    v_individual_prize := TRUNC((v_prize_pool / v_winner_count)::NUMERIC, 2);

    FOREACH v_winner_id IN ARRAY p_winner_user_ids
    LOOP
      -- Obtener o inicializar billetera con bloqueo de fila
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_winner_id AND currency = v_table.currency
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.wallets (user_id, currency, balance, created_at, updated_at)
        VALUES (v_winner_id, v_table.currency, 0.00, NOW(), NOW())
        RETURNING * INTO v_winner_wallet;
      END IF;

      -- Actualizar saldo de la billetera
      UPDATE public.wallets
      SET balance = balance + v_individual_prize,
          updated_at = NOW()
      WHERE id = v_winner_wallet.id;

      -- Registrar transacción inmutable en el Ledger
      INSERT INTO public.ledger_entries (
        wallet_id,
        user_id,
        amount,
        currency,
        entry_type,
        reference_id,
        reference_type,
        balance_before,
        balance_after,
        metadata,
        created_at
      ) VALUES (
        v_winner_wallet.id,
        v_winner_id,
        v_individual_prize,
        v_table.currency,
        'PRIZE_PAYOUT'::ledger_entry_type_enum,
        v_settlement_id,
        'game_settlement',
        v_winner_wallet.balance,
        v_winner_wallet.balance + v_individual_prize,
        jsonb_build_object(
          'session_id', p_session_id,
          'table_id', v_table.id,
          'game_type', v_table.game_type,
          'idempotency_key', v_effective_idempotency,
          'description', 'Premio de victoria en ' || v_table.game_type
        ),
        NOW()
      ) RETURNING id INTO v_winner_ledger_id;

      -- Registrar detalle en settlement_recipients
      INSERT INTO public.settlement_recipients (
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
      WHERE user_id = v_player.user_id AND currency = v_table.currency
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET balance = balance + v_table.entry_fee,
            updated_at = NOW()
        WHERE id = v_winner_wallet.id;

        INSERT INTO public.ledger_entries (
          wallet_id,
          user_id,
          amount,
          currency,
          entry_type,
          reference_id,
          reference_type,
          balance_before,
          balance_after,
          metadata,
          created_at
        ) VALUES (
          v_winner_wallet.id,
          v_player.user_id,
          v_table.entry_fee,
          v_table.currency,
          'REFUND'::ledger_entry_type_enum,
          v_settlement_id,
          'game_settlement',
          v_winner_wallet.balance,
          v_winner_wallet.balance + v_table.entry_fee,
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

  -- 7. Actualizar Estados de Sesión y Mesa de forma inmediata
  UPDATE public.game_sessions
  SET status = 'SETTLED'::game_session_status_enum,
      winner_user_id = p_winner_user_ids[1],
      winner_team = p_winner_team,
      gross_pool = v_gross_pool,
      prize_pool = v_prize_pool,
      platform_fee = v_platform_fee,
      ended_at = NOW(),
      is_settled = TRUE,
      updated_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      current_players_count = 0,
      updated_at = NOW()
  WHERE id = v_table.id;

  -- 8. Liberar inmediatamente todos los asientos de los jugadores
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

-- 2. ACTUALIZACIÓN DE ABANDON_GAME_TABLE_SECURE PARA ASIGNAR CLOSED_AT Y LIBERAR ASIENTOS
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
      WHERE user_id = v_caller_id AND currency = v_table.currency
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET balance = balance + v_table.entry_fee,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.ledger_entries (
          wallet_id, user_id, amount, currency, entry_type,
          reference_id, reference_type, balance_before, balance_after,
          metadata, created_at
        ) VALUES (
          v_wallet.id, v_caller_id, v_table.entry_fee, v_table.currency,
          'REFUND'::ledger_entry_type_enum,
          p_table_id, 'game_tables',
          v_wallet.balance, v_wallet.balance + v_table.entry_fee,
          jsonb_build_object('reason', 'Reembolso por abandono voluntario de mesa previa al inicio'),
          NOW()
        );
        v_refund_amount := v_table.entry_fee;
      END IF;
    END IF;
  END IF;

  SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND status IN ('PLAYING', 'JOINED', 'READY');

  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      status = CASE
        WHEN v_active_players_count = 0 AND status::text IN ('OPEN', 'FULL', 'WAITING') THEN 'CLOSED'::table_status_enum
        WHEN status::text = 'FULL' AND v_active_players_count < max_players THEN 'OPEN'::table_status_enum
        ELSE status
      END,
      closed_at = CASE
        WHEN v_active_players_count = 0 AND status::text IN ('OPEN', 'FULL', 'WAITING') THEN NOW()
        ELSE closed_at
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  IF v_session_is_active THEN
    IF v_active_players_count = 1 THEN
      SELECT user_id INTO v_remaining_player
      FROM public.game_table_players
      WHERE table_id = p_table_id
        AND status IN ('PLAYING', 'JOINED', 'READY')
      LIMIT 1;

      IF v_remaining_player.user_id IS NOT NULL THEN
        v_settle_result := public.settle_game_session(
          v_session.id,
          ARRAY[v_remaining_player.user_id],
          1,
          'SETTLE_FORFEIT_' || v_effective_idempotency
        );

        RETURN jsonb_build_object(
          'success', true,
          'action', 'WINNER_DECLARED_BY_ABANDON',
          'abandoned_user_id', v_caller_id,
          'winner_user_id', v_remaining_player.user_id,
          'refund_amount', v_refund_amount,
          'settlement', v_settle_result
        );
      END IF;
    ELSIF v_active_players_count > 1 THEN
      IF v_session.current_turn_user_id = v_caller_id THEN
        SELECT user_id INTO v_next_player
        FROM public.game_table_players
        WHERE table_id = p_table_id
          AND status IN ('PLAYING', 'JOINED', 'READY')
          AND user_id <> v_caller_id
        ORDER BY seat_number ASC
        LIMIT 1;

        IF v_next_player.user_id IS NOT NULL THEN
          UPDATE public.game_sessions
          SET current_turn_user_id = v_next_player.user_id,
              turn_deadline_at = NOW() + INTERVAL '10 seconds',
              updated_at = NOW()
          WHERE id = v_session.id;
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'PLAYER_ABANDONED_CONTINUE',
        'abandoned_user_id', v_caller_id,
        'remaining_players', v_active_players_count,
        'table_id', p_table_id
      );
    ELSE
      UPDATE public.game_sessions
      SET status = 'CANCELLED'::session_status_enum,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = v_session.id;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = p_table_id;

      UPDATE public.game_table_players
      SET status = 'LEFT'::player_table_status_enum,
          left_at = COALESCE(left_at, NOW()),
          updated_at = NOW()
      WHERE table_id = p_table_id
        AND status != 'LEFT'::player_table_status_enum;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'ALL_ABANDONED_CLOSED',
        'table_id', p_table_id,
        'remaining_players', 0
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'refund_amount', v_refund_amount,
    'remaining_players', v_active_players_count
  );
END;
$$;

-- Permisos canónicos
GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role, anon;

-- 3. RPC CANÓNICA PARA OBTENER MESAS PÚBLICAS DISPONIBLES DE FORMA PURA
CREATE OR REPLACE FUNCTION public.get_public_available_tables(
  p_game_type TEXT DEFAULT NULL
)
RETURNS SETOF public.game_tables
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT gt.*
  FROM public.game_tables gt
  WHERE (gt.visibility = 'PUBLIC'::table_visibility_enum OR gt.visibility IS NULL)
    AND (gt.is_private IS FALSE OR gt.is_private IS NULL)
    AND gt.status = 'OPEN'::table_status_enum
    AND gt.closed_at IS NULL
    AND gt.current_players_count < gt.max_players
    AND (gt.expires_at IS NULL OR gt.expires_at > NOW())
    AND (
      p_game_type IS NULL
      OR p_game_type = 'all'
      OR gt.game_type::text ILIKE p_game_type
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.table_id = gt.id
        AND (
          gs.is_settled IS TRUE
          OR gs.ended_at IS NOT NULL
          OR gs.status::text IN ('SETTLED', 'FINISHED', 'CANCELLED', 'COMPLETED', 'ABANDONED', 'CLOSED', 'ACTIVE', 'IN_PROGRESS', 'IN_GAME')
        )
    )
  ORDER BY gt.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_available_tables(TEXT) TO authenticated, service_role, anon;

-- 4. CONCILIACIÓN INICIAL DE RESIDUOS Y MESAS FINALIZADAS EN EL ENTORNO
UPDATE public.game_tables gt
SET status = 'CLOSED'::table_status_enum,
    closed_at = COALESCE(gt.closed_at, NOW()),
    current_players_count = 0,
    updated_at = NOW()
WHERE gt.status::text NOT IN ('CLOSED', 'TERMINATED', 'CANCELLED', 'EXPIRED')
  AND (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.table_id = gt.id
        AND (
          gs.is_settled IS TRUE
          OR gs.ended_at IS NOT NULL
          OR gs.status::text IN ('SETTLED', 'FINISHED', 'CANCELLED', 'COMPLETED', 'ABANDONED', 'CLOSED')
        )
    )
    OR gt.created_at < NOW() - INTERVAL '3 hours'
  );

UPDATE public.game_table_players gtp
SET status = 'LEFT'::player_table_status_enum,
    left_at = COALESCE(gtp.left_at, NOW()),
    updated_at = NOW()
FROM public.game_tables gt
WHERE gtp.table_id = gt.id
  AND gt.status::text IN ('CLOSED', 'TERMINATED', 'CANCELLED', 'EXPIRED')
  AND gtp.status != 'LEFT'::player_table_status_enum;
