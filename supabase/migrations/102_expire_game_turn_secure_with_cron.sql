-- ==============================================================================
-- MIGRACIÓN 102: Sistema Robusto de Expiración de Turnos, Sincronización y Cron
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Función Auxiliar: Ejecutar movimiento de Bot / Pase de turno en Timeout
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_bot_move_on_timeout(
  p_session_id UUID,
  p_user_id UUID,
  p_action_type TEXT DEFAULT 'PASS_TURN'
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
  v_next_turn_user_id UUID;
  v_turn_duration INT := 30;
  v_game_type TEXT;
BEGIN
  -- Obtener sesión bloqueada para actualización
  SELECT id, table_id, game_type, current_state, current_turn_user_id, status
  INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  v_game_type := UPPER(v_session.game_type::text);
  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);

  -- Determinar siguiente jugador activo en la mesa
  SELECT user_id INTO v_next_turn_user_id
  FROM public.game_table_players
  WHERE table_id = v_session.table_id
    AND user_id <> p_user_id
    AND status::text <> 'LEFT'
  ORDER BY seat_number ASC
  LIMIT 1;

  -- Si no hay otro jugador, cerrar o finalizar la sesión
  IF v_next_turn_user_id IS NULL THEN
    UPDATE public.game_sessions
    SET status = 'FINISHED'::session_status_enum,
        current_state = jsonb_set(v_current_state, '{status}', '"finished"'),
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object('success', true, 'action', 'GAME_ENDED_NO_OPPONENT');
  END IF;

  -- Actualizar el estado con el siguiente turno
  v_new_state := jsonb_set(
    v_current_state,
    '{currentTurnUserId}',
    to_jsonb(v_next_turn_user_id::text)
  );

  v_new_state := jsonb_set(
    v_new_state,
    '{turnUserId}',
    to_jsonb(v_next_turn_user_id::text)
  );

  v_new_state := jsonb_set(
    v_new_state,
    '{turnExpiresAt}',
    to_jsonb((NOW() + (v_turn_duration || ' seconds')::interval)::text)
  );

  UPDATE public.game_sessions
  SET 
    current_state = v_new_state,
    current_turn_user_id = v_next_turn_user_id,
    turn_deadline_at = NOW() + (v_turn_duration || ' seconds')::interval,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- Registrar acción de BOT_MOVE en game_actions
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    action_data,
    created_at
  ) VALUES (
    p_session_id,
    p_user_id,
    'BOT_MOVE',
    jsonb_build_object(
      'action_type', p_action_type,
      'next_turn_user_id', v_next_turn_user_id,
      'executed_at', NOW()
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action_type,
    'next_turn_user_id', v_next_turn_user_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Función Principal para Sesión Específica (p_session_id UUID)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_game_turn_secure(
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
  v_player_order JSONB := '[]'::jsonb;
  v_lives JSONB;
  v_curr_lives INT;
  v_player_count INT := 0;
  v_curr_idx INT := -1;
  v_next_idx INT;
  v_next_user_id UUID;
  v_winner_id UUID := NULL;
  v_turn_deadline TIMESTAMPTZ;
  v_i INT;
  v_settle_res JSONB;
BEGIN
  -- Bloquear la sesión para evitar concurrencia
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SESSION_LOCKED_OR_NOT_FOUND');
  END IF;

  -- Comprobar estado activo
  IF v_session.status::text NOT IN ('ACTIVE', 'READY', 'STARTING', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SESSION_NOT_ACTIVE');
  END IF;

  v_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_turn_user_id := COALESCE(
    v_session.current_turn_user_id,
    (v_state->>'turnUserId')::UUID
  );

  IF v_turn_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'NO_TURN_USER_DEFINED');
  END IF;

  -- Extraer lista ordenada de jugadores
  IF v_state ? 'playerOrder' AND jsonb_array_length(v_state->'playerOrder') > 0 THEN
    v_player_order := v_state->'playerOrder';
  ELSIF v_state ? 'players' AND jsonb_array_length(v_state->'players') > 0 THEN
    FOR v_i IN 0..(jsonb_array_length(v_state->'players') - 1) LOOP
      v_player_order := v_player_order || to_jsonb((v_state->'players'->v_i->>'userId'));
    END LOOP;
  ELSE
    -- Buscar desde game_table_players
    FOR v_next_user_id IN (
      SELECT user_id FROM public.game_table_players
      WHERE table_id = v_session.table_id AND status::text <> 'LEFT'
      ORDER BY seat_number ASC
    ) LOOP
      v_player_order := v_player_order || to_jsonb(v_next_user_id::text);
    END LOOP;
  END IF;

  v_player_count := jsonb_array_length(v_player_order);

  -- Si es dominó o truco, o juego por turnos con vidas
  IF v_state ? 'lives' THEN
    v_lives := v_state->'lives';
  ELSE
    v_lives := '{}'::jsonb;
    IF v_player_count > 0 THEN
      FOR v_i IN 0..(v_player_count - 1) LOOP
        v_lives := jsonb_set(v_lives, ARRAY[(v_player_order->>v_i)], '3'::jsonb);
      END LOOP;
    END IF;
  END IF;

  v_curr_lives := COALESCE((v_lives->>v_turn_user_id::text)::INT, 3) - 1;
  IF v_curr_lives < 0 THEN
    v_curr_lives := 0;
  END IF;

  v_lives := jsonb_set(v_lives, ARRAY[v_turn_user_id::text], to_jsonb(v_curr_lives));
  v_state := jsonb_set(v_state, '{lives}', v_lives);

  -- Registrar acción TURN_EXPIRED / TIMEOUT_LIFE_LOST
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    action_data,
    created_at
  ) VALUES (
    p_session_id,
    v_turn_user_id,
    'TURN_EXPIRED',
    jsonb_build_object(
      'userId', v_turn_user_id,
      'remainingLives', v_curr_lives,
      'expiredAt', NOW()
    ),
    NOW()
  );

  -- Si se agotaron las vidas
  IF v_curr_lives <= 0 AND v_player_count > 1 THEN
    FOR v_i IN 0..(v_player_count - 1) LOOP
      IF (v_player_order->>v_i)::UUID <> v_turn_user_id THEN
        v_winner_id := (v_player_order->>v_i)::UUID;
        EXIT;
      END IF;
    END LOOP;

    v_state := jsonb_set(v_state, '{status}', '"game_won"'::jsonb);
    v_state := jsonb_set(v_state, '{winnerUserId}', to_jsonb(v_winner_id::text));
    v_state := jsonb_set(v_state, '{finishReason}', '"TIMEOUT_LIVES_EXHAUSTED"'::jsonb);

    -- Liquidar partida si settle_game_session existe
    BEGIN
      PERFORM public.settle_game_session(
        p_session_id,
        ARRAY[v_winner_id],
        NULL,
        'timeout_settle_' || p_session_id::text || '_' || extract(epoch from now())::text
      );
    EXCEPTION WHEN OTHERS THEN
      -- Settle fallback
    END;

    UPDATE public.game_sessions
    SET current_state = v_state,
        status = 'SETTLED'::session_status_enum,
        winner_user_id = v_winner_id,
        ended_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Cerrar la mesa asociada
    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        updated_at = NOW()
    WHERE id = v_session.table_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'MATCH_ENDED_BY_TIMEOUT',
      'timed_out_user_id', v_turn_user_id,
      'remaining_lives', 0,
      'winner_user_id', v_winner_id,
      'is_game_over', true
    );
  END IF;

  -- Si aún tiene vidas, rotar el turno al siguiente jugador
  IF v_player_count > 1 THEN
    FOR v_i IN 0..(v_player_count - 1) LOOP
      IF (v_player_order->>v_i)::UUID = v_turn_user_id THEN
        v_curr_idx := v_i;
        EXIT;
      END IF;
    END LOOP;

    IF v_curr_idx = -1 THEN
      v_curr_idx := 0;
    END IF;

    v_next_idx := (v_curr_idx + 1) % v_player_count;
    v_next_user_id := (v_player_order->>v_next_idx)::UUID;
  ELSE
    v_next_user_id := v_turn_user_id;
  END IF;

  v_turn_deadline := NOW() + INTERVAL '30 seconds';

  v_state := jsonb_set(v_state, '{turnUserId}', to_jsonb(v_next_user_id::text));
  v_state := jsonb_set(v_state, '{currentTurnUserId}', to_jsonb(v_next_user_id::text));
  v_state := jsonb_set(v_state, '{turnExpiresAt}', to_jsonb(v_turn_deadline::text));

  UPDATE public.game_sessions
  SET current_state = v_state,
      current_turn_user_id = v_next_user_id,
      turn_deadline_at = v_turn_deadline,
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'TURN_ROTATED',
    'timed_out_user_id', v_turn_user_id,
    'next_turn_user_id', v_next_user_id,
    'remaining_lives', v_curr_lives,
    'is_game_over', false
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Función Sobrecargada por Lotes (0 argumentos) para Cron / Worker / Daemon
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_game_turn_secure()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row RECORD;
  v_count INT := 0;
  v_res JSONB;
BEGIN
  -- Buscar sesiones activas por turnos donde el deadline haya expirado
  FOR v_row IN (
    SELECT gs.id
    FROM public.game_sessions gs
    JOIN public.game_tables gt ON gt.id = gs.table_id
    WHERE gs.status::text IN ('ACTIVE', 'READY', 'STARTING')
      AND gt.game_type::text NOT IN ('BINGO', 'POLLA') -- Bingo y Polla tienen su propio motor autónomo
      AND gs.current_turn_user_id IS NOT NULL
      AND gs.turn_deadline_at IS NOT NULL
      AND gs.turn_deadline_at < NOW()
    ORDER BY gs.turn_deadline_at ASC
    LIMIT 20
  ) LOOP
    BEGIN
      v_res := public.expire_game_turn_secure(v_row.id);
      IF (v_res->>'success')::boolean IS TRUE THEN
        v_count := v_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error expirando sesión %: %', v_row.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_count,
    'processed_at', NOW()
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'processed_at', NOW()
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Detección de Jugadores Desconectados (heartbeat > 45s de inactividad)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_disconnected_players()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_player RECORD;
  v_count INT := 0;
BEGIN
  FOR v_player IN (
    SELECT 
      gtp.user_id,
      gtp.table_id,
      gt.game_type,
      gs.id AS session_id
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id AND gs.status::text IN ('ACTIVE', 'READY', 'STARTING')
    LEFT JOIN public.user_activity_sessions uas ON uas.user_id = gtp.user_id AND uas.status::text = 'ACTIVE'
    WHERE gtp.status::text IN ('JOINED', 'READY', 'PLAYING')
      AND gt.status::text IN ('ACTIVE', 'STARTING')
      AND (
        uas.last_seen_at IS NULL 
        OR uas.last_seen_at < NOW() - INTERVAL '45 seconds'
      )
    LIMIT 20
  ) LOOP
    -- Marcar jugador como DISCONNECTED en game_table_players
    UPDATE public.game_table_players
    SET status = 'DISCONNECTED'::player_table_status_enum
    WHERE table_id = v_player.table_id
      AND user_id = v_player.user_id
      AND status::text <> 'DISCONNECTED';

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'disconnected_count', v_count,
    'checked_at', NOW()
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Bucle de Expiración para Cron
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_expire_turns_loop()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_start_time TIMESTAMPTZ := NOW();
  v_i INT := 0;
BEGIN
  -- Ejecutar cada 5 segundos durante 1 minuto
  WHILE v_i < 12 LOOP
    PERFORM public.expire_game_turn_secure();
    PERFORM public.detect_disconnected_players();
    v_i := v_i + 1;

    PERFORM pg_sleep(5);

    IF EXTRACT(EPOCH FROM (NOW() - v_start_time)) >= 58 THEN
      EXIT;
    END IF;
  END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Programación del Cron Job en Supabase (si pg_cron está activo)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Desagendar job previo si existe
    BEGIN
      PERFORM cron.unschedule('expire-game-turns-job');
    EXCEPTION WHEN OTHERS THEN
      -- Silencioso
    END;

    -- Agendar loop de expiración cada minuto (corre internamente cada 5s)
    BEGIN
      PERFORM cron.schedule(
        'expire-game-turns-job',
        '* * * * *',
        'SELECT public.cron_expire_turns_loop();'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'No se pudo programar expire-game-turns-job en pg_cron: %', SQLERRM;
    END;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. Permisos de Ejecución
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.execute_bot_move_on_timeout(UUID, UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.detect_disconnected_players() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cron_expire_turns_loop() TO service_role;

NOTIFY pgrst, 'reload schema';
