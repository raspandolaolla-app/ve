-- ==============================================================================
-- MIGRACIÓN 044: SISTEMA 2FA / TOTP COMPLETO (SERVER AUTHORITATIVE RFC 6238)
-- ==============================================================================
-- Introduce soporte nativo para Autenticación en Dos Pasos (2FA/TOTP)
-- - Tabla user_2fa_secrets
-- - Funciones PL/pgSQL para generación, decodificación Base32 y validación TOTP
-- - RPCs generate_totp_secret, verify_totp_code, enable_2fa, disable_2fa
-- - Validación server-side en retiros (request_withdrawal_locked)
-- ==============================================================================

-- 1. TABLA PARA ALMACENAR SECRETOS TOTP 2FA
CREATE TABLE IF NOT EXISTS public.user_2fa_secrets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.user_2fa_secrets ENABLE ROW LEVEL SECURITY;

-- Políticas RLS estrictas por usuario
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


-- 2. FUNCIÓN DE DECODIFICACIÓN BASE32 PL/pgSQL
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


-- 3. CÁLCULO DE CÓDIGO TOTP RFC 6238
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


-- 4. VERIFICACIÓN INTERNA DE TOTP CON VENTANA DE TOLERANCIA DE TIEMPO
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


-- 5. RPC GENERAR SECRETO 2FA TOTP Y QR URI
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


-- 6. RPC VERIFICAR CÓDIGO TOTP
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

  RETURN public.verify_totp_code_internal(v_secret, p_code, 1);
END;
$$;


-- 7. RPC ACTIVAR 2FA TOTP
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

  v_valid := public.verify_totp_code_internal(v_secret, p_code, 1);

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


-- 8. RPC DESACTIVAR 2FA TOTP
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
    UPDATE public.profiles SET is_mfa_enabled = FALSE WHERE user_id = v_user_id;
    RETURN jsonb_build_object('success', true, 'message', '2FA ya se encontraba desactivado.');
  END IF;

  v_valid := public.verify_totp_code_internal(v_secret, p_code, 1);

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TOTP_CODE: El código TOTP ingresado es incorrecto.';
  END IF;

  UPDATE public.user_2fa_secrets
  SET is_active = FALSE, updated_at = NOW()
  WHERE user_id = v_user_id;

  UPDATE public.profiles
  SET is_mfa_enabled = FALSE, updated_at = NOW()
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Autenticación en Dos Pasos (2FA) desactivada correctamente.'
  );
END;
$$;


-- 9. VALIDAR 2FA SI ESTÁ HABILIADO (PARA OPERACIONES CRÍTICAS COMO RETIROS)
CREATE OR REPLACE FUNCTION public.validate_2fa_if_enabled(
  p_user_id UUID,
  p_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_mfa_enabled BOOLEAN := FALSE;
  v_secret TEXT;
  v_valid BOOLEAN;
BEGIN
  SELECT COALESCE(is_mfa_enabled, FALSE) INTO v_mfa_enabled
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT v_mfa_enabled THEN
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

  v_valid := public.verify_totp_code_internal(v_secret, p_code, 1);
  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TOTP_CODE: El código 2FA ingresado es incorrecto o ha expirado.';
  END IF;

  RETURN TRUE;
END;
$$;


-- 10. SOBRECARGAR / ACTUALIZAR RPC DE RETIRO DE FONDOS CON PARÁMETRO OPCIONAL TOTP
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
  v_jwt_claims JSONB;
  v_aal_level TEXT;
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
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil no encontrado';
  END IF;

  IF v_profile.is_mfa_enabled THEN
    v_jwt_claims := auth.jwt();
    v_aal_level := COALESCE(v_jwt_claims->>'aal', 'aal1');
    IF v_aal_level != 'aal2' THEN
      PERFORM public.validate_2fa_if_enabled(v_user_id, p_totp_code);
    END IF;
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

  -- 7. Verificación de Idempotencia
  SELECT * INTO v_existing_req
  FROM public.withdrawal_requests
  WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'withdrawal_id', v_existing_req.id,
      'held_amount', v_existing_req.amount,
      'remaining_available', (
        SELECT available_balance FROM public.wallets WHERE user_id = v_user_id
      ),
      'message', 'Solicitud duplicada prevenida vía idempotency_key'
    );
  END IF;

  -- 8. Obtener y Bloquear Bóveda del Usuario
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: La billetera del usuario no existe';
  END IF;

  IF v_wallet.is_frozen THEN
    RAISE EXCEPTION 'WALLET_FROZEN: La billetera está congelada administrativamente';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente disponible para retiro';
  END IF;

  -- 9. Aplicar Retención Pesimista
  UPDATE public.wallets
  SET available_balance = available_balance - p_amount,
      held_balance = held_balance + p_amount,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 10. Registrar Asiento Contable
  INSERT INTO public.ledger_entries (
    user_id,
    amount,
    entry_type,
    balance_type,
    reference_type,
    description
  ) VALUES (
    v_user_id,
    p_amount,
    'DEBIT',
    'HELD',
    'WITHDRAWAL_LOCK',
    'Retención pesimista para solicitud de retiro'
  ) RETURNING id INTO v_ledger_id;

  -- 11. Crear Solicitud de Retiro
  INSERT INTO public.withdrawal_requests (
    user_id,
    payment_account_id,
    amount,
    status,
    idempotency_key
  ) VALUES (
    v_user_id,
    p_payment_account_id,
    p_amount,
    'PENDING',
    p_idempotency_key
  ) RETURNING id INTO v_request_id;

  -- 12. Retornar Estado Resultante
  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_request_id,
    'held_amount', p_amount,
    'remaining_available', (v_wallet.available_balance - p_amount),
    'message', 'Solicitud de retiro procesada correctamente con retención pesimista'
  );
END;
$$;


-- PERMISOS Y PERMISOLOGÍA GENERAL
GRANT EXECUTE ON FUNCTION public.generate_totp_secret() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_totp_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_2fa(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_2fa(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_2fa_if_enabled(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal_locked(UUID, NUMERIC, VARCHAR, VARCHAR) TO authenticated, service_role;
