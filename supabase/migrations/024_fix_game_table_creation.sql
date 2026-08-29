-- ================================================================
-- MIGRACIÓN 024: Corrección Definitiva y Alineación con Esquema Real
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / INTEGRIDAD DE MESAS Y CATÁLOGO DE TARIFAS
-- ================================================================
-- 1. Asegura la existencia idempotente de public.entry_fees
-- 2. Asegura la existencia idempotente de public.game_configurations
-- 3. Puebla las 10 tarifas autorizadas de forma segura
-- 4. Implementa is_valid_entry_fee()
-- 5. Implementa fn_normalize_game_type_enum() para los 8 juegos y alias
-- 6. Implementa la RPC create_game_table_secure() (SECURITY DEFINER)
-- 7. Otorga permisos y recarga esquema PostgREST
-- ================================================================

-- ================================================================
-- 1. TABLA DE MONTOS DE ENTRADA CONFIGURABLES (entry_fees)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.entry_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(14,2) NOT NULL,
  game_type game_type_enum NULL, -- NULL = aplicable a todos los juegos
  mode VARCHAR(30) NULL,        -- NULL = aplicable a todas las modalidades
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_entry_fee_positive CHECK (amount > 0.00)
);

CREATE INDEX IF NOT EXISTS idx_entry_fees_active ON public.entry_fees(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_entry_fees_amount ON public.entry_fees(amount);

ALTER TABLE public.entry_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_fees FORCE ROW LEVEL SECURITY;

-- Políticas RLS para entry_fees
DROP POLICY IF EXISTS p_entry_fees_read ON public.entry_fees;
CREATE POLICY p_entry_fees_read ON public.entry_fees
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS p_entry_fees_admin_all ON public.entry_fees;
CREATE POLICY p_entry_fees_admin_all ON public.entry_fees
  FOR ALL
  USING (public.is_operator_or_above(auth.uid()))
  WITH CHECK (public.is_operator_or_above(auth.uid()));

-- ================================================================
-- 2. TABLA DE CONFIGURACIÓN DE JUEGOS (game_configurations)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.game_configurations (
  game_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  short_description TEXT NOT NULL,
  icon_name VARCHAR(50) NOT NULL DEFAULT 'Gamepad2',
  is_active BOOLEAN NOT NULL DEFAULT true,
  maintenance_message TEXT NULL,
  min_players SMALLINT NOT NULL DEFAULT 2,
  max_players SMALLINT NOT NULL DEFAULT 4,
  allowed_modes TEXT[] NOT NULL DEFAULT ARRAY['1v1', '2v2'],
  min_entry_fee NUMERIC(14,2) NOT NULL DEFAULT 10.00,
  max_entry_fee NUMERIC(14,2) NOT NULL DEFAULT 2000.00,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.game_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_configurations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_game_config_read ON public.game_configurations;
CREATE POLICY p_game_config_read ON public.game_configurations
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS p_game_config_admin ON public.game_configurations;
CREATE POLICY p_game_config_admin ON public.game_configurations
  FOR ALL
  USING (public.is_operator_or_above(auth.uid()))
  WITH CHECK (public.is_operator_or_above(auth.uid()));

-- ================================================================
-- 3. POBLACIÓN IDEMPOTENTE DE MONTOS DE ENTRADA AUTORIZADOS
-- ================================================================
INSERT INTO public.entry_fees (amount, display_order, is_active)
SELECT v.amount, v.display_order, true
FROM (VALUES
  (10.00, 1),
  (15.00, 2),
  (20.00, 3),
  (25.00, 4),
  (50.00, 5),
  (100.00, 6),
  (250.00, 7),
  (500.00, 8),
  (1000.00, 9),
  (2000.00, 10)
) AS v(amount, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.entry_fees ef WHERE ef.amount = v.amount AND ef.game_type IS NULL
);

-- ================================================================
-- 4. VALIDACIÓN DE MONTOS DE ENTRADA (is_valid_entry_fee)
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_valid_entry_fee(
  p_amount NUMERIC,
  p_game_type game_type_enum DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Monto 0 permitido para prácticas / mesas libres
  IF p_amount = 0.00 THEN
    RETURN TRUE;
  END IF;

  IF p_amount < 0.00 THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.entry_fees
    WHERE amount = p_amount
      AND is_active = true
      AND (game_type IS NULL OR game_type = p_game_type)
  );
END;
$$;

-- ================================================================
-- 5. NORMALIZACIÓN DE TIPOS DE JUEGO Y ALIAS A ENUM CANÓNICO
-- ================================================================
CREATE OR REPLACE FUNCTION public.fn_normalize_game_type_enum(p_input TEXT)
RETURNS game_type_enum
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF p_input IS NULL THEN
    RAISE EXCEPTION 'INVALID_GAME_TYPE: El tipo de juego no puede ser nulo';
  END IF;

  v_clean := lower(trim(p_input));

  CASE v_clean
    WHEN 'domino_venezolano', 'domino', 'dominoes' THEN
      RETURN 'DOMINO_VENEZOLANO'::game_type_enum;
    WHEN 'truco_venezolano', 'truco' THEN
      RETURN 'TRUCO_VENEZOLANO'::game_type_enum;
    WHEN 'tic_tac_toe', 'tres_en_raya', '3_en_raya', 'tictactoe' THEN
      RETURN 'TRES_EN_RAYA'::game_type_enum;
    WHEN 'rock_paper_scissors', 'piedra_papel_tijera', 'ppt', 'rps' THEN
      RETURN 'PIEDRA_PAPEL_TIJERA'::game_type_enum;
    WHEN 'checkers', 'damas' THEN
      RETURN 'DAMAS'::game_type_enum;
    WHEN 'bingo', 'bingo_online' THEN
      RETURN 'BINGO'::game_type_enum;
    WHEN 'polla_venezolana', 'polla', 'quiniela' THEN
      RETURN 'POLLA_VENEZOLANA'::game_type_enum;
    WHEN 'atrapaito', 'atrapa_al_ladron' THEN
      RETURN 'ATRAPAITO'::game_type_enum;
    ELSE
      BEGIN
        RETURN upper(trim(p_input))::game_type_enum;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_GAME_TYPE: Tipo de juego desconocido o no soportado: %', p_input;
      END;
  END CASE;
END;
$$;

-- ================================================================
-- 6. RPC DEFINITIVA: create_game_table_secure (SECURITY DEFINER)
-- ================================================================
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
  v_enum_game_type game_type_enum;
  v_game_id_str VARCHAR;
  v_game_cfg RECORD;
  v_user_profile RECORD;
  v_invite_code VARCHAR(12);
  v_table_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_table_name VARCHAR(120);
  v_min_players SMALLINT;
  v_code_candidate VARCHAR(12);
  v_code_attempts INT := 0;
BEGIN
  -- 1. Validar identidad autenticada
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa';
  END IF;

  -- 2. Asegurar que el perfil del usuario existe en public.profiles
  SELECT * INTO v_user_profile
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    -- Auto-aprovisionar perfil seguro si no existía aún
    PERFORM public.ensure_current_user_profile();
    SELECT * INTO v_user_profile
    FROM public.profiles
    WHERE user_id = v_user_id;
  END IF;

  -- 3. Validar estado de la cuenta
  IF v_user_profile.account_status IN ('BLOCKED', 'SUSPENDED', 'CLOSED') THEN
    RAISE EXCEPTION 'PROFILE_NOT_ACTIVE: Tu cuenta no se encuentra activa para crear mesas.';
  END IF;

  -- 4. Normalizar tipo de juego
  v_enum_game_type := public.fn_normalize_game_type_enum(p_game_type);
  v_game_id_str := lower(v_enum_game_type::text);

  -- 5. Validar estado activo de la configuración del juego (si existe la tabla)
  IF to_regclass('public.game_configurations') IS NOT NULL THEN
    SELECT * INTO v_game_cfg
    FROM public.game_configurations
    WHERE game_id = v_game_id_str;

    IF FOUND AND v_game_cfg.is_active = FALSE THEN
      RAISE EXCEPTION 'GAME_INACTIVE: Este juego se encuentra en mantenimiento temporal: %', 
        COALESCE(v_game_cfg.maintenance_message, 'Pronto estará disponible');
    END IF;
  END IF;

  -- 6. Validar monto de entrada
  IF p_entry_fee < 0.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada no puede ser negativo';
  END IF;

  IF NOT public.is_valid_entry_fee(p_entry_fee, v_enum_game_type) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada % Bs. no está autorizado en el sistema', p_entry_fee;
  END IF;

  -- 7. Validar límites de jugadores
  IF p_max_players < 2 OR p_max_players > 1000 THEN
    RAISE EXCEPTION 'INVALID_PLAYERS_COUNT: Cantidad de jugadores inválida (mínimo 2, máximo 1000)';
  END IF;

  v_min_players := CASE 
    WHEN p_max_players = 4 THEN 2 
    WHEN p_max_players > 4 THEN 2
    ELSE p_max_players 
  END;

  -- 8. Generar código de acceso único (PUB-XXXX o TRK-XXXX)
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

    IF v_code_attempts > 15 THEN
      v_invite_code := CASE WHEN p_visibility = 'PRIVATE' THEN 'TRK-' ELSE 'PUB-' END || substring(encode(gen_random_bytes(3), 'hex') from 1 for 5);
      EXIT;
    END IF;
  END LOOP;

  v_expires_at := NOW() + INTERVAL '2 hours';
  v_table_id := gen_random_uuid();
  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || v_enum_game_type::text);

  -- 9. Insertar registro de mesa (Sin debitar saldo; el cobro ocurre en join_table_transaction)
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
    'OPEN',
    COALESCE(p_config, '{}'::jsonb),
    v_expires_at
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'game_type', v_enum_game_type,
    'invite_code', v_invite_code,
    'name', v_table_name,
    'entry_fee', p_entry_fee,
    'visibility', p_visibility,
    'max_players', p_max_players,
    'status', 'OPEN',
    'created_at', NOW()
  );
END;
$$;

-- Sobrecarga para invocación con tipo enum explícito
CREATE OR REPLACE FUNCTION public.create_game_table_secure(
  p_game_type game_type_enum,
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
BEGIN
  RETURN public.create_game_table_secure(
    p_game_type::text,
    p_name,
    p_visibility,
    p_entry_fee,
    p_max_players,
    p_config
  );
END;
$$;

-- ================================================================
-- 7. CONCESIÓN DE PRIVILEGIOS
-- ================================================================
GRANT EXECUTE ON FUNCTION public.fn_normalize_game_type_enum(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_entry_fee(NUMERIC, game_type_enum) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_game_table_secure(game_type_enum, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) TO authenticated, service_role;

-- ================================================================
-- 8. RECARGA DE CACHÉ DE ESQUEMA POSTGREST
-- ================================================================
NOTIFY pgrst, 'reload schema';
