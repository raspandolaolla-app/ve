# 🧪 PLAN DE PRUEBAS DE BASE DE DATOS Y TRANSACCIONES — RASPANDO LA OLLA

**Versión:** 2.1 (Fase 2.1 - Matriz Exhaustiva de Pruebas de Integridad Financiera y RLS)  
**Estado:** 🔒 SAFE DEVELOPMENT MODE (No ejecución, diseño documental de pruebas)

---

## 1. Casos de Prueba de Invariantes Financieros y Ledger (Puntos Críticos de Integridad)

| ID | Invariante / Regla Contable | Escenario de Prueba | Resultado Esperado |
| :--- | :--- | :--- | :--- |
| **FIN-INV-01** | `available_balance >= 0` | Usuario intenta unirse a mesa de 100 Bs. teniendo 50 Bs. disponibles. | Falla de inmediato con excepción `INSUFFICIENT_AVAILABLE_FUNDS`. El saldo permanece en 50 Bs. |
| **FIN-INV-02** | `held_balance >= 0` | Intento de liberar o capturar un monto superior al retenido en garantía. | Falla con excepción `INVALID_HELD_BALANCE`. El saldo retenido nunca se vuelve negativo. |
| **FIN-INV-03** | `total_balance = available_balance + held_balance` | Trigger o transacción actualiza `available_balance` o `held_balance`. | `total_balance` se recalcula de forma atómica y consistente con la suma exacta. |
| **FIN-INV-04** | No pagar más que el `prize_pool` | Motor de liquidación intenta acreditar 950 Bs. cuando el `prize_pool` es 900 Bs. | Restricción `CHECK (total_distributed = prize_pool)` rechaza la transacción. |
| **FIN-INV-05** | No cobrar más que el `gross_pool` | Intento de capturar entradas por encima de la suma de cuotas de jugadores válidos. | Falla por validación de suma de entradas. No hay sobrecaptura. |
| **FIN-INV-06** | No liquidar la misma partida dos veces | Dos ejecuciones simultáneas de `settle_game_session(session_id)`. | La primera se ejecuta con éxito; la segunda es rechazada por `UNIQUE (session_id)` e `idempotency_key`. |
| **FIN-INV-07** | No retirar el mismo saldo dos veces | Usuario envía 2 solicitudes de retiro idénticas al mismo milisegundo. | `SELECT FOR UPDATE` procesa una sola; la segunda falla por saldo insuficiente al estar retenido el primero. |
| **FIN-INV-08** | No aceptar entrada sin fondos disponibles | Solicitud de `join_table` con saldo disponible insuficiente. | Rechazado atómicamente; no se crea asiento en `game_table_players`. |
| **FIN-INV-09** | No acreditar premio antes de partida concluida | Intento de llamar a `settle_game_session()` en una mesa con `status = 'ACTIVE'`. | Rechazado con excepción `SESSION_NOT_FINISHED`. El pozo no se libera prematuramente. |

---

## 2. Casos de Prueba de Row Level Security (RLS)

| ID | Caso de Prueba | Condición de Entrada | Resultado Esperado |
| :--- | :--- | :--- | :--- |
| **RLS-01** | Lectura de perfil ajeno | Jugador A intenta `SELECT * FROM profiles WHERE user_id = 'jugador_b'` | Retorna 0 filas o solo campos públicos (`display_name`, `avatar_url`). Cédula, teléfono y datos privados inaccesibles. |
| **RLS-02** | Modificación de saldo directo | Jugador intenta `UPDATE wallets SET available_balance = 999999` | Rechazado por política RLS (0 filas afectadas o error de permisos). |
| **RLS-03** | Inserción directa en ledger | Jugador intenta `INSERT INTO ledger_entries (...)` | Rechazado: solo funciones `SECURITY DEFINER` autorizadas pueden insertar. |
| **RLS-04** | Consulta de logs de auditoría | Usuario con rol `PLAYER` intenta `SELECT * FROM audit_logs` | Retorna 0 filas (Permiso denegado por RLS). |
| **RLS-05** | Modificación de comisión | Usuario `PLAYER` u `OPERATOR` intenta cambiar `system_settings` | Rechazado por política RLS (Exclusivo `SUPER_ADMIN`). |
| **RLS-06** | Lectura de estado secreto de juego | Jugador intenta consultar `secret_state` de `game_sessions` del rival | Retorna campo oculto / filtrado por función o vista autorizada. |
| **RLS-07** | Lectura de mesa privada ajena | Jugador sin código de invitación intenta consultar mesa `PRIVATE` | Retorna 0 filas. |

---

## 3. Casos de Prueba de Concurrencia y Bloqueos (Race Conditions)

| ID | Caso de Prueba | Escenario de Concurrencia | Resultado Esperado |
| :--- | :--- | :--- | :--- |
| **CONC-01** | Doble gasto simultáneo (Double Spend) | Usuario con 100 Bs. disponibles intenta unirse a 2 mesas de 100 Bs. concurrentemente. | `SELECT FOR UPDATE` serializa las operaciones: la primera reserva los 100 Bs.; la segunda falla por fondos insuficientes. |
| **CONC-02** | Asiento concurrente en mesa | Dos usuarios intentan ocupar el último asiento disponible (asiento 4) al mismo milisegundo. | Restricción `UNIQUE (table_id, seat_number)` y control de cupo admite a uno y rechaza al otro con `TABLE_FULL`. |
| **CONC-03** | Reclamo de timeout simultáneo | Jugador A reclama abandono de Jugador B mientras Jugador B envía su jugada. | Transacción serializada: si la jugada llegó antes del `turn_deadline_at`, es válida; si llegó después, el timeout se ejecuta. |

---

## 4. Casos de Prueba de Identidad y Cumplimiento

| ID | Caso de Prueba | Entrada | Resultado Esperado |
| :--- | :--- | :--- | :--- |
| **IDN-01** | Registro de menor de edad (<18 años) | Fecha de nacimiento con edad de 16 años. | Rechazado por constraint `CHECK (birth_date <= CURRENT_DATE - INTERVAL '18 years')`. |
| **IDN-02** | Registro de cédula duplicada | Dos cuentas intentan registrar el mismo número de cédula. | Rechazado por `UNIQUE (cedula_hash)`. |
| **IDN-03** | Usuario bloqueado intentando jugar | Cuenta con `account_status = 'BLOCKED'` intenta unirse a mesa. | Rechazado de inmediato por validación de estado en función RPC. |
| **IDN-04** | Solicitud de retiro sin MFA | Usuario con sesión AAL1 intenta solicitar retiro de fondos. | Rechazado por RPC: exige elevación a MFA AAL2 (TOTP verificado). |
