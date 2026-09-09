-- ==============================================================================
-- MIGRACIÓN 158: COHERENCIA DE TURNOS EN JUEGOS SIMULTÁNEOS (RPS) Y DELEGACIÓN DE TIMEOUT
-- ==============================================================================
-- 1. start_game_session_secure:
--    Garantiza que para juegos simultáneos (Piedra, Papel o Tijera, Bingo, Polla),
--    NO se asigne arbitrariamente un jugador en current_turn_user_id ni turnUserId.
--    El valor devuelto y persistido es estrictamente NULL, manteniendo coherencia
--    absoluta con el protocolo Commit-Reveal y eliminando divergencias entre RPC y frontend.
--
-- 2. expire_game_turn_secure(p_session_id uuid):
--    Incorpora soporte autoritativo para Piedra, Papel o Tijera (RPS).
--    Si vence el deadline de la ronda commit (15s):
--    - Si un jugador envió su jugada y el otro no: el jugador cumplidor gana la partida
--      por inactividad/abandono del rival y se liquida oficialmente mediante universal_settle_game_session (90/10).
--    - Si ninguno envió su jugada: la partida se cancela y se reembolsa al 100% mediante refund_game_session.
-- ==============================================================================

-- 1. ACTUALIZACIÓN DE START_GAME_SESSION_SECURE CON PROTECCIÓN PARA JUEGOS SIMULTÁNEOS
CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id uuid,
  p_initial_state jsonb DEFAULT NULL::jsonb,
  p_turn_duration_seconds integer DEFAULT 30,
  p_initial_turn_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_table RECORD;
  v_session RECORD;
  v_players JSONB;
  v_unique_players INT;
  v_game_type TEXT;
  v_session_status TEXT;
  v_initial_state JSONB;
  v_host_id UUID;
  v_effective_turn_user_id UUID;
  v_deadline TIMESTAMPTZ;
  v_session_number INT;
  v_effective_duration INT;
  v_is_simultaneous BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO: Debes iniciar sesión para comenzar la partida.';
  END IF;

  -- 1. Bloquear y obtener la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MESA_NO_ENCONTRADA: La mesa especificada no existe.';
  END IF;

  v_host_id := v_table.host_user_id;
  v_effective_duration := COALESCE(p_turn_duration_seconds, 30);

  -- 2. Obtener lista autoritativa de jugadores utilizando columnas reales de profiles
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'userId', gtp.user_id,
        'user_id', gtp.user_id,
        'displayName', COALESCE(
          NULLIF(TRIM(p.display_name), ''),
          NULLIF(TRIM(p.first_name || ' ' || COALESCE(p.last_name, '')), ''),
          NULLIF(TRIM(p.nombre_real), ''),
          'Jugador ' || gtp.seat_number
        ),
        'seatNumber', gtp.seat_number,
        'seat_number', gtp.seat_number,
        'status', gtp.status
      ) ORDER BY gtp.seat_number ASC
    ),
    '[]'::jsonb
  ) INTO v_players
  FROM public.game_table_players gtp
  LEFT JOIN public.profiles p ON p.user_id = gtp.user_id
  WHERE gtp.table_id = p_table_id
    AND gtp.status::text IN ('JOINED', 'READY', 'PLAYING');

  v_unique_players := COALESCE(jsonb_array_length(v_players), 0);
  IF v_unique_players < 1 THEN
    RAISE EXCEPTION 'JUGADORES_INSUFICIENTES: No hay jugadores activos en la mesa.';
  END IF;

  IF v_unique_players < 2
     AND lower(v_table.game_type::text) NOT IN ('bingo', 'bingo_75', 'bingo_90', 'polla', 'polla_venezolana')
     AND COALESCE((v_table.config->>'isPractice')::boolean, false) IS NOT TRUE
     AND COALESCE((p_initial_state->>'mode')::text, '') NOT IN ('VS_AI', 'PRACTICE', 'SOLO')
     AND COALESCE((v_table.config->>'mode')::text, '') NOT IN ('VS_AI', 'PRACTICE', 'SOLO')
     AND v_table.min_players > 1
  THEN
    RAISE EXCEPTION 'JUGADORES_INSUFICIENTES: Se requieren al menos % jugadores para iniciar la partida (actualmente hay %).', v_table.min_players, v_unique_players;
  END IF;

  -- 3. Idempotencia estricta: Verificar si ya existe una sesión activa
  SELECT * INTO v_session FROM public.game_sessions
  WHERE table_id = p_table_id
    AND status::text NOT IN ('FINISHED', 'CANCELLED', 'SETTLED', 'ABANDONED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyActive', true,
      'already_active', true,
      'source', 'existing_db_session',
      'sessionId', v_session.id,
      'session_id', v_session.id,
      'tableId', p_table_id,
      'table_id', p_table_id,
      'status', v_session.status::text,
      'currentTurnUserId', v_session.current_turn_user_id,
      'current_turn_user_id', v_session.current_turn_user_id,
      'turnUserId', v_session.current_turn_user_id,
      'turnDurationSeconds', COALESCE(v_session.turn_duration_seconds, 30),
      'turnDeadlineAt', COALESCE(v_session.turn_expires_at, v_session.turn_deadline_at),
      'turn_deadline_at', COALESCE(v_session.turn_expires_at, v_session.turn_deadline_at),
      'turnDeadline', COALESCE(v_session.turn_expires_at, v_session.turn_deadline_at),
      'gameState', v_session.current_state,
      'game_state', v_session.current_state,
      'players', v_players
    );
  END IF;

  -- 4. Resolver tipo de juego, turno inicial y deadline
  v_game_type := lower(v_table.game_type::text);
  v_is_simultaneous := v_game_type IN ('rock_paper_scissors', 'rps', 'piedra_papel_tijera', 'bingo', 'bingo_75', 'bingo_90', 'polla', 'polla_venezolana');

  IF v_is_simultaneous THEN
    -- En juegos simultáneos o Commit-Reveal, NO existe turno individual secuencial.
    v_effective_turn_user_id := NULL;
  ELSE
    v_effective_turn_user_id := COALESCE(
      p_initial_turn_user_id,
      (p_initial_state->>'turnUserId')::uuid,
      (p_initial_state->>'currentTurnUserId')::uuid
    );

    IF v_effective_turn_user_id IS NULL AND v_players IS NOT NULL AND jsonb_array_length(v_players) > 0 THEN
      v_effective_turn_user_id := (v_players->0->>'user_id')::uuid;
    END IF;
  END IF;

  v_deadline := CASE
    WHEN v_effective_duration > 0
    THEN NOW() + (v_effective_duration || ' seconds')::interval
    ELSE NULL
  END;

  -- 5. Determinar estado inicial y estado de sesión
  IF v_game_type IN ('bingo', 'bingo_75', 'bingo_90') THEN
    v_session_status := 'WAITING';
    v_initial_state := jsonb_build_object(
      'status', 'SALES',
      'variant', COALESCE((to_jsonb(v_table)->>'game_variant'), '90'),
      'mode', COALESCE(((to_jsonb(v_table)->'config')->>'mode')::int, 90),
      'hostUserId', v_host_id,
      'seed', floor(random() * 1000000000)::int,
      'cards', '{}'::jsonb,
      'cardsPurchased', '{}'::jsonb,
      'drawnBalls', '[]'::jsonb,
      'currentBall', NULL,
      'players', v_players,
      'startedAt', NOW()
    );
  ELSIF v_game_type IN ('polla', 'polla_venezolana') THEN
    v_session_status := 'WAITING';
    v_initial_state := jsonb_build_object(
      'status', 'OPEN_PICKS',
      'fixtures', '[]'::jsonb,
      'predictions', '{}'::jsonb,
      'players', v_players,
      'startedAt', NOW()
    );
  ELSE
    v_session_status := 'ACTIVE';
    IF p_initial_state IS NOT NULL THEN
      v_initial_state := p_initial_state;
      -- Garantizar campos de turno autoritativos
      v_initial_state := jsonb_set(v_initial_state, '{turnDurationSeconds}', to_jsonb(v_effective_duration));
      IF v_effective_turn_user_id IS NOT NULL THEN
        v_initial_state := jsonb_set(v_initial_state, '{turnUserId}', to_jsonb(v_effective_turn_user_id::text));
        v_initial_state := jsonb_set(v_initial_state, '{currentTurnUserId}', to_jsonb(v_effective_turn_user_id::text));
      ELSE
        -- Juegos simultáneos (RPS): asegurar valores canónicos nulos sin inventar turnos
        v_initial_state := jsonb_set(v_initial_state, '{turnUserId}', 'null'::jsonb);
        v_initial_state := jsonb_set(v_initial_state, '{currentTurnUserId}', 'null'::jsonb);
      END IF;
    ELSE
      v_initial_state := jsonb_build_object(
        'status', 'PLAYING',
        'currentTurnUserId', v_effective_turn_user_id,
        'turnUserId', v_effective_turn_user_id,
        'turnDurationSeconds', v_effective_duration,
        'turnDeadline', v_deadline,
        'round', 1,
        'players', v_players,
        'startedAt', NOW()
      );
    END IF;
  END IF;

  -- Calcular session_number secuencial
  SELECT COALESCE(MAX(session_number), 0) + 1 INTO v_session_number
  FROM public.game_sessions
  WHERE table_id = p_table_id;

  -- 6. Insertar la nueva sesión utilizando columnas canónicas verificadas
  INSERT INTO public.game_sessions (
    table_id,
    game_type,
    session_number,
    status,
    current_state,
    current_turn_user_id,
    turn_duration_seconds,
    turn_deadline_at,
    turn_expires_at,
    started_at,
    created_at,
    updated_at
  ) VALUES (
    p_table_id,
    v_table.game_type,
    v_session_number,
    v_session_status::session_status_enum,
    v_initial_state,
    v_effective_turn_user_id,
    v_effective_duration,
    v_deadline,
    v_deadline,
    NOW(),
    NOW(),
    NOW()
  ) RETURNING * INTO v_session;

  -- 7. Actualizar mesa a ACTIVE
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      updated_at = NOW()
  WHERE id = p_table_id;

  -- 8. Actualizar participantes a PLAYING usando player_table_status_enum
  UPDATE public.game_table_players
  SET status = 'PLAYING'::player_table_status_enum,
      joined_at = COALESCE(joined_at, NOW())
  WHERE table_id = p_table_id
    AND status::text IN ('JOINED', 'READY');

  RETURN jsonb_build_object(
    'success', true,
    'alreadyActive', false,
    'already_active', false,
    'source', 'created_session',
    'sessionId', v_session.id,
    'session_id', v_session.id,
    'tableId', p_table_id,
    'table_id', p_table_id,
    'status', v_session.status::text,
    'currentTurnUserId', v_session.current_turn_user_id,
    'current_turn_user_id', v_session.current_turn_user_id,
    'turnUserId', v_session.current_turn_user_id,
    'turnDurationSeconds', v_session.turn_duration_seconds,
    'turnDeadlineAt', v_session.turn_expires_at,
    'turn_deadline_at', v_session.turn_expires_at,
    'turnDeadline', v_session.turn_expires_at,
    'gameState', v_session.current_state,
    'game_state', v_session.current_state,
    'players', v_players
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(uuid, jsonb, integer, uuid) TO authenticated, service_role, anon;


-- 2. ACTUALIZACIÓN DE EXPIRE_GAME_TURN_SECURE CON SOPORTE PARA PIEDRA, PAPEL O TIJERA (RPS)
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
  v_p RECORD;
  -- Variables específicas para RPS
  v_p1_id UUID;
  v_p2_id UUID;
  v_secret_choices JSONB;
  v_p1_committed BOOLEAN := false;
  v_p2_committed BOOLEAN := false;
  v_winner_id UUID := NULL;
  v_loser_id UUID := NULL;
  v_idempotency_key TEXT;
  v_new_state JSONB;
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
    -- Solo aplica timeout si está en fase de compromiso
    IF COALESCE(v_state->>'status', '') NOT IN ('ROUND_COMMIT', 'selecting') AND
       COALESCE(v_state->>'phase', '') NOT IN ('ROUND_COMMIT', 'selecting') THEN
      RETURN jsonb_build_object('success', true, 'action', 'NOT_IN_COMMIT_PHASE', 'status', v_state->>'status');
    END IF;

    v_curr_round := COALESCE((v_state->>'roundNumber')::int, (v_state->>'round')::int, 1);
    v_idempotency_key := 'rps_timeout_' || p_session_id::text || '_rnd_' || v_curr_round::text;

    v_p1_id := NULLIF(TRIM(v_state->>'player1Id'), '')::uuid;
    v_p2_id := NULLIF(TRIM(v_state->>'player2Id'), '')::uuid;

    IF v_p1_id IS NULL THEN
      SELECT user_id INTO v_p1_id
      FROM public.game_table_players
      WHERE table_id = v_session.table_id
        AND status NOT IN ('LEFT')
      ORDER BY seat_number ASC, joined_at ASC
      LIMIT 1;
    END IF;

    IF v_p2_id IS NULL THEN
      SELECT user_id INTO v_p2_id
      FROM public.game_table_players
      WHERE table_id = v_session.table_id
        AND user_id != v_p1_id
        AND status NOT IN ('LEFT')
      ORDER BY seat_number ASC, joined_at ASC
      LIMIT 1;
    END IF;

    -- Obtener selecciones secretas autoritativas
    SELECT secret_state->'rps_choices' INTO v_secret_choices
    FROM public.game_session_secrets
    WHERE session_id = p_session_id;

    v_p1_committed := (v_secret_choices ? v_p1_id::text) OR
                      COALESCE((v_state->'playerChoices'->(v_p1_id::text)->>'committed')::boolean, false);
    v_p2_committed := (v_secret_choices ? v_p2_id::text) OR
                      COALESCE((v_state->'playerChoices'->(v_p2_id::text)->>'committed')::boolean, false);

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
      v_new_state := v_state || jsonb_build_object(
        'winnerUserId', v_winner_id,
        'abandonedBy', v_loser_id,
        'status', 'MATCH_ENDED',
        'phase', 'match_ended'
      );

      UPDATE public.game_sessions
      SET current_state = v_new_state,
          status = 'FINISHED'::session_status_enum,
          winner_user_id = v_winner_id,
          turn_deadline_at = NULL,
          turn_expires_at = NULL,
          current_turn_user_id = NULL,
          updated_at = NOW()
      WHERE id = p_session_id;

      PERFORM public.universal_settle_game_session(
        p_session_id,
        ARRAY[v_winner_id],
        NULL::int,
        v_idempotency_key
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'RPS_TIMEOUT_SETTLED',
        'winnerUserId', v_winner_id,
        'abandonedBy', v_loser_id
      );
    ELSE
      -- Ninguno comprometió la jugada antes de que venciera el tiempo: reembolso íntegro
      v_new_state := v_state || jsonb_build_object(
        'cancelReason', 'ROUND_TIMEOUT_NO_CHOICES',
        'status', 'MATCH_CANCELLED'
      );

      UPDATE public.game_sessions
      SET current_state = v_new_state,
          status = 'CANCELLED'::session_status_enum,
          turn_deadline_at = NULL,
          turn_expires_at = NULL,
          current_turn_user_id = NULL,
          updated_at = NOW()
      WHERE id = p_session_id;

      PERFORM public.refund_game_session(
        p_session_id,
        'Tiempo de ronda agotado sin jugadas de ningún participante',
        v_idempotency_key
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'RPS_TIMEOUT_REFUNDED'
      );
    END IF;
  END IF;

  -- =========================================================================
  -- JUEGOS SECUENCIALES TRADICIONALES
  -- =========================================================================
  v_turn_user_id := COALESCE(
    v_session.current_turn_user_id,
    (v_state->>'turnUserId')::UUID,
    (v_state->>'currentTurnUserId')::UUID
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

  -- TIC TAC TOE / LA VIEJA
  IF v_game_type_str IN ('TIC_TAC_TOE', 'TICTACTOE', 'LA_VIEJA') THEN
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

  -- DEMÁS JUEGOS SECUENCIALES: Rotación estándar
  v_state := v_state || jsonb_build_object(
    'currentTurnUserId', v_opponent_id,
    'turnUserId', v_opponent_id,
    'turnDeadline', v_new_deadline
  );

  UPDATE public.game_sessions
  SET current_state = v_state,
      current_turn_user_id = v_opponent_id,
      turn_deadline_at = v_new_deadline,
      turn_expires_at = v_new_deadline,
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'TURN_ROTATED',
    'expiredUserId', v_turn_user_id,
    'nextTurnUserId', v_opponent_id,
    'turnDeadlineAt', v_new_deadline
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure(uuid) TO authenticated, service_role, anon;
