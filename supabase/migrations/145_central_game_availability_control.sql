-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 145: CONTROL CENTRAL DE DISPONIBILIDAD DE JUEGOS
-- ==============================================================================
-- 1. Tabla canónica public.game_configurations
-- 2. Sincronización automática is_active = enabled
-- 3. Población inicial de los 10 juegos soportados
-- 4. Función de comprobación rápida public.is_game_enabled(TEXT)
-- 5. RPC Administrativa public.admin_set_game_enabled(TEXT, BOOLEAN, TEXT)
-- 6. Configuración Realtime (REPLICA IDENTITY FULL y publicación supabase_realtime)
-- 7. Políticas de Seguridad RLS
-- 8. Protección en RPCs operativas (create_game_table_secure, join_table_transaction, start_game_session_secure)
-- ==============================================================================

-- 1. TABLA CANÓNICA DE CONFIGURACIÓN Y ESTADO OPERATIVO DE JUEGOS
CREATE TABLE IF NOT EXISTS public.game_configurations (
  game_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_description TEXT,
  icon_name TEXT DEFAULT 'Gamepad2',
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  disabled_reason TEXT DEFAULT NULL,
  disabled_at TIMESTAMPTZ DEFAULT NULL,
  disabled_by UUID DEFAULT NULL,
  maintenance_message TEXT DEFAULT NULL,
  min_players SMALLINT NOT NULL DEFAULT 2,
  max_players SMALLINT NOT NULL DEFAULT 2,
  allowed_modes TEXT[] DEFAULT ARRAY['1v1']::TEXT[],
  min_entry_fee NUMERIC(10,2) NOT NULL DEFAULT 25.00,
  max_entry_fee NUMERIC(10,2) NOT NULL DEFAULT 5000.00,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asegurar columnas por si la tabla fue creada previamente con columnas faltantes
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS disabled_reason TEXT DEFAULT NULL;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS disabled_by UUID DEFAULT NULL;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS maintenance_message TEXT DEFAULT NULL;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS min_players SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS max_players SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS allowed_modes TEXT[] DEFAULT ARRAY['1v1']::TEXT[];
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS min_entry_fee NUMERIC(10,2) NOT NULL DEFAULT 25.00;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS max_entry_fee NUMERIC(10,2) NOT NULL DEFAULT 5000.00;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
ALTER TABLE public.game_configurations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. TRIGGER PARA MANTENER SINCRONIZADOS enabled Y is_active
CREATE OR REPLACE FUNCTION public.sync_game_configuration_enabled_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    NEW.is_active := NEW.enabled;
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.enabled := NEW.is_active;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_game_configuration_enabled_status ON public.game_configurations;
CREATE TRIGGER trg_sync_game_configuration_enabled_status
BEFORE UPDATE ON public.game_configurations
FOR EACH ROW
EXECUTE FUNCTION public.sync_game_configuration_enabled_status();

-- 3. POBLACIÓN O ACTUALIZACIÓN DE LOS 10 JUEGOS SOPORTADOS
INSERT INTO public.game_configurations (
  game_id, name, short_description, icon_name, enabled, is_active, min_players, max_players, allowed_modes, min_entry_fee, max_entry_fee, display_order
) VALUES
  ('domino_venezolano', 'Dominó Venezolano', 'El clásico dominó por parejas o individual a 100 puntos.', 'Gamepad2', true, true, 2, 4, ARRAY['1v1', '2v2']::TEXT[], 25.00, 5000.00, 1),
  ('truco_venezolano', 'Truco Venezolano', 'El juego de cartas criollo por excelencia. Envido, Truco y Flor.', 'Trophy', true, true, 2, 4, ARRAY['1v1', '2v2']::TEXT[], 25.00, 5000.00, 2),
  ('bingo', 'Bingo Online', 'Salas de 75 y 90 balotas en vivo con pozos acumulados y premios de línea.', 'Flame', true, true, 2, 100, ARRAY['multijugador']::TEXT[], 10.00, 2000.00, 3),
  ('polla_venezolana', 'Polla Venezolana', 'Quinielas hípicas, deportivas y pronósticos en vivo con potes garantizados.', 'Trophy', true, true, 2, 200, ARRAY['comunitario']::TEXT[], 25.00, 5000.00, 4),
  ('atrapaito', 'Atrapaíto Criollo', 'Tablero dinámico de estrategia criolla en cuadrícula.', 'Zap', true, true, 2, 2, ARRAY['1v1']::TEXT[], 25.00, 2500.00, 5),
  ('una_olla', 'UNA-OLLA', 'Duelo rápido de cartas y descarte venezolano con acción constante.', 'Flame', true, true, 2, 6, ARRAY['1v1', 'mesa']::TEXT[], 25.00, 3000.00, 6),
  ('checkers', 'Damas Criollas', 'Damas clásicas con captura obligatoria y coronación de damas.', 'Users', true, true, 2, 2, ARRAY['1v1']::TEXT[], 25.00, 2500.00, 7),
  ('chess', 'Ajedrez Clásico', 'Duelo mental 1v1 con reloj FIDE oficial y arbitraje automático.', 'Sparkles', true, true, 2, 2, ARRAY['1v1']::TEXT[], 25.00, 5000.00, 8),
  ('tic_tac_toe', 'La Vieja / Tres en Raya', 'Partidas instantáneas a 3 rondas con resolución rápida.', 'Zap', true, true, 2, 2, ARRAY['1v1']::TEXT[], 10.00, 1000.00, 9),
  ('rock_paper_scissors', 'Piedra, Papel o Tijera (PulsoPLAY)', 'Duelo ultrarrápido al mejor de 3 rondas criptográficamente selladas.', 'Zap', true, true, 2, 2, ARRAY['1v1']::TEXT[], 10.00, 1000.00, 10)
ON CONFLICT (game_id) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  min_players = EXCLUDED.min_players,
  max_players = EXCLUDED.max_players,
  allowed_modes = EXCLUDED.allowed_modes,
  min_entry_fee = EXCLUDED.min_entry_fee,
  max_entry_fee = EXCLUDED.max_entry_fee,
  display_order = EXCLUDED.display_order;

-- 4. FUNCIÓN HELPER DE DISPONIBILIDAD CANÓNICA: is_game_enabled
CREATE OR REPLACE FUNCTION public.is_game_enabled(p_game_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_norm TEXT;
  v_enabled BOOLEAN;
BEGIN
  IF p_game_type IS NULL OR trim(p_game_type) = '' THEN
    RETURN false;
  END IF;

  v_norm := lower(trim(p_game_type));
  
  -- Normalizar aliases a canonical game_id
  CASE v_norm
    WHEN 'domino', 'domino_venezolano' THEN v_norm := 'domino_venezolano';
    WHEN 'truco', 'truco_venezolano' THEN v_norm := 'truco_venezolano';
    WHEN 'bingo', 'bingo_75', 'bingo_80', 'bingo_90', 'bingo_game' THEN v_norm := 'bingo';
    WHEN 'polla', 'polla_venezolana', 'polla_encuestadora' THEN v_norm := 'polla_venezolana';
    WHEN 'atrapaito', 'atrapaito_criollo' THEN v_norm := 'atrapaito';
    WHEN 'una_olla', 'unaolla' THEN v_norm := 'una_olla';
    WHEN 'damas', 'checkers', 'damas_venezolanas' THEN v_norm := 'checkers';
    WHEN 'chess', 'ajedrez' THEN v_norm := 'chess';
    WHEN 'tic_tac_toe', 'tictactoe', 'tres_en_raya', 'la_vieja' THEN v_norm := 'tic_tac_toe';
    WHEN 'rock_paper_scissors', 'rps', 'piedra_papel_tijera' THEN v_norm := 'rock_paper_scissors';
    ELSE NULL;
  END CASE;

  SELECT enabled INTO v_enabled
  FROM public.game_configurations
  WHERE game_id = v_norm;

  IF FOUND THEN
    RETURN COALESCE(v_enabled, true);
  END IF;

  -- Si el juego no está en la tabla, permitir por defecto
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_game_enabled(TEXT) TO anon, authenticated, service_role;

-- 5. RPC ADMINISTRATIVA CANÓNICA: admin_set_game_enabled
CREATE OR REPLACE FUNCTION public.admin_set_game_enabled(
  p_game_id TEXT,
  p_enabled BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_authorized BOOLEAN := false;
  v_norm_game_id TEXT;
  v_current_rec RECORD;
  v_new_rec RECORD;
  v_trimmed_reason TEXT := NULLIF(trim(p_reason), '');
BEGIN
  -- 1. Validar autenticación
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO: Debes iniciar sesión para realizar esta acción.';
  END IF;

  -- 2. Validar autorización administrativa
  IF public.is_admin(v_user_id) OR public.is_super_admin(v_user_id) THEN
    v_is_authorized := true;
  END IF;

  -- Fallback para administradores fundadores
  IF NOT v_is_authorized AND v_user_id::text IN (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'd822b3ec-a481-424b-a912-4ebca2d2f788',
    'b383a364-8449-4791-9d21-3090dac9d86e'
  ) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: Se requieren privilegios de administrador para modificar la disponibilidad de juegos.';
  END IF;

  -- 3. Normalizar game_id
  v_norm_game_id := lower(trim(p_game_id));
  CASE v_norm_game_id
    WHEN 'domino', 'domino_venezolano' THEN v_norm_game_id := 'domino_venezolano';
    WHEN 'truco', 'truco_venezolano' THEN v_norm_game_id := 'truco_venezolano';
    WHEN 'bingo', 'bingo_75', 'bingo_80', 'bingo_90', 'bingo_game' THEN v_norm_game_id := 'bingo';
    WHEN 'polla', 'polla_venezolana', 'polla_encuestadora' THEN v_norm_game_id := 'polla_venezolana';
    WHEN 'atrapaito', 'atrapaito_criollo' THEN v_norm_game_id := 'atrapaito';
    WHEN 'una_olla', 'unaolla' THEN v_norm_game_id := 'una_olla';
    WHEN 'damas', 'checkers', 'damas_venezolanas' THEN v_norm_game_id := 'checkers';
    WHEN 'chess', 'ajedrez' THEN v_norm_game_id := 'chess';
    WHEN 'tic_tac_toe', 'tictactoe', 'tres_en_raya', 'la_vieja' THEN v_norm_game_id := 'tic_tac_toe';
    WHEN 'rock_paper_scissors', 'rps', 'piedra_papel_tijera' THEN v_norm_game_id := 'rock_paper_scissors';
    ELSE NULL;
  END CASE;

  -- 4. Verificar existencia en game_configurations
  SELECT * INTO v_current_rec
  FROM public.game_configurations
  WHERE game_id = v_norm_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GAME_NOT_FOUND: El juego "%" no está registrado en la plataforma.', p_game_id;
  END IF;

  -- 5. Si se va a deshabilitar, el motivo es estrictamente obligatorio
  IF p_enabled = false THEN
    IF v_trimmed_reason IS NULL OR LENGTH(v_trimmed_reason) < 3 THEN
      RAISE EXCEPTION 'MOTIVO_REQUERIDO: Debes indicar el motivo por el cual se deshabilita este juego.';
    END IF;
  END IF;

  -- 6. Actualizar registro en game_configurations
  UPDATE public.game_configurations
  SET
    enabled = p_enabled,
    is_active = p_enabled,
    disabled_reason = CASE WHEN p_enabled THEN NULL ELSE v_trimmed_reason END,
    disabled_at = CASE WHEN p_enabled THEN NULL ELSE NOW() END,
    disabled_by = CASE WHEN p_enabled THEN NULL ELSE v_user_id END,
    updated_at = NOW()
  WHERE game_id = v_norm_game_id
  RETURNING * INTO v_new_rec;

  -- 7. Registrar en audit_logs de forma blindada
  BEGIN
    INSERT INTO public.audit_logs (
      actor_id,
      actor_role,
      action,
      resource_type,
      resource_id,
      severity,
      metadata,
      created_at
    ) VALUES (
      v_user_id,
      'ADMIN',
      CASE WHEN p_enabled THEN 'GAME_ENABLED' ELSE 'GAME_DISABLED' END,
      'GAME_CONFIG',
      v_norm_game_id,
      CASE WHEN p_enabled THEN 'INFO'::audit_severity_enum ELSE 'WARNING'::audit_severity_enum END,
      jsonb_build_object(
        'game_id', v_norm_game_id,
        'game_name', v_new_rec.name,
        'previous_enabled', v_current_rec.enabled,
        'new_enabled', p_enabled,
        'reason', CASE WHEN p_enabled THEN NULL ELSE v_trimmed_reason END,
        'performed_by', v_user_id,
        'timestamp', NOW()
      ),
      NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[admin_set_game_enabled] Advertencia al escribir audit_logs: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', v_new_rec.game_id,
    'name', v_new_rec.name,
    'enabled', v_new_rec.enabled,
    'is_active', v_new_rec.is_active,
    'disabled_reason', v_new_rec.disabled_reason,
    'disabled_at', v_new_rec.disabled_at,
    'disabled_by', v_new_rec.disabled_by,
    'updated_at', v_new_rec.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_game_enabled(TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

-- 6. CONFIGURACIÓN REALTIME Y POLÍTICAS RLS EN game_configurations
ALTER TABLE public.game_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública de configuraciones de juego" ON public.game_configurations;
CREATE POLICY "Lectura pública de configuraciones de juego"
  ON public.game_configurations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Modificación exclusiva de administradores en game_configurations" ON public.game_configurations;
CREATE POLICY "Modificación exclusiva de administradores en game_configurations"
  ON public.game_configurations FOR ALL
  USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.game_configurations REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_configurations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- 7. PROTECCIÓN BACKEND: join_table_transaction
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

  -- BLOQUEO DE SEGURIDAD BACKEND: VERIFICAR DISPONIBILIDAD DEL JUEGO
  IF NOT public.is_game_enabled(v_table.game_type::text) THEN
    RAISE EXCEPTION 'GAME_DISABLED: Este juego se encuentra temporalmente deshabilitado por el administrador.';
  END IF;

  IF v_table.status::text NOT IN ('OPEN', 'WAITING') THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: La mesa no está abierta para nuevos jugadores (estado: %)', v_table.status;
  END IF;

  -- 2. REGLA OBLIGATORIA: Verificar si el usuario ya pertenece a esta mesa
  SELECT * INTO v_existing_player
  FROM public.game_table_players
  WHERE table_id = p_table_id AND user_id = v_user_id;

  IF FOUND AND v_existing_player.status IN ('JOINED', 'READY', 'PLAYING') THEN
    RETURN jsonb_build_object(
      'success', true,
      'table_id', p_table_id,
      'seat_number', v_existing_player.seat_number,
      'message', 'Ya perteneces a esta mesa',
      'is_already_joined', true,
      'current_players_count', v_table.current_players_count
    );
  END IF;

  IF v_table.current_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: La mesa ya ha alcanzado su capacidad máxima';
  END IF;

  -- 3. Asignar asiento disponible
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
    v_assigned_seat := NULL;
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

    IF v_assigned_seat IS NULL THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE: No hay asientos disponibles en esta mesa';
    END IF;
  END IF;

  -- 4. Validar saldo y retención si hay tarifa de entrada
  IF v_table.entry_fee > 0 THEN
    SELECT id, available_balance, held_balance
    INTO v_wallet_id, v_wallet_available, v_wallet_held
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, available_balance, held_balance, currency)
      VALUES (v_user_id, 0.00, 0.00, 'VES')
      ON CONFLICT (user_id) DO NOTHING;

      SELECT id, available_balance, held_balance
      INTO v_wallet_id, v_wallet_available, v_wallet_held
      FROM public.wallets
      WHERE user_id = v_user_id
      FOR UPDATE;
    END IF;

    IF v_wallet_available < v_table.entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Tu saldo disponible (% Bs.) no cubre la entrada (% Bs.)',
        COALESCE(v_wallet_available, 0.00), v_table.entry_fee;
    END IF;

    UPDATE public.wallets
    SET available_balance = available_balance - v_table.entry_fee,
        held_balance = held_balance + v_table.entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    v_effective_key := COALESCE(
      p_idempotency_key,
      'join_hold_' || p_table_id::text || '_' || v_user_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
    );

    INSERT INTO public.ledger_entries (
      wallet_id,
      user_id,
      amount,
      entry_type,
      direction,
      reference_table,
      reference_id,
      description,
      idempotency_key,
      balance_after_available,
      balance_after_held,
      created_at
    ) VALUES (
      v_wallet_id,
      v_user_id,
      v_table.entry_fee,
      'BET_PLACED'::ledger_entry_type_enum,
      'DEBIT'::ledger_direction_enum,
      'game_tables',
      p_table_id,
      'Retención de entrada a mesa: ' || COALESCE(v_table.name, v_table.invite_code, p_table_id::text),
      v_effective_key,
      v_wallet_available - v_table.entry_fee,
      v_wallet_held + v_table.entry_fee,
      NOW()
    ) RETURNING id INTO v_ledger_id;
  END IF;

  -- 5. Insertar o actualizar registro del jugador en la mesa
  IF FOUND AND v_existing_player.id IS NOT NULL THEN
    UPDATE public.game_table_players
    SET status = 'JOINED'::player_table_status_enum,
        seat_number = v_assigned_seat,
        joined_at = NOW(),
        updated_at = NOW()
    WHERE id = v_existing_player.id
    RETURNING id INTO v_player_id;
  ELSE
    INSERT INTO public.game_table_players (
      table_id,
      user_id,
      seat_number,
      status,
      joined_at,
      updated_at
    ) VALUES (
      p_table_id,
      v_user_id,
      v_assigned_seat,
      'JOINED'::player_table_status_enum,
      NOW(),
      NOW()
    ) RETURNING id INTO v_player_id;
  END IF;

  -- 6. Actualizar contador de jugadores en la mesa
  SELECT COUNT(*) INTO v_new_count
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND status IN ('JOINED', 'READY', 'PLAYING');

  UPDATE public.game_tables
  SET current_players_count = v_new_count,
      status = CASE
        WHEN v_new_count >= v_table.max_players THEN 'FULL'::table_status_enum
        ELSE 'OPEN'::table_status_enum
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'player_id', v_player_id,
    'seat_number', v_assigned_seat,
    'current_players_count', v_new_count,
    'max_players', v_table.max_players,
    'status', CASE WHEN v_new_count >= v_table.max_players THEN 'FULL' ELSE 'OPEN' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_table_transaction(UUID, SMALLINT, VARCHAR) TO authenticated, service_role;

-- 8. PROTECCIÓN BACKEND: start_game_session_secure
CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id UUID,
  p_initial_state JSONB DEFAULT NULL,
  p_turn_duration_seconds INTEGER DEFAULT 30,
  p_initial_turn_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_table RECORD;
  v_session RECORD;
  v_players JSONB;
  v_unique_players INT;
  v_game_type TEXT;
  v_session_status TEXT;
  v_initial_state JSONB;
  v_host_id UUID;
  v_effective_turn_user_id UUID;
  v_deadline TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO: Debes iniciar sesión para comenzar la partida.';
  END IF;

  -- 1. Bloquear y obtener la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MESA_NO_ENCONTRADA: La mesa especificada no existe.';
  END IF;

  -- BLOQUEO DE SEGURIDAD BACKEND: VERIFICAR DISPONIBILIDAD DEL JUEGO
  IF NOT public.is_game_enabled(v_table.game_type::text) THEN
    RAISE EXCEPTION 'GAME_DISABLED: Este juego se encuentra temporalmente deshabilitado por el administrador.';
  END IF;

  -- Obtener host de manera segura soportando host_user_id y created_by
  v_host_id := COALESCE(
    (to_jsonb(v_table)->>'host_user_id')::uuid,
    (to_jsonb(v_table)->>'created_by')::uuid
  );

  IF v_host_id IS NOT NULL AND v_host_id != v_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.game_table_players
      WHERE table_id = p_table_id AND user_id = v_user_id AND status IN ('JOINED', 'READY', 'PLAYING')
    ) THEN
      RAISE EXCEPTION 'NO_AUTORIZADO: Solo el creador o un jugador activo de la mesa puede iniciarla.';
    END IF;
  END IF;

  -- 2. Recolectar jugadores activos
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', gtp.user_id,
      'user_id', gtp.user_id,
      'seat', gtp.seat_number,
      'seat_number', gtp.seat_number,
      'name', COALESCE(p.full_name, p.username, 'Jugador ' || gtp.seat_number),
      'username', COALESCE(p.username, p.full_name, 'jugador_' || gtp.seat_number),
      'avatar', p.avatar_url,
      'score', 0,
      'status', 'ACTIVE'
    ) ORDER BY gtp.seat_number ASC
  )
  INTO v_players
  FROM public.game_table_players gtp
  LEFT JOIN public.profiles p ON p.id = gtp.user_id
  WHERE gtp.table_id = p_table_id
    AND gtp.status IN ('JOINED', 'READY', 'PLAYING');

  v_unique_players := COALESCE(jsonb_array_length(v_players), 0);
  IF v_unique_players < 2 AND v_table.game_type::text NOT IN ('BINGO', 'bingo', 'POLLA', 'polla', 'polla_venezolana') THEN
    RAISE EXCEPTION 'JUGADORES_INSUFICIENTES: Se requieren al menos 2 jugadores para iniciar.';
  END IF;

  -- 3. Definir estado inicial y turno
  v_game_type := lower(v_table.game_type::text);
  v_effective_turn_user_id := p_initial_turn_user_id;

  IF v_effective_turn_user_id IS NULL AND v_players IS NOT NULL AND jsonb_array_length(v_players) > 0 THEN
    v_effective_turn_user_id := (v_players->0->>'user_id')::uuid;
  END IF;

  v_deadline := NOW() + (p_turn_duration_seconds || ' seconds')::interval;

  v_initial_state := COALESCE(p_initial_state, jsonb_build_object(
    'status', 'ACTIVE',
    'gameType', v_game_type,
    'tableId', p_table_id,
    'currentTurn', v_effective_turn_user_id,
    'turnDeadline', v_deadline,
    'round', 1,
    'players', v_players,
    'startedAt', NOW()
  ));

  -- 4. Verificar si ya existe una sesión
  SELECT * INTO v_session FROM public.game_sessions WHERE table_id = p_table_id FOR UPDATE;

  IF FOUND THEN
    IF v_session.status::text = 'ACTIVE' THEN
      RETURN jsonb_build_object(
        'success', true,
        'alreadyActive', true,
        'sessionId', v_session.id,
        'tableId', p_table_id,
        'gameState', v_session.current_state,
        'source', 'existing_db_session'
      );
    END IF;

    UPDATE public.game_sessions
    SET
      status = 'ACTIVE'::session_status_enum,
      current_state = v_initial_state,
      game_state = v_initial_state,
      turn_user_id = v_effective_turn_user_id,
      turn_deadline_at = v_deadline,
      turn_expires_at = v_deadline,
      updated_at = NOW()
    WHERE id = v_session.id
    RETURNING * INTO v_session;
  ELSE
    INSERT INTO public.game_sessions (
      table_id,
      game_id,
      game_type,
      status,
      current_state,
      game_state,
      turn_user_id,
      turn_deadline_at,
      turn_expires_at,
      created_at,
      updated_at
    ) VALUES (
      p_table_id,
      v_table.game_type::text,
      v_table.game_type,
      'ACTIVE'::session_status_enum,
      v_initial_state,
      v_initial_state,
      v_effective_turn_user_id,
      v_deadline,
      v_deadline,
      NOW(),
      NOW()
    ) RETURNING * INTO v_session;
  END IF;

  -- 5. Marcar mesa y jugadores como jugando
  UPDATE public.game_tables
  SET status = 'IN_GAME'::table_status_enum,
      game_started = true,
      updated_at = NOW()
  WHERE id = p_table_id;

  UPDATE public.game_table_players
  SET status = 'PLAYING'::player_table_status_enum,
      updated_at = NOW()
  WHERE table_id = p_table_id
    AND status IN ('JOINED', 'READY');

  RETURN jsonb_build_object(
    'success', true,
    'sessionId', v_session.id,
    'tableId', p_table_id,
    'gameState', v_session.current_state,
    'turnUserId', v_effective_turn_user_id,
    'turnDeadline', v_deadline
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID, JSONB, INTEGER, UUID) TO authenticated, service_role;

-- 9. PROTECCIÓN EN create_game_table_secure
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
  v_effective_config JSONB;
  v_game_variant TEXT;
BEGIN
  -- 1. Identificación y Validación del Usuario Autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa';
  END IF;

  -- BLOQUEO DE SEGURIDAD BACKEND: VERIFICAR DISPONIBILIDAD DEL JUEGO
  IF NOT public.is_game_enabled(p_game_type) THEN
    RAISE EXCEPTION 'GAME_DISABLED: El juego "%" se encuentra temporalmente deshabilitado por el administrador.', p_game_type;
  END IF;

  -- AUTO-LIMPIEZA SELF-HEALING: Limpia estados huérfanos previos del usuario antes de comprobar mesas activas
  PERFORM public.cleanup_stale_user_game_participation(v_user_id);

  -- Bloqueo pesimista FOR UPDATE en billetera
  IF p_entry_fee > 0 THEN
    SELECT id, available_balance, held_balance 
    INTO v_wallet_id, v_wallet_available, v_wallet_held
    FROM public.wallets
    WHERE user_id = v_user_id FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, available_balance, held_balance, currency)
      VALUES (v_user_id, 0.00, 0.00, 'VES')
      ON CONFLICT (user_id) DO NOTHING;

      SELECT id, available_balance, held_balance 
      INTO v_wallet_id, v_wallet_available, v_wallet_held
      FROM public.wallets
      WHERE user_id = v_user_id FOR UPDATE;
    END IF;

    IF v_wallet_available < p_entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Tu saldo disponible (% Bs.) es insuficiente para cubrir la entrada (% Bs.)',
        COALESCE(v_wallet_available, 0.00), p_entry_fee;
    END IF;
  END IF;

  -- Verificar estado de la cuenta
  SELECT account_status INTO v_profile_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile_status IS NOT NULL AND v_profile_status IN ('SUSPENDED', 'BANNED') THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Tu cuenta se encuentra temporalmente restringida';
  END IF;

  -- Convertir tipo de juego a enum de forma segura
  BEGIN
    v_enum_game_type := p_game_type::game_type_enum;
  EXCEPTION WHEN OTHERS THEN
    CASE upper(p_game_type)
      WHEN 'DOMINO_VENEZOLANO' THEN v_enum_game_type := 'DOMINO'::game_type_enum;
      WHEN 'DOMINO' THEN v_enum_game_type := 'DOMINO'::game_type_enum;
      WHEN 'TRUCO_VENEZOLANO' THEN v_enum_game_type := 'TRUCO'::game_type_enum;
      WHEN 'TRUCO' THEN v_enum_game_type := 'TRUCO'::game_type_enum;
      WHEN 'LUDO' THEN v_enum_game_type := 'LUDO'::game_type_enum;
      WHEN 'BINGO' THEN v_enum_game_type := 'BINGO'::game_type_enum;
      WHEN 'POLLA' THEN v_enum_game_type := 'POLLA'::game_type_enum;
      WHEN 'POLLA_ENCUESTADORA' THEN v_enum_game_type := 'POLLA'::game_type_enum;
      WHEN 'ATRAPAITO' THEN v_enum_game_type := 'ATRAPAITO'::game_type_enum;
      WHEN 'UNA_OLLA' THEN v_enum_game_type := 'UNA_OLLA'::game_type_enum;
      ELSE RAISE EXCEPTION 'INVALID_GAME_TYPE: Tipo de juego no reconocido: %', p_game_type;
    END CASE;
  END;

  -- Extraer la variante de juego (e.g. '75' | '90')
  v_game_variant := COALESCE(p_config->>'gameVariant', p_config->>'variant', '90');

  -- 2. Limpieza de mesas huérfanas
  FOR v_stale_rec IN
    SELECT gtp.table_id, gs.id AS session_id
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
    WHERE gtp.user_id = v_user_id
      AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
      AND gt.game_type = v_enum_game_type
      AND (
        gt.status IN ('CLOSED', 'CANCELLED')
        OR (gs.id IS NOT NULL AND gs.status::text IN ('FINISHED', 'CANCELLED', 'ABANDONED'))
        OR (gt.updated_at IS NOT NULL AND gt.updated_at < NOW() - INTERVAL '4 hours')
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
        'auto_cleanup_create_110_' || v_stale_rec.table_id::text
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 3. CONTROL ESTRICTO DE OTRA MESA ACTIVA REAL
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
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya estás participando en una mesa activa de este juego. Sal de esa mesa o espera a que finalice antes de crear otra.';
  END IF;

  -- 4. Validaciones de Tarifas y Límites
  IF p_entry_fee < 10.00 OR p_entry_fee > 5000.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe estar entre 10 Bs. y 5.000 Bs.';
  END IF;

  -- 5. Determinación de Límites de Jugadores y Nombre
  v_min_players := 2;
  IF v_enum_game_type = 'BINGO'::game_type_enum THEN
    v_min_players := 2;
  END IF;

  IF p_max_players < v_min_players THEN
    RAISE EXCEPTION 'INVALID_PLAYER_LIMIT: La mesa requiere mínimo % jugadores', v_min_players;
  END IF;

  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || v_enum_game_type::text);
  v_table_id := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '1 hour';

  -- 6. Generación de Código Único de Invitación
  LOOP
    v_code_attempts := v_code_attempts + 1;
    IF v_code_attempts > 50 THEN
      v_invite_code := 'TRK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      EXIT;
    END IF;

    IF p_visibility = 'PRIVATE' THEN
      v_code_candidate := 'TRK-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    ELSE
      v_code_candidate := 'PUB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.game_tables WHERE invite_code = v_code_candidate) THEN
      v_invite_code := v_code_candidate;
      EXIT;
    END IF;
  END LOOP;

  -- 7. Retención Inicial de Saldo en Billetera
  IF p_entry_fee > 0 THEN
    UPDATE public.wallets
    SET available_balance = available_balance - p_entry_fee,
        held_balance = held_balance + p_entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    INSERT INTO public.ledger_entries (
      wallet_id,
      user_id,
      amount,
      entry_type,
      direction,
      reference_table,
      reference_id,
      description,
      idempotency_key,
      balance_after_available,
      balance_after_held,
      created_at
    ) VALUES (
      v_wallet_id,
      v_user_id,
      p_entry_fee,
      'BET_PLACED'::ledger_entry_type_enum,
      'DEBIT'::ledger_direction_enum,
      'game_tables',
      v_table_id,
      'Entrada retenida al crear mesa: ' || v_table_name,
      'create_hold_' || v_table_id::text || '_' || v_user_id::text,
      v_wallet_available - p_entry_fee,
      v_wallet_held + p_entry_fee,
      NOW()
    ) RETURNING id INTO v_ledger_id;
  END IF;

  -- Asegurar que la configuración tenga las claves estándar
  v_effective_config := COALESCE(p_config, '{}'::jsonb);
  v_effective_config := v_effective_config || jsonb_build_object(
    'gameVariant', v_game_variant,
    'variant', v_game_variant
  );

  -- 8. Inserción Atómica de la Mesa
  INSERT INTO public.game_tables (
    id,
    game_type,
    game_variant,
    name,
    visibility,
    entry_fee,
    min_players,
    max_players,
    current_players_count,
    status,
    created_by,
    host_user_id,
    invite_code,
    config,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    v_table_id,
    v_enum_game_type,
    v_game_variant,
    v_table_name,
    p_visibility,
    p_entry_fee,
    v_min_players,
    p_max_players,
    1,
    'OPEN'::table_status_enum,
    v_user_id,
    v_user_id,
    v_invite_code,
    v_effective_config,
    v_expires_at,
    NOW(),
    NOW()
  );

  -- 9. Inserción del Creador como Jugador 1
  INSERT INTO public.game_table_players (
    table_id,
    user_id,
    seat_number,
    status,
    joined_at,
    updated_at
  ) VALUES (
    v_table_id,
    v_user_id,
    1,
    'JOINED'::player_table_status_enum,
    NOW(),
    NOW()
  ) RETURNING id INTO v_player_id;

  RETURN jsonb_build_object(
    'table_id', v_table_id,
    'id', v_table_id,
    'invite_code', v_invite_code,
    'player_id', v_player_id,
    'game_type', v_enum_game_type,
    'game_variant', v_game_variant,
    'name', v_table_name,
    'status', 'OPEN',
    'entry_fee', p_entry_fee,
    'max_players', p_max_players,
    'expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) TO authenticated, service_role;
