-- ==============================================================================
-- RASPANDO LA OLLA — ACTUALIZAR RPC PARA SORTEO MANUAL ÚNICAMENTE
-- ==============================================================================
-- El sorteo automático ahora lo maneja la Edge Function / Cron server-side
-- Este RPC se utiliza para extracciones manuales autorizadas
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_draw_bingo_ball_secure(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_state JSONB;
  v_drawn_balls JSONB;
  v_available_balls INTEGER[];
  v_new_ball INTEGER;
  v_new_state JSONB;
  v_is_automated BOOLEAN;
  v_variant TEXT;
  v_max_ball INTEGER;
BEGIN
  -- 1. Verificar autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 2. Obtener sesión activa
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id AND status IN ('ACTIVE', 'PLAYING', 'DRAWING', 'WAITING');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- 3. Obtener información de la mesa
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id;

  -- 4. Verificar si la mesa es automatizada
  v_is_automated := COALESCE((v_table.config->>'automated')::boolean, false);

  -- Si es automatizada, solo el sistema o el host para testing/forzado puede extraer balotas
  IF v_is_automated THEN
    IF v_table.host_user_id != v_user_id AND NOT public.is_operator_or_above(v_user_id) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'AUTOMATED_TABLE',
        'message', 'Esta mesa usa sorteo automático server-side.'
      );
    END IF;
  ELSE
    -- Para mesas manuales, verificar que el usuario sea el host u operador
    IF v_table.host_user_id != v_user_id THEN
      IF NOT public.is_operator_or_above(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED');
      END IF;
    END IF;
  END IF;

  -- 5. Obtener estado actual
  v_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_drawn_balls := COALESCE(v_state->'drawnBalls', '[]'::jsonb);
  v_variant := COALESCE(v_state->>'variant', '75');

  v_max_ball := CASE 
    WHEN v_variant = '75' THEN 75
    WHEN v_variant = '80' THEN 80
    WHEN v_variant = '90' THEN 90
    ELSE 75
  END;

  -- Generar array de bolas disponibles
  SELECT array_agg(n) INTO v_available_balls
  FROM generate_series(1, v_max_ball) AS n
  WHERE NOT (v_drawn_balls @> to_jsonb(n));

  IF v_available_balls IS NULL OR array_length(v_available_balls, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALL_BALLS_DRAWN');
  END IF;

  -- 6. Seleccionar bola aleatoria
  v_new_ball := v_available_balls[floor(random() * array_length(v_available_balls, 1) + 1)::int];

  -- 7. Actualizar estado
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
    '"DRAWING"'::jsonb
  );

  -- 8. Actualizar en base de datos
  UPDATE public.game_sessions
  SET 
    current_state = v_new_state,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- 9. Registrar acción manual
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    action_data,
    is_valid
  ) VALUES (
    p_session_id,
    v_user_id,
    'DRAW_BALL',
    jsonb_build_object(
      'ball', v_new_ball,
      'variant', v_variant,
      'totalDrawn', jsonb_array_length(v_new_state->'drawnBalls'),
      'manual', true
    ),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'ball', v_new_ball,
    'variant', v_variant,
    'totalDrawn', jsonb_array_length(v_new_state->'drawnBalls'),
    'manual', true
  );
END;
$$;

-- Otorgar permisos
REVOKE EXECUTE ON FUNCTION public.rpc_draw_bingo_ball_secure(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_draw_bingo_ball_secure(UUID) TO authenticated;
