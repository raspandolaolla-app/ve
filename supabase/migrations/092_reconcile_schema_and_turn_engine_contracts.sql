-- ==============================================================================
-- RASPANDO LA OLLA / PULSOPLAY — MIGRACIÓN 092
-- RECONCILIACIÓN DEFINITIVA DE ESQUEMA POSTGRESQL Y CONTRATOS DE LEDGER / TURNOS
-- ==============================================================================
-- Objetivos:
-- 1. Eliminar referencias a la columna inexistente `balance_before` en funciones RPC
--    contables (settle_game_session, settle_game_session_secure, abandon_game_table_secure,
--    abandon_table_player_transaction) adaptándolas al esquema canónico real de
--    public.ledger_entries (balance_after, balance_after_available, balance_after_held).
-- 2. Preservar todas las firmas RPC existentes sin eliminarlas ni alterar sus tipos.
-- 3. Blindar las operaciones de liquidación y abandono para garantizar atomicidad e idempotencia.
-- ==============================================================================

-- 1. RECONCILIAR settle_game_session (Variante de 4 parámetros)
CREATE OR REPLACE FUNCTION public.settle_game_session(
  p_session_id UUID,
  p_winner_user_ids UUID[],
  p_winner_team_index SMALLINT DEFAULT NULL,
  p_idempotency_key VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_table RECORD;
  v_effective_idempotency VARCHAR(100);
  v_existing_settlement RECORD;
  v_settlement_id UUID;
  v_entry_fee NUMERIC(14,2);
  v_total_players INTEGER;
  v_gross_pool NUMERIC(14,2);
  v_platform_fee NUMERIC(14,2);
  v_prize_pool NUMERIC(14,2);
  v_winners_count INTEGER;
  v_individual_prize NUMERIC(14,2);
  v_winner_id UUID;
  v_winner_wallet RECORD;
  v_caller_id UUID;
  v_has_role BOOLEAN := false;
  v_primary_winner_id UUID := NULL;
  v_settlement_type settlement_type_enum := 'STANDARD'::settlement_type_enum;
BEGIN
  -- 1. Autorización: Service role o usuario autenticado
  v_caller_id := auth.uid();
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    v_has_role := true;
  ELSIF v_caller_id IS NOT NULL THEN
    v_has_role := true;
  END IF;

  IF NOT v_has_role THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Se requiere autenticación válida para liquidar la partida.';
  END IF;

  -- 2. Obtener sesión con bloqueo pesimista
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: No se encontró la sesión de juego especificada.';
  END IF;

  -- Idempotencia: Si ya está liquidada, retornar resultado existente
  IF v_session.status = 'SETTLED'::session_status_enum OR v_session.is_settled THEN
    SELECT * INTO v_existing_settlement
    FROM public.game_settlements
    WHERE session_id = p_session_id
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'session_id', p_session_id,
      'gross_pool', COALESCE(v_existing_settlement.gross_pool, v_session.gross_pool, 0.00),
      'platform_fee', COALESCE(v_existing_settlement.platform_fee, v_session.platform_fee, 0.00),
      'prize_pool', COALESCE(v_existing_settlement.prize_pool, v_session.prize_pool, 0.00),
      'winner_user_id', v_session.winner_user_id
    );
  END IF;

  -- 3. Obtener mesa asociada con bloqueo
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: No se encontró la mesa asociada a la sesión.';
  END IF;

  -- 4. Contar jugadores activos y participantes
  SELECT COUNT(DISTINCT user_id) INTO v_total_players
  FROM public.game_table_players
  WHERE table_id = v_table.id
    AND status != 'LEFT'::player_table_status_enum;

  IF v_total_players = 0 THEN
    SELECT COUNT(DISTINCT user_id) INTO v_total_players
    FROM public.game_table_players
    WHERE table_id = v_table.id;
  END IF;

  v_total_players := GREATEST(v_total_players, 2);
  v_entry_fee := COALESCE(v_table.entry_fee, 0.00);
  v_gross_pool := v_entry_fee * v_total_players;
  v_platform_fee := ROUND(v_gross_pool * 0.10, 2);
  v_prize_pool := v_gross_pool - v_platform_fee;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'stl_' || p_session_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  v_winners_count := COALESCE(array_length(p_winner_user_ids, 1), 0);

  IF v_winners_count > 0 THEN
    v_primary_winner_id := p_winner_user_ids[1];
  ELSE
    v_settlement_type := 'DRAW'::settlement_type_enum;
  END IF;

  -- 5. Crear registro contable en game_settlements
  INSERT INTO public.game_settlements (
    session_id,
    table_id,
    gross_pool,
    platform_fee,
    prize_pool,
    total_distributed,
    settlement_type,
    idempotency_key,
    created_at
  ) VALUES (
    p_session_id,
    v_table.id,
    v_gross_pool,
    v_platform_fee,
    v_prize_pool,
    CASE WHEN v_winners_count > 0 THEN v_prize_pool ELSE 0.00 END,
    v_settlement_type,
    v_effective_idempotency,
    NOW()
  )
  RETURNING id INTO v_settlement_id;

  -- 6. Acreditar a ganadores si aplica (Esquema real de ledger_entries sin balance_before)
  IF v_winners_count > 0 AND v_prize_pool > 0.00 THEN
    v_individual_prize := ROUND(v_prize_pool / v_winners_count, 2);

    FOREACH v_winner_id IN ARRAY p_winner_user_ids LOOP
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_winner_id AND currency = 'VES'
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.wallets (user_id, currency, available_balance, held_balance)
        VALUES (v_winner_id, 'VES', 0.00, 0.00)
        RETURNING * INTO v_winner_wallet;
      END IF;

      -- Actualizar saldo de wallet
      UPDATE public.wallets
      SET available_balance = available_balance + v_individual_prize,
          updated_at = NOW()
      WHERE id = v_winner_wallet.id;

      -- Insertar registro contable inmutable respetando el esquema real
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
        balance_after,
        balance_after_available,
        balance_after_held,
        idempotency_key,
        description,
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
        COALESCE(v_winner_wallet.available_balance, 0.00) + v_individual_prize,
        COALESCE(v_winner_wallet.available_balance, 0.00) + v_individual_prize,
        COALESCE(v_winner_wallet.held_balance, 0.00),
        v_effective_idempotency || '_payout_' || v_winner_id::text,
        'Premio de victoria en ' || v_table.game_type,
        NOW()
      );

      -- Registrar destinatario de liquidación
      INSERT INTO public.game_settlement_recipients (
        settlement_id,
        user_id,
        amount,
        role
      ) VALUES (
        v_settlement_id,
        v_winner_id,
        v_individual_prize,
        'WINNER'::recipient_role_enum
      );
    END LOOP;
  END IF;

  -- 7. Actualizar estado de la sesión de juego
  UPDATE public.game_sessions
  SET status = 'SETTLED'::session_status_enum,
      winner_user_id = v_primary_winner_id,
      winner_team = p_winner_team_index,
      gross_pool = v_gross_pool,
      platform_fee = v_platform_fee,
      prize_pool = v_prize_pool,
      is_settled = true,
      settled_at = NOW(),
      ended_at = NOW()
  WHERE id = p_session_id;

  -- 8. Cerrar la mesa
  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      current_players_count = 0,
      updated_at = NOW()
  WHERE id = v_table.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'table_id', v_table.id,
    'gross_pool', v_gross_pool,
    'platform_fee', v_platform_fee,
    'prize_pool', v_prize_pool,
    'winner_user_id', v_primary_winner_id,
    'settlement_id', v_settlement_id
  );
END;
$$;


-- 2. RECONCILIAR settle_game_session_secure (Variante con p_session_id y p_winner_user_id)
CREATE OR REPLACE FUNCTION public.settle_game_session_secure(
  p_session_id UUID,
  p_winner_user_id UUID DEFAULT NULL,
  p_winner_team_index SMALLINT DEFAULT NULL,
  p_idempotency_key VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_winner_array UUID[];
BEGIN
  IF p_winner_user_id IS NOT NULL THEN
    v_winner_array := ARRAY[p_winner_user_id];
  ELSE
    v_winner_array := ARRAY[]::UUID[];
  END IF;

  RETURN public.settle_game_session(
    p_session_id,
    v_winner_array,
    p_winner_team_index,
    p_idempotency_key
  );
END;
$$;


-- 3. RECONCILIAR abandon_game_table_secure Y abandon_table_player_transaction
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_table RECORD;
  v_player RECORD;
  v_session RECORD;
  v_wallet RECORD;
  v_active_players_count INTEGER;
  v_remaining_player RECORD;
  v_effective_idempotency VARCHAR(100);
  v_refund_amount NUMERIC(14,2) := 0.00;
  v_session_is_active BOOLEAN := false;
  v_settle_result JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para abandonar la mesa.';
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abn_' || p_table_id::text || '_' || v_caller_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  -- 1. Obtener mesa con bloqueo pesimista
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: No se encontró la mesa especificada.';
  END IF;

  -- 2. Obtener sesión activa si existe
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE id = p_session_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE table_id = p_table_id
      AND status IN ('ACTIVE'::session_status_enum, 'READY'::session_status_enum, 'STARTING'::session_status_enum, 'PAUSED'::session_status_enum)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_session.id IS NOT NULL AND v_session.status = 'ACTIVE'::session_status_enum THEN
    v_session_is_active := true;
  END IF;

  -- 3. Obtener registro del jugador
  SELECT * INTO v_player
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND user_id = v_caller_id
    AND status IN ('JOINED'::player_table_status_enum, 'READY'::player_table_status_enum, 'PLAYING'::player_table_status_enum)
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
    FROM public.game_table_players
    WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum;

    RETURN jsonb_build_object(
      'success', true,
      'already_left', true,
      'table_id', p_table_id,
      'remaining_players', v_active_players_count
    );
  END IF;

  -- Marcar jugador como LEFT
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE id = v_player.id;

  -- 4. Reembolso pre-partida si la partida no ha comenzado
  IF NOT v_session_is_active AND v_table.entry_fee > 0.00 THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_caller_id AND currency = 'VES'
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.wallets
      SET available_balance = available_balance + v_table.entry_fee,
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
        balance_after,
        balance_after_available,
        balance_after_held,
        idempotency_key,
        description,
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
        COALESCE(v_wallet.available_balance, 0.00) + v_table.entry_fee,
        COALESCE(v_wallet.available_balance, 0.00) + v_table.entry_fee,
        COALESCE(v_wallet.held_balance, 0.00),
        v_effective_idempotency || '_refund',
        'Reembolso por abandono voluntario de mesa previa al inicio',
        NOW()
      );
      v_refund_amount := v_table.entry_fee;
    END IF;
  END IF;

  -- 5. Contar jugadores restantes
  SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum;

  -- 6. Si la partida estaba activa y queda 1 solo jugador, forzar liquidación por abandono (Forfeit)
  IF v_session_is_active THEN
    IF v_active_players_count = 1 THEN
      SELECT user_id INTO v_remaining_player
      FROM public.game_table_players
      WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum
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
    ELSIF v_active_players_count = 0 THEN
      UPDATE public.game_sessions
      SET status = 'CANCELLED'::session_status_enum,
          ended_at = NOW()
      WHERE id = v_session.id;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = p_table_id;
    END IF;
  ELSE
    -- Mesa en lobby: actualizar conteo o cerrar si queda vacía
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
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'refund_amount', v_refund_amount,
    'remaining_players', v_active_players_count
  );
END;
$$;


-- 4. ALIAS DE COMPATIBILIDAD abandon_table_player_transaction
CREATE OR REPLACE FUNCTION public.abandon_table_player_transaction(
  p_table_id UUID,
  p_user_id UUID,
  p_reason VARCHAR(100) DEFAULT 'USER_ABANDON'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.abandon_game_table_secure(
    p_table_id,
    NULL,
    'abn_tx_' || p_table_id::text || '_' || p_user_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );
END;
$$;

-- 5. RECARGA DE CACHÉ DE ESQUEMA EN POSTGREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
