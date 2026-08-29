-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 047: ENDURECIMIENTO TOTP 2FA, PRESENCIA Y MÉTRICAS
-- ==============================================================================
-- 1. Añade columnas 'is_online' y 'last_seen_at' en public.profiles para presencia precisa.
-- 2. Corrige volatilidad de funciones TOTP (STABLE/VOLATILE) y amplia ventana a 2 periodos (150s).
-- 3. Corrige filtro 'user_id = v_user_id' en validate_totp_for_action (soluciona Bug 'id = v_user_id').
-- 4. Actualiza get_admin_dashboard_metrics() para diferenciar Usuarios Registrados vs Usuarios Online.
-- ==============================================================================

-- 1. COLUMNAS DE PRESENCIA EN PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_profiles_is_online_last_seen ON public.profiles(is_online, last_seen_at DESC);


-- 2. CÁLCULO DE CÓDIGO TOTP RFC 6238 (VOLATILIDAD ADECUADA)
CREATE OR REPLACE FUNCTION public.calculate_totp(
  p_secret_base32 TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_secret_bytes BYTEA;
  v_counter BIGINT;
  v_time_bytes BYTEA;
  v_hmac BYTEA;
  v_offset INT;
  v_code_int INT;
BEGIN
  v_secret_bytes := public.base32_decode(p_secret_base32);
  v_counter := floor(extract(epoch from p_timestamp) / 30)::BIGINT;

  v_time_bytes := set_byte('\x0000000000000000'::bytea, 0, ((v_counter >> 56) & 255)::int);
  v_time_bytes := set_byte(v_time_bytes, 1, ((v_counter >> 48) & 255)::int);
  v_time_bytes := set_byte(v_time_bytes, 2, ((v_counter >> 40) & 255)::int);
  v_time_bytes := set_byte(v_time_bytes, 3, ((v_counter >> 32) & 255)::int);
  v_time_bytes := set_byte(v_time_bytes, 4, ((v_counter >> 24) & 255)::int);
  v_time_bytes := set_byte(v_time_bytes, 5, ((v_counter >> 16) & 255)::int);
  v_time_bytes := set_byte(v_time_bytes, 6, ((v_counter >> 8) & 255)::int);
  v_time_bytes := set_byte(v_time_bytes, 7, (v_counter & 255)::int);

  -- Soporta hmac en public o extensions
  v_hmac := hmac(v_time_bytes, v_secret_bytes, 'sha1');
  v_offset := get_byte(v_hmac, 19) & 15;
  v_code_int := ((get_byte(v_hmac, v_offset) & 127) << 24)
              | ((get_byte(v_hmac, v_offset + 1) & 255) << 16)
              | ((get_byte(v_hmac, v_offset + 2) & 255) << 8)
              | (get_byte(v_hmac, v_offset + 3) & 255);

  RETURN lpad((v_code_int % 1000000)::text, 6, '0');
END;
$$;


-- 3. VERIFICACIÓN INTERNA DE TOTP CON VENTANA DE TOLERANCIA DE 2 PERIODOS (150 segundos)
CREATE OR REPLACE FUNCTION public.verify_totp_code_internal(
  p_secret_base32 TEXT,
  p_code TEXT,
  p_window INT DEFAULT 2
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_i INT;
  v_calc TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_clean_code TEXT;
BEGIN
  IF p_code IS NULL THEN
    RETURN FALSE;
  END IF;

  v_clean_code := regexp_replace(p_code, '\s+', '', 'g');
  IF length(v_clean_code) != 6 THEN
    RETURN FALSE;
  END IF;

  FOR v_i IN (-p_window)..p_window LOOP
    v_calc := public.calculate_totp(p_secret_base32, v_now + (v_i * interval '30 seconds'));
    IF v_calc = v_clean_code THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;


-- 4. RPC VERIFICAR CÓDIGO TOTP CON VENTANA 2 (150s)
CREATE OR REPLACE FUNCTION public.verify_totp_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_secret TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT secret_encrypted INTO v_secret
  FROM public.user_2fa_secrets
  WHERE user_id = v_user_id;

  IF v_secret IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.verify_totp_code_internal(v_secret, p_code, 2);
END;
$$;


-- 5. CORRECCIÓN DE validate_totp_for_action (FILTRO 'user_id = v_user_id')
CREATE OR REPLACE FUNCTION public.validate_totp_for_action(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_mfa_enabled BOOLEAN := FALSE;
  v_valid BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'mfa_required', true,
      'message', 'Usuario no autenticado'
    );
  END IF;

  -- CORREGIDO: Usar columna user_id de public.profiles
  SELECT is_mfa_enabled INTO v_is_mfa_enabled
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF NOT COALESCE(v_is_mfa_enabled, FALSE) THEN
    RETURN jsonb_build_object(
      'success', true,
      'mfa_required', false,
      'message', 'MFA no requerido'
    );
  END IF;

  v_valid := public.verify_totp_code(p_code);

  IF NOT v_valid THEN
    RETURN jsonb_build_object(
      'success', false,
      'mfa_required', true,
      'message', 'INVALID_TOTP_CODE: El código TOTP ingresado es incorrecto o ha expirado.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'mfa_required', true,
    'message', 'Código 2FA validado con éxito'
  );
END;
$$;


-- 6. RPC ACTUALIZAR PRESENCIA DEL USUARIO AUTENTICADO
CREATE OR REPLACE FUNCTION public.update_user_presence(p_is_online BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_online = p_is_online,
        last_seen_at = NOW(),
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;
END;
$$;


-- 7. MÉTRICAS DEL DASHBOARD DE ADMINISTRACIÓN (PRESENCIA REAL)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_users_count INT;
  v_active_users INT;
  v_connected_users INT;
  v_tables_count INT;
  v_pending_deposits INT;
  v_pending_withdrawals INT;
  v_volume NUMERIC(14,2);
  v_prizes NUMERIC(14,2);
  v_fees NUMERIC(14,2);
  v_security_alerts INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  -- Usuarios registrados totales
  SELECT COUNT(*) INTO v_users_count FROM public.profiles;

  -- Usuarios con cuenta activa
  SELECT COUNT(*) INTO v_active_users FROM public.profiles WHERE account_status = 'ACTIVE';

  -- Usuarios actualmente online (con heartbeat activo en los últimos 5 minutos)
  SELECT COUNT(*) INTO v_connected_users
  FROM public.profiles
  WHERE is_online = TRUE AND last_seen_at >= (NOW() - INTERVAL '5 minutes');

  -- Mesas de juego activas
  SELECT COUNT(*) INTO v_tables_count
  FROM public.game_tables
  WHERE status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE');

  -- Solicitudes pendientes
  SELECT COUNT(*) INTO v_pending_deposits FROM public.deposit_requests WHERE status = 'PENDING';
  SELECT COUNT(*) INTO v_pending_withdrawals FROM public.withdrawal_requests WHERE status = 'PENDING';

  -- Volúmenes financieros
  SELECT
    COALESCE(SUM(gross_pool), 0.00),
    COALESCE(SUM(prize_pool), 0.00),
    COALESCE(SUM(platform_fee), 0.00)
  INTO v_volume, v_prizes, v_fees
  FROM public.game_settlements;

  -- Alertas de seguridad
  SELECT COUNT(*) INTO v_security_alerts
  FROM public.audit_logs
  WHERE severity IN ('WARNING', 'CRITICAL');

  RETURN jsonb_build_object(
    'registeredUsersCount', v_users_count,
    'activeUsersCount', v_active_users,
    'connectedUsersCount', v_connected_users,
    'activeTablesCount', v_tables_count,
    'pendingDepositsCount', v_pending_deposits,
    'pendingWithdrawalsCount', v_pending_withdrawals,
    'totalVolumePlayed', v_volume,
    'totalPrizesAwarded', v_prizes,
    'totalServiceFeesCollected', v_fees,
    'securityAlertsCount', v_security_alerts
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.update_user_presence(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated, service_role;
