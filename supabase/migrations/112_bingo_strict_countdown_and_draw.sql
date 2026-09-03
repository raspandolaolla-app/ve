-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 112: SISTEMA DE CUENTA REGRESIVA CON VALIDACIONES ESTRICTAS
-- ==============================================================================
-- 1. Agrega columna countdown_ends_at a game_sessions
-- 2. check_and_start_bingo_countdown: Solo activa cuenta regresiva si hay >= 2 cartones Y >= 2 jugadores únicos
-- 3. reveal_next_bingo_ball: Solo revela bolas si la cuenta regresiva de 2 minutos terminó
-- ==============================================================================

-- 1. Agregar columna para la cuenta regresiva (si no existe)
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS countdown_ends_at TIMESTAMPTZ;

-- 2. Función corregida: Solo inicia cuenta regresiva si hay >= 2 cartones comprados Y >= 2 jugadores únicos
CREATE OR REPLACE FUNCTION public.check_and_start_bingo_countdown()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_cards_count INT;
  v_unique_players INT;
BEGIN
  -- Buscar sesiones que CUMPLAN TODAS estas condiciones:
  -- 1. Son de tipo Bingo
  -- 2. Están en estado WAITING, READY o SALES (aún no han empezado a extraer bolas)
  -- 3. NO tienen cuenta regresiva activa
  -- 4. Tienen al menos 2 cartones comprados
  -- 5. Tienen al menos 2 jugadores únicos con cartones
  
  FOR v_session IN
    SELECT gs.id, gs.table_id, gs.status, gs.countdown_ends_at
    FROM public.game_sessions gs
    WHERE LOWER(gs.game_type::text) = 'bingo'
      AND gs.status::text IN ('WAITING', 'READY', 'SALES', 'waiting', 'ready', 'sales')
      AND gs.countdown_ends_at IS NULL
      AND gs.status != 'DRAWING'::session_status_enum
  LOOP
    -- Contar cartones comprados en esta sesión
    SELECT COUNT(*) INTO v_cards_count
    FROM public.bingo_card_purchases
    WHERE session_id = v_session.id;
    
    -- Contar jugadores únicos con cartones
    SELECT COUNT(DISTINCT user_id) INTO v_unique_players
    FROM public.bingo_card_purchases
    WHERE session_id = v_session.id;
    
    -- 👇 VALIDACIÓN ESTRICTA: Mínimo 2 cartones Y 2 jugadores únicos
    IF v_cards_count >= 2 AND v_unique_players >= 2 THEN
      -- Activar cuenta regresiva de 2 minutos
      UPDATE public.game_sessions
      SET countdown_ends_at = NOW() + INTERVAL '2 minutes',
          updated_at = NOW()
      WHERE id = v_session.id;
      
      RAISE NOTICE 'Cuenta regresiva iniciada para sesión % (fin en 2 minutos)', v_session.id;
    END IF;
  END LOOP;
END;
$$;

-- 3. Función corregida: Solo revela bolas si la cuenta regresiva terminó
CREATE OR REPLACE FUNCTION public.reveal_next_bingo_ball(p_session_id UUID)
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
  v_next_sequence INT;
  v_action_payload JSONB;
  v_state_hash TEXT;
BEGIN
  SELECT id, table_id, current_state, status, countdown_ends_at INTO v_session 
  FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  
  -- 👇 VALIDACIÓN CRÍTICA: Solo revelar bolas si la cuenta regresiva terminó
  IF v_session.status::text != 'DRAWING' THEN
    -- Verificar si es hora de iniciar el sorteo
    IF v_session.countdown_ends_at IS NOT NULL AND v_session.countdown_ends_at <= NOW() THEN
      -- La cuenta regresiva terminó, iniciar el sorteo
      UPDATE public.game_sessions
      SET status = 'DRAWING'::session_status_enum,
          current_state = jsonb_set(COALESCE(current_state, '{}'::jsonb), '{status}', '"DRAWING"'),
          updated_at = NOW()
      WHERE id = p_session_id;
      
      -- Bloquear mesa en 'ACTIVE' para cerrar compras de cartones
      IF v_session.table_id IS NOT NULL THEN
        UPDATE public.game_tables
        SET status = 'ACTIVE'::table_status_enum,
            updated_at = NOW()
        WHERE id = v_session.table_id AND status != 'ACTIVE'::table_status_enum;
      END IF;

      RAISE NOTICE 'Sorteo iniciado para sesión %', p_session_id;
    ELSE
      -- Aún no es hora o no se cumplen las condiciones
      RETURN jsonb_build_object(
        'success', false, 
        'reason', 'COUNTDOWN_NOT_FINISHED',
        'countdown_ends_at', v_session.countdown_ends_at,
        'seconds_remaining', CASE 
          WHEN v_session.countdown_ends_at IS NOT NULL THEN EXTRACT(EPOCH FROM (v_session.countdown_ends_at - NOW()))
          ELSE NULL 
        END
      );
    END IF;
  END IF;
  
  -- Re-obtener la sesión actualizada
  SELECT current_state INTO v_current_state FROM public.game_sessions WHERE id = p_session_id;
  IF v_current_state IS NULL THEN
    v_current_state := '{}'::jsonb;
  END IF;
  
  v_drawn_balls := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_current_state->'drawnBalls')::INT), '{}'::INT[]);
  v_total_balls := COALESCE((v_current_state->>'totalBalls')::INT, 90);
  v_last_drawn_at := (v_current_state->>'lastDrawnAt')::TIMESTAMPTZ;

  -- Validar tiempo (2 segundos entre bolas)
  IF v_last_drawn_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_drawn_at));
    IF v_seconds_since_last < 2.0 THEN 
      RETURN jsonb_build_object('success', false, 'reason', 'TOO_FAST');
    END IF;
  END IF;

  IF array_length(v_drawn_balls, 1) >= v_total_balls THEN 
    RAISE EXCEPTION 'BINGO_COMPLETE';
  END IF;

  -- Generar bola aleatoria disponible
  SELECT array_agg(n) INTO v_available_balls 
  FROM generate_series(1, v_total_balls) AS n 
  WHERE NOT (n = ANY(v_drawn_balls));
  
  SELECT n INTO v_new_ball FROM unnest(v_available_balls) AS n ORDER BY random() LIMIT 1;

  -- Actualizar estado
  v_current_state := jsonb_set(v_current_state, '{currentBall}', to_jsonb(v_new_ball));
  v_current_state := jsonb_set(v_current_state, '{drawnBalls}', COALESCE(v_current_state->'drawnBalls', '[]'::jsonb) || to_jsonb(v_new_ball));
  v_current_state := jsonb_set(v_current_state, '{lastDrawnAt}', to_jsonb(NOW()));

  UPDATE public.game_sessions SET current_state = v_current_state, updated_at = NOW() WHERE id = p_session_id;

  -- Registrar acción de auditoría
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_sequence FROM public.game_actions WHERE session_id = p_session_id;
  v_action_payload := jsonb_build_object('ball_number', v_new_ball, 'drawn_at', NOW());
  v_state_hash := md5(v_action_payload::text || p_session_id::text || v_new_ball::text);

  INSERT INTO public.game_actions (session_id, user_id, action_type, payload, server_state_hash, idempotency_key, created_at, sequence_number)
  VALUES (p_session_id, '00000000-0000-0000-0000-000000000000'::uuid, 'DRAW_BALL', v_action_payload, v_state_hash, gen_random_uuid()::text, NOW(), v_next_sequence);

  RETURN jsonb_build_object('success', true, 'ball_number', v_new_ball);

EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_start_bingo_countdown() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.reveal_next_bingo_ball(UUID) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
