-- ==============================================================================
-- MIGRACIÓN 067 — RESTAURAR Y ASEGURAR RPC START_GAME_SESSION_SECURE
-- ==============================================================================
-- Mantiene intactas las migraciones 001-066.
-- Garantiza la existencia de public.start_game_session_secure(p_table_id UUID)
-- con permisos para authenticated, service_role y anon, y recarga el cache
-- del esquema de PostgREST para evitar errores PGRST202.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_table RECORD;
  v_players JSONB := '[]'::jsonb;
  v_player_order JSONB := '[]'::jsonb;
  v_lives JSONB := '{}'::jsonb;
  v_scores JSONB := '{}'::jsonb;
  v_player_record RECORD;
  v_session_id UUID;
  v_first_turn_user_id UUID;
  v_initial_state JSONB;
  v_deadline TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión';
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

  IF v_table.host_user_id <> v_user_id THEN
    RAISE EXCEPTION 'ONLY_HOST_CAN_START: Únicamente el Anfitrión de la mesa puede iniciar la partida';
  END IF;

  -- Si ya existe una sesión activa o en curso, retornarla
  SELECT id INTO v_session_id
  FROM public.game_sessions
  WHERE table_id = p_table_id
    AND status IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'IN_PROGRESS');

  IF v_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', v_session_id,
      'table_id', p_table_id,
      'already_active', true
    );
  END IF;

  -- Compilar lista de jugadores activos
  FOR v_player_record IN (
    SELECT gtp.user_id, gtp.seat_number, p.display_name, p.first_name, p.last_name, p.avatar_url
    FROM public.game_table_players gtp
    JOIN public.profiles p ON p.user_id = gtp.user_id
    WHERE gtp.table_id = p_table_id
      AND gtp.status != 'LEFT'::player_table_status_enum
    ORDER BY gtp.seat_number ASC
  ) LOOP
    IF v_first_turn_user_id IS NULL THEN
      v_first_turn_user_id := v_player_record.user_id;
    END IF;

    v_player_order := v_player_order || to_jsonb(v_player_record.user_id::text);
    v_lives := jsonb_set(v_lives, ARRAY[v_player_record.user_id::text], '3'::jsonb);
    v_scores := jsonb_set(v_scores, ARRAY[v_player_record.user_id::text], '0'::jsonb);

    v_players := v_players || jsonb_build_object(
      'userId', v_player_record.user_id,
      'seatNumber', v_player_record.seat_number,
      'displayName', COALESCE(NULLIF(trim(v_player_record.display_name), ''), trim(COALESCE(v_player_record.first_name, '') || ' ' || COALESCE(v_player_record.last_name, ''))),
      'avatarUrl', v_player_record.avatar_url,
      'lives', 3
    );
  END LOOP;

  IF v_first_turn_user_id IS NULL THEN
    v_first_turn_user_id := v_user_id;
  END IF;

  v_deadline := NOW() + INTERVAL '10 seconds';
  v_session_id := gen_random_uuid();

  v_initial_state := jsonb_build_object(
    'status', 'PLAYING',
    'playerOrder', v_player_order,
    'players', v_players,
    'currentTurnUserId', v_first_turn_user_id,
    'lives', v_lives,
    'scores', v_scores,
    'round', 1
  );

  -- Crear sesión en game_sessions
  INSERT INTO public.game_sessions (
    id, table_id, game_type, session_number, status, current_state,
    current_turn_user_id, turn_deadline_at, started_at
  ) VALUES (
    v_session_id, p_table_id, v_table.game_type, 1, 'ACTIVE'::session_status_enum,
    v_initial_state, v_first_turn_user_id, v_deadline, NOW()
  );

  -- Actualizar estado de la mesa a ACTIVE
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      started_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'table_id', p_table_id,
    'current_turn_user_id', v_first_turn_user_id,
    'turn_deadline_at', v_deadline,
    'already_active', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID) TO authenticated, service_role, anon;

-- ==============================================================================
-- DIAGNÓSTICOS DE ENUMS PARA LAS PRUEBAS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_game_type_enum_values()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_values text[];
BEGIN
  SELECT COALESCE(array_agg(enumlabel::text), '{}'::text[]) INTO v_values
  FROM pg_enum
  WHERE enumtypid = 'game_type_enum'::regtype;
  
  RETURN v_values;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_game_type_enum_values() TO authenticated, service_role, anon;

CREATE OR REPLACE FUNCTION public.get_supported_game_types()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_values text[];
BEGIN
  SELECT COALESCE(array_agg(enumlabel::text), '{}'::text[]) INTO v_values
  FROM pg_enum
  WHERE enumtypid = 'game_type_enum'::regtype;
  
  RETURN v_values;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supported_game_types() TO authenticated, service_role, anon;

-- Notificar a PostgREST para actualizar el cache del esquema
NOTIFY pgrst, 'reload schema';
