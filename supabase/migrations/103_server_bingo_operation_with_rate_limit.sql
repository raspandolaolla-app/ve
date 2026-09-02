-- ==============================================================================
-- MIGRACIÓN 103: server_bingo_operation con Rate Limiting y RNG Seguro
-- ==============================================================================
-- 1. Bloquea la fila (FOR UPDATE) para prevenir condiciones de carrera.
-- 2. Valida que hayan transcurrido 4 segundos desde la última bola (Rate Limiting).
-- 3. Genera una bola aleatoria autoritativa (RNG) que no haya salido antes.
-- 4. Actualiza el estado en game_sessions y registra DRAW_BALL en game_actions
--    para propagación inmediata a todos los clientes vía Supabase Realtime.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.server_bingo_operation(
  p_operation TEXT,
  p_session_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_current_state JSONB;
  v_drawn_balls INT[];
  v_new_ball INT;
  v_total_balls INT;
  v_last_drawn_at TIMESTAMPTZ;
  v_seconds_since_last NUMERIC;
  v_available_balls INT[];
BEGIN
  -- 1. Validar operación
  IF p_operation != 'draw_ball' THEN
    RAISE EXCEPTION 'INVALID_OPERATION: Operación no soportada. Use ''draw_ball''';
  END IF;

  -- 2. Obtener y bloquear la sesión (Previene Race Conditions)
  SELECT id, current_state, status
  INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión no encontrada';
  END IF;

  IF UPPER(v_session.status::text) NOT IN ('ACTIVE', 'IN_PROGRESS', 'PLAYING', 'WAITING', 'DRAWING') THEN
    RAISE EXCEPTION 'SESSION_NOT_ACTIVE: La sesión de bingo no está activa';
  END IF;

  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);

  -- Si el juego ya tiene ganador o está finalizado, detener
  IF (v_current_state->>'winnerUserId') IS NOT NULL OR (v_current_state->>'status') = 'finished' THEN
    RAISE EXCEPTION 'GAME_ALREADY_FINISHED: La partida ya ha concluido';
  END IF;
  
  -- Extraer bolas ya cantadas (manejo seguro de JSONB a Array)
  v_drawn_balls := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_current_state->'drawnBalls')::INT), 
    '{}'::INT[]
  );
  
  -- Determinar total de bolas (75, 80 o 90, defecto 75)
  v_total_balls := COALESCE(
    (v_current_state->>'totalBalls')::INT, 
    CASE 
      WHEN (v_current_state->>'variant') = '90' THEN 90
      WHEN (v_current_state->>'variant') = '80' THEN 80
      ELSE 75
    END
  );
  
  v_last_drawn_at := (v_current_state->>'lastDrawnAt')::TIMESTAMPTZ;

  -- 3. VALIDACIÓN DE TIEMPO (Rate Limiting Server-Authoritative de 4 segundos)
  IF v_last_drawn_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_drawn_at));
    
    IF v_seconds_since_last < 4.0 THEN
      RAISE EXCEPTION 'TOO_FAST: Debes esperar 4 segundos entre cada bola. Tiempo restante: % s', ROUND(4.0 - v_seconds_since_last, 1);
    END IF;
  END IF;

  -- 4. Verificar si el juego ya terminó (todas las bolas cantadas)
  IF array_length(v_drawn_balls, 1) >= v_total_balls THEN
    RAISE EXCEPTION 'BINGO_COMPLETE: Ya se han cantado todas las bolas';
  END IF;

  -- 5. Generar bola aleatoria segura (RNG)
  -- Crea un array de bolas disponibles (1 a total_balls) excluyendo las ya sorteadas
  SELECT array_agg(n)
  INTO v_available_balls
  FROM generate_series(1, v_total_balls) AS n
  WHERE NOT (n = ANY(v_drawn_balls));

  IF v_available_balls IS NULL OR array_length(v_available_balls, 1) = 0 THEN
    RAISE EXCEPTION 'BINGO_COMPLETE: Ya se han cantado todas las bolas';
  END IF;

  -- Selecciona una aleatoria de las disponibles
  SELECT n INTO v_new_ball
  FROM unnest(v_available_balls) AS n
  ORDER BY random()
  LIMIT 1;

  -- 6. Actualizar el estado de la sesión en la base de datos
  v_current_state := jsonb_set(
    v_current_state,
    '{currentBall}',
    to_jsonb(v_new_ball)
  );
  
  v_current_state := jsonb_set(
    v_current_state,
    '{drawnBalls}',
    COALESCE(v_current_state->'drawnBalls', '[]'::jsonb) || to_jsonb(v_new_ball)
  );

  v_current_state := jsonb_set(
    v_current_state,
    '{lastDrawnAt}',
    to_jsonb(NOW())
  );

  v_current_state := jsonb_set(
    v_current_state,
    '{status}',
    '"PLAYING"'::jsonb
  );

  UPDATE public.game_sessions
  SET current_state = v_current_state,
      status = 'ACTIVE',
      updated_at = NOW()
  WHERE id = p_session_id;

  -- 7. Registrar en game_actions para auditoría y para disparar el Realtime del frontend
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    action_data,
    created_at
  ) VALUES (
    p_session_id,
    COALESCE(p_user_id, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'DRAW_BALL',
    jsonb_build_object(
      'ball_number', v_new_ball,
      'ball', v_new_ball,
      'drawn_at', NOW()
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'ball_number', v_new_ball,
    'ball', v_new_ball,
    'drawn_at', NOW(),
    'remaining_balls', v_total_balls - COALESCE(array_length(v_drawn_balls, 1), 0) - 1
  );

EXCEPTION WHEN OTHERS THEN
  -- Re-lanzar la excepción para que el frontend la reciba (ej. TOO_FAST)
  RAISE;
END;
$$;

-- Compatibilidad dual de parámetros (orden alternativo)
CREATE OR REPLACE FUNCTION public.server_bingo_operation(
  p_session_id UUID,
  p_operation TEXT DEFAULT 'draw_ball',
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.server_bingo_operation(p_operation, p_session_id, p_user_id);
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(TEXT, UUID, UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(UUID, TEXT, UUID) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
