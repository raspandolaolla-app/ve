-- ==============================================================================
-- MIGRACIÓN 102: Bingo 100% Server-Authoritative Draw Engine
-- ==============================================================================
-- Asegura que la extracción de balotas se realice de forma autoritativa en el servidor
-- sin depender del cliente web, emitiendo eventos a game_actions para Realtime.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.server_bingo_operation(
  p_session_id UUID,
  p_operation TEXT DEFAULT 'draw_ball',
  p_user_id UUID DEFAULT NULL
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
  v_variant TEXT;
  v_caller_id UUID;
BEGIN
  -- 1. Obtener sesión activa de Bingo
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id 
    AND status::text IN ('ACTIVE', 'PLAYING', 'DRAWING', 'in_progress', 'WAITING');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND_OR_INACTIVE');
  END IF;

  -- 2. Obtener información de la mesa
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  -- 3. Verificar que la mesa sea de Bingo
  IF UPPER(v_table.game_type::text) != 'BINGO' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_BINGO_TABLE');
  END IF;

  -- 4. Obtener estado actual
  v_state := COALESCE(v_session.current_state, '{}'::jsonb);

  -- Si la sesión ya tiene un ganador o está terminada, detener sorteo
  IF (v_state->>'winnerUserId') IS NOT NULL OR (v_state->>'status') = 'finished' THEN
    RETURN jsonb_build_object('success', false, 'error', 'GAME_ALREADY_FINISHED');
  END IF;

  v_drawn_balls := COALESCE(v_state->'drawnBalls', '[]'::jsonb);
  v_variant := COALESCE(v_state->>'variant', '75');
  
  -- 5. Determinar máximo de bolas según variante
  v_max_ball := CASE 
    WHEN v_variant = '75' THEN 75
    WHEN v_variant = '80' THEN 80
    WHEN v_variant = '90' THEN 90
    ELSE 75
  END;

  -- 6. Generar array de bolas disponibles
  SELECT array_agg(n) INTO v_available_balls
  FROM generate_series(1, v_max_ball) AS n
  WHERE NOT (v_drawn_balls @> to_jsonb(n));

  IF v_available_balls IS NULL OR array_length(v_available_balls, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALL_BALLS_DRAWN', 'totalDrawn', jsonb_array_length(v_drawn_balls));
  END IF;

  -- 7. Seleccionar bola aleatoria criptográficamente segura o pseudoaleatoria
  v_new_ball := v_available_balls[floor(random() * array_length(v_available_balls, 1) + 1)::int];

  -- 8. Construir nuevo estado
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

  v_new_state := jsonb_set(
    v_new_state,
    '{status}',
    '"PLAYING"'::jsonb
  );

  v_new_state := jsonb_set(
    v_new_state,
    '{lastActionLog}',
    to_jsonb('🎱 Balota cantada por el Servidor: ' || v_new_ball::text)
  );

  -- 9. Actualizar sesión en base de datos
  UPDATE public.game_sessions
  SET 
    current_state = v_new_state,
    status = 'ACTIVE',
    updated_at = NOW()
  WHERE id = p_session_id;

  -- 10. Registrar acción en auditoría y emisión Realtime
  v_caller_id := COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    action_data,
    is_valid,
    created_at
  ) VALUES (
    p_session_id,
    v_caller_id,
    'DRAW_BALL',
    jsonb_build_object(
      'ball', v_new_ball,
      'ball_number', v_new_ball,
      'variant', v_variant,
      'totalDrawn', jsonb_array_length(v_new_state->'drawnBalls'),
      'serverAuthoritative', true
    ),
    true,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'ball', v_new_ball,
    'ball_number', v_new_ball,
    'variant', v_variant,
    'totalDrawn', jsonb_array_length(v_new_state->'drawnBalls')
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(UUID, TEXT, UUID) TO anon;
