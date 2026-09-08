-- ==============================================================================
-- MIGRACIÓN 139: FIX FLUJO DE UNIÓN A MESAS DE BINGO Y ESTADOS (WAITING / OPEN / SALES)
-- Proyecto: RASPANDO LA OLLA — Corrección integral de unión y visualización en Lobby
-- ==============================================================================

-- 1. Asegurar que los estados WAITING, OPEN y SALES existan en table_status_enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'WAITING' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'WAITING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'OPEN' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'OPEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'SALES' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'SALES';
  END IF;
END $$;

-- 2. Asegurar columna game_variant en game_tables si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'game_tables' 
      AND column_name = 'game_variant'
  ) THEN
    ALTER TABLE public.game_tables ADD COLUMN game_variant VARCHAR(20) DEFAULT '90';
  END IF;
END $$;

-- 3. Función CANÓNICA de unión a mesa (join_table_transaction con 1 parámetro p_table_id)
DROP FUNCTION IF EXISTS public.join_table_transaction(UUID);

CREATE OR REPLACE FUNCTION public.join_table_transaction(p_table_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_table RECORD;
  v_current_players INT;
  v_seat_number INT;
  v_is_bingo BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO: Debes iniciar sesión para unirte a una mesa';
  END IF;

  -- Bloquear la mesa para evitar condiciones de carrera
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MESA_NO_ENCONTRADA: La mesa especificada no existe';
  END IF;

  v_is_bingo := lower(v_table.game_type::text) = 'bingo';

  -- Verificar que la mesa esté en estado que permita uniones
  IF v_table.status::text NOT IN ('WAITING', 'OPEN', 'SALES', 'READY') THEN
    RAISE EXCEPTION 'MESA_NO_DISPONIBLE: La mesa no está aceptando jugadores (Estado: %)', v_table.status;
  END IF;

  -- Verificar que no esté llena
  SELECT COUNT(*) INTO v_current_players FROM public.game_table_players WHERE table_id = p_table_id AND status != 'LEFT';
  IF v_current_players >= v_table.max_players THEN
    RAISE EXCEPTION 'MESA_LLENA: La mesa ha alcanzado su capacidad máxima';
  END IF;

  -- Verificar si el usuario ya está en la mesa
  IF EXISTS (
    SELECT 1 FROM public.game_table_players 
    WHERE table_id = p_table_id 
      AND user_id = v_user_id 
      AND status != 'LEFT'
  ) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Ya estás en esta mesa.',
      'already_joined', true,
      'table_id', p_table_id
    );
  END IF;

  -- Asignar asiento
  v_seat_number := v_current_players + 1;

  -- Insertar al jugador
  INSERT INTO public.game_table_players (table_id, user_id, seat_number, status, joined_at, updated_at)
  VALUES (p_table_id, v_user_id, v_seat_number, 'JOINED', NOW(), NOW());

  -- Actualizar conteo en game_tables
  UPDATE public.game_tables
  SET current_players_count = COALESCE(current_players_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Te has unido a la mesa exitosamente.',
    'table_id', p_table_id,
    'seat_number', v_seat_number
  );
END;
$$;

-- 4. Soporte de sobrecarga de 3 parámetros para compatibilidad con Domino y llamados heredados
CREATE OR REPLACE FUNCTION public.join_table_transaction(
  p_table_id UUID,
  p_seat_number SMALLINT,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_table RECORD;
BEGIN
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MESA_NO_ENCONTRADA: La mesa no existe';
  END IF;

  -- Si es Bingo, la entrada y compras se manejan sin retención previa de asiento
  IF lower(v_table.game_type::text) = 'bingo' THEN
    RETURN public.join_table_transaction(p_table_id);
  END IF;

  -- Para otros juegos (Dominó, etc.), ejecutar con validación de estados WAITING / OPEN
  IF v_table.status::text NOT IN ('WAITING', 'OPEN', 'SALES') THEN
    RAISE EXCEPTION 'MESA_NO_DISPONIBLE: La mesa no está abierta para nuevos jugadores (estado: %)', v_table.status;
  END IF;

  RETURN public.join_table_transaction(p_table_id);
END;
$$;

-- 5. Versión compatible de create_game_table_secure (5 parámetros)
DROP FUNCTION IF EXISTS public.create_game_table_secure(TEXT, NUMERIC, INT, BOOLEAN, JSONB);

CREATE OR REPLACE FUNCTION public.create_game_table_secure(
  p_game_type TEXT,
  p_entry_fee NUMERIC,
  p_max_players INT DEFAULT 4,
  p_is_private BOOLEAN DEFAULT FALSE,
  p_config JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_table_id UUID := gen_random_uuid();
  v_invite_code TEXT;
  v_variant TEXT;
  v_table_status table_status_enum;
  v_visibility table_visibility_enum;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO';
  END IF;

  -- Generar código de invitación aleatorio
  v_invite_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
  v_variant := COALESCE(p_config->>'gameVariant', p_config->>'variant', '90');
  v_table_status := 'WAITING'::table_status_enum;
  v_visibility := CASE WHEN p_is_private THEN 'PRIVATE'::table_visibility_enum ELSE 'PUBLIC'::table_visibility_enum END;

  -- Insertar la mesa en estado WAITING
  INSERT INTO public.game_tables (
    id,
    game_type,
    game_variant,
    status,
    entry_fee,
    max_players,
    visibility,
    invite_code,
    host_user_id,
    config,
    created_at,
    updated_at
  ) VALUES (
    v_table_id,
    lower(p_game_type),
    v_variant,
    v_table_status,
    p_entry_fee,
    p_max_players,
    v_visibility,
    v_invite_code,
    v_user_id,
    p_config,
    NOW(),
    NOW()
  );

  -- Crear sesión inicial para Bingo si aplica
  IF lower(p_game_type) = 'bingo' THEN
    INSERT INTO public.game_sessions (
      table_id,
      game_type,
      status,
      current_state,
      created_at
    ) VALUES (
      v_table_id,
      'bingo',
      'WAITING'::session_status_enum,
      jsonb_build_object(
        'status', 'SALES',
        'variant', v_variant,
        'drawnBalls', '[]'::jsonb,
        'currentBall', NULL,
        'callIntervalMs', 4000
      ),
      NOW()
    );
  END IF;

  -- Agregar al creador como primer jugador
  INSERT INTO public.game_table_players (table_id, user_id, seat_number, status, joined_at)
  VALUES (v_table_id, v_user_id, 1, 'JOINED', NOW());

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'invite_code', v_invite_code,
    'status', 'WAITING'
  );
END;
$$;

-- 6. Actualizar la versión de 6 parámetros de create_game_table_secure para asegurar 'WAITING' en Bingo
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
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_enum_game_type game_type_enum;
  v_table_id UUID;
  v_invite_code VARCHAR(32);
  v_table_name VARCHAR(100);
  v_min_players SMALLINT;
  v_expires_at TIMESTAMPTZ;
  v_code_attempts INT := 0;
  v_code_candidate VARCHAR(32);
  v_player_id UUID;
  v_effective_config JSONB;
  v_variant VARCHAR(20);
  v_initial_status table_status_enum;
  v_is_bingo BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa';
  END IF;

  BEGIN
    v_enum_game_type := upper(p_game_type)::game_type_enum;
  EXCEPTION WHEN OTHERS THEN
    v_enum_game_type := 'BINGO'::game_type_enum;
  END;

  v_is_bingo := (v_enum_game_type = 'BINGO');
  v_initial_status := CASE WHEN v_is_bingo THEN 'WAITING'::table_status_enum ELSE 'OPEN'::table_status_enum END;
  v_min_players := CASE WHEN v_is_bingo THEN 1 ELSE 2 END;
  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || v_enum_game_type::text);
  v_table_id := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '2 hours';
  v_variant := COALESCE(p_config->>'gameVariant', p_config->>'variant', '90');
  v_effective_config := COALESCE(p_config, '{}'::jsonb) || jsonb_build_object('name', v_table_name, 'variant', v_variant);

  -- Generación de código de invitación
  LOOP
    v_code_attempts := v_code_attempts + 1;
    v_code_candidate := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
    IF NOT EXISTS (
      SELECT 1 FROM public.game_tables 
      WHERE invite_code = v_code_candidate 
        AND status IN ('OPEN', 'WAITING', 'SALES', 'FULL', 'STARTING', 'ACTIVE')
    ) THEN
      v_invite_code := v_code_candidate;
      EXIT;
    END IF;
    IF v_code_attempts > 20 THEN
      v_invite_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10));
      EXIT;
    END IF;
  END LOOP;

  -- Inserción de la mesa
  INSERT INTO public.game_tables (
    id, host_user_id, game_type, game_variant, name, visibility,
    status, entry_fee, min_players, max_players,
    current_players_count, invite_code, config,
    created_at, updated_at, expires_at
  ) VALUES (
    v_table_id, v_user_id, v_enum_game_type, v_variant, v_table_name, p_visibility,
    v_initial_status, p_entry_fee, v_min_players, p_max_players,
    1, v_invite_code, v_effective_config,
    NOW(), NOW(), v_expires_at
  );

  -- Si es Bingo, crear sesión atómica inicial en WAITING y SALES
  IF v_is_bingo THEN
    INSERT INTO public.game_sessions (
      table_id,
      game_type,
      status,
      current_state,
      created_at
    ) VALUES (
      v_table_id,
      'bingo',
      'WAITING'::session_status_enum,
      jsonb_build_object(
        'status', 'SALES',
        'variant', v_variant,
        'mode', COALESCE((p_config->>'mode')::int, 90),
        'hostUserId', v_user_id,
        'drawnBalls', '[]'::jsonb,
        'currentBall', NULL,
        'callIntervalMs', 4000
      ),
      NOW()
    );
  END IF;

  -- Inserción del Creador como Jugador
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id, table_id, user_id, seat_number, status, joined_at, updated_at
  ) VALUES (
    v_player_id, v_table_id, v_user_id, 1, 'JOINED'::player_table_status_enum, NOW(), NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'invite_code', v_invite_code,
    'name', v_table_name,
    'game_type', v_enum_game_type,
    'status', v_initial_status,
    'entry_fee', p_entry_fee,
    'player_id', v_player_id,
    'seat_number', 1,
    'max_players', p_max_players,
    'min_players', v_min_players
  );
END;
$$;

-- 7. Corregir mesas existentes de Bingo que quedaron trabadas sin sorteo activo
UPDATE public.game_tables 
SET status = 'WAITING'::table_status_enum,
    updated_at = NOW()
WHERE (game_type = 'bingo' OR game_type = 'BINGO')
  AND status::text IN ('ACTIVE', 'IN_PROGRESS', 'PLAYING')
  AND id IN (
    SELECT table_id FROM public.game_sessions 
    WHERE (game_type = 'bingo' OR game_type = 'BINGO')
      AND status::text IN ('WAITING', 'READY', 'SALES')
      AND (
        current_state->>'drawnBalls' IS NULL 
        OR jsonb_array_length(COALESCE(current_state->'drawnBalls', '[]'::jsonb)) = 0
      )
  );

-- 8. Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.join_table_transaction(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_table_transaction(UUID, SMALLINT, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, NUMERIC, INT, BOOLEAN, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) TO authenticated, service_role;

-- 9. Notificar recarga de schema cache
NOTIFY pgrst, 'reload schema';
