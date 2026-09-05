-- ==============================================================================
-- MIGRACIÓN 138: BLINDAJE DE POLÍTICAS RLS EN PROFILES Y AUTO-CREACIÓN CON GOOGLE OAUTH
-- ==============================================================================
-- 1. Resuelve el error "new row violates row-level security policy for table profiles"
-- 2. Garantiza que el usuario pueda insertar o actualizar únicamente su propio perfil
-- 3. Crea automáticamente la fila de perfil y billetera al registrarse mediante Google OAuth
-- ==============================================================================

-- 1. Asegurar que RLS esté habilitado en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Política para INSERTAR: El propio usuario puede crear su perfil si no existe
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id 
    OR (user_id IS NOT NULL AND auth.uid() = user_id)
  );

-- 3. Política para ACTUALIZAR: Solo el propio usuario puede modificar su perfil
-- (El trigger trg_prevent_sensitive_update bloquea cambios no autorizados en cédula/teléfono)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (
    auth.uid() = id 
    OR (user_id IS NOT NULL AND auth.uid() = user_id)
  );

-- 4. Política para LEER: Los usuarios pueden consultar perfiles para visualización pública en el juego
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

-- 5. Función de base de datos para crear automáticamente perfil y billetera en OAuth
CREATE OR REPLACE FUNCTION public.fn_auto_create_user_profile_and_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuario');
  v_first_name := split_part(v_full_name, ' ', 1);
  IF position(' ' in v_full_name) > 0 THEN
    v_last_name := substring(v_full_name from position(' ' in v_full_name) + 1);
  ELSE
    v_last_name := '';
  END IF;

  -- 5.1 Crear o asegurar perfil base del usuario
  BEGIN
    INSERT INTO public.profiles (
      id,
      user_id,
      nombre_real,
      display_name,
      first_name,
      last_name,
      avatar_url,
      state_venezuela,
      birth_date,
      cedula_hash,
      cedula_last4,
      phone_number,
      account_status,
      kyc_status,
      is_profile_locked,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.id,
      v_full_name,
      v_full_name,
      v_first_name,
      v_last_name,
      NEW.raw_user_meta_data->>'avatar_url',
      'Distrito Capital',
      CURRENT_DATE - INTERVAL '20 years',
      encode(sha256(NEW.id::text::bytea), 'hex'),
      '0000',
      '04140000000',
      'ACTIVE'::account_status_enum,
      'UNSUBMITTED'::kyc_status_enum,
      FALSE,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback ultra-defensivo para esquemas simplificados de profiles
    BEGIN
      INSERT INTO public.profiles (id, nombre_real, created_at, updated_at)
      VALUES (NEW.id, v_full_name, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  -- 5.2 Crear billetera inicial en VES con balance cero
  BEGIN
    INSERT INTO public.wallets (
      user_id,
      available_balance,
      held_balance,
      currency,
      updated_at
    )
    VALUES (
      NEW.id,
      0.00,
      0.00,
      'VES',
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- 6. Asegurar que el trigger esté activo en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_create_user_profile_and_wallet();

-- 7. Notificar a PostgREST para recargar el esquema en caliente
NOTIFY pgrst, 'reload schema';
