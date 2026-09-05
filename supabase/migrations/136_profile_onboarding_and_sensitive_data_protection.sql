-- ==============================================================================
-- MIGRACIÓN 136: BLINDAJE DE PERFIL, UNICIDAD DE CÉDULA/TELÉFONO Y BLOQUEO DE EDICIÓN
-- ==============================================================================

-- 1. Asegurar que las columnas existan en la tabla profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS cedula TEXT,
ADD COLUMN IF NOT EXISTS telefono TEXT,
ADD COLUMN IF NOT EXISTS nombre_real TEXT,
ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
ADD COLUMN IF NOT EXISTS estado_residencia TEXT,
ADD COLUMN IF NOT EXISTS is_profile_locked BOOLEAN DEFAULT FALSE;

-- 2. CREAR RESTRICCIONES DE UNICIDAD ABSOLUTA (No permite duplicados)
-- Usamos índices únicos parciales que ignoran valores NULL para no romper registros antiguos incompletos
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_cedula_unique 
ON public.profiles (cedula) WHERE cedula IS NOT NULL AND cedula != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telefono_unique 
ON public.profiles (telefono) WHERE telefono IS NOT NULL AND telefono != '';

-- Función auxiliar is_operator compatible
CREATE OR REPLACE FUNCTION public.is_operator(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = p_user_id 
      AND role IN ('OPERATOR'::app_role_enum, 'ADMIN'::app_role_enum, 'SUPER_ADMIN'::app_role_enum)
  );
$$;

-- 3. TRIGGER PARA BLOQUEAR EDICIÓN DE DATOS SENSIBLES POR USUARIOS NORMALES
-- Este trigger se ejecuta ANTES de cualquier actualización. Si el usuario no es admin ni operador,
-- no le permitirá cambiar la cédula o el teléfono si ya están establecidos.
CREATE OR REPLACE FUNCTION public.prevent_sensitive_data_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_uuid UUID;
BEGIN
  -- Evaluar identificador de usuario (soporte tanto para id como para user_id en profiles)
  v_user_uuid := COALESCE(NEW.user_id, NEW.id, auth.uid());

  -- Si el usuario NO es admin ni operador
  IF NOT (public.is_admin(v_user_uuid) OR public.is_operator(v_user_uuid) OR public.is_operator_or_above(v_user_uuid)) THEN
    -- Y la cédula o teléfono ya estaban establecidos (no son NULL)
    IF OLD.cedula IS NOT NULL AND OLD.cedula != '' AND NEW.cedula IS DISTINCT FROM OLD.cedula THEN
      RAISE EXCEPTION 'NO_AUTORIZADO: No puedes modificar tu número de cédula. Contacta a soporte.';
    END IF;
    
    IF OLD.telefono IS NOT NULL AND OLD.telefono != '' AND NEW.telefono IS DISTINCT FROM OLD.telefono THEN
      RAISE EXCEPTION 'NO_AUTORIZADO: No puedes modificar tu número de teléfono. Contacta a soporte.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Adjuntar el trigger a la tabla
DROP TRIGGER IF EXISTS trg_prevent_sensitive_update ON public.profiles;
CREATE TRIGGER trg_prevent_sensitive_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_sensitive_data_update();

NOTIFY pgrst, 'reload schema';
