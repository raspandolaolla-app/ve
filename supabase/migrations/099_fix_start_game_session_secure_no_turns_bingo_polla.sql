-- ==============================================================================
-- MIGRACIÓN 099: Corrección de Asignación de Turnos en start_game_session_secure
-- Proyecto: RASPANDO LA OLLA
--
-- Descripción:
-- Corrige start_game_session_secure para garantizar que juegos NO basados en turnos
-- (como BINGO, POLLA y POLLA_VENEZOLANA) NO asignen current_turn_user_id ni turn_deadline_at.
-- Los turnos sólo deben existir para juegos de turnos alternados (Ajedrez, Dominó,
-- Truco, Tres en Raya, Damas, etc.).
-- ==============================================================================

-- 1. Eliminar sobrecargas previas para evitar conflictos de firma
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB);
DROP FUNCTION IF EXISTS public.start_game_session_secure(UUID, JSONB, INT);

-- 2. Creación canónica de start_game_session_secure
CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id UUID,
  p_initial_state JSONB DEFAULT NULL,
  p_turn_duration_seconds INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_table RECORD;
  v_unique_players_count INT;
  v_players JSONB := '[]'::jsonb;
  v_player_order JSONB := '[]'::jsonb;
  v_player_record RECORD;
  v_session_id UUID;
  v_first_turn_user_id UUID;
  v_white_player_id UUID;
  v_black_player_id UUID;
  v_initial_state JSONB;
  v_deadline TIMESTAMPTZ;
  v_turn_seconds INT := 30;
  v_game_type_str TEXT;
  v_is_turn_user_valid BOOLEAN := false;
  v_is_turn_based BOOLEAN := true;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para iniciar la partida';
  END IF;

  -- 1. Bloqueo transaccional de la mesa (SELECT ... FOR UPDATE)
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

  -- 2. Verificación estricta de anfitrión
  IF v_table.host_user_id <> v_user_id THEN
    RAISE EXCEPTION 'ONLY_HOST_CAN_START: Únicamente el Anfitrión de la mesa puede iniciar la partida';
  END IF;

  -- 3. Identificar tipo de juego y si es basado en turnos
  v_game_type_str := UPPER(v_table.game_type::text);
  IF v_game_type_str IN ('BINGO', 'POLLA', 'POLLA_VENEZOLANA') THEN
    v_is_turn_based := false;
  ELSE
    v_is_turn_based := true;
  END IF;

  -- 4. Si ya existe una sesión activa o en curso, retornarla idempotentemente
  SELECT id, current_turn_user_id, turn_deadline_at INTO v_session_id, v_first_turn_user_id, v_deadline
  FROM public.game_sessions
  WHERE table_id = p_table_id
    AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'IN_PROGRESS')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', v_session_id,
      'table_id', p_table_id,
      'current_turn_user_id', CASE WHEN v_is_turn_based THEN v_first_turn_user_id ELSE NULL END,
      'turn_deadline_at', CASE WHEN v_is_turn_based THEN v_deadline ELSE NULL END,
      'already_active', true,
      'status', 'ACTIVE'
    );
  END IF;

  -- 5. Validar cantidad de jugadores DISTINTOS activos en la mesa
  SELECT COUNT(DISTINCT gtp.user_id) INTO v_unique_players_count
  FROM public.game_table_players gtp
  WHERE gtp.table_id = p_table_id
    AND gtp.status != 'LEFT'::player_table_status_enum;

  IF v_unique_players_count < v_table.min_players THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS: Se requieren al menos % jugadores diferentes para iniciar la partida (actualmente hay %)', v_table.min_players, v_unique_players_count;
  END IF;

  -- 6. Compilar lista ordenada de jugadores activos por número de asiento
  FOR v_player_record IN (
    SELECT gtp.user_id, gtp.seat_number, p.display_name, p.first_name, p.last_name, p.avatar_url
    FROM (
      SELECT DISTINCT ON (user_id) user_id, seat_number, joined_at
      FROM public.game_table_players
      WHERE table_id = p_table_id
        AND status != 'LEFT'::player_table_status_enum
      ORDER BY user_id, seat_number ASC
    ) gtp
    JOIN public.profiles p ON p.user_id = gtp.user_id
    ORDER BY gtp.seat_number ASC, gtp.joined_at ASC
  ) LOOP
    IF v_first_turn_user_id IS NULL THEN
      v_first_turn_user_id := v_player_record.user_id;
      v_white_player_id := v_player_record.user_id;
    ELSEIF v_black_player_id IS NULL THEN
      v_black_player_id := v_player_record.user_id;
    END IF;

    v_player_order := v_player_order || to_jsonb(v_player_record.user_id::text);

    v_players := v_players || jsonb_build_object(
      'userId', v_player_record.user_id,
      'seatNumber', v_player_record.seat_number,
      'displayName', COALESCE(NULLIF(trim(v_player_record.display_name), ''), trim(COALESCE(v_player_record.first_name, '') || ' ' || COALESCE(v_player_record.last_name, ''))),
      'avatarUrl', v_player_record.avatar_url
    );
  END LOOP;

  -- 7. Determinar duración de turno si aplica
  IF v_is_turn_based THEN
    IF v_game_type_str = 'CHESS' THEN
      v_turn_seconds := 15;
    ELSEIF p_turn_duration_seconds IS NOT NULL AND p_turn_duration_seconds > 0 THEN
      v_turn_seconds := p_turn_duration_seconds;
    ELSE
      v_turn_seconds := 30;
    END IF;
    v_deadline := NOW() + (v_turn_seconds || ' seconds')::interval;
  ELSE
    -- Bingo / Polla: No hay turnos individuales ni límite de turno
    v_first_turn_user_id := NULL;
    v_deadline := NULL;
  END IF;

  -- 8. Determinar estado inicial canónico completo
  IF NOT v_is_turn_based THEN
    -- LÓGICA ESPECÍFICA PARA JUEGOS SIN TURNOS (BINGO / POLLA)
    IF p_initial_state IS NOT NULL AND jsonb_typeof(p_initial_state) = 'object' AND p_initial_state <> '{}'::jsonb THEN
      v_initial_state := p_initial_state - 'currentTurnUserId' - 'turnUserId' - 'turnExpiresAt';
    ELSE
      v_initial_state := jsonb_build_object(
        'status', 'playing',
        'players', v_players,
        'drawnBalls', '[]'::jsonb,
        'currentBall', NULL,
        'totalBalls', 75,
        'variant', '75',
        'round', 1
      );
    END IF;
  ELSE
    -- LÓGICA PARA JUEGOS POR TURNOS (Ajedrez, Tres en raya, etc.)
    IF p_initial_state IS NOT NULL AND jsonb_typeof(p_initial_state) = 'object' AND p_initial_state <> '{}'::jsonb THEN
      -- Respetar el primer turno indicado por el motor si es un jugador de la mesa
      IF p_initial_state ? 'turnUserId' AND (p_initial_state->>'turnUserId') IS NOT NULL THEN
        BEGIN
          v_first_turn_user_id := (p_initial_state->>'turnUserId')::uuid;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      ELSEIF p_initial_state ? 'currentTurnUserId' AND (p_initial_state->>'currentTurnUserId') IS NOT NULL THEN
        BEGIN
          v_first_turn_user_id := (p_initial_state->>'currentTurnUserId')::uuid;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      -- Validar que el turno pertenezca a un jugador activo en la mesa
      SELECT EXISTS (
        SELECT 1 FROM public.game_table_players
        WHERE table_id = p_table_id
          AND user_id = v_first_turn_user_id
          AND status != 'LEFT'::player_table_status_enum
      ) INTO v_is_turn_user_valid;

      IF NOT v_is_turn_user_valid THEN
        SELECT user_id INTO v_first_turn_user_id
        FROM public.game_table_players
        WHERE table_id = p_table_id
          AND status != 'LEFT'::player_table_status_enum
        ORDER BY seat_number ASC
        LIMIT 1;
      END IF;

      -- Inyectar turnExpiresAt autoritativo y turnUserId en el estado
      v_initial_state := jsonb_set(
        jsonb_set(
          jsonb_set(p_initial_state, '{currentTurnUserId}', to_jsonb(v_first_turn_user_id::text)),
          '{turnUserId}', to_jsonb(v_first_turn_user_id::text)
        ),
        '{turnExpiresAt}', to_jsonb(to_char(v_deadline, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      );
    ELSE
      -- Generación canónica server-side según tipo de juego
      IF v_game_type_str = 'CHESS' THEN
        v_white_player_id := v_table.host_user_id;
        IF v_black_player_id IS NULL OR v_black_player_id = v_white_player_id THEN
          SELECT gtp.user_id INTO v_black_player_id
          FROM public.game_table_players gtp
          WHERE gtp.table_id = p_table_id
            AND gtp.status != 'LEFT'::player_table_status_enum
            AND gtp.user_id != v_white_player_id
          LIMIT 1;
        END IF;
        v_first_turn_user_id := v_white_player_id;

        v_initial_state := jsonb_build_object(
          'fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          'playerWhiteUserId', v_white_player_id,
          'playerBlackUserId', v_black_player_id,
          'currentTurnUserId', v_first_turn_user_id,
          'turnUserId', v_first_turn_user_id,
          'turnExpiresAt', v_deadline,
          'moveHistory', '[]'::jsonb,
          'winnerUserId', NULL,
          'isDraw', false,
          'status', 'playing'
        );
      ELSEIF v_game_type_str IN ('TRES_EN_RAYA', 'TIC_TAC_TOE') THEN
        v_initial_state := jsonb_build_object(
          'board', '[null,null,null,null,null,null,null,null,null]'::jsonb,
          'playerSymbols', jsonb_build_object(v_white_player_id::text, 'X', COALESCE(v_black_player_id, v_white_player_id)::text, 'O'),
          'scores', jsonb_build_object(v_white_player_id::text, 0, COALESCE(v_black_player_id, v_white_player_id)::text, 0),
          'round', 1,
          'status', 'playing',
          'turnUserId', v_first_turn_user_id,
          'currentTurnUserId', v_first_turn_user_id,
          'turnExpiresAt', v_deadline
        );
      ELSEIF v_game_type_str IN ('PIEDRA_PAPEL_TIJERA', 'ROCK_PAPER_SCISSORS') THEN
        v_initial_state := jsonb_build_object(
          'playerChoices', '{}'::jsonb,
          'phase', 'CHOOSING',
          'round', 1,
          'scores', jsonb_build_object(v_white_player_id::text, 0, COALESCE(v_black_player_id, v_white_player_id)::text, 0),
          'status', 'playing',
          'turnUserId', v_first_turn_user_id,
          'currentTurnUserId', v_first_turn_user_id,
          'turnExpiresAt', v_deadline
        );
      ELSE
        v_initial_state := jsonb_build_object(
          'status', 'playing',
          'playerOrder', v_player_order,
          'players', v_players,
          'currentTurnUserId', v_first_turn_user_id,
          'turnUserId', v_first_turn_user_id,
          'turnExpiresAt', v_deadline,
          'round', 1
        );
      END IF;
    END IF;
  END IF;

  v_session_id := gen_random_uuid();

  -- 9. Inserción atómica en game_sessions con manejo de turnos condicional
  INSERT INTO public.game_sessions (
    id, table_id, game_type, session_number, status, current_state,
    current_turn_user_id, turn_deadline_at, started_at
  ) VALUES (
    v_session_id,
    p_table_id,
    v_table.game_type,
    1,
    'ACTIVE'::session_status_enum,
    v_initial_state,
    CASE WHEN v_is_turn_based THEN v_first_turn_user_id ELSE NULL END,
    CASE WHEN v_is_turn_based THEN v_deadline ELSE NULL END,
    NOW()
  );

  -- 10. Actualización atómica en game_tables
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      started_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'table_id', p_table_id,
    'current_turn_user_id', CASE WHEN v_is_turn_based THEN v_first_turn_user_id ELSE NULL END,
    'turn_deadline_at', CASE WHEN v_is_turn_based THEN v_deadline ELSE NULL END,
    'already_active', false,
    'status', 'ACTIVE'
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID, JSONB, INT) TO authenticated, service_role, anon;

-- Notificar recarga de schema cache
NOTIFY pgrst, 'reload schema';
