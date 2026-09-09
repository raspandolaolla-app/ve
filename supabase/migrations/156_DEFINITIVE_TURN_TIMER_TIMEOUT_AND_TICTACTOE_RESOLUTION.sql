-- ============================================================================
-- MIGRACIÓN 156: DEFINITIVE TURN TIMER, TIMEOUT AND TICTACTOE RESOLUTION
-- ============================================================================
-- 1. Corrige la comparación de enums en game_type usando game_type::text
--    y los identificadores canónicos reales de public.game_type_enum:
--    ('BINGO', 'ATRAPAITO', 'DOMINO_VENEZOLANO', 'TRUCO_VENEZOLANO', 'DAMAS',
--     'POLLA_VENEZOLANA', 'TRES_EN_RAYA', 'PIEDRA_PAPEL_TIJERA', 'UNA_OLLA', 'CHESS')
-- 2. Establece public.fn_refresh_turn_expires_at() como la ÚNICA fuente autoritativa de deadlines.
-- 3. Evita la sobreescritura errónea del deadline cuando el turno no cambia.
-- 4. Corrige expire_game_turn_secure(UUID) con bloqueo FOR UPDATE, atómico e idempotente.
-- 5. Resuelve Tic Tac Toe / Tres en Raya: primero a 3 victorias (targetWins).
--    Timeout suma score al oponente, reinicia tablero si no se alcanzó la meta,
--    o finaliza y liquida si se alcanzaron 3 victorias.
-- 6. En estados terminales (FINISHED, SETTLED, CANCELLED, ABANDONED):
--    turn_expires_at = NULL, turn_deadline_at = NULL, current_turn_user_id = NULL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1: Normalizar duraciones de turno de sesiones activas de forma segura
-- ----------------------------------------------------------------------------
-- Excluir explícitamente juegos con reglas de tiempo diferentes o sin turnos
UPDATE public.game_sessions
SET turn_duration_seconds = 30
WHERE status::text IN ('ACTIVE', 'WAITING', 'READY', 'PLAYING')
  AND game_type::text NOT IN ('CHESS', 'PIEDRA_PAPEL_TIJERA', 'BINGO', 'POLLA_VENEZOLANA')
  AND (turn_duration_seconds IS NULL OR turn_duration_seconds != 30);

UPDATE public.game_sessions
SET turn_duration_seconds = 15
WHERE status::text IN ('ACTIVE', 'WAITING', 'READY', 'PLAYING')
  AND game_type::text = 'CHESS'
  AND (turn_duration_seconds IS NULL OR turn_duration_seconds != 15);

-- ----------------------------------------------------------------------------
-- PARTE 2: Trigger Autoritativo Único: fn_refresh_turn_expires_at()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_refresh_turn_expires_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_duration INT;
  v_status TEXT;
  v_old_status TEXT;
  v_turn_changed BOOLEAN := false;
  v_game_type_str TEXT;
BEGIN
  v_old_status := COALESCE(OLD.status::TEXT, 'UNKNOWN');
  v_status := COALESCE(NEW.status::TEXT, 'UNKNOWN');

  -- REGLA CRÍTICA 1: Prevenir flipping / reversión de estado terminal a activo
  IF UPPER(v_old_status) IN ('FINISHED', 'SETTLED', 'CANCELLED', 'ABANDONED')
      AND UPPER(v_status) NOT IN ('FINISHED', 'SETTLED', 'CANCELLED', 'ABANDONED') THEN
    NEW.status := OLD.status;
    NEW.turn_deadline_at := NULL;
    NEW.turn_expires_at := NULL;
    NEW.current_turn_user_id := NULL;
    RETURN NEW;
  END IF;

  -- REGLA CRÍTICA 2: Si la sesión está en estado terminal, limpiar deadlines y turno
  IF UPPER(v_status) IN ('FINISHED', 'SETTLED', 'CANCELLED', 'ABANDONED') THEN
    NEW.turn_deadline_at := NULL;
    NEW.turn_expires_at := NULL;
    NEW.current_turn_user_id := NULL;
    IF NEW.current_state IS NOT NULL THEN
      NEW.current_state := jsonb_set(NEW.current_state, '{turnExpiresAt}', 'null'::jsonb);
      NEW.current_state := jsonb_set(NEW.current_state, '{turnDeadlineAt}', 'null'::jsonb);
      NEW.current_state := jsonb_set(NEW.current_state, '{currentTurnUserId}', 'null'::jsonb);
      NEW.current_state := jsonb_set(NEW.current_state, '{turnUserId}', 'null'::jsonb);
    END IF;
    RETURN NEW;
  END IF;

  -- REGLA CRÍTICA 3: Solo refrescar si el juego está en estado activo / jugable
  IF UPPER(v_status) IN ('ACTIVE', 'WAITING', 'READY', 'SALES', 'DRAWING', 'PLAYING', 'ROUND_COMMIT') THEN
    -- Determinar tipo de juego
    v_game_type_str := COALESCE(NEW.game_type::TEXT, '');
    IF v_game_type_str = '' AND NEW.table_id IS NOT NULL THEN
      SELECT game_type::TEXT INTO v_game_type_str
      FROM public.game_tables
      WHERE id = NEW.table_id;
    END IF;

    -- Bingo y Polla no tienen temporizadores de turno individual
    IF UPPER(v_game_type_str) IN ('BINGO', 'POLLA_VENEZOLANA') THEN
      RETURN NEW;
    END IF;

    -- Detectar si hubo cambio de turno, inicio de partida o avance de ronda
    IF TG_OP = 'INSERT' THEN
      v_turn_changed := true;
    ELSIF (OLD.current_turn_user_id IS DISTINCT FROM NEW.current_turn_user_id)
       OR (OLD.turn_deadline_at IS NULL AND NEW.current_turn_user_id IS NOT NULL)
       OR (UPPER(v_old_status) NOT IN ('ACTIVE', 'PLAYING') AND UPPER(v_status) IN ('ACTIVE', 'PLAYING'))
       OR (COALESCE(OLD.current_state->>'round', '') IS DISTINCT FROM COALESCE(NEW.current_state->>'round', '')) THEN
      v_turn_changed := true;
    END IF;

    -- Determinar duración autoritativa
    IF UPPER(v_game_type_str) = 'CHESS' THEN
      v_duration := 15;
    ELSE
      v_duration := COALESCE(
        NULLIF((NEW.current_state->>'turnDurationSeconds'), '')::INT,
        NEW.turn_duration_seconds,
        30
      );
      IF v_duration <= 0 THEN
        v_duration := 30;
      END IF;
    END IF;

    NEW.turn_duration_seconds := v_duration;

    IF v_turn_changed THEN
      -- Generar NUEVO deadline autoritativo del servidor
      NEW.turn_expires_at := NOW() + (v_duration || ' seconds')::INTERVAL;
      NEW.turn_deadline_at := NEW.turn_expires_at;

      -- Sincronizar también en current_state
      IF NEW.current_state IS NOT NULL THEN
        NEW.current_state := jsonb_set(NEW.current_state, '{turnDurationSeconds}', to_jsonb(v_duration));
        NEW.current_state := jsonb_set(NEW.current_state, '{turnExpiresAt}', to_jsonb(to_char(NEW.turn_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
        NEW.current_state := jsonb_set(NEW.current_state, '{turnDeadlineAt}', to_jsonb(to_char(NEW.turn_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
        IF NEW.current_turn_user_id IS NOT NULL THEN
          NEW.current_state := jsonb_set(NEW.current_state, '{currentTurnUserId}', to_jsonb(NEW.current_turn_user_id::text));
          NEW.current_state := jsonb_set(NEW.current_state, '{turnUserId}', to_jsonb(NEW.current_turn_user_id::text));
        END IF;
      END IF;
    ELSE
      -- Si NO cambió de turno, PRESERVAR el deadline existente del servidor para no reiniciar el reloj
      IF TG_OP = 'UPDATE' AND OLD.turn_deadline_at IS NOT NULL THEN
        NEW.turn_deadline_at := OLD.turn_deadline_at;
        NEW.turn_expires_at := OLD.turn_expires_at;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Vincular trigger tanto en INSERT como en UPDATE
DROP TRIGGER IF EXISTS trg_refresh_turn_expires_at ON public.game_sessions;
CREATE TRIGGER trg_refresh_turn_expires_at
BEFORE INSERT OR UPDATE ON public.game_sessions
FOR EACH ROW
EXECUTE FUNCTION public.fn_refresh_turn_expires_at();

-- ----------------------------------------------------------------------------
-- PARTE 3: expire_game_turn_secure(p_session_id uuid) Atómico e Idempotente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_game_turn_secure(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_session RECORD;
  v_state JSONB;
  v_game_type_str TEXT;
  v_turn_user_id UUID;
  v_opponent_id UUID := NULL;
  v_player_order JSONB;
  v_player_count INT := 0;
  v_scores JSONB;
  v_opp_score INT := 0;
  v_target_wins INT := 3;
  v_curr_round INT := 1;
  v_duration INT := 30;
  v_new_deadline TIMESTAMPTZ;
  v_lives JSONB;
  v_curr_lives INT;
  v_settle_result JSONB;
  v_i INT;
  v_p RECORD;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_ID_REQUIRED');
  END IF;

  -- 1. Bloqueo Pesimista Estricto (FOR UPDATE)
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  END IF;

  -- 2. Idempotencia: Sesión ya cerrada, finalizada o liquidada
  IF UPPER(v_session.status::TEXT) IN ('FINISHED', 'SETTLED', 'CANCELLED', 'ABANDONED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'ALREADY_FINALIZED',
      'status', v_session.status::text
    );
  END IF;

  -- 3. Idempotencia Temporal: Si el turno aún no ha expirado (margen de gracia de 1s)
  IF v_session.turn_deadline_at IS NOT NULL AND v_session.turn_deadline_at > (NOW() + INTERVAL '1 second') THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'TURN_NOT_EXPIRED',
      'currentTurnUserId', v_session.current_turn_user_id,
      'turnDeadlineAt', v_session.turn_deadline_at
    );
  END IF;

  v_state := COALESCE(v_session.current_state, '{}'::jsonb);

  -- 4. Determinar jugador en turno
  v_turn_user_id := COALESCE(
    v_session.current_turn_user_id,
    (v_state->>'turnUserId')::UUID,
    (v_state->>'currentTurnUserId')::UUID
  );

  IF v_turn_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_TURN');
  END IF;

  -- 5. Determinar tipo de juego canónico
  v_game_type_str := UPPER(COALESCE(v_session.game_type::TEXT, ''));
  IF v_game_type_str = '' THEN
    SELECT UPPER(game_type::TEXT) INTO v_game_type_str
    FROM public.game_tables
    WHERE id = v_session.table_id;
  END IF;

  -- 6. Resolver participantes y oponente de forma autoritativa
  v_player_order := COALESCE(v_state->'playerOrder', '[]'::jsonb);
  v_player_count := COALESCE(jsonb_array_length(v_player_order), 0);

  IF v_player_count = 0 THEN
    SELECT jsonb_agg(user_id ORDER BY seat_number ASC)
    INTO v_player_order
    FROM public.game_table_players
    WHERE table_id = v_session.table_id AND status != 'LEFT';
    v_player_count := COALESCE(jsonb_array_length(v_player_order), 0);
  END IF;

  -- Encontrar el oponente directo
  IF v_player_count > 0 THEN
    FOR v_i IN 0..(v_player_count - 1) LOOP
      IF (v_player_order->>v_i)::UUID <> v_turn_user_id THEN
        v_opponent_id := (v_player_order->>v_i)::UUID;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_opponent_id IS NULL THEN
    SELECT user_id INTO v_opponent_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
      AND user_id <> v_turn_user_id
      AND status != 'LEFT'
    LIMIT 1;
  END IF;

  -- Fallback de oponente desde current_state si los jugadores de la mesa ya cambiaron
  IF v_opponent_id IS NULL AND v_state ? 'playerSymbols' THEN
    BEGIN
      SELECT key::UUID INTO v_opponent_id
      FROM jsonb_each_text(v_state->'playerSymbols')
      WHERE key <> v_turn_user_id::text
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_opponent_id := NULL;
    END;
  END IF;

  IF v_opponent_id IS NULL AND v_state ? 'playerNames' THEN
    BEGIN
      SELECT key::UUID INTO v_opponent_id
      FROM jsonb_each_text(v_state->'playerNames')
      WHERE key <> v_turn_user_id::text
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_opponent_id := NULL;
    END;
  END IF;

  IF v_opponent_id IS NULL AND v_state ? 'scores' THEN
    BEGIN
      SELECT key::UUID INTO v_opponent_id
      FROM jsonb_each_text(v_state->'scores')
      WHERE key <> v_turn_user_id::text
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_opponent_id := NULL;
    END;
  END IF;

  -- Si tras todos los fallbacks no existe oponente, cancelar la sesión huérfana de forma limpia
  IF v_opponent_id IS NULL THEN
    UPDATE public.game_sessions
    SET status = 'CANCELLED'::session_status_enum,
        turn_deadline_at = NULL,
        turn_expires_at = NULL,
        current_turn_user_id = NULL,
        updated_at = NOW()
    WHERE id = p_session_id;

    PERFORM public.refund_game_session(
      p_session_id,
      'Sesión huérfana cancelada por timeout sin oponente válido',
      'orphan_timeout_' || p_session_id::text
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'SESSION_CANCELLED_NO_OPPONENT',
      'sessionId', p_session_id
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- CASO 1: TIC TAC TOE / TRES EN RAYA / LA VIEJA (Al mejor de 3 victorias)
  -- --------------------------------------------------------------------------
  IF v_game_type_str IN ('TRES_EN_RAYA', 'TICTACTOE', 'TIC_TAC_TOE') THEN
    v_target_wins := COALESCE(NULLIF(v_state->>'targetWins', '')::INT, 3);
    v_scores := COALESCE(v_state->'scores', '{}'::jsonb);
    v_opp_score := COALESCE((v_scores->>v_opponent_id::text)::INT, 0) + 1;
    v_scores := jsonb_set(v_scores, ARRAY[v_opponent_id::text], to_jsonb(v_opp_score));

    -- Comprobar si el oponente alcanzó la meta de victorias (3)
    IF v_opp_score >= v_target_wins THEN
      -- MATCH_ENDED: Finalizar partida definitivamente
      v_state := jsonb_set(v_state, '{scores}', v_scores);
      v_state := jsonb_set(v_state, '{status}', '"game_won"'::jsonb);
      v_state := jsonb_set(v_state, '{winnerUserId}', to_jsonb(v_opponent_id::text));
      v_state := jsonb_set(v_state, '{roundWinnerUserId}', to_jsonb(v_opponent_id::text));
      v_state := jsonb_set(v_state, '{finishReason}', '"TIMEOUT_TARGET_WINS_REACHED"'::jsonb);
      v_state := jsonb_set(v_state, '{turnExpiresAt}', 'null'::jsonb);
      v_state := jsonb_set(v_state, '{turnDeadlineAt}', 'null'::jsonb);
      v_state := jsonb_set(v_state, '{currentTurnUserId}', 'null'::jsonb);
      v_state := jsonb_set(v_state, '{turnUserId}', 'null'::jsonb);

      UPDATE public.game_sessions
      SET current_state = v_state,
          status = 'FINISHED'::session_status_enum,
          winner_user_id = v_opponent_id,
          turn_deadline_at = NULL,
          turn_expires_at = NULL,
          current_turn_user_id = NULL,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = p_session_id;

      -- Liquidación oficial universal
      v_settle_result := public.universal_settle_game_session(
        p_session_id,
        ARRAY[v_opponent_id],
        NULL,
        'ttt_timeout_' || p_session_id::text || '_' || EXTRACT(EPOCH FROM NOW())::int::text
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'MATCH_ENDED_BY_TIMEOUT',
        'winnerUserId', v_opponent_id,
        'finalScores', v_scores,
        'settlement', v_settle_result
      );
    ELSE
      -- ROUND_RESULT: Avanzar a la siguiente ronda con tablero limpio
      v_curr_round := COALESCE(NULLIF(v_state->>'round', '')::INT, 1) + 1;
      v_duration := 30;
      v_new_deadline := NOW() + (v_duration || ' seconds')::INTERVAL;

      v_state := jsonb_set(v_state, '{scores}', v_scores);
      v_state := jsonb_set(v_state, '{round}', to_jsonb(v_curr_round));
      v_state := jsonb_set(v_state, '{board}', '[null,null,null,null,null,null,null,null,null]'::jsonb);
      v_state := jsonb_set(v_state, '{winningLine}', 'null'::jsonb);
      v_state := jsonb_set(v_state, '{roundWinnerUserId}', to_jsonb(v_opponent_id::text));
      v_state := jsonb_set(v_state, '{moveHistory}', '[]'::jsonb);
      v_state := jsonb_set(v_state, '{status}', '"playing"'::jsonb);
      v_state := jsonb_set(v_state, '{turnUserId}', to_jsonb(v_opponent_id::text));
      v_state := jsonb_set(v_state, '{currentTurnUserId}', to_jsonb(v_opponent_id::text));
      v_state := jsonb_set(v_state, '{turnExpiresAt}', to_jsonb(to_char(v_new_deadline, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
      v_state := jsonb_set(v_state, '{turnDeadlineAt}', to_jsonb(to_char(v_new_deadline, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));

      UPDATE public.game_sessions
      SET current_state = v_state,
          current_turn_user_id = v_opponent_id,
          turn_duration_seconds = v_duration,
          turn_deadline_at = v_new_deadline,
          turn_expires_at = v_new_deadline,
          updated_at = NOW()
      WHERE id = p_session_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'ROUND_WON_BY_TIMEOUT',
        'roundWinnerUserId', v_opponent_id,
        'newRound', v_curr_round,
        'scores', v_scores,
        'nextTurnUserId', v_opponent_id,
        'turnDeadlineAt', v_new_deadline
      );
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- CASO 2: AJEDREZ (CHESS) Y DAMAS (Damas timeout = victoria oponente)
  -- --------------------------------------------------------------------------
  IF v_game_type_str IN ('CHESS', 'DAMAS') THEN
    IF v_opponent_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'OPPONENT_NOT_FOUND');
    END IF;

    v_state := jsonb_set(v_state, '{status}', '"game_won"'::jsonb);
    v_state := jsonb_set(v_state, '{winnerUserId}', to_jsonb(v_opponent_id::text));
    v_state := jsonb_set(v_state, '{finishReason}', '"TIMEOUT_FORFEIT"'::jsonb);
    v_state := jsonb_set(v_state, '{turnExpiresAt}', 'null'::jsonb);
    v_state := jsonb_set(v_state, '{turnDeadlineAt}', 'null'::jsonb);
    v_state := jsonb_set(v_state, '{currentTurnUserId}', 'null'::jsonb);
    v_state := jsonb_set(v_state, '{turnUserId}', 'null'::jsonb);

    UPDATE public.game_sessions
    SET current_state = v_state,
        status = 'FINISHED'::session_status_enum,
        winner_user_id = v_opponent_id,
        turn_deadline_at = NULL,
        turn_expires_at = NULL,
        current_turn_user_id = NULL,
        ended_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    v_settle_result := public.universal_settle_game_session(
      p_session_id,
      ARRAY[v_opponent_id],
      NULL,
      'timeout_' || lower(v_game_type_str) || '_' || p_session_id::text || '_' || EXTRACT(EPOCH FROM NOW())::int::text
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'MATCH_ENDED_BY_TIMEOUT',
      'gameType', v_game_type_str,
      'winnerUserId', v_opponent_id,
      'settlement', v_settle_result
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- CASO 3: OTROS JUEGOS SECUENCIALES (SISTEMA RESILIENTE DE VIDAS / ROTACIÓN)
  -- --------------------------------------------------------------------------
  v_lives := COALESCE(v_state->'lives', '{}'::jsonb);
  v_curr_lives := COALESCE((v_lives->>v_turn_user_id::text)::INT, 3) - 1;
  IF v_curr_lives < 0 THEN
    v_curr_lives := 0;
  END IF;
  v_lives := jsonb_set(v_lives, ARRAY[v_turn_user_id::text], to_jsonb(v_curr_lives));
  v_state := jsonb_set(v_state, '{lives}', v_lives);

  IF v_curr_lives <= 0 AND v_opponent_id IS NOT NULL THEN
    -- Vidas agotadas: victoria definitiva para el oponente
    v_state := jsonb_set(v_state, '{status}', '"game_won"'::jsonb);
    v_state := jsonb_set(v_state, '{winnerUserId}', to_jsonb(v_opponent_id::text));
    v_state := jsonb_set(v_state, '{finishReason}', '"TIMEOUT_LIVES_EXHAUSTED"'::jsonb);
    v_state := jsonb_set(v_state, '{turnExpiresAt}', 'null'::jsonb);
    v_state := jsonb_set(v_state, '{turnDeadlineAt}', 'null'::jsonb);
    v_state := jsonb_set(v_state, '{currentTurnUserId}', 'null'::jsonb);
    v_state := jsonb_set(v_state, '{turnUserId}', 'null'::jsonb);

    UPDATE public.game_sessions
    SET current_state = v_state,
        status = 'FINISHED'::session_status_enum,
        winner_user_id = v_opponent_id,
        turn_deadline_at = NULL,
        turn_expires_at = NULL,
        current_turn_user_id = NULL,
        ended_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;

    v_settle_result := public.universal_settle_game_session(
      p_session_id,
      ARRAY[v_opponent_id],
      NULL,
      'timeout_settle_' || p_session_id::text || '_' || EXTRACT(EPOCH FROM NOW())::int::text
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'MATCH_ENDED_BY_TIMEOUT',
      'winnerUserId', v_opponent_id,
      'settlement', v_settle_result
    );
  ELSE
    -- Aún quedan vidas: rotar turno al oponente con un nuevo deadline autoritativo
    v_duration := COALESCE(
      NULLIF((v_state->>'turnDurationSeconds'), '')::INT,
      v_session.turn_duration_seconds,
      30
    );
    v_new_deadline := NOW() + (v_duration || ' seconds')::INTERVAL;

    v_state := jsonb_set(v_state, '{turnUserId}', to_jsonb(v_opponent_id::text));
    v_state := jsonb_set(v_state, '{currentTurnUserId}', to_jsonb(v_opponent_id::text));
    v_state := jsonb_set(v_state, '{turnExpiresAt}', to_jsonb(to_char(v_new_deadline, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    v_state := jsonb_set(v_state, '{turnDeadlineAt}', to_jsonb(to_char(v_new_deadline, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));

    UPDATE public.game_sessions
    SET current_state = v_state,
        current_turn_user_id = v_opponent_id,
        turn_duration_seconds = v_duration,
        turn_deadline_at = v_new_deadline,
        turn_expires_at = v_new_deadline,
        updated_at = NOW()
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'LIVES_DECREMENTED',
      'remainingLives', v_curr_lives,
      'nextTurnUserId', v_opponent_id,
      'turnDeadlineAt', v_new_deadline
    );
  END IF;
END;
$function$;

-- ----------------------------------------------------------------------------
-- PARTE 4: expire_game_turn_secure() batch sin argumentos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_game_turn_secure()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_row RECORD;
  v_count INT := 0;
  v_res JSONB;
BEGIN
  FOR v_row IN (
    SELECT gs.id
    FROM public.game_sessions gs
    JOIN public.game_tables gt ON gt.id = gs.table_id
    WHERE gs.status::text IN ('ACTIVE', 'READY', 'STARTING', 'PLAYING')
      AND gt.game_type::text NOT IN ('BINGO', 'POLLA_VENEZOLANA')
      AND gs.current_turn_user_id IS NOT NULL
      AND (
        (gs.turn_deadline_at IS NOT NULL AND gs.turn_deadline_at < NOW())
        OR
        (gs.turn_expires_at IS NOT NULL AND gs.turn_expires_at < NOW())
      )
    ORDER BY COALESCE(gs.turn_deadline_at, gs.turn_expires_at) ASC
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
END;
$function$;

-- ----------------------------------------------------------------------------
-- PARTE 5: process_expired_turns() Actualizado para usar expire_game_turn_secure
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_expired_turns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_expired_row RECORD;
  v_p1_id UUID;
  v_p2_id UUID;
  v_p1_committed BOOLEAN;
  v_p2_committed BOOLEAN;
  v_winner_id UUID;
  v_loser_id UUID;
  v_secret_choices JSONB;
  v_idempotency_key VARCHAR(100);
  v_curr_round INT;
  v_new_state JSONB;
BEGIN
  -- A. JUEGOS SECUENCIALES: Invocar expire_game_turn_secure autoritativo
  FOR v_expired_row IN
    SELECT s.id
    FROM public.game_sessions s
    JOIN public.game_tables t ON t.id = s.table_id
    WHERE s.status::text IN ('ACTIVE', 'active', 'PLAYING', 'playing')
      AND s.current_turn_user_id IS NOT NULL
      AND t.game_type::text NOT IN ('rock_paper_scissors', 'rps', 'PIEDRA_PAPEL_TIJERA', 'BINGO', 'POLLA_VENEZOLANA')
      AND (
        (s.turn_expires_at IS NOT NULL AND s.turn_expires_at < NOW())
        OR
        (s.turn_deadline_at IS NOT NULL AND s.turn_deadline_at < NOW())
      )
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      PERFORM public.expire_game_turn_secure(v_expired_row.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_expired_turns] Error en juego secuencial %: %', v_expired_row.id, SQLERRM;
    END;
  END LOOP;

  -- B. PIEDRA, PAPEL O TIJERA (ROUND_DEADLINE simultáneo)
  FOR v_expired_row IN
    SELECT s.id, s.table_id, s.current_state, s.created_at, s.turn_expires_at
    FROM public.game_sessions s
    JOIN public.game_tables t ON t.id = s.table_id
    WHERE s.status::text IN ('ACTIVE', 'active', 'PLAYING', 'playing')
      AND t.game_type::text IN ('rock_paper_scissors', 'rps', 'PIEDRA_PAPEL_TIJERA')
      AND (
        (s.turn_expires_at IS NOT NULL AND s.turn_expires_at < NOW())
        OR
        (s.turn_deadline_at IS NOT NULL AND s.turn_deadline_at < NOW())
      )
      AND COALESCE(s.current_state->>'status', '') IN ('ROUND_COMMIT', 'selecting')
    FOR UPDATE OF s SKIP LOCKED
  LOOP
    BEGIN
      v_curr_round := COALESCE((v_expired_row.current_state->>'roundNumber')::int, 1);
      v_idempotency_key := 'rps_timeout_' || v_expired_row.id::text || '_rnd_' || v_curr_round::text;

      v_p1_id := NULLIF(TRIM(v_expired_row.current_state->>'player1Id'), '')::uuid;
      v_p2_id := NULLIF(TRIM(v_expired_row.current_state->>'player2Id'), '')::uuid;
      IF v_p1_id IS NULL THEN
        SELECT user_id INTO v_p1_id
        FROM public.game_table_players
        WHERE table_id = v_expired_row.table_id
          AND status NOT IN ('LEFT')
        ORDER BY seat_number ASC, joined_at ASC
        LIMIT 1;
      END IF;
      IF v_p2_id IS NULL THEN
        SELECT user_id INTO v_p2_id
        FROM public.game_table_players
        WHERE table_id = v_expired_row.table_id
          AND user_id != v_p1_id
          AND status NOT IN ('LEFT')
        ORDER BY seat_number ASC, joined_at ASC
        LIMIT 1;
      END IF;

      SELECT secret_state->'rps_choices' INTO v_secret_choices
      FROM public.game_session_secrets
      WHERE session_id = v_expired_row.id;

      v_p1_committed := (v_secret_choices ? v_p1_id::text) OR
                        COALESCE((v_expired_row.current_state->'playerChoices'->(v_p1_id::text)->>'committed')::boolean, false);
      v_p2_committed := (v_secret_choices ? v_p2_id::text) OR
                        COALESCE((v_expired_row.current_state->'playerChoices'->(v_p2_id::text)->>'committed')::boolean, false);

      IF v_p1_committed AND NOT v_p2_committed THEN
        v_winner_id := v_p1_id;
        v_loser_id := v_p2_id;
      ELSIF v_p2_committed AND NOT v_p1_committed THEN
        v_winner_id := v_p2_id;
        v_loser_id := v_p1_id;
      ELSE
        v_winner_id := NULL;
        v_loser_id := NULL;
      END IF;

      IF v_winner_id IS NOT NULL THEN
        v_new_state := COALESCE(v_expired_row.current_state, '{}'::jsonb) || jsonb_build_object(
          'winnerUserId', v_winner_id,
          'abandonedBy', v_loser_id,
          'status', 'MATCH_ENDED',
          'phase', 'match_ended'
        );
        UPDATE public.game_sessions
        SET current_state = v_new_state,
            status = 'FINISHED'::session_status_enum,
            winner_user_id = v_winner_id,
            turn_deadline_at = NULL,
            turn_expires_at = NULL,
            current_turn_user_id = NULL,
            updated_at = NOW()
        WHERE id = v_expired_row.id;

        PERFORM public.universal_settle_game_session(
          v_expired_row.id,
          ARRAY[v_winner_id],
          NULL::int,
          v_idempotency_key
        );
      ELSE
        v_new_state := COALESCE(v_expired_row.current_state, '{}'::jsonb) || jsonb_build_object(
          'cancelReason', 'ROUND_TIMEOUT_NO_CHOICES',
          'status', 'MATCH_CANCELLED'
        );
        UPDATE public.game_sessions
        SET current_state = v_new_state,
            status = 'CANCELLED'::session_status_enum,
            turn_deadline_at = NULL,
            turn_expires_at = NULL,
            current_turn_user_id = NULL,
            updated_at = NOW()
        WHERE id = v_expired_row.id;

        PERFORM public.refund_game_session(
          v_expired_row.id,
          'Tiempo de ronda agotado sin jugadas de ningún participante',
          v_idempotency_key
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_expired_turns] Error en ronda simultánea RPS %: %', v_expired_row.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;

-- ----------------------------------------------------------------------------
-- PARTE 6: cron_expire_turns_loop() No-bloqueante
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_expire_turns_loop()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  PERFORM public.expire_game_turn_secure();
  PERFORM public.detect_disconnected_players();
END;
$function$;

