-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 047: CORRECCIÓN DE BÚSQUEDA PROFILES USER_ID EN TOTP
-- ==============================================================================
-- 1. Corrige la consulta en validate_totp_for_action (de 'WHERE id = v_user_id' a 'WHERE user_id = v_user_id').
-- 2. Aumenta la ventana de tolerancia de tiempo de TOTP (p_window) a 2 (±60s) para mitigar desincronizaciones de reloj.
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

-- 2. Corrección de validate_totp_for_action (WHERE user_id = v_user_id)
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
  WHERE user_id = v_user_id;

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
GRANT EXECUTE ON FUNCTION public.validate_totp_for_action(TEXT) TO authenticated;
