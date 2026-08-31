-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 078
-- CORRECCIÓN DEFINITIVA DE REFERENCIA DE ALIAS SQL (gt.updated_at vs gs.updated_at)
-- ==============================================================================
-- Causa Raíz Identificada (Error 42703):
-- La tabla `public.game_tables` (alias `gt`) contiene la columna `updated_at`
-- (añadida en migración 053), mientras que `public.game_sessions` (alias `gs`)
-- utiliza `created_at`, `started_at` y `ended_at` (definidos en migración 009).
-- La función `create_game_table_secure` (migración 077) referenció erróneamente
-- el alias `gs.updated_at` en lugar de `gt.updated_at`.
-- Esta migración corrige las funciones RPC para utilizar las columnas canónicas
-- del esquema sin alterar innecesariamente las tablas.
-- ==============================================================================

-- 1. CORREGIR FUNCIÓN RPC: create_game_table_secure
CREATE OR REPLACE FUNCTION public.create_game_table_secure(
  p_game_type TEXT,
  p_name VARCHAR DEFAULT NULL,
  p_visibility table_visibility_enum DEFAULT 'PUBLIC',
  p_entry_fee NUMERIC DEFAULT 25.00,
  p_max_players SMALLINT DEFAULT 2,
  p_config JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_profile_status account_status_enum;
  v_enum_game_type game_type_enum;
  v_table_id UUID;
  v_invite_code VARCHAR(32);
  v_table_name VARCHAR(100);
  v_min_players SMALLINT;
  v_expires_at TIMESTAMPTZ;
  v_code_attempts INT := 0;
  v_code_candidate VARCHAR(32);
  v_active_table_count INT;
  v_wallet_balance NUMERIC;
  v_ledger_id UUID;
  v_player_id UUID;
  v_stale_rec RECORD;
  v_stale_session_status TEXT;
BEGIN
  -- 1. Identificación y Validación del Usuario Autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa';
  END IF;

  -- Bloquear billetera al inicio para consistencia transaccional y evitar condiciones de carrera concurrentes
  IF p_entry_fee > 0 THEN
    SELECT available_balance INTO v_wallet_balance
    FROM public.wallets
    WHERE user_id = v_user_id FOR UPDATE;
  END IF;

  SELECT account_status INTO v_profile_status
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_profile_status IS NULL THEN
    PERFORM public.ensure_current_user_profile();
    SELECT account_status INTO v_profile_status
    FROM public.profiles
    WHERE user_id = v_user_id;
  END IF;

  IF v_profile_status::text NOT IN ('ACTIVE', 'PENDING_VERIFICATION') THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Tu cuenta no está autorizada para crear mesas';
  END IF;

  v_enum_game_type := public.fn_normalize_game_type_enum(p_game_type);

  -- 2. AUTO-ABANDONO SEGURO DE PARTICIPACIONES HUÉRFANAS, OBSOLETAS O COMPLETADAS DE FACTO:
  FOR v_stale_rec IN
    SELECT DISTINCT gt.id as table_id, gs.id as session_id
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
    WHERE gtp.user_id = v_user_id
      AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
      AND gt.game_type = v_enum_game_type
      AND (
        -- Caso A: La mesa está abierta o llena pero no tiene sesión (huérfana)
        (gt.status::text IN ('OPEN', 'FULL') AND gs.id IS NULL)
        -- Caso B: La sesión existe pero no ha iniciado la partida (lista, en espera, pausada)
        OR (gs.id IS NOT NULL AND gs.status::text IN ('WAITING', 'READY', 'STARTING', 'PAUSED'))
        -- Caso C: La sesión está finalizada o liquidada de facto en la base de datos
        OR (gs.id IS NOT NULL AND (
             gs.status::text IN ('FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'ABANDONED')
             -- O ya cuenta con un ganador definido en el estado JSONB (como en Bingo al finalizar)
             OR (gs.current_state->>'winnerUserId') IS NOT NULL AND (gs.current_state->>'winnerUserId') <> ''
           ))
        -- Caso D: La mesa o sesión está colgada/stale por antigüedad o inactividad superior a 1 hora (usa gt.updated_at)
        OR (gt.status::text IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE') AND (
             gt.created_at < NOW() - INTERVAL '1 hour'
             OR (gt.updated_at IS NOT NULL AND gt.updated_at < NOW() - INTERVAL '1 hour')
           ))
        -- Caso E: La mesa ya cumplió su fecha límite de expiración
        OR (gt.expires_at IS NOT NULL AND gt.expires_at < NOW())
      )
  LOOP
    BEGIN
      -- Si la sesión está colgada en estado ACTIVE pero es obsoleta/terminada de facto, la forzamos a 'CANCELLED'
      IF v_stale_rec.session_id IS NOT NULL THEN
        SELECT status::text INTO v_stale_session_status FROM public.game_sessions WHERE id = v_stale_rec.session_id;
        IF v_stale_session_status = 'ACTIVE' THEN
          UPDATE public.game_sessions
          SET status = 'CANCELLED'::session_status_enum,
              ended_at = NOW()
          WHERE id = v_stale_rec.session_id;
        END IF;
      END IF;

      -- Llamada segura para realizar el reembolso correspondiente al saldo disponible
      PERFORM public.abandon_game_table_secure(
        v_stale_rec.table_id,
        v_stale_rec.session_id,
        'auto_cleanup_create_078_' || v_stale_rec.table_id::text
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 3. CONTROL ESTRICTO DE OTRA MESA ACTIVA REAL:
  SELECT COUNT(*) INTO v_active_table_count
  FROM public.game_table_players gtp
  JOIN public.game_tables gt ON gt.id = gtp.table_id
  LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
  WHERE gtp.user_id = v_user_id
    AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
    AND gt.game_type = v_enum_game_type
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE')
    -- La sesión de juego debe estar activa y sin ganador
    AND gs.id IS NOT NULL
    AND gs.status::text = 'ACTIVE'
    AND (gs.current_state->>'winnerUserId' IS NULL OR gs.current_state->>'winnerUserId' = '')
    -- Excluir sesiones/mesas obsoletas de más de 1 hora (referenciando gt.updated_at y gt.created_at)
    AND (gt.updated_at IS NULL OR gt.updated_at >= NOW() - INTERVAL '1 hour')
    AND gt.created_at >= NOW() - INTERVAL '1 hour'
    -- Y no haber expirado
    AND (gt.expires_at IS NULL OR gt.expires_at >= NOW());

  IF v_active_table_count > 0 THEN
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya estás participando en una mesa activa de este juego.';
  END IF;

  -- 4. Validaciones de Tarifas y Límites de Jugadores
  IF p_entry_fee < 25.00 OR p_entry_fee > 5000.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe estar entre 25 Bs. y 5.000 Bs.';
  END IF;

  IF NOT public.is_valid_entry_fee(p_entry_fee, v_enum_game_type) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe estar entre 25 Bs. y 5.000 Bs.';
  END IF;

  IF p_max_players < 2 OR p_max_players > 1000 THEN
    RAISE EXCEPTION 'INVALID_PLAYERS_COUNT: Cantidad de jugadores inválida (mínimo 2, maximum 1000)';
  END IF;

  v_min_players := CASE 
    WHEN p_max_players >= 4 THEN 2
    ELSE p_max_players 
  END;

  -- 5. Validación de Saldo Disponible para Cuota de Entrada (si p_entry_fee > 0)
  IF p_entry_fee > 0 THEN
    IF v_wallet_balance IS NULL OR v_wallet_balance < p_entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente para crear la mesa (% Bs.)', p_entry_fee;
    END IF;
  END IF;

  -- 6. Generación de Código de Invitación Único
  LOOP
    v_code_attempts := v_code_attempts + 1;
    IF p_visibility = 'PRIVATE' THEN
      v_code_candidate := 'TRK-' || (1000 + floor(random() * 9000))::text;
    ELSE
      v_code_candidate := 'PUB-' || (1000 + floor(random() * 9000))::text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.game_tables WHERE invite_code = v_code_candidate) THEN
      v_invite_code := v_code_candidate;
      EXIT;
    END IF;

    IF v_code_attempts > 20 THEN
      v_invite_code := CASE WHEN p_visibility = 'PRIVATE' THEN 'TRK-' ELSE 'PUB-' END || substring(encode(gen_random_bytes(3), 'hex') from 1 for 5);
      EXIT;
    END IF;
  END LOOP;

  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || p_game_type);
  v_expires_at := NOW() + INTERVAL '24 hours';
  v_table_id := gen_random_uuid();

  -- 7. Insertar Nueva Mesa de Juego
  INSERT INTO public.game_tables (
    id, host_user_id, game_type, visibility, entry_fee, min_players, max_players,
    current_players_count, status, invite_code, expires_at, config
  ) VALUES (
    v_table_id, v_user_id, v_enum_game_type, p_visibility, p_entry_fee, v_min_players, p_max_players,
    1, 'OPEN'::table_status_enum, v_invite_code, v_expires_at,
    COALESCE(p_config, '{}'::jsonb) || jsonb_build_object('name', v_table_name)
  );

  -- 8. Deducción de Saldo de la Olla y Creación de Ledger Entry
  IF p_entry_fee > 0 THEN
    UPDATE public.wallets
    SET available_balance = available_balance - p_entry_fee,
        held_balance = held_balance + p_entry_fee,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    v_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id, user_id, entry_type, amount, balance_after, reference_id, description, status
    ) VALUES (
      v_ledger_id, v_user_id, 'GAME_ENTRY_HOLD'::ledger_entry_type_enum, -p_entry_fee,
      (v_wallet_balance - p_entry_fee), v_table_id,
      'Retención de entrada al crear mesa #' || substring(v_table_id::text from 1 for 8),
      'COMPLETED'::ledger_status_enum
    );
  END IF;

  -- 9. Asentamiento del Anfitrión de la Mesa en Asiento #1
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id, table_id, user_id, seat_number, status, entry_held_entry_id, joined_at
  ) VALUES (
    v_player_id, v_table_id, v_user_id, 1, 'JOINED'::player_table_status_enum, v_ledger_id, NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'host_user_id', v_user_id,
    'seat_number', 1,
    'invite_code', v_invite_code,
    'name', v_table_name,
    'entry_fee', p_entry_fee,
    'max_players', p_max_players,
    'current_players_count', 1,
    'status', 'OPEN',
    'created_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) TO authenticated, service_role;


-- 2. CORREGIR FUNCIÓN RPC: rpc_draw_bingo_ball_secure (RATE LIMIT SOBRE game_tables.updated_at)
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

  -- 5. Rate-Limiting para Sorteos Automatizados (utiliza v_table.updated_at)
  IF v_is_automated THEN
    v_call_interval := COALESCE((v_table.config->>'call_interval_ms')::INT, 3500);
    IF v_table.updated_at IS NOT NULL AND NOW() < (v_table.updated_at + (v_call_interval || ' milliseconds')::INTERVAL) THEN
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
    -- Cambiar mesa a ACTIVE y refrescar updated_at
    UPDATE public.game_tables
    SET status = 'ACTIVE'::table_status_enum,
        updated_at = NOW()
    WHERE id = v_session.table_id;

    -- Cambiar sesión a ACTIVE con started_at
    UPDATE public.game_sessions
    SET status = 'ACTIVE'::session_status_enum,
        started_at = NOW()
    WHERE id = p_session_id;

    -- Actualizar config de la mesa si es necesario
    UPDATE public.game_tables
    SET config = config || jsonb_build_object('status', 'ACTIVE')
    WHERE id = v_session.table_id;

    -- Actualizar estado del juego en la sesión
    v_current_state := jsonb_set(v_current_state, '{status}', '"in_progress"'::jsonb);
  ELSE
    -- Refrescar updated_at de la mesa
    UPDATE public.game_tables
    SET updated_at = NOW()
    WHERE id = v_session.table_id;
  END IF;

  UPDATE public.game_sessions
  SET current_state = v_current_state
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
