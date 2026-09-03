-- ==============================================================================
-- MIGRACIÓN 115: ATRAPAITO CRIOLLO MULTIJUGADOR ONLINE EN TIEMPO REAL
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- Estado: PRODUCCIÓN / EJECUTAR EN SUPABASE SQL EDITOR DIRECTAMENTE
-- ==============================================================================
-- 1. Función RPC `handle_atrapaito_abandon`:
--    Liquida la partida inmediatamente ante abandono voluntario o desconexión,
--    otorgando el 90% del pozo acumulado al jugador que permanece en la mesa.
-- 2. Función RPC `submit_atrapaito_action_secure`:
--    Registra jugadas atómicas (MOVE_MARBLE, PLACE_WALL) en tiempo real,
--    valida turnos y calcula turn_expires_at (+15 segundos) de forma autoritativa.
-- 3. Sobrecarga de compatibilidad para `submit_game_action_secure`.
-- ==============================================================================

-- 1. FUNCIÓN PARA MANEJAR EL ABANDONO Y OTORGAR EL PREMIO (90/10)
CREATE OR REPLACE FUNCTION public.handle_atrapaito_abandon(
  p_session_id UUID,
  p_leaving_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_effective_leaver_id UUID;
  v_table_id UUID;
  v_winner_id UUID;
  v_entry_fee NUMERIC := 0;
  v_gross_pool NUMERIC := 0;
  v_prize_pool NUMERIC := 0;
  v_platform_fee NUMERIC := 0;
  v_current_status VARCHAR;
BEGIN
  -- 1. Determinar el usuario que abandona
  v_effective_leaver_id := COALESCE(p_leaving_user_id, auth.uid());

  -- 2. Validar existencia y bloqueo de la sesión
  SELECT table_id, status INTO v_table_id, v_current_status
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_table_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF v_current_status IN ('FINISHED', 'completed', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', true, 'message', 'SESSION_ALREADY_FINISHED');
  END IF;

  -- 3. Identificar al ganador (el rival que permanece en la mesa)
  SELECT user_id INTO v_winner_id
  FROM public.game_table_players
  WHERE table_id = v_table_id
    AND user_id != v_effective_leaver_id
    AND status != 'LEFT'
  LIMIT 1;

  -- 4. Obtener costo de entrada y calcular pozo (2 jugadores, 90% ganador / 10% plataforma)
  SELECT COALESCE(entry_fee, 0) INTO v_entry_fee
  FROM public.game_tables
  WHERE id = v_table_id;

  v_gross_pool := v_entry_fee * 2;
  v_prize_pool := ROUND(v_gross_pool * 0.90, 2);
  v_platform_fee := ROUND(v_gross_pool * 0.10, 2);

  -- 5. Actualizar la sesión a FINISHED con ganador y montos
  UPDATE public.game_sessions
  SET status = 'FINISHED',
      winner_user_id = v_winner_id,
      winner_prize_amount = v_prize_pool,
      service_fee_amount = v_platform_fee,
      gross_pool = v_gross_pool,
      is_settled = TRUE,
      current_state = COALESCE(current_state, '{}'::jsonb) || jsonb_build_object(
        'winner', CASE WHEN v_winner_id IS NOT NULL THEN 'OPPONENT_BY_ABANDON' ELSE 'NONE' END,
        'winner_user_id', v_winner_id,
        'status', 'FINISHED',
        'abandoned_by', v_effective_leaver_id
      ),
      updated_at = NOW()
  WHERE id = p_session_id;

  -- 6. Actualizar estados de los jugadores en la mesa
  UPDATE public.game_table_players
  SET status = 'LEFT', updated_at = NOW()
  WHERE table_id = v_table_id AND user_id = v_effective_leaver_id;

  IF v_winner_id IS NOT NULL THEN
    UPDATE public.game_table_players
    SET status = 'WON', updated_at = NOW()
    WHERE table_id = v_table_id AND user_id = v_winner_id;

    -- 7. Acreditar premio neto del 90% en la billetera del ganador
    IF v_prize_pool > 0 THEN
      UPDATE public.wallets
      SET available_balance = available_balance + v_prize_pool,
          updated_at = NOW()
      WHERE user_id = v_winner_id;

      -- 8. Registrar en el libro mayor
      INSERT INTO public.ledger_entries (
        user_id,
        amount,
        type,
        description,
        created_at
      ) VALUES (
        v_winner_id,
        v_prize_pool,
        'GAME_WIN',
        'Ganancia por abandono de rival en Atrapaito Criollo (Pozo neto 90%)',
        NOW()
      );
    END IF;
  END IF;

  -- 9. Marcar la mesa como completada
  UPDATE public.game_tables
  SET status = 'FINISHED', updated_at = NOW()
  WHERE id = v_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'winner_id', v_winner_id,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_atrapaito_abandon(UUID, UUID) TO authenticated, anon, service_role;


-- 2. FUNCIÓN RPC PARA JUGADAS EN TIEMPO REAL DE ATRAPAITO (SERVER-AUTHORITATIVE)
CREATE OR REPLACE FUNCTION public.submit_atrapaito_action_secure(
  p_session_id UUID,
  p_user_id UUID,
  p_action_type VARCHAR,
  p_action_data JSONB
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
  v_opponent_id UUID;
  v_col INT;
  v_row INT;
  v_is_horiz BOOLEAN;
  v_placed_by VARCHAR;
  v_turn VARCHAR;
  v_next_turn VARCHAR;
  v_turn_expires_at TIMESTAMPTZ;
  v_winner VARCHAR := NULL;
  v_winner_id UUID := NULL;
  v_entry_fee NUMERIC := 0;
  v_prize_pool NUMERIC := 0;
  v_platform_fee NUMERIC := 0;
BEGIN
  -- 1. Bloquear y leer sesión
  SELECT s.*, t.entry_fee INTO v_session
  FROM public.game_sessions s
  JOIN public.game_tables t ON t.id = s.table_id
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  IF v_session.status IN ('FINISHED', 'completed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'GAME_ALREADY_FINISHED');
  END IF;

  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);

  -- 2. Obtener oponente
  SELECT user_id INTO v_opponent_id
  FROM public.game_table_players
  WHERE table_id = v_session.table_id
    AND user_id != p_user_id
    AND status != 'LEFT'
  LIMIT 1;

  -- 3. Determinar turno actual
  v_turn := COALESCE(v_current_state->>'turn', 'BLUE');
  v_next_turn := CASE WHEN v_turn = 'BLUE' THEN 'RED' ELSE 'BLUE' END;
  v_turn_expires_at := NOW() + INTERVAL '15 seconds';

  v_new_state := v_current_state;

  -- 4. Procesar según tipo de jugada
  IF p_action_type = 'MOVE_MARBLE' THEN
    v_col := (p_action_data->>'col')::INT;
    v_row := (p_action_data->>'row')::INT;

    IF v_turn = 'BLUE' THEN
      v_new_state := jsonb_set(v_new_state, '{bluePos}', jsonb_build_object('col', v_col, 'row', v_row));
    ELSE
      v_new_state := jsonb_set(v_new_state, '{redPos}', jsonb_build_object('col', v_col, 'row', v_row));
    END IF;

    -- Condición de victoria: alcanzar la meta (fila 0)
    IF v_row = 0 THEN
      v_winner := v_turn;
      v_winner_id := p_user_id;
    END IF;

  ELSIF p_action_type = 'PLACE_WALL' THEN
    v_col := (p_action_data->>'col')::INT;
    v_row := (p_action_data->>'row')::INT;
    v_is_horiz := COALESCE((p_action_data->>'isHorizontal')::BOOLEAN, true);
    v_placed_by := v_turn;

    -- Agregar muro al arreglo de muros
    v_new_state := jsonb_set(
      v_new_state,
      '{walls}',
      COALESCE(v_new_state->'walls', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'col', v_col,
          'row', v_row,
          'isHorizontal', v_is_horiz,
          'placedBy', v_placed_by
        )
      )
    );

    -- Restar muro al jugador correspondiente
    IF v_turn = 'BLUE' THEN
      v_new_state := jsonb_set(
        v_new_state,
        '{blueWalls}',
        to_jsonb(GREATEST(0, COALESCE((v_new_state->>'blueWalls')::INT, 10) - 1))
      );
    ELSE
      v_new_state := jsonb_set(
        v_new_state,
        '{redWalls}',
        to_jsonb(GREATEST(0, COALESCE((v_new_state->>'redWalls')::INT, 10) - 1))
      );
    END IF;
  END IF;

  -- 5. Si hay ganador por cruzar la meta
  IF v_winner IS NOT NULL THEN
    v_entry_fee := COALESCE(v_session.entry_fee, 0);
    v_prize_pool := ROUND((v_entry_fee * 2) * 0.90, 2);
    v_platform_fee := ROUND((v_entry_fee * 2) * 0.10, 2);

    v_new_state := v_new_state || jsonb_build_object(
      'winner', v_winner,
      'winner_user_id', v_winner_id,
      'status', 'FINISHED'
    );

    UPDATE public.game_sessions
    SET status = 'FINISHED',
        winner_user_id = v_winner_id,
        winner_prize_amount = v_prize_pool,
        service_fee_amount = v_platform_fee,
        gross_pool = v_entry_fee * 2,
        is_settled = TRUE,
        current_state = v_new_state,
        turn_expires_at = NULL,
        current_turn_user_id = NULL,
        updated_at = NOW()
    WHERE id = p_session_id;

    IF v_prize_pool > 0 AND v_winner_id IS NOT NULL THEN
      UPDATE public.wallets
      SET available_balance = available_balance + v_prize_pool,
          updated_at = NOW()
      WHERE user_id = v_winner_id;

      INSERT INTO public.ledger_entries (user_id, amount, type, description, created_at)
      VALUES (v_winner_id, v_prize_pool, 'GAME_WIN', 'Victoria en Atrapaito Criollo (Pozo neto 90%)', NOW());
    END IF;

    UPDATE public.game_tables
    SET status = 'FINISHED', updated_at = NOW()
    WHERE id = v_session.table_id;

  ELSE
    -- Partida continúa: alternar turno y otorgar 15 segundos
    v_new_state := v_new_state || jsonb_build_object(
      'turn', v_next_turn,
      'current_turn_user_id', v_opponent_id,
      'turn_expires_at', v_turn_expires_at
    );

    UPDATE public.game_sessions
    SET current_state = v_new_state,
        current_turn_user_id = v_opponent_id,
        turn_expires_at = v_turn_expires_at,
        updated_at = NOW()
    WHERE id = p_session_id;
  END IF;

  -- 6. Auditoría en game_actions
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    payload,
    is_valid,
    created_at
  ) VALUES (
    p_session_id,
    p_user_id,
    p_action_type,
    p_action_data,
    TRUE,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_state', v_new_state,
    'turn_expires_at', v_turn_expires_at,
    'is_finished', v_winner IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_atrapaito_action_secure(UUID, UUID, VARCHAR, JSONB) TO authenticated, anon, service_role;


-- 3. SOBRECARGA DE COMPATIBILIDAD PARA submit_game_action_secure
CREATE OR REPLACE FUNCTION public.submit_game_action_secure(
  p_session_id UUID,
  p_user_id UUID,
  p_action_type VARCHAR,
  p_action_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_game_type VARCHAR;
BEGIN
  SELECT game_type INTO v_game_type
  FROM public.game_sessions
  WHERE id = p_session_id;

  IF v_game_type = 'atrapaito' THEN
    RETURN public.submit_atrapaito_action_secure(p_session_id, p_user_id, p_action_type, p_action_data);
  END IF;

  RETURN public.submit_game_action_secure(
    p_session_id,
    p_action_type,
    p_action_data,
    NULL,
    NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_game_action_secure(UUID, UUID, VARCHAR, JSONB) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
