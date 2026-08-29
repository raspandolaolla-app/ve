-- ==============================================================================
-- MIGRACIÓN 032: MOTOR UNIFICADO DE TURNOS, TEMPORIZADOR, 3 VIDAS Y EXPIRACIÓN ATÓMICA
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / EJECUTAR EN SUPABASE SQL EDITOR DIRECTAMENTE
-- ==============================================================================

-- 1. RPC para Expiración Atómica de Turno con Deducción de 3 Vidas y Liquidación por Timeout
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
  v_players JSONB := '[]'::jsonb;
  v_lives JSONB;
  v_curr_lives INT;
  v_player_count INT := 0;
  v_curr_idx INT := -1;
  v_next_idx INT;
  v_next_user_id UUID;
  v_winner_id UUID := NULL;
  v_is_game_over BOOLEAN := FALSE;
  v_i INT;
  v_turn_deadline TIMESTAMPTZ;
  v_action_res JSONB;
  v_gross_pool NUMERIC(14,2);
  v_prize_pool NUMERIC(14,2);
  v_platform_fee NUMERIC(14,2);
  v_settle_res JSONB;
BEGIN
  -- Bloquear sesión transaccionalmente para evitar condiciones de carrera
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: La sesión de juego no existe';
  END IF;

  -- Verificar que la sesión esté en estado activo
  IF v_session.status NOT IN ('ACTIVE', 'READY', 'STARTING', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'SESSION_NOT_ACTIVE');
  END IF;

  v_state := v_session.current_state;
  v_turn_user_id := COALESCE(
    v_session.current_turn_user_id,
    (v_state->>'turnUserId')::UUID
  );

  IF v_turn_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'NO_TURN_USER_DEFINED');
  END IF;

  -- Determinar lista de jugadores desde playerOrder o players array
  IF v_state ? 'playerOrder' AND jsonb_array_length(v_state->'playerOrder') > 0 THEN
    v_player_order := v_state->'playerOrder';
  ELSIF v_state ? 'players' AND jsonb_array_length(v_state->'players') > 0 THEN
    -- Extraer userIds de la estructura de jugadores
    FOR v_i IN 0..(jsonb_array_length(v_state->'players') - 1) LOOP
      v_player_order := v_player_order || to_jsonb((v_state->'players'->v_i->>'userId'));
    END LOOP;
  END IF;

  v_player_count := jsonb_array_length(v_player_order);

  -- Extraer o inicializar vidas (3 vidas por defecto por jugador)
  IF v_state ? 'lives' THEN
    v_lives := v_state->'lives';
  ELSE
    v_lives := '{}'::jsonb;
    FOR v_i IN 0..(v_player_count - 1) LOOP
      v_lives := jsonb_set(v_lives, ARRAY[(v_player_order->>v_i)], '3'::jsonb);
    END LOOP;
  END IF;

  -- Obtener vidas del jugador actual y restar 1
  v_curr_lives := COALESCE((v_lives->>v_turn_user_id::text)::INT, 3) - 1;
  IF v_curr_lives < 0 THEN
    v_curr_lives := 0;
  END IF;

  v_lives := jsonb_set(v_lives, ARRAY[v_turn_user_id::text], to_jsonb(v_curr_lives));
  v_state := jsonb_set(v_state, '{lives}', v_lives);

  -- Registrar acción TIMEOUT_LIFE_LOST en game_actions de forma idempotente
  v_action_res := public.submit_game_action_secure(
    p_session_id,
    'TIMEOUT_LIFE_LOST',
    jsonb_build_object(
      'userId', v_turn_user_id,
      'remainingLives', v_curr_lives
    ),
    'timeout_life_' || p_session_id::text || '_' || v_turn_user_id::text || '_' || extract(epoch from now())::text
  );

  -- Si el jugador se queda sin vidas (0 vidas), pierde la mano/partida automáticamente
  IF v_curr_lives <= 0 THEN
    v_is_game_over := TRUE;
    
    -- El ganador es el oponente que aún conserva vidas
    FOR v_i IN 0..(v_player_count - 1) LOOP
      IF (v_player_order->>v_i)::UUID <> v_turn_user_id THEN
        v_winner_id := (v_player_order->>v_i)::UUID;
        EXIT;
      END IF;
    END LOOP;

    v_state := jsonb_set(v_state, '{status}', '"game_won"'::jsonb);
    v_state := jsonb_set(v_state, '{winnerUserId}', to_jsonb(v_winner_id::text));
    v_state := jsonb_set(v_state, '{finishReason}', '"TIMEOUT_LIVES_EXHAUSTED"'::jsonb);

    -- Liquidación automática 90% ganador / 10% plataforma
    v_gross_pool := v_session.gross_pool;
    v_prize_pool := v_session.winner_prize_amount;
    v_platform_fee := v_session.service_fee_amount;

    -- Ejecutar RPC de liquidación si existe
    BEGIN
      v_settle_res := public.settle_game_session(
        p_session_id,
        ARRAY[v_winner_id],
        NULL,
        'timeout_settle_' || p_session_id::text || '_' || extract(epoch from now())::text
      );
    EXCEPTION WHEN OTHERS THEN
      -- Fallback si ya estaba liquidado
    END;

    UPDATE public.game_sessions
    SET current_state = v_state,
        status = 'SETTLED'::session_status_enum,
        winner_user_id = v_winner_id,
        is_settled = TRUE,
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

  -- Si conserva vidas (> 0), rotar turno al siguiente jugador
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

  v_turn_deadline := NOW() + INTERVAL '30 seconds';

  v_state := jsonb_set(v_state, '{turnUserId}', to_jsonb(v_next_user_id::text));

  UPDATE public.game_sessions
  SET current_state = v_state,
      current_turn_user_id = v_next_user_id,
      turn_deadline_at = v_turn_deadline,
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'TIMEOUT_PROCESSED_LIFE_LOST',
    'timed_out_user_id', v_turn_user_id,
    'remaining_lives', v_curr_lives,
    'next_turn_user_id', v_next_user_id,
    'turn_deadline_at', v_turn_deadline,
    'is_game_over', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_game_turn_secure(UUID) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
