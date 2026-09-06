-- ==============================================================================
-- MIGRACIÓN 141: RESOLUCIÓN DEFINITIVA DE PGCRYPTO, GEN_RANDOM_BYTES Y COMMIT-REVEAL RPS
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- Estado: PRODUCCIÓN / CRÍTICO
-- ==============================================================================
-- Causa Raíz Identificada:
-- 1. En Supabase/PostgreSQL, la extensión pgcrypto se aloja en el esquema 'extensions'.
-- 2. La función submit_rps_choice_secure fue declarada con "SET search_path = public, auth".
-- 3. Al no incluir 'extensions' en el search_path, cualquier llamada a gen_random_bytes(32)
--    fallaba con el error: "function gen_random_bytes(integer) does not exist".
-- 4. Además, el valor por defecto de server_seed en game_session_secrets invocaba
--    gen_random_bytes(32) sin calificación de esquema.
--
-- Solución Centralizada y Blindada:
-- 1. Asegurar extensión pgcrypto de forma idempotente.
-- 2. Crear una función de enlace público public.gen_random_bytes(integer) que delegue
--    a extensions.gen_random_bytes(integer) si existe en 'extensions' y no en 'public'.
--    Esto garantiza que CUALQUIER función en la base de datos que opere bajo
--    search_path = public resuelva gen_random_bytes sin error.
-- 3. Actualizar el search_path de submit_rps_choice_secure, next_rps_round_secure
--    y process_expired_turns a: "public, extensions, auth".
-- 4. Cualificar explícitamente las llamadas a extensions.gen_random_bytes(...)
--    en la inicialización de server_seed y en el default de la tabla game_session_secrets.
-- 5. Preservar la arquitectura Commit-Reveal simultánea de RPS con current_turn_user_id = NULL.
-- ==============================================================================

-- 1. Asegurar que la extensión pgcrypto esté habilitada
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Puente Centralizado de Esquema para gen_random_bytes
-- Si pgcrypto reside en 'extensions' y no en 'public', creamos una función envoltorio en 'public'
-- para compatibilidad universal con todas las RPCs existentes que usen search_path=public.
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
      CREATE OR REPLACE FUNCTION public.gen_random_bytes(p_len integer)
      RETURNS bytea
      LANGUAGE sql
      PARALLEL SAFE
      STABLE
      AS $fn$ SELECT extensions.gen_random_bytes(p_len) $fn$;
      
      GRANT EXECUTE ON FUNCTION public.gen_random_bytes(integer) TO authenticated, anon, service_role, postgres;
    END IF;
  END IF;
END $$;

-- 3. Asegurar estructura y default blindado de game_session_secrets
CREATE TABLE IF NOT EXISTS public.game_session_secrets (
  session_id UUID PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  secret_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  server_seed VARCHAR(64) NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Actualizar el DEFAULT de server_seed para garantizar resolución en cualquier contexto
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'game_session_secrets' AND column_name = 'server_seed'
  ) THEN
    BEGIN
      ALTER TABLE public.game_session_secrets 
      ALTER COLUMN server_seed SET DEFAULT encode(extensions.gen_random_bytes(32), 'hex');
    EXCEPTION WHEN OTHERS THEN
      ALTER TABLE public.game_session_secrets 
      ALTER COLUMN server_seed SET DEFAULT encode(public.gen_random_bytes(32), 'hex');
    END;
  END IF;
END $$;

-- ==============================================================================
-- 4. RPC: SUBMIT_RPS_CHOICE_SECURE (BLINDADA CON SEARCH_PATH Y RESOLUCIÓN PGCRYPTO)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.submit_rps_choice_secure(
  p_session_id UUID,
  p_choice VARCHAR(20)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_user_id UUID;
  v_norm_choice VARCHAR(20);
  v_session RECORD;
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
  v_generated_seed VARCHAR(64);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED: Debes iniciar sesión');
  END IF;

  v_norm_choice := UPPER(TRIM(p_choice));
  IF v_norm_choice NOT IN ('ROCK', 'PAPER', 'SCISSORS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHOICE: La jugada debe ser ROCK, PAPER o SCISSORS');
  END IF;

  -- 1. Bloquear la sesión para evitar condiciones de carrera concurrentes
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
    -- Generación de semilla aleatoria segura con resolución blindada
    BEGIN
      v_generated_seed := encode(extensions.gen_random_bytes(32), 'hex');
    EXCEPTION WHEN OTHERS THEN
      v_generated_seed := encode(public.gen_random_bytes(32), 'hex');
    END;

    INSERT INTO public.game_session_secrets (session_id, secret_state, server_seed)
    VALUES (p_session_id, '{}'::jsonb, v_generated_seed)
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

  -- 4. Validar si el jugador ya eligió en esta ronda (Anti-double submit e idempotencia estricta)
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

  -- 6. Verificar si ambos jugadores ya han completado su compromiso
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

    -- Si el match terminó, cerrar la mesa asociada
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
-- 5. RPC: NEXT_RPS_ROUND_SECURE (REINICIO ATÓMICO CON SEARCH_PATH EXTENSIONS)
-- ==============================================================================
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
-- 6. ACTUALIZACIÓN DE PROCESS_EXPIRED_TURNS: ROUND_DEADLINE CON IDEMPOTENCIA
-- ==============================================================================
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
      AND s.turn_expires_at IS NOT NULL
      AND s.turn_expires_at < NOW()
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      -- Clave determinista de idempotencia para timeout secuencial
      v_idempotency_key := 'seq_timeout_' || v_expired_row.id::text || '_' || v_expired_row.current_turn_user_id::text || '_' || EXTRACT(EPOCH FROM v_expired_row.turn_expires_at)::bigint::text;
      
      PERFORM public.record_turn_timeout_secure(
        v_expired_row.id,
        v_expired_row.current_turn_user_id,
        v_idempotency_key
      );
    EXCEPTION WHEN OTHERS THEN
      -- Evitar que una sesión bloquee el bucle daemon
      NULL;
    END;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- B. PROCESAMIENTO DE ROUND_DEADLINE PARA JUEGOS SIMULTÁNEOS (RPS)
  -- ---------------------------------------------------------------------------
  FOR v_expired_row IN
    SELECT s.id, s.table_id, s.current_state, s.created_at, s.turn_expires_at
    FROM public.game_sessions s
    JOIN public.game_tables t ON t.id = s.table_id
    WHERE s.status::text IN ('ACTIVE', 'active')
      AND t.game_type IN ('rock_paper_scissors', 'rps')
      AND s.turn_expires_at IS NOT NULL
      AND s.turn_expires_at < NOW()
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      SELECT * INTO v_table FROM public.game_tables WHERE id = v_expired_row.table_id;
      
      -- Obtener ronda actual para clave determinista
      v_curr_round := COALESCE((v_expired_row.current_state->>'roundNumber')::int, (v_expired_row.current_state->>'round')::int, 1);
      v_idempotency_key := 'rps_timeout_' || v_expired_row.id::text || '_rnd_' || v_curr_round::text;

      -- Obtener IDs de jugadores
      BEGIN
        v_p1_id := (v_expired_row.current_state->>'player1Id')::uuid;
        v_p2_id := (v_expired_row.current_state->>'player2Id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_p1_id := NULL;
        v_p2_id := NULL;
      END;

      IF v_p1_id IS NULL OR v_p2_id IS NULL THEN
        SELECT user_id INTO v_p1_id FROM public.game_table_players WHERE table_id = v_expired_row.table_id ORDER BY seat_number ASC, created_at ASC LIMIT 1;
        SELECT user_id INTO v_p2_id FROM public.game_table_players WHERE table_id = v_expired_row.table_id AND user_id != v_p1_id LIMIT 1;
      END IF;

      -- Verificar compromisos consultando tanto secrets como current_state
      SELECT secret_state->'rps_choices' INTO v_secret_choices
      FROM public.game_session_secrets
      WHERE session_id = v_expired_row.id;

      v_p1_committed := COALESCE((v_expired_row.current_state->'playerChoices'->(v_p1_id::text)->>'committed')::boolean, false)
                        OR (v_secret_choices IS NOT NULL AND v_secret_choices ? v_p1_id::text);
      v_p2_committed := COALESCE((v_expired_row.current_state->'playerChoices'->(v_p2_id::text)->>'committed')::boolean, false)
                        OR (v_secret_choices IS NOT NULL AND v_secret_choices ? v_p2_id::text);

      IF v_p1_committed AND NOT v_p2_committed THEN
        -- Jugador 1 jugó a tiempo; Jugador 2 agotó su tiempo (abandono/timeout de ronda)
        v_winner_id := v_p1_id;
        v_loser_id := v_p2_id;

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

        -- Liquidación autoritativa e idempotente mediante settle_game_session
        PERFORM public.settle_game_session(
          v_expired_row.id,
          ARRAY[v_winner_id]::uuid[],
          'ROUND_TIMEOUT_FORFEIT',
          v_idempotency_key
        );

      ELSIF v_p2_committed AND NOT v_p1_committed THEN
        -- Jugador 2 jugó a tiempo; Jugador 1 agotó su tiempo (abandono/timeout de ronda)
        v_winner_id := v_p2_id;
        v_loser_id := v_p1_id;

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

        -- Liquidación autoritativa e idempotente mediante settle_game_session
        PERFORM public.settle_game_session(
          v_expired_row.id,
          ARRAY[v_winner_id]::uuid[],
          'ROUND_TIMEOUT_FORFEIT',
          v_idempotency_key
        );

      ELSIF NOT v_p1_committed AND NOT v_p2_committed THEN
        -- Ninguno de los dos jugadores envió jugada: cancelar por inactividad y reembolsar entradas
        UPDATE public.game_sessions
        SET status = 'CANCELLED'::session_status_enum,
            ended_at = NOW(),
            current_state = jsonb_set(current_state, '{cancelledReason}', '"DUAL_ROUND_TIMEOUT"'::jsonb),
            updated_at = NOW()
        WHERE id = v_expired_row.id;

        UPDATE public.game_tables
        SET status = 'CLOSED'::table_status_enum,
            closed_at = NOW(),
            updated_at = NOW()
        WHERE id = v_expired_row.table_id;

        -- Liquidación con arreglo de ganadores vacío (provoca reembolso de fondos retenidos en ledger)
        PERFORM public.settle_game_session(
          v_expired_row.id,
          ARRAY[]::uuid[],
          'DUAL_ROUND_TIMEOUT_CANCEL',
          v_idempotency_key
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- Evitar que una sesión bloquee el bucle daemon
      NULL;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_expired_turns() TO authenticated, anon, service_role, postgres;

COMMENT ON FUNCTION public.submit_rps_choice_secure(UUID, VARCHAR) IS 
'Registra jugadas de Piedra, Papel o Tijera bajo protocolo Commit-Reveal autoritativo en servidor con resolución blindada de pgcrypto en esquema extensions/public.';

COMMENT ON FUNCTION public.process_expired_turns() IS 
'Daemon de expiración de turnos. Discrimina estrictamente entre turnos secuenciales y Round Deadlines simultáneos de RPS con claves de idempotencia deterministas.';
