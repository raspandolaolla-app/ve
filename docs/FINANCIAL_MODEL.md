# 💰 MODELO FINANCIERO Y CONTABLE — RASPANDO LA OLLA

**Versión:** 2.1 (Fase 2.1 - Auditoría de Integridad Financiera y Ledger)  
**Estado:** 🔒 SAFE DEVELOPMENT MODE (No ejecución, diseño documental estricto)

---

## 1. Moneda Oficial y Tipos de Datos

- **Moneda Base:** Bolívares Venezolanos (`VES` / `Bs.`).
- **Precisión Contable:** Tipo de dato `NUMERIC(14, 2)` en PostgreSQL.
- **Prohibición Estricta:** NUNCA utilizar tipos de punto flotante (`FLOAT`, `DOUBLE`, `REAL`) para montos monetarios o comisiones, previniendo errores de redondeo IEEE 754.

---

## 2. Invariantes Fundamentales del Balance de Usuario

Cada billetera (`wallets`) mantiene dos variables de saldo en Bolívares:
1. **`available_balance`:** Saldo disponible y líquido para ingresar a nuevas mesas o solicitar retiros.
2. **`held_balance`:** Saldo retenido en garantía mientras el usuario participa en una mesa activa o tiene una solicitud de retiro en proceso.
3. **`total_balance`:** Saldo patrimonial total del usuario.

### Invariantes Matemáticas Obligatorias (Verificadas por Constraint en BD):
$$\text{available\_balance} \ge 0.00$$
$$\text{held\_balance} \ge 0.00$$
$$\text{total\_balance} = \text{available\_balance} + \text{held\_balance}$$

---

## 3. Regla 90/10 de Liquidación y Tipos de Partida

El servidor (Edge Function / RPC PostgreSQL) es la **ÚNICA** entidad autorizada para calcular pozos, comisiones y premios. El cliente React **NUNCA** envía montos de premio o comisión.

### 3.1. Caso 1: Ganador Único (1v1, Todos contra Todos, Bingo, Dominó Individual)
- **Entradas:** $N$ jugadores con entrada $E$ Bs.
- **Pozo Bruto Recaudado ($\text{gross\_pool}$):** $N \times E$ Bs.
- **Premio al Ganador ($\text{prize\_pool}$):** $\text{ROUND}(\text{gross\_pool} \times 0.90, 2)$ Bs.
- **Comisión de Plataforma ($\text{service\_fee}$):** $\text{gross\_pool} - \text{prize\_pool}$ Bs.
- **Invariante:** $\text{prize\_pool} + \text{service\_fee} = \text{gross\_pool}$.

**Ejemplo:**
- 4 jugadores en Dominó individual con entrada de 250,00 Bs.
- $\text{gross\_pool} = 1.000,00 \text{ Bs.}$
- $\text{prize\_pool} = 900,00 \text{ Bs.}$ (Acreditado al ganador)
- $\text{service\_fee} = 100,00 \text{ Bs.}$ (Acreditado a la plataforma)

---

### 3.2. Caso 2: Parejas / Equipos (Dominó 2v2, Truco 2v2)
- **Entradas:** 4 jugadores con entrada $E$ Bs.
- **Pozo Bruto ($\text{gross\_pool}$):** $4 \times E$ Bs.
- **Comisión de Plataforma ($\text{service\_fee}$):** $\text{ROUND}(\text{gross\_pool} \times 0.10, 2)$ Bs.
- **Pozo Total de Premios ($\text{prize\_pool}$):** $\text{gross\_pool} - \text{service\_fee}$ Bs.
- **Premio por Integrante del Equipo Ganador:** $\text{ROUND}(\text{prize\_pool} / 2, 2)$ Bs. cada uno.
- Si surge un remanente de centavo impar por división, se ajusta al primer asiento para asegurar que $\sum \text{payouts} = \text{prize\_pool}$.

**Ejemplo:**
- 4 jugadores en Dominó 2v2 con entrada de 250,00 Bs.
- $\text{gross\_pool} = 1.000,00 \text{ Bs.}$
- $\text{service\_fee} = 100,00 \text{ Bs.}$
- $\text{prize\_pool} = 900,00 \text{ Bs.}$
- **Ganador A (Equipo 1):** 450,00 Bs.
- **Ganador B (Equipo 1):** 450,00 Bs.
- **Total Distribuido:** $450,00 + 450,00 + 100,00 = 1.000,00 \text{ Bs.}$ (Cuadratura exacta).

---

### 3.3. Caso 3: Empate con Reparto de Pozo (Split Pot)
- En juegos que admitan empate con reparto (ej: Piedra, Papel o Tijera por rondas con split):
  - $\text{gross\_pool} = N \times E$
  - $\text{service\_fee} = \text{ROUND}(\text{gross\_pool} \times 0.10, 2)$
  - $\text{prize\_pool} = \text{gross\_pool} - \text{service\_fee}$
  - Cada participante empatado recibe $\text{prize\_pool} / K$ donde $K$ es el número de ganadores empatados.

---

### 3.4. Caso 4: Empate con Devolución Íntegra o Cancelación de Mesa
- Si una mesa se cancela antes de iniciar, un juego se declara nulo o finaliza en tablas con regla de devolución íntegra:
  - $\text{gross\_pool} = N \times E$
  - $\text{service\_fee} = 0.00 \text{ Bs.}$ (Sin cobro de comisión)
  - $\text{prize\_pool} = 0.00 \text{ Bs.}$
  - Cada jugador recibe exactamente el **100% de su entrada** ($E$ Bs.) liberada de `held_balance` a `available_balance` mediante movimiento `TABLE_ENTRY_REFUND`.

---

## 4. Estructura del Ledger de Doble Entrada Inmutable (Append-Only)

Toda transacción en el sistema genera registros en `ledger_entries`. **Nunca** se realiza `UPDATE` ni `DELETE` sobre un registro contable.

### Columnas Obligatorias de `ledger_entries`:
- `id`: Identificador UUID único.
- `wallet_id`: Billetera del usuario afectado.
- `user_id`: ID del usuario.
- `entry_type`: Tipo de movimiento (`DEPOSIT_CREDIT`, `WITHDRAWAL_HOLD`, `WITHDRAWAL_CAPTURE`, `WITHDRAWAL_RELEASE`, `TABLE_ENTRY_HOLD`, `TABLE_ENTRY_CAPTURE`, `TABLE_ENTRY_REFUND`, `GAME_PRIZE_CREDIT`, `PLATFORM_FEE_CREDIT`, `ADMIN_ADJUSTMENT`).
- `direction`: Dirección contable (`CREDIT`, `DEBIT`, `HOLD`, `RELEASE`).
- `amount`: Monto positivo en Bolívares (`NUMERIC(14,2)`).
- `currency`: `'VES'`.
- `reference_type`: Tabla de origen (`'deposit_requests'`, `'withdrawal_requests'`, `'game_tables'`, `'game_settlements'`).
- `reference_id`: UUID del registro origen.
- `idempotency_key`: Clave de idempotencia única.
- `created_at`: Marca de tiempo inmutable.

---

## 5. Prevención de Condiciones de Carrera y Doble Gasto

1. **Bloqueo Pesimista a Nivel de Fila (`SELECT ... FOR UPDATE`):**
   - Toda función de unión a mesa, solicitud de retiro o liquidación bloquea la fila en `wallets` del usuario antes de verificar saldo:
     ```sql
     SELECT available_balance, held_balance INTO v_wallet
     FROM wallets
     WHERE user_id = p_user_id
     FOR UPDATE;
     ```
2. **Idempotencia Transaccional:**
   - La inserción en `game_settlements` y `ledger_entries` exige `UNIQUE (idempotency_key)`.
   - Reintentos de red o ejecuciones duplicadas de workers fallan de manera segura sin duplicar abonos ni cargos.
