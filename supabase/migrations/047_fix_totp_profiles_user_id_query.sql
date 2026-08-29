-- ==============================================================================
-- RASPANDO LA OLA — MIGRACIÓN 047: CORRECCIÓN DE BÚSQUEDA PROFILES USER_ID Y TOLERANCIA EN TOTP
-- ==============================================================================
-- 1. Corrige la consulta en validate_totp_for_action, enable_2fa, disable_2fa.
-- 2. Aumenta la ventana de tolerancia de tiempo de TOTP (p_window = 2 => ±60s) en todas las RPCs.
-- ==============================================================================

-- 1. Actualización de verify_totp_code_internal con ventana por defecto de 2 (±60s)
CREATE OR REPLACE FUNCTION public.verify_totp_code_internal(
  p_secret_base32 TEXT,
  p_code TEXT,
  p_window INT DEFAULT 2
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_i INT;
  v_calc TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) != 6 THEN
    RETURN FALSE;
  END IF;

  FOR v_i IN (-p_window)..p_window LOOP
    v_calc := public.calculate_totp(p_secret_base32, v_now + (v_i * interval '30 seconds'));
    IF v_calc = trim(p_code) THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;

-- 2. Actualización de verify_totp_code con p_window = 2
CREATE OR REPLACE FUNCTION public.verify_totp_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

-- 3. Actualización de enable_2fa con ventana 2 y conciliación de user_id / id en profiles
CREATE OR REPLACE FUNCTION public.enable_2fa(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_secret TEXT;
  v_valid BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  SELECT secret_encrypted INTO v_secret
  FROM public.user_2fa_secrets
  WHERE user_id = v_user_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'NO_SECRET_FOUND: Debes generar el secreto 2FA primero';
  END IF;

  v_valid := public.verify_totp_code_internal(v_secret, p_code, 2);

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TOTP_CODE: El código TOTP ingresado es incorrecto o ha expirado.';
  END IF;

  UPDATE public.user_2fa_secrets
  SET is_active = TRUE, updated_at = NOW()
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET is_mfa_enabled = TRUE, updated_at = NOW()
  WHERE user_id = v_user_id OR id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Autenticación en Dos Pasos (2FA) activada con éxito.'
  );
END;
$$;

-- 4. Actualización de disable_2fa con ventana 2 y conciliación de user_id / id en profiles
CREATE OR REPLACE FUNCTION public.disable_2fa(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_secret TEXT;
  v_valid BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  SELECT secret_encrypted INTO v_secret
  FROM public.user_2fa_secrets
  WHERE user_id = v_user_id AND is_active = TRUE;

  IF v_secret IS NULL THEN
    UPDATE public.profiles SET is_mfa_enabled = FALSE WHERE user_id = v_user_id OR id = v_user_id;
    RETURN jsonb_build_object('success', true, 'message', '2FA ya se encontraba desactivado.');
  END IF;

  v_valid := public.verify_totp_code_internal(v_secret, p_code, 2);

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TOTP_CODE: El código TOTP ingresado es incorrecto.';
  END IF;

  UPDATE public.user_2fa_secrets
  SET is_active = FALSE, updated_at = NOW()
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET is_mfa_enabled = FALSE, updated_at = NOW()
  WHERE user_id = v_user_id OR id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Autenticación en Dos Pasos (2FA) desactivada correctamente.'
  );
END;
$$;

-- 5. Corrección de validate_totp_for_action (WHERE user_id = v_user_id OR id = v_user_id)
CREATE OR REPLACE FUNCTION public.validate_totp_for_action(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

  SELECT COALESCE(is_mfa_enabled, FALSE) INTO v_is_mfa_enabled
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id;

  IF NOT v_is_mfa_enabled THEN
    RETURN jsonb_build_object(
      'success', true,
      'mfa_required', false,
      'message', 'MFA no requerido'
    );
  END IF;

  v_valid := public.verify_totp_code(p_code);

  IF v_valid THEN
    RETURN jsonb_build_object(
      'success', true,
      'mfa_required', true,
      'message', 'Código TOTP verificado con éxito'
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'mfa_required', true,
      'message', 'Código TOTP inválido o expirado'
    );
  END IF;
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.verify_totp_code_internal(TEXT, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_totp_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_2fa(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_2fa(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_totp_for_action(TEXT) TO authenticated;

