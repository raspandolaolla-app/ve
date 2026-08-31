-- ==============================================================================
-- MIGRACIÓN 074 — CORRECCIÓN DE ENUMS EN TABLES, RPC START GAME Y ABANDONOS
-- ==============================================================================
-- Esta migración resuelve dos fallos clave detectados en producción de Supabase:
-- 
-- 1. ERROR: column "started_at" of relation "game_tables" does not exist
--    Se redefine `start_game_session_secure` para no intentar actualizar la columna inexistente
--    `started_at` en `public.game_tables`. Solamente se actualizan `status` y `updated_at`.
-- 
-- 2. ERROR: invalid input value for enum table_status_enum: "WAITING"
--    Se redefinen `abandon_game_table_secure`, `admin_disconnect_player_secure` y
--    `admin_cleanup_all_invalid_tables` utilizando castings seguros `status::text`
--    en las comparaciones de estados de mesas para prevenir errores de validación de enums
--    cuando se comparan con estados del frontend que no existen físicamente en la DB.
-- ==============================================================================

-- 1. Redefinición Segura de start_game_session_secure (Remover actualizacion de started_at en game_tables)
CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_table RECORD;
  v_players JSONB := '[]'::jsonb;
  v_player_order JSONB := '[]'::jsonb;
  v_lives JSONB := '{}'::jsonb;
  v_scores JSONB := '{}'::jsonb;
  v_player_record RECORD;
  v_session_id UUID;
  v_first_turn_user_id UUID;
  v_initial_state JSONB;
  v_deadline TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión';
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

  IF v_table.host_user_id <> v_user_id THEN
    RAISE EXCEPTION 'ONLY_HOST_CAN_START: Únicamente el Anfitrión de la mesa puede iniciar la partida';
  END IF;

  -- Si ya existe una sesión activa o en curso, retornarla
  -- Se aplica casting seguro (status::text) para evitar error 22P02 con 'IN_PROGRESS'
  SELECT id INTO v_session_id
  FROM public.game_sessions
  WHERE table_id = p_table_id
    AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'IN_PROGRESS');

  IF v_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', v_session_id,
      'table_id', p_table_id,
      'already_active', true
    );
  END IF;

  -- Compilar lista de jugadores activos
  FOR v_player_record IN (
    SELECT gtp.user_id, gtp.seat_number, p.display_name, p.first_name, p.last_name, p.avatar_url
    FROM public.game_table_players gtp
    JOIN public.profiles p ON p.user_id = gtp.user_id
    WHERE gtp.table_id = p_table_id
      AND gtp.status != 'LEFT'::player_table_status_enum
    ORDER BY gtp.seat_number ASC
  ) LOOP
    IF v_first_turn_user_id IS NULL THEN
      v_first_turn_user_id := v_player_record.user_id;
    END IF;

    v_player_order := v_player_order || to_jsonb(v_player_record.user_id::text);
    v_lives := jsonb_set(v_lives, ARRAY[v_player_record.user_id::text], '3'::jsonb);
    v_scores := jsonb_set(v_scores, ARRAY[v_player_record.user_id::text], '0'::jsonb);

    v_players := v_players || jsonb_build_object(
      'userId', v_player_record.user_id,
      'seatNumber', v_player_record.seat_number,
      'displayName', COALESCE(NULLIF(trim(v_player_record.display_name), ''), trim(COALESCE(v_player_record.first_name, '') || ' ' || COALESCE(v_player_record.last_name, ''))),
      'avatarUrl', v_player_record.avatar_url,
      'lives', 3
    );
  END LOOP;

  IF v_first_turn_user_id IS NULL THEN
    v_first_turn_user_id := v_user_id;
  END IF;

  v_deadline := NOW() + INTERVAL '10 seconds';
  v_session_id := gen_random_uuid();

  v_initial_state := jsonb_build_object(
    'status', 'PLAYING',
    'playerOrder', v_player_order,
    'players', v_players,
    'currentTurnUserId', v_first_turn_user_id,
    'lives', v_lives,
    'scores', v_scores,
    'round', 1
  );

  -- Crear sesión en game_sessions usando el estado ACTIVE del enum
  INSERT INTO public.game_sessions (
    id, table_id, game_type, session_number, status, current_state,
    current_turn_user_id, turn_deadline_at, started_at
  ) VALUES (
    v_session_id, p_table_id, v_table.game_type, 1, 'ACTIVE'::session_status_enum,
    v_initial_state, v_first_turn_user_id, v_deadline, NOW()
  );

  -- Actualizar estado de la mesa a ACTIVE de forma segura (sin started_at que no existe en el esquema de tablas)
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'table_id', p_table_id,
    'current_turn_user_id', v_first_turn_user_id,
    'turn_deadline_at', v_deadline,
    'already_active', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID) TO authenticated, service_role, anon;


-- 2. Redefinición Segura de abandon_game_table_secure (con castings status::text seguros)
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_table RECORD;
  v_session RECORD;
  v_player RECORD;
  v_wallet RECORD;
  v_active_players_count INT;
  v_remaining_player RECORD;
  v_effective_idempotency VARCHAR(100);
  v_settle_result JSONB;
  v_already_refunded BOOLEAN := FALSE;
  v_refund_amount NUMERIC(15, 2) := 0.00;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para abandonar la mesa';
  END IF;

  -- Bloquear mesa y verificar existencia
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa de juego no existe';
  END IF;

  -- Verificar si el jugador pertenece a la mesa
  SELECT * INTO v_player 
  FROM public.game_table_players 
  WHERE table_id = p_table_id AND user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'ALREADY_LEFT_OR_NOT_IN_TABLE'
    );
  END IF;

  -- Cambiar el estado del participante en game_table_players a 'LEFT'
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND user_id = v_caller_id;

  -- Buscar sesión de juego asociada
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  ELSE
    SELECT * INTO v_session FROM public.game_sessions
    WHERE table_id = p_table_id AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED')
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE;
  END IF;

  -- Procesar liberación/devolución de entrada si la partida NO ha sido liquidada/capturada y la mesa tiene entrada
  IF v_table.entry_fee > 0.00 AND (v_session.id IS NULL OR v_session.status NOT IN ('SETTLED', 'ACTIVE')) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE user_id = v_caller_id
        AND reference_table = 'game_tables'
        AND reference_id = p_table_id
        AND entry_type = 'TABLE_ENTRY_REFUND'::ledger_entry_type_enum
    ) INTO v_already_refunded;

    IF NOT v_already_refunded THEN
      SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_caller_id FOR UPDATE;
      IF FOUND THEN
        IF v_wallet.held_balance >= v_table.entry_fee THEN
          UPDATE public.wallets
          SET available_balance = available_balance + v_table.entry_fee,
              held_balance = held_balance - v_table.entry_fee,
              updated_at = NOW()
          WHERE id = v_wallet.id;
        ELSE
          UPDATE public.wallets
          SET available_balance = available_balance + v_table.entry_fee,
              total_balance = total_balance + v_table.entry_fee,
              updated_at = NOW()
          WHERE id = v_wallet.id;
        END IF;

        INSERT INTO public.ledger_entries (
          wallet_id,
          user_id,
          entry_type,
          direction,
          amount,
          balance_after_available,
          balance_after_held,
          reference_table,
          reference_id,
          description,
          idempotency_key,
          created_at
        ) VALUES (
          v_wallet.id,
          v_caller_id,
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_table.entry_fee,
          v_wallet.available_balance + v_table.entry_fee,
          v_wallet.held_balance,
          'game_tables',
          p_table_id,
          'Reembolso por abandono de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
          'abandon_refund_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text,
          NOW()
        );
        v_refund_amount := v_table.entry_fee;
      END IF;
    END IF;
  END IF;

  -- Contar jugadores activos restantes
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

  -- Actualizar el contador de la mesa y estado (con casting status::text seguro contra WAITING)
  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      status = CASE
        WHEN v_active_players_count = 0 AND status::text IN ('OPEN', 'FULL', 'WAITING') THEN 'CLOSED'::table_status_enum
        WHEN status::text = 'FULL' AND v_active_players_count < max_players THEN 'OPEN'::table_status_enum
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abandon_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text
  );

  -- Si la sesión estaba activa y queda un ÚNICO jugador restante -> Declarar ganador por abandono
  IF v_active_players_count = 1 AND v_session.id IS NOT NULL AND v_session.status::text = 'ACTIVE' THEN
    SELECT user_id INTO v_remaining_player
    FROM public.game_table_players
    WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY')
    LIMIT 1;

    IF v_remaining_player.user_id IS NOT NULL THEN
      v_settle_result := public.settle_game_session(
        v_session.id,
        ARRAY[v_remaining_player.user_id],
        1,
        'SETTLE_ABANDON_' || v_effective_idempotency
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'WINNER_DECLARED_BY_ABANDON',
        'winner_user_id', v_remaining_player.user_id,
        'refund_amount', v_refund_amount,
        'settlement', v_settle_result
      );
    END IF;
  END IF;

  -- Si quedan 0 jugadores activos -> Cerrar mesa y cancelar sesión huérfana
  IF v_active_players_count = 0 THEN
    IF v_session.id IS NOT NULL AND v_session.status::text NOT IN ('SETTLED', 'CANCELLED') THEN
      UPDATE public.game_sessions
      SET status = 'CANCELLED'::session_status_enum, ended_at = NOW()
      WHERE id = v_session.id;
    END IF;

    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum, closed_at = NOW(), updated_at = NOW()
    WHERE id = p_table_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'TABLE_CLOSED_NO_PLAYERS',
      'refund_amount', v_refund_amount
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'LEFT_SUCCESSFULLY',
    'refund_amount', v_refund_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, VARCHAR) TO authenticated, anon, service_role;


-- 3. Redefinición Segura de admin_disconnect_player_secure (con castings status::text seguros)
CREATE OR REPLACE FUNCTION public.admin_disconnect_player_secure(
  p_table_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role VARCHAR(50);
  v_table RECORD;
  v_player RECORD;
  v_wallet RECORD;
  v_active_players_count INT;
  v_already_refunded BOOLEAN := FALSE;
  v_refunded BOOLEAN := FALSE;
  v_effective_reason TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador para desconectar jugadores';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa especificada no existe';
  END IF;

  SELECT * INTO v_player 
  FROM public.game_table_players 
  WHERE table_id = p_table_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'El jugador no se encuentra en la mesa');
  END IF;

  v_effective_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Desconexión ejecutada por administración');

  -- Actualizar estado del jugador
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND user_id = p_user_id;

  -- Comprobar si corresponde reembolso
  IF COALESCE(v_table.entry_fee, 0) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE user_id = p_user_id
        AND reference_table = 'game_tables'
        AND reference_id = p_table_id
        AND entry_type = 'TABLE_ENTRY_REFUND'::ledger_entry_type_enum
    ) INTO v_already_refunded;

    IF NOT v_already_refunded THEN
      SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
      IF FOUND THEN
        IF v_wallet.held_balance >= v_table.entry_fee THEN
          UPDATE public.wallets
          SET available_balance = available_balance + v_table.entry_fee,
              held_balance = held_balance - v_table.entry_fee,
              updated_at = NOW()
          WHERE id = v_wallet.id;
        ELSE
          UPDATE public.wallets
          SET available_balance = available_balance + v_table.entry_fee,
              total_balance = total_balance + v_table.entry_fee,
              updated_at = NOW()
          WHERE id = v_wallet.id;
        END IF;

        INSERT INTO public.ledger_entries (
          wallet_id,
          user_id,
          entry_type,
          direction,
          amount,
          balance_after_available,
          balance_after_held,
          reference_table,
          reference_id,
          description,
          idempotency_key,
          created_at
        ) VALUES (
          v_wallet.id,
          p_user_id,
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_table.entry_fee,
          v_wallet.available_balance + v_table.entry_fee,
          v_wallet.held_balance,
          'game_tables',
          p_table_id,
          'Reembolso por desconexión administrativa de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
          'admin_disconnect_' || p_table_id::text || '_' || p_user_id::text || '_' || extract(epoch from now())::text,
          NOW()
        );
        v_refunded := TRUE;
      END IF;
    END IF;
  END IF;

  -- Recalcular jugadores activos
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

  -- Actualizar mesa (con castings status::text seguros contra WAITING)
  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      status = CASE
        WHEN v_active_players_count = 0 AND status::text IN ('OPEN', 'FULL', 'WAITING') THEN 'CLOSED'::table_status_enum
        WHEN status::text = 'FULL' AND v_active_players_count < max_players THEN 'OPEN'::table_status_enum
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  -- Registro en auditoría
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_caller_id,
    v_caller_role,
    'ADMIN_DISCONNECT_PLAYER',
    'GAME_TABLE',
    p_table_id::text,
    'WARNING'::audit_severity_enum,
    jsonb_build_object(
      'admin_user_id', v_caller_id,
      'disconnected_user_id', p_user_id,
      'table_id', p_table_id,
      'reason', v_effective_reason,
      'refunded', v_refunded
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'DISCONNECTED_SUCCESSFULLY',
    'refunded', v_refunded
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_disconnect_player_secure(UUID, UUID, TEXT) TO authenticated, service_role;


-- 4. Redefinición Segura de admin_cleanup_all_invalid_tables (con castings status::text seguros)
CREATE OR REPLACE FUNCTION public.admin_cleanup_all_invalid_tables()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_rec RECORD;
  v_cleaned_count INT := 0;
  v_cleaned_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  FOR v_rec IN 
    SELECT DISTINCT gt.id
    FROM public.game_tables gt
    LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
    WHERE 
      -- Caso 1: Mesa OPEN/FULL/ACTIVE pero sesión FINISHED/SETTLED/CANCELLED (con castings seguros)
      (gt.status::text IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE') AND gs.status::text IN ('FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED'))
      -- Caso 2: Mesa OPEN/FULL expirada
      OR (gt.status::text IN ('OPEN', 'FULL', 'WAITING') AND gt.expires_at <= NOW())
      -- Caso 3: Mesa OPEN antigua abandonada con <= 1 jugador
      OR (gt.status::text = 'OPEN' AND gt.created_at < NOW() - INTERVAL '30 minutes' AND gt.current_players_count <= 1)
  LOOP
    PERFORM public.admin_terminate_game_table(v_rec.id, 'Limpieza automática de mesas inválidas o abandonadas', TRUE);
    v_cleaned_count := v_cleaned_count + 1;
    v_cleaned_ids := array_append(v_cleaned_ids, v_rec.id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'cleaned_count', v_cleaned_count,
    'cleaned_table_ids', v_cleaned_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_cleanup_all_invalid_tables() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
