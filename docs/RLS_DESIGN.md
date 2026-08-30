# 🔐 DISEÑO DE POLÍTICAS ROW LEVEL SECURITY (RLS) — RASPANDO LA OLLA

**Versión:** 2.1 (Fase 2.1 - Auditoría Exhaustiva de Políticas de Seguridad)  
**Estado:** 🔒 SAFE DEVELOPMENT MODE (No ejecución, diseño documental estricto)

---

## 1. Principios y Directivas Obligatorias de Seguridad

1. **Deny by Default:** Todo acceso que no esté explícitamente concedido por una política RLS se deniega automáticamente (`DENY`).
2. **RLS Habilitado al 100%:** Todas las tablas públicas ejecutan:
   ```sql
   ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;
   ALTER TABLE <tabla> FORCE ROW LEVEL SECURITY;
   ```
3. **Prohibición Estricta de `USING (true)` en Datos Sensibles:** Ninguna tabla con datos de balance, ledger, liquidaciones, auditoría, identidad o credenciales permite lectura abierta.
4. **Principio de Mínimo Privilegio:** Un usuario autenticado (`auth.uid()`) solo tiene visibilidad de sus propios registros directos.
5. **Funciones `SECURITY DEFINER` con `search_path` Explícito:** Toda función transaccional privilegiada fija `SET search_path = public, auth` para prevenir ataques de secuestro de esquema.
6. **Inmutabilidad Financiera:** `ledger_entries`, `game_settlements`, `game_settlement_recipients` y `audit_logs` deniegan `UPDATE` y `DELETE` para todos los roles incluidos administradores.

---

## 2. Matriz Exhaustiva de Permisos CRUD por Tabla y Rol

A continuación se detalla la matriz exacta de permisos CRUD para cada tabla del sistema (`PLAYER`, `OPERATOR`, `ADMIN`, `SUPER_ADMIN`). Cada operación denegada se especifica explícitamente como **DENY**.

---

### 2.1. `profiles`
* **Descripción:** Información de identidad, estado de cuenta y avatar de usuarios.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Solo su propio registro (`auth.uid() = user_id`) o campos públicos (`display_name`, `avatar_url`) de otros jugadores activos en su mesa.
    * `INSERT`: Solo su propio registro durante registro (`auth.uid() = user_id`).
    * `UPDATE`: Solo campos no críticos (`display_name`, `avatar_url`) de su propio registro (`auth.uid() = user_id`). Campos como `cedula_hash`, `account_status`, `is_phone_verified` son inmutables para el cliente.
    * `DELETE`: **DENY** (Soft-delete gestionado internamente).
  * **OPERATOR:**
    * `SELECT`: Lectura completa de perfiles para validación y soporte.
    * `INSERT`: **DENY**.
    * `UPDATE`: **DENY** (Solo cambios de estado vía funciones auditadas).
    * `DELETE`: **DENY**.
  * **ADMIN:**
    * `SELECT`: Lectura completa.
    * `INSERT`: **DENY**.
    * `UPDATE`: Modificación de `account_status` vía funciones `SECURITY DEFINER`.
    * `DELETE`: **DENY**.
  * **SUPER_ADMIN:**
    * `SELECT`: Lectura completa.
    * `INSERT`: **DENY**.
    * `UPDATE`: Gestión administrativa completa vía funciones auditadas.
    * `DELETE`: **DENY**.

---

### 2.2. `user_roles`
* **Descripción:** Asignación de roles en el sistema.
* **Matriz CRUD:**
  * **PLAYER:** `SELECT`: Solo su propio rol (`auth.uid() = user_id`) | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Solo su propio rol (`auth.uid() = user_id`) | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Consulta de roles | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todos | `INSERT`: Asignación auditada | `UPDATE`: Modificación auditada | `DELETE`: Revocación auditada.

---

### 2.3. `wallets`
* **Descripción:** Balances monetarios (`available_balance`, `held_balance`).
* **Matriz CRUD:**
  * **PLAYER:** `SELECT`: Solo su propio balance (`auth.uid() = user_id`) | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Solo balances de usuarios en disputas/revisión | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todos para auditoría contable | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** (creado por trigger de usuario) | `UPDATE`: **DENY** (modificado únicamente por triggers del ledger) | `DELETE`: **DENY**.

---

### 2.4. `ledger_entries`
* **Descripción:** Libro mayor de contabilidad inmutable de doble entrada.
* **Matriz CRUD:**
  * **PLAYER:** `SELECT`: Solo sus propios movimientos (`auth.uid() = user_id`) | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Lectura para soporte y conciliación | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Lectura para auditoría contable | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** (Solo vía funciones `SECURITY DEFINER` del ledger) | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

### 2.5. `payment_accounts`
* **Descripción:** Cuentas bancarias Pago Móvil registradas por usuarios.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Solo sus propias cuentas (`auth.uid() = user_id`).
    * `INSERT`: Solo sus propias cuentas (`auth.uid() = user_id`).
    * `UPDATE`: Solo marcar como activa/inactiva de sus cuentas.
    * `DELETE`: **DENY** (Soft delete vía `is_active = false`).
  * **OPERATOR:** `SELECT`: Cuentas del usuario bajo revisión de retiro | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Lectura para auditoría | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

### 2.6. `deposit_requests`
* **Descripción:** Solicitudes de recarga en Bolívares.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Solo sus propias solicitudes (`auth.uid() = user_id`).
    * `INSERT`: Solo para sí mismo con estado `PENDING` (`auth.uid() = user_id`).
    * `UPDATE`: Solo cancelar su propia solicitud si está en estado `PENDING`.
    * `DELETE`: **DENY**.
  * **OPERATOR:**
    * `SELECT`: Solicitudes pendientes y en revisión.
    * `INSERT`: **DENY**.
    * `UPDATE`: Solo transiciones de estado (`UNDER_REVIEW`, `APPROVED`, `REJECTED`) vía RPC auditado.
    * `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: Vía RPC auditado | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: Vía RPC auditado | `DELETE`: **DENY**.

---

### 2.7. `withdrawal_requests`
* **Descripción:** Solicitudes de retiro de fondos.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Solo sus propias solicitudes (`auth.uid() = user_id`).
    * `INSERT`: Solo vía función `request_withdrawal()` con validación MFA AAL2.
    * `UPDATE`: Solo cancelar su propia solicitud si está `PENDING`.
    * `DELETE`: **DENY**.
  * **OPERATOR:**
    * `SELECT`: Solicitudes para procesamiento bancario.
    * `INSERT`: **DENY**.
    * `UPDATE`: Procesar (`PROCESSING`, `COMPLETED`, `REJECTED`) vía RPC auditado.
    * `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: Vía RPC auditado | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: Vía RPC auditado | `DELETE`: **DENY**.

---

### 2.8. `game_tables`
* **Descripción:** Mesas de juego públicas y privadas.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Mesas `PUBLIC` con estado `OPEN`/`STARTING`/`ACTIVE`, y mesas `PRIVATE` donde es anfitrión o tiene invitación.
    * `INSERT`: Crear mesa vía función validada con saldo disponible suficiente.
    * `UPDATE`: Solo el host para cancelar mesa antes de iniciar (`status = 'OPEN'`).
    * `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: Cancelar mesas con incidencias | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: Gestión administrativa | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: Gestión administrativa | `DELETE`: **DENY**.

---

### 2.9. `game_table_players`
* **Descripción:** Asientos y participantes en mesas.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Participantes de la misma mesa y usuarios en lobby.
    * `INSERT`: Exclusivo de función `join_table()` `SECURITY DEFINER`.
    * `UPDATE`: Exclusivo de función `leave_table()` o cambio a `READY`.
    * `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

### 2.10. `game_sessions`
* **Descripción:** Partida activa y estado del juego.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Participantes de la sesión pueden leer `current_state`, `turn_deadline_at`, `winner_user_id` (`secret_state` protegido server-side).
    * `INSERT`: **DENY** (Iniciado por motor de juego).
    * `UPDATE`: **DENY** (Modificado por motor de juego).
    * `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Todas para monitoreo | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todas | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

### 2.11. `game_actions`
* **Descripción:** Historial de jugadas de cada partida.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Participantes de la partida.
    * `INSERT`: **DENY** (Registrado por motor de juego validando la jugada).
    * `UPDATE`: **DENY**.
    * `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Lectura para auditoría anti-trampas | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

### 2.12. `game_settlements`
* **Descripción:** Liquidación contable atómica de la partida bajo regla 90/10 o reembolso.
* **Matriz CRUD:**
  * **PLAYER:** `SELECT`: Participantes de la sesión liquidada (`auth.uid() IN (participantes)`) | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Lectura para conciliación | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** (Solo vía función `settle_game_session()`) | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

### 2.13. `game_settlement_recipients`
* **Descripción:** Desglose individual de pagos y reembolsos.
* **Matriz CRUD:**
  * **PLAYER:** `SELECT`: Solo su propio crédito o reembolso (`auth.uid() = user_id`) | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Lectura para conciliación | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

### 2.14. `kyc_verifications`
* **Descripción:** Documentos de identidad e historial de verificación.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Solo su propio expediente KYC (`auth.uid() = user_id`).
    * `INSERT`: Solo su propia solicitud (`auth.uid() = user_id AND status = 'PENDING'`).
    * `UPDATE`: **DENY**.
    * `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Todos los pendientes de revisión | `INSERT`: **DENY** | `UPDATE`: Aprobar/Rechazar vía función auditada | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: Vía función auditada | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: Vía función auditada | `DELETE`: **DENY**.

---

### 2.15. `audit_logs`
* **Descripción:** Registro forense inmutable del sistema.
* **Matriz CRUD:**
  * **PLAYER:** `SELECT`: **DENY** | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: **DENY** | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Lectura para auditoría | `INSERT`: **DENY** (Solo triggers y funciones `SECURITY DEFINER`) | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Lectura completa | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

### 2.16. `system_settings`
* **Descripción:** Configuración operativa global y límites.
* **Matriz CRUD:**
  * **PLAYER:** `SELECT`: Solo registros donde `is_public = TRUE` | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: Modificación auditada | `DELETE`: **DENY**.

---

### 2.17. `support_tickets`
* **Descripción:** Tickets de soporte y resolución de disputas.
* **Matriz CRUD:**
  * **PLAYER:**
    * `SELECT`: Solo sus propios tickets (`auth.uid() = user_id`).
    * `INSERT`: Crear ticket para sí mismo (`auth.uid() = user_id`).
    * `UPDATE`: Agregar mensaje a su propio ticket abierto.
    * `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: Tickets asignados o abiertos | `INSERT`: **DENY** | `UPDATE`: Responder y cambiar estado | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: Reasignar y gestionar | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: Todos | `INSERT`: **DENY** | `UPDATE`: Gestión completa | `DELETE`: **DENY**.

---

### 2.18. `notifications`
* **Descripción:** Avisos al usuario sobre eventos y saldos.
* **Matriz CRUD:**
  * **PLAYER:** `SELECT`: Solo sus notificaciones (`auth.uid() = user_id`) | `INSERT`: **DENY** | `UPDATE`: Marcar como leída (`is_read = true`) | `DELETE`: **DENY**.
  * **OPERATOR:** `SELECT`: **DENY** | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **ADMIN:** `SELECT`: **DENY** | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.
  * **SUPER_ADMIN:** `SELECT`: **DENY** | `INSERT`: **DENY** | `UPDATE`: **DENY** | `DELETE`: **DENY**.

---

## 3. Seguridad en Canales de Supabase Realtime

1. **Canales de Sala de Juego (`room:table_id`):**
   - **Presencia (Presence):** Solo transmite `user_id`, `display_name`, `avatar_url`, `seat_number`, `status`.
   - **Eventos de Juego (Broadcast):** Solo transmite jugadas validadas por el servidor y eventos de reloj (`turn_timeout`, `dice_roll_revealed`).
   - **Prohibición de Datos Sensibles:** NUNCA transmitir por Realtime:
     - Documentos de identidad (Cédulas completas).
     - Datos bancarios de recargas/retiros ajenos.
     - Estados ocultos de otros jugadores (ej: cartas del rival en Truco antes de jugarlas).
     - Secretos o llaves privilegiadas.
2. **Filtrado de Publicaciones Postgres Changes:**
   - La publicación de cambios en base de datos (`supabase_realtime`) SOLO incluye las tablas `game_tables`, `game_table_players`, `game_sessions` y `notifications`.
   - Tablas contables (`wallets`, `ledger_entries`, `game_settlements`, `deposit_requests`, `withdrawal_requests`) se consumen exclusivamente bajo suscripciones seguras filtradas por el ID del usuario o consultas autenticadas vía RLS.
