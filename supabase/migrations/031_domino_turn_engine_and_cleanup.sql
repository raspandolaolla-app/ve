-- ==============================================================================
-- MIGRACIÓN 031: MOTOR DE TURNOS CON TEMPORIZADOR DE 10S Y LIMPIEZA DE MESAS
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / EJECUTAR EN SUPABASE SQL EDITOR DIRECTAMENTE
-- ==============================================================================

-- 1. Función RPC para Limpieza Transaccional de Mesas Huérfanas
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_tables_and_sessions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_closed_tables INT := 0;
  v_cancelled_sessions INT := 0;
  v_table RECORD;
BEGIN
  -- Buscar mesas activas o abiertas donde 0 jugadores estén en estado JOINED, READY o PLAYING
  FOR v_table IN
    SELECT t.id
    FROM public.game_tables t
    WHERE t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE')
      AND NOT EXISTS (
        SELECT 1
        FROM public.game_table_players p
        WHERE p.table_id = t.id
          AND p.status IN ('JOINED', 'READY', 'PLAYING')
      )
  LOOP
    -- Cancelar sesiones activas de la mesa
    UPDATE public.game_sessions
    SET status = 'CANCELLED'::session_status_enum,
        ended_at = NOW()
    WHERE table_id = v_table.id
      AND status IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED');
    
    GET DIAGNOSTICS v_cancelled_sessions = ROW_COUNT;

    -- Cerrar la mesa
    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        current_players_count = 0,
        updated_at = NOW()
    WHERE id = v_table.id;

    v_closed_tables := v_closed_tables + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'closed_tables', v_closed_tables,
    'cancelled_sessions', v_cancelled_sessions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_tables_and_sessions() TO authenticated, anon, service_role;

-- 2. RPC para Expiración Atómica de Turno de Dominó (Timeout de 10 segundos)
CREATE OR REPLACE FUNCTION public.expire_domino_turn_secure(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_state JSONB;
  v_turn_user_id UUID;
  v_player_order JSONB;
  v_player_count INT;
  v_curr_idx INT := -1;
  v_next_idx INT;
  v_next_user_id UUID;
  v_passes_in_row INT;
  v_i INT;
  v_turn_deadline TIMESTAMPTZ;
  v_action_res JSONB;
BEGIN
  -- Bloquear sesión
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: La sesión de juego no existe';
  END IF;

  IF v_session.status NOT IN ('ACTIVE', 'READY', 'STARTING') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SESSION_NOT_ACTIVE');
  END IF;

  v_state := v_session.current_state;
  v_turn_user_id := COALESCE(
    v_session.current_turn_user_id,
    (v_state->>'turnUserId')::UUID
  );

  v_player_order := v_state->'playerOrder';
  v_player_count := jsonb_array_length(v_player_order);

  IF v_player_count IS NULL OR v_player_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'NO_PLAYERS_IN_ORDER');
  END IF;

  -- Encontrar índice del jugador actual
  FOR v_i IN 0..(v_player_count - 1) LOOP
    IF (v_player_order->>v_i)::UUID = v_turn_user_id THEN
      v_curr_idx := v_i;
      EXIT;
    END IF;
  END LOOP;

  IF v_curr_idx = -1 THEN
    v_curr_idx := 0;
  END IF;

  -- Avanzar al siguiente jugador en orden de asientos
  v_next_idx := (v_curr_idx + 1) % v_player_count;
  v_next_user_id := (v_player_order->>v_next_idx)::UUID;

  v_passes_in_row := COALESCE((v_state->>'passesInRow')::INT, 0) + 1;
  v_turn_deadline := NOW() + INTERVAL '10 seconds';

  -- Actualizar el estado JSONB con el nuevo turno
  v_state := jsonb_set(v_state, '{turnUserId}', to_jsonb(v_next_user_id::text));
  v_state := jsonb_set(v_state, '{passesInRow}', to_jsonb(v_passes_in_row));

  -- Registrar la acción de TIMEOUT en el historial atómico
  v_action_res := public.submit_game_action_secure(
    p_session_id,
    'TIMEOUT',
    jsonb_build_object('expiredUserId', v_turn_user_id, 'nextUserId', v_next_user_id),
    'timeout_' || p_session_id::text || '_' || v_turn_user_id::text || '_' || extract(epoch from now())::text
  );

  -- Actualizar la sesión con el nuevo turno y la fecha límite de 10 segundos
  UPDATE public.game_sessions
  SET current_state = v_state,
      current_turn_user_id = v_next_user_id,
      turn_deadline_at = v_turn_deadline,
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'TIMEOUT_PROCESSED',
    'expired_user_id', v_turn_user_id,
    'next_turn_user_id', v_next_user_id,
    'turn_deadline_at', v_turn_deadline
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_domino_turn_secure(UUID) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
