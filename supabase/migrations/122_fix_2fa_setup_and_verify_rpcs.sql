-- ============================================================================
-- MIGRACIÓN 122: FUNCIÓN 2FA DEFINITIVA Y BLINDADA (setup_2fa_for_user & verify_2fa_code)
-- ============================================================================
-- Resuelve: "function public.hmac(bytea, bytea, unknown) does not exist"
-- Proporciona: Funciones canónicas setup_2fa_for_user y verify_2fa_code
--              compatibles con el flujo frontend TOTP.
-- ============================================================================

-- 1. Asegurar extensión pgcrypto en public
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

-- 2. Asegurar estructura de tabla user_2fa_secrets compatible
CREATE TABLE IF NOT EXISTS public.user_2fa_secrets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    secret TEXT,
    secret_encrypted TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    recovery_codes JSONB DEFAULT '[]'::jsonb,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS si no está habilitada
ALTER TABLE public.user_2fa_secrets ENABLE ROW LEVEL SECURITY;

-- Asegurar columnas 'secret' y 'secret_encrypted'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'user_2fa_secrets' 
        AND column_name = 'secret'
    ) THEN
        ALTER TABLE public.user_2fa_secrets ADD COLUMN secret TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'user_2fa_secrets' 
        AND column_name = 'secret_encrypted'
    ) THEN
        ALTER TABLE public.user_2fa_secrets ADD COLUMN secret_encrypted TEXT;
    END IF;
END $$;

-- Políticas RLS permisivas para el propietario
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

-- 3. Función canónica setup_2fa_for_user
CREATE OR REPLACE FUNCTION public.setup_2fa_for_user(user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_secret_base32 TEXT;
    v_secret_bytes BYTEA;
    v_result JSONB;
    i INTEGER;
    v_val INTEGER;
BEGIN
    -- Generar 20 bytes aleatorios
    v_secret_bytes := gen_random_bytes(20);
    
    -- Convertir a Base32 manualmente
    v_secret_base32 := '';
    FOR i IN 0..19 LOOP
        v_val := get_byte(v_secret_bytes, i) & 31;
        v_secret_base32 := v_secret_base32 || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', v_val + 1, 1);
    END LOOP;
    
    -- Guardar en la tabla de secretos 2FA (llenando tanto secret como secret_encrypted para máxima compatibilidad)
    INSERT INTO public.user_2fa_secrets (user_id, secret, secret_encrypted, is_active, created_at, updated_at)
    VALUES (user_id, v_secret_base32, v_secret_base32, FALSE, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE 
    SET secret = EXCLUDED.secret,
        secret_encrypted = EXCLUDED.secret_encrypted,
        updated_at = NOW();
    
    -- Retornar el secreto para que el frontend lo muestre
    v_result := jsonb_build_object(
        'success', true,
        'secret', v_secret_base32,
        'qr_url', 'otpauth://totp/RaspandoLaOlla?secret=' || v_secret_base32 || '&issuer=RaspandoLaOlla'
    );
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. Función canónica verify_2fa_code
CREATE OR REPLACE FUNCTION public.verify_2fa_code(user_id UUID, code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_secret_base32 TEXT;
    v_secret_bytes BYTEA;
    v_base_time BIGINT;
    v_time_step BIGINT;
    v_time_bytes BYTEA;
    v_mac BYTEA;
    v_offset INTEGER;
    v_binary INTEGER;
    v_otp INTEGER;
    i INTEGER;
    v_char TEXT;
    v_pos INTEGER;
BEGIN
    -- Obtener el secreto del usuario
    SELECT COALESCE(secret, secret_encrypted) INTO v_secret_base32 
    FROM public.user_2fa_secrets 
    WHERE user_id = $1;
    
    IF v_secret_base32 IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_2FA_SETUP');
    END IF;
    
    -- Convertir Base32 a bytes manualmente
    v_secret_bytes := '\x'::bytea;
    i := 1;
    WHILE i <= length(v_secret_base32) LOOP
        v_char := substr(v_secret_base32, i, 1);
        v_pos := position(v_char IN 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567') - 1;
        IF v_pos < 0 THEN v_pos := 0; END IF;
        
        -- Acumular bits (usar el valor directamente con casteo estricto a INTEGER)
        v_secret_bytes := v_secret_bytes || set_byte('\x00'::bytea, 0, (v_pos::INTEGER));
        i := i + 1;
    END LOOP;
    
    -- Tiempo actual en pasos de 30 segundos
    v_base_time := floor(extract(epoch from now()) / 30)::BIGINT;
    
    -- Probar el tiempo actual y 1 paso antes/después (drift)
    FOR i IN -1..1 LOOP
        v_time_step := v_base_time + i;
        v_time_bytes := decode(lpad(to_hex(v_time_step), 16, '0'), 'hex');
        
        -- CORRECCION CRITICA: 'sha1'::text (evita el error 'unknown') con soporte public/extensions
        BEGIN
            v_mac := public.hmac(v_time_bytes, v_secret_bytes, 'sha1'::text);
        EXCEPTION WHEN OTHERS THEN
            v_mac := extensions.hmac(v_time_bytes, v_secret_bytes, 'sha1'::text);
        END;
        
        v_offset := get_byte(v_mac, 19) & 15;
        v_binary := (
            (get_byte(v_mac, v_offset) & 127) << 24 |
            (get_byte(v_mac, v_offset + 1) << 16) |
            (get_byte(v_mac, v_offset + 2) << 8) |
            (get_byte(v_mac, v_offset + 3))
        );
        
        v_otp := v_binary % 1000000;
        
        IF lpad(v_otp::TEXT, 6, '0') = lpad($2, 6, '0') THEN
            -- Activar 2FA para el usuario en la tabla
            UPDATE public.user_2fa_secrets
            SET is_active = TRUE,
                failed_attempts = 0,
                locked_until = NULL,
                updated_at = NOW()
            WHERE user_id = $1;

            RETURN jsonb_build_object('success', true, 'verified', true);
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object('success', true, 'verified', false);
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Sobrecarga y Aliases para Compatibilidad Retroactiva con generate_totp_secret y enable_2fa
CREATE OR REPLACE FUNCTION public.generate_totp_secret()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'NO_AUTH: Usuario no autenticado';
    END IF;
    
    v_result := public.setup_2fa_for_user(v_user_id);
    
    RETURN jsonb_build_object(
        'secret', v_result->>'secret',
        'qr_uri', v_result->>'qr_url',
        'email', COALESCE((SELECT email FROM auth.users WHERE id = v_user_id), '')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_2fa(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_verify JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'NO_AUTH: Usuario no autenticado';
    END IF;

    v_verify := public.verify_2fa_code(v_user_id, p_code);

    IF (v_verify->>'verified')::BOOLEAN IS TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'recovery_codes', '[]'::jsonb
        );
    ELSE
        RAISE EXCEPTION 'INVALID_CODE: El código de 6 dígitos es incorrecto o ha expirado';
    END IF;
END;
$$;

-- 6. Gestión de Permisos
GRANT EXECUTE ON FUNCTION public.setup_2fa_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_2fa_for_user(UUID) TO service_role;

GRANT EXECUTE ON FUNCTION public.verify_2fa_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_2fa_code(UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.generate_totp_secret() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_totp_secret() TO service_role;

GRANT EXECUTE ON FUNCTION public.enable_2fa(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enable_2fa(TEXT) TO service_role;

-- 7. Recargar caché de PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN DE MIGRACIÓN 122
-- ============================================================================
