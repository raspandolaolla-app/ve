# FASE 22 — SISTEMA PROFESIONAL DE ADMINISTRADORES PROTEGIDOS EN SUPABASE

**Proyecto:** RASPANDO LA OLLA  
**Fecha:** 26 de Agosto de 2026  
**Estado:** Producción / Hardened Security Architecture  
**Documento:** `/docs/PHASE_22_PROTECTED_ADMIN_SECURITY.md`

---

## 1. RESUMEN EJECUTIVO

Se ha implementado una arquitectura de blindaje y protección integral para los dos Administradores Principales de la plataforma **RASPANDO LA OLLA**, garantizando que la autoridad máxima del sistema resida exclusivamente en **Supabase Auth + RBAC en PostgreSQL + Row Level Security (RLS)**.

### Administradores Principales Exclusivos:
1. `v19629049@gmail.com`
2. `pulsoplay2026@gmail.com`

---

## 2. DIRECTIVAS DE SEGURIDAD Y CERO PUERTAS TRASERAS

El diseño se adhiere de forma inflexible a los siguientes principios:
- **Sin contraseñas en código ni tablas propias:** Las credenciales son gestionadas de forma aislada por Supabase Auth con hashing bcrypt/argon2.
- **Sin claves `service_role` en frontend:** La webapp opera exclusivamente con la clave pública `anon` y tokens JWT de sesión.
- **Sin cuentas ocultas ni contraseñas maestras:** No existen usuarios sintéticos, puertas traseras ni atajos de autenticación.
- **Sin autorización en `localStorage`:** Los privilegios son verificados en cada transacción por funciones `SECURITY DEFINER` y políticas RLS en PostgreSQL.

---

## 3. ARQUITECTURA DE BLINDAJE EN POSTGRESQL (MIGRACIÓN 019)

Se ha creado la migración `/supabase/migrations/019_protected_super_admins.sql` que establece:

### 3.1. Tabla Inmutable `public.protected_super_admins`
Almacena la lista blanca de administradores protegidos con RLS activado y forzado. Un trigger (`trg_protect_protected_super_admins_table`) bloquea cualquier intento de `DELETE` o `UPDATE` de sus correos o estados de protección.

### 3.2. Triggers de Protección Transaccional
1. **Protección en `public.user_roles` (`trg_protect_super_admin_user_roles`):**
   - Prohíbe cualquier operación de `DELETE` sobre el rol de un administrador protegido.
   - Prohíbe la degradación (`UPDATE`) de su rol a cualquier valor diferente de `SUPER_ADMIN`.
2. **Protección en `public.profiles` (`trg_protect_super_admin_profiles`):**
   - Prohíbe cualquier intento de cambiar `account_status` a `SUSPENDED` o `BLOCKED` para los administradores protegidos.
   - Prohíbe el borrado de sus perfiles.

### 3.3. Funciones RPC con `SECURITY DEFINER`
- `public.get_protected_admins_status()`: Consulta el estado real en `auth.users`, `public.profiles` y `public.user_roles`. Si un usuario aún no existe en Supabase Auth, retorna explícitamente `"REQUIERE CREACIÓN MANUAL DEL USUARIO EN SUPABASE AUTH"`.
- `public.admin_update_user_role()`: Valida que solo un `SUPER_ADMIN` con sesión activa pueda modificar roles y bloquea la asignación de `SUPER_ADMIN` a correos no autorizados.
- `public.admin_update_account_status()`: Modifica el estado de usuarios ordinarios mientras rechaza cualquier intento contra administradores protegidos.
- `public.admin_initiate_peer_recovery()`: Permite al Administrador A reactivar al Administrador B (y viceversa) con registro inmutable en `public.audit_logs`.

---

## 4. RECUPERACIÓN MUTUA Y RESILIENCIA

Si alguno de los dos administradores experimenta problemas de sincronización de rol o perfil:
1. El Administrador par protegido inicia sesión en el panel.
2. Accede a la pestaña **Seguridad**.
3. En el módulo de diagnóstico ejecuta **"Iniciar Verificación / Recuperación Mutua de Par"**.
4. La base de datos valida criptográficamente que el solicitante es el otro Super Admin protegido, restaura el rol `SUPER_ADMIN` y estado `ACTIVE`, y registra una auditoría de severidad `CRITICAL`.

---

## 5. GUÍA PARA EL PROPIETARIO DEL PROYECTO (SUPABASE DASHBOARD)

Si uno de los dos correos aún no se ha registrado por primera vez en la plataforma:
1. Ingrese a su panel en **Supabase Dashboard** -> **Authentication** -> **Users**.
2. Haga clic en **Add User** -> **Create User** o **Send Invite**.
3. Ingrese el correo correspondiente (`v19629049@gmail.com` o `pulsoplay2026@gmail.com`).
4. Al iniciar sesión por primera vez, el sistema sincronizará su perfil y activará sus capacidades protegidas.

---

## 6. AUDITORÍA INMUTABLE FORENSE

Todas las acciones administrativas, asignaciones de roles y procedimientos de recuperación mutua son persistidos en la tabla `public.audit_logs` con:
- `actor_id` y `actor_role`
- `action` (ej. `ASSIGN_USER_ROLE`, `PEER_ADMIN_RECOVERY`)
- `severity` (`CRITICAL`)
- Metadatos con timestamp, IPs y motivos justificados.
