-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 054
-- CORRECCIÓN DEFINITIVA DE MESAS QUE PERMANECEN OPEN POST-FINALIZACIÓN,
-- PREVENCIÓN DE MÚLTIPLES MESAS ACTIVAS POR USUARIO Y LIMPIEZA ATÓMICA
-- ==============================================================================

-- 1. TRIGGER AUTOMÁTICO EN game_sessions PARA CERRAR MESAS EN TRANSICIÓN A FINISHED/SETTLED/CANCELLED
CREATE OR REPLACE FUNCTION public.fn_sync_table_status_on_session_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.status IN ('FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'ABANDONED') THEN
    -- Actualizar mesa a CLOSED
    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        closed_at = COALESCE(closed_at, NOW()),
        updated_at = NOW()
    WHERE id = NEW.table_id
      AND status NOT IN ('CLOSED', 'TERMINATED', 'CANCELLED');

    -- Liberar asientos activos de jugadores
    UPDATE public.game_table_players
    SET status = 'LEFT'::player_table_status_enum,
        left_at = COALESCE(left_at, NOW()),
        updated_at = NOW()
    WHERE table_id = NEW.table_id
      AND status IN ('JOINED', 'READY', 'PLAYING');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_table_status_on_session_change ON public.game_sessions;
CREATE TRIGGER trg_sync_table_status_on_session_change
  AFTER INSERT OR UPDATE OF status ON public.game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_table_status_on_session_change();


-- 2. ACTUALIZACIÓN DE create_game_table_secure CON VERIFICACIÓN DE MESAS ACTIVAS PREVIAS (REGLA 2)
CREATE OR REPLACE FUNCTION public.create_game_table_secure(
  p_game_type TEXT,
  p_name VARCHAR DEFAULT NULL,
  p_visibility table_visibility_enum DEFAULT 'PUBLIC',
  p_entry_fee NUMERIC DEFAULT 0.00,
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa';
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

  -- REGLA 2: Bloquear si el usuario ya participa en una mesa activa del mismo juego
  SELECT COUNT(*) INTO v_active_table_count
  FROM public.game_table_players gtp
  JOIN public.game_tables gt ON gt.id = gtp.table_id
  LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
  WHERE gtp.user_id = v_user_id
    AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
    AND gt.game_type = v_enum_game_type
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE')
    AND (gs.status IS NULL OR gs.status IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED'));

  IF v_active_table_count > 0 THEN
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya te encuentras participando en una mesa activa de este juego. Debes salir o terminar esa mesa antes de crear otra.';
  END IF;

  IF p_entry_fee < 0.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada no puede ser negativo';
  END IF;

  IF NOT public.is_valid_entry_fee(p_entry_fee, v_enum_game_type) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada % Bs. no está autorizado en el sistema', p_entry_fee;
  END IF;

  IF p_max_players < 2 OR p_max_players > 1000 THEN
    RAISE EXCEPTION 'INVALID_PLAYERS_COUNT: Cantidad de jugadores inválida (mínimo 2, máximo 1000)';
  END IF;

  v_min_players := CASE 
    WHEN p_max_players = 4 THEN 2 
    WHEN p_max_players > 4 THEN 2
    ELSE p_max_players 
  END;

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

  v_expires_at := NOW() + INTERVAL '2 hours';
  v_table_id := gen_random_uuid();
  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || v_enum_game_type::text);

  INSERT INTO public.game_tables (
    id,
    game_type,
    host_user_id,
    visibility,
    invite_code,
    entry_fee,
    min_players,
    max_players,
    current_players_count,
    status,
    config,
    expires_at
  ) VALUES (
    v_table_id,
    v_enum_game_type,
    v_user_id,
    p_visibility,
    v_invite_code,
    p_entry_fee,
    v_min_players,
    p_max_players,
    0,
    'OPEN'::table_status_enum,
    p_config,
    v_expires_at
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'invite_code', v_invite_code,
    'name', v_table_name,
    'entry_fee', p_entry_fee,
    'max_players', p_max_players,
    'created_at', NOW()
  );
END;
$$;


-- 3. ACTUALIZACIÓN DE join_table_transaction CON CONTROLES ESTRICTOS (REGLAS 2, 3 Y ESTADO MESA)
CREATE OR REPLACE FUNCTION public.join_table_transaction(
  p_table_id UUID,
  p_seat_number SMALLINT,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_table RECORD;
  v_session RECORD;
  v_wallet RECORD;
  v_existing_active_player RECORD;
  v_other_active_table RECORD;
  v_active_players_count INT;
  v_ledger_id UUID;
  v_player_id UUID;
BEGIN
  -- 1. Autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  -- 2. Perfil
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil de usuario no registrado';
  END IF;

  IF v_profile.account_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Cuenta no habilitada para unirse a mesas (estado: %)', v_profile.account_status;
  END IF;

  -- 3. Bloqueo pesimista de la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa especificada no existe';
  END IF;

  -- REGLA 1: Verificar si la sesión asociada ya finalizó
  SELECT * INTO v_session FROM public.game_sessions WHERE table_id = p_table_id ORDER BY created_at DESC LIMIT 1;
  IF v_session.id IS NOT NULL AND v_session.status IN ('FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED') THEN
    UPDATE public.game_tables SET status = 'CLOSED'::table_status_enum, closed_at = NOW(), updated_at = NOW() WHERE id = p_table_id;
    RAISE EXCEPTION 'TABLE_NOT_OPEN: La partida de esta mesa ya finalizó y no acepta nuevos jugadores.';
  END IF;

  IF v_table.status NOT IN ('OPEN', 'WAITING', 'WAITING_PLAYERS') THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: La mesa no está disponible para unirse (estado: %)', v_table.status;
  END IF;

  IF v_table.expires_at <= NOW() THEN
    UPDATE public.game_tables SET status = 'EXPIRED'::table_status_enum, closed_at = NOW(), updated_at = NOW() WHERE id = p_table_id;
    RAISE EXCEPTION 'TABLE_EXPIRED: La mesa ha expirado';
  END IF;

  -- 4. REGLA 3: ¿Ya participa el usuario en ESTA mesa? (Un usuario = Un solo asiento)
  SELECT * INTO v_existing_active_player
  FROM public.game_table_players
  WHERE table_id = p_table_id 
    AND user_id = v_user_id 
    AND status IN ('JOINED', 'READY', 'PLAYING');

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'already_seated', true,
      'table_player_id', v_existing_active_player.id,
      'player_id', v_existing_active_player.id,
      'table_id', p_table_id,
      'seat_number', v_existing_active_player.seat_number,
      'message', 'El jugador ya ocupa el asiento #' || v_existing_active_player.seat_number || ' en esta mesa.'
    );
  END IF;

  -- 5. REGLA 2: ¿Ya participa en OTRA mesa activa del MISMO juego?
  SELECT gt.id INTO v_other_active_table
  FROM public.game_table_players gtp
  JOIN public.game_tables gt ON gt.id = gtp.table_id
  LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
  WHERE gtp.user_id = v_user_id
    AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
    AND gt.id != p_table_id
    AND gt.game_type = v_table.game_type
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE')
    AND (gs.status IS NULL OR gs.status IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED'))
  LIMIT 1;

  IF v_other_active_table.id IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya te encuentras participando en otra mesa activa de este juego. Debes salir o terminar esa mesa primero.';
  END IF;

  -- 6. Capacidad y Asiento
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING');

  IF v_active_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: La mesa ha alcanzado su capacidad máxima (%/%)', v_active_players_count, v_table.max_players;
  END IF;

  IF p_seat_number < 1 OR p_seat_number > v_table.max_players THEN
    RAISE EXCEPTION 'INVALID_SEAT: Número de asiento fuera de rango permitido (1..%)', v_table.max_players;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.game_table_players 
    WHERE table_id = p_table_id 
      AND seat_number = p_seat_number 
      AND status IN ('JOINED', 'READY', 'PLAYING')
  ) THEN
    RAISE EXCEPTION 'SEAT_TAKEN: El asiento % ya está ocupado', p_seat_number;
  END IF;

  -- 7. Retención y Ledger si la mesa requiere costo de entrada
  IF v_table.entry_fee > 0.00 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera de usuario no encontrada';
    END IF;

    IF v_wallet.available_balance < v_table.entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente (requerido: %, disponible: %)', 
        v_table.entry_fee, v_wallet.available_balance;
    END IF;

    UPDATE public.wallets
    SET available_balance = available_balance - v_table.entry_fee,
        held_balance = held_balance + v_table.entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    v_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id, wallet_id, user_id, entry_type, direction, amount,
      balance_after_available, balance_after_held, reference_table,
      reference_id, idempotency_key, description, actor_id
    ) VALUES (
      v_ledger_id, v_wallet.id, v_user_id, 'TABLE_ENTRY_HOLD', 'HOLD', v_table.entry_fee,
      v_wallet.available_balance - v_table.entry_fee, v_wallet.held_balance + v_table.entry_fee,
      'game_tables', p_table_id, p_idempotency_key,
      'Retención de entrada a mesa ' || p_table_id::text || ' asiento ' || p_seat_number::text, v_user_id
    );
  END IF;

  -- 8. Insertar nuevo asiento de jugador
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id, table_id, user_id, seat_number, status, entry_held_entry_id
  ) VALUES (
    v_player_id, p_table_id, v_user_id, p_seat_number, 'JOINED'::player_table_status_enum, v_ledger_id
  );

  -- 9. Reconciliación del contador y estado
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING');

  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      status = CASE
        WHEN v_active_players_count >= max_players THEN 'FULL'::table_status_enum
        ELSE 'OPEN'::table_status_enum
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'table_player_id', v_player_id,
    'player_id', v_player_id,
    'table_id', p_table_id,
    'seat_number', p_seat_number,
    'active_players_count', v_active_players_count
  );
END;
$$;


-- 4. RPC DE LIMPIEZA ATÓMICA DE TODAS LAS MESAS INVÁLIDAS
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
      -- Caso 1: Mesa OPEN/FULL/ACTIVE pero sesión FINISHED/SETTLED/CANCELLED
      (gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE') AND gs.status IN ('FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED'))
      -- Caso 2: Mesa OPEN/FULL expirada
      OR (gt.status IN ('OPEN', 'FULL', 'WAITING') AND gt.expires_at <= NOW())
      -- Caso 3: Mesa OPEN antigua abandonada con <= 1 jugador
      OR (gt.status = 'OPEN' AND gt.created_at < NOW() - INTERVAL '30 minutes' AND gt.current_players_count <= 1)
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


-- 5. LIMPIEZA Y SANEAMIENTO DIRECTO EN BASE DE DATOS PARA MESAS PROBLEMÁTICAS EXISTENTES
-- Cierre de todas las mesas cuya sesión ya esté FINISHED / SETTLED / CANCELLED
UPDATE public.game_tables
SET status = 'CLOSED'::table_status_enum,
    closed_at = COALESCE(closed_at, NOW()),
    updated_at = NOW()
WHERE id IN (
  SELECT table_id FROM public.game_sessions WHERE status IN ('FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED')
) AND status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE');

-- Saneamiento específico de las mesas reportadas en la evidencia
UPDATE public.game_tables
SET status = 'CLOSED'::table_status_enum,
    closed_at = COALESCE(closed_at, NOW()),
    updated_at = NOW()
WHERE id IN (
  'ab13967f-bf6f-4fea-ab24-a8edef62bb07'::UUID,
  '6ffcbdfa-87b4-4be0-bb96-20df77c66582'::UUID,
  '6ffcbdfa-87b4-4be0-82bd-ce237913cfc7'::UUID
);

UPDATE public.game_table_players
SET status = 'LEFT'::player_table_status_enum,
    left_at = COALESCE(left_at, NOW()),
    updated_at = NOW()
WHERE table_id IN (
  'ab13967f-bf6f-4fea-ab24-a8edef62bb07'::UUID,
  '6ffcbdfa-87b4-4be0-bb96-20df77c66582'::UUID,
  '6ffcbdfa-87b4-4be0-82bd-ce237913cfc7'::UUID
) AND status IN ('JOINED', 'READY', 'PLAYING');

-- Recarga del esquema PostgREST
NOTIFY pgrst, 'reload schema';
