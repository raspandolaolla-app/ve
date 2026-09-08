-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 110: AGREGAR IDEMPOTENCY_KEY A SERVER_BINGO_OPERATION
-- ==============================================================================
-- Parchea la función legacy server_bingo_operation agregando la columna obligatoria
-- NOT NULL idempotency_key en el INSERT a public.game_actions.
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
  v_has_updated_at BOOLEAN;
  v_next_sequence INT;
  v_action_payload JSONB;
  v_state_hash TEXT;
BEGIN
  IF p_operation != 'draw_ball' THEN
    RAISE EXCEPTION 'INVALID_OPERATION: Use ''draw_ball''';
  END IF;

  SELECT id, current_state, status INTO v_session
  FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;

  IF v_session.status::text NOT IN ('ACTIVE', 'IN_PROGRESS', 'playing', 'SALES', 'WAITING', 'READY', 'DRAWING') THEN
    RAISE EXCEPTION 'SESSION_NOT_ACTIVE';
  END IF;

  v_current_state := v_session.current_state;
  v_drawn_balls := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_current_state->'drawnBalls')::INT), '{}'::INT[]);
  v_total_balls := COALESCE((v_current_state->>'totalBalls')::INT, 90);
  v_last_drawn_at := (v_current_state->>'lastDrawnAt')::TIMESTAMPTZ;

  IF v_last_drawn_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_drawn_at));
    IF v_seconds_since_last < 4.0 THEN
      RAISE EXCEPTION 'TOO_FAST: Debes esperar 4 segundos.';
    END IF;
  END IF;

  IF array_length(v_drawn_balls, 1) >= v_total_balls THEN
    RAISE EXCEPTION 'BINGO_COMPLETE';
  END IF;

  SELECT array_agg(n) INTO v_available_balls
  FROM generate_series(1, v_total_balls) AS n WHERE NOT (n = ANY(v_drawn_balls));

  SELECT n INTO v_new_ball FROM unnest(v_available_balls) AS n ORDER BY random() LIMIT 1;

  v_current_state := jsonb_set(v_current_state, '{currentBall}', to_jsonb(v_new_ball));
  v_current_state := jsonb_set(v_current_state, '{drawnBalls}', COALESCE(v_current_state->'drawnBalls', '[]'::jsonb) || to_jsonb(v_new_ball));
  v_current_state := jsonb_set(v_current_state, '{lastDrawnAt}', to_jsonb(NOW()));

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_sessions' AND column_name = 'updated_at') INTO v_has_updated_at;

  IF v_has_updated_at THEN
    UPDATE public.game_sessions SET current_state = v_current_state, updated_at = NOW() WHERE id = p_session_id;
  ELSE
    UPDATE public.game_sessions SET current_state = v_current_state WHERE id = p_session_id;
  END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_sequence FROM public.game_actions WHERE session_id = p_session_id;

  v_action_payload := jsonb_build_object('ball_number', v_new_ball, 'drawn_at', NOW());
  v_state_hash := md5(v_action_payload::text || p_session_id::text || v_new_ball::text);

  -- Inserción autoritativa con todas las columnas NOT NULL satisfechas
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    payload,
    server_state_hash,
    idempotency_key,
    created_at,
    sequence_number
  ) VALUES (
    p_session_id,
    COALESCE(p_user_id, auth.uid()),
    'DRAW_BALL',
    v_action_payload,
    v_state_hash,
    gen_random_uuid()::text,
    NOW(),
    v_next_sequence
  );

  RETURN jsonb_build_object('success', true, 'ball_number', v_new_ball, 'remaining_balls', v_total_balls - array_length(v_drawn_balls, 1) - 1);

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.server_bingo_operation(TEXT, UUID, UUID) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
