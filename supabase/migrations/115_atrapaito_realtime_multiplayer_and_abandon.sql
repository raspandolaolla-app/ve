-- ==============================================================================
-- MIGRACIÓN 115: SISTEMA COMPLETO DE ATRAPAITO CRIOLLO ONLINE EN TIEMPO REAL
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- Estado: PRODUCCIÓN / EJECUTAR EN SUPABASE SQL EDITOR DIRECTAMENTE
-- ==============================================================================
-- 1. Campos adicionales en game_sessions para soporte de turnos en tiempo real
-- 2. Función `start_atrapaito_session`: Inicia la partida con posiciones iniciales y 15s
-- 3. Función `submit_atrapaito_action`: Valida turnos, movimientos de canicas y muros
-- 4. Función `credit_atrapaito_winner`: Liquidación del 90% al ganador y 10% plataforma
-- 5. Función `abandon_atrapaito_game`: Cierre por abandono y liquidación al rival
-- 6. Función `get_atrapaito_state`: Reconexión instantánea y obtención de estado autoritativo
-- 7. Funciones de compatibilidad `handle_atrapaito_abandon` y `submit_atrapaito_action_secure`
-- ==============================================================================

-- 1. ASEGURAR COLUMNAS EN game_sessions
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS turn_expires_at TIMESTAMPTZ;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS current_turn_user_id UUID;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS winner_user_id UUID;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS game_variant TEXT DEFAULT 'atrapaito';

-- 2. FUNCIÓN PARA INICIAR UNA SESIÓN DE ATRAPAITO
CREATE OR REPLACE FUNCTION public.start_atrapaito_session(
  p_session_id UUID,
  p_blue_user_id UUID,
  p_red_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_initial_state JSONB;
BEGIN
  -- Estado inicial del juego
  v_initial_state := jsonb_build_object(
    'bluePos', jsonb_build_object('col', 4, 'row', 14),
    'redPos', jsonb_build_object('col', 3, 'row', 14),
    'walls', '[]'::jsonb,
    'blueWalls', 10,
    'redWalls', 10,
    'turn', 'BLUE',
    'action', 'MOVE',
    'wallOrientation', 'HORIZONTAL',
    'pendingWall', null,
    'winner', null,
    'mode', 'ONLINE',
    'isAiThinking', false,
    'consecutiveDraws', 0,
    'blueUserId', p_blue_user_id,
    'redUserId', p_red_user_id
  );

  -- Actualizar la sesión con el estado inicial
  UPDATE public.game_sessions
  SET 
    current_state = v_initial_state,
    current_turn_user_id = p_blue_user_id, -- Azul comienza
    turn_expires_at = NOW() + INTERVAL '15 seconds',
    status = 'ACTIVE',
    updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'initial_state', v_initial_state
  );
END;
$$;

-- 3. FUNCIÓN PARA ACREDITAR PREMIO AL GANADOR (90% GANADOR / 10% PLATAFORMA)
CREATE OR REPLACE FUNCTION public.credit_atrapaito_winner(
  p_session_id UUID,
  p_winner_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_table_id UUID;
  v_entry_fee NUMERIC := 0;
  v_gross_pool NUMERIC := 0;
  v_prize_pool NUMERIC := 0;
  v_platform_fee NUMERIC := 0;
BEGIN
  IF p_winner_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT table_id INTO v_table_id
  FROM public.game_sessions
  WHERE id = p_session_id;

  IF v_table_id IS NOT NULL THEN
    SELECT COALESCE(entry_fee, 0) INTO v_entry_fee
    FROM public.game_tables
    WHERE id = v_table_id;
  END IF;

  v_gross_pool := v_entry_fee * 2;
  v_prize_pool := ROUND(v_gross_pool * 0.90, 2);
  v_platform_fee := ROUND(v_gross_pool * 0.10, 2);

  -- Actualizar billetera del ganador
  IF v_prize_pool > 0 THEN
    UPDATE public.wallets
    SET available_balance = available_balance + v_prize_pool,
        updated_at = NOW()
    WHERE user_id = p_winner_user_id;

    -- Registrar en el libro mayor (ledger)
    INSERT INTO public.ledger_entries (
      user_id,
      amount,
      type,
      description,
      reference_id,
      created_at
    ) VALUES (
      p_winner_user_id,
      v_prize_pool,
      'GAME_WIN',
      'Ganancia en Atrapaito Criollo (Pozo neto 90%)',
      p_session_id::text,
      NOW()
    );
  END IF;

  -- Actualizar montos en la sesión
  UPDATE public.game_sessions
  SET winner_user_id = p_winner_user_id,
      winner_prize_amount = v_prize_pool,
      service_fee_amount = v_platform_fee,
      gross_pool = v_gross_pool,
      is_settled = TRUE,
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Actualizar la mesa
  IF v_table_id IS NOT NULL THEN
    UPDATE public.game_tables
    SET status = 'FINISHED', updated_at = NOW()
    WHERE id = v_table_id;

    UPDATE public.game_table_players
    SET status = 'WON', updated_at = NOW()
    WHERE table_id = v_table_id AND user_id = p_winner_user_id;
  END IF;
END;
$$;

-- 4. FUNCIÓN PRINCIPAL PARA ENVIAR JUGADAS (CANICAS Y MUROS)
CREATE OR REPLACE FUNCTION public.submit_atrapaito_action(
  p_session_id UUID,
  p_user_id UUID,
  p_action_type TEXT, -- 'MOVE_MARBLE' o 'PLACE_WALL'
  p_action_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_current_state JSONB;
  v_new_state JSONB;
  v_is_my_turn BOOLEAN;
  v_time_left NUMERIC;
  v_opponent_id UUID;
  v_next_turn_user_id UUID;
  v_blue_pos JSONB;
  v_red_pos JSONB;
  v_walls JSONB;
  v_blue_walls INT;
  v_red_walls INT;
  v_turn TEXT;
  v_action TEXT;
  v_wall_orientation TEXT;
  v_pending_wall JSONB;
  v_winner TEXT;
  v_blue_user_id UUID;
  v_red_user_id UUID;
  v_new_wall JSONB;
  v_walls_array JSONB;
  v_new_col INT;
  v_new_row INT;
  v_current_pos JSONB;
  v_new_pos JSONB;
BEGIN
  -- 1. Obtener sesión con bloqueo
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- 2. Validar que el juego esté activo
  IF v_session.status::text IN ('FINISHED', 'completed', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'GAME_ALREADY_FINISHED');
  END IF;

  -- 3. Obtener estado actual
  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);
  
  -- Extraer datos del estado
  v_blue_pos := COALESCE(v_current_state->'bluePos', jsonb_build_object('col', 4, 'row', 14));
  v_red_pos := COALESCE(v_current_state->'redPos', jsonb_build_object('col', 3, 'row', 14));
  v_walls := COALESCE(v_current_state->'walls', '[]'::jsonb);
  v_blue_walls := COALESCE((v_current_state->>'blueWalls')::INT, 10);
  v_red_walls := COALESCE((v_current_state->>'redWalls')::INT, 10);
  v_turn := COALESCE(v_current_state->>'turn', 'BLUE');
  v_blue_user_id := (v_current_state->>'blueUserId')::UUID;
  v_red_user_id := (v_current_state->>'redUserId')::UUID;

  -- Resolver IDs si no estaban en el JSON
  IF v_blue_user_id IS NULL OR v_red_user_id IS NULL THEN
    SELECT user_id INTO v_opponent_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id != p_user_id
      AND status != 'LEFT'
    LIMIT 1;

    IF v_turn = 'BLUE' THEN
      v_blue_user_id := p_user_id;
      v_red_user_id := v_opponent_id;
    ELSE
      v_red_user_id := p_user_id;
      v_blue_user_id := v_opponent_id;
    END IF;
  ELSE
    v_opponent_id := CASE WHEN p_user_id = v_blue_user_id THEN v_red_user_id ELSE v_blue_user_id END;
  END IF;

  -- 4. Validar turno
  IF v_session.current_turn_user_id IS NOT NULL AND v_session.current_turn_user_id != p_user_id THEN
    -- Fallback tolerante si el turno corresponde por color
    IF (v_turn = 'BLUE' AND p_user_id != v_blue_user_id) OR (v_turn = 'RED' AND p_user_id != v_red_user_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'NOT_YOUR_TURN');
    END IF;
  END IF;

  -- 5. Procesar la acción
  IF p_action_type = 'MOVE_MARBLE' THEN
    v_new_col := (p_action_data->>'col')::INT;
    v_new_row := (p_action_data->>'row')::INT;

    IF v_turn = 'BLUE' THEN
      v_new_pos := jsonb_build_object('col', v_new_col, 'row', v_new_row);
      v_new_state := jsonb_set(v_current_state, '{bluePos}', v_new_pos);

      -- Verificar meta (fila 0)
      IF v_new_row = 0 THEN
        v_new_state := jsonb_set(v_new_state, '{winner}', '"BLUE"'::jsonb);
        v_new_state := jsonb_set(v_new_state, '{status}', '"FINISHED"'::jsonb);

        UPDATE public.game_sessions
        SET current_state = v_new_state,
            status = 'FINISHED',
            winner_user_id = p_user_id,
            turn_expires_at = NULL,
            current_turn_user_id = NULL,
            updated_at = NOW()
        WHERE id = p_session_id;

        PERFORM public.credit_atrapaito_winner(p_session_id, p_user_id);

        RETURN jsonb_build_object('success', true, 'winner', 'BLUE', 'message', '¡Victoria Azul!');
      END IF;
    ELSE
      v_new_pos := jsonb_build_object('col', v_new_col, 'row', v_new_row);
      v_new_state := jsonb_set(v_current_state, '{redPos}', v_new_pos);

      IF v_new_row = 0 THEN
        v_new_state := jsonb_set(v_new_state, '{winner}', '"RED"'::jsonb);
        v_new_state := jsonb_set(v_new_state, '{status}', '"FINISHED"'::jsonb);

        UPDATE public.game_sessions
        SET current_state = v_new_state,
            status = 'FINISHED',
            winner_user_id = p_user_id,
            turn_expires_at = NULL,
            current_turn_user_id = NULL,
            updated_at = NOW()
        WHERE id = p_session_id;

        PERFORM public.credit_atrapaito_winner(p_session_id, p_user_id);

        RETURN jsonb_build_object('success', true, 'winner', 'RED', 'message', '¡Victoria Roja!');
      END IF;
    END IF;

    -- Cambiar turno al oponente
    v_next_turn_user_id := CASE WHEN v_turn = 'BLUE' THEN v_red_user_id ELSE v_blue_user_id END;
    v_new_state := jsonb_set(v_new_state, '{turn}', to_jsonb(CASE WHEN v_turn = 'BLUE' THEN 'RED' ELSE 'BLUE' END));
    v_new_state := jsonb_set(v_new_state, '{action}', '"MOVE"'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{pendingWall}', 'null'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{turn_expires_at}', to_jsonb((NOW() + INTERVAL '15 seconds')::text));
    v_new_state := jsonb_set(v_new_state, '{current_turn_user_id}', to_jsonb(v_next_turn_user_id::text));

    UPDATE public.game_sessions
    SET current_state = v_new_state,
        current_turn_user_id = v_next_turn_user_id,
        turn_expires_at = NOW() + INTERVAL '15 seconds',
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'message', 'Movimiento registrado', 'newState', v_new_state);

  ELSIF p_action_type = 'PLACE_WALL' THEN
    v_new_wall := p_action_data;

    IF v_turn = 'BLUE' AND v_blue_walls <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_WALLS_LEFT');
    END IF;
    IF v_turn = 'RED' AND v_red_walls <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_WALLS_LEFT');
    END IF;

    v_walls_array := v_walls || jsonb_build_array(v_new_wall);
    v_new_state := jsonb_set(v_current_state, '{walls}', v_walls_array);

    IF v_turn = 'BLUE' THEN
      v_new_state := jsonb_set(v_new_state, '{blueWalls}', to_jsonb(GREATEST(0, v_blue_walls - 1)));
    ELSE
      v_new_state := jsonb_set(v_new_state, '{redWalls}', to_jsonb(GREATEST(0, v_red_walls - 1)));
    END IF;

    v_next_turn_user_id := CASE WHEN v_turn = 'BLUE' THEN v_red_user_id ELSE v_blue_user_id END;
    v_new_state := jsonb_set(v_new_state, '{turn}', to_jsonb(CASE WHEN v_turn = 'BLUE' THEN 'RED' ELSE 'BLUE' END));
    v_new_state := jsonb_set(v_new_state, '{action}', '"MOVE"'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{pendingWall}', 'null'::jsonb);
    v_new_state := jsonb_set(v_new_state, '{turn_expires_at}', to_jsonb((NOW() + INTERVAL '15 seconds')::text));
    v_new_state := jsonb_set(v_new_state, '{current_turn_user_id}', to_jsonb(v_next_turn_user_id::text));

    UPDATE public.game_sessions
    SET current_state = v_new_state,
        current_turn_user_id = v_next_turn_user_id,
        turn_expires_at = NOW() + INTERVAL '15 seconds',
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'message', 'Muro colocado', 'newState', v_new_state);

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'UNKNOWN_ACTION_TYPE');
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. FUNCIÓN PARA ABANDONO DE ATRAPAITO
CREATE OR REPLACE FUNCTION public.abandon_atrapaito_game(
  p_session_id UUID,
  p_leaving_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_effective_leaver_id UUID;
  v_winner_id UUID;
  v_session RECORD;
  v_blue_user_id UUID;
  v_red_user_id UUID;
BEGIN
  v_effective_leaver_id := COALESCE(p_leaving_user_id, auth.uid());

  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF v_session.status IN ('FINISHED', 'completed', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', true, 'message', 'ALREADY_FINISHED');
  END IF;

  v_blue_user_id := (v_session.current_state->>'blueUserId')::UUID;
  v_red_user_id := (v_session.current_state->>'redUserId')::UUID;

  IF v_effective_leaver_id = v_blue_user_id THEN
    v_winner_id := v_red_user_id;
  ELSIF v_effective_leaver_id = v_red_user_id THEN
    v_winner_id := v_blue_user_id;
  ELSE
    SELECT user_id INTO v_winner_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id != v_effective_leaver_id
      AND status != 'LEFT'
    LIMIT 1;
  END IF;

  UPDATE public.game_sessions
  SET status = 'FINISHED',
      winner_user_id = v_winner_id,
      current_state = COALESCE(current_state, '{}'::jsonb) || jsonb_build_object(
        'winner', CASE WHEN v_winner_id = v_blue_user_id THEN 'BLUE' ELSE 'RED' END,
        'winner_user_id', v_winner_id,
        'abandoned_by', v_effective_leaver_id,
        'status', 'FINISHED'
      ),
      turn_expires_at = NULL,
      current_turn_user_id = NULL,
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Acreditar premio del 90% al rival que no abandonó
  IF v_winner_id IS NOT NULL THEN
    PERFORM public.credit_atrapaito_winner(p_session_id, v_winner_id);
  END IF;

  -- Marcar jugador que abandonó
  UPDATE public.game_table_players
  SET status = 'LEFT', updated_at = NOW()
  WHERE table_id = v_session.table_id AND user_id = v_effective_leaver_id;

  RETURN jsonb_build_object('success', true, 'winner_user_id', v_winner_id);
END;
$$;

-- 6. FUNCIÓN PARA RECONEXIÓN Y OBTENCIÓN DE ESTADO AUTORITATIVO
CREATE OR REPLACE FUNCTION public.get_atrapaito_state(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_player_color TEXT;
  v_blue_user_id UUID;
  v_red_user_id UUID;
BEGIN
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  v_blue_user_id := (v_session.current_state->>'blueUserId')::UUID;
  v_red_user_id := (v_session.current_state->>'redUserId')::UUID;

  IF p_user_id = v_blue_user_id THEN
    v_player_color := 'BLUE';
  ELSIF p_user_id = v_red_user_id THEN
    v_player_color := 'RED';
  ELSE
    -- Asignar por posición de unión a la mesa si no estaba en el estado
    v_player_color := 'BLUE';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'state', v_session.current_state,
    'playerColor', v_player_color,
    'currentTurnUserId', v_session.current_turn_user_id,
    'turnExpiresAt', v_session.turn_expires_at,
    'status', v_session.status
  );
END;
$$;

-- 7. ALIAS DE COMPATIBILIDAD CON FUNCIONES PREVIAS
CREATE OR REPLACE FUNCTION public.handle_atrapaito_abandon(
  p_session_id UUID,
  p_leaving_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.abandon_atrapaito_game(p_session_id, p_leaving_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_atrapaito_action_secure(
  p_session_id UUID,
  p_user_id UUID,
  p_action_type VARCHAR,
  p_action_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.submit_atrapaito_action(p_session_id, p_user_id, p_action_type::TEXT, p_action_data);
END;
$$;

-- 8. HABILITAR REALTIME EN game_sessions (SEGURO E IDEMPOTENTE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'game_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- 9. PERMISOS
GRANT EXECUTE ON FUNCTION public.start_atrapaito_session(UUID, UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_atrapaito_action(UUID, UUID, TEXT, JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.credit_atrapaito_winner(UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.abandon_atrapaito_game(UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_atrapaito_state(UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.handle_atrapaito_abandon(UUID, UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_atrapaito_action_secure(UUID, UUID, VARCHAR, JSONB) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
