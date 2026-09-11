-- =============================================================================
-- MIGRACIÓN 161: CORRECCIÓN DEFINITIVA DE PIEDRA, PAPEL O TIJERA (RPS)
-- REGLA DE ORO DE 3 VIDAS Y CONTINUIDAD AUTOMÁTICA DE RONDAS
-- =============================================================================
-- 1. Redefine 'next_rps_round_secure':
--    - Elimina referencias a columnas inexistentes en 'game_sessions'.
--    - Obtiene deterministamente 'player1Id' y 'player2Id' desde current_state
--      o desde 'game_table_players'.
--    - Preserva de forma fidedigna e inmutable las vidas actuales (player1Lives y player2Lives).
--    - Resetea choices, roundWinner, roundWinnerUserId, matchWinner y winnerUserId a NULL.
--    - Inicializa 'playerChoices' a committed: false para ambos jugadores.
--    - Establece status = 'ROUND_COMMIT', phase = 'selecting' y nuevo deadline de 15 segundos.
--    - Limpia la clave 'rps_choices' en 'game_session_secrets'.
--    - Inserta acción 'NEXT_ROUND' en 'game_actions' para broadcast en tiempo real.
-- 2. Redefine 'submit_rps_choice_secure':
--    - Ejecuta el sistema estricto de 3 vidas:
--      * Cada jugador comienza con 3 vidas.
--      * Una derrota de ronda = pierde 1 vida (GREATEST(0, vidas - 1)).
--      * Un empate (DRAW) = NINGÚN jugador pierde vidas.
--      * Ganar la ronda = no pierde vida.
--      * Si ambos jugadores tienen > 0 vidas:
--        status = 'ROUND_REVEAL', phase = 'round_result', isGameOver = false.
--      * ÚNICAMENTE cuando un jugador llega a 0 vidas:
--        status = 'MATCH_ENDED', phase = 'match_ended', isGameOver = true,
--        liquidación atómica con 'universal_settle_game_session'.
-- =============================================================================

-- 1. NEXT_RPS_ROUND_SECURE
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
  v_p1_lives INT := 3;
  v_p2_lives INT := 3;
  v_deadline TIMESTAMPTZ;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_ID_REQUIRED');
  END IF;

  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF UPPER(v_session.status::text) IN ('FINISHED', 'SETTLED', 'CANCELLED', 'ABANDONED') THEN
    RETURN jsonb_build_object('success', true, 'action', 'ALREADY_FINALIZED', 'status', v_session.status::text);
  END IF;

  v_base_state := COALESCE(v_session.current_state, '{}'::jsonb);
  IF jsonb_typeof(v_base_state) != 'object' THEN
    v_base_state := '{}'::jsonb;
  END IF;

  -- Si ya está en ROUND_COMMIT / selecting, devolver éxito idempotente
  IF COALESCE(v_base_state->>'status', '') = 'ROUND_COMMIT' OR
     COALESCE(v_base_state->>'phase', '') = 'selecting' THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'ALREADY_IN_COMMIT_PHASE',
      'round', COALESCE((v_base_state->>'roundNumber')::int, 1),
      'status', 'ROUND_COMMIT'
    );
  END IF;

  -- Identificar a los dos contendientes de forma determinista
  v_p1_id := NULLIF(TRIM(v_base_state->>'player1Id'), '');
  v_p2_id := NULLIF(TRIM(v_base_state->>'player2Id'), '');

  IF v_p1_id IS NULL THEN
    SELECT user_id::text INTO v_p1_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  IF v_p2_id IS NULL THEN
    SELECT user_id::text INTO v_p2_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id::text != v_p1_id
      AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  -- Si faltan jugadores no se puede avanzar ronda
  IF v_p1_id IS NULL OR v_p2_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_PLAYERS');
  END IF;

  -- Preservar fidedignamente las vidas actuales
  v_p1_lives := COALESCE(
    (v_base_state->>'player1Lives')::int,
    (v_base_state->'lives'->>v_p1_id)::int,
    3
  );
  v_p2_lives := COALESCE(
    (v_base_state->>'player2Lives')::int,
    (v_base_state->'lives'->>v_p2_id)::int,
    3
  );

  -- Si alguno de los jugadores ya tiene 0 vidas, la partida no debe avanzar más
  IF v_p1_lives <= 0 OR v_p2_lives <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'MATCH_ALREADY_OVER',
      'player1Lives', v_p1_lives,
      'player2Lives', v_p2_lives
    );
  END IF;

  v_curr_round := COALESCE((v_base_state->>'roundNumber')::int, (v_base_state->>'round')::int, 1);
  v_new_round := v_curr_round + 1;
  v_deadline := NOW() + INTERVAL '15 seconds';

  -- Construir el nuevo estado limpio para la siguiente ronda
  v_new_state := v_base_state || jsonb_build_object(
    'player1Id', v_p1_id,
    'player2Id', v_p2_id,
    'player1Lives', v_p1_lives,
    'player2Lives', v_p2_lives,
    'lives', jsonb_build_object(v_p1_id, v_p1_lives, v_p2_id, v_p2_lives),
    'roundNumber', v_new_round,
    'round', v_new_round,
    'player1Choice', NULL::text,
    'player2Choice', NULL::text,
    'roundWinner', NULL::text,
    'roundWinnerUserId', NULL::uuid,
    'matchWinner', NULL::text,
    'winnerUserId', NULL::uuid,
    'status', 'ROUND_COMMIT',
    'phase', 'selecting',
    'currentTurnUserId', NULL::uuid,
    'turnUserId', NULL::uuid,
    'turnDurationSeconds', 15,
    'turnDeadlineAt', EXTRACT(EPOCH FROM v_deadline) * 1000,
    'playerChoices', jsonb_build_object(
      v_p1_id, jsonb_build_object('committed', false),
      v_p2_id, jsonb_build_object('committed', false)
    )
  );

  IF v_new_state IS NULL THEN
    v_new_state := '{}'::jsonb;
  END IF;

  UPDATE public.game_sessions
  SET current_state = v_new_state,
      current_turn_user_id = NULL,
      turn_expires_at = v_deadline,
      turn_deadline_at = v_deadline,
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Limpiar las jugadas secretas de la ronda previa
  UPDATE public.game_session_secrets
  SET secret_state = jsonb_set(COALESCE(secret_state, '{}'::jsonb), '{rps_choices}', '{}'::jsonb),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Notificar a ambos clientes en tiempo real a través de game_actions
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
    COALESCE(auth.uid(), v_p1_id::uuid),
    COALESCE((SELECT MAX(sequence_number) FROM public.game_actions WHERE session_id = p_session_id), 0) + 1,
    'NEXT_ROUND',
    jsonb_build_object(
      'round', v_new_round,
      'status', 'ROUND_COMMIT',
      'player1Lives', v_p1_lives,
      'player2Lives', v_p2_lives
    ),
    true,
    md5(v_new_state::text),
    'rps_next_round_' || p_session_id::text || '_rnd_' || v_new_round::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_round', v_new_round,
    'round', v_new_round,
    'status', 'ROUND_COMMIT',
    'player1Lives', v_p1_lives,
    'player2Lives', v_p2_lives
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_rps_round_secure(UUID) TO authenticated, anon, service_role;


-- 2. SUBMIT_RPS_CHOICE_SECURE (REGLA DE 3 VIDAS Y EVALUACIÓN DETERMINISTA)
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
  v_session RECORD;
  v_base_state JSONB;
  v_secret_row RECORD;
  v_secret_state JSONB;
  v_secret_choices JSONB;
  v_norm_choice VARCHAR;
  v_p1_id TEXT;
  v_p2_id TEXT;
  v_p1_lives INT;
  v_p2_lives INT;
  v_c1 VARCHAR;
  v_c2 VARCHAR;
  v_round_winner TEXT;
  v_round_winner_user_id UUID;
  v_is_game_over BOOLEAN := false;
  v_match_winner TEXT := NULL;
  v_winner_user_id UUID := NULL;
  v_curr_round INT;
  v_new_state JSONB;
  v_history_entry JSONB;
  v_new_history JSONB;
  v_generated_seed VARCHAR(64);
BEGIN
  -- 1. Autenticación y Autorización
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- 2. Normalización y Validación del Movimiento
  v_norm_choice := UPPER(TRIM(p_choice));
  IF v_norm_choice NOT IN ('ROCK', 'PAPER', 'SCISSORS') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHOICE', 'message', 'La jugada debe ser ROCK, PAPER o SCISSORS');
  END IF;

  -- 3. Bloqueo de la Sesión (FOR UPDATE)
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF UPPER(v_session.status::text) NOT IN ('ACTIVE', 'WAITING') THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_ACTIVE');
  END IF;

  v_base_state := COALESCE(v_session.current_state, '{}'::jsonb);
  IF jsonb_typeof(v_base_state) != 'object' THEN
    v_base_state := '{}'::jsonb;
  END IF;

  -- Verificar tabla de secretos
  SELECT * INTO v_secret_row
  FROM public.game_session_secrets
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_generated_seed := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.game_session_secrets (session_id, secret_state, server_seed)
    VALUES (p_session_id, '{}'::jsonb, v_generated_seed)
    RETURNING * INTO v_secret_row;
  END IF;

  v_secret_state := COALESCE(v_secret_row.secret_state, '{}'::jsonb);
  IF jsonb_typeof(v_secret_state) != 'object' THEN
    v_secret_state := '{}'::jsonb;
  END IF;

  -- Identificar jugadores de forma determinista
  v_p1_id := NULLIF(TRIM(v_base_state->>'player1Id'), '');
  v_p2_id := NULLIF(TRIM(v_base_state->>'player2Id'), '');

  IF v_p1_id IS NULL THEN
    SELECT user_id::text INTO v_p1_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  IF v_p2_id IS NULL THEN
    SELECT user_id::text INTO v_p2_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id::text != v_p1_id
      AND status::text NOT IN ('LEFT', 'CANCELLED', 'REPLACED')
    ORDER BY seat_number ASC, joined_at ASC
    LIMIT 1;
  END IF;

  IF v_p1_id IS NULL OR v_p2_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_PLAYERS_IN_SESSION');
  END IF;

  IF v_user_id::text != v_p1_id AND v_user_id::text != v_p2_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_A_PLAYER_IN_THIS_MATCH');
  END IF;

  -- Validar fase de selección
  IF COALESCE(v_base_state->>'status', 'ROUND_COMMIT') NOT IN ('ROUND_COMMIT', 'selecting') AND
     COALESCE(v_base_state->>'phase', 'selecting') NOT IN ('ROUND_COMMIT', 'selecting') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROUND_NOT_ACCEPTING_CHOICES');
  END IF;

  -- Anti-double submit
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

  -- Guardar jugada privada en game_session_secrets
  v_secret_choices := v_secret_choices || jsonb_build_object(v_user_id::text, v_norm_choice);

  UPDATE public.game_session_secrets
  SET secret_state = jsonb_set(COALESCE(secret_state, '{}'::jsonb), '{rps_choices}', v_secret_choices),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  v_c1 := v_secret_choices->>v_p1_id;
  v_c2 := v_secret_choices->>v_p2_id;

  -- =========================================================================
  -- EVALUACIÓN: ¿Ambos jugadores han elegido?
  -- =========================================================================
  IF v_c1 IS NOT NULL AND v_c2 IS NOT NULL THEN
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

    -- Extraer vidas previas (default 3)
    v_p1_lives := COALESCE((v_base_state->>'player1Lives')::int, (v_base_state->'lives'->>v_p1_id)::int, 3);
    v_p2_lives := COALESCE((v_base_state->>'player2Lives')::int, (v_base_state->'lives'->>v_p2_id)::int, 3);

    -- Regla de 3 Vidas: Solo el perdedor de la ronda pierde 1 vida. En empate, NADIE pierde vida.
    IF v_round_winner = 'PLAYER1' THEN
      v_p2_lives := GREATEST(0, v_p2_lives - 1);
    ELSIF v_round_winner = 'PLAYER2' THEN
      v_p1_lives := GREATEST(0, v_p1_lives - 1);
    END IF;

    -- Condición inequívoca de fin de partida: un jugador llega a 0 vidas
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

    -- Construir nuevo estado público
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

    UPDATE public.game_sessions
    SET current_state = v_new_state,
        current_turn_user_id = NULL,
        winner_user_id = v_winner_user_id,
        turn_expires_at = CASE WHEN v_is_game_over THEN NULL ELSE NOW() + INTERVAL '15 seconds' END,
        turn_deadline_at = CASE WHEN v_is_game_over THEN NULL ELSE NOW() + INTERVAL '15 seconds' END,
        ended_at = CASE WHEN v_is_game_over THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Liquidación atómica si el match concluyó
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
        'isGameOver', v_is_game_over,
        'player1Lives', v_p1_lives,
        'player2Lives', v_p2_lives
      ),
      true,
      md5(v_new_state::text),
      'rps_reveal_' || p_session_id::text || '_rnd_' || v_curr_round::text
    );

    RETURN jsonb_build_object(
      'success', true,
      'bothChosen', true,
      'committed', true,
      'phase', CASE WHEN v_is_game_over THEN 'match_ended' ELSE 'round_result' END,
      'status', CASE WHEN v_is_game_over THEN 'MATCH_ENDED' ELSE 'ROUND_REVEAL' END,
      'isGameOver', v_is_game_over,
      'player1Lives', v_p1_lives,
      'player2Lives', v_p2_lives,
      'roundWinner', v_round_winner,
      'player1Choice', v_c1,
      'player2Choice', v_c2
    );

  ELSE
    -- SOLO UN JUGADOR HA ELEGIDO HASTA AHORA
    v_new_state := v_base_state || jsonb_build_object(
      'player1Id', v_p1_id,
      'player2Id', v_p2_id,
      'playerChoices', jsonb_build_object(
        v_user_id::text, jsonb_build_object('committed', true)
      )
    );

    UPDATE public.game_sessions
    SET current_state = v_new_state,
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'success', true,
      'committed', true,
      'bothChosen', false,
      'phase', 'selecting',
      'status', 'ROUND_COMMIT',
      'message', 'Jugada registrada de forma segura. Esperando al contrincante.'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rps_choice_secure(UUID, VARCHAR) TO authenticated, anon, service_role;
