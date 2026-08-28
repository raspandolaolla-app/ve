-- ==============================================================================
-- MIGRACIÓN 045: SISTEMA DE MOVIMIENTOS AUTOMÁTICOS BOT POR INACTIVIDAD
-- ==============================================================================
-- Permite ejecutar movimientos automáticos (BOT_MOVE) cuando un jugador agota
-- su tiempo de turno en lugar de estancar la partida o desconectar abruptamente.
-- ==============================================================================

-- RPC PARA EJECUTAR MOVIMIENTO BOT POR TIMEOUT DE TURNO
CREATE OR REPLACE FUNCTION public.execute_bot_move_on_timeout(
  p_session_id UUID,
  p_user_id UUID,
  p_bot_action JSONB DEFAULT NULL
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
  v_lives JSONB;
  v_curr_lives INT;
  v_player_order JSONB := '[]'::jsonb;
  v_player_count INT := 0;
  v_curr_idx INT := -1;
  v_next_idx INT;
  v_next_user_id UUID;
  v_action_payload JSONB;
  v_action_res JSONB;
  v_turn_deadline TIMESTAMPTZ;
  v_i INT;
BEGIN
  -- 1. Bloquear sesión transaccionalmente
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SESSION_NOT_FOUND');
  END IF;

  IF v_session.status NOT IN ('ACTIVE', 'READY', 'STARTING', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SESSION_NOT_ACTIVE');
  END IF;

  v_state := v_session.current_state;
  v_turn_user_id := COALESCE(
    v_session.current_turn_user_id,
    (v_state->>'turnUserId')::UUID
  );

  -- Validar que sea el turno del usuario reportado
  IF v_turn_user_id IS NULL OR v_turn_user_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'NOT_PLAYER_TURN');
  END IF;

  -- 2. Deducir 1 vida por el timeout
  IF v_state ? 'lives' THEN
    v_lives := v_state->'lives';
  ELSE
    v_lives := '{}'::jsonb;
  END IF;

  v_curr_lives := COALESCE((v_lives->>v_turn_user_id::text)::INT, 3) - 1;
  IF v_curr_lives < 0 THEN v_curr_lives := 0; END IF;

  v_lives := jsonb_set(v_lives, ARRAY[v_turn_user_id::text], to_jsonb(v_curr_lives));
  v_state := jsonb_set(v_state, '{lives}', v_lives);

  -- 3. Construir o normalizar la acción del BOT
  IF p_bot_action IS NOT NULL THEN
    v_action_payload := p_bot_action;
  ELSE
    v_action_payload := jsonb_build_object('type', 'BOT_PASS_OR_MOVE', 'isBotMove', true);
  END IF;

  -- Registrar en game_actions con action_type = 'BOT_MOVE'
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    payload,
    idempotency_key
  ) VALUES (
    p_session_id,
    v_user_id,
    'BOT_MOVE',
    v_action_payload || jsonb_build_object('remainingLives', v_curr_lives, 'executedByBot', true),
    'bot_timeout_' || p_session_id::text || '_' || v_user_id::text || '_' || extract(epoch from now())::text
  );

  -- Si se agotan las 3 vidas, llamar al procedimiento de expiración estricta (0 vidas = derrota)
  IF v_curr_lives <= 0 THEN
    RETURN public.expire_game_turn_secure(p_session_id);
  END IF;

  -- 4. Si aún le quedan vidas (> 0), rotar el turno al siguiente jugador y actualizar turn_deadline
  IF v_state ? 'playerOrder' AND jsonb_array_length(v_state->'playerOrder') > 0 THEN
    v_player_order := v_state->'playerOrder';
  ELSIF v_state ? 'players' AND jsonb_array_length(v_state->'players') > 0 THEN
    FOR v_i IN 0..(jsonb_array_length(v_state->'players') - 1) LOOP
      v_player_order := v_player_order || to_jsonb((v_state->'players'->v_i->>'userId'));
    END LOOP;
  END IF;

  v_player_count := jsonb_array_length(v_player_order);

  IF v_player_count > 1 THEN
    FOR v_i IN 0..(v_player_count - 1) LOOP
      IF (v_player_order->>v_i)::UUID = v_turn_user_id THEN
        v_curr_idx := v_i;
        EXIT;
      END IF;
    END LOOP;

    IF v_curr_idx = -1 THEN v_curr_idx := 0; END IF;
    v_next_idx := (v_curr_idx + 1) % v_player_count;
    v_next_user_id := (v_player_order->>v_next_idx)::UUID;
  ELSE
    v_next_user_id := v_turn_user_id;
  END IF;

  v_turn_deadline := NOW() + INTERVAL '30 seconds';
  v_state := jsonb_set(v_state, '{turnUserId}', to_jsonb(v_next_user_id::text));
  v_state := jsonb_set(v_state, '{lastActionByBot}', 'true'::jsonb);

  UPDATE public.game_sessions
  SET current_state = v_state,
      current_turn_user_id = v_next_user_id,
      turn_deadline_at = v_turn_deadline,
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'BOT_MOVE_EXECUTED',
    'bot_user_id', v_user_id,
    'remaining_lives', v_curr_lives,
    'next_turn_user_id', v_next_user_id,
    'turn_deadline_at', v_turn_deadline,
    'bot_action', v_action_payload
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_bot_move_on_timeout(UUID, UUID, JSONB) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
