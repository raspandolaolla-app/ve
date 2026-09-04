-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 129: LIQUIDACIÓN SEGURA DE PARTIDAS (FIX SALDO RETENIDO)
-- ==============================================================================
-- 1. Rescate inmediato de saldos retenidos huérfanos (devolución a available_balance)
-- 2. Corrección atómica de settle_game_session:
--    - Libera el held_balance de TODOS los participantes de la mesa.
--    - Si hay ganador: acredita available_balance del ganador con su premio (90%).
--    - Si hay empate (DRAW): devuelve held_balance a available_balance de cada jugador.
-- 3. Corrección de settle_game_session_secure (wrapper)
-- 4. Corrección de abandon_game_table_secure (liberación de held_balance en cancel/reembolso)
-- 5. Recarga de esquema PostgREST
-- ==============================================================================

-- 1. RESCATE DE SALDOS RETENIDOS HUÉRFANOS HISTÓRICOS
-- Devuelve a saldo disponible cualquier monto que haya quedado atrapado en held_balance
UPDATE public.wallets 
SET available_balance = available_balance + held_balance, 
    held_balance = 0.00,
    updated_at = NOW()
WHERE held_balance > 0;


-- 2. FUNCIÓN CANÓNICA: settle_game_session
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
  v_session RECORD;
  v_table RECORD;
  v_entry_fee NUMERIC(14,2) := 0.00;
  v_gross_pool NUMERIC(14,2) := 0.00;
  v_platform_fee NUMERIC(14,2) := 0.00;
  v_prize_pool NUMERIC(14,2) := 0.00;
  v_individual_prize NUMERIC(14,2) := 0.00;
  v_effective_idempotency TEXT;
  v_settlement_id UUID;
  v_existing_settlement RECORD;
  v_winners_count INTEGER := 0;
  v_primary_winner_id UUID := NULL;
  v_winner_id UUID;
  v_player_id UUID;
  v_winner_wallet RECORD;
  v_player_wallet RECORD;
  v_winner_ledger_id UUID;
  v_refund_ledger_id UUID;
  v_total_players INTEGER := 0;
  v_table_players UUID[] := ARRAY[]::UUID[];
  v_settlement_type settlement_type_enum := 'NORMAL'::settlement_type_enum;
  v_is_draw BOOLEAN := false;
BEGIN
  -- 1. Idempotencia: Verificar si ya existe liquidación previa
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    SELECT * INTO v_existing_settlement
    FROM public.game_settlements
    WHERE idempotency_key = trim(p_idempotency_key)
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'session_id', v_existing_settlement.session_id,
        'table_id', v_existing_settlement.table_id,
        'gross_pool', v_existing_settlement.gross_pool,
        'platform_fee', v_existing_settlement.platform_fee,
        'prize_pool', v_existing_settlement.prize_pool,
        'winner_user_id', p_winner_user_ids[1],
        'settlement_id', v_existing_settlement.id
      );
    END IF;
  END IF;

  -- 2. Bloquear la sesión con FOR UPDATE
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: No se encontró la sesión especificada (%)', p_session_id;
  END IF;

  IF v_session.is_settled = true THEN
    SELECT * INTO v_existing_settlement
    FROM public.game_settlements
    WHERE session_id = p_session_id
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'session_id', p_session_id,
      'gross_pool', COALESCE(v_existing_settlement.gross_pool, v_session.gross_pool, 0.00),
      'platform_fee', COALESCE(v_existing_settlement.platform_fee, v_session.platform_fee, 0.00),
      'prize_pool', COALESCE(v_existing_settlement.prize_pool, v_session.prize_pool, 0.00),
      'winner_user_id', v_session.winner_user_id,
      'settlement_id', v_existing_settlement.id
    );
  END IF;

  -- 3. Bloquear la mesa asociada
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: No se encontró la mesa asociada a la sesión.';
  END IF;

  -- 4. Obtener todos los jugadores participantes en la mesa
  SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), ARRAY[]::UUID[]) INTO v_table_players
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  -- Fallback de jugadores si la lista está vacía
  IF array_length(v_table_players, 1) IS NULL OR array_length(v_table_players, 1) = 0 THEN
    v_table_players := p_winner_user_ids;
  END IF;

  v_total_players := GREATEST(COALESCE(array_length(v_table_players, 1), 0), 2);
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
    v_is_draw := false;
  ELSE
    v_settlement_type := 'DRAW'::settlement_type_enum;
    v_is_draw := true;
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

  -- 6. GESTIÓN FINANCIERA ATÓMICA DE FONDOS RETENIDOS (held_balance)
  -- Para TODOS los participantes de la mesa:
  IF v_entry_fee > 0.00 AND v_table_players IS NOT NULL AND array_length(v_table_players, 1) > 0 THEN
    FOREACH v_player_id IN ARRAY v_table_players LOOP
      -- Bloquear la billetera de cada participante
      SELECT * INTO v_player_wallet
      FROM public.wallets
      WHERE user_id = v_player_id AND currency = 'VES'
      FOR UPDATE;

      IF FOUND THEN
        IF v_is_draw THEN
          -- EMPATE / REEMBOLSO: Regresar el saldo retenido a disponible
          UPDATE public.wallets
          SET available_balance = available_balance + v_entry_fee,
              held_balance = GREATEST(0.00, held_balance - v_entry_fee),
              updated_at = NOW()
          WHERE id = v_player_wallet.id;

          v_refund_ledger_id := gen_random_uuid();
          INSERT INTO public.ledger_entries (
            id,
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
            v_refund_ledger_id,
            v_player_wallet.id,
            v_player_id,
            v_entry_fee,
            'VES',
            'GAME_REFUND'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            v_settlement_id,
            'game_settlements',
            'game_settlement',
            COALESCE(v_player_wallet.available_balance, 0.00) + v_entry_fee,
            COALESCE(v_player_wallet.available_balance, 0.00) + v_entry_fee,
            GREATEST(0.00, COALESCE(v_player_wallet.held_balance, 0.00) - v_entry_fee),
            v_effective_idempotency || '_refund_' || v_player_id::text,
            'Devolución de entrada por empate en ' || COALESCE(v_table.game_type, 'juego'),
            NOW()
          );
        ELSE
          -- PARTIDA NORMAL CON GANADOR: Descontar definitivamente el monto retenido
          UPDATE public.wallets
          SET held_balance = GREATEST(0.00, held_balance - v_entry_fee),
              updated_at = NOW()
          WHERE id = v_player_wallet.id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 7. ACREDITACIÓN DE PREMIO A LOS GANADORES EN available_balance
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

      -- Acreditar premio neto (90%) en available_balance
      UPDATE public.wallets
      SET available_balance = available_balance + v_individual_prize,
          updated_at = NOW()
      WHERE id = v_winner_wallet.id;

      v_winner_ledger_id := gen_random_uuid();

      -- Registro inmutable en ledger_entries
      INSERT INTO public.ledger_entries (
        id,
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
        v_winner_ledger_id,
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
        GREATEST(0.00, COALESCE(v_winner_wallet.held_balance, 0.00)),
        v_effective_idempotency || '_payout_' || v_winner_id::text,
        'Premio de victoria en ' || COALESCE(v_table.game_type, 'juego'),
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

  -- 8. Actualizar sesión a SETTLED
  UPDATE public.game_sessions
  SET status = 'SETTLED'::session_status_enum,
      winner_user_id = v_primary_winner_id,
      winner_team = p_winner_team,
      gross_pool = v_gross_pool,
      platform_fee = v_platform_fee,
      prize_pool = v_prize_pool,
      is_settled = true,
      settled_at = NOW(),
      ended_at = NOW()
  WHERE id = p_session_id;

  -- 9. Cerrar mesa y desocupar jugadores
  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      current_players_count = 0,
      updated_at = NOW()
  WHERE id = v_table.id;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = v_table.id AND status != 'LEFT'::player_table_status_enum;

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

GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role;


-- 3. FUNCIÓN ENVOLTORIO: settle_game_session_secure
CREATE OR REPLACE FUNCTION public.settle_game_session_secure(
  p_session_id UUID,
  p_winner_user_id UUID DEFAULT NULL,
  p_winner_team INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
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
    p_winner_team,
    p_idempotency_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_game_session_secure(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;


-- 4. FUNCIÓN: abandon_game_table_secure (CORRECCIÓN DE REEMBOLSO PRE-PARTIDA)
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
  v_player RECORD;
  v_session RECORD;
  v_wallet RECORD;
  v_active_players_count INTEGER;
  v_remaining_player RECORD;
  v_effective_idempotency TEXT;
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
  -- IMPORTANTE: Liberar de held_balance y restituir a available_balance
  IF NOT v_session_is_active AND v_table.entry_fee > 0.00 THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_caller_id AND currency = 'VES'
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.wallets
      SET available_balance = available_balance + v_table.entry_fee,
          held_balance = GREATEST(0.00, held_balance - v_table.entry_fee),
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
        'TABLE_ABANDON_REFUND'::ledger_entry_type_enum,
        'CREDIT'::ledger_direction_enum,
        p_table_id,
        'game_tables',
        'game_table',
        COALESCE(v_wallet.available_balance, 0.00) + v_table.entry_fee,
        COALESCE(v_wallet.available_balance, 0.00) + v_table.entry_fee,
        GREATEST(0.00, COALESCE(v_wallet.held_balance, 0.00) - v_table.entry_fee),
        v_effective_idempotency || '_refund',
        'Reembolso por abandonar mesa antes del inicio',
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

GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
