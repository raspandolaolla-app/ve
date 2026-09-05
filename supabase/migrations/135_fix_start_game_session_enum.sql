-- ==============================================================================
-- MIGRACIÓN 135: FIX INICIO DE SESIÓN Y RESET DE ESTADOS CON VALORES DE ENUM VÁLIDOS
-- Proyecto: RASPANDO LA OLLA — Corrección de session_status_enum ('ACTIVE' / 'WAITING')
-- ==============================================================================

-- 1. Eliminar sobrecargas previas de start_game_session_secure para evitar conflictos de firma
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB, INT);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB, INT, UUID);

-- 2. Asegurar que las columnas turn_deadline_at y turn_expires_at existan en game_sessions
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS turn_deadline_at TIMESTAMPTZ;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS turn_expires_at TIMESTAMPTZ;

-- 3. Recrear la función canonical start_game_session_secure con soporte para 'ACTIVE' y 'WAITING'
CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id UUID,
  p_initial_state JSONB DEFAULT NULL,
  p_turn_duration_seconds INTEGER DEFAULT 30,
  p_initial_turn_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO: Debes iniciar sesión para comenzar la partida.';
  END IF;

  -- 1. Bloquear y obtener la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MESA_NO_ENCONTRADA: La mesa especificada no existe.';
  END IF;

  -- Obtener host de manera segura soportando host_user_id y created_by
  v_host_id := COALESCE(
    (to_jsonb(v_table)->>'host_user_id')::uuid,
    (to_jsonb(v_table)->>'created_by')::uuid
  );

  -- 2. Verificar que el usuario sea el host o esté en la mesa
  IF (v_host_id IS NOT NULL AND v_host_id != v_user_id) AND NOT EXISTS (
    SELECT 1 FROM public.game_table_players 
    WHERE table_id = p_table_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: No eres el host ni jugador de esta mesa.';
  END IF;

  -- 3. Verificar si ya existe una sesión activa (usando ::text para evitar errores de enum)
  SELECT * INTO v_session FROM public.game_sessions 
  WHERE table_id = p_table_id AND status::text NOT IN ('FINISHED', 'CANCELLED', 'SETTLED', 'ABANDONED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', user_id,
      'seat_number', seat_number,
      'status', status
    )) INTO v_players
    FROM public.game_table_players
    WHERE table_id = p_table_id;

    RETURN jsonb_build_object(
      'success', true,
      'alreadyActive', true,
      'source', 'existing_db_session',
      'sessionId', v_session.id,
      'tableId', p_table_id,
      'currentTurnUserId', v_session.current_turn_user_id,
      'turnDeadlineAt', COALESCE(v_session.turn_expires_at, v_session.turn_deadline_at),
      'turnExpiresAt', COALESCE(v_session.turn_expires_at, v_session.turn_deadline_at),
      'players', v_players,
      'gameState', v_session.current_state
    );
  END IF;

  -- 4. Obtener jugadores únicos en la mesa
  SELECT COUNT(DISTINCT user_id) INTO v_unique_players
  FROM public.game_table_players
  WHERE table_id = p_table_id;

  v_game_type := v_table.game_type::text;

  -- Para juegos multijugador 1v1 o grupales (salvo bingo o polla en solitario si aplica), requerir 2 jugadores
  IF lower(v_game_type) NOT IN ('bingo', 'polla') AND v_unique_players < 2 THEN
    RAISE EXCEPTION 'JUGADORES_INSUFICIENTES: Se requieren al menos 2 jugadores únicos.';
  END IF;

  -- 5. DETERMINAR ESTADO INICIAL SEGÚN TIPO DE JUEGO
  IF lower(v_game_type) = 'bingo' THEN
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
    -- Si el cliente envió un p_initial_state válido con configuración o estado previo, fusionarlo
    IF p_initial_state IS NOT NULL AND jsonb_typeof(p_initial_state) = 'object' AND p_initial_state <> '{}'::jsonb THEN
      v_initial_state := v_initial_state || p_initial_state;
    END IF;
  ELSE
    -- ✅ CORREGIDO: 'ACTIVE' es el valor válido del enum, no 'in_progress'
    v_session_status := 'ACTIVE'; 
    IF p_initial_state IS NOT NULL AND jsonb_typeof(p_initial_state) = 'object' AND p_initial_state <> '{}'::jsonb THEN
      v_initial_state := p_initial_state;
    ELSE
      v_initial_state := '{}'::jsonb;
    END IF;
  END IF;

  -- Resolver turno inicial de forma flexible
  v_effective_turn_user_id := COALESCE(
    p_initial_turn_user_id,
    (v_initial_state->>'turnUserId')::uuid,
    (v_initial_state->>'currentTurnUserId')::uuid
  );

  v_deadline := CASE 
    WHEN p_turn_duration_seconds > 0 
    THEN NOW() + (p_turn_duration_seconds || ' seconds')::INTERVAL 
    ELSE NULL 
  END;

  -- 6. Crear la sesión atómica con enum válido
  INSERT INTO public.game_sessions (
    table_id,
    game_type,
    status,
    current_state,
    current_turn_user_id,
    turn_deadline_at,
    turn_expires_at,
    created_at
  ) VALUES (
    p_table_id,
    v_table.game_type,
    v_session_status::session_status_enum,
    v_initial_state,
    v_effective_turn_user_id,
    v_deadline,
    v_deadline,
    NOW()
  ) RETURNING id, current_turn_user_id, turn_expires_at, turn_deadline_at, current_state INTO v_session;

  -- 7. Obtener jugadores para devolver
  SELECT jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'seat_number', seat_number,
    'status', status
  )) INTO v_players
  FROM public.game_table_players
  WHERE table_id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyActive', false,
    'sessionId', v_session.id,
    'tableId', p_table_id,
    'currentTurnUserId', v_session.current_turn_user_id,
    'turnDeadlineAt', COALESCE(v_session.turn_expires_at, v_session.turn_deadline_at),
    'turnExpiresAt', COALESCE(v_session.turn_expires_at, v_session.turn_deadline_at),
    'players', v_players,
    'gameState', v_session.current_state
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID, JSONB, INTEGER, UUID) TO authenticated, service_role;

-- ==============================================================================
-- SCRIPT DE RESETEO (CORREGIDO CON VALORES DE ENUM VÁLIDOS)
-- ==============================================================================

-- Resetear sesiones de Bingo que estén en 'ACTIVE' pero sin balotas extraídas
UPDATE public.game_sessions 
SET status = 'WAITING'::session_status_enum,
    current_state = current_state || '{"status": "SALES"}'::jsonb
WHERE game_type::text = 'bingo' 
  AND status::text = 'ACTIVE' -- ✅ CORREGIDO: usamos 'ACTIVE' en lugar de 'in_progress'
  AND (current_state->>'drawnBalls' IS NULL 
       OR jsonb_array_length(COALESCE(current_state->'drawnBalls', '[]'::jsonb)) = 0);

-- Resetear mesas de Bingo asociadas
UPDATE public.game_tables 
SET status = 'WAITING'::table_status_enum
WHERE game_type::text = 'bingo' 
  AND status::text = 'ACTIVE'
  AND id IN (
    SELECT table_id FROM public.game_sessions 
    WHERE game_type::text = 'bingo' AND status::text = 'WAITING'
  );

NOTIFY pgrst, 'reload schema';
