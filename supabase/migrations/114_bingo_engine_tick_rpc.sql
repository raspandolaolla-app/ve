-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 114: RPC TICK UNIFICADO PARA MOTOR DE BINGO
-- Permite que el servidor ejecute el ciclo completo vía HTTP REST seguro (Supabase client)
-- o conexión directa sin riesgo de timeouts de socket TCP no disponibles.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.run_bingo_engine_tick()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_balls_drawn INT := 0;
  v_draw_res JSONB;
BEGIN
  -- 1. Verificar y arrancar cuenta regresiva en mesas con >= 2 jugadores
  PERFORM public.check_and_start_bingo_countdown();

  -- 2. Buscar sesiones activas con cuenta regresiva finalizada
  FOR v_session IN
    SELECT id
    FROM public.game_sessions
    WHERE LOWER(game_type::text) = 'bingo'
      AND status::text IN ('WAITING', 'READY', 'SALES', 'DRAWING', 'waiting', 'ready', 'sales', 'drawing')
      AND countdown_ends_at IS NOT NULL
      AND countdown_ends_at <= NOW()
    LIMIT 5
  LOOP
    BEGIN
      v_draw_res := public.reveal_next_bingo_ball(v_session.id);
      IF (v_draw_res->>'success')::boolean IS TRUE THEN
        v_balls_drawn := v_balls_drawn + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- Tolerar excepciones de concurrencia o fin de partida
        NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'balls_drawn', v_balls_drawn,
    'timestamp', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_bingo_engine_tick() TO authenticated, anon, service_role;
