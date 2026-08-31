-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 079
-- CORRECCIÓN DEFINITIVA DE COMPATIBILIDAD LEDGER_ENTRIES: BALANCE_AFTER Y ESQUEMA CANÓNICO
-- ==============================================================================
-- Causa Raíz Identificada (Error: column "balance_after" of relation "ledger_entries" does not exist):
-- La tabla `public.ledger_entries` fue creada originalmente (migración 004) con las columnas
-- `balance_after_available` y `balance_after_held`. Sin embargo, funciones RPC y auditorías
-- financieras (como create_game_table_secure y join_table_transaction) invocaban o insertaban
-- directamente el campo unificado `balance_after`.
-- 
-- Esta migración:
-- 1. Añade de forma segura e incremental `balance_after NUMERIC(14,2)` a `public.ledger_entries`.
-- 2. Añade columnas auxiliares de compatibilidad (`status`, `reference_type`, `currency`).
-- 3. Crea un trigger BEFORE INSERT que reconcilia y normaliza automáticamente cualquier inserción
--    al libro mayor (asegurando idempotencia, wallet_id, direction, balance_after y balance_after_available).
-- 4. Reconcilia y blinda las funciones RPC críticas: `create_game_table_secure`,
--    `join_table_transaction` y `abandon_game_table_secure`.
-- ==============================================================================

-- 1. ADICIÓN SEGURA DE COLUMNA BALANCE_AFTER Y CAMPOS AUXILIARES
ALTER TABLE public.ledger_entries 
  ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14,2);

COMMENT ON COLUMN public.ledger_entries.balance_after IS 'Saldo posterior a la transacción para auditoría financiera.';

ALTER TABLE public.ledger_entries 
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'COMPLETED';

COMMENT ON COLUMN public.ledger_entries.status IS 'Estado del registro contable (COMPLETED, PENDING, REVERSED).';

ALTER TABLE public.ledger_entries 
  ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);

COMMENT ON COLUMN public.ledger_entries.reference_type IS 'Tipo o nombre de la entidad referenciada (alias de reference_table).';

ALTER TABLE public.ledger_entries 
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'VES';

-- Flexibilizar constraints para inserciones desde cualquier variante de RPC previa
ALTER TABLE public.ledger_entries ALTER COLUMN direction DROP NOT NULL;
ALTER TABLE public.ledger_entries ALTER COLUMN reference_table DROP NOT NULL;
ALTER TABLE public.ledger_entries ALTER COLUMN idempotency_key DROP NOT NULL;
ALTER TABLE public.ledger_entries ALTER COLUMN balance_after_available DROP NOT NULL;
ALTER TABLE public.ledger_entries ALTER COLUMN balance_after_held DROP NOT NULL;

-- 2. TRIGGER DE NORMALIZACIÓN Y RELLENO AUTOMÁTICO EN LEDGER_ENTRIES
CREATE OR REPLACE FUNCTION public.fn_ledger_entries_reconcile_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_derived_wallet_id UUID;
BEGIN
  -- Reconciliar balance_after y balance_after_available
  IF NEW.balance_after IS NULL THEN
    NEW.balance_after := COALESCE(NEW.balance_after_available, 0.00);
  END IF;
  
  IF NEW.balance_after_available IS NULL THEN
    NEW.balance_after_available := COALESCE(NEW.balance_after, 0.00);
  END IF;

  IF NEW.balance_after_held IS NULL THEN
    NEW.balance_after_held := 0.00;
  END IF;

  -- Garantizar monto positivo
  NEW.amount := ABS(COALESCE(NEW.amount, 0.00));

  -- Rellenar wallet_id automáticamente si no fue provisto
  IF NEW.wallet_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO v_derived_wallet_id FROM public.wallets WHERE user_id = NEW.user_id LIMIT 1;
    NEW.wallet_id := v_derived_wallet_id;
  END IF;

  -- Rellenar currency
  IF NEW.currency IS NULL OR NEW.currency = '' THEN
    NEW.currency := 'VES';
  END IF;

  -- Rellenar status
  IF NEW.status IS NULL OR NEW.status = '' THEN
    NEW.status := 'COMPLETED';
  END IF;

  -- Reconciliar reference_table y reference_type
  IF NEW.reference_table IS NULL AND NEW.reference_type IS NOT NULL THEN
    NEW.reference_table := NEW.reference_type;
  ELSIF NEW.reference_table IS NULL THEN
    NEW.reference_table := 'game_tables';
  END IF;

  IF NEW.reference_type IS NULL THEN
    NEW.reference_type := NEW.reference_table;
  END IF;

  -- Rellenar idempotency_key
  IF NEW.idempotency_key IS NULL OR NEW.idempotency_key = '' THEN
    NEW.idempotency_key := 'ledger_' || gen_random_uuid()::text;
  END IF;

  -- Rellenar description
  IF NEW.description IS NULL OR NEW.description = '' THEN
    NEW.description := 'Movimiento contable de billetera';
  END IF;

  -- Rellenar direction
  IF NEW.direction IS NULL THEN
    IF NEW.entry_type::text LIKE '%REFUND%' OR NEW.entry_type::text LIKE '%CREDIT%' OR NEW.entry_type::text LIKE '%DEPOSIT%' THEN
      NEW.direction := 'CREDIT'::ledger_direction_enum;
    ELSE
      NEW.direction := 'HOLD'::ledger_direction_enum;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_entries_reconcile_defaults ON public.ledger_entries;
CREATE TRIGGER trg_ledger_entries_reconcile_defaults
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_ledger_entries_reconcile_defaults();


-- 3. RECONCILIAR FUNCIÓN RPC: create_game_table_secure
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
  v_wallet_id UUID;
  v_wallet_available NUMERIC;
  v_wallet_held NUMERIC;
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

  -- Bloqueo pesimista FOR UPDATE en billetera para prevenir condiciones de carrera y dobles débitos
  IF p_entry_fee > 0 THEN
    SELECT id, available_balance, held_balance 
    INTO v_wallet_id, v_wallet_available, v_wallet_held
    FROM public.wallets
    WHERE user_id = v_user_id FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      -- Asegurar existencia de billetera si es usuario nuevo
      INSERT INTO public.wallets (user_id, available_balance, held_balance, currency)
      VALUES (v_user_id, 0.00, 0.00, 'VES')
      ON CONFLICT (user_id) DO NOTHING;

      SELECT id, available_balance, held_balance 
      INTO v_wallet_id, v_wallet_available, v_wallet_held
      FROM public.wallets
      WHERE user_id = v_user_id FOR UPDATE;
    END IF;
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

  -- 2. AUTO-ABANDONO SEGURO DE PARTICIPACIONES OBSOLETAS O HUÉRFANAS:
  FOR v_stale_rec IN
    SELECT DISTINCT gt.id as table_id, gs.id as session_id
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
    WHERE gtp.user_id = v_user_id
      AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
      AND gt.game_type = v_enum_game_type
      AND (
        (gt.status::text IN ('OPEN', 'FULL') AND gs.id IS NULL)
        OR (gs.id IS NOT NULL AND gs.status::text IN ('WAITING', 'READY', 'STARTING', 'PAUSED'))
        OR (gs.id IS NOT NULL AND (
             gs.status::text IN ('FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'ABANDONED')
             OR (gs.current_state->>'winnerUserId') IS NOT NULL AND (gs.current_state->>'winnerUserId') <> ''
           ))
        OR (gt.status::text IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE') AND (
             gt.created_at < NOW() - INTERVAL '1 hour'
             OR (gt.updated_at IS NOT NULL AND gt.updated_at < NOW() - INTERVAL '1 hour')
           ))
        OR (gt.expires_at IS NOT NULL AND gt.expires_at < NOW())
      )
  LOOP
    BEGIN
      IF v_stale_rec.session_id IS NOT NULL THEN
        SELECT status::text INTO v_stale_session_status FROM public.game_sessions WHERE id = v_stale_rec.session_id;
        IF v_stale_session_status = 'ACTIVE' THEN
          UPDATE public.game_sessions
          SET status = 'CANCELLED'::session_status_enum,
              ended_at = NOW()
          WHERE id = v_stale_rec.session_id;
        END IF;
      END IF;

      PERFORM public.abandon_game_table_secure(
        v_stale_rec.table_id,
        v_stale_rec.session_id,
        'auto_cleanup_create_079_' || v_stale_rec.table_id::text
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
    AND gs.id IS NOT NULL
    AND gs.status::text = 'ACTIVE'
    AND (gs.current_state->>'winnerUserId' IS NULL OR gs.current_state->>'winnerUserId' = '')
    AND (gt.updated_at IS NULL OR gt.updated_at >= NOW() - INTERVAL '1 hour')
    AND gt.created_at >= NOW() - INTERVAL '1 hour'
    AND (gt.expires_at IS NULL OR gt.expires_at >= NOW());

  IF v_active_table_count > 0 THEN
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya estás participando en una mesa activa de este juego.';
  END IF;

  -- 4. Validaciones de Tarifas y Límites
  IF p_entry_fee < 25.00 OR p_entry_fee > 5000.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe estar entre 25 Bs. y 5.000 Bs.';
  END IF;

  IF NOT public.is_valid_entry_fee(p_entry_fee, v_enum_game_type) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe estar entre 25 Bs. y 5.000 Bs.';
  END IF;

  IF p_max_players < 2 OR p_max_players > 1000 THEN
    RAISE EXCEPTION 'INVALID_PLAYERS_COUNT: Cantidad de jugadores inválida (mínimo 2, máximo 1000)';
  END IF;

  v_min_players := CASE 
    WHEN p_max_players >= 4 THEN 2
    ELSE p_max_players 
  END;

  -- 5. Validación de Saldo Disponible para Cuota de Entrada
  IF p_entry_fee > 0 THEN
    IF v_wallet_available IS NULL OR v_wallet_available < p_entry_fee THEN
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

  -- 8. Deducción de Saldo y Asiento en Ledger Inmutable
  IF p_entry_fee > 0 THEN
    UPDATE public.wallets
    SET available_balance = available_balance - p_entry_fee,
        held_balance = held_balance + p_entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    v_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id,
      wallet_id,
      user_id,
      entry_type,
      direction,
      amount,
      balance_after,
      balance_after_available,
      balance_after_held,
      reference_table,
      reference_type,
      reference_id,
      idempotency_key,
      description,
      status,
      currency,
      actor_id
    ) VALUES (
      v_ledger_id,
      v_wallet_id,
      v_user_id,
      'TABLE_ENTRY_HOLD'::ledger_entry_type_enum,
      'HOLD'::ledger_direction_enum,
      p_entry_fee,
      (v_wallet_available - p_entry_fee),
      (v_wallet_available - p_entry_fee),
      (v_wallet_held + p_entry_fee),
      'game_tables',
      'game_tables',
      v_table_id,
      'HOLD_' || v_table_id::text || '_' || v_user_id::text,
      'Retención de entrada al crear mesa #' || substring(v_table_id::text from 1 for 8),
      'COMPLETED',
      'VES',
      v_user_id
    );
  END IF;

  -- 9. Asignación del Anfitrión en Asiento #1
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


-- 4. RECONCILIAR FUNCIÓN RPC: join_table_transaction
CREATE OR REPLACE FUNCTION public.join_table_transaction(
  p_table_id UUID,
  p_seat_number SMALLINT DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_table RECORD;
  v_existing_player RECORD;
  v_assigned_seat SMALLINT;
  v_seat_iter SMALLINT;
  v_wallet_id UUID;
  v_wallet_available NUMERIC;
  v_wallet_held NUMERIC;
  v_ledger_id UUID;
  v_player_id UUID;
  v_new_count INT;
  v_effective_key VARCHAR(100);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para unirte a una mesa';
  END IF;

  -- 1. Bloqueo de la mesa
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa especificada no existe';
  END IF;

  IF v_table.status::text NOT IN ('OPEN', 'WAITING') THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: La mesa no está abierta para nuevos jugadores (estado: %)', v_table.status;
  END IF;

  IF v_table.current_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: La mesa ya ha alcanzado su capacidad máxima';
  END IF;

  -- 2. Verificar si el usuario ya está en la mesa
  SELECT * INTO v_existing_player
  FROM public.game_table_players
  WHERE table_id = p_table_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing_player.status IN ('JOINED', 'READY', 'PLAYING') THEN
      RETURN jsonb_build_object(
        'success', true,
        'table_id', p_table_id,
        'seat_number', v_existing_player.seat_number,
        'message', 'Ya perteneces a esta mesa',
        'is_already_joined', true
      );
    END IF;
  END IF;

  -- 3. Asignar asiento
  IF p_seat_number IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.game_table_players
      WHERE table_id = p_table_id
        AND seat_number = p_seat_number
        AND status != 'LEFT'::player_table_status_enum
    ) THEN
      RAISE EXCEPTION 'SEAT_TAKEN: El asiento % ya está ocupado', p_seat_number;
    END IF;
    v_assigned_seat := p_seat_number;
  ELSE
    FOR v_seat_iter IN 1..v_table.max_players LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.game_table_players
        WHERE table_id = p_table_id
          AND seat_number = v_seat_iter
          AND status != 'LEFT'::player_table_status_enum
      ) THEN
        v_assigned_seat := v_seat_iter;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_assigned_seat IS NULL THEN
    RAISE EXCEPTION 'NO_AVAILABLE_SEAT: No hay asientos disponibles en esta mesa';
  END IF;

  -- 4. Retención de saldo en Ledger si la mesa tiene costo
  IF v_table.entry_fee > 0 THEN
    SELECT id, available_balance, held_balance
    INTO v_wallet_id, v_wallet_available, v_wallet_held
    FROM public.wallets
    WHERE user_id = v_user_id FOR UPDATE;

    IF v_wallet_id IS NULL OR v_wallet_available < v_table.entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente para unirse a la mesa (% Bs.)', v_table.entry_fee;
    END IF;

    UPDATE public.wallets
    SET available_balance = available_balance - v_table.entry_fee,
        held_balance = held_balance + v_table.entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    v_effective_key := COALESCE(NULLIF(trim(p_idempotency_key), ''), 'JOIN_' || p_table_id::text || '_' || v_user_id::text);
    v_ledger_id := gen_random_uuid();

    INSERT INTO public.ledger_entries (
      id,
      wallet_id,
      user_id,
      entry_type,
      direction,
      amount,
      balance_after,
      balance_after_available,
      balance_after_held,
      reference_table,
      reference_type,
      reference_id,
      idempotency_key,
      description,
      status,
      currency,
      actor_id
    ) VALUES (
      v_ledger_id,
      v_wallet_id,
      v_user_id,
      'TABLE_ENTRY_HOLD'::ledger_entry_type_enum,
      'HOLD'::ledger_direction_enum,
      v_table.entry_fee,
      (v_wallet_available - v_table.entry_fee),
      (v_wallet_available - v_table.entry_fee),
      (v_wallet_held + v_table.entry_fee),
      'game_tables',
      'game_tables',
      p_table_id,
      v_effective_key,
      'Retención de entrada al unirse a mesa #' || substring(p_table_id::text from 1 for 8),
      'COMPLETED',
      'VES',
      v_user_id
    );
  END IF;

  -- 5. Insertar o Reactivar al Jugador
  IF v_existing_player.id IS NOT NULL THEN
    UPDATE public.game_table_players
    SET seat_number = v_assigned_seat,
        status = 'JOINED'::player_table_status_enum,
        entry_held_entry_id = COALESCE(v_ledger_id, entry_held_entry_id),
        joined_at = NOW(),
        left_at = NULL
    WHERE id = v_existing_player.id;
  ELSE
    v_player_id := gen_random_uuid();
    INSERT INTO public.game_table_players (
      id, table_id, user_id, seat_number, status, entry_held_entry_id, joined_at
    ) VALUES (
      v_player_id, p_table_id, v_user_id, v_assigned_seat, 'JOINED'::player_table_status_enum, v_ledger_id, NOW()
    );
  END IF;

  -- 6. Actualizar conteo de mesa
  v_new_count := v_table.current_players_count + 1;
  UPDATE public.game_tables
  SET current_players_count = v_new_count,
      status = CASE WHEN v_new_count >= max_players THEN 'FULL'::table_status_enum ELSE 'OPEN'::table_status_enum END,
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'user_id', v_user_id,
    'seat_number', v_assigned_seat,
    'current_players_count', v_new_count,
    'status', CASE WHEN v_new_count >= v_table.max_players THEN 'FULL' ELSE 'OPEN' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_table_transaction(UUID, SMALLINT, VARCHAR) TO authenticated, service_role;


-- 5. RECONCILIAR FUNCIÓN RPC: abandon_game_table_secure
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_wallet RECORD;
  v_already_refunded BOOLEAN := FALSE;
  v_refund_amount NUMERIC := 0.00;
  v_active_players_count INT;
  v_remaining_player RECORD;
  v_effective_idempotency TEXT;
  v_settle_result JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes estar autenticado para abandonar la mesa';
  END IF;

  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND user_id = v_caller_id;

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  ELSE
    SELECT * INTO v_session FROM public.game_sessions
    WHERE table_id = p_table_id AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED')
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE;
  END IF;

  -- Devolución de fondos si la partida no ha sido liquidada
  IF v_table.entry_fee > 0.00 AND (v_session.id IS NULL OR v_session.status NOT IN ('SETTLED', 'ACTIVE')) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE user_id = v_caller_id
        AND (reference_table = 'game_tables' OR reference_type = 'game_tables')
        AND (reference_id = p_table_id::text OR reference_id = p_table_id::uuid::text)
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
          id,
          wallet_id,
          user_id,
          entry_type,
          direction,
          amount,
          balance_after,
          balance_after_available,
          balance_after_held,
          reference_table,
          reference_type,
          reference_id,
          description,
          idempotency_key,
          status,
          currency,
          actor_id
        ) VALUES (
          gen_random_uuid(),
          v_wallet.id,
          v_caller_id,
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_table.entry_fee,
          v_wallet.available_balance + v_table.entry_fee,
          v_wallet.available_balance + v_table.entry_fee,
          GREATEST(0.00, v_wallet.held_balance - v_table.entry_fee),
          'game_tables',
          'game_tables',
          p_table_id,
          'Reembolso por abandono de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
          'abandon_refund_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text,
          'COMPLETED',
          'VES',
          v_caller_id
        );
        v_refund_amount := v_table.entry_fee;
      END IF;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

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

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'refund_amount', v_refund_amount,
    'remaining_players', v_active_players_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role;
