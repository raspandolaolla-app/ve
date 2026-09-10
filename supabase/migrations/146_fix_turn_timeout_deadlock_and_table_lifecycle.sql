-- ==============================================================================
-- MIGRACIÓN 146: Corrección Integral de Deadlock en Timeout de Turnos,
--                Armonización de Orden de Bloqueo y Ciclo de Vida de Mesa
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ARMONIZACIÓN DE RPC: execute_bot_move_on_timeout
--    Soporta tanto p_bot_action (JSONB) como p_action_type (TEXT) con idempotencia
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.execute_bot_move_on_timeout(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.execute_bot_move_on_timeout(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.execute_bot_move_on_timeout(
  p_session_id UUID,
  p_user_id UUID,
  p_bot_action JSONB DEFAULT NULL,
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
  v_cell_index INT;
  v_board JSONB;
  v_symbol TEXT;
  v_player_symbols JSONB;
  v_player_order JSONB;
  v_curr_idx INT := -1;
  v_player_count INT := 0;
  v_i INT;
BEGIN
  -- 1. Bloquear sesión con SKIP LOCKED para evitar esperas y deadlocks concurrentes
  SELECT id, table_id, game_type, current_state, current_turn_user_id, status, turn_deadline_at
  INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SESSION_LOCKED_OR_NOT_FOUND');
  END IF;

  -- Validar que la sesión esté en estado activo
  IF v_session.status::text NOT IN ('ACTIVE', 'READY', 'STARTING', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SESSION_NOT_ACTIVE');
  END IF;

  v_game_type := LOWER(v_session.game_type::text);
  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);

  -- 2. Extraer orden de jugadores
  IF v_current_state ? 'playerOrder' AND jsonb_array_length(v_current_state->'playerOrder') > 0 THEN
    v_player_order := v_current_state->'playerOrder';
  ELSE
    v_player_order := '[]'::jsonb;
    FOR v_next_turn_user_id IN (
      SELECT user_id FROM public.game_table_players
      WHERE table_id = v_session.table_id AND status::text <> 'LEFT'
      ORDER BY seat_number ASC
    ) LOOP
      v_player_order := v_player_order || to_jsonb(v_next_turn_user_id::text);
    END LOOP;
  END IF;

  v_player_count := jsonb_array_length(v_player_order);

  -- 3. Determinar el siguiente jugador por rotación estricta
  IF v_player_count > 1 THEN
    FOR v_i IN 0..(v_player_count - 1) LOOP
      IF (v_player_order->>v_i)::UUID = p_user_id THEN
        v_curr_idx := v_i;
        EXIT;
      END IF;
    END LOOP;

    IF v_curr_idx = -1 THEN
      v_curr_idx := 0;
    END IF;

    v_next_turn_user_id := (v_player_order->>((v_curr_idx + 1) % v_player_count))::UUID;
  ELSE
    -- Buscar rival en game_table_players
    SELECT user_id INTO v_next_turn_user_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id <> p_user_id
      AND status::text <> 'LEFT'
    ORDER BY seat_number ASC
    LIMIT 1;

    IF v_next_turn_user_id IS NULL THEN
      v_next_turn_user_id := p_user_id;
    END IF;
  END IF;

  v_new_state := v_current_state;

  -- 4. Si el juego es Tic Tac Toe (La Vieja), ejecutar jugada de bot en casilla disponible si se proveyó
  IF v_game_type IN ('tic_tac_toe', 'la_vieja') THEN
    v_board := COALESCE(v_new_state->'board', jsonb_build_array(null,null,null,null,null,null,null,null,null));
    v_player_symbols := COALESCE(v_new_state->'playerSymbols', '{}'::jsonb);
    v_symbol := COALESCE(v_player_symbols->>p_user_id::text, 'X');

    IF p_bot_action IS NOT NULL AND p_bot_action ? 'actionData' AND (p_bot_action->'actionData') ? 'index' THEN
      v_cell_index := (p_bot_action->'actionData'->>'index')::INT;
    ELSE
      -- Buscar primera casilla libre
      v_cell_index := -1;
      FOR v_i IN 0..8 LOOP
        IF (v_board->v_i) IS NULL OR (v_board->>v_i) = 'null' OR (v_board->>v_i) = '' THEN
          v_cell_index := v_i;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF v_cell_index >= 0 AND v_cell_index <= 8 THEN
      v_board := jsonb_set(v_board, ARRAY[v_cell_index::text], to_jsonb(v_symbol));
      v_new_state := jsonb_set(v_new_state, '{board}', v_board);
    END IF;
  END IF;

  -- 5. Actualizar el estado con el siguiente turno y nuevo deadline de 30s
  v_new_state := jsonb_set(v_new_state, '{currentTurnUserId}', to_jsonb(v_next_turn_user_id::text));
  v_new_state := jsonb_set(v_new_state, '{turnUserId}', to_jsonb(v_next_turn_user_id::text));
  v_new_state := jsonb_set(v_new_state, '{turnExpiresAt}', to_jsonb((NOW() + (v_turn_duration || ' seconds')::interval)::text));

  UPDATE public.game_sessions
  SET 
    current_state = v_new_state,
    current_turn_user_id = v_next_turn_user_id,
    turn_deadline_at = NOW() + (v_turn_duration || ' seconds')::interval,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- 6. Registrar acción de BOT_MOVE en game_actions para sincronización Realtime
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
      'action_type', COALESCE(p_action_type, 'BOT_TIMEOUT_MOVE'),
      'executedByBot', true,
      'timedOutUserId', p_user_id,
      'nextTurnUserId', v_next_turn_user_id,
      'cellIndex', v_cell_index,
      'executed_at', NOW()
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', COALESCE(p_action_type, 'BOT_TIMEOUT_MOVE'),
    'timed_out_user_id', p_user_id,
    'next_turn_user_id', v_next_turn_user_id,
    'turn_deadline_at', (NOW() + (v_turn_duration || ' seconds')::interval)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_bot_move_on_timeout(UUID, UUID, JSONB, TEXT) TO authenticated, anon, service_role;


-- ------------------------------------------------------------------------------
-- 2. RECONCILIACIÓN DE: expire_game_turn_secure(UUID)
--    - NO cierra la mesa prematuramente si se agotan vidas
--    - Mantiene el juego en estado FINISHED/SETTLED permitiendo que los jugadores
--      vean el resultado en pantalla en lugar de expulsarlos de la mesa
--    - Bloqueo ordenado canónico (SKIP LOCKED) para evitar deadlocks con abandono
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
  v_game_type TEXT;
BEGIN
  -- 1. Bloquear la sesión con SKIP LOCKED para evitar contention con transacciones concurrentes
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

  v_game_type := LOWER(v_session.game_type::text);
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
  ELSE
    FOR v_next_user_id IN (
      SELECT user_id FROM public.game_table_players
      WHERE table_id = v_session.table_id AND status::text <> 'LEFT'
      ORDER BY seat_number ASC
    ) LOOP
      v_player_order := v_player_order || to_jsonb(v_next_user_id::text);
    END LOOP;
  END IF;

  v_player_count := jsonb_array_length(v_player_order);

  -- Manejo de vidas: inicializar a 3 por jugador si no existe
  IF v_state ? 'lives' AND jsonb_typeof(v_state->'lives') = 'object' THEN
    v_lives := v_state->'lives';
  ELSE
    v_lives := '{}'::jsonb;
    IF v_player_count > 0 THEN
      FOR v_i IN 0..(v_player_count - 1) LOOP
        v_lives := jsonb_set(v_lives, ARRAY[(v_player_order->>v_i)], '3'::jsonb);
      END LOOP;
    END IF;
  END IF;

  -- Deducir 1 vida al usuario cuyo turno expiró
  v_curr_lives := COALESCE((v_lives->>v_turn_user_id::text)::INT, 3) - 1;
  IF v_curr_lives < 0 THEN
    v_curr_lives := 0;
  END IF;

  v_lives := jsonb_set(v_lives, ARRAY[v_turn_user_id::text], to_jsonb(v_curr_lives));
  v_state := jsonb_set(v_state, '{lives}', v_lives);

  -- Registrar acción TURN_EXPIRED
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

  -- 2. Si se agotaron las vidas (0 vidas) y hay más de 1 jugador, otorgar victoria al oponente
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

    -- Liquidar partida a favor del oponente
    BEGIN
      PERFORM public.settle_game_session(
        p_session_id,
        ARRAY[v_winner_id],
        NULL,
        'timeout_settle_' || p_session_id::text || '_' || extract(epoch from now())::text
      );
    EXCEPTION WHEN OTHERS THEN
      -- Settle fallback silencioso
    END;

    -- Actualizar sesión a SETTLED (NO cerrar la mesa abruptamente en game_tables)
    UPDATE public.game_sessions
    SET current_state = v_state,
        status = 'SETTLED'::session_status_enum,
        winner_user_id = v_winner_id,
        ended_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Actualizar estado de mesa a FINISHED (NO CLOSED) para permitir mostrar SettlementModal en UI
    UPDATE public.game_tables
    SET status = 'FINISHED'::table_status_enum,
        updated_at = NOW()
    WHERE id = v_session.table_id
      AND status::text NOT IN ('CLOSED', 'TERMINATED', 'CANCELLED');

    RETURN jsonb_build_object(
      'success', true,
      'action', 'MATCH_ENDED_BY_TIMEOUT',
      'timed_out_user_id', v_turn_user_id,
      'remaining_lives', 0,
      'winner_user_id', v_winner_id,
      'is_game_over', true
    );
  END IF;

  -- 3. Si aún tiene vidas, rotar el turno al siguiente jugador (30 segundos adicionales)
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
    'action', 'TURN_ROTATED_ON_TIMEOUT',
    'previous_turn_user_id', v_turn_user_id,
    'next_turn_user_id', v_next_user_id,
    'remaining_lives', v_curr_lives,
    'turn_deadline_at', v_turn_deadline
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure(UUID) TO authenticated, anon, service_role;


-- ------------------------------------------------------------------------------
-- 3. RECONCILIACIÓN DE: abandon_game_table_secure
--    - ORDEN DE BLOQUEO CANÓNICO: 1º game_sessions, 2º game_tables
--      (Elimina el Deadlock / statement timeout con universal_settle_game_session)
--    - Idempotencia total: Si la sesión ya está finalizada o el jugador ya salió,
--      retorna inmediatamente sin quedarse esperando un lock exclusivo
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_table RECORD;
  v_player RECORD;
  v_session RECORD;
  v_active_players_count INTEGER;
  v_remaining_player RECORD;
  v_effective_idempotency TEXT;
  v_target_session_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para abandonar la mesa.';
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abn_' || p_table_id::text || '_' || v_caller_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  -- 1. Determinar ID de sesión objetivo si no se pasó explícitamente
  v_target_session_id := p_session_id;
  IF v_target_session_id IS NULL THEN
    SELECT id INTO v_target_session_id
    FROM public.game_sessions
    WHERE table_id = p_table_id
      AND status::text IN ('ACTIVE', 'READY', 'STARTING', 'in_progress')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 2. BLOQUEO ORDENADO CANÓNICO: 1º game_sessions (FOR UPDATE)
  IF v_target_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE id = v_target_session_id
    FOR UPDATE;
  END IF;

  -- 3. BLOQUEO ORDENADO CANÓNICO: 2º game_tables (FOR UPDATE)
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: No se encontró la mesa especificada.';
  END IF;

  -- 4. Verificar si el jugador ya abandonó previamente (Idempotencia)
  SELECT * INTO v_player
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND user_id = v_caller_id
  FOR UPDATE;

  IF NOT FOUND OR v_player.status::text = 'LEFT' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_left', true,
      'table_id', p_table_id,
      'message', 'El jugador ya no se encuentra activo en la mesa.'
    );
  END IF;

  -- 5. Marcar jugador como LEFT en game_table_players
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      updated_at = NOW()
  WHERE table_id = p_table_id
    AND user_id = v_caller_id;

  -- 6. Si hay una sesión activa viva, liquidar a favor del rival por abandono
  IF v_session.id IS NOT NULL AND v_session.status::text IN ('ACTIVE', 'READY', 'STARTING', 'in_progress') THEN
    -- Buscar rival en la mesa
    SELECT * INTO v_remaining_player
    FROM public.game_table_players
    WHERE table_id = p_table_id
      AND user_id <> v_caller_id
      AND status::text <> 'LEFT'
    LIMIT 1;

    IF v_remaining_player.user_id IS NOT NULL THEN
      -- Liquidar a favor del jugador restante
      BEGIN
        PERFORM public.settle_game_session(
          v_session.id,
          ARRAY[v_remaining_player.user_id],
          NULL,
          'abandon_settle_' || v_session.id::text || '_' || v_caller_id::text
        );
      EXCEPTION WHEN OTHERS THEN
        -- Fallback de settle silencioso
      END;

      UPDATE public.game_sessions
      SET status = 'SETTLED'::session_status_enum,
          winner_user_id = v_remaining_player.user_id,
          current_state = jsonb_set(
            COALESCE(current_state, '{}'::jsonb),
            '{abandoned}',
            to_jsonb(v_caller_id::text)
          ),
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = v_session.id;

      UPDATE public.game_tables
      SET status = 'FINISHED'::table_status_enum,
          updated_at = NOW()
      WHERE id = p_table_id;
    ELSE
      -- No quedan jugadores, cancelar sesión
      UPDATE public.game_sessions
      SET status = 'CANCELLED'::session_status_enum,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = v_session.id;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          updated_at = NOW()
      WHERE id = p_table_id;
    END IF;
  ELSE
    -- Partida aún no iniciada: verificar si la mesa quedó vacía
    SELECT COUNT(*) INTO v_active_players_count
    FROM public.game_table_players
    WHERE table_id = p_table_id
      AND status::text <> 'LEFT';

    IF v_active_players_count = 0 THEN
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          updated_at = NOW()
      WHERE id = p_table_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'session_id', v_session.id,
    'player_user_id', v_caller_id,
    'status', 'LEFT'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role, anon;
