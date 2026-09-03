-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 109: CENTRALIZED SERVER-AUTHORITATIVE BINGO DRAW
-- ==============================================================================
-- 1. Pre-genera la secuencia completa de bolas al iniciar el sorteo.
-- 2. Bloquea ventas y establece status en 'DRAWING'.
-- 3. Revela las bolas una por una de manera autoritativa.
-- ==============================================================================

-- 0. Asegurar valor 'DRAWING' en session_status_enum si no existe
ALTER TYPE public.session_status_enum ADD VALUE IF NOT EXISTS 'DRAWING';

-- 1. Agregar columnas necesarias a game_sessions si no existen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_sessions' AND column_name = 'draw_sequence') THEN
    ALTER TABLE public.game_sessions ADD COLUMN draw_sequence INT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_sessions' AND column_name = 'current_ball_index') THEN
    ALTER TABLE public.game_sessions ADD COLUMN current_ball_index INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'game_sessions' AND column_name = 'last_revealed_ball') THEN
    ALTER TABLE public.game_sessions ADD COLUMN last_revealed_ball INT;
  END IF;
END $$;

-- 2. RPC: Preparar el sorteo (Genera la secuencia, bloquea ventas y firma)
CREATE OR REPLACE FUNCTION public.prepare_bingo_draw(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_total_balls INT;
  v_sequence INT[];
  v_hash TEXT;
BEGIN
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;

  v_total_balls := COALESCE((v_session.current_state->>'totalBalls')::INT, 90);

  -- Generar secuencia aleatoria de 1 a total_balls
  SELECT array_agg(n ORDER BY random()) INTO v_sequence
  FROM generate_series(1, v_total_balls) AS n;

  v_hash := md5(v_sequence::text || p_session_id::text || NOW()::text);

  UPDATE public.game_sessions
  SET 
    draw_sequence = v_sequence,
    current_ball_index = 0,
    last_revealed_ball = NULL,
    current_state = jsonb_set(current_state, '{status}', '"DRAWING"'),
    status = 'DRAWING'::session_status_enum,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- Bloquear mesa en 'ACTIVE' para cerrar compras de cartones
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      updated_at = NOW()
  WHERE id = v_session.table_id AND status != 'ACTIVE'::table_status_enum;

  RETURN jsonb_build_object('success', true, 'total_balls', v_total_balls, 'hash', v_hash);
END;
$$;

-- 3. RPC: Revelar la siguiente bola y verificar ganador (Llamada por Cron)
CREATE OR REPLACE FUNCTION public.reveal_next_bingo_ball(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_next_index INT;
  v_revealed_ball INT;
  v_has_winner BOOLEAN := false;
  v_winner_user_id UUID;
BEGIN
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status != 'DRAWING' THEN 
    RETURN jsonb_build_object('success', false, 'reason', 'NOT_DRAWING'); 
  END IF;

  -- Bloquear inmediatamente la mesa en 'ACTIVE' para cerrar compras
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      updated_at = NOW()
  WHERE id = v_session.table_id AND status != 'ACTIVE'::table_status_enum;

  v_next_index := v_session.current_ball_index + 1;
  
  IF v_next_index > array_length(v_session.draw_sequence, 1) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'DRAW_COMPLETE');
  END IF;

  v_revealed_ball := v_session.draw_sequence[v_next_index];

  -- Actualizar sesión
  UPDATE public.game_sessions
  SET 
    current_ball_index = v_next_index,
    last_revealed_ball = v_revealed_ball,
    current_state = jsonb_set(
      jsonb_set(current_state, '{currentBall}', to_jsonb(v_revealed_ball)),
      '{drawnBalls}', COALESCE(current_state->'drawnBalls', '[]'::jsonb) || to_jsonb(v_revealed_ball)
    ),
    updated_at = NOW()
  WHERE id = p_session_id;

  -- TODO (Simplificado): Aquí iría la lógica para recorrer `bingo_card_purchases` 
  -- y verificar si algún cartón tiene línea o bingo completo con las bolas en `current_state->'drawnBalls'`.
  -- Si hay ganador, actualizar v_has_winner = true y v_winner_user_id = ... y llamar a settle_game_session.

  RETURN jsonb_build_object(
    'success', true,
    'ball_number', v_revealed_ball,
    'index', v_next_index,
    'has_winner', v_has_winner,
    'winner_user_id', v_winner_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.prepare_bingo_draw(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reveal_next_bingo_ball(UUID) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
