-- ==============================================================================
-- RASPANDO LA OLLA 🇻🇪 / PulsoPLAY — MIGRACIÓN 159
-- DESACOPLAMIENTO DEFINITIVO ATRAPAÍTO VS PARCHÍS & COHERENCIA DE TURNOS SECUENCIALES
-- ==============================================================================
-- 1. Agrega el tipo de juego canónico 'PARCHIS' a game_type_enum si no existe.
-- 2. Actualiza fn_normalize_game_type_enum conservando la firma (p_game_str TEXT)
--    y normalizando PARCHIS y ATRAPAITO por separado.
-- 3. Actualiza expire_game_turn_secure(p_session_id uuid) con coherencia estricta:
--    - Exclusión explícita de juegos no secuenciales (Bingo, Polla).
--    - En Piedra Papel Tijera (RPS): lógica simultánea de commit / timeout / liquidación.
--    - En Atrapaíto Criollo: alterna color ('BLUE' <-> 'RED') y rota al oponente.
--    - En Parchís: rota respetando playerOrder / asientos multijugador (2-4 jugadores).
--    - En Dominó, Truco, Ajedrez, Damas y Una Olla: rota al siguiente jugador.
--    - Clave de idempotencia determinística y segura (< 100 chars para varchar(100)).
-- ==============================================================================

-- 1. SOPORTE DE ENUM PARA PARCHÍS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.game_type_enum'::regtype
      AND enumlabel = 'PARCHIS'
  ) THEN
    ALTER TYPE public.game_type_enum ADD VALUE 'PARCHIS';
  END IF;
END $$;

-- 2. NORMALIZACIÓN DE TIPOS DE JUEGO (Conservando nombre canónico de parámetro p_game_str TEXT)
CREATE OR REPLACE FUNCTION public.fn_normalize_game_type_enum(p_game_str TEXT)
RETURNS public.game_type_enum
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  IF p_game_str IS NULL THEN
    RAISE EXCEPTION 'INVALID_GAME_TYPE: El tipo de juego no puede ser nulo';
  END IF;

  v_normalized := UPPER(TRIM(p_game_str));
  v_normalized := REPLACE(v_normalized, '-', '_');

  CASE v_normalized
    WHEN 'DOMINO', 'DOMINO_VENEZOLANO', 'DOMINÓ', 'DOMINOES' THEN
      RETURN 'DOMINO_VENEZOLANO'::public.game_type_enum;

    WHEN 'TRUCO', 'TRUCO_VENEZOLANO' THEN
      RETURN 'TRUCO_VENEZOLANO'::public.game_type_enum;

    WHEN 'TIC_TAC_TOE', 'TRES_EN_RAYA', 'LA_VIEJA', 'VIEJA', 'TICTACTOE', '3_EN_RAYA' THEN
      RETURN 'TRES_EN_RAYA'::public.game_type_enum;

    WHEN 'ROCK_PAPER_SCISSORS', 'PIEDRA_PAPEL_TIJERA', 'PIEDRA_PAPEL_O_TIJERA', 'PPT', 'RPS' THEN
      RETURN 'PIEDRA_PAPEL_TIJERA'::public.game_type_enum;

    WHEN 'CHECKERS', 'DAMAS', 'DAMAS_VENEZOLANAS', 'DAMAS_ESPANOLAS', 'DAMAS_INTERNACIONALES' THEN
      RETURN 'DAMAS'::public.game_type_enum;

    WHEN 'BINGO', 'BINGO_ONLINE', 'BINGO_75', 'BINGO_90', 'BINGO_LATINO' THEN
      RETURN 'BINGO'::public.game_type_enum;

    WHEN 'POLLA', 'POLLA_VENEZOLANA', 'QUINIELA', 'POLLA_FUTBOL', 'POLLA_DEPORTIVA' THEN
      RETURN 'POLLA_VENEZOLANA'::public.game_type_enum;

    WHEN 'ATRAPAITO', 'ATRAPAITO_CRIOLLO', 'ATRAPA_AL_LADRON', 'ATRAPA_AL_MILLON', 'TRIVIA_ATRAPAITO', 'ATRAPA' THEN
      RETURN 'ATRAPAITO'::public.game_type_enum;

    WHEN 'PARCHIS', 'PARCHIS_VENEZOLANO', 'PARCHÍS', 'LUDO', 'LUDO_VENEZOLANO' THEN
      RETURN 'PARCHIS'::public.game_type_enum;

    WHEN 'CHESS', 'AJEDREZ' THEN
      RETURN 'CHESS'::public.game_type_enum;

    WHEN 'UNA_OLLA', 'UNA_OLLA_CARD_GAME', 'OLLA', 'RASPANDO_LA_OLLA', 'RASPANDO' THEN
      RETURN 'UNA_OLLA'::public.game_type_enum;

    ELSE
      BEGIN
        RETURN v_normalized::public.game_type_enum;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_GAME_TYPE: Tipo de juego desconocido o no soportado: %', p_game_str;
      END;
  END CASE;
END;
$$;

-- 3. EXPIRE_GAME_TURN_SECURE CON COHERENCIA MULTIJUGADOR Y DESACOPLAMIENTO DEFINITIVO
CREATE OR REPLACE FUNCTION public.expire_game_turn_secure(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_session RECORD;
  v_state JSONB;
  v_game_type_str TEXT;
  v_turn_user_id UUID;
  v_next_turn_user_id UUID := NULL;
  v_player_order JSONB;
  v_player_count INT := 0;
  v_scores JSONB;
  v_opp_score INT := 0;
  v_target_wins INT := 3;
  v_curr_round INT := 1;
  v_duration INT := 30;
  v_new_deadline TIMESTAMPTZ;
  v_lives JSONB;
  v_curr_lives INT;
  v_settle_result JSONB;
  v_i INT;
  -- Variables para RPS
  v_p1_id UUID;
  v_p2_id UUID;
  v_secret_choices JSONB;
  v_p1_committed BOOLEAN := false;
  v_p2_committed BOOLEAN := false;
  v_winner_id UUID := NULL;
  v_loser_id UUID := NULL;
  v_idempotency_key TEXT;
  v_new_state JSONB;
  -- Variables para Atrapaíto Criollo
  v_curr_color TEXT;
  v_next_color TEXT;
  -- Variables para Parchís
  v_parchis_order JSONB;
  v_parchis_len INT := 0;
  v_parchis_idx INT := -1;
  v_parchis_players JSONB;
  v_parchis_next_color TEXT;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_ID_REQUIRED');
  END IF;

  -- 1. Bloqueo Pesimista Estricto (FOR UPDATE)
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- 2. Idempotencia: Sesión ya cerrada, finalizada o liquidada
  IF UPPER(v_session.status::TEXT) IN ('FINISHED', 'SETTLED', 'CANCELLED', 'ABANDONED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'ALREADY_FINALIZED',
      'status', v_session.status::text
    );
  END IF;

  -- 3. Idempotencia Temporal: Si el turno aún no ha expirado (margen de gracia de 1s)
  IF v_session.turn_deadline_at IS NOT NULL AND v_session.turn_deadline_at > (NOW() + INTERVAL '1 second') THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'TURN_NOT_EXPIRED',
      'currentTurnUserId', v_session.current_turn_user_id,
      'turnDeadlineAt', v_session.turn_deadline_at
    );
  END IF;

  v_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_game_type_str := UPPER(COALESCE(v_session.game_type::TEXT, ''));

  -- =========================================================================
  -- CASO 1: JUEGOS NO SECUENCIALES (BINGO, POLLA VENEZOLANA)
  -- =========================================================================
  IF v_game_type_str IN ('BINGO', 'POLLA_VENEZOLANA', 'POLLA') THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'GAME_TYPE_NOT_HANDLED_BY_SEQUENTIAL_TIMEOUT',
      'gameType', v_game_type_str,
      'message', 'Bingo y Polla no operan bajo rotación secuencial individual de turnos.'
    );
  END IF;

  -- =========================================================================
  -- CASO 2: PIEDRA, PAPEL O TIJERA (Juego simultáneo Commit-Reveal)
  -- =========================================================================
  IF v_game_type_str IN ('ROCK_PAPER_SCISSORS', 'RPS', 'PIEDRA_PAPEL_TIJERA') THEN
    IF COALESCE(v_state->>'status', '') NOT IN ('ROUND_COMMIT', 'selecting') AND
       COALESCE(v_state->>'phase', '') NOT IN ('ROUND_COMMIT', 'selecting') THEN
      RETURN jsonb_build_object('success', true, 'action', 'NOT_IN_COMMIT_PHASE', 'status', v_state->>'status');
    END IF;

    v_curr_round := COALESCE((v_state->>'roundNumber')::int, (v_state->>'round')::int, 1);
    v_idempotency_key := 'rps_timeout_' || substr(p_session_id::text, 1, 8) || '_rnd_' || v_curr_round::text;

    v_p1_id := NULLIF(TRIM(v_state->>'player1Id'), '')::uuid;
    v_p2_id := NULLIF(TRIM(v_state->>'player2Id'), '')::uuid;

    IF v_p1_id IS NULL OR v_p2_id IS NULL THEN
      SELECT
        (jsonb_agg(user_id ORDER BY seat_number ASC, joined_at ASC)->>0)::uuid,
        (jsonb_agg(user_id ORDER BY seat_number ASC, joined_at ASC)->>1)::uuid
      INTO v_p1_id, v_p2_id
      FROM public.game_table_players
      WHERE table_id = v_session.table_id
        AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED');
    END IF;

    v_secret_choices := COALESCE(v_session.secret_choices, '{}'::jsonb);
    v_p1_committed := (v_secret_choices ? v_p1_id::text) AND (v_secret_choices->v_p1_id::text IS NOT NULL);
    v_p2_committed := (v_secret_choices ? v_p2_id::text) AND (v_secret_choices->v_p2_id::text IS NOT NULL);

    -- Si ambos se demoraron sin jugar: reseteo de la ronda
    IF (NOT v_p1_committed) AND (NOT v_p2_committed) THEN
      v_duration := COALESCE(v_session.turn_duration_seconds, 15);
      v_new_deadline := NOW() + (v_duration || ' seconds')::INTERVAL;

      v_new_state := v_state || jsonb_build_object(
        'roundNumber', v_curr_round + 1,
        'phase', 'ROUND_COMMIT',
        'status', 'ROUND_COMMIT',
        'lastRoundResult', 'DRAW_DOUBLE_TIMEOUT',
        'timeoutUserId', NULL,
        'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
      );

      UPDATE public.game_sessions
      SET current_state = v_new_state,
          secret_choices = '{}'::jsonb,
          turn_deadline_at = v_new_deadline,
          turn_expires_at = v_new_deadline,
          updated_at = NOW()
      WHERE id = p_session_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'RPS_DOUBLE_TIMEOUT_RESET',
        'roundNumber', v_curr_round + 1,
        'turnDeadlineAt', v_new_deadline
      );
    END IF;

    -- Uno sí jugó y el otro expiró
    IF v_p1_committed AND (NOT v_p2_committed) THEN
      v_winner_id := v_p1_id;
      v_loser_id := v_p2_id;
    ELSIF v_p2_committed AND (NOT v_p1_committed) THEN
      v_winner_id := v_p2_id;
      v_loser_id := v_p1_id;
    END IF;

    v_target_wins := COALESCE((v_state->>'targetWins')::int, 3);
    v_scores := COALESCE(v_state->'scores', jsonb_build_object(v_p1_id::text, 0, v_p2_id::text, 0));
    v_opp_score := COALESCE((v_scores->>v_winner_id::text)::int, 0) + 1;
    v_scores := jsonb_set(v_scores, ARRAY[v_winner_id::text], to_jsonb(v_opp_score));

    IF v_opp_score >= v_target_wins THEN
      v_new_state := v_state || jsonb_build_object(
        'status', 'FINISHED',
        'phase', 'match_ended',
        'isGameOver', true,
        'winnerUserId', v_winner_id,
        'scores', v_scores,
        'timeoutUserId', v_loser_id,
        'abandonedBy', v_loser_id
      );

      UPDATE public.game_sessions
      SET current_state = v_new_state,
          status = 'FINISHED'::session_status_enum,
          winner_user_id = v_winner_id,
          turn_deadline_at = NULL,
          turn_expires_at = NULL,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = p_session_id;

      SELECT public.universal_settle_game_session(
        p_session_id,
        ARRAY[v_winner_id],
        NULL::INT,
        v_idempotency_key
      ) INTO v_settle_result;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'RPS_MATCH_CONCLUDED_TIMEOUT',
        'winnerUserId', v_winner_id,
        'timeoutUserId', v_loser_id,
        'settlement', v_settle_result
      );
    ELSE
      v_duration := COALESCE(v_session.turn_duration_seconds, 15);
      v_new_deadline := NOW() + (v_duration || ' seconds')::INTERVAL;

      v_new_state := v_state || jsonb_build_object(
        'roundNumber', v_curr_round + 1,
        'phase', 'ROUND_COMMIT',
        'status', 'ROUND_COMMIT',
        'scores', v_scores,
        'lastRoundResult', 'TIMEOUT_AWARD',
        'lastRoundWinner', v_winner_id,
        'timeoutUserId', v_loser_id,
        'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
      );

      UPDATE public.game_sessions
      SET current_state = v_new_state,
          secret_choices = '{}'::jsonb,
          turn_deadline_at = v_new_deadline,
          turn_expires_at = v_new_deadline,
          updated_at = NOW()
      WHERE id = p_session_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'RPS_ROUND_AWARDED_TIMEOUT',
        'winnerUserId', v_winner_id,
        'timeoutUserId', v_loser_id,
        'newRound', v_curr_round + 1,
        'turnDeadlineAt', v_new_deadline
      );
    END IF;
  END IF;

  -- =========================================================================
  -- CASO 3: VALIDACIÓN DE JUEGOS SECUENCIALES AUTORIZADOS
  -- =========================================================================
  IF v_game_type_str NOT IN (
    'TRES_EN_RAYA', 'TIC_TAC_TOE', 'TICTACTOE', 'LA_VIEJA',
    'ATRAPAITO', 'ATRAPAITO_CRIOLLO',
    'PARCHIS', 'PARCHIS_VENEZOLANO', 'LUDO',
    'DOMINO_VENEZOLANO', 'DOMINO',
    'TRUCO_VENEZOLANO', 'TRUCO',
    'CHESS', 'AJEDREZ',
    'DAMAS',
    'UNA_OLLA'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'GAME_TYPE_NOT_HANDLED_BY_SEQUENTIAL_TIMEOUT',
      'gameType', v_game_type_str
    );
  END IF;

  v_turn_user_id := COALESCE(
    v_session.current_turn_user_id,
    (v_state->>'turnUserId')::UUID,
    (v_state->>'currentTurnUserId')::UUID,
    (v_state->>'currentTurn')::UUID
  );

  IF v_turn_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_TURN');
  END IF;

  -- =========================================================================
  -- RESOLUCIÓN ORDENADA DEL SIGUIENTE TURNO (v_next_turn_user_id)
  -- =========================================================================
  -- Si el juego es Parchís y el estado incluye playerOrder explícito
  v_parchis_order := v_state->'playerOrder';
  IF v_game_type_str IN ('PARCHIS', 'PARCHIS_VENEZOLANO', 'LUDO') AND
     jsonb_typeof(v_parchis_order) = 'array' AND jsonb_array_length(v_parchis_order) >= 2 THEN
    v_parchis_len := jsonb_array_length(v_parchis_order);
    FOR v_i IN 0..(v_parchis_len - 1) LOOP
      IF (v_parchis_order->>v_i)::UUID = v_turn_user_id THEN
        v_next_turn_user_id := (v_parchis_order->>((v_i + 1) % v_parchis_len))::UUID;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- Fallback o estándar para demás juegos multijugador: consultar game_table_players
  IF v_next_turn_user_id IS NULL THEN
    SELECT jsonb_agg(user_id ORDER BY seat_number ASC, joined_at ASC)
    INTO v_player_order
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED');

    v_player_count := COALESCE(jsonb_array_length(v_player_order), 0);

    IF v_player_count >= 2 THEN
      FOR v_i IN 0..(v_player_count - 1) LOOP
        IF (v_player_order->>v_i)::UUID = v_turn_user_id THEN
          v_next_turn_user_id := (v_player_order->>((v_i + 1) % v_player_count))::UUID;
          EXIT;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- Fallback de seguridad: cualquier otro jugador activo en la mesa
  IF v_next_turn_user_id IS NULL THEN
    SELECT user_id INTO v_next_turn_user_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id != v_turn_user_id
      AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  v_scores := COALESCE(v_state->'scores', jsonb_build_object(
    v_turn_user_id::TEXT, 0,
    COALESCE(v_next_turn_user_id::TEXT, 'opp'), 0
  ));
  v_opp_score := COALESCE((v_scores->>v_next_turn_user_id::TEXT)::INT, 0);
  v_target_wins := COALESCE((v_state->>'targetWins')::INT, 3);
  v_curr_round := COALESCE((v_state->>'round')::INT, 1);
  v_duration := COALESCE(v_session.turn_duration_seconds, 30);
  v_new_deadline := NOW() + (v_duration || ' seconds')::INTERVAL;

  -- Clave de idempotencia determinística (< 100 caracteres para el check uq_game_actions_idempotency)
  v_idempotency_key := 'to_' || substr(p_session_id::TEXT, 1, 8) || '_' || substr(v_turn_user_id::TEXT, 1, 8) || '_' || md5(p_session_id::TEXT || '_' || v_turn_user_id::TEXT || '_' || COALESCE(v_session.turn_deadline_at::TEXT, '0'));

  -- -------------------------------------------------------------------------
  -- SUB-RAMA A: TIC TAC TOE / LA VIEJA (Conteo de vidas y penalización)
  -- -------------------------------------------------------------------------
  IF v_game_type_str IN ('TIC_TAC_TOE', 'TICTACTOE', 'LA_VIEJA', 'TRES_EN_RAYA') THEN
    v_lives := COALESCE(v_state->'lives', jsonb_build_object(
      v_turn_user_id::TEXT, 3,
      COALESCE(v_next_turn_user_id::TEXT, 'opp'), 3
    ));
    v_curr_lives := GREATEST(0, COALESCE((v_lives->>v_turn_user_id::TEXT)::INT, 3) - 1);
    v_lives := jsonb_set(v_lives, ARRAY[v_turn_user_id::TEXT], to_jsonb(v_curr_lives));

    IF v_curr_lives <= 0 AND v_next_turn_user_id IS NOT NULL THEN
      v_opp_score := v_target_wins;
      v_scores := jsonb_set(v_scores, ARRAY[v_next_turn_user_id::TEXT], to_jsonb(v_opp_score));

      v_state := v_state || jsonb_build_object(
        'status', 'FINISHED',
        'phase', 'match_ended',
        'isGameOver', true,
        'winnerUserId', v_next_turn_user_id,
        'scores', v_scores,
        'lives', v_lives,
        'abandonedBy', v_turn_user_id,
        'timeoutUserId', v_turn_user_id
      );

      UPDATE public.game_sessions
      SET current_state = v_state,
          status = 'FINISHED'::session_status_enum,
          winner_user_id = v_next_turn_user_id,
          turn_deadline_at = NULL,
          turn_expires_at = NULL,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = p_session_id;

      SELECT public.universal_settle_game_session(
        p_session_id,
        ARRAY[v_next_turn_user_id],
        NULL::INT,
        'ttt_to_' || substr(p_session_id::TEXT, 1, 8) || '_' || substr(v_turn_user_id::TEXT, 1, 8)
      ) INTO v_settle_result;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'MATCH_CONCLUDED_TIMEOUT',
        'winnerUserId', v_next_turn_user_id,
        'timeoutUserId', v_turn_user_id,
        'settlement', v_settle_result
      );
    ELSE
      v_state := v_state || jsonb_build_object(
        'currentTurnUserId', v_next_turn_user_id,
        'turnUserId', v_next_turn_user_id,
        'turnDeadline', v_new_deadline,
        'lives', v_lives,
        'timeoutUserId', v_turn_user_id
      );

      UPDATE public.game_sessions
      SET current_state = v_state,
          current_turn_user_id = v_next_turn_user_id,
          turn_deadline_at = v_new_deadline,
          turn_expires_at = v_new_deadline,
          updated_at = NOW()
      WHERE id = p_session_id;

      INSERT INTO public.game_actions (
        session_id,
        user_id,
        sequence_number,
        action_type,
        payload,
        is_valid,
        server_state_hash,
        idempotency_key
      ) VALUES (
        p_session_id,
        v_turn_user_id,
        COALESCE((SELECT MAX(sequence_number) FROM public.game_actions WHERE session_id = p_session_id), 0) + 1,
        'TURN_EXPIRED',
        jsonb_build_object(
          'expiredUserId', v_turn_user_id,
          'nextTurnUserId', v_next_turn_user_id,
          'remainingLives', v_curr_lives,
          'turnDeadline', v_new_deadline
        ),
        true,
        md5(v_state::TEXT),
        v_idempotency_key
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'TURN_ROTATED_PENALTY',
        'expiredUserId', v_turn_user_id,
        'nextTurnUserId', v_next_turn_user_id,
        'remainingLives', v_curr_lives,
        'turnDeadlineAt', v_new_deadline
      );
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- SUB-RAMA B: ATRAPAÍTO CRIOLLO (Canicas, Paredes de Bloqueo, 2 Jugadores BLUE/RED)
  -- -------------------------------------------------------------------------
  IF v_game_type_str IN ('ATRAPAITO', 'ATRAPAITO_CRIOLLO') THEN
    v_curr_color := UPPER(COALESCE(v_state->>'turn', 'BLUE'));
    IF v_curr_color = 'BLUE' THEN
      v_next_color := 'RED';
    ELSE
      v_next_color := 'BLUE';
    END IF;

    v_state := v_state || jsonb_build_object(
      'currentTurnUserId', v_next_turn_user_id,
      'turnUserId', v_next_turn_user_id,
      'currentTurn', v_next_turn_user_id,
      'turn', v_next_color,
      'action', 'MOVE',
      'pendingWall', NULL,
      'turnDeadline', v_new_deadline,
      'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
    );

    UPDATE public.game_sessions
    SET current_state = v_state,
        current_turn_user_id = v_next_turn_user_id,
        turn_deadline_at = v_new_deadline,
        turn_expires_at = v_new_deadline,
        updated_at = NOW()
    WHERE id = p_session_id;

    INSERT INTO public.game_actions (
      session_id,
      user_id,
      sequence_number,
      action_type,
      payload,
      is_valid,
      server_state_hash,
      idempotency_key
    ) VALUES (
      p_session_id,
      v_turn_user_id,
      COALESCE((SELECT MAX(sequence_number) FROM public.game_actions WHERE session_id = p_session_id), 0) + 1,
      'TURN_EXPIRED',
      jsonb_build_object(
        'expiredUserId', v_turn_user_id,
        'nextTurnUserId', v_next_turn_user_id,
        'nextColor', v_next_color,
        'turnDeadline', v_new_deadline
      ),
      true,
      md5(v_state::TEXT),
      v_idempotency_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'TURN_ROTATED_ATRAPAITO',
      'expiredUserId', v_turn_user_id,
      'nextTurnUserId', v_next_turn_user_id,
      'nextColor', v_next_color,
      'turnDeadlineAt', v_new_deadline
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- SUB-RAMA C: PARCHÍS / LUDO (Tablero Circular, Dados, 2 a 4 Jugadores)
  -- -------------------------------------------------------------------------
  IF v_game_type_str IN ('PARCHIS', 'PARCHIS_VENEZOLANO', 'LUDO') THEN
    v_parchis_players := v_state->'players';
    IF v_parchis_players IS NOT NULL AND (v_parchis_players->v_next_turn_user_id::TEXT) IS NOT NULL THEN
      v_parchis_next_color := v_parchis_players->v_next_turn_user_id::TEXT->'colors'->>0;
    END IF;

    v_state := v_state || jsonb_build_object(
      'currentTurnUserId', v_next_turn_user_id,
      'turnUserId', v_next_turn_user_id,
      'turnPhase', 'ROLL_DICE',
      'diceValue', NULL,
      'consecutiveSixes', 0,
      'turnDeadline', v_new_deadline,
      'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
    );

    IF v_parchis_next_color IS NOT NULL THEN
      v_state := jsonb_set(v_state, '{activeColor}', to_jsonb(v_parchis_next_color));
    END IF;

    UPDATE public.game_sessions
    SET current_state = v_state,
        current_turn_user_id = v_next_turn_user_id,
        turn_deadline_at = v_new_deadline,
        turn_expires_at = v_new_deadline,
        updated_at = NOW()
    WHERE id = p_session_id;

    INSERT INTO public.game_actions (
      session_id,
      user_id,
      sequence_number,
      action_type,
      payload,
      is_valid,
      server_state_hash,
      idempotency_key
    ) VALUES (
      p_session_id,
      v_turn_user_id,
      COALESCE((SELECT MAX(sequence_number) FROM public.game_actions WHERE session_id = p_session_id), 0) + 1,
      'TURN_EXPIRED',
      jsonb_build_object(
        'expiredUserId', v_turn_user_id,
        'nextTurnUserId', v_next_turn_user_id,
        'activeColor', v_parchis_next_color,
        'turnDeadline', v_new_deadline
      ),
      true,
      md5(v_state::TEXT),
      v_idempotency_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'TURN_ROTATED_PARCHIS',
      'expiredUserId', v_turn_user_id,
      'nextTurnUserId', v_next_turn_user_id,
      'activeColor', v_parchis_next_color,
      'turnDeadlineAt', v_new_deadline
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- SUB-RAMA D: DEMÁS JUEGOS SECUENCIALES (DOMINÓ, TRUCO, AJEDREZ, DAMAS, UNA OLLA)
  -- -------------------------------------------------------------------------
  v_state := v_state || jsonb_build_object(
    'currentTurnUserId', v_next_turn_user_id,
    'turnUserId', v_next_turn_user_id,
    'turnDeadline', v_new_deadline,
    'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
  );

  UPDATE public.game_sessions
  SET current_state = v_state,
      current_turn_user_id = v_next_turn_user_id,
      turn_deadline_at = v_new_deadline,
      turn_expires_at = v_new_deadline,
      updated_at = NOW()
  WHERE id = p_session_id;

  INSERT INTO public.game_actions (
    session_id,
    user_id,
    sequence_number,
    action_type,
    payload,
    is_valid,
    server_state_hash,
    idempotency_key
  ) VALUES (
    p_session_id,
    v_turn_user_id,
    COALESCE((SELECT MAX(sequence_number) FROM public.game_actions WHERE session_id = p_session_id), 0) + 1,
    'TURN_EXPIRED',
    jsonb_build_object(
      'expiredUserId', v_turn_user_id,
      'nextTurnUserId', v_next_turn_user_id,
      'turnDeadline', v_new_deadline
    ),
    true,
    md5(v_state::TEXT),
    v_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'TURN_ROTATED',
    'expiredUserId', v_turn_user_id,
    'nextTurnUserId', v_next_turn_user_id,
    'turnDeadlineAt', v_new_deadline
  );
END;
$function$;

-- 4. PERMISOS Y RECARGA DE ESQUEMA
GRANT EXECUTE ON FUNCTION public.fn_normalize_game_type_enum(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure(uuid) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
