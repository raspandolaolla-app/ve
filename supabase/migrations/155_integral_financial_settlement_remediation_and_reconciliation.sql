-- ==============================================================================
-- MIGRACIÓN 155: REMEDIACIÓN FINANCIERA INTEGRAL, AUTORITATIVA Y RECONCILIACIÓN
-- Proyecto: RASPANDO LA OLLA 🇻🇪 / PulsoPLAY
-- Propósito:
--   1. Eliminar de raíz el bloqueo SESSION_ALREADY_FINISHED permitiendo la liquidación
--      de sesiones concluidas en el juego que no han sido asentadas en game_settlements.
--   2. Separar formalmente el estado de juego (FINISHED) del estado financiero (SETTLED).
--   3. Validar de forma server-authoritative que el ganador pertenece a la mesa.
--   4. Consultar dinámicamente public.financial_rules (90/10 canónico oficial).
--   5. Garantizar que universal_settle_game_session y refund_game_session capturen o
--      reembolsen held_balance en wallets y asienten exactamente en ledger_entries.
--   6. Corregir timeout (expire_game_turn_secure) para que no silencie errores y use
--      la RPC universal.
--   7. Corregir cleanup_stale_user_game_participation para que restituya entradas
--      retenidas de mesas cerradas/huérfanas sin liquidar.
--   8. Añadir refund_bingo_table_secure para salas de bingo expiradas o canceladas.
--   9. Proporcionar funciones auditables e idempotentes de reconciliación forense
--      para recuperar y liquidar fondos históricos atrapados.
-- ==============================================================================

-- ==============================================================================
-- 0. AMPLIACIÓN DE LONGITUD DE IDEMPOTENCY_KEY EN TABLAS FINANCIERAS
-- ==============================================================================

DO $$
BEGIN
  ALTER TABLE public.ledger_entries ALTER COLUMN idempotency_key TYPE VARCHAR(255);
  ALTER TABLE public.game_settlements ALTER COLUMN idempotency_key TYPE VARCHAR(255);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ==============================================================================
-- 1. UNIVERSAL SETTLE GAME SESSION (CANÓNICA, AUTORITATIVA Y SEGURA)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.universal_settle_game_session(
  p_session_id UUID,
  p_winner_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_winner_team INT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_table RECORD;
  v_rule RECORD;
  v_caller_id UUID;
  v_caller_role TEXT;
  v_existing_settlement RECORD;
  v_effective_idempotency TEXT;
  v_settlement_id UUID;
  v_entry_fee NUMERIC(14,2) := 0.00;
  v_table_players UUID[] := ARRAY[]::UUID[];
  v_total_players INT := 0;
  v_gross_pool NUMERIC(14,2) := 0.00;
  v_winner_pct NUMERIC(5,2) := 90.00;
  v_platform_pct NUMERIC(5,2) := 10.00;
  v_platform_fee NUMERIC(14,2) := 0.00;
  v_prize_pool NUMERIC(14,2) := 0.00;
  v_individual_prize NUMERIC(14,2) := 0.00;
  v_winners_count INT := 0;
  v_sanitized_winners UUID[] := ARRAY[]::UUID[];
  v_winner_id UUID;
  v_player_id UUID;
  v_primary_winner_id UUID := NULL;
  v_player_wallet RECORD;
  v_winner_wallet RECORD;
  v_settlement_type settlement_type_enum := 'STANDARD_PAYOUT'::settlement_type_enum;
  v_is_draw BOOLEAN := false;
  v_ledger_entry_id UUID;
  v_server_winner_id UUID := NULL;
BEGIN
  -- 1. Validar identificador de sesión
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_ID_REQUIRED');
  END IF;

  -- 2. Idempotencia base
  v_effective_idempotency := COALESCE(
    NULLIF(TRIM(p_idempotency_key), ''),
    'settle_session_' || p_session_id::text
  );

  -- 3. Bloqueo Pesimista de la Sesión
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- 4. Verificación de liquidación previa (Idempotencia absoluta)
  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'session_id', p_session_id,
      'table_id', v_existing_settlement.table_id,
      'gross_pool', v_existing_settlement.gross_pool,
      'platform_fee', v_existing_settlement.platform_fee,
      'prize_pool', v_existing_settlement.prize_pool,
      'settlement_id', v_existing_settlement.id
    );
  END IF;

  -- NOTA FORENSE CRÍTICA:
  -- Ya NO se rechaza v_session.status = 'FINISHED'. Si la partida concluyó en el
  -- tablero pero no tiene fila en game_settlements, SE PROCEDE CON LA LIQUIDACIÓN.

  -- 5. Bloqueo de Mesa Asociada
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  v_entry_fee := COALESCE(v_table.entry_fee, 0.00);

  -- 6. Obtener Participantes Reales de la Mesa
  SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), ARRAY[]::UUID[]) INTO v_table_players
  FROM (
    SELECT user_id FROM public.game_table_players WHERE table_id = v_table.id
    UNION
    SELECT user_id FROM public.ledger_entries
    WHERE reference_id = v_table.id AND entry_type = 'TABLE_ENTRY_HOLD'::ledger_entry_type_enum
    UNION
    SELECT v_table.host_user_id AS user_id WHERE v_table.host_user_id IS NOT NULL
  ) p_sub
  WHERE user_id IS NOT NULL;

  -- 7. Validación de Autorización del Invocador
  v_caller_id := auth.uid();
  v_caller_role := COALESCE(auth.role(), '');

  IF v_caller_id IS NOT NULL AND v_caller_role <> 'service_role' THEN
    IF NOT (v_caller_id = ANY(v_table_players)) AND v_caller_id <> v_table.host_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_SETTLEMENT_CALLER');
    END IF;
  END IF;

  -- 8. Validar y Sanitizar Ganador(es) Server-Authoritative
  -- Comprobar si la sesión ya tiene un ganador oficial en BD
  v_server_winner_id := v_session.winner_user_id;
  IF v_server_winner_id IS NULL AND v_session.current_state ? 'winnerUserId' THEN
    BEGIN
      v_server_winner_id := (v_session.current_state->>'winnerUserId')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_server_winner_id := NULL;
    END;
  END IF;

  -- Sanitizar p_winner_user_ids
  IF p_winner_user_ids IS NOT NULL AND array_length(p_winner_user_ids, 1) > 0 THEN
    SELECT COALESCE(ARRAY_AGG(DISTINCT w_id), ARRAY[]::UUID[]) INTO v_sanitized_winners
    FROM UNNEST(p_winner_user_ids) AS w_id
    WHERE w_id IS NOT NULL;
  ELSIF v_server_winner_id IS NOT NULL THEN
    v_sanitized_winners := ARRAY[v_server_winner_id];
  END IF;

  -- Validar que todo ganador sanitizado sea un participante de la mesa
  IF array_length(v_sanitized_winners, 1) > 0 THEN
    FOREACH v_winner_id IN ARRAY v_sanitized_winners LOOP
      IF NOT (v_winner_id = ANY(v_table_players)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_WINNER_NOT_IN_TABLE');
      END IF;
    END LOOP;
  END IF;

  -- 9. Detección de Empate vs Victoria
  IF array_length(v_sanitized_winners, 1) IS NULL 
     OR array_length(v_sanitized_winners, 1) = 0 
     OR (v_session.current_state->>'isDraw')::boolean = true
     OR (v_session.current_state->>'winner')::text = 'DRAW' THEN
    v_is_draw := true;
    v_settlement_type := 'DRAW_REFUND'::settlement_type_enum;
  ELSE
    v_is_draw := false;
    v_settlement_type := CASE 
      WHEN array_length(v_sanitized_winners, 1) > 1 THEN 'SPLIT_PAYOUT'::settlement_type_enum
      ELSE 'STANDARD_PAYOUT'::settlement_type_enum
    END;
    v_winners_count := array_length(v_sanitized_winners, 1);
    v_primary_winner_id := v_sanitized_winners[1];
  END IF;

  -- 10. Consulta de Reglas Oficiales de Comisión (public.financial_rules)
  SELECT * INTO v_rule
  FROM public.financial_rules
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND v_rule.winner_percentage IS NOT NULL THEN
    v_winner_pct := v_rule.winner_percentage;
    v_platform_pct := COALESCE(v_rule.platform_fee_percentage, 100.00 - v_winner_pct);
  END IF;

  -- 11. Cálculo Matemático del Pozo
  v_total_players := GREATEST(COALESCE(array_length(v_table_players, 1), 0), 2);
  v_gross_pool := v_entry_fee * v_total_players;

  IF v_is_draw THEN
    v_platform_fee := 0.00;
    v_prize_pool := 0.00;
    v_individual_prize := 0.00;
  ELSE
    v_platform_fee := ROUND(v_gross_pool * (v_platform_pct / 100.00), 2);
    v_prize_pool := v_gross_pool - v_platform_fee;
    IF v_winners_count > 0 THEN
      v_individual_prize := ROUND(v_prize_pool / v_winners_count, 2);
    END IF;
  END IF;

  v_settlement_id := gen_random_uuid();

  -- 12. Movimientos Financieros Atómicos por Jugador
  -- Descontar de held_balance para TODOS los participantes
  FOREACH v_player_id IN ARRAY v_table_players LOOP
    IF v_player_id IS NOT NULL THEN
      SELECT * INTO v_player_wallet
      FROM public.wallets
      WHERE user_id = v_player_id
      FOR UPDATE;

      IF FOUND THEN
        IF v_is_draw THEN
          -- En caso de Empate: Reintegro de la entrada retenida a available_balance
          UPDATE public.wallets
          SET held_balance = GREATEST(0.00, held_balance - v_entry_fee),
              available_balance = available_balance + v_entry_fee,
              updated_at = NOW()
          WHERE id = v_player_wallet.id;

          INSERT INTO public.ledger_entries (
            id, wallet_id, user_id, amount, currency, entry_type, direction,
            reference_id, reference_table, reference_type,
            balance_after, balance_after_available, balance_after_held,
            idempotency_key, description, created_at
          ) VALUES (
            gen_random_uuid(),
            v_player_wallet.id,
            v_player_id,
            v_entry_fee,
            'VES',
            'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            p_session_id,
            'game_sessions',
            'game_session',
            v_player_wallet.available_balance + v_entry_fee + GREATEST(0.00, v_player_wallet.held_balance - v_entry_fee),
            v_player_wallet.available_balance + v_entry_fee,
            GREATEST(0.00, v_player_wallet.held_balance - v_entry_fee),
            v_effective_idempotency || '_refund_' || v_player_id::text,
            'Reembolso íntegro de entrada por empate en partida',
            NOW()
          );
        ELSE
          -- En caso de Victoria: Captura definitiva de la entrada retenida
          UPDATE public.wallets
          SET held_balance = GREATEST(0.00, held_balance - v_entry_fee),
              updated_at = NOW()
          WHERE id = v_player_wallet.id;

          INSERT INTO public.ledger_entries (
            id, wallet_id, user_id, amount, currency, entry_type, direction,
            reference_id, reference_table, reference_type,
            balance_after, balance_after_available, balance_after_held,
            idempotency_key, description, created_at
          ) VALUES (
            gen_random_uuid(),
            v_player_wallet.id,
            v_player_id,
            v_entry_fee,
            'VES',
            'TABLE_ENTRY_CAPTURE'::ledger_entry_type_enum,
            'DEBIT'::ledger_direction_enum,
            v_settlement_id,
            'game_settlements',
            'game_settlement',
            v_player_wallet.available_balance + GREATEST(0.00, v_player_wallet.held_balance - v_entry_fee),
            v_player_wallet.available_balance,
            GREATEST(0.00, v_player_wallet.held_balance - v_entry_fee),
            v_effective_idempotency || '_capture_' || v_player_id::text,
            'Captura de entrada para liquidación oficial de partida',
            NOW()
          );
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 13. Inserción de Registro en game_settlements (requerido previamente para las claves foráneas)
  INSERT INTO public.game_settlements (
    id, session_id, table_id, gross_pool, platform_fee, prize_pool, total_distributed,
    settlement_type, idempotency_key, settled_at
  ) VALUES (
    v_settlement_id,
    p_session_id,
    v_table.id,
    v_gross_pool,
    v_platform_fee,
    v_prize_pool,
    CASE WHEN v_is_draw THEN v_gross_pool ELSE v_prize_pool END,
    v_settlement_type,
    v_effective_idempotency,
    NOW()
  );

  -- 14. Acreditación de Premio al Ganador(es) y Registro de Receptores
  IF NOT v_is_draw AND v_winners_count > 0 AND v_prize_pool > 0.00 THEN
    FOREACH v_winner_id IN ARRAY v_sanitized_winners LOOP
      IF v_winner_id IS NOT NULL THEN
        SELECT * INTO v_winner_wallet
        FROM public.wallets
        WHERE user_id = v_winner_id
        FOR UPDATE;

        IF FOUND THEN
          UPDATE public.wallets
          SET available_balance = available_balance + v_individual_prize,
              updated_at = NOW()
          WHERE id = v_winner_wallet.id;

          v_ledger_entry_id := gen_random_uuid();

          INSERT INTO public.ledger_entries (
            id, wallet_id, user_id, amount, currency, entry_type, direction,
            reference_id, reference_table, reference_type,
            balance_after, balance_after_available, balance_after_held,
            idempotency_key, description, created_at
          ) VALUES (
            v_ledger_entry_id,
            v_winner_wallet.id,
            v_winner_id,
            v_individual_prize,
            'VES',
            'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            v_settlement_id,
            'game_settlements',
            'game_settlement',
            v_winner_wallet.available_balance + v_individual_prize + v_winner_wallet.held_balance,
            v_winner_wallet.available_balance + v_individual_prize,
            v_winner_wallet.held_balance,
            v_effective_idempotency || '_win_' || v_winner_id::text,
            'Premio por victoria en partida (' || v_winner_pct::text || '% del pozo)',
            NOW()
          );

          INSERT INTO public.game_settlement_recipients (
            id, settlement_id, user_id, team_number, payout_amount,
            ledger_entry_id, payout_status, created_at
          ) VALUES (
            gen_random_uuid(),
            v_settlement_id,
            v_winner_id,
            p_winner_team,
            v_individual_prize,
            v_ledger_entry_id,
            'COMPLETED',
            NOW()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 15. Actualización Definitiva de Estado: SETTLED
  UPDATE public.game_sessions
  SET status = 'SETTLED'::session_status_enum,
      winner_user_id = v_primary_winner_id,
      winner_team = p_winner_team,
      ended_at = COALESCE(ended_at, NOW()),
      updated_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      current_players_count = 0,
      closed_at = COALESCE(closed_at, NOW()),
      updated_at = NOW()
  WHERE id = v_table.id;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      updated_at = NOW()
  WHERE table_id = v_table.id;

  -- 16. Retorno de Éxito
  RETURN jsonb_build_object(
    'success', true,
    'is_idempotent_replay', false,
    'session_id', p_session_id,
    'table_id', v_table.id,
    'gross_pool', v_gross_pool,
    'platform_fee', v_platform_fee,
    'prize_pool', v_prize_pool,
    'settlement_id', v_settlement_id,
    'settlement_type', v_settlement_type::text,
    'winners_count', v_winners_count,
    'individual_prize', v_individual_prize,
    'winner_percentage', v_winner_pct,
    'platform_percentage', v_platform_pct
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.universal_settle_game_session(UUID, UUID[], INT, TEXT) TO authenticated, service_role, anon;

-- ==============================================================================
-- 2. REFUND GAME SESSION (SEGURO, IDEMPOTENTE Y SIN RECHAZO POR FINISHED)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.refund_game_session(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'Cancelación oficial de partida',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_table RECORD;
  v_existing_settlement RECORD;
  v_effective_idempotency TEXT;
  v_settlement_id UUID;
  v_participants UUID[] := ARRAY[]::UUID[];
  v_user_id UUID;
  v_player_wallet RECORD;
  v_refund_amount NUMERIC(14,2) := 0.00;
  v_refunded_count INT := 0;
  v_caller_id UUID;
  v_caller_role TEXT;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_ID_REQUIRED');
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(TRIM(p_idempotency_key), ''),
    'refund_session_' || p_session_id::text
  );

  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- Idempotencia: Si ya fue reembolsado o liquidado
  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'settlement_id', v_existing_settlement.id
    );
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  v_refund_amount := COALESCE(v_table.entry_fee, 0.00);

  -- Obtener participantes
  SELECT COALESCE(ARRAY_AGG(DISTINCT u_id), ARRAY[]::UUID[]) INTO v_participants
  FROM (
    SELECT user_id AS u_id FROM public.game_table_players WHERE table_id = v_table.id
    UNION
    SELECT user_id AS u_id FROM public.ledger_entries
    WHERE reference_id = v_table.id AND entry_type = 'TABLE_ENTRY_HOLD'::ledger_entry_type_enum
    UNION
    SELECT v_table.host_user_id AS u_id WHERE v_table.host_user_id IS NOT NULL
  ) p_sub
  WHERE u_id IS NOT NULL;

  -- Validar que el invocador sea participante o servicio
  v_caller_id := auth.uid();
  v_caller_role := COALESCE(auth.role(), '');
  IF v_caller_id IS NOT NULL AND v_caller_role <> 'service_role' THEN
    IF NOT (v_caller_id = ANY(v_participants)) AND v_caller_id <> v_table.host_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_CALLER');
    END IF;
  END IF;

  v_settlement_id := gen_random_uuid();

  -- Reembolsar a cada participante
  FOREACH v_user_id IN ARRAY v_participants LOOP
    IF v_user_id IS NOT NULL THEN
      SELECT * INTO v_player_wallet
      FROM public.wallets
      WHERE user_id = v_user_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET held_balance = GREATEST(0.00, held_balance - v_refund_amount),
            available_balance = available_balance + v_refund_amount,
            updated_at = NOW()
        WHERE id = v_player_wallet.id;

        INSERT INTO public.ledger_entries (
          id, wallet_id, user_id, amount, currency, entry_type, direction,
          reference_id, reference_table, reference_type,
          balance_after, balance_after_available, balance_after_held,
          idempotency_key, description, created_at
        ) VALUES (
          gen_random_uuid(),
          v_player_wallet.id,
          v_user_id,
          v_refund_amount,
          'VES',
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          p_session_id,
          'game_sessions',
          'game_session',
          v_player_wallet.available_balance + v_refund_amount + GREATEST(0.00, v_player_wallet.held_balance - v_refund_amount),
          v_player_wallet.available_balance + v_refund_amount,
          GREATEST(0.00, v_player_wallet.held_balance - v_refund_amount),
          v_effective_idempotency || '_refund_' || v_user_id::text,
          COALESCE(p_reason, 'Reembolso oficial de partida'),
          NOW()
        );

        v_refunded_count := v_refunded_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- Registrar en game_settlements
  INSERT INTO public.game_settlements (
    id, session_id, table_id, gross_pool, platform_fee, prize_pool, total_distributed,
    settlement_type, idempotency_key, settled_at
  ) VALUES (
    v_settlement_id,
    p_session_id,
    v_table.id,
    v_refund_amount * GREATEST(v_refunded_count, 1),
    0.00,
    0.00,
    v_refund_amount * GREATEST(v_refunded_count, 1),
    'ADMIN_CANCEL_REFUND'::settlement_type_enum,
    v_effective_idempotency,
    NOW()
  );

  UPDATE public.game_sessions
  SET status = 'CANCELLED'::session_status_enum,
      ended_at = COALESCE(ended_at, NOW()),
      updated_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      current_players_count = 0,
      closed_at = COALESCE(closed_at, NOW()),
      updated_at = NOW()
  WHERE id = v_table.id;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      updated_at = NOW()
  WHERE table_id = v_table.id;

  RETURN jsonb_build_object(
    'success', true,
    'is_idempotent_replay', false,
    'session_id', p_session_id,
    'settlement_id', v_settlement_id,
    'refunded_count', v_refunded_count,
    'refund_amount_per_player', v_refund_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_game_session(UUID, TEXT, TEXT) TO authenticated, service_role, anon;

-- ==============================================================================
-- 3. EXPIRE GAME TURN SECURE (TIMEOUT AUTORITATIVO SIN SILENCIAR ERRORES)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.expire_game_turn_secure(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_state JSONB;
  v_turn_user_id UUID;
  v_lives JSONB;
  v_curr_lives INT;
  v_player_order JSONB;
  v_player_count INT;
  v_winner_id UUID := NULL;
  v_settle_result JSONB;
  v_i INT;
BEGIN
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF v_session.status = 'SETTLED'::session_status_enum THEN
    RETURN jsonb_build_object('success', true, 'action', 'ALREADY_SETTLED');
  END IF;

  v_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_turn_user_id := v_session.current_turn_user_id;

  IF v_turn_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_TURN');
  END IF;

  v_lives := COALESCE(v_state->'lives', '{}'::jsonb);
  v_curr_lives := COALESCE((v_lives->>v_turn_user_id::text)::INT, 1) - 1;
  v_lives := jsonb_set(v_lives, ARRAY[v_turn_user_id::text], to_jsonb(v_curr_lives));
  v_state := jsonb_set(v_state, '{lives}', v_lives);

  v_player_order := COALESCE(v_state->'playerOrder', '[]'::jsonb);
  v_player_count := jsonb_array_length(v_player_order);

  -- Si se agotaron las vidas -> Ganador es el oponente
  IF v_curr_lives <= 0 AND v_player_count > 1 THEN
    FOR v_i IN 0..(v_player_count - 1) LOOP
      IF (v_player_order->>v_i)::UUID <> v_turn_user_id THEN
        v_winner_id := (v_player_order->>v_i)::UUID;
        EXIT;
      END IF;
    END LOOP;

    v_state := jsonb_set(v_state, '{status}', '"game_won"'::jsonb);
    v_state := jsonb_set(v_state, '{winnerUserId}', to_jsonb(v_winner_id::text));
    v_state := jsonb_set(v_state, '{finishReason}', '"TIMEOUT_LIVES_EXHAUSTED"'::jsonb);

    UPDATE public.game_sessions
    SET current_state = v_state,
        winner_user_id = v_winner_id,
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Liquidar partida con RPC universal de forma segura y autoritativa
    v_settle_result := public.universal_settle_game_session(
      p_session_id,
      ARRAY[v_winner_id],
      NULL,
      'timeout_settle_' || p_session_id::text || '_' || extract(epoch from now())::text
    );

    IF (v_settle_result->>'success')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'TIMEOUT_SETTLEMENT_FAILED: ' || COALESCE(v_settle_result->>'error', 'Desconocido'),
        'details', v_settle_result
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'MATCH_ENDED_BY_TIMEOUT',
      'winnerUserId', v_winner_id,
      'settlement', v_settle_result
    );
  END IF;

  -- Continuar el juego con siguiente turno si quedan vidas
  UPDATE public.game_sessions
  SET current_state = v_state,
      turn_deadline_at = NOW() + INTERVAL '30 seconds',
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'action', 'LIVES_DECREMENTED', 'remainingLives', v_curr_lives);
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure(UUID) TO authenticated, service_role, anon;

-- ==============================================================================
-- 4. CLEANUP STALE PARTICIPATION (RESTITUCIÓN DE ENTRADAS RETENIDAS)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_user_game_participation(
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_closed_tables INT := 0;
  v_table_id UUID;
  v_stale_player RECORD;
  v_wallet RECORD;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_REQUIRED');
  END IF;

  -- 1) Para mesas cerradas/expiradas/canceladas sin liquidar, restituir la entrada retenida
  FOR v_stale_player IN (
    SELECT gtp.table_id, gt.entry_fee
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    WHERE gtp.user_id = v_user_id
      AND gtp.status <> 'LEFT'::player_table_status_enum
      AND gt.status::text IN ('CLOSED', 'EXPIRED', 'CANCELLED', 'TERMINATED')
      AND NOT EXISTS (
        SELECT 1 FROM public.game_settlements WHERE table_id = gt.id
      )
  ) LOOP
    IF v_stale_player.entry_fee > 0.00 THEN
      SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
      IF FOUND AND v_wallet.held_balance >= v_stale_player.entry_fee THEN
        UPDATE public.wallets
        SET held_balance = GREATEST(0.00, held_balance - v_stale_player.entry_fee),
            available_balance = available_balance + v_stale_player.entry_fee,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.ledger_entries (
          id, wallet_id, user_id, amount, currency, entry_type, direction,
          reference_id, reference_table, reference_type,
          balance_after, balance_after_available, balance_after_held,
          idempotency_key, description, created_at
        ) VALUES (
          gen_random_uuid(),
          v_wallet.id,
          v_user_id,
          v_stale_player.entry_fee,
          'VES',
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_stale_player.table_id,
          'game_tables',
          'game_table',
          v_wallet.available_balance + v_stale_player.entry_fee + GREATEST(0.00, v_wallet.held_balance - v_stale_player.entry_fee),
          v_wallet.available_balance + v_stale_player.entry_fee,
          GREATEST(0.00, v_wallet.held_balance - v_stale_player.entry_fee),
          'cleanup_refund_' || v_stale_player.table_id::text || '_' || v_user_id::text,
          'Reembolso automático de entrada por mesa cerrada/expirada',
          NOW()
        );
      END IF;
    END IF;
  END LOOP;

  -- 2) Marcar status LEFT en mesas inactivas
  UPDATE public.game_table_players gtp
  SET status = 'LEFT'::player_table_status_enum
  FROM public.game_tables gt
  WHERE gt.id = gtp.table_id
    AND gtp.user_id = v_user_id
    AND gtp.status <> 'LEFT'::player_table_status_enum
    AND gt.status::text IN ('CLOSED', 'EXPIRED', 'CANCELLED', 'TERMINATED');

  -- 3) Cerrar mesas huérfanas
  FOR v_table_id IN (
    SELECT DISTINCT gt.id
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    WHERE gtp.user_id = v_user_id
  ) LOOP
    PERFORM public.close_game_table_if_orphaned(v_table_id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_user_game_participation(UUID) TO authenticated, service_role, anon;

-- ==============================================================================
-- 5. REEMBOLSO ATÓMICO PARA SALAS DE BINGO EXPIRADAS / CANCELADAS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.refund_bingo_table_secure(
  p_table_id UUID,
  p_reason TEXT DEFAULT 'Cancelación/expiración de sala de bingo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_table RECORD;
  v_purchase RECORD;
  v_wallet RECORD;
  v_refunded_total NUMERIC(14,2) := 0.00;
  v_refunded_count INT := 0;
BEGIN
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'BINGO_TABLE_NOT_FOUND');
  END IF;

  -- Comprobar que no haya sido ya liquidada con premio
  IF EXISTS (SELECT 1 FROM public.game_settlements WHERE table_id = p_table_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'BINGO_TABLE_ALREADY_SETTLED');
  END IF;

  FOR v_purchase IN (
    SELECT * FROM public.bingo_card_purchases
    WHERE game_table_id = p_table_id
    FOR UPDATE
  ) LOOP
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_purchase.user_id
    FOR UPDATE;

    IF FOUND AND v_purchase.total_cost > 0.00 THEN
      UPDATE public.wallets
      SET held_balance = GREATEST(0.00, held_balance - v_purchase.total_cost),
          available_balance = available_balance + v_purchase.total_cost,
          updated_at = NOW()
      WHERE id = v_wallet.id;

      INSERT INTO public.ledger_entries (
        id, wallet_id, user_id, amount, currency, entry_type, direction,
        reference_id, reference_table, reference_type,
        balance_after, balance_after_available, balance_after_held,
        idempotency_key, description, created_at
      ) VALUES (
        gen_random_uuid(),
        v_wallet.id,
        v_purchase.user_id,
        v_purchase.total_cost,
        'VES',
        'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
        'CREDIT'::ledger_direction_enum,
        p_table_id,
        'game_tables',
        'game_table',
        v_wallet.available_balance + v_purchase.total_cost + GREATEST(0.00, v_wallet.held_balance - v_purchase.total_cost),
        v_wallet.available_balance + v_purchase.total_cost,
        GREATEST(0.00, v_wallet.held_balance - v_purchase.total_cost),
        'bingo_refund_' || p_table_id::text || '_' || v_purchase.user_id::text,
        p_reason,
        NOW()
      );

      v_refunded_total := v_refunded_total + v_purchase.total_cost;
      v_refunded_count := v_refunded_count + 1;
    END IF;
  END LOOP;

  UPDATE public.game_tables
  SET status = 'CANCELLED'::table_status_enum,
      closed_at = COALESCE(closed_at, NOW()),
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'refunded_purchases_count', v_refunded_count,
    'refunded_total_amount', v_refunded_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_bingo_table_secure(UUID, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 6. AUDITORÍA Y RECONCILIACIÓN FORENSE DE FONDOS HISTÓRICOS
-- ==============================================================================

-- A. Reconciliar sesiones que concluyeron en el juego con ganador pero no se liquidaron
CREATE OR REPLACE FUNCTION public.audit_and_reconcile_unsettled_game_sessions(
  p_dry_run BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_settled_count INT := 0;
  v_items JSONB := '[]'::jsonb;
  v_res JSONB;
BEGIN
  FOR v_session IN (
    SELECT gs.id AS session_id, gs.winner_user_id, gs.table_id, gt.entry_fee, gt.game_type
    FROM public.game_sessions gs
    JOIN public.game_tables gt ON gt.id = gs.table_id
    WHERE gs.status = 'FINISHED'::session_status_enum
      AND gs.winner_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.game_settlements st WHERE st.session_id = gs.id
      )
    ORDER BY gs.created_at ASC
  ) LOOP
    IF p_dry_run THEN
      v_items := v_items || jsonb_build_object(
        'session_id', v_session.session_id,
        'winner_user_id', v_session.winner_user_id,
        'table_id', v_session.table_id,
        'entry_fee', v_session.entry_fee,
        'game_type', v_session.game_type,
        'action_required', 'universal_settle_game_session'
      );
    ELSE
      v_res := public.universal_settle_game_session(
        v_session.session_id,
        ARRAY[v_session.winner_user_id],
        NULL,
        'forensic_reconciliation_settle_' || v_session.session_id::text
      );

      IF (v_res->>'success')::boolean = true THEN
        v_settled_count := v_settled_count + 1;
        v_items := v_items || jsonb_build_object(
          'session_id', v_session.session_id,
          'status', 'RECONCILED_AND_SETTLED',
          'settlement_id', v_res->>'settlement_id',
          'prize_pool', v_res->>'prize_pool'
        );
      ELSE
        v_items := v_items || jsonb_build_object(
          'session_id', v_session.session_id,
          'status', 'ERROR',
          'error', v_res->>'error'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'processed_count', CASE WHEN p_dry_run THEN jsonb_array_length(v_items) ELSE v_settled_count END,
    'details', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_and_reconcile_unsettled_game_sessions(BOOLEAN) TO authenticated, service_role;

-- B. Reconciliar retenciones huérfanas de mesas cerradas/canceladas sin partidas activas
CREATE OR REPLACE FUNCTION public.audit_and_reconcile_orphan_table_holds(
  p_dry_run BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_wallet RECORD;
  v_active_holds NUMERIC(14,2) := 0.00;
  v_excess_held NUMERIC(14,2) := 0.00;
  v_rescued_count INT := 0;
  v_rescued_total NUMERIC(14,2) := 0.00;
  v_items JSONB := '[]'::jsonb;
BEGIN
  FOR v_user_wallet IN (
    SELECT w.id AS wallet_id, w.user_id, w.held_balance, w.available_balance
    FROM public.wallets w
    WHERE w.held_balance > 0.00
  ) LOOP
    -- Calcular retenciones legítimas activas: mesas donde el usuario está activamente jugando o listo
    SELECT COALESCE(SUM(gt.entry_fee), 0.00) INTO v_active_holds
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    WHERE gtp.user_id = v_user_wallet.user_id
      AND gtp.status::text IN ('JOINED', 'READY', 'PLAYING')
      AND gt.status::text IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE');

    v_excess_held := GREATEST(0.00, v_user_wallet.held_balance - v_active_holds);

    IF v_excess_held > 0.00 THEN
      IF p_dry_run THEN
        v_items := v_items || jsonb_build_object(
          'user_id', v_user_wallet.user_id,
          'current_held', v_user_wallet.held_balance,
          'active_holds', v_active_holds,
          'excess_held_to_rescue', v_excess_held
        );
      ELSE
        UPDATE public.wallets
        SET held_balance = GREATEST(0.00, held_balance - v_excess_held),
            available_balance = available_balance + v_excess_held,
            updated_at = NOW()
        WHERE id = v_user_wallet.wallet_id;

        INSERT INTO public.ledger_entries (
          id, wallet_id, user_id, amount, currency, entry_type, direction,
          reference_id, reference_table, reference_type,
          balance_after, balance_after_available, balance_after_held,
          idempotency_key, description, created_at
        ) VALUES (
          gen_random_uuid(),
          v_user_wallet.wallet_id,
          v_user_wallet.user_id,
          v_excess_held,
          'VES',
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_user_wallet.wallet_id,
          'wallets',
          'wallet',
          v_user_wallet.available_balance + v_excess_held + GREATEST(0.00, v_user_wallet.held_balance - v_excess_held),
          v_user_wallet.available_balance + v_excess_held,
          GREATEST(0.00, v_user_wallet.held_balance - v_excess_held),
          'forensic_rescue_' || v_user_wallet.wallet_id::text || '_' || extract(epoch from now())::text,
          'Restitución y desbloqueo de saldo retenido huérfano por mesas canceladas/expiradas',
          NOW()
        );

        v_rescued_count := v_rescued_count + 1;
        v_rescued_total := v_rescued_total + v_excess_held;

        v_items := v_items || jsonb_build_object(
          'user_id', v_user_wallet.user_id,
          'rescued_amount', v_excess_held,
          'status', 'RESCUED'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'rescued_count', CASE WHEN p_dry_run THEN jsonb_array_length(v_items) ELSE v_rescued_count END,
    'rescued_total', v_rescued_total,
    'details', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_and_reconcile_orphan_table_holds(BOOLEAN) TO authenticated, service_role;
