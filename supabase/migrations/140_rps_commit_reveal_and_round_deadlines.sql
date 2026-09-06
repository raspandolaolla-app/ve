-- ==============================================================================
-- MIGRACIÓN 140: ARQUITECTURA ATÓMICA COMMIT-REVEAL Y ROUND DEADLINES PARA RPS
-- Proyecto: RASPANDO LA OLLA 🇻🇪 / PulsoPLAY
-- ==============================================================================
-- 1. Función RPC public.submit_rps_choice_secure:
--    - Garantiza que las elecciones permanezcan en game_session_secrets hasta que AMBOS jueguen.
--    - En game_sessions.current_state solo se expone { committed: true } sin revelar la jugada.
--    - Cuando ambos jugadores han hecho commit, revela simultáneamente y calcula vidas/ganador.
--    - Elimina cualquier dependencia de turnos secuenciales (current_turn_user_id = NULL).
-- 2. Función RPC public.next_rps_round_secure:
--    - Reinicia la ronda de forma atómica para ambos jugadores tras el tiempo de reveal.
-- 3. Actualización de public.process_expired_turns():
--    - Evalúa ROUND_DEADLINE para RPS: si un jugador eligió y el rival no, gana el que eligió.
-- ==============================================================================

-- Asegurar que la tabla game_session_secrets tenga las columnas requeridas
CREATE TABLE IF NOT EXISTS public.game_session_secrets (
  session_id UUID PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  secret_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  server_seed VARCHAR(64) NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 1. RPC: SUBMIT_RPS_CHOICE_SECURE (COMMIT - REVEAL SERVER AUTHORITATIVE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.submit_rps_choice_secure(
  p_session_id UUID,
  p_choice VARCHAR(20)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_norm_choice VARCHAR(20);
  v_session RECORD;
  v_table RECORD;
  v_secret_row RECORD;
  v_p1_id TEXT;
  v_p2_id TEXT;
  v_secret_choices JSONB;
  v_c1 TEXT;
  v_c2 TEXT;
  v_round_winner TEXT;
  v_round_winner_user_id UUID;
  v_match_winner TEXT;
  v_winner_user_id UUID;
  v_is_game_over BOOLEAN := false;
  v_p1_lives INT;
  v_p2_lives INT;
  v_curr_round INT;
  v_history_entry JSONB;
  v_new_history JSONB;
  v_new_state JSONB;
  v_player_choices JSONB;
  v_next_seq INT := 1;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED: Debes iniciar sesión');
  END IF;

  v_norm_choice := UPPER(TRIM(p_choice));
  IF v_norm_choice NOT IN ('ROCK', 'PAPER', 'SCISSORS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHOICE: La jugada debe ser ROCK, PAPER o SCISSORS');
  END IF;

  -- 1. Bloquear la sesión para evitar condiciones de carrera
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF v_session.status::text NOT IN ('ACTIVE', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_ACTIVE');
  END IF;

  -- 2. Asegurar o bloquear registro en game_session_secrets
  SELECT * INTO v_secret_row
  FROM public.game_session_secrets
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.game_session_secrets (session_id, secret_state, server_seed)
    VALUES (p_session_id, '{}'::jsonb, encode(gen_random_bytes(32), 'hex'))
    RETURNING * INTO v_secret_row;
  END IF;

  -- 3. Identificar Jugadores 1 y 2
  v_p1_id := COALESCE(
    v_session.current_state->>'player1Id',
    (SELECT user_id::text FROM public.game_table_players WHERE table_id = v_session.table_id ORDER BY seat_number ASC, created_at ASC LIMIT 1)
  );
  v_p2_id := COALESCE(
    v_session.current_state->>'player2Id',
    (SELECT user_id::text FROM public.game_table_players WHERE table_id = v_session.table_id AND user_id::text != v_p1_id LIMIT 1)
  );

  IF v_user_id::text != v_p1_id AND v_user_id::text != v_p2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_A_PLAYER_IN_THIS_MATCH');
  END IF;

  -- Validar fase de compromiso
  IF COALESCE(v_session.current_state->>'status', 'ROUND_COMMIT') NOT IN ('ROUND_COMMIT', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROUND_NOT_ACCEPTING_CHOICES');
  END IF;

  -- 4. Validar si el jugador ya eligió en esta ronda (Idempotencia y prevención de trampas)
  v_secret_choices := COALESCE(v_secret_row.secret_state->'rps_choices', '{}'::jsonb);
  IF (v_secret_choices ? v_user_id::text AND v_secret_choices->>v_user_id::text IS NOT NULL) OR
     (COALESCE((v_session.current_state->'playerChoices'->(v_user_id::text)->>'committed')::boolean, false) IS TRUE) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_COMMITTED',
      'message', 'Ya has enviado tu jugada para esta ronda'
    );
  END IF;

  -- 5. Guardar la jugada privada en game_session_secrets
  v_secret_choices := jsonb_set(v_secret_choices, ARRAY[v_user_id::text], to_jsonb(v_norm_choice));

  UPDATE public.game_session_secrets
  SET secret_state = jsonb_set(secret_state, '{rps_choices}', v_secret_choices),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- 5. Verificar si ambos jugadores ya han enviado su compromiso
  v_c1 := v_secret_choices->>v_p1_id;
  v_c2 := v_secret_choices->>v_p2_id;

  IF v_c1 IS NOT NULL AND v_c2 IS NOT NULL THEN
    -- =========================================================================
    -- ¡AMBOS JUGADORES HAN ELEGIDO! REVELACIÓN SIMULTÁNEA Y CÁLCULO DE RESULTADO
    -- =========================================================================
    IF v_c1 = v_c2 THEN
      v_round_winner := 'DRAW';
      v_round_winner_user_id := NULL;
    ELSIF (v_c1 = 'ROCK' AND v_c2 = 'SCISSORS') OR
          (v_c1 = 'PAPER' AND v_c2 = 'ROCK') OR
          (v_c1 = 'SCISSORS' AND v_c2 = 'PAPER') THEN
      v_round_winner := 'PLAYER1';
      v_round_winner_user_id := v_p1_id::uuid;
    ELSE
      v_round_winner := 'PLAYER2';
      v_round_winner_user_id := v_p2_id::uuid;
    END IF;

    -- Vidas
    v_p1_lives := COALESCE((v_session.current_state->>'player1Lives')::int, 3);
    v_p2_lives := COALESCE((v_session.current_state->>'player2Lives')::int, 3);

    IF v_round_winner = 'PLAYER1' THEN
      v_p2_lives := GREATEST(0, v_p2_lives - 1);
    ELSIF v_round_winner = 'PLAYER2' THEN
      v_p1_lives := GREATEST(0, v_p1_lives - 1);
    END IF;

    -- Fin de partida
    IF v_p1_lives <= 0 THEN
      v_match_winner := 'PLAYER2';
      v_winner_user_id := v_p2_id::uuid;
      v_is_game_over := true;
    ELSIF v_p2_lives <= 0 THEN
      v_match_winner := 'PLAYER1';
      v_winner_user_id := v_p1_id::uuid;
      v_is_game_over := true;
    ELSE
      v_match_winner := NULL;
      v_winner_user_id := NULL;
      v_is_game_over := false;
    END IF;

    v_curr_round := COALESCE((v_session.current_state->>'roundNumber')::int, (v_session.current_state->>'round')::int, 1);

    v_history_entry := jsonb_build_object(
      'roundNumber', v_curr_round,
      'player1Choice', v_c1,
      'player2Choice', v_c2,
      'winner', v_round_winner,
      'winnerUserId', v_round_winner_user_id,
      'timestamp', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)
    );

    v_new_history := COALESCE(v_session.current_state->'history', '[]'::jsonb) || v_history_entry;

    v_new_state := v_session.current_state;
    v_new_state := jsonb_set(v_new_state, '{player1Choice}', to_jsonb(v_c1));
    v_new_state := jsonb_set(v_new_state, '{player2Choice}', to_jsonb(v_c2));
    v_new_state := jsonb_set(v_new_state, '{player1Lives}', to_jsonb(v_p1_lives));
    v_new_state := jsonb_set(v_new_state, '{player2Lives}', to_jsonb(v_p2_lives));
    v_new_state := jsonb_set(v_new_state, '{lives}', jsonb_build_object(v_p1_id, v_p1_lives, v_p2_id, v_p2_lives));
    v_new_state := jsonb_set(v_new_state, '{roundWinner}', to_jsonb(v_round_winner));
    v_new_state := jsonb_set(v_new_state, '{roundWinnerUserId}', to_jsonb(v_round_winner_user_id));
    v_new_state := jsonb_set(v_new_state, '{matchWinner}', to_jsonb(v_match_winner));
    v_new_state := jsonb_set(v_new_state, '{winnerUserId}', to_jsonb(v_winner_user_id));
    v_new_state := jsonb_set(v_new_state, '{status}', to_jsonb(CASE WHEN v_is_game_over THEN 'MATCH_ENDED' ELSE 'ROUND_REVEAL' END));
    v_new_state := jsonb_set(v_new_state, '{phase}', to_jsonb(CASE WHEN v_is_game_over THEN 'match_ended' ELSE 'round_result' END));
    v_new_state := jsonb_set(v_new_state, '{history}', v_new_history);
    v_new_state := jsonb_set(v_new_state, '{currentTurnUserId}', 'null'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{turnUserId}', 'null'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{playerChoices}', jsonb_build_object(
      v_p1_id, jsonb_build_object('committed', true, 'choice', v_c1),
      v_p2_id, jsonb_build_object('committed', true, 'choice', v_c2)
    ));

    -- Actualizar sesión pública
    UPDATE public.game_sessions
    SET current_state = v_new_state,
        current_turn_user_id = NULL,
        status = CASE WHEN v_is_game_over THEN 'FINISHED'::session_status_enum ELSE 'ACTIVE'::session_status_enum END,
        winner_user_id = v_winner_user_id,
        turn_expires_at = CASE WHEN v_is_game_over THEN NULL ELSE NOW() + INTERVAL '15 seconds' END,
        turn_deadline_at = CASE WHEN v_is_game_over THEN NULL ELSE NOW() + INTERVAL '15 seconds' END,
        ended_at = CASE WHEN v_is_game_over THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Si la partida terminó y hay ganador, cerrar mesa
    IF v_is_game_over THEN
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          updated_at = NOW()
      WHERE id = v_session.table_id;
    END IF;

    -- Limpiar elecciones secretas para la próxima ronda
    UPDATE public.game_session_secrets
    SET secret_state = jsonb_set(secret_state, '{rps_choices}', '{}'::jsonb),
        updated_at = NOW()
    WHERE session_id = p_session_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', CASE WHEN v_is_game_over THEN 'MATCH_ENDED' ELSE 'ROUND_REVEAL' END,
      'isGameOver', v_is_game_over,
      'winnerUserId', v_winner_user_id,
      'roundWinner', v_round_winner,
      'roundWinnerUserId', v_round_winner_user_id,
      'player1Choice', v_c1,
      'player2Choice', v_c2,
      'bothChosen', true
    );

  ELSE
    -- =========================================================================
    -- SOLO UNO HA ELEGIDO: REGISTRAR COMMIT PROTEGIENDO EL SECRETO
    -- =========================================================================
    v_player_choices := COALESCE(v_session.current_state->'playerChoices', '{}'::jsonb);
    v_player_choices := jsonb_set(
      v_player_choices,
      ARRAY[v_user_id::text],
      jsonb_build_object('committed', true)
    );

    v_new_state := v_session.current_state;
    v_new_state := jsonb_set(v_new_state, '{playerChoices}', v_player_choices);
    v_new_state := jsonb_set(v_new_state, '{player1Choice}', 'null'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{player2Choice}', 'null'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{status}', '"ROUND_COMMIT"'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{phase}', '"selecting"'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{currentTurnUserId}', 'null'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{turnUserId}', 'null'::jsonb);

    UPDATE public.game_sessions
    SET current_state = v_new_state,
        current_turn_user_id = NULL,
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'ROUND_COMMIT',
      'isGameOver', false,
      'bothChosen', false,
      'committed', true
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rps_choice_secure(UUID, VARCHAR) TO authenticated, anon, service_role;

-- ==============================================================================
-- 2. RPC: NEXT_RPS_ROUND_SECURE (REINICIO ATÓMICO DE RONDA)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.next_rps_round_secure(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_curr_round INT;
  v_new_round INT;
  v_p1_id TEXT;
  v_p2_id TEXT;
  v_new_state JSONB;
BEGIN
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF v_session.status::text NOT IN ('ACTIVE', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_ACTIVE');
  END IF;

  -- Solo avanzar si estaba en fase de resultado de ronda
  IF COALESCE(v_session.current_state->>'status', '') != 'ROUND_REVEAL' AND
     COALESCE(v_session.current_state->>'phase', '') != 'round_result' THEN
    RETURN jsonb_build_object('success', true, 'message', 'ALREADY_ADVANCED');
  END IF;

  v_curr_round := COALESCE((v_session.current_state->>'roundNumber')::int, (v_session.current_state->>'round')::int, 1);
  v_new_round := v_curr_round + 1;

  v_p1_id := COALESCE(v_session.current_state->>'player1Id', '');
  v_p2_id := COALESCE(v_session.current_state->>'player2Id', '');

  v_new_state := v_session.current_state;
  v_new_state := jsonb_set(v_new_state, '{roundNumber}', to_jsonb(v_new_round));
  v_new_state := jsonb_set(v_new_state, '{round}', to_jsonb(v_new_round));
  v_new_state := jsonb_set(v_new_state, '{player1Choice}', 'null'::jsonb);
  v_new_state := jsonb_set(v_new_state, '{player2Choice}', 'null'::jsonb);
  v_new_state := jsonb_set(v_new_state, '{roundWinner}', 'null'::jsonb);
  v_new_state := jsonb_set(v_new_state, '{roundWinnerUserId}', 'null'::jsonb);
  v_new_state := jsonb_set(v_new_state, '{status}', '"ROUND_COMMIT"'::jsonb);
  v_new_state := jsonb_set(v_new_state, '{phase}', '"selecting"'::jsonb);
  v_new_state := jsonb_set(v_new_state, '{currentTurnUserId}', 'null'::jsonb);
  v_new_state := jsonb_set(v_new_state, '{turnUserId}', 'null'::jsonb);
  v_new_state := jsonb_set(v_new_state, '{playerChoices}', jsonb_build_object(
    v_p1_id, jsonb_build_object('committed', false),
    v_p2_id, jsonb_build_object('committed', false)
  ));

  UPDATE public.game_sessions
  SET current_state = v_new_state,
      current_turn_user_id = NULL,
      turn_expires_at = NOW() + INTERVAL '15 seconds',
      turn_deadline_at = NOW() + INTERVAL '15 seconds',
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Limpiar cualquier secreto residual
  UPDATE public.game_session_secrets
  SET secret_state = jsonb_set(secret_state, '{rps_choices}', '{}'::jsonb),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object('success', true, 'round', v_new_round);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_rps_round_secure(UUID) TO authenticated, anon, service_role;

-- ==============================================================================
-- 3. ACTUALIZACIÓN DE PROCESS_EXPIRED_TURNS: ROUND_DEADLINE PARA RPS
-- ==============================================================================
-- Se elimina primero si existiera con otra firma para garantizar RETURNS VOID limpia
DROP FUNCTION IF EXISTS public.process_expired_turns();

CREATE OR REPLACE FUNCTION public.process_expired_turns()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_expired_session RECORD;
  v_opponent_id UUID;
  v_entry_fee NUMERIC(14,2);
  v_next_seq INT := 1;
  v_timeout_idempotency TEXT;
  -- Variables RPS
  v_p1_id UUID;
  v_p2_id UUID;
  v_secret_choices JSONB;
  v_p1_committed BOOLEAN;
  v_p2_committed BOOLEAN;
  v_rps_winner UUID;
  v_rps_loser UUID;
  v_curr_round INT;
BEGIN
  -- A. JUEGOS SECUENCIALES (current_turn_user_id NOT NULL)
  FOR v_expired_session IN 
    SELECT gs.id, gs.table_id, gs.current_turn_user_id, gs.turn_expires_at, gt.game_type, gt.entry_fee
    FROM public.game_sessions gs
    JOIN public.game_tables gt ON gt.id = gs.table_id
    WHERE gs.status::text IN ('ACTIVE', 'active', 'IN_PROGRESS', 'in_progress', 'STARTING', 'starting', 'READY', 'ready')
      AND gs.turn_expires_at IS NOT NULL
      AND gs.turn_expires_at < NOW()
      AND gs.current_turn_user_id IS NOT NULL
      AND LOWER(gt.game_type::text) NOT IN ('rps', 'rock_paper_scissors')
    FOR UPDATE OF gs SKIP LOCKED
  LOOP
    IF LOWER(v_expired_session.game_type::text) IN ('atrapaito', 'chess', 'checkers', 'tictactoe', 'tic_tac_toe', 'domino', 'domino_venezolano', 'truco', 'truco_venezolano') THEN
      SELECT user_id INTO v_opponent_id
      FROM public.game_table_players
      WHERE table_id = v_expired_session.table_id 
        AND user_id != v_expired_session.current_turn_user_id 
        AND status::text NOT IN ('ABANDONED', 'LEFT')
      LIMIT 1;

      IF v_opponent_id IS NOT NULL THEN
        v_entry_fee := COALESCE(v_expired_session.entry_fee, 0.00);
        v_timeout_idempotency := 'seq_timeout_' || v_expired_session.id::text || '_' || v_expired_session.current_turn_user_id::text || '_' || EXTRACT(EPOCH FROM v_expired_session.turn_expires_at)::bigint::text;

        BEGIN
          PERFORM public.settle_game_session(
            v_expired_session.id,
            ARRAY[v_opponent_id],
            NULL,
            v_timeout_idempotency
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
        
        UPDATE public.game_sessions
        SET status = 'FINISHED'::session_status_enum,
            winner_user_id = v_opponent_id,
            current_state = jsonb_set(
              COALESCE(current_state, '{}'::jsonb),
              '{winner}',
              '"OPPONENT_BY_ABANDON"'::jsonb
            ),
            ended_at = NOW(),
            updated_at = NOW()
        WHERE id = v_expired_session.id;

        UPDATE public.game_tables
        SET status = 'CLOSED'::table_status_enum,
            closed_at = NOW(),
            current_players_count = 0,
            updated_at = NOW()
        WHERE id = v_expired_session.table_id;

        BEGIN
          SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_seq
          FROM public.game_actions
          WHERE session_id = v_expired_session.id;

          INSERT INTO public.game_actions (
            session_id, user_id, sequence_number, action_type, payload, action_data,
            is_valid, server_state_hash, idempotency_key, created_at
          ) VALUES (
            v_expired_session.id,
            v_expired_session.current_turn_user_id,
            v_next_seq,
            'TIMEOUT_ABANDON',
            jsonb_build_object('reason', 'TURN_EXPIRED', 'winner_id', v_opponent_id),
            jsonb_build_object('reason', 'TURN_EXPIRED', 'winner_id', v_opponent_id),
            true, 'timeout_hash', v_timeout_idempotency, NOW()
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END IF;
  END LOOP;

  -- B. JUEGOS SIMULTÁNEOS (PIEDRA, PAPEL O TIJERA - ROUND DEADLINE)
  FOR v_expired_session IN 
    SELECT gs.id, gs.table_id, gs.current_state, gt.game_type, gt.entry_fee
    FROM public.game_sessions gs
    JOIN public.game_tables gt ON gt.id = gs.table_id
    WHERE gs.status::text IN ('ACTIVE', 'active')
      AND LOWER(gt.game_type::text) IN ('rps', 'rock_paper_scissors')
      AND gs.turn_expires_at IS NOT NULL
      AND gs.turn_expires_at < NOW()
    FOR UPDATE OF gs SKIP LOCKED
  LOOP
    BEGIN
      v_p1_id := (v_expired_session.current_state->>'player1Id')::uuid;
      v_p2_id := (v_expired_session.current_state->>'player2Id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_p1_id := NULL;
      v_p2_id := NULL;
    END;

    IF v_p1_id IS NOT NULL AND v_p2_id IS NOT NULL THEN
      -- Obtener secretos autoritativos
      SELECT secret_state->'rps_choices' INTO v_secret_choices
      FROM public.game_session_secrets
      WHERE session_id = v_expired_session.id;

      v_p1_committed := (v_secret_choices IS NOT NULL AND v_secret_choices ? v_p1_id::text AND v_secret_choices->>v_p1_id::text IS NOT NULL) OR
        COALESCE((v_expired_session.current_state->'playerChoices'->(v_p1_id::text)->>'committed')::boolean, false);
      v_p2_committed := (v_secret_choices IS NOT NULL AND v_secret_choices ? v_p2_id::text AND v_secret_choices->>v_p2_id::text IS NOT NULL) OR
        COALESCE((v_expired_session.current_state->'playerChoices'->(v_p2_id::text)->>'committed')::boolean, false);

      IF v_p1_committed AND NOT v_p2_committed THEN
        -- Jugador 1 eligió a tiempo, Jugador 2 agotó el tiempo de ronda -> Gana Jugador 1
        v_rps_winner := v_p1_id;
        v_rps_loser := v_p2_id;
      ELSIF v_p2_committed AND NOT v_p1_committed THEN
        -- Jugador 2 eligió a tiempo, Jugador 1 agotó el tiempo de ronda -> Gana Jugador 2
        v_rps_winner := v_p2_id;
        v_rps_loser := v_p1_id;
      ELSE
        -- Ambos agotaron el tiempo o ninguno eligió -> Cancelación con reembolso
        v_rps_winner := NULL;
        v_rps_loser := NULL;
      END IF;

      v_curr_round := COALESCE(
        (v_expired_session.current_state->>'roundNumber')::int,
        (v_expired_session.current_state->>'round')::int,
        1
      );
      v_timeout_idempotency := 'rps_timeout_' || v_expired_session.id::text || '_rnd_' || v_curr_round::text;

      IF v_rps_winner IS NOT NULL THEN
        -- Liquidar a favor del ganador con clave determinista única
        BEGIN
          PERFORM public.settle_game_session(
            v_expired_session.id,
            ARRAY[v_rps_winner],
            NULL,
            v_timeout_idempotency
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;

        UPDATE public.game_sessions
        SET status = 'FINISHED'::session_status_enum,
            winner_user_id = v_rps_winner,
            current_state = jsonb_set(
              COALESCE(current_state, '{}'::jsonb),
              '{winner}',
              '"OPPONENT_BY_ROUND_TIMEOUT"'::jsonb
            ),
            ended_at = NOW(),
            updated_at = NOW()
        WHERE id = v_expired_session.id;

        UPDATE public.game_tables
        SET status = 'CLOSED'::table_status_enum,
            closed_at = NOW(),
            current_players_count = 0,
            updated_at = NOW()
        WHERE id = v_expired_session.table_id;

      ELSE
        -- Ninguno eligió a tiempo: Cancelación y reembolso del 100% de los fondos retenidos
        BEGIN
          PERFORM public.settle_game_session(
            v_expired_session.id,
            ARRAY[]::uuid[],
            NULL,
            'rps_timeout_cancel_' || v_expired_session.id::text || '_rnd_' || v_curr_round::text
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;

        UPDATE public.game_sessions
        SET status = 'CANCELLED'::session_status_enum,
            winner_user_id = NULL,
            current_state = jsonb_set(
              COALESCE(current_state, '{}'::jsonb),
              '{winner}',
              '"CANCELLED_BY_ROUND_TIMEOUT"'::jsonb
            ),
            ended_at = NOW(),
            updated_at = NOW()
        WHERE id = v_expired_session.id;

        UPDATE public.game_tables
        SET status = 'CANCELLED'::table_status_enum,
            closed_at = NOW(),
            current_players_count = 0,
            updated_at = NOW()
        WHERE id = v_expired_session.table_id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_expired_turns() TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
