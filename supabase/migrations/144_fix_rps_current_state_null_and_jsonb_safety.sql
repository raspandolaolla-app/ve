-- ===============================================================================
-- MIGRACIÓN 144: Corrección Forense de RPS (current_state = NULL) y Blindaje JSONB
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- Estado: SAFE_DEVELOPMENT_MODE = true
-- ===============================================================================
--
-- DIAGNÓSTICO Y CAUSA RAÍZ TÉCNICA:
-- 1. En PostgreSQL, la función nativa `jsonb_set(target, path, new_value)` retorna SQL NULL
--    si CUALQUIERA de sus argumentos es NULL.
-- 2. En `submit_rps_choice_secure` (migraciones 140, 141 y 142), las líneas:
--      v_new_state := jsonb_set(v_new_state, '{roundWinnerUserId}', to_jsonb(v_round_winner_user_id));
--      v_new_state := jsonb_set(v_new_state, '{matchWinner}', to_jsonb(v_match_winner));
--      v_new_state := jsonb_set(v_new_state, '{winnerUserId}', to_jsonb(v_winner_user_id));
--    evaluaban `to_jsonb(NULL)`. En PostgreSQL, `to_jsonb(NULL::text)` y `to_jsonb(NULL::uuid)`
--    retornan SQL NULL (no `'null'::jsonb`).
--    Al pasar SQL NULL como tercer argumento a `jsonb_set`, `jsonb_set` retorna SQL NULL.
--    Esto corrompía `v_new_state` a NULL en cualquier ronda donde no hubiese finalizado el partido
--    (donde matchWinner y winnerUserId son NULL) o en empates (roundWinnerUserId es NULL).
-- 3. Al ejecutar seguidamente:
--      UPDATE public.game_sessions SET current_state = v_new_state ...
--    PostgreSQL arrojaba la excepción fatal observada en producción:
--      "null value in column \"current_state\" of relation \"game_sessions\" violates not-null constraint"
-- 4. Vulnerabilidad secundaria en commits individuales (ELSE branch): Si `current_state->'playerChoices'`
--    era scalar JSON null (`'null'::jsonb`), `jsonb_set` fallaba con "cannot set path in scalar",
--    o si `v_session.current_state` no estaba inicializado como objeto, `v_new_state` se degradaba a NULL.
--
-- SOLUCIÓN ARQUITECTÓNICA Y REGLAS DE BLINDAJE:
-- 1. Reemplazar el encadenamiento frágil de `jsonb_set` por construcción declarativa e inmutable
--    con `jsonb_build_object` y el operador de fusión JSONB `||`:
--    `v_new_state := v_base_state || jsonb_build_object('roundWinnerUserId', v_round_winner_user_id, ...)`
--    En PostgreSQL, `jsonb_build_object('key', NULL)` genera válidamente `{"key": null}` (JSON null)
--    y NUNCA retorna SQL NULL.
-- 2. Blindaje con `COALESCE(v_session.current_state, '{}'::jsonb)` y validación `jsonb_typeof() = 'object'`
--    para asegurar que el estado base siempre sea un objeto JSON válido.
-- 3. Redundancia de seguridad: `IF v_new_state IS NULL THEN v_new_state := '{}'::jsonb; END IF;`
--    antes de cada UPDATE.
-- 4. Preservar estrictamente la arquitectura simultánea (COMMIT-REVEAL) de RPS sin turnos secuenciales
--    (`current_turn_user_id = NULL`).
-- 5. Integración con `public.universal_settle_game_session` para liquidación financiera centralizada.
-- ===============================================================================

-- 1. RPC: SUBMIT_RPS_CHOICE_SECURE (BLINDADA CONTRA NULL Y CORRUPCIÓN JSONB)
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
  v_secret_state JSONB;
  v_base_state JSONB;
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
    BEGIN
      v_user_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

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

  -- Blindaje de estado base: nunca NULL, nunca escalar
  v_base_state := COALESCE(v_session.current_state, '{}'::jsonb);
  IF jsonb_typeof(v_base_state) != 'object' THEN
    v_base_state := '{}'::jsonb;
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

  v_secret_state := COALESCE(v_secret_row.secret_state, '{}'::jsonb);
  IF jsonb_typeof(v_secret_state) != 'object' THEN
    v_secret_state := '{}'::jsonb;
  END IF;

  -- 4. IDENTIFICAR JUGADORES 1 Y 2 DE FORMA CANÓNICA Y DETERMINISTA
  -- Prioridad 1: IDs registrados en el JSONB current_state de la partida
  v_p1_id := NULLIF(TRIM(v_base_state->>'player1Id'), '');
  v_p2_id := NULLIF(TRIM(v_base_state->>'player2Id'), '');

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
  IF COALESCE(v_base_state->>'status', 'ROUND_COMMIT') NOT IN ('ROUND_COMMIT', 'selecting') AND
     COALESCE(v_base_state->>'phase', 'selecting') NOT IN ('ROUND_COMMIT', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROUND_NOT_ACCEPTING_CHOICES');
  END IF;

  -- 5. ANTI-DOUBLE-SUBMIT: Verificar si el jugador ya comprometió su jugada
  v_secret_choices := COALESCE(v_secret_state->'rps_choices', '{}'::jsonb);
  IF jsonb_typeof(v_secret_choices) != 'object' THEN
    v_secret_choices := '{}'::jsonb;
  END IF;

  IF (v_secret_choices ? v_user_id::text AND v_secret_choices->>v_user_id::text IS NOT NULL) OR
     (COALESCE((v_base_state->'playerChoices'->(v_user_id::text)->>'committed')::boolean, false) IS TRUE) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_COMMITTED',
      'message', 'Ya has enviado tu jugada para esta ronda'
    );
  END IF;

  -- 6. Guardar la jugada privada en game_session_secrets mediante fusión atómica
  v_secret_choices := v_secret_choices || jsonb_build_object(v_user_id::text, v_norm_choice);

  UPDATE public.game_session_secrets
  SET secret_state = jsonb_set(COALESCE(secret_state, '{}'::jsonb), '{rps_choices}', v_secret_choices),
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
    v_p1_lives := COALESCE((v_base_state->>'player1Lives')::int, 3);
    v_p2_lives := COALESCE((v_base_state->>'player2Lives')::int, 3);

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

    v_curr_round := COALESCE((v_base_state->>'roundNumber')::int, (v_base_state->>'round')::int, 1);

    v_history_entry := jsonb_build_object(
      'roundNumber', v_curr_round,
      'player1Choice', v_c1,
      'player2Choice', v_c2,
      'winner', v_round_winner,
      'winnerUserId', v_round_winner_user_id,
      'timestamp', FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)
    );

    v_new_history := COALESCE(
      CASE WHEN jsonb_typeof(v_base_state->'history') = 'array' THEN v_base_state->'history' ELSE '[]'::jsonb END,
      '[]'::jsonb
    ) || v_history_entry;

    -- Construir nuevo estado público revelado usando jsonb_build_object (inmune a NULL)
    v_new_state := v_base_state || jsonb_build_object(
      'player1Id', v_p1_id,
      'player2Id', v_p2_id,
      'player1Choice', v_c1,
      'player2Choice', v_c2,
      'player1Lives', v_p1_lives,
      'player2Lives', v_p2_lives,
      'lives', jsonb_build_object(v_p1_id, v_p1_lives, v_p2_id, v_p2_lives),
      'roundWinner', v_round_winner,
      'roundWinnerUserId', v_round_winner_user_id,
      'matchWinner', v_match_winner,
      'winnerUserId', v_winner_user_id,
      'status', CASE WHEN v_is_game_over THEN 'MATCH_ENDED' ELSE 'ROUND_REVEAL' END,
      'phase', CASE WHEN v_is_game_over THEN 'match_ended' ELSE 'round_result' END,
      'history', v_new_history,
      'currentTurnUserId', NULL::uuid,
      'turnUserId', NULL::uuid,
      'roundNumber', v_curr_round,
      'round', v_curr_round,
      'playerChoices', jsonb_build_object(
        v_p1_id, jsonb_build_object('committed', true, 'choice', v_c1),
        v_p2_id, jsonb_build_object('committed', true, 'choice', v_c2)
      )
    );

    -- Doble blindaje: el estado nunca puede ser NULL
    IF v_new_state IS NULL THEN
      v_new_state := '{}'::jsonb;
    END IF;

    -- Actualizar sesión pública: current_turn_user_id permanece NULL para RPS (juego simultáneo)
    UPDATE public.game_sessions
    SET current_state = v_new_state,
        current_turn_user_id = NULL,
        winner_user_id = v_winner_user_id,
        turn_expires_at = CASE WHEN v_is_game_over THEN NULL ELSE NOW() + INTERVAL '15 seconds' END,
        turn_deadline_at = CASE WHEN v_is_game_over THEN NULL ELSE NOW() + INTERVAL '15 seconds' END,
        ended_at = CASE WHEN v_is_game_over THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Si terminó la partida, liquidar mediante libro mayor contable universal
    -- (universal_settle_game_session se encarga de actualizar el status a FINISHED, cerrar la mesa y transferir fondos)
    IF v_is_game_over THEN
      PERFORM public.universal_settle_game_session(
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
    v_player_choices := CASE
      WHEN v_base_state->'playerChoices' IS NOT NULL AND jsonb_typeof(v_base_state->'playerChoices') = 'object'
      THEN v_base_state->'playerChoices'
      ELSE '{}'::jsonb
    END;

    v_player_choices := v_player_choices || jsonb_build_object(
      v_user_id::text,
      jsonb_build_object('committed', true)
    );

    v_new_state := v_base_state || jsonb_build_object(
      'player1Id', v_p1_id,
      'player2Id', v_p2_id,
      'playerChoices', v_player_choices,
      'player1Choice', NULL::text,
      'player2Choice', NULL::text,
      'status', 'ROUND_COMMIT',
      'phase', 'selecting',
      'currentTurnUserId', NULL::uuid,
      'turnUserId', NULL::uuid
    );

    -- Doble blindaje: el estado nunca puede ser NULL
    IF v_new_state IS NULL THEN
      v_new_state := '{}'::jsonb;
    END IF;

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

-- 2. RPC: NEXT_RPS_ROUND_SECURE (REINICIO ATÓMICO Y BLINDADO)
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
  v_base_state JSONB;
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

  v_base_state := COALESCE(v_session.current_state, '{}'::jsonb);
  IF jsonb_typeof(v_base_state) != 'object' THEN
    v_base_state := '{}'::jsonb;
  END IF;

  -- Solo avanzar si estaba en fase de resultado de ronda
  IF COALESCE(v_base_state->>'status', '') != 'ROUND_REVEAL' AND
     COALESCE(v_base_state->>'phase', '') != 'round_result' THEN
    RETURN jsonb_build_object('success', true, 'message', 'ALREADY_ADVANCED');
  END IF;

  v_curr_round := COALESCE((v_base_state->>'roundNumber')::int, (v_base_state->>'round')::int, 1);
  v_new_round := v_curr_round + 1;

  -- Identificar jugadores de forma determinista
  v_p1_id := NULLIF(TRIM(v_base_state->>'player1Id'), '');
  v_p2_id := NULLIF(TRIM(v_base_state->>'player2Id'), '');

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

  -- Construir nuevo estado para la siguiente ronda de forma inmune a NULL
  v_new_state := v_base_state || jsonb_build_object(
    'player1Id', v_p1_id,
    'player2Id', v_p2_id,
    'roundNumber', v_new_round,
    'round', v_new_round,
    'player1Choice', NULL::text,
    'player2Choice', NULL::text,
    'roundWinner', NULL::text,
    'roundWinnerUserId', NULL::uuid,
    'status', 'ROUND_COMMIT',
    'phase', 'selecting',
    'currentTurnUserId', NULL::uuid,
    'turnUserId', NULL::uuid,
    'playerChoices', jsonb_build_object(
      COALESCE(v_p1_id, 'player1'), jsonb_build_object('committed', false),
      COALESCE(v_p2_id, 'player2'), jsonb_build_object('committed', false)
    )
  );

  IF v_new_state IS NULL THEN
    v_new_state := '{}'::jsonb;
  END IF;

  UPDATE public.game_sessions
  SET current_state = v_new_state,
      current_turn_user_id = NULL,
      turn_expires_at = NOW() + INTERVAL '15 seconds',
      turn_deadline_at = NOW() + INTERVAL '15 seconds',
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Limpiar cualquier secreto residual de la ronda previa
  UPDATE public.game_session_secrets
  SET secret_state = jsonb_set(COALESCE(secret_state, '{}'::jsonb), '{rps_choices}', '{}'::jsonb),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object('success', true, 'round', v_new_round);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_rps_round_secure(UUID) TO authenticated, anon, service_role;

-- 3. ACTUALIZACIÓN DE PROCESS_EXPIRED_TURNS (BLINDAJE DE CURRENT_STATE ANTE TIMEOUTS)
CREATE OR REPLACE FUNCTION public.process_expired_turns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_expired_row RECORD;
  v_p1_id UUID;
  v_p2_id UUID;
  v_p1_committed BOOLEAN;
  v_p2_committed BOOLEAN;
  v_winner_id UUID;
  v_loser_id UUID;
  v_secret_choices JSONB;
  v_idempotency_key VARCHAR(100);
  v_curr_round INT;
  v_new_state JSONB;
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
      AND t.game_type::text NOT IN ('rock_paper_scissors', 'rps', 'PIEDRA_PAPEL_TIJERA')
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
      AND t.game_type::text IN ('rock_paper_scissors', 'rps', 'PIEDRA_PAPEL_TIJERA')
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
        -- Victoria por abandono/timeout del oponente: actualización inmune a NULL
        v_new_state := COALESCE(v_expired_row.current_state, '{}'::jsonb) || jsonb_build_object(
          'winnerUserId', v_winner_id,
          'abandonedBy', v_loser_id,
          'status', 'MATCH_ENDED',
          'phase', 'match_ended'
        );

        UPDATE public.game_sessions
        SET current_state = v_new_state,
            updated_at = NOW()
        WHERE id = v_expired_row.id;

        PERFORM public.universal_settle_game_session(
          v_expired_row.id,
          ARRAY[v_winner_id],
          NULL::int,
          v_idempotency_key
        );
      ELSE
        -- Ninguno eligió dentro del plazo: Cancelación y reembolso seguro al 100%
        v_new_state := COALESCE(v_expired_row.current_state, '{}'::jsonb) || jsonb_build_object(
          'cancelReason', 'ROUND_TIMEOUT_NO_CHOICES',
          'status', 'MATCH_CANCELLED'
        );

        UPDATE public.game_sessions
        SET current_state = v_new_state,
            updated_at = NOW()
        WHERE id = v_expired_row.id;

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

GRANT EXECUTE ON FUNCTION public.process_expired_turns() TO authenticated, anon, service_role, postgres;

COMMENT ON FUNCTION public.submit_rps_choice_secure(UUID, VARCHAR) IS 
'Registra jugadas en RPS mediante Commit-Reveal autoritativo en Supabase. Blindado contra NULL en current_state.';
