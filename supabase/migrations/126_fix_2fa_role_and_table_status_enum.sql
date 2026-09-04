-- ==============================================================================
-- MIGRACIÓN 126: FIX 2FA ROLE Y ROBUSTEZ DE ENUM table_status_enum
-- ==============================================================================
-- 1. Corrige error: column "role" does not exist en setup_2fa_for_user
--    usando la función canonical public.is_admin(auth.uid()) en lugar de profiles.role.
-- 2. Asegura que los valores requeridos existan en el enum table_status_enum
--    evitando el error: invalid input value for enum table_status_enum.
-- ==============================================================================

-- 1. Asegurar valores en table_status_enum (Idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ACTIVE'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'WAITING'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'WAITING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'READY'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'READY';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SALES'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'SALES';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'DRAWING'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'DRAWING';
  END IF;
END $$;

-- 2. Corregir la función setup_2fa_for_user para usar is_admin() en lugar de la columna inexistente 'role'
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

  -- Verificación de autorización canonical con is_admin()
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

GRANT EXECUTE ON FUNCTION public.setup_2fa_for_user(UUID) TO authenticated;

-- 3. Notificar a PostgREST para recargar el esquema
NOTIFY pgrst, 'reload schema';
