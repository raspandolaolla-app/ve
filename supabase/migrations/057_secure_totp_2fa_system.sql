-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 057: SISTEMA 2FA / TOTP Y RECOVERY CODES COMPLETO
-- ==============================================================================
-- - Tabla user_2fa_secrets para secretos Base32, recovery_codes e intentos fallidos
-- - Autenticación TOTP (RFC 6238, SHA1, 30s) en PL/pgSQL
-- - Bloqueo anti-fuerza bruta (5 intentos fallidos consecutivas -> 15 min bloqueo)
-- - RPCs: generate_totp_secret, get_2fa_status, enable_2fa, disable_2fa, regenerate_recovery_codes
-- - RPCs de validación: validate_2fa_if_enabled, validate_admin_2fa_action
-- - Protección 2FA en retiros de jugadores y acciones administrativas sensibles
-- ==============================================================================

-- 1. Agregar columna is_mfa_enabled en public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Tabla para Almacenar Secretos TOTP 2FA y Códigos de Recuperación
CREATE TABLE IF NOT EXISTS public.user_2fa_secrets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_codes JSONB DEFAULT '[]'::jsonb,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.user_2fa_secrets ENABLE ROW LEVEL SECURITY;

-- Políticas RLS por usuario
DROP POLICY IF EXISTS "user_2fa_secrets_select_own" ON public.user_2fa_secrets;
CREATE POLICY "user_2fa_secrets_select_own" ON public.user_2fa_secrets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_2fa_secrets_update_own" ON public.user_2fa_secrets;
CREATE POLICY "user_2fa_secrets_update_own" ON public.user_2fa_secrets
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_2fa_secrets_insert_own" ON public.user_2fa_secrets;
CREATE POLICY "user_2fa_secrets_insert_own" ON public.user_2fa_secrets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_2fa_secrets_delete_own" ON public.user_2fa_secrets;
CREATE POLICY "user_2fa_secrets_delete_own" ON public.user_2fa_secrets
  FOR DELETE USING (auth.uid() = user_id);


-- 3. Función de Decodificación Base32 PL/pgSQL
CREATE OR REPLACE FUNCTION public.base32_decode(p_base32 TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT := upper(regexp_replace(p_base32, '[=\s]', '', 'g'));
  v_len INT := length(v_clean);
  v_alpha TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_bytea BYTEA := '\x'::bytea;
  v_buffer BIGINT := 0;
  v_bits INT := 0;
  v_i INT;
  v_char CHAR;
  v_val INT;
BEGIN
  FOR v_i IN 1..v_len LOOP
    v_char := substring(v_clean FROM v_i FOR 1);
    v_val := position(v_char IN v_alpha) - 1;
    IF v_val < 0 THEN
      RAISE EXCEPTION 'INVALID_BASE32_CHAR: Carácter Base32 no válido %', v_char;
    END IF;
    v_buffer := (v_buffer << 5) | v_val;
    v_bits := v_bits + 5;
    IF v_bits >= 8 THEN
      v_bits := v_bits - 8;
      v_bytea := v_bytea || set_byte('\x00'::bytea, 0, (v_buffer >> v_bits) & 255);
      v_buffer := v_buffer & ((1 << v_bits) - 1);
    END IF;
  END LOOP;
  RETURN v_bytea;
END;
$$;


-- 4. Cálculo de Código TOTP RFC 6238
CREATE OR REPLACE FUNCTION public.calculate_totp(
  p_secret_base32 TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
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

  v_hmac := public.hmac(v_time_bytes, v_secret_bytes, 'sha1');
  v_offset := get_byte(v_hmac, 19) & 15;
  v_code_int := ((get_byte(v_hmac, v_offset) & 127) << 24)
              | ((get_byte(v_hmac, v_offset + 1) & 255) << 16)
              | ((get_byte(v_hmac, v_offset + 2) & 255) << 8)
              | (get_byte(v_hmac, v_offset + 3) & 255);

  RETURN lpad((v_code_int % 1000000)::text, 6, '0');
END;
$$;


-- 5. Verificación Interna de TOTP con Ventana de Tolerancia
CREATE OR REPLACE FUNCTION public.verify_totp_code_internal(
  p_secret_base32 TEXT,
  p_code TEXT,
  p_window INT DEFAULT 1
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


-- 6. Verificación Interna de Código de Recuperación
CREATE OR REPLACE FUNCTION public.verify_recovery_code_internal(
  p_user_id UUID,
  p_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean_code TEXT;
  v_code_hash TEXT;
  v_codes JSONB;
  v_item JSONB;
  v_new_codes JSONB := '[]'::jsonb;
  v_found BOOLEAN := FALSE;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) < 6 THEN
    RETURN FALSE;
  END IF;

  -- Normalizar código de recuperación (mayúsculas sin espacios/guiones)
  v_clean_code := upper(regexp_replace(trim(p_code), '[\s\-]', '', 'g'));
  v_code_hash := encode(digest(v_clean_code, 'sha256'), 'hex');

  SELECT recovery_codes INTO v_codes
  FROM public.user_2fa_secrets
  WHERE user_id = p_user_id AND is_active = TRUE;

  IF v_codes IS NULL OR jsonb_array_length(v_codes) = 0 THEN
    RETURN FALSE;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_codes) LOOP
    IF (v_item->>'code_hash') = v_code_hash AND (v_item->>'used')::boolean = FALSE THEN
      v_found := TRUE;
      -- Marcar como usado
      v_new_codes := v_new_codes || jsonb_build_object(
        'code_hash', v_item->>'code_hash',
        'used', true,
        'used_at', NOW()
      );
    ELSE
      v_new_codes := v_new_codes || v_item;
    END IF;
  END LOOP;

  IF v_found THEN
    UPDATE public.user_2fa_secrets
    SET recovery_codes = v_new_codes, updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  RETURN v_found;
END;
$$;


-- 7. Generación Interna de 8 Códigos de Recuperación
CREATE OR REPLACE FUNCTION public.generate_recovery_codes_internal(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_raw_codes TEXT[] := ARRAY[]::TEXT[];
  v_json_codes JSONB := '[]'::jsonb;
  v_code TEXT;
  v_clean_code TEXT;
  v_code_hash TEXT;
  v_i INT;
  v_j INT;
  v_rand INT;
BEGIN
  FOR v_i IN 1..8 LOOP
    v_code := '';
    FOR v_j IN 1..8 LOOP
      IF v_j = 5 THEN
        v_code := v_code || '-';
      END IF;
      v_rand := floor(random() * 32)::int + 1;
      v_code := v_code || substring(v_chars FROM v_rand FOR 1);
    END LOOP;

    v_raw_codes := array_append(v_raw_codes, v_code);
    v_clean_code := upper(regexp_replace(v_code, '[\s\-]', '', 'g'));
    v_code_hash := encode(digest(v_clean_code, 'sha256'), 'hex');
    v_json_codes := v_json_codes || jsonb_build_object(
      'code_hash', v_code_hash,
      'used', false
    );
  END LOOP;

  UPDATE public.user_2fa_secrets
  SET recovery_codes = v_json_codes, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN v_raw_codes;
END;
$$;


-- 8. RPC GENERAR SECRETO 2FA TOTP Y QR URI
CREATE OR REPLACE FUNCTION public.generate_totp_secret()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
  IF v_user_email IS NULL OR length(v_user_email) = 0 THEN
    SELECT email INTO v_user_email FROM public.profiles WHERE user_id = v_user_id OR id = v_user_id;
  END IF;
  IF v_user_email IS NULL THEN
    v_user_email := 'usuario@raspandolaolla.com';
  END IF;

  -- Generar secret de 16 caracteres Base32
  FOR v_i IN 1..16 LOOP
    v_rand := floor(random() * 32)::int + 1;
    v_secret := v_secret || substring(v_chars FROM v_rand FOR 1);
  END LOOP;

  INSERT INTO public.user_2fa_secrets (user_id, secret_encrypted, is_active, failed_attempts, locked_until, updated_at)
  VALUES (v_user_id, v_secret, FALSE, 0, NULL, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET secret_encrypted = v_secret,
      is_active = FALSE,
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = NOW();

  v_qr_uri := 'otpauth://totp/RaspandoLaOlla:' || v_user_email || '?secret=' || v_secret || '&issuer=RaspandoLaOlla&algorithm=SHA1&digits=6&period=30';

  RETURN jsonb_build_object(
    'secret', v_secret,
    'qr_uri', v_qr_uri,
    'email', v_user_email
  );
END;
$$;


-- 9. RPC OBTENER ESTADO 2FA
CREATE OR REPLACE FUNCTION public.get_2fa_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mfa_enabled BOOLEAN := FALSE;
  v_has_secret BOOLEAN := FALSE;
  v_locked_until TIMESTAMPTZ := NULL;
  v_is_locked BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('is_enabled', false, 'has_secret', false, 'is_locked', false);
  END IF;

  SELECT COALESCE(is_mfa_enabled, FALSE) INTO v_mfa_enabled
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id;

  SELECT is_active, (locked_until IS NOT NULL AND locked_until > NOW()), locked_until
  INTO v_has_secret, v_is_locked, v_locked_until
  FROM public.user_2fa_secrets
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'is_enabled', COALESCE(v_mfa_enabled, false),
    'has_secret', COALESCE(v_has_secret, false),
    'is_locked', COALESCE(v_is_locked, false),
    'locked_until', v_locked_until
  );
END;
$$;


-- 10. RPC ACTIVAR 2FA TOTP
CREATE OR REPLACE FUNCTION public.enable_2fa(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sec_record RECORD;
  v_valid BOOLEAN;
  v_recovery_codes TEXT[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  SELECT * INTO v_sec_record
  FROM public.user_2fa_secrets
  WHERE user_id = v_user_id;

  IF v_sec_record.secret_encrypted IS NULL THEN
    RAISE EXCEPTION 'NO_SECRET_FOUND: Debes generar la configuración 2FA primero.';
  END IF;

  IF v_sec_record.locked_until IS NOT NULL AND v_sec_record.locked_until > NOW() THEN
    RAISE EXCEPTION 'MFA_LOCKED: Demasiados intentos fallidos. Intente nuevamente después de %', v_sec_record.locked_until;
  END IF;

  v_valid := public.verify_totp_code_internal(v_sec_record.secret_encrypted, p_code, 1);

  IF NOT v_valid THEN
    UPDATE public.user_2fa_secrets
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    IF v_sec_record.failed_attempts + 1 >= 5 THEN
      INSERT INTO public.security_events (user_id, event_type, severity, details)
      VALUES (v_user_id, '2FA_BRUTE_FORCE_LOCK', 'CRITICAL', 'Bloqueo temporal de 2FA por 5 intentos fallidos consecutivos al activar.');
      RAISE EXCEPTION 'MFA_LOCKED: Demasiados intentos fallidos. La activación 2FA ha sido bloqueada por 15 minutos.';
    END IF;

    RAISE EXCEPTION 'INVALID_TOTP_CODE: El código 2FA ingresado es incorrecto o ha expirado.';
  END IF;

  -- Resetear intentos fallidos y activar
  UPDATE public.user_2fa_secrets
  SET is_active = TRUE, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET is_mfa_enabled = TRUE, updated_at = NOW()
  WHERE user_id = v_user_id OR id = v_user_id;

  -- Generar 8 códigos de recuperación de emergencia
  v_recovery_codes := public.generate_recovery_codes_internal(v_user_id);

  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (v_user_id, '2FA_ACTIVATED', 'user_2fa_secrets', jsonb_build_object('event', 'Autenticación 2FA activada con éxito'));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Autenticación en Dos Pasos (2FA) activada con éxito.',
    'recovery_codes', to_jsonb(v_recovery_codes)
  );
END;
$$;


-- 11. RPC DESACTIVAR 2FA TOTP
CREATE OR REPLACE FUNCTION public.disable_2fa(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sec_record RECORD;
  v_valid BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  SELECT * INTO v_sec_record
  FROM public.user_2fa_secrets
  WHERE user_id = v_user_id AND is_active = TRUE;

  IF v_sec_record.secret_encrypted IS NULL THEN
    UPDATE public.profiles SET is_mfa_enabled = FALSE WHERE user_id = v_user_id OR id = v_user_id;
    RETURN jsonb_build_object('success', true, 'message', '2FA ya se encontraba desactivado.');
  END IF;

  IF v_sec_record.locked_until IS NOT NULL AND v_sec_record.locked_until > NOW() THEN
    RAISE EXCEPTION 'MFA_LOCKED: Demasiados intentos fallidos. Intente nuevamente en unos minutos.';
  END IF;

  -- Validar TOTP o Código de recuperación
  v_valid := public.verify_totp_code_internal(v_sec_record.secret_encrypted, p_code, 1);
  IF NOT v_valid THEN
    v_valid := public.verify_recovery_code_internal(v_user_id, p_code);
  END IF;

  IF NOT v_valid THEN
    UPDATE public.user_2fa_secrets
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    RAISE EXCEPTION 'INVALID_TOTP_CODE: Código 2FA o de recuperación incorrecto.';
  END IF;

  UPDATE public.user_2fa_secrets
  SET is_active = FALSE, recovery_codes = '[]'::jsonb, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET is_mfa_enabled = FALSE, updated_at = NOW()
  WHERE user_id = v_user_id OR id = v_user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (v_user_id, '2FA_DISABLED', 'user_2fa_secrets', jsonb_build_object('event', 'Autenticación 2FA desactivada'));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Autenticación en Dos Pasos (2FA) desactivada correctamente.'
  );
END;
$$;


-- 12. RPC REGENERAR CÓDIGOS DE RECUPERACIÓN
CREATE OR REPLACE FUNCTION public.regenerate_recovery_codes(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sec_record RECORD;
  v_valid BOOLEAN := FALSE;
  v_new_codes TEXT[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  SELECT * INTO v_sec_record
  FROM public.user_2fa_secrets
  WHERE user_id = v_user_id AND is_active = TRUE;

  IF v_sec_record.secret_encrypted IS NULL THEN
    RAISE EXCEPTION '2FA_NOT_ENABLED: Debes tener 2FA activado para regenerar códigos de recuperación.';
  END IF;

  IF v_sec_record.locked_until IS NOT NULL AND v_sec_record.locked_until > NOW() THEN
    RAISE EXCEPTION 'MFA_LOCKED: Intente nuevamente en unos minutos.';
  END IF;

  v_valid := public.verify_totp_code_internal(v_sec_record.secret_encrypted, p_code, 1);
  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TOTP_CODE: Código 2FA TOTP incorrecto.';
  END IF;

  v_new_codes := public.generate_recovery_codes_internal(v_user_id);

  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (v_user_id, 'RECOVERY_CODES_REGENERATED', 'user_2fa_secrets', jsonb_build_object('event', 'Nuevos códigos de recuperación generados'));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Códigos de recuperación regenerados con éxito.',
    'recovery_codes', to_jsonb(v_new_codes)
  );
END;
$$;


-- 13. RPC VALIDAR 2FA SI ESTÁ HABILITADO EN OPERACIONES
CREATE OR REPLACE FUNCTION public.validate_2fa_if_enabled(
  p_user_id UUID,
  p_code TEXT DEFAULT NULL,
  p_action_name TEXT DEFAULT 'GENERAL'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_mfa_enabled BOOLEAN := FALSE;
  v_sec_record RECORD;
  v_valid BOOLEAN := FALSE;
BEGIN
  SELECT COALESCE(is_mfa_enabled, FALSE) INTO v_mfa_enabled
  FROM public.profiles
  WHERE user_id = p_user_id OR id = p_user_id;

  IF NOT v_mfa_enabled THEN
    RETURN TRUE;
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'MFA_REQUIRED: Se requiere un código 2FA TOTP de 6 dígitos para confirmar esta operación.';
  END IF;

  SELECT * INTO v_sec_record
  FROM public.user_2fa_secrets
  WHERE user_id = p_user_id AND is_active = TRUE;

  IF v_sec_record.secret_encrypted IS NULL THEN
    UPDATE public.profiles SET is_mfa_enabled = FALSE WHERE user_id = p_user_id OR id = p_user_id;
    RETURN TRUE;
  END IF;

  IF v_sec_record.locked_until IS NOT NULL AND v_sec_record.locked_until > NOW() THEN
    RAISE EXCEPTION 'MFA_LOCKED: Demasiados intentos 2FA fallidos. Intente nuevamente en unos minutos.';
  END IF;

  -- 1. Intentar validar como TOTP
  v_valid := public.verify_totp_code_internal(v_sec_record.secret_encrypted, p_code, 1);

  -- 2. Si falla TOTP, intentar código de recuperación
  IF NOT v_valid THEN
    v_valid := public.verify_recovery_code_internal(p_user_id, p_code);
  END IF;

  IF NOT v_valid THEN
    UPDATE public.user_2fa_secrets
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    IF v_sec_record.failed_attempts + 1 >= 5 THEN
      INSERT INTO public.security_events (user_id, event_type, severity, details)
      VALUES (p_user_id, '2FA_BRUTE_FORCE_LOCK', 'CRITICAL', 'Bloqueo temporal de 2FA por 5 intentos fallidos en acción: ' || p_action_name);
      RAISE EXCEPTION 'MFA_LOCKED: Demasiados intentos fallidos. La verificación 2FA se ha bloqueado por 15 minutos.';
    END IF;

    RAISE EXCEPTION 'INVALID_TOTP_CODE: Código 2FA o de recuperación incorrecto o expirado.';
  END IF;

  -- Resetear intentos fallidos tras éxito
  UPDATE public.user_2fa_secrets
  SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO public.audit_logs (actor_id, action, target_table, new_data)
  VALUES (p_user_id, '2FA_ACTION_VERIFIED', 'user_2fa_secrets', jsonb_build_object('action_name', p_action_name));

  RETURN TRUE;
END;
$$;


-- 14. RPC VALIDAR ACCIÓN ADMINISTRATIVA SENSIBLE CON 2FA
CREATE OR REPLACE FUNCTION public.validate_admin_2fa_action(
  p_totp_code TEXT,
  p_action_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_mfa_enabled BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_role NOT IN ('ADMIN', 'SUPER_ADMIN', 'OPERATOR') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Solamente Administradores y Operadores pueden ejecutar esta acción.';
  END IF;

  SELECT COALESCE(is_mfa_enabled, FALSE) INTO v_mfa_enabled
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id;

  IF NOT v_mfa_enabled THEN
    RAISE EXCEPTION 'MFA_SETUP_REQUIRED: Para realizar acciones administrativas sensibles debes configurar la autenticación de dos factores (2FA) en tu perfil.';
  END IF;

  IF p_totp_code IS NULL OR length(trim(p_totp_code)) = 0 THEN
    RAISE EXCEPTION 'MFA_CODE_REQUIRED: Se requiere tu código 2FA TOTP de 6 dígitos para autorizar esta acción administrativa.';
  END IF;

  PERFORM public.validate_2fa_if_enabled(v_user_id, p_totp_code, 'ADMIN_' || p_action_name);

  RETURN jsonb_build_object(
    'success', true,
    'authorized_action', p_action_name,
    'timestamp', NOW()
  );
END;
$$;


-- 15. RPC SOLICITUD DE RETIRO CON VERIFICACIÓN 2FA ATÓMICA
CREATE OR REPLACE FUNCTION public.request_withdrawal_locked(
  p_payment_account_id UUID,
  p_amount NUMERIC,
  p_idempotency_key VARCHAR,
  p_totp_code VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_user_role VARCHAR(50);
  v_profile RECORD;
  v_wallet RECORD;
  v_account RECORD;
  v_existing_req RECORD;
  v_request_id UUID;
  v_ledger_id UUID;
BEGIN
  -- 1. Verificación de Autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  -- 2. BLOQUEO ABSOLUTO PARA ROLES TÉCNICOS
  SELECT role::text INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role IN ('ADMIN', 'SUPER_ADMIN', 'OPERATOR') THEN
    RAISE EXCEPTION 'OPERACION_DENEGADA: Los usuarios con rol Administrador u Operador no tienen permitido solicitar retiros de la plataforma.';
  END IF;

  -- 3. Verificación de Perfil y 2FA/MFA
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil no encontrado';
  END IF;

  -- Validación 2FA si el jugador lo tiene activado
  IF COALESCE(v_profile.is_mfa_enabled, FALSE) THEN
    PERFORM public.validate_2fa_if_enabled(v_user_id, p_totp_code, 'WITHDRAWAL_REQUEST');
  END IF;

  -- 4. Verificación de Estatus KYC y Cuenta
  IF v_profile.account_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE: La cuenta no está activa para retiros';
  END IF;

  IF v_profile.kyc_status NOT IN ('APPROVED', 'VERIFIED') THEN
    RAISE EXCEPTION 'KYC_NOT_APPROVED: Se requiere verificación de identidad (KYC) aprobada para solicitar retiros.';
  END IF;

  -- 5. Verificación de Monto Mínimo
  IF p_amount < 100.00 THEN
    RAISE EXCEPTION 'MIN_WITHDRAWAL_NOT_MET: El monto mínimo de retiro es 100.00 Bs.';
  END IF;

  -- 6. Verificación de Cuenta de Pago Destino
  SELECT * INTO v_account
  FROM public.payment_accounts
  WHERE id = p_payment_account_id AND user_id = v_user_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ACCOUNT_INVALID: Cuenta bancaria destino no válida o no pertenece al usuario';
  END IF;

  -- 7. Idempotencia: Verificar si la solicitud ya existe
  SELECT * INTO v_existing_req
  FROM public.withdrawal_requests
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'withdrawal_id', v_existing_req.id,
      'held_amount', v_existing_req.amount,
      'message', 'Solicitud de retiro procesada previamente (Idempotente).'
    );
  END IF;

  -- 8. Obtener y Bloquear Billetera del Usuario
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera del usuario no encontrada';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente para este retiro.';
  END IF;

  -- 9. Retención Atómica de Fondos en Wallet
  UPDATE public.wallets
  SET 
    available_balance = available_balance - p_amount,
    held_balance = held_balance + p_amount,
    updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 10. Registrar Asiento Contable
  INSERT INTO public.ledger_entries (
    user_id,
    entry_type,
    amount,
    balance_before_available,
    balance_after_available,
    balance_before_held,
    balance_after_held,
    description,
    idempotency_key
  ) VALUES (
    v_user_id,
    'WITHDRAWAL_HOLD',
    p_amount,
    v_wallet.available_balance,
    v_wallet.available_balance - p_amount,
    v_wallet.held_balance,
    v_wallet.held_balance + p_amount,
    'Retención de fondos para solicitud de retiro Pago Móvil',
    p_idempotency_key || '_ledger'
  ) RETURNING id INTO v_ledger_id;

  -- 11. Crear Registro de Solicitud de Retiro
  INSERT INTO public.withdrawal_requests (
    user_id,
    payment_account_id,
    amount,
    status,
    idempotency_key,
    ledger_entry_id
  ) VALUES (
    v_user_id,
    p_payment_account_id,
    p_amount,
    'PENDING',
    p_idempotency_key,
    v_ledger_id
  ) RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_request_id,
    'held_amount', p_amount,
    'remaining_available', v_wallet.available_balance - p_amount,
    'message', 'Solicitud de retiro registrada y procesada en retención exitosamente.'
  );
END;
$$;


-- 16. RPC COMPLETAR RETIROS CON VALIDACIÓN 2FA DE OPERADOR
CREATE OR REPLACE FUNCTION public.process_withdrawal_completion(
  p_withdrawal_id UUID,
  p_bank_reference VARCHAR,
  p_idempotency_key VARCHAR,
  p_totp_code VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID;
  v_withdrawal RECORD;
  v_wallet RECORD;
  v_ledger_id UUID;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL OR NOT public.is_operator_or_above(v_operator_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  -- Validar 2FA del operador para esta acción sensible
  PERFORM public.validate_admin_2fa_action(p_totp_code, 'WITHDRAWAL_COMPLETION');

  SELECT * INTO v_withdrawal
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND: Solicitud de retiro no encontrada';
  END IF;

  IF v_withdrawal.status != 'PENDING' AND v_withdrawal.status != 'PROCESSING' THEN
    RAISE EXCEPTION 'INVALID_WITHDRAWAL_STATUS: La solicitud ya fue procesada (estado: %)', v_withdrawal.status;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  UPDATE public.wallets
  SET 
    held_balance = held_balance - v_withdrawal.amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  v_ledger_id := gen_random_uuid();
  INSERT INTO public.ledger_entries (
    id,
    wallet_id,
    user_id,
    entry_type,
    direction,
    amount,
    balance_after_available,
    balance_after_held,
    reference_table,
    reference_id,
    idempotency_key,
    description,
    actor_id
  ) VALUES (
    v_ledger_id,
    v_wallet.id,
    v_withdrawal.user_id,
    'WITHDRAWAL_CAPTURE',
    'DEBIT',
    v_withdrawal.amount,
    v_wallet.available_balance,
    v_wallet.held_balance - v_withdrawal.amount,
    'withdrawal_requests',
    p_withdrawal_id,
    p_idempotency_key,
    'Débito definitivo por retiro completado ref: ' || p_bank_reference,
    v_operator_id
  );

  UPDATE public.withdrawal_requests
  SET 
    status = 'COMPLETED',
    bank_reference = p_bank_reference,
    processed_by = v_operator_id,
    completed_at = NOW()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', 'COMPLETED',
    'bank_reference', p_bank_reference
  );
END;
$$;


-- 17. RPC RECHAZAR RETIROS CON VALIDACIÓN 2FA DE OPERADOR
CREATE OR REPLACE FUNCTION public.process_withdrawal_rejection(
  p_withdrawal_id UUID,
  p_rejection_reason TEXT,
  p_idempotency_key VARCHAR,
  p_totp_code VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID;
  v_withdrawal RECORD;
  v_wallet RECORD;
  v_ledger_id UUID;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL OR NOT public.is_operator_or_above(v_operator_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  -- Validar 2FA del operador para esta acción sensible
  PERFORM public.validate_admin_2fa_action(p_totp_code, 'WITHDRAWAL_REJECTION');

  SELECT * INTO v_withdrawal
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND: Solicitud de retiro no encontrada';
  END IF;

  IF v_withdrawal.status != 'PENDING' AND v_withdrawal.status != 'PROCESSING' THEN
    RAISE EXCEPTION 'INVALID_WITHDRAWAL_STATUS: La solicitud ya fue procesada (estado: %)', v_withdrawal.status;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  UPDATE public.wallets
  SET 
    available_balance = available_balance + v_withdrawal.amount,
    held_balance = held_balance - v_withdrawal.amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  v_ledger_id := gen_random_uuid();
  INSERT INTO public.ledger_entries (
    id,
    wallet_id,
    user_id,
    entry_type,
    direction,
    amount,
    balance_after_available,
    balance_after_held,
    reference_table,
    reference_id,
    idempotency_key,
    description,
    actor_id
  ) VALUES (
    v_ledger_id,
    v_wallet.id,
    v_withdrawal.user_id,
    'WITHDRAWAL_RELEASE',
    'CREDIT',
    v_withdrawal.amount,
    v_wallet.available_balance + v_withdrawal.amount,
    v_wallet.held_balance - v_withdrawal.amount,
    'withdrawal_requests',
    p_withdrawal_id,
    p_idempotency_key,
    'Liberación de fondos por retiro rechazado: ' || COALESCE(p_rejection_reason, 'Sin motivo especificado'),
    v_operator_id
  );

  UPDATE public.withdrawal_requests
  SET 
    status = 'REJECTED',
    rejection_reason = p_rejection_reason,
    processed_by = v_operator_id,
    completed_at = NOW()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', 'REJECTED'
  );
END;
$$;


-- 18. PERMISOS DE EJECUCIÓN GRANTED
GRANT EXECUTE ON FUNCTION public.generate_totp_secret() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_2fa_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_2fa(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_2fa(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_recovery_codes(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_2fa_if_enabled(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_admin_2fa_action(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal_locked(UUID, NUMERIC, VARCHAR, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_completion(UUID, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_rejection(UUID, TEXT, VARCHAR, VARCHAR) TO authenticated, service_role;
