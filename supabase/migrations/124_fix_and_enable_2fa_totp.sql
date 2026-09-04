-- ==============================================================================
-- MIGRACIÓN 124: FIX DEFINITIVO Y ACTIVACIÓN BLINDADA DE 2FA TOTP
-- ==============================================================================

-- 0. LIMPIEZA DE FUNCIONES PREVIAS (Soluciona el error 42P13 de cambio de nombre de parámetro)
DROP FUNCTION IF EXISTS public.setup_2fa_for_user(UUID);
DROP FUNCTION IF EXISTS public.save_2fa_secret(UUID, TEXT);
DROP FUNCTION IF EXISTS public.verify_2fa_code(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_2fa_status();
DROP FUNCTION IF EXISTS public.disable_2fa(TEXT);
DROP FUNCTION IF EXISTS public.enable_2fa(TEXT);
DROP FUNCTION IF EXISTS public.generate_totp_secret();
DROP FUNCTION IF EXISTS public.regenerate_recovery_codes(TEXT);
DROP FUNCTION IF EXISTS public.calculate_totp(TEXT, INT);
DROP FUNCTION IF EXISTS public.base32_decode(TEXT);

-- 1. Forzar habilitación de pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

-- 2. Asegurar estructura de la tabla
CREATE TABLE IF NOT EXISTS public.user_2fa_secrets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_base32 TEXT,
  secret TEXT,
  secret_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_codes JSONB DEFAULT '[]'::jsonb,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_2fa_secrets' AND column_name = 'secret_base32') THEN
    ALTER TABLE public.user_2fa_secrets ADD COLUMN secret_base32 TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_2fa_secrets' AND column_name = 'secret') THEN
    ALTER TABLE public.user_2fa_secrets ADD COLUMN secret TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_2fa_secrets' AND column_name = 'secret_encrypted') THEN
    ALTER TABLE public.user_2fa_secrets ADD COLUMN secret_encrypted TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_2fa_secrets' AND column_name = 'recovery_codes') THEN
    ALTER TABLE public.user_2fa_secrets ADD COLUMN recovery_codes JSONB DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_2fa_secrets' AND column_name = 'failed_attempts') THEN
    ALTER TABLE public.user_2fa_secrets ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_2fa_secrets' AND column_name = 'locked_until') THEN
    ALTER TABLE public.user_2fa_secrets ADD COLUMN locked_until TIMESTAMPTZ DEFAULT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_mfa_enabled') THEN
      ALTER TABLE public.profiles ADD COLUMN is_mfa_enabled BOOLEAN DEFAULT FALSE;
    END IF;
  END IF;
END $$;

-- 3. RLS y Políticas
ALTER TABLE public.user_2fa_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_2fa_secrets_select_own" ON public.user_2fa_secrets;
CREATE POLICY "user_2fa_secrets_select_own" ON public.user_2fa_secrets FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_2fa_secrets_mod_own" ON public.user_2fa_secrets;
CREATE POLICY "user_2fa_secrets_mod_own" ON public.user_2fa_secrets FOR ALL USING (auth.uid() = user_id);

-- 4. Función auxiliar: Decodificador Base32 a BYTEA (Con casteos ::INTEGER explícitos para evitar error 118)
CREATE OR REPLACE FUNCTION public.base32_decode(b32 TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_result BYTEA := '\x'::bytea;
  v_buffer BIGINT := 0;
  v_bits INT := 0;
  v_char TEXT;
  v_val INT;
  i INT;
BEGIN
  b32 := UPPER(REPLACE(REPLACE(b32, '=', ''), ' ', ''));
  FOR i IN 1..LENGTH(b32) LOOP
    v_char := SUBSTRING(b32 FROM i FOR 1);
    v_val := CASE 
      WHEN v_char BETWEEN 'A' AND 'Z' THEN ASCII(v_char) - 65
      WHEN v_char BETWEEN '2' AND '7' THEN ASCII(v_char) - 24
      ELSE 0
    END;
    v_buffer := (v_buffer << 5) + v_val;
    v_bits := v_bits + 5;
    IF v_bits >= 8 THEN
      v_bits := v_bits - 8;
      -- CASTEO EXPLÍCITO A INTEGER PARA EVITAR ERROR set_byte(bytea, integer, bigint)
      v_result := v_result || set_byte('\x00'::bytea, 0, ((v_buffer >> v_bits) & 255)::INTEGER);
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

-- 5. Función auxiliar: Cálculo TOTP (Con casteos explícitos para evitar error hmac unknown)
CREATE OR REPLACE FUNCTION public.calculate_totp(p_secret_base32 TEXT, p_offset INT DEFAULT 0)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_secret_bytea BYTEA;
  v_time_step BIGINT;
  v_time_bytea BYTEA;
  v_hmac BYTEA;
  v_offset_val INT;
  v_code INT;
BEGIN
  v_secret_bytea := public.base32_decode(p_secret_base32);
  v_time_step := floor(extract(epoch from now()) / 30)::BIGINT + p_offset;
  v_time_bytea := decode(lpad(to_hex(v_time_step), 16, '0'), 'hex');
  
  -- CASTEO EXPLÍCITO 'sha1'::TEXT PARA EVITAR ERROR hmac(bytea, bytea, unknown)
  v_hmac := hmac(v_time_bytea, v_secret_bytea, 'sha1'::TEXT);
  
  v_offset_val := get_byte(v_hmac, 19) & 15;
  
  -- CASTEOS EXPLÍCITOS ::INTEGER EN CADA OPERACIÓN DE BITS
  v_code := (
    ((get_byte(v_hmac, v_offset_val) & 127)::INTEGER << 24) |
    (get_byte(v_hmac, v_offset_val + 1)::INTEGER << 16) |
    (get_byte(v_hmac, v_offset_val + 2)::INTEGER << 8) |
    get_byte(v_hmac, v_offset_val + 3)::INTEGER
  ) % 1000000;
  
  RETURN lpad(v_code::TEXT, 6, '0');
END;
$$;

-- 6. Función RPC: Generar Secreto
CREATE OR REPLACE FUNCTION public.setup_2fa_for_user(p_user_id UUID DEFAULT auth.uid())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_random_bytes BYTEA;
  v_secret TEXT;
  v_qr_url TEXT;
  v_email TEXT;
  i INT;
  v_val INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: Usuario no autenticado';
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() != v_user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: Permiso denegado';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  v_random_bytes := gen_random_bytes(20);
  v_secret := '';
  
  FOR i IN 0..19 LOOP
    v_val := get_byte(v_random_bytes, i) & 31;
    v_secret := v_secret || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', v_val + 1, 1);
  END LOOP;
  v_secret := SUBSTRING(v_secret FROM 1 FOR 32);

  v_qr_url := 'otpauth://totp/RaspandoLaOlla:' || COALESCE(v_email, 'usuario') || '?secret=' || v_secret || '&issuer=RaspandoLaOlla&algorithm=SHA1&digits=6&period=30';

  INSERT INTO public.user_2fa_secrets (user_id, secret_base32, secret, secret_encrypted, is_active, failed_attempts, updated_at)
  VALUES (v_user_id, v_secret, v_secret, v_secret, FALSE, 0, NOW())
  ON CONFLICT (user_id) DO UPDATE 
  SET secret_base32 = EXCLUDED.secret_base32,
      secret = EXCLUDED.secret,
      secret_encrypted = EXCLUDED.secret_encrypted,
      is_active = FALSE,
      failed_attempts = 0,
      updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'secret', v_secret,
    'secret_base32', v_secret,
    'qr_url', v_qr_url,
    'email', COALESCE(v_email, ''),
    'message', 'Secreto 2FA generado.'
  );
END;
$$;

-- 7. Función RPC: Verificar Código TOTP (VALIDACIÓN CRIPTOGRÁFICA REAL)
CREATE OR REPLACE FUNCTION public.verify_2fa_code(p_user_id UUID DEFAULT auth.uid(), p_code TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_clean_code TEXT := UPPER(TRIM(p_code));
  v_secret TEXT;
  v_locked_until TIMESTAMPTZ;
  v_failed_attempts INT;
  v_recovery_codes JSONB;
  v_generated_code TEXT;
  i INT;
  v_code_candidate TEXT;
  v_gen_codes TEXT[];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'NO_AUTORIZADO'; END IF;

  SELECT COALESCE(secret_base32, secret), locked_until, failed_attempts, recovery_codes
  INTO v_secret, v_locked_until, v_failed_attempts, v_recovery_codes
  FROM public.user_2fa_secrets WHERE user_id = v_user_id;

  IF v_secret IS NULL THEN
    RETURN jsonb_build_object('success', false, 'verified', false, 'message', 'No hay 2FA configurado.');
  END IF;

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN jsonb_build_object('success', false, 'verified', false, 'locked', true, 'message', 'Bloqueado por 10 minutos.');
  END IF;

  -- 1. Verificar si es un código de recuperación
  IF v_recovery_codes IS NOT NULL AND jsonb_array_length(v_recovery_codes) > 0 THEN
    FOR i IN 0..jsonb_array_length(v_recovery_codes) - 1 LOOP
      IF (v_recovery_codes->>i) = v_clean_code THEN
        UPDATE public.user_2fa_secrets 
        SET recovery_codes = v_recovery_codes - (v_recovery_codes->>i), failed_attempts = 0, locked_until = NULL, updated_at = NOW() 
        WHERE user_id = v_user_id;
        RETURN jsonb_build_object('success', true, 'verified', true, 'used_recovery_code', true, 'message', 'Código de recuperación válido.');
      END IF;
    END LOOP;
  END IF;

  -- 2. Validación Criptográfica TOTP Real (Prueba intervalo actual, -1 y +1 por drift de tiempo)
  FOR i IN -1..1 LOOP
    v_generated_code := public.calculate_totp(v_secret, i);
    IF v_generated_code = v_clean_code THEN
      -- Generar códigos de recuperación si es la primera activación
      IF v_recovery_codes IS NULL OR jsonb_array_length(v_recovery_codes) = 0 THEN
        v_gen_codes := ARRAY[]::TEXT[];
        FOR i IN 1..8 LOOP
          v_code_candidate := UPPER(SUBSTRING(MD5(gen_random_bytes(16)::TEXT) FROM 1 FOR 8));
          v_gen_codes := array_append(v_gen_codes, v_code_candidate);
        END LOOP;
      ELSE
        v_gen_codes := (SELECT array_agg(value) FROM jsonb_array_elements_text(v_recovery_codes) AS value);
      END IF;

      UPDATE public.user_2fa_secrets 
      SET is_active = TRUE, failed_attempts = 0, locked_until = NULL, recovery_codes = to_jsonb(v_gen_codes), updated_at = NOW() 
      WHERE user_id = v_user_id;

      UPDATE public.profiles SET is_mfa_enabled = TRUE, updated_at = NOW() WHERE id = v_user_id OR user_id = v_user_id;

      RETURN jsonb_build_object('success', true, 'verified', true, 'recovery_codes', to_jsonb(v_gen_codes), 'message', '2FA Activado correctamente.');
    END IF;
  END LOOP;

  -- 3. Manejo de fallo
  v_failed_attempts := COALESCE(v_failed_attempts, 0) + 1;
  IF v_failed_attempts >= 5 THEN
    UPDATE public.user_2fa_secrets SET failed_attempts = v_failed_attempts, locked_until = NOW() + INTERVAL '10 minutes', updated_at = NOW() WHERE user_id = v_user_id;
    RETURN jsonb_build_object('success', false, 'verified', false, 'locked', true, 'message', 'Demasiados intentos fallidos.');
  ELSE
    UPDATE public.user_2fa_secrets SET failed_attempts = v_failed_attempts, updated_at = NOW() WHERE user_id = v_user_id;
    RETURN jsonb_build_object('success', false, 'verified', false, 'message', 'Código incorrecto.');
  END IF;
END;
$$;

-- 8. Función RPC: Obtener Estado
CREATE OR REPLACE FUNCTION public.get_2fa_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_active BOOLEAN := FALSE;
  v_has_secret BOOLEAN := FALSE;
  v_locked_until TIMESTAMPTZ := NULL;
  v_is_locked BOOLEAN := FALSE;
  v_profile_mfa BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'is_active', false, 'is_enabled', false, 'has_secret', false, 'is_locked', false);
  END IF;

  SELECT is_active, (secret_base32 IS NOT NULL OR secret IS NOT NULL), locked_until, (locked_until IS NOT NULL AND locked_until > NOW())
  INTO v_is_active, v_has_secret, v_locked_until, v_is_locked
  FROM public.user_2fa_secrets WHERE user_id = v_user_id;

  SELECT COALESCE(is_mfa_enabled, FALSE) INTO v_profile_mfa
  FROM public.profiles
  WHERE id = v_user_id OR user_id = v_user_id;

  v_is_active := COALESCE(v_is_active, v_profile_mfa, false);

  RETURN jsonb_build_object(
    'success', true,
    'is_active', v_is_active,
    'is_enabled', v_is_active,
    'has_secret', COALESCE(v_has_secret, false),
    'is_locked', COALESCE(v_is_locked, false),
    'locked_until', v_locked_until
  );
END;
$$;

-- 9. Funciones de compatibilidad (Aliases)
CREATE OR REPLACE FUNCTION public.disable_2fa(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_verify JSONB;
BEGIN
  v_verify := public.verify_2fa_code(auth.uid(), p_code);
  IF (v_verify->>'verified')::BOOLEAN IS NOT TRUE THEN RETURN jsonb_build_object('success', false, 'message', 'Código incorrecto.'); END IF;
  UPDATE public.user_2fa_secrets SET is_active = FALSE, failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = auth.uid();
  UPDATE public.profiles SET is_mfa_enabled = FALSE, updated_at = NOW() WHERE id = auth.uid() OR user_id = auth.uid();
  RETURN jsonb_build_object('success', true, 'message', '2FA Desactivado.');
END; $$;

CREATE OR REPLACE FUNCTION public.enable_2fa(p_code TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN RETURN public.verify_2fa_code(auth.uid(), p_code); END; $$;

CREATE OR REPLACE FUNCTION public.generate_totp_secret() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN RETURN public.setup_2fa_for_user(auth.uid()); END; $$;

CREATE OR REPLACE FUNCTION public.regenerate_recovery_codes(p_code TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_verify JSONB; v_gen_codes TEXT[]; v_code_candidate TEXT; i INT;
BEGIN
  v_verify := public.verify_2fa_code(auth.uid(), p_code);
  IF (v_verify->>'verified')::BOOLEAN IS NOT TRUE THEN RETURN jsonb_build_object('success', false, 'message', 'Código incorrecto.'); END IF;
  v_gen_codes := ARRAY[]::TEXT[];
  FOR i IN 1..8 LOOP
    v_code_candidate := UPPER(SUBSTRING(MD5(gen_random_bytes(16)::TEXT) FROM 1 FOR 8));
    v_gen_codes := array_append(v_gen_codes, v_code_candidate);
  END LOOP;
  UPDATE public.user_2fa_secrets SET recovery_codes = to_jsonb(v_gen_codes), updated_at = NOW() WHERE user_id = auth.uid();
  RETURN jsonb_build_object('success', true, 'recovery_codes', to_jsonb(v_gen_codes));
END; $$;

-- 10. Permisos y Recarga
GRANT EXECUTE ON FUNCTION public.setup_2fa_for_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_2fa_code(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_2fa_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.disable_2fa(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enable_2fa(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_totp_secret() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_recovery_codes(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_totp(TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.base32_decode(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
