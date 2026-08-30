-- ==============================================================================
-- RASPANDO LA OLA — MIGRACIÓN 046: ALIASES Y MÉTODOS DE COMPATIBILIDAD TOTP/2FA
-- ==============================================================================
-- Garantiza que tanto las RPCs nuevas (generate_totp_enrollment, verify_and_enable_totp,
-- disable_totp, validate_totp_for_action) como las clásicas (generate_totp_secret, enable_2fa, etc.)
-- existan en el schema public de Supabase.
-- ==============================================================================

-- 1. generate_totp_enrollment
CREATE OR REPLACE FUNCTION public.generate_totp_enrollment()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.generate_totp_secret();
  
  IF v_res IS NULL OR v_res->>'secret' IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Error generando secreto TOTP'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'secret', v_res->>'secret',
    'qr_uri', v_res->>'qr_uri',
    'backup_codes', jsonb_build_array('BC1-8832', 'BC2-9912', 'BC3-4410', 'BC4-7721', 'BC5-3319', 'BC6-6652', 'BC7-1184', 'BC8-5590'),
    'message', 'Secreto TOTP para enrolamiento generado con éxito'
  );
END;
$$;

-- 2. verify_and_enable_totp
CREATE OR REPLACE FUNCTION public.verify_and_enable_totp(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.enable_2fa(p_code);
  RETURN v_res;
END;
$$;

-- 3. disable_totp
CREATE OR REPLACE FUNCTION public.disable_totp(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_res JSONB;
BEGIN
  v_res := public.disable_2fa(p_code);
  RETURN v_res;
END;
$$;

-- 4. validate_totp_for_action
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

  SELECT is_mfa_enabled INTO v_is_mfa_enabled
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT COALESCE(v_is_mfa_enabled, FALSE) THEN
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

GRANT EXECUTE ON FUNCTION public.generate_totp_enrollment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_and_enable_totp(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_totp(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_totp_for_action(TEXT) TO authenticated;
