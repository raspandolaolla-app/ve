-- ==============================================================================
-- RASPANDO LA OLA — MIGRACIÓN 048: RESILIENCIA Y VENTANA DE TOLERANCIA TOTP 2FA
-- ==============================================================================
-- 1. Actualiza la función enable_2fa para usar la ventana de tolerancia de 2 períodos (150s).
-- 2. Actualiza la función validate_2fa_if_enabled para usar la ventana de tolerancia de 2 períodos (150s).
-- 3. Asigna search_path = public, extensions, auth a todas las funciones RPC de 2FA/TOTP.
-- ==============================================================================

-- 1. ACTUALIZAR enable_2fa CON VENTANA DE 2 PERÍODOS Y BUSQUEDA DE EXTENSIONES
CREATE OR REPLACE FUNCTION public.enable_2fa(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
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
    RAISE EXCEPTION 'NO_SECRET_FOUND: Debes generar el secreto 2FA primero escaneando el código QR.';
  END IF;

  -- Usar ventana 2 (150 segundos de tolerancia)
  v_valid := public.verify_totp_code_internal(v_secret, p_code, 2);

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TOTP_CODE: El código TOTP ingresado es incorrecto o ha expirado.';
  END IF;

  UPDATE public.user_2fa_secrets
  SET is_active = TRUE, updated_at = NOW()
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET is_mfa_enabled = TRUE, updated_at = NOW()
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Autenticación en Dos Pasos (2FA) activada con éxito.'
  );
END;
$$;


-- 2. ACTUALIZAR validate_2fa_if_enabled CON VENTANA DE 2 PERÍODOS
CREATE OR REPLACE FUNCTION public.validate_2fa_if_enabled(p_user_id UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_secret TEXT;
  v_valid BOOLEAN;
  v_is_mfa_enabled BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: ID de usuario inválido';
  END IF;

  SELECT is_mfa_enabled INTO v_is_mfa_enabled
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT COALESCE(v_is_mfa_enabled, FALSE) THEN
    RETURN TRUE;
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'MFA_REQUIRED: Se requiere un código 2FA TOTP de 6 dígitos para esta operación.';
  END IF;

  SELECT secret_encrypted INTO v_secret
  FROM public.user_2fa_secrets
  WHERE user_id = p_user_id AND is_active = TRUE;

  IF v_secret IS NULL THEN
    UPDATE public.profiles SET is_mfa_enabled = FALSE WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  -- Usar ventana 2 (150 segundos de tolerancia)
  v_valid := public.verify_totp_code_internal(v_secret, p_code, 2);
  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TOTP_CODE: El código 2FA ingresado es incorrecto o ha expirado.';
  END IF;

  RETURN TRUE;
END;
$$;


-- 3. ACTUALIZAR generate_totp_secret CON search_path CORREGIDO
CREATE OR REPLACE FUNCTION public.generate_totp_secret()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_secret TEXT := '';
  v_i INT;
  v_rand INT;
  v_qr_uri TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
    v_user_email := 'usuario@raspandolaolla.com';
  END IF;

  -- Generar secret de 16 caracteres Base32
  FOR v_i IN 1..16 LOOP
    v_rand := floor(random() * 32)::int + 1;
    v_secret := v_secret || substring(v_chars FROM v_rand FOR 1);
  END LOOP;

  INSERT INTO public.user_2fa_secrets (user_id, secret_encrypted, is_active, updated_at)
  VALUES (v_user_id, v_secret, FALSE, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET secret_encrypted = v_secret,
      is_active = FALSE,
      updated_at = NOW();

  v_qr_uri := 'otpauth://totp/RaspandoLaOlla:' || v_user_email || '?secret=' || v_secret || '&issuer=RaspandoLaOlla&algorithm=SHA1&digits=6&period=30';

  RETURN jsonb_build_object(
    'secret', v_secret,
    'qr_uri', v_qr_uri,
    'email', v_user_email
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.enable_2fa(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_2fa_if_enabled(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_totp_secret() TO authenticated;
