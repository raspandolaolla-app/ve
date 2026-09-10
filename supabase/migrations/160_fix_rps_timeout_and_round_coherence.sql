-- =============================================================================
-- MIGRACIÓN 160: CORRECCIÓN DEFINITIVA DE TIMEOUT, ESTADO Y COHERENCIA EN RPS
-- =============================================================================
-- 1. Corrige 'expire_game_turn_secure' para Piedra, Papel o Tijera (RPS):
--    - Elimina referencia a columna inexistente 'v_session.secret_choices'.
--    - Consulta 'secret_state->rps_choices' desde 'public.game_session_secrets'.
--    - Aplica sistema autoritativo de 3 vidas (Mejor de 3 Vidas).
--    - Limpia 'game_session_secrets' y resetea 'playerChoices', 'player1Choice',
--      'player2Choice', 'roundWinner' y 'roundWinnerUserId' al avanzar o reiniciar.
--    - Resuelve doble timeout como empate sin restar vidas y con nuevo plazo de 15s.
--    - Penaliza con -1 vida a quien expire y otorga la ronda a quien sí jugó.
--    - Si las vidas llegan a 0, liquida la partida atómicamente con 'universal_settle_game_session'.
-- 2. Asegura idempotencia en 'next_rps_round_secure' registrando 'ROUND_START' en game_actions.
-- =============================================================================

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
  v_p1_lives INT := 3;
  v_p2_lives INT := 3;
  v_is_game_over BOOLEAN := false;
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

    -- Obtener jugadas secretas autoritativas desde game_session_secrets
    SELECT secret_state->'rps_choices' INTO v_secret_choices
    FROM public.game_session_secrets
    WHERE session_id = p_session_id;

    v_secret_choices := COALESCE(v_secret_choices, '{}'::jsonb);
    v_p1_committed := (v_secret_choices ? v_p1_id::text) AND (v_secret_choices->>v_p1_id::text IS NOT NULL);
    v_p2_committed := (v_secret_choices ? v_p2_id::text) AND (v_secret_choices->>v_p2_id::text IS NOT NULL);

    -- Si ambos jugadores ya habían jugado, no expirar, avanzar a revelación
    IF v_p1_committed AND v_p2_committed THEN
      RETURN jsonb_build_object(
        'success', true,
        'action', 'BOTH_ALREADY_COMMITTED',
        'roundNumber', v_curr_round
      );
    END IF;

    -- SUB-CASO 2A: Si ambos se demoraron sin jugar -> Empate por doble timeout, reset de ronda sin pérdida de vidas
    IF (NOT v_p1_committed) AND (NOT v_p2_committed) THEN
      v_duration := COALESCE(v_session.turn_duration_seconds, 15);
      v_new_deadline := NOW() + (v_duration || ' seconds')::INTERVAL;

      v_new_state := v_state || jsonb_build_object(
        'roundNumber', v_curr_round + 1,
        'round', v_curr_round + 1,
        'phase', 'selecting',
        'status', 'ROUND_COMMIT',
        'player1Choice', NULL::text,
        'player2Choice', NULL::text,
        'roundWinner', NULL::text,
        'roundWinnerUserId', NULL::uuid,
        'currentTurnUserId', NULL::uuid,
        'turnUserId', NULL::uuid,
        'lastRoundResult', 'DRAW_DOUBLE_TIMEOUT',
        'timeoutUserId', NULL::uuid,
        'playerChoices', jsonb_build_object(
          v_p1_id::text, jsonb_build_object('committed', false),
          v_p2_id::text, jsonb_build_object('committed', false)
        ),
        'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
      );

      UPDATE public.game_sessions
      SET current_state = v_new_state,
          current_turn_user_id = NULL,
          turn_deadline_at = v_new_deadline,
          turn_expires_at = v_new_deadline,
          updated_at = NOW()
      WHERE id = p_session_id;

      UPDATE public.game_session_secrets
      SET secret_state = jsonb_set(COALESCE(secret_state, '{}'::jsonb), '{rps_choices}', '{}'::jsonb),
          updated_at = NOW()
      WHERE session_id = p_session_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'RPS_DOUBLE_TIMEOUT_RESET',
        'roundNumber', v_curr_round + 1,
        'turnDeadlineAt', v_new_deadline
      );
    END IF;

    -- SUB-CASO 2B: Uno sí jugó y el otro expiró -> El que jugó gana la ronda, el que expiró pierde 1 vida
    IF v_p1_committed AND (NOT v_p2_committed) THEN
      v_winner_id := v_p1_id;
      v_loser_id := v_p2_id;
    ELSIF v_p2_committed AND (NOT v_p1_committed) THEN
      v_winner_id := v_p2_id;
      v_loser_id := v_p1_id;
    END IF;

    v_p1_lives := COALESCE((v_state->>'player1Lives')::int, (v_state->'lives'->>v_p1_id::text)::int, 3);
    v_p2_lives := COALESCE((v_state->>'player2Lives')::int, (v_state->'lives'->>v_p2_id::text)::int, 3);

    IF v_loser_id = v_p1_id THEN
      v_p1_lives := GREATEST(0, v_p1_lives - 1);
    ELSE
      v_p2_lives := GREATEST(0, v_p2_lives - 1);
    END IF;

    v_scores := COALESCE(v_state->'scores', jsonb_build_object(v_p1_id::text, 0, v_p2_id::text, 0));
    v_opp_score := COALESCE((v_scores->>v_winner_id::text)::int, 0) + 1;
    v_scores := jsonb_set(v_scores, ARRAY[v_winner_id::text], to_jsonb(v_opp_score));

    v_is_game_over := (v_p1_lives <= 0 OR v_p2_lives <= 0);

    IF v_is_game_over THEN
      v_new_state := v_state || jsonb_build_object(
        'status', 'MATCH_ENDED',
        'phase', 'match_ended',
        'isGameOver', true,
        'matchWinner', CASE WHEN v_winner_id = v_p1_id THEN 'PLAYER1' ELSE 'PLAYER2' END,
        'winnerUserId', v_winner_id,
        'player1Lives', v_p1_lives,
        'player2Lives', v_p2_lives,
        'lives', jsonb_build_object(v_p1_id::text, v_p1_lives, v_p2_id::text, v_p2_lives),
        'scores', v_scores,
        'currentTurnUserId', NULL::uuid,
        'turnUserId', NULL::uuid,
        'timeoutUserId', v_loser_id,
        'abandonedBy', v_loser_id
      );

      UPDATE public.game_sessions
      SET current_state = v_new_state,
          status = 'FINISHED'::session_status_enum,
          winner_user_id = v_winner_id,
          current_turn_user_id = NULL,
          turn_deadline_at = NULL,
          turn_expires_at = NULL,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = p_session_id;

      UPDATE public.game_session_secrets
      SET secret_state = jsonb_set(COALESCE(secret_state, '{}'::jsonb), '{rps_choices}', '{}'::jsonb),
          updated_at = NOW()
      WHERE session_id = p_session_id;

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
        'round', v_curr_round + 1,
        'phase', 'selecting',
        'status', 'ROUND_COMMIT',
        'player1Choice', NULL::text,
        'player2Choice', NULL::text,
        'roundWinner', NULL::text,
        'roundWinnerUserId', NULL::uuid,
        'player1Lives', v_p1_lives,
        'player2Lives', v_p2_lives,
        'lives', jsonb_build_object(v_p1_id::text, v_p1_lives, v_p2_id::text, v_p2_lives),
        'currentTurnUserId', NULL::uuid,
        'turnUserId', NULL::uuid,
        'playerChoices', jsonb_build_object(
          v_p1_id::text, jsonb_build_object('committed', false),
          v_p2_id::text, jsonb_build_object('committed', false)
        ),
        'scores', v_scores,
        'lastRoundResult', 'TIMEOUT_AWARD',
        'lastRoundWinner', v_winner_id,
        'timeoutUserId', v_loser_id,
        'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
      );

      UPDATE public.game_sessions
      SET current_state = v_new_state,
          current_turn_user_id = NULL,
          turn_deadline_at = v_new_deadline,
          turn_expires_at = v_new_deadline,
          updated_at = NOW()
      WHERE id = p_session_id;

      UPDATE public.game_session_secrets
      SET secret_state = jsonb_set(COALESCE(secret_state, '{}'::jsonb), '{rps_choices}', '{}'::jsonb),
          updated_at = NOW()
      WHERE session_id = p_session_id;

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

  v_idempotency_key := 'to_' || substr(p_session_id::TEXT, 1, 8) || '_' || substr(v_turn_user_id::TEXT, 1, 8) || '_' || md5(p_session_id::TEXT || '_' || v_turn_user_id::TEXT || '_' || COALESCE(v_session.turn_deadline_at::TEXT, '0'));

  -- SUB-RAMA A: TIC TAC TOE / LA VIEJA
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
        v_idempotency_key
      ) INTO v_settle_result;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'MATCH_CONCLUDED_TIMEOUT',
        'winnerUserId', v_next_turn_user_id,
        'timeoutUserId', v_turn_user_id,
        'settlement', v_settle_result
      );
    ELSE
      v_opp_score := v_opp_score + 1;
      v_scores := jsonb_set(v_scores, ARRAY[v_next_turn_user_id::TEXT], to_jsonb(v_opp_score));

      v_state := v_state || jsonb_build_object(
        'round', v_curr_round + 1,
        'phase', 'playing',
        'board', jsonb_build_array(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        'winningLine', NULL,
        'scores', v_scores,
        'lives', v_lives,
        'turnUserId', v_next_turn_user_id,
        'currentTurnUserId', v_next_turn_user_id,
        'turnExpiresAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
      );

      UPDATE public.game_sessions
      SET current_state = v_state,
          current_turn_user_id = v_next_turn_user_id,
          turn_deadline_at = v_new_deadline,
          turn_expires_at = v_new_deadline,
          updated_at = NOW()
      WHERE id = p_session_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'ROUND_AWARDED_TIMEOUT',
        'winnerUserId', v_next_turn_user_id,
        'timeoutUserId', v_turn_user_id,
        'newRound', v_curr_round + 1,
        'currentTurnUserId', v_next_turn_user_id,
        'turnDeadlineAt', v_new_deadline
      );
    END IF;
  END IF;

  -- SUB-RAMA B: ATRAPAÍTO CRIOLLO
  IF v_game_type_str IN ('ATRAPAITO', 'ATRAPAITO_CRIOLLO') THEN
    v_curr_color := COALESCE(v_state->>'activePlayerColor', 'RED');
    IF v_curr_color = 'RED' THEN
      v_next_color := 'BLUE';
    ELSE
      v_next_color := 'RED';
    END IF;

    v_state := v_state || jsonb_build_object(
      'currentTurnUserId', v_next_turn_user_id,
      'turnUserId', v_next_turn_user_id,
      'activePlayerColor', v_next_color,
      'turnExpiresAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
    );

    UPDATE public.game_sessions
    SET current_state = v_state,
        current_turn_user_id = v_next_turn_user_id,
        turn_deadline_at = v_new_deadline,
        turn_expires_at = v_new_deadline,
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'ATRAPAITO_TURN_ROTATED',
      'expiredUserId', v_turn_user_id,
      'nextTurnUserId', v_next_turn_user_id,
      'nextColor', v_next_color,
      'turnDeadlineAt', v_new_deadline
    );
  END IF;

  -- SUB-RAMA C: PARCHÍS VENEZOLANO
  IF v_game_type_str IN ('PARCHIS', 'PARCHIS_VENEZOLANO', 'LUDO') THEN
    v_parchis_players := v_state->'players';
    v_parchis_next_color := NULL;

    IF jsonb_typeof(v_parchis_players) = 'array' THEN
      FOR v_i IN 0..(jsonb_array_length(v_parchis_players) - 1) LOOP
        IF (v_parchis_players->v_i->>'userId')::UUID = v_next_turn_user_id THEN
          v_parchis_next_color := v_parchis_players->v_i->>'color';
          EXIT;
        END IF;
      END LOOP;
    END IF;

    v_state := v_state || jsonb_build_object(
      'currentTurnUserId', v_next_turn_user_id,
      'turnUserId', v_next_turn_user_id,
      'currentTurn', v_next_turn_user_id,
      'activePlayerColor', COALESCE(v_parchis_next_color, v_state->>'activePlayerColor'),
      'hasRolled', false,
      'dice', '[]'::jsonb,
      'turnExpiresAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
    );

    UPDATE public.game_sessions
    SET current_state = v_state,
        current_turn_user_id = v_next_turn_user_id,
        turn_deadline_at = v_new_deadline,
        turn_expires_at = v_new_deadline,
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'PARCHIS_TURN_ROTATED',
      'expiredUserId', v_turn_user_id,
      'nextTurnUserId', v_next_turn_user_id,
      'nextColor', v_parchis_next_color,
      'turnDeadlineAt', v_new_deadline
    );
  END IF;

  -- SUB-RAMA D: DOMINÓ, TRUCO, AJEDREZ, DAMAS, UNA OLLA
  v_state := v_state || jsonb_build_object(
    'currentTurnUserId', v_next_turn_user_id,
    'turnUserId', v_next_turn_user_id,
    'turnExpiresAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
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

-- Asegurar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure(uuid) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
