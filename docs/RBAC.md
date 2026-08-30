# 🛡️ MATRIZ DE CONTROL DE ACCESO BASADO EN ROLES (RBAC) — RASPANDO LA OLLA

**Versión:** 2.0 (Fase 2 - Diseño de Autorizaciones)  
**Estado:** 🔒 SAFE DEVELOPMENT MODE

---

## 1. Definición de Roles del Sistema

| Rol | Propósito | Nivel de Privilegios |
| :--- | :--- | :--- |
| **`PLAYER`** | Jugador regular de la plataforma | Acceso a sus propios datos, lobby de juegos, mesas públicas, mesas Trancaíto, depósitos y retiros propios. |
| **`OPERATOR`** | Personal de atención y operaciones diarias | Verificación de depósitos bancarios, revisión inicial de KYC, procesamiento de retiros y atención de tickets de soporte. |
| **`ADMIN`** | Administrador de operaciones y cumplimiento | Gestión de usuarios, resolución de disputas de partidas, auditoría, bloqueo de cuentas dudosas y reportes operacionales. |
| **`SUPER_ADMIN`** | Máxima autoridad del sistema y oficiales de cumplimiento | Asignación de roles, modificación de límites y comisiones, ajustes contables justificados y configuración del sistema. |

---

## 2. Matriz Detallada de Permisos por Acción

| Acción del Sistema | `PLAYER` | `OPERATOR` | `ADMIN` | `SUPER_ADMIN` | Mecanismo de Enforzamiento |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Ver catálogo de juegos y mesas públicas** | ✅ | ✅ | ✅ | ✅ | RLS en `game_tables` (status = 'OPEN') |
| **Crear / Unirse a mesa pública o Trancaíto** | ✅ | ✅ | ✅ | ✅ | RPC `join_game_table()` con validación de balance |
| **Consultar su propio perfil y saldo** | ✅ | ✅ | ✅ | ✅ | RLS (`auth.uid() = user_id`) |
| **Consultar perfiles privados ajenos (cédula/teléfono)**| ❌ | ❌ | ❌ | ❌ | Prohibido en API pública / Solo hash |
| **Ver datos operativos de usuarios (KYC/documentos)** | ❌ | ✅ | ✅ | ✅ | RLS en `kyc_verifications` |
| **Crear solicitud de recarga (Pago Móvil)** | ✅ | ❌ | ❌ | ❌ | RLS en `deposit_requests` |
| **Aprobar / Rechazar solicitud de recarga** | ❌ | ✅ | ✅ | ✅ | RPC transaccional `approve_deposit()` |
| **Crear solicitud de retiro (con MFA obligatorio)** | ✅ | ❌ | ❌ | ❌ | RPC `request_withdrawal()` con check AAL2 |
| **Aprobar / Procesar solicitud de retiro** | ❌ | ✅ | ✅ | ✅ | RPC `process_withdrawal()` |
| **Bloquear / Suspender cuenta de usuario** | ❌ | ❌ | ✅ | ✅ | RPC `update_account_status()` auditado |
| **Desbloquear cuenta de usuario** | ❌ | ❌ | ✅ | ✅ | RPC `update_account_status()` auditado |
| **Consultar logs de auditoría forense** | ❌ | ❌ | ✅ | ✅ | RLS en `audit_logs` |
| **Modificar comisión de la plataforma (10%)** | ❌ | ❌ | ❌ | ✅ | RPC `update_system_setting()` auditado |
| **Modificar límites de recarga y retiro** | ❌ | ❌ | ❌ | ✅ | RPC `update_system_setting()` auditado |
| **Asignar roles (`OPERATOR`, `ADMIN`)** | ❌ | ❌ | ❌ | ✅ | RPC `grant_user_role()` auditado |
| **Asignar rol `SUPER_ADMIN`** | ❌ | ❌ | ❌ | 🔒 Exclusivo DB | Asignación directa controlada en servidor |
| **Intervenir o cancelar partida en disputa** | ❌ | ❌ | ✅ | ✅ | RPC `admin_cancel_session()` con refund |
| **Ejecutar ajuste contable manual en ledger** | ❌ | ❌ | ❌ | ✅ | RPC `admin_adjust_ledger()` con doble firma |

---

## 3. Principio de No Auto-Escalación (Anti-Escalation)

1. **Inmutabilidad del Cliente:** Ningún rol se almacena en `localStorage`, cookies del navegador o metadata editable por el usuario.
2. **Autoridad en Base de Datos:** La pertenencia a un rol se verifica siempre mediante la función PostgreSQL `has_role(auth.uid(), 'REQUIRED_ROLE')` dentro de las políticas RLS y funciones `SECURITY DEFINER`.
3. **Restricción de `SUPER_ADMIN`:** No existe ninguna ruta en la aplicación frontend que permita auto-declararse `SUPER_ADMIN`. La creación inicial de cuentas de super administración se realiza mediante semilla protegida de base de datos en despliegues controlados.

---

## 4. Función de Verificación Server-Side (PostgreSQL Helper)

```sql
-- Función auxiliar para evaluar roles en políticas RLS (Diseño Conceptual)
CREATE OR REPLACE FUNCTION auth_has_role(required_role app_role_enum)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND (
        role = required_role 
        OR role = 'SUPER_ADMIN' 
        OR (required_role = 'OPERATOR' AND role = 'ADMIN')
      )
  );
$$;
```
