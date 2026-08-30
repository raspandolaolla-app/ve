# 🗄️ DISEÑO MAESTRO DE BASE DE DATOS — RASPANDO LA OLLA

**Versión:** 2.0 (Fase 2 - Diseño Arquitectónico)  
**Estado:** 🔒 SAFE DEVELOPMENT MODE (Solo Diseño / Sin Ejecución)  
**Motor:** PostgreSQL 15+ en Supabase con Row Level Security (RLS) y Extensiones Criptográficas (`pgcrypto`, `uuid-ossp`).

---

## 1. Principios Rectores del Esquema

1. **Fuente Única de Verdad:** Supabase/PostgreSQL es la autoridad contable, de identidad, reglas de juego y liquidación.
2. **Ledger Inmutable (Append-Only):** El saldo de un usuario no es un valor numérico directamente editable; es la resultante de asientos de débito, crédito y retención respaldados por transacciones atómicas.
3. **Privacidad de Identidad (Data Minimization):** La cédula de identidad venezolana nunca se almacena en texto plano en campos públicos; se utiliza `cedula_hash` para unicidad y `cedula_last4` para visualización del titular.
4. **Idempotencia Estricta:** Toda operación transaccional (entrada a mesa, compra de cartón, recarga, retiro, liquidación) incluye `idempotency_key` y bloqueo de fila (`FOR UPDATE`).
5. **Separación de Estados:** Las tablas de estado mutable (`wallets`, `game_sessions`, `game_tables`) mantienen coherencia mediante transacciones `ACID` y triggers de integridad referencial.

---

## 2. Tipos Enumerados (Custom ENUMs)

```sql
-- Estados de Cuenta de Usuario
CREATE TYPE account_status_enum AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED');

-- Estados de Verificación KYC
CREATE TYPE kyc_status_enum AS ENUM ('UNSUBMITTED', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_MORE_INFORMATION');

-- Roles del Sistema (RBAC)
CREATE TYPE app_role_enum AS ENUM ('PLAYER', 'OPERATOR', 'ADMIN', 'SUPER_ADMIN');

-- Tipos de Juegos Soportados
CREATE TYPE game_type_enum AS ENUM (
  'BINGO',
  'ATRAPAITO',
  'DOMINO_VENEZOLANO',
  'TRUCO_VENEZOLANO',
  'DAMAS',
  'POLLA_VENEZOLANA',
  'TRES_EN_RAYA',
  'PIEDRA_PAPEL_TIJERA'
);

-- Visibilidad de Mesas
CREATE TYPE table_visibility_enum AS ENUM ('PUBLIC', 'PRIVATE');

-- Estados de Mesa
CREATE TYPE table_status_enum AS ENUM ('OPEN', 'FULL', 'STARTING', 'ACTIVE', 'CLOSED', 'EXPIRED', 'CANCELLED');

-- Estados de Sesión de Partida
CREATE TYPE session_status_enum AS ENUM ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED', 'FINISHED', 'CANCELLED', 'ABANDONED', 'SETTLED');

-- Estados del Jugador en Mesa
CREATE TYPE player_table_status_enum AS ENUM ('JOINED', 'READY', 'PLAYING', 'DISCONNECTED', 'LEFT', 'ELIMINATED');

-- Tipos de Movimientos Contables en Ledger
CREATE TYPE ledger_entry_type_enum AS ENUM (
  'DEPOSIT_CREDIT',        -- Acreditación por recarga aprobada
  'WITHDRAWAL_HOLD',       -- Retención por solicitud de retiro
  'WITHDRAWAL_CAPTURE',    -- Débito definitivo por retiro procesado
  'WITHDRAWAL_RELEASE',    -- Liberación por retiro rechazado/cancelado
  'TABLE_ENTRY_HOLD',      -- Retención de entrada al unirse a mesa
  'TABLE_ENTRY_CAPTURE',   -- Captura de pozo al iniciar partida
  'TABLE_ENTRY_REFUND',    -- Reembolso de entrada por cancelación/empate sin cobro de comisión
  'GAME_PRIZE_CREDIT',     -- Acreditación individual de premio (parte proporcional del 90% pozo)
  'PLATFORM_FEE_CREDIT',   -- 10% Comisión de servicio a cuenta de plataforma
  'ADMIN_ADJUSTMENT'       -- Ajuste auditado por super admin
);

-- Tipos de Liquidación de Partida (Settlement Type)
CREATE TYPE settlement_type_enum AS ENUM (
  'STANDARD_PAYOUT',       -- Ganador único (90% premio / 10% comisión)
  'SPLIT_PAYOUT',          -- Múltiples ganadores o equipo (90% dividido proporcionalmente / 10% comisión)
  'DRAW_REFUND',           -- Empate con devolución íntegra (100% reembolso / 0% comisión)
  'ADMIN_CANCEL_REFUND'    -- Cancelación administrativa (100% reembolso / 0% comisión)
);

-- Dirección Contable
CREATE TYPE ledger_direction_enum AS ENUM ('CREDIT', 'DEBIT', 'HOLD', 'RELEASE');

-- Estados de Solicitudes de Recarga
CREATE TYPE deposit_status_enum AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- Estados de Solicitudes de Retiro
CREATE TYPE withdrawal_status_enum AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED');

-- Nivel de Seguridad de Auditoría
CREATE TYPE audit_severity_enum AS ENUM ('INFO', 'WARNING', 'SECURITY_ALERT', 'CRITICAL');
```

---

## 3. Catálogo Detallado de Tablas

---

### 3.1. `profiles`
* **Propósito:** Almacenar la información de identidad, ubicación y estado civil-legal del usuario vinculada a `auth.users`.
* **Sensibilidad:** ALTA (Datos personales protegidos).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`): Identificador de perfil.
  * `user_id` (`UUID`, FK `auth.users.id`, NOT NULL, UNIQUE): Enlace 1:1 con la autenticación de Supabase.
  * `first_name` (`VARCHAR(80)`, NOT NULL): Primer nombre.
  * `last_name` (`VARCHAR(80)`, NOT NULL): Primer apellido.
  * `display_name` (`VARCHAR(50)`, NOT NULL): Alias público mostrado a otros jugadores.
  * `avatar_url` (`TEXT`, NULL): URL de imagen pública o avatar predeterminado.
  * `cedula_hash` (`VARCHAR(64)`, NOT NULL, UNIQUE): SHA-256 de la cédula normalizada (`V12345678`) para control de unicidad.
  * `cedula_last4` (`VARCHAR(4)`, NOT NULL): Últimos 4 dígitos para visualización del titular (`V-***456`).
  * `phone_number` (`VARCHAR(20)`, NOT NULL): Número telefónico (ej: `+584121234567`).
  * `state_venezuela` (`VARCHAR(50)`, NOT NULL): Estado de residencia en Venezuela.
  * `birth_date` (`DATE`, NOT NULL): Fecha de nacimiento (validada >= 18 años).
  * `account_status` (`account_status_enum`, NOT NULL, DEFAULT `'PENDING_VERIFICATION'`): Estado de la cuenta.
  * `kyc_status` (`kyc_status_enum`, NOT NULL, DEFAULT `'UNSUBMITTED'`): Estado de verificación de identidad.
  * `is_mfa_enabled` (`BOOLEAN`, NOT NULL, DEFAULT `FALSE`): Indicador de 2FA/TOTP activado.
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`): Fecha de registro.
  * `updated_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`): Fecha de última modificación.
* **Restricciones (CHECK & UNIQUE):**
  * `UNIQUE (user_id)`
  * `UNIQUE (cedula_hash)`
  * `CHECK (birth_date <= (CURRENT_DATE - INTERVAL '18 years'))` — Garantía server-side de 18+ años.
* **Índices:** `user_id`, `cedula_hash`, `account_status`.
* **Políticas RLS:**
  * `SELECT`: El usuario autenticado solo puede leer su propio perfil (`auth.uid() = user_id`). Operadores y Admins según RBAC.
  * `INSERT`: Solo a través del trigger/función de creación de usuario autenticado.
  * `UPDATE`: El usuario puede editar campos no críticos (`display_name`, `avatar_url`). Campos críticos (`account_status`, `kyc_status`) solo por función `SECURITY DEFINER` o administradores.
  * `DELETE`: Prohibido (Soft delete vía `account_status = 'CLOSED'`).

---

### 3.2. `user_roles`
* **Propósito:** Mapeo de roles de usuario para el sistema de control de acceso basado en roles (RBAC).
* **Sensibilidad:** CRÍTICA (Autoridad del sistema).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `role` (`app_role_enum`, NOT NULL, DEFAULT `'PLAYER'`)
  * `granted_by` (`UUID`, FK `auth.users.id`, NULL): Administrador que otorgó el rol.
  * `granted_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Restricciones:** `UNIQUE (user_id, role)`.
* **Políticas RLS:**
  * `SELECT`: El usuario puede consultar su propio rol. Admins pueden consultar todos.
  * `INSERT / UPDATE / DELETE`: Exclusivo de `SUPER_ADMIN` auditado mediante RPC `SECURITY DEFINER`.

---

### 3.3. `wallets`
* **Propósito:** Registro de saldos operativos del usuario.
* **Sensibilidad:** CRÍTICA (Patrimonial).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL, UNIQUE)
  * `currency` (`VARCHAR(3)`, NOT NULL, DEFAULT `'VES'`)
  * `available_balance` (`NUMERIC(14,2)`, NOT NULL, DEFAULT `0.00`)
  * `held_balance` (`NUMERIC(14,2)`, NOT NULL, DEFAULT `0.00`)
  * `total_balance` (`NUMERIC(14,2)` GENERATED ALWAYS AS (`available_balance` + `held_balance`) STORED)
  * `updated_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Restricciones (CHECK):**
  * `CHECK (available_balance >= 0.00)`
  * `CHECK (held_balance >= 0.00)`
  * `CHECK (currency = 'VES')`
* **Políticas RLS:**
  * `SELECT`: El usuario solo puede consultar su propio wallet (`auth.uid() = user_id`).
  * `INSERT / UPDATE / DELETE`: Ningún usuario directo por SQL. Las modificaciones son efectuadas EXCLUSIVAMENTE por triggers o funciones transaccionales de ledger (`SECURITY DEFINER`).

---

### 3.4. `ledger_entries`
* **Propósito:** Libro contable inmutable de doble entrada / movimientos patrimoniales.
* **Sensibilidad:** CRÍTICA (Auditoría contable inmutable).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `wallet_id` (`UUID`, FK `wallets.id`, NOT NULL)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `entry_type` (`ledger_entry_type_enum`, NOT NULL)
  * `direction` (`ledger_direction_enum`, NOT NULL)
  * `amount` (`NUMERIC(14,2)`, NOT NULL)
  * `balance_after_available` (`NUMERIC(14,2)`, NOT NULL)
  * `balance_after_held` (`NUMERIC(14,2)`, NOT NULL)
  * `reference_table` (`VARCHAR(50)`, NOT NULL) -- ej: 'deposit_requests', 'game_settlements'
  * `reference_id` (`UUID`, NOT NULL)
  * `idempotency_key` (`VARCHAR(100)`, NOT NULL, UNIQUE)
  * `description` (`TEXT`, NOT NULL)
  * `actor_id` (`UUID`, NULL) -- Usuario o System Worker
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Restricciones:**
  * `CHECK (amount > 0.00)`
  * `UNIQUE (idempotency_key)`
* **Políticas RLS:**
  * `SELECT`: El usuario puede consultar su propio historial de movimientos.
  * `INSERT`: Solo funciones `SECURITY DEFINER` contables.
  * `UPDATE / DELETE`: PROHIBIDO TOTALMENTE (Tabla Append-Only).

---

### 3.5. `payment_accounts`
* **Propósito:** Cuentas bancarias registradas por el usuario para Pago Móvil venezolano.
* **Sensibilidad:** ALTA (Datos bancarios).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `bank_code` (`VARCHAR(4)`, NOT NULL) -- Código bancario (ej: '0102', '0105')
  * `bank_name` (`VARCHAR(100)`, NOT NULL)
  * `phone_number` (`VARCHAR(20)`, NOT NULL)
  * `id_number_masked` (`VARCHAR(20)`, NOT NULL) -- Cédula del titular de la cuenta
  * `is_verified` (`BOOLEAN`, NOT NULL, DEFAULT `FALSE`)
  * `is_default` (`BOOLEAN`, NOT NULL, DEFAULT `FALSE`)
  * `is_active` (`BOOLEAN`, NOT NULL, DEFAULT `TRUE`)
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Políticas RLS:**
  * `SELECT / INSERT / UPDATE`: El usuario solo sobre sus propias cuentas (`auth.uid() = user_id`).
  * `DELETE`: Soft delete mediante `is_active = FALSE`.

---

### 3.6. `deposit_requests`
* **Propósito:** Registro y control del flujo de recargas por Pago Móvil.
* **Sensibilidad:** CRÍTICA.
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `amount` (`NUMERIC(14,2)`, NOT NULL)
  * `currency` (`VARCHAR(3)`, NOT NULL, DEFAULT `'VES'`)
  * `origin_bank_code` (`VARCHAR(4)`, NOT NULL)
  * `origin_phone` (`VARCHAR(20)`, NOT NULL)
  * `destination_account_id` (`UUID`, NOT NULL) -- Cuenta bancaria receptora de la plataforma
  * `reference_number` (`VARCHAR(50)`, NOT NULL) -- Número de comprobante / referencia bancaria
  * `payment_date` (`DATE`, NOT NULL)
  * `status` (`deposit_status_enum`, NOT NULL, DEFAULT `'PENDING'`)
  * `reviewed_by` (`UUID`, FK `auth.users.id`, NULL)
  * `reviewed_at` (`TIMESTAMPTZ`, NULL)
  * `rejection_reason` (`TEXT`, NULL)
  * `idempotency_key` (`VARCHAR(100)`, NOT NULL, UNIQUE)
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Restricciones:**
  * `CHECK (amount >= 50.00)` -- Monto mínimo configurable
  * `UNIQUE (origin_bank_code, reference_number, payment_date)` -- Evita doble canje de comprobante
* **Políticas RLS:**
  * `SELECT`: El usuario puede ver sus propias solicitudes. Operadores ven pendientes.
  * `INSERT`: El usuario crea su solicitud.
  * `UPDATE`: Solo Operadores/Admins mediante función transaccional de acreditación.

---

### 3.7. `withdrawal_requests`
* **Propósito:** Control de solicitudes de retiro de fondos hacia Pago Móvil.
* **Sensibilidad:** CRÍTICA (Retiro patrimonial con MFA obligatorio).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `payment_account_id` (`UUID`, FK `payment_accounts.id`, NOT NULL)
  * `amount` (`NUMERIC(14,2)`, NOT NULL)
  * `currency` (`VARCHAR(3)`, NOT NULL, DEFAULT `'VES'`)
  * `status` (`withdrawal_status_enum`, NOT NULL, DEFAULT `'PENDING'`)
  * `mfa_verified_at` (`TIMESTAMPTZ`, NOT NULL) -- Timestamp de validación 2FA/AAL2 en Supabase Auth
  * `processed_by` (`UUID`, FK `auth.users.id`, NULL)
  * `bank_reference` (`VARCHAR(50)`, NULL)
  * `rejection_reason` (`TEXT`, NULL)
  * `idempotency_key` (`VARCHAR(100)`, NOT NULL, UNIQUE)
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
  * `completed_at` (`TIMESTAMPTZ`, NULL)
* **Restricciones:**
  * `CHECK (amount >= 100.00)`
* **Políticas RLS:**
  * `SELECT`: El usuario solo sobre sus retiros. Operadores ven solicitudes para procesamiento.
  * `INSERT`: Solo usuario con saldo disponible verificado y MFA AAL2 validado vía RPC.
  * `UPDATE`: Solo Operadores/Admins vía función de procesamiento de retiros.

---

### 3.8. `game_tables`
* **Propósito:** Registro de mesas de juego (públicas y Trancaíto privadas).
* **Sensibilidad:** MEDIA.
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `game_type` (`game_type_enum`, NOT NULL)
  * `host_user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `visibility` (`table_visibility_enum`, NOT NULL, DEFAULT `'PUBLIC'`)
  * `invite_code` (`VARCHAR(12)`, NULL, UNIQUE) -- Token no predecible para Trancaíto
  * `entry_fee` (`NUMERIC(14,2)`, NOT NULL)
  * `min_players` (`SMALLINT`, NOT NULL, DEFAULT 2)
  * `max_players` (`SMALLINT`, NOT NULL)
  * `current_players_count` (`SMALLINT`, NOT NULL, DEFAULT 1)
  * `status` (`table_status_enum`, NOT NULL, DEFAULT `'OPEN'`)
  * `config` (`JSONB`, NOT NULL, DEFAULT `'{}'::jsonb`) -- Reglas específicas del juego (ej: puntos en dominó)
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
  * `expires_at` (`TIMESTAMPTZ`, NOT NULL)
* **Restricciones:**
  * `CHECK (entry_fee >= 0.00)`
  * `CHECK (max_players >= min_players)`
  * `CHECK (current_players_count <= max_players)`
* **Políticas RLS:**
  * `SELECT`:
    * Mesas `PUBLIC` con `status = 'OPEN'`: Lectura pública para usuarios autenticados.
    * Mesas `PRIVATE`: Solo jugadores con `invite_code` válido o participantes ya registrados.
  * `INSERT`: Jugador autenticado con saldo >= `entry_fee`.
  * `UPDATE`: Solo motor de juego / funciones `SECURITY DEFINER`.

---

### 3.9. `game_table_players`
* **Propósito:** Registro de participantes asignados a asientos en una mesa.
* **Sensibilidad:** MEDIA.
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `table_id` (`UUID`, FK `game_tables.id` ON DELETE RESTRICT, NOT NULL)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `seat_number` (`SMALLINT`, NOT NULL)
  * `team_number` (`SMALLINT`, NULL) -- Para juegos en pareja (ej: Dominó 2v2)
  * `status` (`player_table_status_enum`, NOT NULL, DEFAULT `'JOINED'`)
  * `entry_held_entry_id` (`UUID`, FK `ledger_entries.id`, NULL)
  * `joined_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
  * `left_at` (`TIMESTAMPTZ`, NULL)
* **Restricciones:**
  * `UNIQUE (table_id, user_id)` -- Un jugador no puede ocupar dos asientos en la misma mesa
  * `UNIQUE (table_id, seat_number)` -- Dos jugadores no pueden ocupar el mismo asiento
* **Políticas RLS:**
  * `SELECT`: Participantes de la misma mesa y usuarios en el lobby.
  * `INSERT / UPDATE`: Exclusivo de funciones `SECURITY DEFINER` (`join_table`, `leave_table`).

---

### 3.10. `game_sessions`
* **Propósito:** Partida activa o concluida dentro de una mesa.
* **Sensibilidad:** ALTA (Determina resultados y adjudicación de premios).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `table_id` (`UUID`, FK `game_tables.id`, NOT NULL)
  * `game_type` (`game_type_enum`, NOT NULL)
  * `session_number` (`INT`, NOT NULL, DEFAULT 1)
  * `status` (`session_status_enum`, NOT NULL, DEFAULT `'WAITING'`)
  * `current_state` (`JSONB`, NOT NULL, DEFAULT `'{}'::jsonb`) -- Estado público del tablero/partida
  * `secret_state` (`JSONB`, NOT NULL, DEFAULT `'{}'::jsonb`) -- Estado oculto server-side (manos de cartas, fichas no reveladas)
  * `current_turn_user_id` (`UUID`, FK `profiles.user_id`, NULL)
  * `turn_deadline_at` (`TIMESTAMPTZ`, NULL)
  * `winner_user_id` (`UUID`, FK `profiles.user_id`, NULL)
  * `winner_team` (`SMALLINT`, NULL)
  * `started_at` (`TIMESTAMPTZ`, NULL)
  * `ended_at` (`TIMESTAMPTZ`, NULL)
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Políticas RLS:**
  * `SELECT`: Participantes de la sesión pueden leer `current_state`, `turn_deadline_at`, `winner_user_id`. `secret_state` se oculta mediante vistas o funciones.
  * `INSERT / UPDATE`: Solo motor de juego en Edge Functions / RPC.

---

### 3.11. `game_actions`
* **Propósito:** Registro inmutable de cada jugada / acción enviada y procesada por el motor.
* **Sensibilidad:** ALTA (Auditoría anti-trampas y repetición de partida).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `session_id` (`UUID`, FK `game_sessions.id`, NOT NULL)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `sequence_number` (`INT`, NOT NULL) -- Secuencia incremental 1, 2, 3...
  * `action_type` (`VARCHAR(50)`, NOT NULL) -- ej: 'PLAY_DOMINO_TILE', 'CALL_TRUCO', 'COMMIT_MOVE'
  * `payload` (`JSONB`, NOT NULL)
  * `is_valid` (`BOOLEAN`, NOT NULL, DEFAULT `TRUE`)
  * `server_state_hash` (`VARCHAR(64)`, NOT NULL) -- Hash SHA-256 del estado resultante
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Restricciones:**
  * `UNIQUE (session_id, sequence_number)`
* **Políticas RLS:**
  * `SELECT`: Participantes de la partida.
  * `INSERT`: Solo motor de juego validado.

---

### 3.12. `game_settlements`
* **Propósito:** Liquidación contable definitiva y atómica de la partida bajo la **Regla 90/10** o Reembolso por Empate/Cancelación.
* **Sensibilidad:** CRÍTICA (Operación atómica de pago).
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `session_id` (`UUID`, FK `game_sessions.id`, NOT NULL, UNIQUE) -- Exactamente 1 liquidación por sesión
  * `table_id` (`UUID`, FK `game_tables.id`, NOT NULL)
  * `settlement_type` (`settlement_type_enum`, NOT NULL, DEFAULT `'STANDARD_PAYOUT'`)
  * `gross_pool` (`NUMERIC(14,2)`, NOT NULL) -- 100% total recaudado por entradas válidas
  * `prize_pool` (`NUMERIC(14,2)`, NOT NULL) -- 90% en premios (o 0.00 si es DRAW_REFUND / ADMIN_CANCEL_REFUND)
  * `platform_fee` (`NUMERIC(14,2)`, NOT NULL) -- 10% comisión de servicio (o 0.00 si es DRAW_REFUND / ADMIN_CANCEL_REFUND)
  * `total_distributed` (`NUMERIC(14,2)`, NOT NULL) -- Suma total distribuida a usuarios
  * `idempotency_key` (`VARCHAR(100)`, NOT NULL, UNIQUE)
  * `settled_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
  * `settled_by` (`VARCHAR(50)`, NOT NULL, DEFAULT `'SERVER_ENGINE'`)
* **Restricciones (Invariantes Financieras):**
  * `CHECK (gross_pool >= 0.00)`
  * `CHECK (prize_pool >= 0.00)`
  * `CHECK (platform_fee >= 0.00)`
  * `CHECK (
      (settlement_type IN ('STANDARD_PAYOUT', 'SPLIT_PAYOUT') 
        AND prize_pool = ROUND(gross_pool * 0.90, 2) 
        AND platform_fee = gross_pool - prize_pool
        AND prize_pool + platform_fee = gross_pool
        AND total_distributed = prize_pool)
      OR
      (settlement_type IN ('DRAW_REFUND', 'ADMIN_CANCEL_REFUND')
        AND prize_pool = 0.00
        AND platform_fee = 0.00
        AND total_distributed = gross_pool)
    )`
  * `UNIQUE (session_id)` -- Garantía anti-doble liquidación
* **Políticas RLS:**
  * `SELECT`: Participantes de la partida y Administradores.
  * `INSERT`: Exclusivo de función `SECURITY DEFINER` `settle_game_session()`.
  * `UPDATE / DELETE`: ESTRICTAMENTE PROHIBIDO (Inmutable).

---

### 3.12.1. `game_settlement_recipients`
* **Propósito:** Desglose individual de acreditaciones a ganadores o participantes reembolsados (Soporta 1 ganador, equipos 2v2, empates o devoluciones).
* **Sensibilidad:** CRÍTICA.
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `settlement_id` (`UUID`, FK `game_settlements.id` ON DELETE RESTRICT, NOT NULL)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `team_number` (`SMALLINT`, NULL) -- 1 o 2 para juegos en parejas (ej: Dominó 2v2, Truco 2v2)
  * `payout_amount` (`NUMERIC(14,2)`, NOT NULL)
  * `ledger_entry_id` (`UUID`, FK `ledger_entries.id`, NOT NULL) -- Vínculo al movimiento exacto en ledger
  * `payout_status` (`VARCHAR(20)`, NOT NULL, DEFAULT `'CREDITED'`) -- 'CREDITED', 'REFUNDED'
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Restricciones:**
  * `CHECK (payout_amount > 0.00)`
  * `UNIQUE (settlement_id, user_id)` -- Un usuario recibe exactamente un crédito/reembolso por liquidación
* **Políticas RLS:**
  * `SELECT`: El usuario destinatario y Administradores.
  * `INSERT`: Exclusivo de función `SECURITY DEFINER` `settle_game_session()`.
  * `UPDATE / DELETE`: ESTRICTAMENTE PROHIBIDO (Inmutable).

---

### 3.13. `kyc_verifications`
* **Propósito:** Control de expedientes y estados de validación de identidad KYC.
* **Sensibilidad:** ALTA.
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `document_type` (`VARCHAR(30)`, NOT NULL, DEFAULT `'CEDULA_VENEZOLANA'`)
  * `document_storage_path` (`TEXT`, NOT NULL) -- Ruta en bucket privado Supabase Storage con RLS
  * `status` (`kyc_status_enum`, NOT NULL, DEFAULT `'PENDING'`)
  * `reviewer_id` (`UUID`, FK `auth.users.id`, NULL)
  * `reviewer_notes` (`TEXT`, NULL)
  * `submitted_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
  * `reviewed_at` (`TIMESTAMPTZ`, NULL)
* **Políticas RLS:**
  * `SELECT`: El usuario consulta su propio registro. Operadores/Admins ven todos.
  * `INSERT`: El usuario sube su solicitud.
  * `UPDATE`: Solo Operadores/Admins.

---

### 3.14. `audit_logs`
* **Propósito:** Registro forense inmutable de todas las acciones críticas, cambios de estado y transacciones.
* **Sensibilidad:** CRÍTICA.
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `actor_id` (`UUID`, NULL) -- `auth.uid()` o `NULL` si fue el sistema
  * `actor_role` (`VARCHAR(30)`, NOT NULL, DEFAULT `'SYSTEM'`)
  * `action` (`VARCHAR(100)`, NOT NULL) -- ej: 'USER_LOGIN', 'DEPOSIT_APPROVED', 'SETTLEMENT_EXECUTED'
  * `resource_type` (`VARCHAR(50)`, NOT NULL)
  * `resource_id` (`VARCHAR(100)`, NOT NULL)
  * `severity` (`audit_severity_enum`, NOT NULL, DEFAULT `'INFO'`)
  * `ip_address` (`VARCHAR(45)`, NULL)
  * `user_agent` (`TEXT`, NULL)
  * `metadata` (`JSONB`, NOT NULL, DEFAULT `'{}'::jsonb`)
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Políticas RLS:**
  * `SELECT`: Exclusivo de `ADMIN` y `SUPER_ADMIN`.
  * `INSERT`: Triggers de auditoría y funciones `SECURITY DEFINER`.
  * `UPDATE / DELETE`: PROHIBIDO TOTALMENTE (Tabla inmutable).

---

### 3.15. `system_settings`
* **Propósito:** Parámetros operativos y límites globales de la plataforma.
* **Sensibilidad:** ALTA.
* **Columnas:**
  * `key` (`VARCHAR(50)`, PK)
  * `value` (`JSONB`, NOT NULL)
  * `is_public` (`BOOLEAN`, NOT NULL, DEFAULT `FALSE`)
  * `description` (`TEXT`, NOT NULL)
  * `updated_by` (`UUID`, FK `auth.users.id`, NULL)
  * `updated_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Parámetros Iniciales:**
  * `platform_fee_percent`: `{"value": 10.0}`
  * `min_deposit_ves`: `{"value": 50.0}`
  * `min_withdrawal_ves`: `{"value": 100.0}`
  * `max_daily_withdrawal_ves`: `{"value": 10000.0}`
  * `safe_development_mode`: `{"value": true}`
* **Políticas RLS:**
  * `SELECT`: Si `is_public = TRUE`, lectura para todos los usuarios autenticados. Si `is_public = FALSE`, solo `ADMIN` y `SUPER_ADMIN`.
  * `UPDATE`: Exclusivo de `SUPER_ADMIN`.

---

### 3.16. `support_tickets`
* **Propósito:** Gestión de incidencias de usuarios, reportes de juego y soporte de transacciones.
* **Sensibilidad:** MEDIA.
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `category` (`VARCHAR(50)`, NOT NULL) -- 'PAYMENT', 'GAME_ISSUE', 'ACCOUNT', 'DISPUTE'
  * `subject` (`VARCHAR(150)`, NOT NULL)
  * `description` (`TEXT`, NOT NULL)
  * `related_table_id` (`UUID`, NULL)
  * `related_transaction_id` (`UUID`, NULL)
  * `status` (`VARCHAR(30)`, NOT NULL, DEFAULT `'OPEN'`)
  * `assigned_operator_id` (`UUID`, FK `auth.users.id`, NULL)
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
  * `updated_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Políticas RLS:**
  * `SELECT`: El usuario que creó el ticket y personal de soporte (Operadores/Admins).
  * `INSERT`: Usuario autenticado.
  * `UPDATE`: Operadores/Admins y el usuario para responder.

---

### 3.17. `notifications`
* **Propósito:** Notificaciones al usuario sobre eventos financieros y de partidas.
* **Sensibilidad:** BAJA-MEDIA.
* **Columnas:**
  * `id` (`UUID`, PK, `DEFAULT gen_random_uuid()`)
  * `user_id` (`UUID`, FK `profiles.user_id`, NOT NULL)
  * `type` (`VARCHAR(50)`, NOT NULL) -- 'DEPOSIT_APPROVED', 'GAME_INVITE', 'PRIZE_WON'
  * `title` (`VARCHAR(100)`, NOT NULL)
  * `message` (`TEXT`, NOT NULL)
  * `data` (`JSONB`, NOT NULL, DEFAULT `'{}'::jsonb`)
  * `is_read` (`BOOLEAN`, NOT NULL, DEFAULT `FALSE`)
  * `created_at` (`TIMESTAMPTZ`, NOT NULL, DEFAULT `NOW()`)
* **Políticas RLS:**
  * `SELECT / UPDATE`: El usuario sobre sus propias notificaciones (`auth.uid() = user_id`).

---

## 4. Diagrama de Relaciones Entidad-Relación (ERD Conceptual)

```
auth.users (1) ─── (1) profiles
                           │
                           ├── (1:N) ── user_roles
                           ├── (1:1) ── wallets ── (1:N) ── ledger_entries
                           ├── (1:N) ── payment_accounts
                           ├── (1:N) ── deposit_requests
                           ├── (1:N) ── withdrawal_requests
                           ├── (1:N) ── kyc_verifications
                           ├── (1:N) ── game_tables (host)
                           ├── (1:N) ── game_table_players ── (N:1) ── game_tables
                           │                                                 │
                           │                                              (1:N)
                           │                                                 │
                           └── (1:N) ── game_sessions ───────────────────────┘
                                              │
                                              ├── (1:N) ── game_actions
                                              └── (1:1) ── game_settlements
                                                                   │
                                                                 (1:N)
                                                                   │
                                                                   └── game_settlement_recipients
```

---

## 5. Matriz de Retención y Modificabilidad de Datos

| Tabla | Naturaleza | Modificabilidad | Eliminación (DELETE) | Retención |
| :--- | :--- | :--- | :--- | :--- |
| `profiles` | Identidad | Modificable campos no críticos | PROHIBIDO (Soft delete) | Permanente / Cumplimiento |
| `user_roles` | Permisos | Modificable por Super Admin | Auditado | Permanente |
| `wallets` | Balance | Modificable solo por Ledger Trigger | PROHIBIDO | Permanente |
| `ledger_entries` | Contable | **INMUTABLE (Append-Only)** | **ESTRICTAMENTE PROHIBIDO** | Permanente (10 años fiscal) |
| `deposit_requests` | Transaccional | Estado modificable por Operador | PROHIBIDO | Permanente |
| `withdrawal_requests`| Transaccional | Estado modificable por Operador | PROHIBIDO | Permanente |
| `game_tables` | Estado | Transiciones de estado de mesa | Soft delete (`CLOSED`) | 1 año histórico |
| `game_sessions` | Estado | Modificable por motor de juego | PROHIBIDO | 5 años |
| `game_actions` | Auditoría juego | **INMUTABLE (Append-Only)** | PROHIBIDO | 1 año histórico |
| `game_settlements` | Contable | **INMUTABLE (Append-Only)** | **ESTRICTAMENTE PROHIBIDO** | Permanente |
| `game_settlement_recipients` | Contable | **INMUTABLE (Append-Only)** | **ESTRICTAMENTE PROHIBIDO** | Permanente |
| `audit_logs` | Forense | **INMUTABLE (Append-Only)** | **ESTRICTAMENTE PROHIBIDO** | Permanente |

---

## 6. Propuesta de Secuencia de Migraciones (Sin Ejecutar)

Cuando se autorice la Fase 3, el orden estricto de aplicación será:

1. `001_extensions_and_enums.sql`
2. `002_profiles_and_identity.sql`
3. `003_rbac_and_roles.sql`
4. `004_wallets_and_ledger.sql`
5. `005_payment_accounts.sql`
6. `006_deposit_requests.sql`
7. `007_withdrawal_requests.sql`
8. `008_game_tables_and_players.sql`
9. `009_game_sessions_and_actions.sql`
10. `010_game_settlements_and_recipients.sql`
11. `011_kyc_and_compliance.sql`
12. `012_audit_logs_and_triggers.sql`
13. `013_system_settings.sql`
14. `014_support_and_notifications.sql`
15. `015_row_level_security_policies.sql`
16. `016_security_definer_functions.sql`
17. `017_realtime_publications.sql`

