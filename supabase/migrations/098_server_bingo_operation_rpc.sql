-- ==============================================================================
-- RASPANDO LA OLLA — RPC SEGURA PARA OPERACIONES DE BINGO DESDE EL SERVIDOR
-- ==============================================================================
-- Reemplaza el uso de service_role directo con una función con permisos restringidos
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.server_bingo_operation(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_table RECORD;
  v_state JSONB;
  v_drawn_balls JSONB;
  v_available_balls INTEGER[];
  v_new_ball INTEGER;
  v_new_state JSONB;
  v_max_ball INTEGER;
BEGIN
  -- 1. Obtener sesión activa
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id 
    AND status::text IN ('ACTIVE', 'PLAYING', 'DRAWING', 'in_progress');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- 2. Obtener información de la mesa
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id;

  -- 3. Verificar que la mesa sea de Bingo y automatizada
  IF UPPER(v_table.game_type::text) != 'BINGO' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_BINGO_TABLE');
  END IF;

  IF NOT COALESCE((v_table.config->>'automated')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTOMATED');
  END IF;

  -- 4. Obtener estado actual
  v_state := v_session.current_state;
  v_drawn_balls := COALESCE(v_state->'drawnBalls', '[]'::jsonb);
  
  -- 5. Determinar máximo de bolas según variante
  v_max_ball := CASE 
    WHEN (v_state->>'variant') = '75' THEN 75
    WHEN (v_state->>'variant') = '80' THEN 80
    WHEN (v_state->>'variant') = '90' THEN 90
    ELSE 75
  END;

  -- 6. Generar array de bolas disponibles
  SELECT array_agg(n) INTO v_available_balls
  FROM generate_series(1, v_max_ball) AS n
  WHERE NOT (v_drawn_balls @> to_jsonb(n));

  IF v_available_balls IS NULL OR array_length(v_available_balls, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALL_BALLS_DRAWN');
  END IF;

  -- 7. Seleccionar bola aleatoria
  v_new_ball := v_available_balls[floor(random() * array_length(v_available_balls, 1) + 1)::int];

  -- 8. Actualizar estado
  v_new_state := jsonb_set(
    v_state,
    '{drawnBalls}',
    v_drawn_balls || to_jsonb(v_new_ball)
  );

  v_new_state := jsonb_set(
    v_new_state,
    '{currentBall}',
    to_jsonb(v_new_ball)
  );

  -- 9. Actualizar en base de datos
  UPDATE public.game_sessions
  SET 
    current_state = v_new_state,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- 10. Registrar acción en auditoría
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    action_data,
    is_valid,
    created_at
  ) VALUES (
    p_session_id,
    '00000000-0000-0000-0000-000000000000', -- System user
    'DRAW_BALL',
    jsonb_build_object(
      'ball', v_new_ball,
      'ball_number', v_new_ball,
      'variant', v_state->>'variant',
      'totalDrawn', jsonb_array_length(v_new_state->'drawnBalls'),
      'serverSide', true
    ),
    true,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'ball', v_new_ball,
    'variant', v_state->>'variant',
    'totalDrawn', jsonb_array_length(v_new_state->'drawnBalls')
  );
END;
$$;

-- Otorgar permisos solo al rol de servicio (no a usuarios autenticados)
REVOKE EXECUTE ON FUNCTION public.server_bingo_operation(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.server_bingo_operation(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(UUID) TO service_role;
