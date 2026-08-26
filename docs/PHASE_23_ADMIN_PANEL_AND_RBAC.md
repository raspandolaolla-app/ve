# FASE 23 — PANEL ADMINISTRATIVO PROFESIONAL Y RBAC EXCLUSIVO

## 1. Resumen Ejecutivo
En la Fase 23 se ha implementado la consola administrativa profesional, centralizada y de alto rendimiento para **RASPANDO LA OLLA**. Todo el control administrativo está verificado en servidor mediante políticas Row Level Security (RLS) y funciones RPC en Supabase, garantizando que la seguridad no dependa únicamente de componentes visuales en React.

---

## 2. Administradores Únicos y Exclusivos (SUPER_ADMIN)
De acuerdo con las directivas inmutables de seguridad:
- **`v19629049@gmail.com`**
- **`pulsoplay2026@gmail.com`**

### Reglas de Seguridad Aplicadas:
1. **Verificación Estricta en Servidor:** Las funciones RPC y políticas RLS verifican contra la tabla `user_roles` y el correo autenticado en `auth.users`.
2. **Inmutabilidad de SUPER_ADMIN:** Ningún rol `PLAYER`, `OPERATOR` o `ADMIN` puede elevarse a `SUPER_ADMIN` desde la aplicación.
3. **Protección Frontend y Backend:** Si un usuario no autorizado intenta acceder o invocar métodos de administración, la solicitud es rechazada inmediatamente tanto en frontend como a nivel de base de datos con código `403 / Forbidden`.

---

## 3. Módulos y Pestañas Implementadas (14 Módulos)

| # | Módulo | Componente | Descripción |
|---|---|---|---|
| 1 | **Dashboard** | `AdminDashboardTab.tsx` | KPIs en tiempo real: usuarios activos, mesas en curso, volumen jugado, comisiones retenidas (10%), premios (90%) y alertas de seguridad. |
| 2 | **Usuarios** | `AdminUsersTab.tsx` | Gestión de cuentas: activar, suspender, bloquear con motivo obligatorio, asignación de roles controlada (solo Super Admin). |
| 3 | **Recargas** | `AdminDepositsTab.tsx` | Aprobación/Rechazo de depósitos vía Pago Móvil / Transferencias con validación idempotente y acreditación atómica. |
| 4 | **Retiros** | `AdminWithdrawalsTab.tsx` | Procesamiento seguro de retiros con captura de referencia bancaria o rechazo justificado con reembolso automático. |
| 5 | **Billeteras** | `AdminWalletsTab.tsx` | Supervisión de balances (disponible, bloqueado, total) y libro mayor contable (ledger auditado). Prohibida la edición arbitraria de saldo. |
| 6 | **Mesas** | `AdminTablesTab.tsx` | Monitoreo en vivo de mesas, estados (WAITING, IN_GAME, FINISHED, CANCELLED) y cancelación de emergencia con reembolso. |
| 7 | **Partidas** | `AdminMatchesTab.tsx` | Inspección detallada de partidas terminadas, rondas, ganadores, pozos y comisiones. |
| 8 | **Juegos** | `AdminGamesTab.tsx` | Catálogo de los 8 juegos de la plataforma: activación/desactivación de modalidades y mantenimiento selectivo. |
| 9 | **Soporte** | `AdminSupportTab.tsx` | Mesa de ayuda y tickets de usuarios con gestión de estados (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`). |
| 10 | **Alertas** | `AdminNotificationsTab.tsx` | Sistema de notificaciones operativas y alertas prioritarias para el equipo administrativo. |
| 11 | **Auditoría** | `AdminAuditTab.tsx` | Registro cronológico e inmutable de todas las acciones administrativas con actor, IP, timestamp y severidad. |
| 12 | **Ajustes** | `AdminSettingsTab.tsx` | Configuración de parámetros globales: comisiones de servicio, límites de depósito/retiro y modo mantenimiento. |
| 13 | **Seguridad** | `AdminSecurityTab.tsx` | Vista exclusiva para Super Admins con verificación de lista blanca, políticas RLS activas e integridad de credenciales. |
| 14 | **Reportes** | `AdminReportsTab.tsx` | Métricas financieras consolidadas, distribución de premios y análisis de volumen por período. |

---

## 4. Integridad Financiera y Auditoría
- **Sin Manipulación Directa de Saldos:** Toda operación financiera se realiza mediante las RPCs idempotentes `approve_deposit_request`, `complete_withdrawal_request`, y `reject_withdrawal_request`.
- **Registro de Auditoría Automático:** Cualquier cambio de estado, aprobación, rechazo o ajuste genera una entrada inmediata en `audit_logs`.

---

## 5. Verificación de Compilación y Estado
- **TypeScript:** Verificado sin errores (`tsc --noEmit`).
- **Build de Producción:** Verificado exitosamente con Vite.
