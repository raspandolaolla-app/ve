-- ================================================================
-- MIGRACIÓN 019: Sistema de Administradores Principales Protegidos y Protección Mutua
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- ================================================================
-- 1. Tabla de Administradores Principales Protegidos
-- ================================================================
CREATE TABLE IF NOT EXISTS public.protected_super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  protection_status VARCHAR(50) NOT NULL DEFAULT 'PROTECTED',
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inserción de los Dos Administradores Principales Exclusivos
INSERT INTO public.protected_super_admins (email, protection_status, description)
VALUES 
  ('v19629049@gmail.com', 'PROTECTED', 'Administrador Principal Protegido A - Control y Recuperación Mutua'),
  ('pulsoplay2026@gmail.com', 'PROTECTED', 'Administrador Principal Protegido B - Control y Recuperación Mutua')
ON CONFLICT (email) DO UPDATE 
SET 
  protection_status = 'PROTECTED',
  updated_at = NOW();

-- Activación y Forzado de Row Level Security
ALTER TABLE public.protected_super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protected_super_admins FORCE ROW LEVEL SECURITY;

-- ================================================================
-- 2. Función Auxiliar: Verificación de Administrador Protegido por Email
-- ================================================================
CREATE OR REPLACE FUNCTION public.is_protected_super_admin_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.protected_super_admins 
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email))
      AND protection_status = 'PROTECTED'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_protected_super_admin_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. Buscar email en auth.users
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_email IS NOT NULL AND public.is_protected_super_admin_email(v_email) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ================================================================
-- 3. Triggers de Protección Inmutable a Nivel de Base de Datos
-- ================================================================

-- A. Protección contra Modificación o Eliminación de la Tabla protected_super_admins
CREATE OR REPLACE FUNCTION public.trg_protect_protected_super_admins_table()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CRITICAL_PROTECTION: No se permite eliminar registros de la lista de administradores principales protegidos.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- No permitir cambiar el correo ni desactivar la protección
    IF NEW.email != OLD.email OR NEW.protection_status != 'PROTECTED' THEN
      RAISE EXCEPTION 'CRITICAL_PROTECTION: No se permite alterar la identidad ni el estado de protección de los administradores principales.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protected_super_admins_guard ON public.protected_super_admins;
CREATE TRIGGER trg_protected_super_admins_guard
BEFORE UPDATE OR DELETE ON public.protected_super_admins
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_protected_super_admins_table();


-- B. Protección contra Degradación o Eliminación en public.user_roles
CREATE OR REPLACE FUNCTION public.trg_protect_super_admin_user_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_is_protected BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_is_protected := public.is_protected_super_admin_user(OLD.user_id);
    IF v_is_protected THEN
      RAISE EXCEPTION 'CANNOT_DELETE_PROTECTED_ADMIN_ROLE: Prohibido eliminar el rol asignado a un Administrador Principal Protegido.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_is_protected := public.is_protected_super_admin_user(OLD.user_id);
    IF v_is_protected THEN
      IF NEW.role != 'SUPER_ADMIN'::app_role_enum THEN
        RAISE EXCEPTION 'CANNOT_DEMOTE_PROTECTED_ADMIN: Prohibido degradar a un Administrador Principal Protegido (debe conservar SUPER_ADMIN).';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_protection_guard ON public.user_roles;
CREATE TRIGGER trg_user_roles_protection_guard
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_super_admin_user_roles();


-- C. Protección contra Bloqueo o Suspensión en public.profiles
CREATE OR REPLACE FUNCTION public.trg_protect_super_admin_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_is_protected BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_is_protected := public.is_protected_super_admin_user(OLD.user_id);
    IF v_is_protected THEN
      RAISE EXCEPTION 'CANNOT_DELETE_PROTECTED_ADMIN_PROFILE: Prohibido eliminar el perfil de un Administrador Principal Protegido.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_is_protected := public.is_protected_super_admin_user(OLD.user_id);
    IF v_is_protected THEN
      -- Si es un admin protegido, no se puede cambiar a SUSPENDED o BLOCKED desde la interfaz o por otro admin
      IF NEW.account_status != 'ACTIVE'::account_status_enum THEN
        RAISE EXCEPTION 'CANNOT_SUSPEND_PROTECTED_ADMIN: Los Administradores Principales Protegidos no pueden ser bloqueados ni suspendidos.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protection_guard ON public.profiles;
CREATE TRIGGER trg_profiles_protection_guard
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_protect_super_admin_profiles();


-- ================================================================
-- 4. RPCs Seguras de Gestión y Diagnóstico de Administradores
-- ================================================================

-- A. Diagnóstico de Estado de los Dos Administradores Principales
CREATE OR REPLACE FUNCTION public.get_protected_admins_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_result JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_user_auth RECORD;
  v_profile RECORD;
  v_role app_role_enum;
  v_is_auth_registered BOOLEAN;
  v_mfa_enabled BOOLEAN;
  v_account_status TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrativo para consultar este reporte.';
  END IF;

  FOR v_rec IN 
    SELECT email, protection_status, description, created_at 
    FROM public.protected_super_admins 
    ORDER BY email ASC
  LOOP
    -- Consultar auth.users
    SELECT id, is_sso_user INTO v_user_auth
    FROM auth.users
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_rec.email));

    IF FOUND THEN
      v_is_auth_registered := TRUE;

      -- Consultar profile
      SELECT * INTO v_profile
      FROM public.profiles
      WHERE user_id = v_user_auth.id;

      IF FOUND THEN
        v_account_status := v_profile.account_status::text;
        v_mfa_enabled := v_profile.is_mfa_enabled;
      ELSE
        v_account_status := 'PENDING_PROFILE';
        v_mfa_enabled := FALSE;
      END IF;

      -- Consultar rol
      SELECT role INTO v_role
      FROM public.user_roles
      WHERE user_id = v_user_auth.id;

      IF NOT FOUND THEN
        v_role := 'PLAYER'::app_role_enum;
      END IF;

    ELSE
      v_is_auth_registered := FALSE;
      v_account_status := 'REQUIRES_MANUAL_CREATION';
      v_mfa_enabled := FALSE;
      v_role := 'PLAYER'::app_role_enum;
    END IF;

    v_result := v_result || jsonb_build_object(
      'email', v_rec.email,
      'protectionStatus', v_rec.protection_status,
      'description', v_rec.description,
      'registeredInAuth', v_is_auth_registered,
      'userId', CASE WHEN v_is_auth_registered THEN v_user_auth.id ELSE NULL END,
      'accountStatus', v_account_status,
      'role', v_role,
      'isMfaEnabled', v_mfa_enabled,
      'isProtected', true
    );
  END LOOP;

  RETURN v_result;
END;
$$;


-- B. Asignación y Gestión de Roles Segura (Con Blindaje SUPER_ADMIN)
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  p_target_user_id UUID,
  p_new_role app_role_enum
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_email TEXT;
  v_target_email TEXT;
  v_target_is_protected BOOLEAN;
  v_jwt_claims JSONB;
  v_aal_level TEXT;
BEGIN
  -- 1. Verificación de Autenticación y Privilegios
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  IF NOT public.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Solo un SUPER_ADMIN puede gestionar roles de usuario.';
  END IF;

  -- 2. Si el SUPER_ADMIN tiene MFA activo, verificar nivel AAL2
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
  v_jwt_claims := auth.jwt();
  v_aal_level := COALESCE(v_jwt_claims->>'aal', 'aal1');

  -- 3. Identificar usuario objetivo
  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;

  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'TARGET_USER_NOT_FOUND: El usuario objetivo no existe';
  END IF;

  v_target_is_protected := public.is_protected_super_admin_email(v_target_email);

  -- 4. Regla: No se puede degradar a un admin protegido
  IF v_target_is_protected AND p_new_role != 'SUPER_ADMIN'::app_role_enum THEN
    RAISE EXCEPTION 'CANNOT_DEMOTE_PROTECTED_ADMIN: Un Administrador Principal Protegido no puede ser degradado.';
  END IF;

  -- 5. Regla: Solo los correos autorizados pueden recibir SUPER_ADMIN
  IF p_new_role = 'SUPER_ADMIN'::app_role_enum AND NOT v_target_is_protected THEN
    RAISE EXCEPTION 'UNAUTHORIZED_SUPER_ADMIN: Solo los correos autorizados en la lista de protección pueden ostentar el rol SUPER_ADMIN.';
  END IF;

  -- 6. Actualización o Inserción de Rol
  INSERT INTO public.user_roles (user_id, role, granted_by, granted_at)
  VALUES (p_target_user_id, p_new_role, v_caller_id, NOW())
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Limpiar otros roles del usuario para mantener rol único activo
  DELETE FROM public.user_roles 
  WHERE user_id = p_target_user_id AND role != p_new_role;

  -- 7. Registro Inmutable en Auditoría
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_caller_id,
    'SUPER_ADMIN',
    'ASSIGN_USER_ROLE',
    'user_roles',
    p_target_user_id::text,
    'CRITICAL'::audit_severity_enum,
    jsonb_build_object(
      'targetUserId', p_target_user_id,
      'targetEmail', v_target_email,
      'assignedRole', p_new_role,
      'callerEmail', v_caller_email,
      'aalLevel', v_aal_level,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'targetUserId', p_target_user_id,
    'assignedRole', p_new_role
  );
END;
$$;


-- C. Modificación de Estado de Cuenta Segura
CREATE OR REPLACE FUNCTION public.admin_update_account_status(
  p_target_user_id UUID,
  p_new_status account_status_enum,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_email TEXT;
  v_target_email TEXT;
  v_target_is_protected BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_admin(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol administrativo para cambiar el estado de cuenta.';
  END IF;

  SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;

  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'TARGET_USER_NOT_FOUND: El usuario objetivo no existe';
  END IF;

  v_target_is_protected := public.is_protected_super_admin_email(v_target_email);

  -- Regla: Nadie puede suspender ni bloquear a un Administrador Protegido
  IF v_target_is_protected AND p_new_status != 'ACTIVE'::account_status_enum THEN
    RAISE EXCEPTION 'CANNOT_SUSPEND_PROTECTED_ADMIN: Los Administradores Principales Protegidos no pueden ser suspendidos ni bloqueados.';
  END IF;

  UPDATE public.profiles
  SET 
    account_status = p_new_status,
    updated_at = NOW()
  WHERE user_id = p_target_user_id;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  -- Registro de Auditoría
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_caller_id,
    CASE WHEN public.is_super_admin(v_caller_id) THEN 'SUPER_ADMIN' ELSE 'ADMIN' END,
    'UPDATE_ACCOUNT_STATUS',
    'profiles',
    p_target_user_id::text,
    CASE WHEN p_new_status = 'BLOCKED'::account_status_enum THEN 'CRITICAL'::audit_severity_enum ELSE 'WARNING'::audit_severity_enum END,
    jsonb_build_object(
      'targetUserId', p_target_user_id,
      'targetEmail', v_target_email,
      'newStatus', p_new_status,
      'reason', p_reason,
      'callerEmail', v_caller_email,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'targetUserId', p_target_user_id,
    'newStatus', p_new_status
  );
END;
$$;


-- D. Procedimiento de Recuperación Mutua entre Administradores Protegidos
CREATE OR REPLACE FUNCTION public.admin_initiate_peer_recovery(
  p_target_email TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_email TEXT;
  v_target_user_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
  IF v_caller_email IS NULL OR NOT public.is_protected_super_admin_email(v_caller_email) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Solo un Administrador Principal Protegido puede iniciar la recuperación mutua.';
  END IF;

  IF LOWER(TRIM(v_caller_email)) = LOWER(TRIM(p_target_email)) THEN
    RAISE EXCEPTION 'INVALID_TARGET: La recuperación mutua requiere la autorización del par protegido.';
  END IF;

  IF NOT public.is_protected_super_admin_email(p_target_email) THEN
    RAISE EXCEPTION 'INVALID_TARGET: El correo especificado no pertenece al grupo de Administradores Principales Protegidos.';
  END IF;

  -- Buscar ID del usuario objetivo en auth.users
  SELECT id INTO v_target_user_id
  FROM auth.users
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_target_email));

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'REQUIERE CREACIÓN MANUAL DEL USUARIO EN SUPABASE AUTH',
      'targetEmail', p_target_email
    );
  END IF;

  -- Asegurar estado ACTIVE en profiles
  UPDATE public.profiles
  SET 
    account_status = 'ACTIVE'::account_status_enum,
    updated_at = NOW()
  WHERE user_id = v_target_user_id;

  -- Asegurar rol SUPER_ADMIN en user_roles
  INSERT INTO public.user_roles (user_id, role, granted_by, granted_at)
  VALUES (v_target_user_id, 'SUPER_ADMIN'::app_role_enum, v_caller_id, NOW())
  ON CONFLICT (user_id, role) DO UPDATE SET granted_at = NOW();

  -- Auditoría Crítica de Recuperación
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_caller_id,
    'SUPER_ADMIN',
    'PEER_ADMIN_RECOVERY',
    'protected_super_admins',
    v_target_user_id::text,
    'CRITICAL'::audit_severity_enum,
    jsonb_build_object(
      'callerEmail', v_caller_email,
      'targetEmail', p_target_email,
      'targetUserId', v_target_user_id,
      'reason', p_reason,
      'actionTaken', 'RESTORE_ACTIVE_SUPER_ADMIN',
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Recuperación mutua completada con éxito. Rol SUPER_ADMIN y estado ACTIVE confirmados.',
    'targetEmail', p_target_email,
    'targetUserId', v_target_user_id
  );
END;
$$;


-- ================================================================
-- 5. RLS y Permisos para la Tabla protected_super_admins
-- ================================================================
DROP POLICY IF EXISTS p_protected_super_admins_select ON public.protected_super_admins;
CREATE POLICY p_protected_super_admins_select ON public.protected_super_admins
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Hardening de Permisos (Principle of Least Privilege)
REVOKE ALL ON TABLE public.protected_super_admins FROM PUBLIC;
GRANT SELECT ON TABLE public.protected_super_admins TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_protected_admins_status FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_user_role FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_account_status FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_initiate_peer_recovery FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_protected_admins_status TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_account_status TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_initiate_peer_recovery TO authenticated, service_role;
