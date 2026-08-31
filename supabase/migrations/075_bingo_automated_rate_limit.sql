-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 075: EXTRACCIÓN AUTOMATIZADA DE BALOTAS Y SEGURIDAD
-- ==============================================================================
-- Esta migración actualiza `rpc_draw_bingo_ball_secure` para permitir que mesas
-- automatizadas/sistemas (sin anfitrión humano) auto-extraigan balotas de forma segura.
-- Valida que el emisor sea un jugador legítimo de la mesa si es automatizada,
-- aplica rate-limiting basado en `call_interval_ms` para evitar spam,
-- y activa la sesión de juego y la mesa de forma atómica en el primer tiro.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_draw_bingo_ball_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_current_state JSONB;
  v_drawn_balls INT[];
  v_total_balls INT;
  v_available INT[];
  v_next_ball INT;
  v_idx INT;
  v_event_id TEXT;
  v_commitment_hash TEXT;
  v_new_seq INT;
  v_result_json JSONB;
  v_idempotency_key TEXT;
  v_existing_event RECORD;
  v_is_automated BOOLEAN;
  v_call_interval INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  v_idempotency_key := COALESCE(p_idempotency_key, 'draw_ball_' || p_session_id::text || '_' || encode(gen_random_bytes(6), 'hex'));

  -- 1. Validar idempotencia primero
  SELECT * INTO v_existing_event
  FROM public.rng_events
  WHERE session_id = p_session_id AND idempotency_key = v_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent', true,
      'ball', (v_existing_event.result->>'ball')::INT,
      'event_id', v_existing_event.event_id,
      'commitment_hash', v_existing_event.commitment_hash
    );
  END IF;

  -- 2. Obtener y bloquear la Sesión
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  -- 3. Obtener la Mesa de Juego
  SELECT * INTO v_table FROM public.game_tables WHERE id = v_session.table_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MESA_DE_JUEGO_NO_ENCONTRADA');
  END IF;

  v_is_automated := COALESCE((v_table.config->>'automated')::boolean, false);

  -- 4. Validar permisos de extracción (Host, creador, operador, admin, o jugador en mesas automatizadas)
  IF NOT (
    (v_table.host_user_id IS NOT NULL AND v_user_id = v_table.host_user_id)
    OR (v_table.host_user_id IS NULL AND v_table.created_by IS NOT NULL AND v_user_id = v_table.created_by)
    OR (v_is_automated AND EXISTS (
         SELECT 1 FROM public.game_table_players
         WHERE table_id = v_table.id AND user_id = v_user_id AND status != 'LEFT'::player_table_status_enum
       ))
    OR public.is_operator_or_above(v_user_id)
    OR auth.role() = 'service_role'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'HOST_ONLY: Solo el anfitrión legítimo o jugadores activos en mesas automatizadas pueden extraer balotas.');
  END IF;

  -- 5. Rate-Limiting para Sorteos Automatizados
  IF v_is_automated THEN
    v_call_interval := COALESCE((v_table.config->>'call_interval_ms')::INT, 3500);
    IF v_session.updated_at IS NOT NULL AND NOW() < (v_session.updated_at + (v_call_interval || ' milliseconds')::INTERVAL) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'RATE_LIMIT: Debes esperar el intervalo establecido entre balotas (' || (v_call_interval::numeric / 1000.0) || 's).'
      );
    END IF;
  END IF;

  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_total_balls := COALESCE((v_current_state->>'totalBalls')::INT, 75);

  -- Extraer bolas ya jugadas
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_current_state->'drawnBalls', '[]'::jsonb))::INT)
  INTO v_drawn_balls;

  -- Calcular balotas disponibles
  SELECT ARRAY(
    SELECT s FROM generate_series(1, v_total_balls) s
    WHERE NOT (s = ANY(v_drawn_balls))
  ) INTO v_available;

  IF array_length(v_available, 1) IS NULL OR array_length(v_available, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Se han extraído todas las balotas de la balotera.'
    );
  END IF;

  -- Seleccionar bola usando RNG seguro
  v_idx := public.fn_secure_rng_int(1, array_length(v_available, 1));
  v_next_ball := v_available[v_idx];

  v_event_id := 'rng_bingo_' || encode(gen_random_bytes(8), 'hex');
  v_commitment_hash := encode(digest(p_session_id::text || '_' || v_next_ball::text || '_' || v_event_id, 'sha256'), 'hex');

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_new_seq
  FROM public.rng_events WHERE session_id = p_session_id;

  v_result_json := jsonb_build_object(
    'ball', v_next_ball,
    'total_drawn', array_length(v_drawn_balls, 1) + 1,
    'drawn_by', v_user_id
  );

  -- Registrar auditoría RNG
  INSERT INTO public.rng_events (
    event_id,
    session_id,
    table_id,
    user_id,
    game_type,
    event_type,
    sequence_number,
    result,
    commitment_hash,
    idempotency_key
  ) VALUES (
    v_event_id,
    p_session_id,
    v_session.table_id,
    v_user_id,
    v_session.game_type,
    'DRAW_BINGO_BALL',
    v_new_seq,
    v_result_json,
    v_commitment_hash,
    v_idempotency_key
  );

  -- Actualizar estado de la partida
  v_drawn_balls := array_append(v_drawn_balls, v_next_ball);
  v_current_state := jsonb_set(v_current_state, '{drawnBalls}', to_jsonb(v_drawn_balls));
  v_current_state := jsonb_set(v_current_state, '{currentBall}', to_jsonb(v_next_ball));

  -- 6. Activación Atómica de la Mesa y Sesión al Extraer la Primera Balota
  IF array_length(v_drawn_balls, 1) = 1 THEN
    -- Cambiar mesa a ACTIVE
    UPDATE public.game_tables
    SET status = 'ACTIVE'::table_status_enum,
        updated_at = NOW()
    WHERE id = v_session.table_id;

    -- Cambiar sesión a ACTIVE
    UPDATE public.game_sessions
    SET status = 'ACTIVE'::session_status_enum,
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    -- Actualizar config de la mesa si es necesario
    UPDATE public.game_tables
    SET config = config || jsonb_build_object('status', 'ACTIVE')
    WHERE id = v_session.table_id;

    -- Actualizar estado del juego en la sesión
    v_current_state := jsonb_set(v_current_state, '{status}', '"in_progress"'::jsonb);
  ELSE
    -- Solo actualizar sesión timestamps
    UPDATE public.game_sessions
    SET updated_at = NOW()
    WHERE id = p_session_id;
  END IF;

  UPDATE public.game_sessions
  SET current_state = v_current_state,
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_idempotent', false,
    'ball', v_next_ball,
    'event_id', v_event_id,
    'commitment_hash', v_commitment_hash
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_draw_bingo_ball_secure(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
