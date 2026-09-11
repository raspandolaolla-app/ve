-- ============================================================================
-- MIGRACIÓN 162: UNIVERSAL AUTHORITATIVE ABANDONMENT AND TURN REASSIGNMENT SYSTEM
-- ============================================================================
-- Motor Universal de Abandono Voluntario de Jugadores:
-- 1. Server-Authoritative con bloqueo 'FOR UPDATE' en game_sessions, game_tables
--    y game_table_players para prevenir carreras e inconsistencias concurrentes.
-- 2. Diferenciación estricta entre abandono voluntario inmediato y timeout/inactividad.
-- 3. Partidas 1v1 / Último Superviviente:
--    - Victoria inmediata otorgada al rival activo.
--    - Liquidación financiera autoritativa inmediata mediante universal_settle_game_session.
-- 4. Partidas por Equipos (Domino 2v2, Truco 2v2):
--    - Victoria inmediata otorgada al equipo contrario completo.
--    - Liquidación financiera autoritativa mediante universal_settle_game_session.
-- 5. Partidas Multijugador Individual (Parchís, etc. con 2+ rivales activos):
--    - La partida continúa con los jugadores restantes.
--    - Si el jugador que abandona tenía el turno activo, se reasigna inmediatamente
--      al siguiente jugador según playerOrder / asientos activos, actualizando
--      currentColor / turn / turn_deadline_at según corresponda.
-- 6. Cancelación / Reembolso Total:
--    - Si todos los jugadores abandonan (0 rivales activos), se cancela la sesión
--      y se reembolsan las entradas mediante refund_game_session.
-- 7. Salida Pre-Partida (Lobby / Waiting):
--    - abandon_game_table_secure libera la retención de entrada a available_balance
--      mediante TABLE_ENTRY_REFUND y cierra la mesa si queda desierta.
-- 8. Idempotencia y emisión de eventos:
--    - Registro atómico en game_actions con acción 'PLAYER_ABANDONED'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.abandon_game_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_game_type TEXT;
  v_leaving_player RECORD;
  v_effective_idempotency TEXT;
  v_state JSONB;
  v_abandoned_arr JSONB;
  -- Equipos
  v_opponent_team_players UUID[] := ARRAY[]::UUID[];
  v_winning_team INT := NULL;
  -- Jugadores individuales activos restantes
  v_active_players UUID[] := ARRAY[]::UUID[];
  v_active_count INT := 0;
  v_winner_id UUID := NULL;
  -- Turno y orden para multijugador
  v_next_turn_user_id UUID := NULL;
  v_new_deadline TIMESTAMPTZ := NULL;
  v_duration INT := 30;
  v_player_order JSONB;
  v_order_len INT := 0;
  v_i INT := 0;
  v_found_idx INT := -1;
  v_cand_id UUID;
  v_next_color TEXT := NULL;
  v_seq INT;
  v_action_payload JSONB;
BEGIN
  -- 1. Autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_AUTENTICADO');
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abn_' || substr(p_session_id::text, 1, 8) || '_' || substr(v_user_id::text, 1, 8) || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  -- 2. Bloqueo canónico: 1º game_sessions, 2º game_tables
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  -- 3. Idempotencia: Sesión ya terminada
  IF UPPER(v_session.status::text) IN ('FINISHED', 'SETTLED', 'CANCELLED', 'ABANDONED', 'CLOSED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_finished', true,
      'status', v_session.status::text,
      'message', 'La partida ya finalizó previamente.'
    );
  END IF;

  -- 4. Verificar existencia e idempotencia del jugador
  SELECT * INTO v_leaving_player
  FROM public.game_table_players
  WHERE table_id = v_session.table_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'JUGADOR_NO_ENCONTRADO_EN_MESA');
  END IF;

  IF v_leaving_player.status::text IN ('ABANDONED', 'LEFT') THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_abandoned', true,
      'message', 'El jugador ya figura como retirado de la partida.'
    );
  END IF;

  -- 5. Marcar jugador como ABANDONED en game_table_players
  UPDATE public.game_table_players
  SET status = 'ABANDONED'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = v_session.table_id
    AND user_id = v_user_id;

  v_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_game_type := LOWER(COALESCE(v_table.game_type::text, v_session.game_type::text, ''));

  -- Registrar en JSONB del estado
  v_abandoned_arr := COALESCE(v_state->'abandonedPlayers', '[]'::jsonb);
  IF NOT (v_abandoned_arr @> to_jsonb(v_user_id::text)) THEN
    v_abandoned_arr := v_abandoned_arr || to_jsonb(v_user_id::text);
  END IF;
  v_state := jsonb_set(v_state, '{abandonedPlayers}', v_abandoned_arr);
  v_state := jsonb_set(v_state, '{lastAbandonedUserId}', to_jsonb(v_user_id::text));
  v_state := jsonb_set(v_state, '{lastAbandonedAt}', to_jsonb(NOW()::text));

  -- Calcular secuencia para game_actions
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
  FROM public.game_actions
  WHERE session_id = p_session_id;

  -- =========================================================================
  -- CASO A: JUEGOS COLECTIVOS (BINGO, POLLA VENEZOLANA)
  -- =========================================================================
  IF v_game_type IN ('bingo', 'polla_venezolana', 'polla') THEN
    UPDATE public.game_sessions
    SET current_state = v_state,
        updated_at = NOW()
    WHERE id = p_session_id;

    v_action_payload := jsonb_build_object(
      'userId', v_user_id,
      'isGameOver', false,
      'gameType', v_game_type,
      'reason', 'VOLUNTARY_ABANDON'
    );

    INSERT INTO public.game_actions (
      session_id, user_id, sequence_number, action_type, payload, action_data, idempotency_key, created_at
    ) VALUES (
      p_session_id, v_user_id, v_seq, 'PLAYER_ABANDONED', v_action_payload, v_action_payload, v_effective_idempotency || '_act', NOW()
    ) ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'isGameOver', false,
      'action', 'COLLECTIVE_GAME_ABANDONED',
      'message', 'Has salido de la sala de juego.'
    );
  END IF;

  -- =========================================================================
  -- CASO B: PARTIDAS POR EQUIPOS (ej: Domino 2v2 o Truco 2v2)
  -- =========================================================================
  IF v_leaving_player.team_number IS NOT NULL THEN
    SELECT ARRAY_AGG(user_id ORDER BY seat_number ASC), MAX(team_number)
    INTO v_opponent_team_players, v_winning_team
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND team_number != v_leaving_player.team_number
      AND status::text NOT IN ('ABANDONED', 'LEFT');

    IF v_opponent_team_players IS NOT NULL AND array_length(v_opponent_team_players, 1) > 0 THEN
      -- Victoria inmediata para el equipo contrario
      v_state := jsonb_set(v_state, '{isGameOver}', 'true'::jsonb);
      v_state := jsonb_set(v_state, '{winnerTeam}', to_jsonb(v_winning_team));
      v_state := jsonb_set(v_state, '{winnerReason}', '"OPPONENT_TEAM_BY_ABANDON"'::jsonb);

      -- Liquidación financiera autoritativa al equipo rival completo si hay pozo
      IF v_table.entry_fee > 0.00 THEN
        PERFORM public.universal_settle_game_session(
          p_session_id,
          v_opponent_team_players,
          v_winning_team,
          v_effective_idempotency || '_settle'
        );
      END IF;

      UPDATE public.game_sessions
      SET status = 'FINISHED'::session_status_enum,
          winner_team = v_winning_team,
          current_turn_user_id = NULL,
          turn_deadline_at = NULL,
          ended_at = NOW(),
          current_state = v_state,
          updated_at = NOW()
      WHERE id = p_session_id;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          updated_at = NOW()
      WHERE id = v_session.table_id;

      v_action_payload := jsonb_build_object(
        'userId', v_user_id,
        'abandonedTeam', v_leaving_player.team_number,
        'winnerTeam', v_winning_team,
        'winnerUserIds', v_opponent_team_players,
        'isGameOver', true,
        'reason', 'OPPONENT_TEAM_BY_ABANDON'
      );

      INSERT INTO public.game_actions (
        session_id, user_id, sequence_number, action_type, payload, action_data, idempotency_key, created_at
      ) VALUES (
        p_session_id, v_user_id, v_seq, 'PLAYER_ABANDONED', v_action_payload, v_action_payload, v_effective_idempotency || '_act', NOW()
      ) ON CONFLICT DO NOTHING;

      RETURN jsonb_build_object(
        'success', true,
        'isGameOver', true,
        'winnerTeam', v_winning_team,
        'message', 'Has abandonado. Victoria otorgada al equipo rival.'
      );
    END IF;
  END IF;

  -- =========================================================================
  -- CASO C: PARTIDAS INDIVIDUALES (1v1 O MULTIJUGADOR INDIVIDUAL)
  -- =========================================================================
  SELECT ARRAY_AGG(user_id ORDER BY seat_number ASC, joined_at ASC)
  INTO v_active_players
  FROM public.game_table_players
  WHERE table_id = v_session.table_id
    AND user_id != v_user_id
    AND status::text NOT IN ('ABANDONED', 'LEFT');

  v_active_count := COALESCE(array_length(v_active_players, 1), 0);

  -- SUB-CASO C.1: NO QUEDAN JUGADORES ACTIVOS (0 RIVALES)
  IF v_active_count = 0 THEN
    IF v_table.entry_fee > 0.00 THEN
      PERFORM public.refund_game_session(
        p_session_id,
        'Abandono total sin jugadores activos restantes',
        v_effective_idempotency || '_refund'
      );
    END IF;

    UPDATE public.game_sessions
    SET status = 'CANCELLED'::session_status_enum,
        current_turn_user_id = NULL,
        turn_deadline_at = NULL,
        ended_at = NOW(),
        current_state = v_state || jsonb_build_object('isGameOver', true, 'isCancelled', true),
        updated_at = NOW()
    WHERE id = p_session_id;

    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_session.table_id;

    v_action_payload := jsonb_build_object(
      'userId', v_user_id,
      'isGameOver', true,
      'cancelled', true,
      'reason', 'ALL_PLAYERS_LEFT'
    );

    INSERT INTO public.game_actions (
      session_id, user_id, sequence_number, action_type, payload, action_data, idempotency_key, created_at
    ) VALUES (
      p_session_id, v_user_id, v_seq, 'PLAYER_ABANDONED', v_action_payload, v_action_payload, v_effective_idempotency || '_act', NOW()
    ) ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'isGameOver', true,
      'cancelled', true,
      'message', 'Partida cancelada: todos los jugadores abandonaron.'
    );

  -- SUB-CASO C.2: EXACTAMENTE 1 RIVAL ACTIVO RESTANTE (1v1 O ÚLTIMO SUPERVIVIENTE)
  ELSIF v_active_count = 1 THEN
    v_winner_id := v_active_players[1];

    -- Ajustes específicos según tipo de juego
    IF v_game_type IN ('rps', 'rock_paper_scissors', 'piedra_papel_tijera') THEN
      v_state := jsonb_set(v_state, '{status}', '"MATCH_ENDED"'::jsonb);
      v_state := jsonb_set(v_state, '{phase}', '"match_ended"'::jsonb);
      v_state := jsonb_set(v_state, '{isGameOver}', 'true'::jsonb);
      v_state := jsonb_set(v_state, '{winnerUserId}', to_jsonb(v_winner_id::text));
      v_state := jsonb_set(
        v_state,
        '{matchWinner}',
        (CASE WHEN v_state->>'player1Id' = v_winner_id::text THEN '"player1"' ELSE '"player2"' END)::jsonb
      );
      DELETE FROM public.game_session_secrets WHERE session_id = p_session_id;
    ELSE
      v_state := jsonb_set(v_state, '{isGameOver}', 'true'::jsonb);
      v_state := jsonb_set(v_state, '{winnerUserId}', to_jsonb(v_winner_id::text));
      v_state := jsonb_set(v_state, '{winner}', to_jsonb(v_winner_id::text));
      v_state := jsonb_set(v_state, '{abandonedWinner}', to_jsonb(v_winner_id::text));
      v_state := jsonb_set(v_state, '{winnerReason}', '"OPPONENT_BY_ABANDON"'::jsonb);
    END IF;

    -- Liquidación financiera autoritativa inmediata al ganador si hay pozo
    IF v_table.entry_fee > 0.00 THEN
      PERFORM public.universal_settle_game_session(
        p_session_id,
        ARRAY[v_winner_id],
        NULL,
        v_effective_idempotency || '_settle'
      );
    END IF;

    UPDATE public.game_sessions
    SET status = 'FINISHED'::session_status_enum,
        winner_user_id = v_winner_id,
        current_turn_user_id = NULL,
        turn_deadline_at = NULL,
        ended_at = NOW(),
        current_state = v_state,
        updated_at = NOW()
    WHERE id = p_session_id;

    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_session.table_id;

    v_action_payload := jsonb_build_object(
      'userId', v_user_id,
      'isGameOver', true,
      'winnerId', v_winner_id,
      'winnerUserIds', ARRAY[v_winner_id],
      'reason', 'OPPONENT_BY_ABANDON'
    );

    INSERT INTO public.game_actions (
      session_id, user_id, sequence_number, action_type, payload, action_data, idempotency_key, created_at
    ) VALUES (
      p_session_id, v_user_id, v_seq, 'PLAYER_ABANDONED', v_action_payload, v_action_payload, v_effective_idempotency || '_act', NOW()
    ) ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'isGameOver', true,
      'winnerId', v_winner_id,
      'message', 'Has abandonado la partida. Victoria otorgada al rival.'
    );

  -- SUB-CASO C.3: DOS O MÁS RIVALES ACTIVOS RESTANTES (PARTIDA MULTIJUGADOR CONTINÚA)
  ELSE
    -- Reasignar turno si el turno actual pertenecía al jugador que abandona
    IF v_session.current_turn_user_id = v_user_id THEN
      -- Buscar en playerOrder si existe
      v_player_order := v_state->'playerOrder';
      IF jsonb_typeof(v_player_order) = 'array' AND jsonb_array_length(v_player_order) >= 2 THEN
        v_order_len := jsonb_array_length(v_player_order);
        -- Encontrar la posición del jugador que abandona
        FOR v_i IN 0..(v_order_len - 1) LOOP
          IF (v_player_order->>v_i)::UUID = v_user_id THEN
            v_found_idx := v_i;
            EXIT;
          END IF;
        END LOOP;

        -- Buscar el siguiente jugador que esté activo en v_active_players
        IF v_found_idx >= 0 THEN
          FOR v_i IN 1..v_order_len LOOP
            v_cand_id := (v_player_order->>((v_found_idx + v_i) % v_order_len))::UUID;
            IF v_cand_id = ANY(v_active_players) THEN
              v_next_turn_user_id := v_cand_id;
              EXIT;
            END IF;
          END LOOP;
        END IF;
      END IF;

      -- Fallback: buscar según seat_number en v_active_players
      IF v_next_turn_user_id IS NULL THEN
        SELECT user_id INTO v_next_turn_user_id
        FROM public.game_table_players
        WHERE table_id = v_session.table_id
          AND user_id = ANY(v_active_players)
          AND seat_number > v_leaving_player.seat_number
        ORDER BY seat_number ASC
        LIMIT 1;

        -- Wrap-around al asiento menor si no hay mayor
        IF v_next_turn_user_id IS NULL THEN
          SELECT user_id INTO v_next_turn_user_id
          FROM public.game_table_players
          WHERE table_id = v_session.table_id
            AND user_id = ANY(v_active_players)
          ORDER BY seat_number ASC
          LIMIT 1;
        END IF;
      END IF;

      -- Obtener color del siguiente jugador si el juego lo utiliza
      IF v_game_type IN ('parchis', 'parchis_venezolano', 'ludo', 'atrapaito', 'atrapaito_criollo', 'atrapaito_clasico') THEN
        -- Revisar si players en current_state tiene mapeo de colores
        IF jsonb_typeof(v_state->'players') = 'array' THEN
          SELECT (elem->>'color') INTO v_next_color
          FROM jsonb_array_elements(v_state->'players') AS elem
          WHERE (elem->>'id')::text = v_next_turn_user_id::text
             OR (elem->>'userId')::text = v_next_turn_user_id::text
          LIMIT 1;
        END IF;

        IF v_next_color IS NOT NULL THEN
          v_state := jsonb_set(v_state, '{currentColor}', to_jsonb(v_next_color));
          v_state := jsonb_set(v_state, '{turn}', to_jsonb(v_next_color));
        END IF;

        IF v_game_type IN ('parchis', 'parchis_venezolano', 'ludo') THEN
          v_state := jsonb_set(v_state, '{hasRolled}', 'false'::jsonb);
          v_state := jsonb_set(v_state, '{rolledValue}', 'null'::jsonb);
        END IF;
      END IF;

      v_duration := COALESCE(v_session.turn_duration_seconds, 30);
      v_new_deadline := NOW() + (v_duration || ' seconds')::interval;
    ELSE
      -- El turno pertenecía a otro jugador, conservar turno y deadline actual
      v_next_turn_user_id := v_session.current_turn_user_id;
      v_new_deadline := v_session.turn_deadline_at;
    END IF;

    UPDATE public.game_sessions
    SET current_state = v_state,
        current_turn_user_id = v_next_turn_user_id,
        turn_deadline_at = v_new_deadline,
        updated_at = NOW()
    WHERE id = p_session_id;

    v_action_payload := jsonb_build_object(
      'userId', v_user_id,
      'isGameOver', false,
      'remainingActivePlayers', v_active_count,
      'nextTurnUserId', v_next_turn_user_id,
      'turnDeadlineAt', v_new_deadline,
      'reason', 'PLAYER_ABANDONED_CONTINUE'
    );

    INSERT INTO public.game_actions (
      session_id, user_id, sequence_number, action_type, payload, action_data, idempotency_key, created_at
    ) VALUES (
      p_session_id, v_user_id, v_seq, 'PLAYER_ABANDONED', v_action_payload, v_action_payload, v_effective_idempotency || '_act', NOW()
    ) ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'success', true,
      'isGameOver', false,
      'remainingActivePlayers', v_active_count,
      'nextTurnUserId', v_next_turn_user_id,
      'message', 'Has abandonado la partida. El juego continúa con los jugadores restantes.'
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $function$
DECLARE
  v_caller_id UUID;
  v_table RECORD;
  v_player RECORD;
  v_wallet RECORD;
  v_active_players_count INTEGER;
  v_effective_idempotency TEXT;
  v_target_session_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_AUTENTICADO');
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abn_tbl_' || substr(p_table_id::text, 1, 8) || '_' || substr(v_caller_id::text, 1, 8) || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  -- 1. Determinar ID de sesión objetivo si existe
  v_target_session_id := p_session_id;
  IF v_target_session_id IS NULL THEN
    SELECT id INTO v_target_session_id
    FROM public.game_sessions
    WHERE table_id = p_table_id
      AND status::text IN ('ACTIVE', 'READY', 'STARTING', 'in_progress', 'ROUND_COMMIT', 'ROUND_REVEAL', 'PLAYING')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 2. Si hay sesión activa en curso, DELEGAR DIRECTAMENTE a abandon_game_secure
  IF v_target_session_id IS NOT NULL THEN
    RETURN public.abandon_game_secure(v_target_session_id, v_effective_idempotency);
  END IF;

  -- 3. Si NO hay sesión activa, es una salida de sala pre-partida (Lobby / Waiting)
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MESA_NO_ENCONTRADA');
  END IF;

  -- Verificar jugador en la mesa
  SELECT * INTO v_player
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND user_id = v_caller_id
  FOR UPDATE;

  IF NOT FOUND OR v_player.status::text IN ('LEFT', 'ABANDONED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_left', true,
      'table_id', p_table_id,
      'message', 'El jugador ya no se encuentra activo en la mesa.'
    );
  END IF;

  -- Marcar jugador como LEFT
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id
    AND user_id = v_caller_id;

  -- 4. Reembolso pre-partida si la mesa tenía entry_fee retenido
  IF v_table.entry_fee > 0.00 THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_caller_id AND currency = 'VES'
    FOR UPDATE;

    IF FOUND AND v_wallet.held_balance >= v_table.entry_fee THEN
      UPDATE public.wallets
      SET available_balance = available_balance + v_table.entry_fee,
          held_balance = GREATEST(0.00, held_balance - v_table.entry_fee),
          updated_at = NOW()
      WHERE id = v_wallet.id;

      INSERT INTO public.ledger_entries (
        wallet_id,
        user_id,
        amount,
        currency,
        entry_type,
        direction,
        reference_id,
        reference_table,
        reference_type,
        balance_after,
        balance_after_available,
        balance_after_held,
        idempotency_key,
        description,
        created_at
      ) VALUES (
        v_wallet.id,
        v_caller_id,
        v_table.entry_fee,
        'VES',
        'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
        'RELEASE'::ledger_direction_enum,
        p_table_id,
        'game_tables',
        'TABLE_ENTRY_HOLD',
        v_wallet.available_balance + v_wallet.held_balance,
        v_wallet.available_balance + v_table.entry_fee,
        GREATEST(0.00, v_wallet.held_balance - v_table.entry_fee),
        v_effective_idempotency || '_refund',
        'Liberación de saldo retenido por salida voluntaria de sala pre-partida',
        NOW()
      );
    END IF;
  END IF;

  -- 5. Comprobar si la mesa quedó sin jugadores activos
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND status::text NOT IN ('LEFT', 'ABANDONED');

  IF v_active_players_count = 0 THEN
    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_table_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'player_user_id', v_caller_id,
    'remaining_players', v_active_players_count,
    'message', 'Has salido de la sala exitosamente.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.abandon_game_secure(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role;
