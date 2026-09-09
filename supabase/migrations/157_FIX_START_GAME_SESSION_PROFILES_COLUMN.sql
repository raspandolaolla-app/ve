-- ==============================================================================
-- MIGRACIÓN 157: CORRECCIÓN DEFINITIVA DE START_GAME_SESSION_SECURE
-- ==============================================================================
-- 1. Corrige 'p.username' inexistente en public.profiles reemplazándolo por
--    COALESCE(NULLIF(TRIM(p.display_name), ''), NULLIF(TRIM(p.first_name || ' ' || COALESCE(p.last_name, '')), ''), NULLIF(TRIM(p.nombre_real), ''), 'Jugador ' || gtp.seat_number)
-- 2. Corrige el cast erróneo 'table_player_status_enum' por el enum canónico real 'player_table_status_enum'.
-- ==============================================================================

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
  v_effective_turn_user_id := COALESCE(
    p_initial_turn_user_id,
    (p_initial_state->>'turnUserId')::uuid,
    (p_initial_state->>'currentTurnUserId')::uuid
  );

  IF v_effective_turn_user_id IS NULL AND v_players IS NOT NULL AND jsonb_array_length(v_players) > 0 THEN
    v_effective_turn_user_id := (v_players->0->>'user_id')::uuid;
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
    'source', 'created_new_db_session',
    'sessionId', v_session.id,
    'session_id', v_session.id,
    'tableId', p_table_id,
    'table_id', p_table_id,
    'status', v_session.status::text,
    'currentTurnUserId', v_effective_turn_user_id,
    'current_turn_user_id', v_effective_turn_user_id,
    'turnUserId', v_effective_turn_user_id,
    'turnDurationSeconds', v_effective_duration,
    'turnDeadlineAt', v_deadline,
    'turn_deadline_at', v_deadline,
    'turnDeadline', v_deadline,
    'gameState', v_initial_state,
    'game_state', v_initial_state,
    'players', v_players
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(uuid, jsonb, integer, uuid) TO authenticated, service_role, anon;
