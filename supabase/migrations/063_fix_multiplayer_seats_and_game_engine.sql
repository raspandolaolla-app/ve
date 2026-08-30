-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 063: MOTOR MULTIJUGADOR UNIFICADO
-- Asientos Servidor-Autoritativos, Control de Anfitrión, Sistema de 3 Vidas,
-- Temporizador Escalonado, Historial Público Realtime e Idempotencia Atómica.
-- ==============================================================================

-- 1. LIMPIEZA DE FILAS DUPLICADAS E ÍNDICES ÚNICOS INMUTABLES DE ASIENTOS
UPDATE public.game_table_players
SET status = 'LEFT'::player_table_status_enum
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY table_id, user_id ORDER BY joined_at DESC) as rnum
    FROM public.game_table_players
    WHERE status IN ('JOINED', 'READY', 'PLAYING')
  ) t WHERE rnum > 1
);

UPDATE public.game_table_players
SET status = 'LEFT'::player_table_status_enum
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY table_id, seat_number ORDER BY joined_at DESC) as rnum
    FROM public.game_table_players
    WHERE status IN ('JOINED', 'READY', 'PLAYING')
  ) t WHERE rnum > 1
);

DROP INDEX IF EXISTS public.idx_uq_active_player_per_table;
CREATE UNIQUE INDEX idx_uq_active_player_per_table
  ON public.game_table_players(table_id, user_id)
  WHERE status != 'LEFT'::player_table_status_enum;

DROP INDEX IF EXISTS public.idx_uq_active_seat_per_table;
CREATE UNIQUE INDEX idx_uq_active_seat_per_table
  ON public.game_table_players(table_id, seat_number)
  WHERE status != 'LEFT'::player_table_status_enum;

-- 2. TABLA DE HISTORIAL PÚBLICO DE PARTIDAS (REALTIME)
CREATE TABLE IF NOT EXISTS public.public_match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type game_type_enum NOT NULL,
  table_id UUID NOT NULL REFERENCES public.game_tables(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  winner_user_id UUID NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  winner_name_snapshot TEXT NOT NULL,
  winner_avatar_snapshot TEXT NULL,
  players_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_score JSONB NOT NULL DEFAULT '{}'::jsonb,
  victories JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary TEXT NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_match_history_finished ON public.public_match_history(finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_match_history_game ON public.public_match_history(game_type);

ALTER TABLE public.public_match_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_public_match_history_select ON public.public_match_history;
CREATE POLICY p_public_match_history_select ON public.public_match_history
  FOR SELECT TO anon, authenticated, service_role USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'public_match_history'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.public_match_history;
    END IF;
  END IF;
END $$;

-- 3. ACTUALIZAR RPC CREATE_GAME_TABLE_SECURE (CON AUTO-ASIENTO DEL ANFITRIÓN EN ASIENTO #1)
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

  -- Prevenir si ya tiene mesa activa en este tipo de juego
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
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya estás participando en una mesa activa de este juego.';
  END IF;

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

  -- Verificar saldo para la retención del anfitrión si p_entry_fee > 0
  IF p_entry_fee > 0 THEN
    SELECT available_balance INTO v_wallet_balance
    FROM public.wallets
    WHERE user_id = v_user_id FOR UPDATE;

    IF v_wallet_balance IS NULL OR v_wallet_balance < p_entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente para crear la mesa (% Bs.)', p_entry_fee;
    END IF;
  END IF;

  -- Generación de Código de Invitación Único
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

  -- 1. Insertar mesa
  INSERT INTO public.game_tables (
    id, host_user_id, game_type, visibility, entry_fee, min_players, max_players,
    current_players_count, status, invite_code, expires_at, config
  ) VALUES (
    v_table_id, v_user_id, v_enum_game_type, p_visibility, p_entry_fee, v_min_players, p_max_players,
    1, 'OPEN'::table_status_enum, v_invite_code, v_expires_at,
    COALESCE(p_config, '{}'::jsonb) || jsonb_build_object('name', v_table_name)
  );

  -- 2. Deducir saldo y crear ledger entry si hay cuota
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

  -- 3. Auto-asentar al Anfitrión en Asiento #1
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

-- 4. ACTUALIZAR RPC JOIN_TABLE_TRANSACTION (IDEMPOTENTE Y ASIENTO AUTOMÁTICO)
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
  v_existing_seat SMALLINT;
  v_assigned_seat SMALLINT := NULL;
  v_seat_iter SMALLINT;
  v_wallet_balance NUMERIC;
  v_ledger_id UUID;
  v_player_id UUID;
  v_new_count INT;
  v_new_table_status table_status_enum;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes autenticarte para unirte a una mesa';
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa especificada no existe';
  END IF;

  IF v_table.status NOT IN ('OPEN', 'READY') THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: La mesa no está abierta para nuevos jugadores';
  END IF;

  -- Verificar si el usuario YA ESTÁ ASENTADO de forma activa en la mesa (IDEMPOTENCIA)
  SELECT seat_number INTO v_existing_seat
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND user_id = v_user_id
    AND status != 'LEFT'::player_table_status_enum;

  IF v_existing_seat IS NOT NULL THEN
    -- Ya está sentado: retornar asiento existente de forma limpia
    RETURN jsonb_build_object(
      'success', true,
      'already_joined', true,
      'table_id', p_table_id,
      'seat_number', v_existing_seat,
      'current_players_count', v_table.current_players_count,
      'table_status', v_table.status
    );
  END IF;

  -- Verificar capacidad máxima
  IF v_table.current_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: La mesa alcanzó su capacidad máxima de jugadores';
  END IF;

  -- Asignación automática o manual de asiento libre
  IF p_seat_number IS NOT NULL AND p_seat_number >= 1 AND p_seat_number <= v_table.max_players THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.game_table_players
      WHERE table_id = p_table_id
        AND seat_number = p_seat_number
        AND status != 'LEFT'::player_table_status_enum
    ) THEN
      v_assigned_seat := p_seat_number;
    END IF;
  END IF;

  -- Si no se indicó asiento o el indicado estaba ocupado, buscar el primer asiento libre 1..max_players
  IF v_assigned_seat IS NULL THEN
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
    RAISE EXCEPTION 'NO_AVAILABLE_SEAT: No hay asientos libres disponibles en esta mesa';
  END IF;

  -- Verificar y retener saldo si la mesa requiere entry_fee
  IF v_table.entry_fee > 0 THEN
    SELECT available_balance INTO v_wallet_balance
    FROM public.wallets
    WHERE user_id = v_user_id FOR UPDATE;

    IF v_wallet_balance IS NULL OR v_wallet_balance < v_table.entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente para unirse a la mesa (% Bs.)', v_table.entry_fee;
    END IF;

    UPDATE public.wallets
    SET available_balance = available_balance - v_table.entry_fee,
        held_balance = held_balance + v_table.entry_fee,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    v_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id, user_id, entry_type, amount, balance_after, reference_id, description, status
    ) VALUES (
      v_ledger_id, v_user_id, 'GAME_ENTRY_HOLD'::ledger_entry_type_enum, -v_table.entry_fee,
      (v_wallet_balance - v_table.entry_fee), p_table_id,
      'Retención de entrada al unirse a mesa #' || substring(p_table_id::text from 1 for 8),
      'COMPLETED'::ledger_status_enum
    );
  END IF;

  -- Registrar al jugador en game_table_players
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id, table_id, user_id, seat_number, status, entry_held_entry_id, joined_at
  ) VALUES (
    v_player_id, p_table_id, v_user_id, v_assigned_seat, 'JOINED'::player_table_status_enum, v_ledger_id, NOW()
  );

  -- Actualizar conteo y estado de la mesa
  v_new_count := v_table.current_players_count + 1;
  v_new_table_status := CASE WHEN v_new_count >= v_table.max_players THEN 'FULL'::table_status_enum ELSE v_table.status END;

  UPDATE public.game_tables
  SET current_players_count = v_new_count,
      status = v_new_table_status,
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_joined', false,
    'table_id', p_table_id,
    'user_id', v_user_id,
    'seat_number', v_assigned_seat,
    'current_players_count', v_new_count,
    'max_players', v_table.max_players,
    'table_status', v_new_table_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_table_transaction(UUID, SMALLINT, VARCHAR) TO authenticated, service_role;

-- 5. RPC START_GAME_SESSION_SECURE (INICIO CONTROLADO POR EL ANFITRIÓN)
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

  IF v_table.current_players_count < v_table.min_players THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS: Se requieren al menos % jugadores para iniciar', v_table.min_players;
  END IF;

  -- Si ya hay una sesión activa, retornarla
  SELECT id INTO v_session_id
  FROM public.game_sessions
  WHERE table_id = p_table_id
    AND status IN ('WAITING', 'READY', 'STARTING', 'ACTIVE');

  IF v_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', v_session_id,
      'already_active', true
    );
  END IF;

  -- Compilar lista de jugadores activos y 3 vidas iniciales
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

  v_deadline := NOW() + INTERVAL '10 seconds';
  v_session_id := gen_random_uuid();

  v_initial_state := jsonb_build_object(
    'status', 'playing',
    'playerOrder', v_player_order,
    'players', v_players,
    'turnUserId', v_first_turn_user_id,
    'lives', v_lives,
    'scores', v_scores,
    'timeoutStage', 1,
    'round', 1,
    'targetWins', 3
  );

  -- Crear sesión en game_sessions
  INSERT INTO public.game_sessions (
    id, table_id, game_type, session_number, status, current_state,
    current_turn_user_id, turn_deadline_at, started_at
  ) VALUES (
    v_session_id, p_table_id, v_table.game_type, 1, 'ACTIVE'::session_status_enum,
    v_initial_state, v_first_turn_user_id, v_deadline, NOW()
  );

  -- Actualizar estado de la mesa a ACTIVE
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      started_at = NOW(),
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

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID) TO authenticated, service_role;

-- 6. RPC DE EXPIRACIÓN Y MANEJO DE HISTORIAL PÚBLICO
CREATE OR REPLACE FUNCTION public.record_public_match_winner(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARATION
  v_session RECORD;
  v_table RECORD;
  v_winner_profile RECORD;
  v_players_snapshot JSONB := '[]'::jsonb;
  v_victories JSONB := '{}'::jsonb;
  v_final_score JSONB := '{}'::jsonb;
  v_summary TEXT;
BEGIN
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false); END IF;

  SELECT * INTO v_table FROM public.game_tables WHERE id = v_session.table_id;

  IF v_session.winner_user_id IS NOT NULL THEN
    SELECT * INTO v_winner_profile FROM public.profiles WHERE user_id = v_session.winner_user_id;
  END IF;

  v_final_score := COALESCE(v_session.current_state->'scores', '{}'::jsonb);
  v_victories := v_final_score;

  v_summary := CASE
    WHEN v_session.winner_user_id IS NOT NULL THEN
      COALESCE(v_winner_profile.display_name, 'Jugador') || ' ganó la partida de ' || v_table.game_type::text
    ELSE
      'Partida finalizada en empate'
  END;

  INSERT INTO public.public_match_history (
    game_type, table_id, session_id, winner_user_id,
    winner_name_snapshot, winner_avatar_snapshot,
    players_snapshot, final_score, victories, result_summary, finished_at
  ) VALUES (
    v_table.game_type, v_session.table_id, v_session.id, v_session.winner_user_id,
    COALESCE(v_winner_profile.display_name, 'Ganador'),
    v_winner_profile.avatar_url,
    COALESCE(v_session.current_state->'players', '[]'::jsonb),
    v_final_score,
    v_victories,
    v_summary,
    NOW()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_public_match_winner(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
