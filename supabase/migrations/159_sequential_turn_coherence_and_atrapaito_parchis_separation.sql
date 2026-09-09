-- ==============================================================================
-- RASPANDO LA OLLA 🇻🇪 / PulsoPLAY — MIGRACIÓN 159
-- DESACOPLAMIENTO DEFINITIVO ATRAPAÍTO VS PARCHÍS & COHERENCIA DE TURNOS SECUENCIALES
-- ==============================================================================
-- 1. Agrega el tipo de juego canónico 'PARCHIS' a game_type_enum.
-- 2. Actualiza fn_normalize_game_type_enum para reconocer 'parchis' y 'ludo'.
-- 3. Actualiza expire_game_turn_secure(p_session_id uuid) con coherencia estricta:
--    - En Atrapaíto Criollo: alterna el color 'turn' ('BLUE' <-> 'RED') y 'currentTurn'.
--    - En Parchís: rota 'currentTurnUserId', 'turnUserId' y 'turnDeadlineAt'.
--    - En Dominó, Truco, Ajedrez y Damas: rota 'currentTurnUserId', sincroniza
--      turn_deadline_at / turn_expires_at e inserta registro en game_actions.
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
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- 2. NORMALIZACIÓN DE TIPOS DE JUEGO
CREATE OR REPLACE FUNCTION public.fn_normalize_game_type_enum(p_input TEXT)
RETURNS game_type_enum
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF p_input IS NULL THEN
    RAISE EXCEPTION 'INVALID_GAME_TYPE: El tipo de juego no puede ser nulo';
  END IF;

  v_clean := lower(trim(p_input));

  CASE v_clean
    WHEN 'domino_venezolano', 'domino', 'dominoes' THEN
      RETURN 'DOMINO_VENEZOLANO'::game_type_enum;
    WHEN 'truco_venezolano', 'truco' THEN
      RETURN 'TRUCO_VENEZOLANO'::game_type_enum;
    WHEN 'tic_tac_toe', 'tres_en_raya', '3_en_raya', 'tictactoe' THEN
      RETURN 'TRES_EN_RAYA'::game_type_enum;
    WHEN 'rock_paper_scissors', 'piedra_papel_tijera', 'ppt', 'rps' THEN
      RETURN 'PIEDRA_PAPEL_TIJERA'::game_type_enum;
    WHEN 'checkers', 'damas' THEN
      RETURN 'DAMAS'::game_type_enum;
    WHEN 'bingo', 'bingo_online' THEN
      RETURN 'BINGO'::game_type_enum;
    WHEN 'polla_venezolana', 'polla', 'quiniela' THEN
      RETURN 'POLLA_VENEZOLANA'::game_type_enum;
    WHEN 'atrapaito', 'atrapaito_criollo', 'atrapa_al_ladron' THEN
      RETURN 'ATRAPAITO'::game_type_enum;
    WHEN 'parchis', 'parchis_venezolano', 'ludo' THEN
      RETURN 'PARCHIS'::game_type_enum;
    ELSE
      BEGIN
        RETURN upper(trim(p_input))::game_type_enum;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_GAME_TYPE: Tipo de juego desconocido o no soportado: %', p_input;
      END;
  END CASE;
END;
$$;

-- 3. EXPIRE_GAME_TURN_SECURE CON COHERENCIA MULTIJUGADOR Y DESACOPLAMIENTO ATRAPAÍTO / PARCHÍS
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
  v_opponent_id UUID := NULL;
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
  -- CASO ESPECIAL: PIEDRA, PAPEL O TIJERA (Juego simultáneo Commit-Reveal)
  -- =========================================================================
  IF v_game_type_str IN ('ROCK_PAPER_SCISSORS', 'RPS', 'PIEDRA_PAPEL_TIJERA') THEN
    IF COALESCE(v_state->>'status', '') NOT IN ('ROUND_COMMIT', 'selecting') AND
       COALESCE(v_state->>'phase', '') NOT IN ('ROUND_COMMIT', 'selecting') THEN
      RETURN jsonb_build_object('success', true, 'action', 'NOT_IN_COMMIT_PHASE', 'status', v_state->>'status');
    END IF;

    v_curr_round := COALESCE((v_state->>'roundNumber')::int, (v_state->>'round')::int, 1);
    v_idempotency_key := 'rps_timeout_' || p_session_id::text || '_rnd_' || v_curr_round::text;

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
  -- JUEGOS SECUENCIALES TRADICIONALES
  -- =========================================================================
  v_turn_user_id := COALESCE(
    v_session.current_turn_user_id,
    (v_state->>'turnUserId')::UUID,
    (v_state->>'currentTurnUserId')::UUID,
    (v_state->>'currentTurn')::UUID
  );

  IF v_turn_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_TURN');
  END IF;

  IF v_game_type_str = '' THEN
    v_game_type_str := 'GENERIC';
  END IF;

  -- Resolver lista ordenada de jugadores desde game_table_players
  SELECT jsonb_agg(user_id ORDER BY seat_number ASC, joined_at ASC)
  INTO v_player_order
  FROM public.game_table_players
  WHERE table_id = v_session.table_id
    AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED');

  v_player_count := COALESCE(jsonb_array_length(v_player_order), 0);

  IF v_player_count >= 2 THEN
    FOR v_i IN 0..(v_player_count - 1) LOOP
      IF (v_player_order->>v_i)::UUID = v_turn_user_id THEN
        v_opponent_id := (v_player_order->>((v_i + 1) % v_player_count))::UUID;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_opponent_id IS NULL THEN
    SELECT user_id INTO v_opponent_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id != v_turn_user_id
      AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  v_scores := COALESCE(v_state->'scores', jsonb_build_object(
    v_turn_user_id::TEXT, 0,
    COALESCE(v_opponent_id::TEXT, 'opp'), 0
  ));
  v_opp_score := COALESCE((v_scores->>v_opponent_id::TEXT)::INT, 0);
  v_target_wins := COALESCE((v_state->>'targetWins')::INT, 3);
  v_curr_round := COALESCE((v_state->>'round')::INT, 1);
  v_duration := COALESCE(v_session.turn_duration_seconds, 30);
  v_new_deadline := NOW() + (v_duration || ' seconds')::INTERVAL;

  -- 1. TIC TAC TOE / LA VIEJA
  IF v_game_type_str IN ('TIC_TAC_TOE', 'TICTACTOE', 'LA_VIEJA', 'TRES_EN_RAYA') THEN
    v_lives := COALESCE(v_state->'lives', jsonb_build_object(
      v_turn_user_id::TEXT, 3,
      COALESCE(v_opponent_id::TEXT, 'opp'), 3
    ));
    v_curr_lives := GREATEST(0, COALESCE((v_lives->>v_turn_user_id::TEXT)::INT, 3) - 1);
    v_lives := jsonb_set(v_lives, ARRAY[v_turn_user_id::TEXT], to_jsonb(v_curr_lives));

    IF v_curr_lives <= 0 AND v_opponent_id IS NOT NULL THEN
      v_opp_score := v_target_wins;
      v_scores := jsonb_set(v_scores, ARRAY[v_opponent_id::TEXT], to_jsonb(v_opp_score));

      v_state := v_state || jsonb_build_object(
        'status', 'FINISHED',
        'phase', 'match_ended',
        'isGameOver', true,
        'winnerUserId', v_opponent_id,
        'scores', v_scores,
        'lives', v_lives,
        'abandonedBy', v_turn_user_id,
        'timeoutUserId', v_turn_user_id
      );

      UPDATE public.game_sessions
      SET current_state = v_state,
          status = 'FINISHED'::session_status_enum,
          winner_user_id = v_opponent_id,
          turn_deadline_at = NULL,
          turn_expires_at = NULL,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = p_session_id;

      SELECT public.universal_settle_game_session(
        p_session_id,
        ARRAY[v_opponent_id],
        NULL::INT,
        'timeout_ttt_loss_' || p_session_id::TEXT || '_' || v_turn_user_id::TEXT
      ) INTO v_settle_result;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'MATCH_CONCLUDED_TIMEOUT',
        'winnerUserId', v_opponent_id,
        'timeoutUserId', v_turn_user_id,
        'settlement', v_settle_result
      );
    ELSE
      v_state := v_state || jsonb_build_object(
        'currentTurnUserId', v_opponent_id,
        'turnUserId', v_opponent_id,
        'turnDeadline', v_new_deadline,
        'lives', v_lives,
        'timeoutUserId', v_turn_user_id
      );

      UPDATE public.game_sessions
      SET current_state = v_state,
          current_turn_user_id = v_opponent_id,
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
          'nextTurnUserId', v_opponent_id,
          'remainingLives', v_curr_lives,
          'turnDeadline', v_new_deadline
        ),
        true,
        md5(v_state::TEXT),
        'turn_expired_' || p_session_id::TEXT || '_' || v_turn_user_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'TURN_ROTATED_PENALTY',
        'expiredUserId', v_turn_user_id,
        'nextTurnUserId', v_opponent_id,
        'remainingLives', v_curr_lives,
        'turnDeadlineAt', v_new_deadline
      );
    END IF;
  END IF;

  -- 2. ATRAPAÍTO CRIOLLO (Canicas, Muros, Tablero 15x8)
  IF v_game_type_str IN ('ATRAPAITO', 'ATRAPAITO_CRIOLLO') THEN
    v_curr_color := UPPER(COALESCE(v_state->>'turn', 'BLUE'));
    IF v_curr_color = 'BLUE' THEN
      v_next_color := 'RED';
    ELSE
      v_next_color := 'BLUE';
    END IF;

    v_state := v_state || jsonb_build_object(
      'currentTurnUserId', v_opponent_id,
      'turnUserId', v_opponent_id,
      'currentTurn', v_opponent_id,
      'turn', v_next_color,
      'turnDeadline', v_new_deadline,
      'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
    );

    UPDATE public.game_sessions
    SET current_state = v_state,
        current_turn_user_id = v_opponent_id,
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
        'nextTurnUserId', v_opponent_id,
        'nextColor', v_next_color,
        'turnDeadline', v_new_deadline
      ),
      true,
      md5(v_state::TEXT),
      'turn_expired_atrapaito_' || p_session_id::TEXT || '_' || v_turn_user_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'TURN_ROTATED_ATRAPAITO',
      'expiredUserId', v_turn_user_id,
      'nextTurnUserId', v_opponent_id,
      'nextColor', v_next_color,
      'turnDeadlineAt', v_new_deadline
    );
  END IF;

  -- 3. PARCHÍS / LUDO VENEZOLANO
  IF v_game_type_str IN ('PARCHIS', 'PARCHIS_VENEZOLANO', 'LUDO') THEN
    v_state := v_state || jsonb_build_object(
      'currentTurnUserId', v_opponent_id,
      'turnUserId', v_opponent_id,
      'turnDeadline', v_new_deadline,
      'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
    );

    UPDATE public.game_sessions
    SET current_state = v_state,
        current_turn_user_id = v_opponent_id,
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
        'nextTurnUserId', v_opponent_id,
        'turnDeadline', v_new_deadline
      ),
      true,
      md5(v_state::TEXT),
      'turn_expired_parchis_' || p_session_id::TEXT || '_' || v_turn_user_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'TURN_ROTATED_PARCHIS',
      'expiredUserId', v_turn_user_id,
      'nextTurnUserId', v_opponent_id,
      'turnDeadlineAt', v_new_deadline
    );
  END IF;

  -- 4. DEMÁS JUEGOS SECUENCIALES (DOMINO_VENEZOLANO, TRUCO_VENEZOLANO, DAMAS, CHESS, ETC.)
  v_state := v_state || jsonb_build_object(
    'currentTurnUserId', v_opponent_id,
    'turnUserId', v_opponent_id,
    'turnDeadline', v_new_deadline,
    'turnDeadlineAt', EXTRACT(EPOCH FROM v_new_deadline) * 1000
  );

  UPDATE public.game_sessions
  SET current_state = v_state,
      current_turn_user_id = v_opponent_id,
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
      'nextTurnUserId', v_opponent_id,
      'turnDeadline', v_new_deadline
    ),
    true,
    md5(v_state::TEXT),
    'turn_expired_seq_' || p_session_id::TEXT || '_' || v_turn_user_id::TEXT || '_' || EXTRACT(EPOCH FROM NOW())::TEXT
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'TURN_ROTATED',
    'expiredUserId', v_turn_user_id,
    'nextTurnUserId', v_opponent_id,
    'turnDeadlineAt', v_new_deadline
  );
END;
$function$;

-- 4. PERMISOS Y RECARGA DE ESQUEMA
GRANT EXECUTE ON FUNCTION public.fn_normalize_game_type_enum(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure(uuid) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
