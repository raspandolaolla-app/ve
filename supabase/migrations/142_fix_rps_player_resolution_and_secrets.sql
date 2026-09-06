-- ==============================================================================
-- MIGRACIÓN 142: CORRECCIÓN DEFINITIVA DE RESOLUCIÓN DE JUGADORES EN RPS
-- Y RECONCILIACIÓN ESTRUCTURAL DE TABLAS (GAME_TABLE_PLAYERS / GAME_SESSION_SECRETS)
-- Proyecto: RASPANDO LA OLLA 🇻🇪 / PulsoPLAY
--
-- PROBLEMA IDENTIFICADO:
-- 1. En submit_rps_choice_secure y process_expired_turns se utilizaba la consulta:
--    SELECT user_id FROM public.game_table_players ORDER BY seat_number ASC, created_at ASC;
--    La columna `created_at` NO EXISTE en `game_table_players` (creada en migración 008
--    con la columna canónica `joined_at` y el orden de asientos `seat_number`).
--    Esto provocaba el error en producción: column "created_at" does not exist.
-- 2. Asegura que `public.game_sessions` disponga de la columna `updated_at`.
-- 3. Reconcilia de forma idempotente las columnas de `public.game_session_secrets`
--    (secret_state, server_seed, created_at, updated_at).
-- 4. Preserva el modelo COMMIT-REVEAL simultáneo de RPS (current_turn_user_id = NULL).
-- ==============================================================================

-- 1. ASEGURAR EXTENSIÓN PGCRYPTO Y ENLACE CANÓNICO
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'gen_random_bytes'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'extensions' AND p.proname = 'gen_random_bytes'
    ) THEN
      CREATE OR REPLACE FUNCTION public.gen_random_bytes(p_count integer)
      RETURNS bytea
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = extensions, public
      AS $func$
        SELECT extensions.gen_random_bytes(p_count);
      $func$;

      GRANT EXECUTE ON FUNCTION public.gen_random_bytes(integer) TO authenticated, anon, service_role, postgres;
    END IF;
  END IF;
END $$;

-- 2. RECONCILIACIÓN ESTRUCTURAL IDEMPOTENTE DE GAME_SESSIONS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.game_sessions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'turn_expires_at'
  ) THEN
    ALTER TABLE public.game_sessions ADD COLUMN turn_expires_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- 3. RECONCILIACIÓN ESTRUCTURAL IDEMPOTENTE DE GAME_SESSION_SECRETS
DO $$
BEGIN
  -- Asegurar tabla base si no existiera
  CREATE TABLE IF NOT EXISTS public.game_session_secrets (
    session_id UUID PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    secret_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    server_seed VARCHAR(64) NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Asegurar columnas si la tabla fue creada por migraciones históricas previas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_session_secrets' AND column_name = 'secret_state'
  ) THEN
    ALTER TABLE public.game_session_secrets ADD COLUMN secret_state JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_session_secrets' AND column_name = 'server_seed'
  ) THEN
    ALTER TABLE public.game_session_secrets ADD COLUMN server_seed VARCHAR(64) NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_session_secrets' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.game_session_secrets ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_session_secrets' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.game_session_secrets ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- 4. RPC CANÓNICA: SUBMIT_RPS_CHOICE_SECURE (RESOLUCIÓN DETERMINISTA SIN CREATED_AT)
CREATE OR REPLACE FUNCTION public.submit_rps_choice_secure(
  p_session_id UUID,
  p_choice VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_user_id UUID;
  v_norm_choice VARCHAR;
  v_session RECORD;
  v_secret_row RECORD;
  v_p1_id TEXT;
  v_p2_id TEXT;
  v_secret_choices JSONB;
  v_c1 TEXT;
  v_c2 TEXT;
  v_round_winner TEXT;
  v_round_winner_user_id UUID;
  v_p1_lives INT;
  v_p2_lives INT;
  v_match_winner TEXT;
  v_winner_user_id UUID;
  v_is_game_over BOOLEAN := false;
  v_new_state JSONB;
  v_history_entry JSONB;
  v_new_history JSONB;
  v_player_choices JSONB;
  v_curr_round INT;
  v_generated_seed VARCHAR(64);
BEGIN
  -- 1. Validar autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED');
  END IF;

  -- Normalizar y validar jugada
  v_norm_choice := UPPER(TRIM(p_choice));
  IF v_norm_choice NOT IN ('ROCK', 'PAPER', 'SCISSORS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHOICE', 'valid', ARRAY['ROCK', 'PAPER', 'SCISSORS']);
  END IF;

  -- 2. Obtener y bloquear la sesión de juego
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

  -- 3. Obtener o crear de forma segura el registro de secretos
  SELECT * INTO v_secret_row
  FROM public.game_session_secrets
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    BEGIN
      v_generated_seed := encode(extensions.gen_random_bytes(32), 'hex');
    EXCEPTION WHEN OTHERS THEN
      v_generated_seed := encode(public.gen_random_bytes(32), 'hex');
    END;

    INSERT INTO public.game_session_secrets (session_id, secret_state, server_seed)
    VALUES (p_session_id, '{}'::jsonb, v_generated_seed)
    RETURNING * INTO v_secret_row;
  END IF;

  -- 4. IDENTIFICAR JUGADORES 1 Y 2 DE FORMA CANÓNICA Y DETERMINISTA
  -- Prioridad 1: IDs registrados en el JSONB current_state de la partida
  v_p1_id := NULLIF(TRIM(v_session.current_state->>'player1Id'), '');
  v_p2_id := NULLIF(TRIM(v_session.current_state->>'player2Id'), '');

  -- Prioridad 2: Si falta player1Id, consultar game_table_players ordenado por seat_number y joined_at
  IF v_p1_id IS NULL THEN
    SELECT user_id::text INTO v_p1_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND status NOT IN ('LEFT')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  -- Prioridad 3: Si falta player2Id, consultar el siguiente asiento activo
  IF v_p2_id IS NULL THEN
    SELECT user_id::text INTO v_p2_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id::text != v_p1_id
      AND status NOT IN ('LEFT')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  -- Validar que ambos jugadores existen
  IF v_p1_id IS NULL OR v_p2_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_PLAYERS_IN_SESSION');
  END IF;

  -- Validar que el usuario actual pertenece a la partida
  IF v_user_id::text != v_p1_id AND v_user_id::text != v_p2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_A_PLAYER_IN_THIS_MATCH');
  END IF;

  -- Validar que estemos en fase de selección (ROUND_COMMIT / selecting)
  IF COALESCE(v_session.current_state->>'status', 'ROUND_COMMIT') NOT IN ('ROUND_COMMIT', 'selecting') AND
     COALESCE(v_session.current_state->>'phase', 'selecting') NOT IN ('ROUND_COMMIT', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROUND_NOT_ACCEPTING_CHOICES');
  END IF;

  -- 5. ANTI-DOUBLE-SUBMIT: Verificar si el jugador ya comprometió su jugada
  v_secret_choices := COALESCE(v_secret_row.secret_state->'rps_choices', '{}'::jsonb);
  IF (v_secret_choices ? v_user_id::text AND v_secret_choices->>v_user_id::text IS NOT NULL) OR
     (COALESCE((v_session.current_state->'playerChoices'->(v_user_id::text)->>'committed')::boolean, false) IS TRUE) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_COMMITTED',
      'message', 'Ya has enviado tu jugada para esta ronda'
    );
  END IF;

  -- 6. Guardar la jugada privada en game_session_secrets
  v_secret_choices := jsonb_set(v_secret_choices, ARRAY[v_user_id::text], to_jsonb(v_norm_choice));

  UPDATE public.game_session_secrets
  SET secret_state = jsonb_set(secret_state, '{rps_choices}', v_secret_choices),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- 7. Comprobar si ambos jugadores han comprometido su jugada
  v_c1 := v_secret_choices->>v_p1_id;
  v_c2 := v_secret_choices->>v_p2_id;

  IF v_c1 IS NOT NULL AND v_c2 IS NOT NULL THEN
    -- =========================================================================
    -- AMBOS JUGADORES HAN ELEGIDO: REVELACIÓN ATÓMICA Y DETERMINACIÓN DE RONDA
    -- =========================================================================

    -- Determinar ganador de la ronda
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

    -- Obtener y actualizar vidas (Mejor de 3 vidas)
    v_p1_lives := COALESCE((v_session.current_state->>'player1Lives')::int, 3);
    v_p2_lives := COALESCE((v_session.current_state->>'player2Lives')::int, 3);

    IF v_round_winner = 'PLAYER1' THEN
      v_p2_lives := GREATEST(0, v_p2_lives - 1);
    ELSIF v_round_winner = 'PLAYER2' THEN
      v_p1_lives := GREATEST(0, v_p1_lives - 1);
    END IF;

    -- Comprobar si la partida completa finalizó
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

    -- Construir nuevo estado público revelado
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

    -- Actualizar sesión pública: current_turn_user_id permanece NULL para RPS
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

    -- Si terminó la partida, cerrar mesa y liquidar mediante libro mayor contable
    IF v_is_game_over THEN
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          updated_at = NOW()
      WHERE id = v_session.table_id;

      PERFORM public.settle_game_session(
        p_session_id,
        ARRAY[v_winner_user_id],
        NULL::int,
        'rps_match_' || p_session_id::text
      );
    END IF;

    -- Registrar acción inmutable en game_actions
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
      v_user_id,
      COALESCE((SELECT MAX(sequence_number) FROM public.game_actions WHERE session_id = p_session_id), 0) + 1,
      'ROUND_REVEAL',
      jsonb_build_object(
        'round', v_curr_round,
        'player1Choice', v_c1,
        'player2Choice', v_c2,
        'roundWinner', v_round_winner,
        'isGameOver', v_is_game_over
      ),
      true,
      md5(v_new_state::text),
      'rps_reveal_' || p_session_id::text || '_rnd_' || v_curr_round::text
    );

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
    -- SOLO UNO HA ELEGIDO: REGISTRAR COMMIT PROTEGIENDO EL SECRETO DEL JUGADOR
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

-- 5. RPC: NEXT_RPS_ROUND_SECURE (REINICIO ATÓMICO CON RESOLUCIÓN SEGURA)
CREATE OR REPLACE FUNCTION public.next_rps_round_secure(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_session RECORD;
  v_curr_round INT;
  v_new_round INT;
  v_new_state JSONB;
  v_p1_id TEXT;
  v_p2_id TEXT;
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

  -- Identificar jugadores de forma determinista
  v_p1_id := NULLIF(TRIM(v_session.current_state->>'player1Id'), '');
  v_p2_id := NULLIF(TRIM(v_session.current_state->>'player2Id'), '');

  IF v_p1_id IS NULL THEN
    SELECT user_id::text INTO v_p1_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND status NOT IN ('LEFT')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  IF v_p2_id IS NULL THEN
    SELECT user_id::text INTO v_p2_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id::text != v_p1_id
      AND status NOT IN ('LEFT')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

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
    COALESCE(v_p1_id, 'player1'), jsonb_build_object('committed', false),
    COALESCE(v_p2_id, 'player2'), jsonb_build_object('committed', false)
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

-- 6. RPC: PROCESS_EXPIRED_TURNS (DISTINCIÓN STRICTA ROUND_DEADLINE vs PLAYER_TURN_DEADLINE)
DROP FUNCTION IF EXISTS public.process_expired_turns();

CREATE OR REPLACE FUNCTION public.process_expired_turns()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_expired_row RECORD;
  v_table RECORD;
  v_p1_id UUID;
  v_p2_id UUID;
  v_p1_committed BOOLEAN;
  v_p2_committed BOOLEAN;
  v_winner_id UUID;
  v_loser_id UUID;
  v_secret_choices JSONB;
  v_idempotency_key VARCHAR(100);
  v_curr_round INT;
BEGIN
  -- ---------------------------------------------------------------------------
  -- A. PROCESAMIENTO DE EXPIRACIONES PARA JUEGOS SECUENCIALES (DOMINÓ, TRUCO, ETC.)
  -- ---------------------------------------------------------------------------
  FOR v_expired_row IN
    SELECT s.id, s.table_id, s.current_turn_user_id, t.game_type, s.turn_expires_at
    FROM public.game_sessions s
    JOIN public.game_tables t ON t.id = s.table_id
    WHERE s.status::text IN ('ACTIVE', 'active')
      AND s.current_turn_user_id IS NOT NULL
      AND t.game_type NOT IN ('rock_paper_scissors', 'rps')
      AND (
        (s.turn_expires_at IS NOT NULL AND s.turn_expires_at < NOW())
        OR
        (s.turn_deadline_at IS NOT NULL AND s.turn_deadline_at < NOW())
      )
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      v_idempotency_key := 'seq_timeout_' || v_expired_row.id::text || '_' || v_expired_row.current_turn_user_id::text || '_' || EXTRACT(EPOCH FROM NOW())::int::text;
      PERFORM public.record_turn_timeout_secure(
        v_expired_row.id,
        v_expired_row.current_turn_user_id,
        v_idempotency_key
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_expired_turns] Error en juego secuencial %: %', v_expired_row.id, SQLERRM;
    END;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- B. PROCESAMIENTO DE EXPIRACIONES PARA PIEDRA, PAPEL O TIJERA (ROUND_DEADLINE)
  -- ---------------------------------------------------------------------------
  FOR v_expired_row IN
    SELECT s.id, s.table_id, s.current_state, s.created_at, s.turn_expires_at
    FROM public.game_sessions s
    JOIN public.game_tables t ON t.id = s.table_id
    WHERE s.status::text IN ('ACTIVE', 'active')
      AND t.game_type IN ('rock_paper_scissors', 'rps')
      AND (
        (s.turn_expires_at IS NOT NULL AND s.turn_expires_at < NOW())
        OR
        (s.turn_deadline_at IS NOT NULL AND s.turn_deadline_at < NOW())
      )
      AND COALESCE(s.current_state->>'status', '') IN ('ROUND_COMMIT', 'selecting')
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      v_curr_round := COALESCE((v_expired_row.current_state->>'roundNumber')::int, 1);
      v_idempotency_key := 'rps_timeout_' || v_expired_row.id::text || '_rnd_' || v_curr_round::text;

      -- Identificar jugadores de forma determinista sin created_at
      v_p1_id := NULLIF(TRIM(v_expired_row.current_state->>'player1Id'), '')::uuid;
      v_p2_id := NULLIF(TRIM(v_expired_row.current_state->>'player2Id'), '')::uuid;

      IF v_p1_id IS NULL THEN
        SELECT user_id INTO v_p1_id
        FROM public.game_table_players
        WHERE table_id = v_expired_row.table_id
          AND status NOT IN ('LEFT')
        ORDER BY seat_number ASC, joined_at ASC
        LIMIT 1;
      END IF;

      IF v_p2_id IS NULL THEN
        SELECT user_id INTO v_p2_id
        FROM public.game_table_players
        WHERE table_id = v_expired_row.table_id
          AND user_id != v_p1_id
          AND status NOT IN ('LEFT')
        ORDER BY seat_number ASC, joined_at ASC
        LIMIT 1;
      END IF;

      -- Consultar compromisos registrados
      SELECT secret_state->'rps_choices' INTO v_secret_choices
      FROM public.game_session_secrets
      WHERE session_id = v_expired_row.id;

      v_p1_committed := (v_secret_choices ? v_p1_id::text) OR
                        COALESCE((v_expired_row.current_state->'playerChoices'->(v_p1_id::text)->>'committed')::boolean, false);
      v_p2_committed := (v_secret_choices ? v_p2_id::text) OR
                        COALESCE((v_expired_row.current_state->'playerChoices'->(v_p2_id::text)->>'committed')::boolean, false);

      IF v_p1_committed AND NOT v_p2_committed THEN
        v_winner_id := v_p1_id;
        v_loser_id := v_p2_id;
      ELSIF v_p2_committed AND NOT v_p1_committed THEN
        v_winner_id := v_p2_id;
        v_loser_id := v_p1_id;
      ELSE
        v_winner_id := NULL;
        v_loser_id := NULL;
      END IF;

      IF v_winner_id IS NOT NULL THEN
        -- Victoria por abandono/timeout del oponente
        UPDATE public.game_sessions
        SET status = 'FINISHED'::session_status_enum,
            winner_user_id = v_winner_id,
            ended_at = NOW(),
            current_state = jsonb_set(
              jsonb_set(current_state, '{winnerUserId}', to_jsonb(v_winner_id)),
              '{abandonedBy}', to_jsonb(v_loser_id)
            ),
            updated_at = NOW()
        WHERE id = v_expired_row.id;

        UPDATE public.game_tables
        SET status = 'CLOSED'::table_status_enum,
            closed_at = NOW(),
            updated_at = NOW()
        WHERE id = v_expired_row.table_id;

        PERFORM public.settle_game_session(
          v_expired_row.id,
          ARRAY[v_winner_id],
          NULL::int,
          v_idempotency_key
        );
      ELSE
        -- Ninguno eligió dentro del plazo: Cancelación y reembolso seguro al 100%
        UPDATE public.game_sessions
        SET status = 'CANCELLED'::session_status_enum,
            ended_at = NOW(),
            current_state = jsonb_set(current_state, '{cancelReason}', '"ROUND_TIMEOUT_NO_CHOICES"'::jsonb),
            updated_at = NOW()
        WHERE id = v_expired_row.id;

        UPDATE public.game_tables
        SET status = 'CLOSED'::table_status_enum,
            closed_at = NOW(),
            updated_at = NOW()
        WHERE id = v_expired_row.table_id;

        PERFORM public.refund_game_session(
          v_expired_row.id,
          'Tiempo de ronda agotado sin jugadas de ningún participante',
          v_idempotency_key
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_expired_turns] Error en ronda simultánea RPS %: %', v_expired_row.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_expired_turns() TO authenticated, anon, service_role;
