-- ============================================================================
-- MIGRACIÓN 118: CORRECCIÓN DEFINITIVA DE CASTING EN 2FA (set_byte / get_byte)
-- ============================================================================
-- Problema: "function set_byte(bytea, integer, bigint) does not exist"
-- Causa: PostgreSQL exige estrictamente que el 3er parámetro de set_byte sea INTEGER.
--        En base32_decode y generación TOTP, operaciones sobre variables BIGINT
--        o expresiones sin casteo explícito producían BIGINT al pasarse a set_byte.
-- Solución: Reemplazo de funciones con casting explícito ::INTEGER y eliminación de ambigüedades.
-- ============================================================================

-- 1. Función canónica y blindada para generar secreto TOTP (Base32)
CREATE OR REPLACE FUNCTION public.generate_2fa_secret(secret_length INTEGER DEFAULT 20)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bytes BYTEA;
    v_result TEXT := '';
    v_base32 TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    i INTEGER;
    v_val INTEGER;
BEGIN
    -- Generar bytes aleatorios criptográficamente seguros
    v_bytes := gen_random_bytes(secret_length);
    
    FOR i IN 0..(secret_length - 1) LOOP
        -- ✅ CORRECCIÓN CRÍTICA: 
        -- get_byte devuelve INTEGER. La operación bitwise (& 31) mantiene el tipo INTEGER.
        -- Se evita CUALQUIER uso implícito de ::bigint, numeric o funciones como floor() sin castear.
        v_val := get_byte(v_bytes, i) & 31;
        v_result := v_result || substr(v_base32, v_val + 1, 1);
    END LOOP;
    
    RETURN v_result;
END;
$$;

-- 2. Corrección blindada de base32_decode (elimina set_byte(bytea, integer, bigint))
CREATE OR REPLACE FUNCTION public.base32_decode(p_base32 TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
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
      -- ✅ CORRECCIÓN CRÍTICA: Casteo explícito a ::INTEGER para evitar set_byte(bytea, integer, bigint)
      v_bytea := v_bytea || set_byte('\x00'::bytea, 0, (((v_buffer >> v_bits) & 255)::INTEGER));
      v_buffer := v_buffer & ((1 << v_bits) - 1);
    END IF;
  END LOOP;
  RETURN v_bytea;
END;
$$;

-- 3. Corrección blindada de calculate_totp con casteo explícito a INTEGER en todos los set_byte
CREATE OR REPLACE FUNCTION public.calculate_totp(
  p_secret_base32 TEXT,
  p_timestamp TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
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

  v_hmac := public.hmac(v_time_bytes, v_secret_bytes, 'sha1'::TEXT);
  v_offset := get_byte(v_hmac, 19) & 15;
  v_code_int := ((get_byte(v_hmac, v_offset) & 127) << 24)
              | ((get_byte(v_hmac, v_offset + 1) & 255) << 16)
              | ((get_byte(v_hmac, v_offset + 2) & 255) << 8)
              | (get_byte(v_hmac, v_offset + 3) & 255);

  RETURN lpad((v_code_int % 1000000)::text, 6, '0');
END;
$$;

-- 4. Gestión de Permisos (Principio de Menor Privilegio)
REVOKE EXECUTE ON FUNCTION public.generate_2fa_secret(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_2fa_secret(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_2fa_secret(INTEGER) TO service_role;

GRANT EXECUTE ON FUNCTION public.base32_decode(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_totp(TEXT, TIMESTAMPTZ) TO authenticated, anon, service_role;

-- 5. Forzar recarga de caché de PostgREST para aplicar los cambios inmediatamente
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN DE MIGRACIÓN 118
-- ============================================================================
