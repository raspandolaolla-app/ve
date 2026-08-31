-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 083
-- CORRECCIÓN DEFINITIVA DE AMBIGÜEDAD EN SETTLE_GAME_SESSION & INICIO SINCRONIZADO AJEDREZ
-- ==============================================================================
-- 1. Elimina la ambigüedad en PostgREST que causaba el error "Multiple functions: public.settle_game_session".
-- 2. Elimina sobrecargas duplicadas (UUID, TEXT[], INTEGER, TEXT) y (UUID, UUID[], SMALLINT, VARCHAR).
-- 3. Define la función canónica única public.settle_game_session(UUID, UUID[], INTEGER, TEXT).
-- 4. Actualiza public.start_game_session_secure para soportar el inicio sincronizado de Ajedrez (15s por turno).
-- ==============================================================================

-- 1. ELIMINACIÓN EXPLÍCITA DE TODAS LAS SOBRECARGAS CONFLICTIVAS
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, TEXT[], INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], SMALLINT, VARCHAR);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], INTEGER, TEXT);

-- 2. FUNCIÓN CANÓNICA ÚNICA: SETTLE_GAME_SESSION
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
  -- 1. Control de Autorización (Participante de la mesa, Rol Operador+ o Motor Servidor)
  v_caller_id := auth.uid();
  
  -- Verificar si la sesión existe primero
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

  -- 2. Idempotencia Estricta
  v_effective_idempotency := COALESCE(p_idempotency_key, 'settle_' || p_session_id::text);

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id OR idempotency_key = v_effective_idempotency
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'settlement_id', v_existing_settlement.id,
      'gross_pool', v_existing_settlement.gross_pool,
      'prize_pool', v_existing_settlement.prize_pool,
      'platform_fee', v_existing_settlement.platform_fee,
      'winner_count', array_length(p_winner_user_ids, 1)
    );
  END IF;

  -- 3. Calcular Pozos Oficiales (90% Ganador / 10% Plataforma)
  SELECT COUNT(DISTINCT user_id) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  IF v_player_count < 1 THEN
    v_player_count := GREATEST(1, v_table.current_players);
  END IF;

  v_gross_pool := ROUND((v_table.entry_fee * v_player_count)::numeric, 2);
  v_platform_fee := ROUND((v_gross_pool * 0.10)::numeric, 2);
  v_prize_pool := ROUND((v_gross_pool - v_platform_fee)::numeric, 2);

  v_winner_count := COALESCE(array_length(p_winner_user_ids, 1), 0);
  IF v_winner_count < 1 THEN
    RAISE EXCEPTION 'INVALID_WINNERS: Se requiere al menos un ganador para liquidar la partida';
  END IF;

  v_individual_prize := ROUND((v_prize_pool / v_winner_count)::numeric, 2);

  -- Determinar tipo de liquidación
  IF v_winner_count = 1 THEN
    v_settlement_type := 'STANDARD_WIN'::settlement_type_enum;
  ELSE
    v_settlement_type := 'SPLIT_POT'::settlement_type_enum;
  END IF;

  -- 4. Registrar Liquidación Principal en game_settlements
  v_settlement_id := gen_random_uuid();
  INSERT INTO public.game_settlements (
    id, session_id, table_id, game_type, total_pot, gross_pool, prize_pool, platform_fee,
    settlement_type, status, idempotency_key, metadata, created_at, updated_at
  ) VALUES (
    v_settlement_id, p_session_id, v_table.id, v_table.game_type, v_gross_pool, v_gross_pool, v_prize_pool, v_platform_fee,
    v_settlement_type, 'COMPLETED'::settlement_status_enum, v_effective_idempotency,
    jsonb_build_object(
      'winner_user_ids', p_winner_user_ids,
      'winner_team', p_winner_team,
      'player_count', v_player_count,
      'settled_by', v_caller_id
    ),
    NOW(), NOW()
  );

  -- 5. Acreditar Premio(s) a Billetera y Registrar en Ledger con balance_after
  FOREACH v_winner_id IN ARRAY p_winner_user_ids LOOP
    SELECT * INTO v_winner_wallet
    FROM public.wallets
    WHERE user_id = v_winner_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance, bonus_balance, is_active, created_at, updated_at)
      VALUES (v_winner_id, v_individual_prize, 0.00, true, NOW(), NOW())
      RETURNING * INTO v_winner_wallet;
    ELSE
      UPDATE public.wallets
      SET balance = balance + v_individual_prize,
          updated_at = NOW()
      WHERE id = v_winner_wallet.id
      RETURNING * INTO v_winner_wallet;
    END IF;

    -- Registrar Entrada en Ledger para el Ganador
    v_winner_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id, wallet_id, user_id, type, amount, balance_after,
      reference_id, reference_type, description, metadata, created_at
    ) VALUES (
      v_winner_ledger_id, v_winner_wallet.id, v_winner_id,
      'PRIZE_CREDIT'::ledger_entry_type_enum, v_individual_prize, v_winner_wallet.balance,
      p_session_id, 'game_session',
      'Premio acreditado por victoria en ' || v_table.game_type::text,
      jsonb_build_object(
        'table_id', v_table.id,
        'gross_pool', v_gross_pool,
        'prize_pool', v_prize_pool,
        'platform_fee', v_platform_fee,
        'settlement_id', v_settlement_id
      ),
      NOW()
    );

    -- Registrar Destinatario en game_settlement_recipients
    INSERT INTO public.game_settlement_recipients (
      id, settlement_id, user_id, amount_won, payout_amount,
      ledger_entry_id, status, created_at
    ) VALUES (
      gen_random_uuid(), v_settlement_id, v_winner_id, v_individual_prize, v_individual_prize,
      v_winner_ledger_id, 'PAID'::recipient_payout_status_enum, NOW()
    );

    v_distributed_sum := v_distributed_sum + v_individual_prize;
  END LOOP;

  -- 6. Cerrar Sesión y Mesa de Juego
  UPDATE public.game_sessions
  SET status = 'SETTLED'::session_status_enum,
      winner_user_id = p_winner_user_ids[1],
      winner_team = p_winner_team,
      gross_pool = v_gross_pool,
      prize_pool = v_prize_pool,
      platform_fee = v_platform_fee,
      ended_at = NOW(),
      is_settled = TRUE
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_table.id;

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

-- Permisos de Ejecución
GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role, anon;

-- 3. RECONCILIACIÓN Y SOPORTE DE INICIO SINCRONIZADO PARA AJEDREZ (15S POR TURNO)
CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_table RECORD;
  v_unique_players_count INT;
  v_players JSONB := '[]'::jsonb;
  v_player_order JSONB := '[]'::jsonb;
  v_lives JSONB := '{}'::jsonb;
  v_scores JSONB := '{}'::jsonb;
  v_player_record RECORD;
  v_session_id UUID;
  v_first_turn_user_id UUID;
  v_white_player_id UUID;
  v_black_player_id UUID;
  v_initial_state JSONB;
  v_deadline TIMESTAMPTZ;
  v_turn_seconds INT := 10;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para iniciar la partida';
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

  IF v_table.host_user_id <> v_user_id THEN
    RAISE EXCEPTION 'ONLY_HOST_CAN_START: Únicamente el Anfitrión de la mesa puede iniciar la partida';
  END IF;

  -- Si ya existe una sesión activa o en curso, retornarla
  SELECT id INTO v_session_id
  FROM public.game_sessions
  WHERE table_id = p_table_id
    AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'IN_PROGRESS');

  IF v_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', v_session_id,
      'table_id', p_table_id,
      'already_active', true
    );
  END IF;

  -- Validar cantidad de jugadores DISTINTOS activos en la mesa
  SELECT COUNT(DISTINCT gtp.user_id) INTO v_unique_players_count
  FROM public.game_table_players gtp
  WHERE gtp.table_id = p_table_id
    AND gtp.status != 'LEFT'::player_table_status_enum;

  IF v_unique_players_count < v_table.min_players THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS: Se requieren al menos % jugadores diferentes para iniciar la partida (actualmente hay %)', v_table.min_players, v_unique_players_count;
  END IF;

  -- Compilar lista de jugadores activos
  FOR v_player_record IN (
    SELECT DISTINCT ON (gtp.user_id)
      gtp.user_id, gtp.seat_number, p.display_name, p.first_name, p.last_name, p.avatar_url
    FROM public.game_table_players gtp
    JOIN public.profiles p ON p.user_id = gtp.user_id
    WHERE gtp.table_id = p_table_id
      AND gtp.status != 'LEFT'::player_table_status_enum
    ORDER BY gtp.user_id, gtp.seat_number ASC
  ) LOOP
    IF v_first_turn_user_id IS NULL THEN
      v_first_turn_user_id := v_player_record.user_id;
      v_white_player_id := v_player_record.user_id;
    ELSEIF v_black_player_id IS NULL THEN
      v_black_player_id := v_player_record.user_id;
    END IF;

    v_player_order := v_player_order || to_jsonb(v_player_record.user_id::text);
    v_lives := jsonb_set(v_lives, ARRAY[v_player_record.user_id::text], '3'::jsonb);
    v_scores := jsonb_set(v_scores, ARRAY[v_player_record.user_id::text], '0'::jsonb);

    v_players := v_players || jsonb_build_object(
      'userId', v_player_record.user_id,
      'seatNumber', v_player_record.seat_number,
      'displayName', COALESCE(NULLIF(trim(v_player_record.display_name), ''), trim(COALESCE(v_player_record.first_name, '') || ' ' || COALESCE(v_player_record.last_name, ''))),
      'avatarUrl', v_player_record.avatar_url,
      'lives', 3
    );
  END LOOP;

  -- Configuración Específica para Ajedrez (CHESS)
  IF v_table.game_type::text = 'CHESS' OR v_table.game_type = 'CHESS'::game_type_enum THEN
    v_white_player_id := v_table.host_user_id;
    IF v_black_player_id IS NULL OR v_black_player_id = v_white_player_id THEN
      SELECT gtp.user_id INTO v_black_player_id
      FROM public.game_table_players gtp
      WHERE gtp.table_id = p_table_id
        AND gtp.status != 'LEFT'::player_table_status_enum
        AND gtp.user_id != v_white_player_id
      LIMIT 1;
    END IF;
    v_first_turn_user_id := v_white_player_id;
    v_turn_seconds := 15; -- Mínimo 15s para Ajedrez
    v_deadline := NOW() + (v_turn_seconds || ' seconds')::interval;

    v_initial_state := jsonb_build_object(
      'fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'playerWhiteUserId', v_white_player_id,
      'playerBlackUserId', v_black_player_id,
      'currentTurnUserId', v_first_turn_user_id,
      'turnExpiresAt', v_deadline,
      'moveHistory', '[]'::jsonb,
      'winnerUserId', NULL,
      'isDraw', false
    );
  ELSE
    v_deadline := NOW() + INTERVAL '10 seconds';
    v_initial_state := jsonb_build_object(
      'status', 'PLAYING',
      'playerOrder', v_player_order,
      'players', v_players,
      'currentTurnUserId', v_first_turn_user_id,
      'lives', v_lives,
      'scores', v_scores,
      'round', 1
    );
  END IF;

  v_session_id := gen_random_uuid();

  -- Crear sesión en game_sessions usando el estado ACTIVE del enum
  INSERT INTO public.game_sessions (
    id, table_id, game_type, session_number, status, current_state,
    current_turn_user_id, turn_deadline_at, started_at
  ) VALUES (
    v_session_id, p_table_id, v_table.game_type, 1, 'ACTIVE'::session_status_enum,
    v_initial_state, v_first_turn_user_id, v_deadline, NOW()
  );

  -- Actualizar estado de la mesa a ACTIVE y registrar started_at de forma segura
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      started_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'table_id', p_table_id,
    'current_turn_user_id', v_first_turn_user_id,
    'turn_deadline_at', v_deadline,
    'already_active', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID) TO authenticated, service_role, anon;
