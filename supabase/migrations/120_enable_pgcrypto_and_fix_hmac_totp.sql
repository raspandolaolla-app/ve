-- ============================================================================
-- MIGRACIÓN 120: HABILITAR PGCRYPTO Y CORREGIR FUNCIÓN HMAC PARA 2FA (TOTP)
-- ============================================================================
-- Problema: "function public.hmac(bytea, bytea, unknown) does not exist"
-- Causa: 1) La extensión pgcrypto no está instalada en public o está en extensions.
--        2) El parámetro del algoritmo (ej. 'sha1') se interpreta como tipo 'unknown'.
-- Solución: Instalar extensión, forzar casteo explícito a ::TEXT en el algoritmo 'sha1'::TEXT
--           y soportar resolución tanto en public como en extensions.
-- ============================================================================

-- 1. Habilitar la extensión criptográfica en el esquema público
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

-- 2. Función canónica para generar clave secreta TOTP con firma (user_email TEXT, secret_length INT)
CREATE OR REPLACE FUNCTION public.generate_2fa_secret(user_email TEXT, secret_length INTEGER DEFAULT 20)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_bytes BYTEA;
    v_result TEXT := '';
    v_base32 TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    i INTEGER;
    v_val INTEGER;
BEGIN
    v_bytes := gen_random_bytes(secret_length);
    
    FOR i IN 0..(secret_length - 1) LOOP
        v_val := get_byte(v_bytes, i) & 31;
        v_result := v_result || substr(v_base32, v_val + 1, 1);
    END LOOP;
    
    RETURN v_result;
END;
$$;

-- Sobrecarga con un solo parámetro para retrocompatibilidad
CREATE OR REPLACE FUNCTION public.generate_2fa_secret(secret_length INTEGER DEFAULT 20)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN public.generate_2fa_secret(''::TEXT, secret_length);
END;
$$;

-- 3. Función canónica y blindada para calculate_totp con casteo explícito 'sha1'::TEXT
CREATE OR REPLACE FUNCTION public.calculate_totp(
  p_secret_base32 TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions
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

  v_time_bytes := set_byte('\x0000000000000000'::bytea, 0, (((v_counter >> 56) & 255)::INTEGER));
  v_time_bytes := set_byte(v_time_bytes, 1, (((v_counter >> 48) & 255)::INTEGER));
  v_time_bytes := set_byte(v_time_bytes, 2, (((v_counter >> 40) & 255)::INTEGER));
  v_time_bytes := set_byte(v_time_bytes, 3, (((v_counter >> 32) & 255)::INTEGER));
  v_time_bytes := set_byte(v_time_bytes, 4, (((v_counter >> 24) & 255)::INTEGER));
  v_time_bytes := set_byte(v_time_bytes, 5, (((v_counter >> 16) & 255)::INTEGER));
  v_time_bytes := set_byte(v_time_bytes, 6, (((v_counter >> 8) & 255)::INTEGER));
  v_time_bytes := set_byte(v_time_bytes, 7, ((v_counter & 255)::INTEGER));

  -- ✅ CORRECCIÓN CRÍTICA: Forzar tipo 'sha1'::TEXT con resolución resiliente (public / extensions)
  BEGIN
    v_hmac := public.hmac(v_time_bytes, v_secret_bytes, 'sha1'::TEXT);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      v_hmac := extensions.hmac(v_time_bytes, v_secret_bytes, 'sha1'::TEXT);
    EXCEPTION WHEN OTHERS THEN
      v_hmac := hmac(v_time_bytes, v_secret_bytes, 'sha1'::TEXT);
    END;
  END;

  v_offset := get_byte(v_hmac, 19) & 15;
  v_code_int := ((get_byte(v_hmac, v_offset) & 127) << 24)
              | ((get_byte(v_hmac, v_offset + 1) & 255) << 16)
              | ((get_byte(v_hmac, v_offset + 2) & 255) << 8)
              | (get_byte(v_hmac, v_offset + 3) & 255);

  RETURN lpad((v_code_int % 1000000)::text, 6, '0');
END;
$$;

-- 4. Gestión de Permisos
REVOKE EXECUTE ON FUNCTION public.generate_2fa_secret(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_2fa_secret(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_2fa_secret(TEXT, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_2fa_secret(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_2fa_secret(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_2fa_secret(INTEGER) TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_totp(TEXT, TIMESTAMPTZ) TO authenticated, anon, service_role;

-- 5. Forzar recarga de caché de PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN DE MIGRACIÓN 120
-- ============================================================================
