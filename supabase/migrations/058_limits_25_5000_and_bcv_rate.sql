-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 058: LÍMITES DE MONTOS (25 Bs - 5000 Bs) Y TASA BCV
-- ==============================================================================

-- 1. ACTUALIZACIÓN DE CATALOGO entry_fees (Mínimo 25 Bs, Máximo 5000 Bs)
UPDATE public.entry_fees
SET is_active = false
WHERE amount < 25.00 OR amount > 5000.00;

-- Asegurar montos estándar entre 25 y 5000 Bs.
INSERT INTO public.entry_fees (amount, display_order, is_active)
SELECT v.amount, v.display_order, true
FROM (VALUES 
  (25.00, 1),
  (50.00, 2),
  (100.00, 3),
  (250.00, 4),
  (500.00, 5),
  (1000.00, 6),
  (2000.00, 7),
  (5000.00, 8)
) AS v(amount, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.entry_fees ef WHERE ef.amount = v.amount AND ef.game_type IS NULL
);

-- 2. FUNCIÓN DE VALIDACIÓN DE MONTOS (is_valid_entry_fee)
-- Regla General: 25 Bs. <= monto <= 5.000 Bs.
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
  IF p_amount IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 25.00 Bs. <= Monto <= 5.000,00 Bs.
  IF p_amount < 25.00 OR p_amount > 5000.00 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_valid_entry_fee(NUMERIC, game_type_enum) TO authenticated, anon, service_role;

-- 3. ACTUALIZACIÓN DE create_game_table_secure CON VALIDACIÓN STRICT 25 Bs - 5000 Bs
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

  -- Bloquear si el usuario ya participa en una mesa activa del mismo juego
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

  -- VALIDACIÓN DE RANGO MONETARIO RIGUROSO (25 Bs <= monto <= 5.000 Bs)
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

  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa ' || p_game_type);
  v_expires_at := NOW() + INTERVAL '24 hours';

  INSERT INTO public.game_tables (
    host_user_id,
    game_type,
    name,
    visibility,
    entry_fee,
    currency,
    min_players,
    max_players,
    current_players_count,
    status,
    invite_code,
    expires_at,
    config
  ) VALUES (
    v_user_id,
    v_enum_game_type,
    v_table_name,
    p_visibility,
    p_entry_fee,
    'VES',
    v_min_players,
    p_max_players,
    1,
    'OPEN',
    v_invite_code,
    v_expires_at,
    COALESCE(p_config, '{}'::jsonb)
  )
  RETURNING id INTO v_table_id;

  -- Registrar al anfitrión como jugador unido
  INSERT INTO public.game_table_players (
    table_id,
    user_id,
    seat_number,
    status,
    is_host
  ) VALUES (
    v_table_id,
    v_user_id,
    1,
    'JOINED',
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'invite_code', v_invite_code,
    'name', v_table_name,
    'entry_fee', p_entry_fee,
    'status', 'OPEN'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) TO authenticated, service_role;

-- 4. RPC PARA GESTIÓN DE TASA OFICIAL BCV EN public.system_settings
CREATE OR REPLACE FUNCTION public.update_bcv_rate(
  p_rate NUMERIC,
  p_source TEXT DEFAULT 'Banco Central de Venezuela',
  p_status TEXT DEFAULT 'UPDATED'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'INVALID_BCV_RATE: La tasa de cambio debe ser un número positivo mayor a 0';
  END IF;

  v_payload := jsonb_build_object(
    'rate', p_rate,
    'updated_at', NOW(),
    'source', p_source,
    'status', p_status
  );

  INSERT INTO public.system_settings (key, value, is_public, description, updated_at)
  VALUES (
    'bcv_rate',
    v_payload,
    true,
    'Tasa de Cambio Oficial del Banco Central de Venezuela (BCV) para conversión informativa USD',
    NOW()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = v_payload,
      updated_at = NOW(),
      is_public = true;

  RETURN jsonb_build_object(
    'success', true,
    'bcv_rate', v_payload
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bcv_rate(NUMERIC, TEXT, TEXT) TO authenticated, anon, service_role;
