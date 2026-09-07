-- ==============================================================================
-- MIGRACIÓN 151: RECONCILIACIÓN DEFINITIVA DE START_GAME_SESSION_SECURE,
-- PUBLIC_MATCH_HISTORY Y GET_ACTIVE_TOURNAMENTS
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- ==============================================================================

-- 1. TABLA CANÓNICA DE HISTORIAL PÚBLICO DE PARTIDAS (REALTIME)
-- Corrige el error HTTP 404 en /rest/v1/public_match_history
-- Se utilizan columnas UUID directas sin restricciones de bloqueo externo para evitar esperas de bloqueo
CREATE TABLE IF NOT EXISTS public.public_match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL,
  table_id UUID NOT NULL,
  session_id UUID NOT NULL,
  winner_user_id UUID NULL,
  winner_name_snapshot TEXT NOT NULL,
  winner_avatar_snapshot TEXT NULL,
  players_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_score JSONB NOT NULL DEFAULT '{}'::jsonb,
  victories JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary TEXT NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_match_history_finished ON public.public_match_history(finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_match_history_game ON public.public_match_history(game_type);

ALTER TABLE public.public_match_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_public_match_history_select ON public.public_match_history;
CREATE POLICY p_public_match_history_select ON public.public_match_history
  FOR SELECT TO anon, authenticated, service_role USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'public_match_history'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.public_match_history;
    END IF;
  END IF;
END $$;

-- 2. CORRECCIÓN DE AGREGACIÓN SQL EN GET_ACTIVE_TOURNAMENTS
-- Corrige el error HTTP 400 provocado por ORDER BY externo sin GROUP BY
CREATE OR REPLACE FUNCTION public.get_active_tournaments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tournaments JSONB;
BEGIN
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'description', description,
          'game_type', game_type,
          'game_variant', game_variant,
          'entry_fee', entry_fee,
          'prize_pool', prize_pool,
          'max_participants', max_participants,
          'current_participants', current_participants,
          'start_date', start_date,
          'end_date', end_date,
          'registration_deadline', registration_deadline,
          'status', status,
          'prize_distribution', prize_distribution
        ) ORDER BY start_date ASC
      )
      FROM public.tournaments
      WHERE status IN ('REGISTRATION', 'ACTIVE')
    ),
    '[]'::jsonb
  ) INTO v_tournaments;

  RETURN jsonb_build_object('success', true, 'tournaments', v_tournaments);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_tournaments() TO anon, authenticated, service_role;

-- 3. ELIMINAR SOBRECARGAS OBSOLETAS DE START_GAME_SESSION_SECURE
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, INT);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, INT, UUID);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB, INT);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB, INTEGER);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB, INT, UUID);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB, INTEGER, UUID);

-- 4. RECREACIÓN CANÓNICA AUTORITATIVA DE START_GAME_SESSION_SECURE
-- Erradica definitivamente:
-- a) 'column p.full_name does not exist' -> Utiliza columnas canónicas reales de profiles
-- b) Join erróneo por p.id -> Conecta canónicamente por p.user_id = gtp.user_id
-- c) Inserción en columnas inexistentes de game_sessions (game_id, game_state, turn_user_id)
-- d) Intento de asignación 'IN_GAME'::table_status_enum (utiliza 'ACTIVE'::table_status_enum)
-- e) Intento de actualización de columna inexistente game_started en game_tables
CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id UUID,
  p_initial_state JSONB DEFAULT NULL,
  p_turn_duration_seconds INTEGER DEFAULT 30,
  p_initial_turn_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO: Debes iniciar sesión para comenzar la partida.';
  END IF;

  -- 1. Bloquear y obtener la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MESA_NO_ENCONTRADA: La mesa especificada no existe.';
  END IF;

  -- BLOQUEO DE SEGURIDAD BACKEND: VERIFICAR DISPONIBILIDAD DEL JUEGO
  IF NOT public.is_game_enabled(v_table.game_type::text) THEN
    RAISE EXCEPTION 'GAME_DISABLED: Este juego se encuentra temporalmente deshabilitado por el administrador.';
  END IF;

  -- Obtener host de manera segura soportando host_user_id y created_by
  v_host_id := COALESCE(
    (to_jsonb(v_table)->>'host_user_id')::uuid,
    (to_jsonb(v_table)->>'created_by')::uuid
  );

  IF v_host_id IS NOT NULL AND v_host_id != v_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.game_table_players
      WHERE table_id = p_table_id AND user_id = v_user_id AND status::text IN ('JOINED', 'READY', 'PLAYING')
    ) THEN
      RAISE EXCEPTION 'NO_AUTORIZADO: Solo el creador o un jugador activo de la mesa puede iniciarla.';
    END IF;
  END IF;

  -- 2. Recolectar jugadores activos uniendo por user_id y utilizando columnas canónicas garantizadas
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', gtp.user_id,
      'user_id', gtp.user_id,
      'seat', gtp.seat_number,
      'seat_number', gtp.seat_number,
      'name', COALESCE(p.display_name, p.nombre_real, NULLIF(TRIM(p.first_name || ' ' || p.last_name), ''), 'Jugador ' || gtp.seat_number),
      'username', COALESCE(p.display_name, 'jugador_' || gtp.seat_number),
      'avatar', p.avatar_url,
      'avatar_url', p.avatar_url,
      'score', 0,
      'status', 'ACTIVE'
    ) ORDER BY gtp.seat_number ASC
  )
  INTO v_players
  FROM public.game_table_players gtp
  LEFT JOIN public.profiles p ON p.user_id = gtp.user_id
  WHERE gtp.table_id = p_table_id
    AND gtp.status::text IN ('JOINED', 'READY', 'PLAYING');

  v_unique_players := COALESCE(jsonb_array_length(v_players), 0);

  IF v_unique_players < 1 THEN
    RAISE EXCEPTION 'JUGADORES_INSUFICIENTES: No hay jugadores activos en la mesa.';
  END IF;

  -- Para juegos multijugador competitivos, requerir al menos 2 jugadores excepto en Bingo, Polla, Modo Práctica o IA
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
    WHEN p_turn_duration_seconds > 0 
    THEN NOW() + (p_turn_duration_seconds || ' seconds')::interval 
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
      'playerNames', '{}'::jsonb,
      'drawnBalls', '[]'::jsonb,
      'currentBall', NULL,
      'callIntervalMs', 4000,
      'totalBalls', CASE WHEN COALESCE((to_jsonb(v_table)->>'game_variant'), '90') = '75' THEN 75 ELSE 90 END
    );
    IF p_initial_state IS NOT NULL AND jsonb_typeof(p_initial_state) = 'object' AND p_initial_state <> '{}'::jsonb THEN
      v_initial_state := v_initial_state || p_initial_state;
    END IF;
  ELSE
    v_session_status := 'ACTIVE';
    IF p_initial_state IS NOT NULL AND jsonb_typeof(p_initial_state) = 'object' AND p_initial_state <> '{}'::jsonb THEN
      v_initial_state := p_initial_state;
    ELSE
      v_initial_state := jsonb_build_object(
        'status', 'ACTIVE',
        'gameType', v_game_type,
        'tableId', p_table_id,
        'currentTurn', v_effective_turn_user_id,
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
    v_deadline,
    v_deadline,
    NOW(),
    NOW(),
    NOW()
  ) RETURNING * INTO v_session;

  -- 7. Actualizar mesa a ACTIVE
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
  WHERE id = p_table_id;

  -- 8. Actualizar estado de jugadores activos a PLAYING
  UPDATE public.game_table_players
  SET status = 'PLAYING'::player_table_status_enum,
      updated_at = NOW()
  WHERE table_id = p_table_id
    AND status::text IN ('JOINED', 'READY');

  -- Retornar resultado integral estructurado
  RETURN jsonb_build_object(
    'success', true,
    'sessionId', v_session.id,
    'session_id', v_session.id,
    'tableId', p_table_id,
    'table_id', p_table_id,
    'status', v_session_status,
    'gameState', v_session.current_state,
    'game_state', v_session.current_state,
    'currentTurnUserId', v_effective_turn_user_id,
    'current_turn_user_id', v_effective_turn_user_id,
    'turnUserId', v_effective_turn_user_id,
    'turnDeadlineAt', v_deadline,
    'turn_deadline_at', v_deadline,
    'turnDeadline', v_deadline,
    'players', v_players,
    'alreadyActive', false,
    'already_active', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID, JSONB, INTEGER, UUID) TO authenticated, service_role, anon;
