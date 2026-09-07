# AUDITORÍA FORENSE Y OPTIMIZACIÓN DE EGRESS EN SUPABASE
## Proyecto: RASPANDO LA OLLA 🇻🇪 / PulsoPLAY
**Fecha de Auditoría:** 2026-09-07  
**Estado:** DESCUBRIMIENTO, DIAGNÓSTICO MATEMÁTICO Y MAPEO DE OFENSORES COMPLETADO

---

## 1. RESUMEN EJECUTIVO Y MÉTRICAS ACTUALES

### Estado de Cuotas de Supabase
| Métrica | Consumo Actual | Límite Plan Free | Porcentaje | Excedente (Overage) |
|---|---|---|---|---|
| **Egress Total** | **9.48 GB** | **5.00 GB** | **190%** | **+4.48 GB** |
| Cached Egress | 0.93 GB | 5.00 GB | 18.6% | 0 GB |
| Database Size | 56.48 MB | 500 MB | 11.3% | 0 MB |
| Realtime Messages | 151,301 | 2,000,000 | 7.5% | 0 msgs |
| Realtime Peak CCU | 22 | 200 | 11.0% | 0 CCU |
| Storage | 0.03 GB (30 MB) | 1.00 GB | 3.0% | 0 GB |
| MAU | 23 | 50,000 | 0.04% | 0 MAU |
| Edge Functions | 0 | 500,000 | 0% | 0 |

### Diagnóstico Forense Clave:
- **Base de Datos (56 MB) y Storage (30 MB)** representan menos del 1% del problema. No hay fugas por descargas de binarios masivos.
- **Realtime (151k mensajes)** consumió aproximadamente ~300 MB de ancho de banda WebSocket. Está dentro del límite (7.5%).
- **El 90%+ del Egress (8.55 GB sin caché)** proviene exclusivamente de la **API REST (PostgREST)** debido a:
  1. Bucles de sondeo ciego (`setInterval`) en el servidor Express ejecutándose 24/7 en Cloud Run.
  2. Sondeos de alta frecuencia en el cliente (cada 2.5s, 3s y 4s) descargando columnas JSONB pesadas (`current_state`, `config`).
  3. Consultas con comodín indiscriminado (`.select('*')`) en 48 ubicaciones críticas.
  4. Canales de Realtime con nombres dinámicos (`Date.now()`) que impiden el multiplexado de conexiones.
  5. Doble y triple mecanismo de latido (Presence channel + Heartbeat RPC + tabla profiles).

---

## 2. TOP 5 OFENSORES DE EGRESS (RANKING POR IMPACTO)

### 🥇 OFENSOR #1: Demonios en Servidor Backend 24/7 (`server.ts`)
- **Ubicación:** `server.ts` (Líneas 181 y 314)
- **Frecuencia:**
  - Bucle 1: Cada 2.000 ms (2 segundos) -> RPC `run_bingo_engine_tick` + SELECT `game_sessions` + RPC `reveal_next_bingo_ball`.
  - Bucle 2: Cada 3.000 ms (3 segundos) -> RPC `process_expired_turns` + RPC `expire_game_turn_secure`.
- **Cálculo de Tráfico:**
  - Bucle 2s = 30 ejecuciones/min = 1.800/hora = 43.200 ciclos/día. Al hacer 2 consultas por ciclo = 86.400 peticiones HTTP/día.
  - Bucle 3s = 20 ejecuciones/min = 1.200/hora = 28.800 ciclos/día. Al hacer 2 RPCs = 57.600 peticiones HTTP/día.
  - Total peticiones servidor = **144.000 peticiones HTTP/día**.
  - Con un payload promedio de respuesta + headers de 1 KB: **144 MB/día = 4.32 GB/mes** por contenedor activo.
  - Al haber reinicios o revisiones simultáneas en Cloud Run, este factor por sí solo explica entre **4.3 GB y 8.6 GB** del overage total de 9.48 GB.
- **Defecto Arquitectónico:** Ejecuta consultas contra Supabase cada 2 segundos incluso cuando **no hay ninguna partida activa** o ninguna mesa creada.

---

### 🥈 OFENSOR #2: Sondeo en Lobby de Bingo con Payload JSON Pesado (`BingoLobbySection.tsx`)
- **Ubicación:** `src/features/lobby/BingoLobbySection.tsx` (Líneas 46 y 244)
- **Frecuencia:** Cada 3.000 ms (3 segundos) por cada usuario que visualice la pestaña de Bingo.
- **Consulta Realizada:**
  ```typescript
  client.from('game_sessions')
    .select('id, table_id, countdown_ends_at, status, current_state, table:game_tables(...)')
  ```
- **Cálculo de Tráfico:**
  - La columna `current_state` almacena el estado completo de la partida de Bingo: balotas extraídas, patrones de cartones, registros. Pesa entre **5 KB y 15 KB**.
  - Frecuencia: 20 peticiones/min = 1.200 peticiones/hora por usuario.
  - 1.200 peticiones * 10 KB = **12 MB a 20 MB por hora por pestaña abierta**.
  - Si un usuario o evaluador mantiene la pestaña abierta 3 horas, consume ~50 MB.
- **Defecto Arquitectónico:** `BingoLobbySection` ya está suscrito a Realtime (`bingo_countdowns_and_tables`). Descargar `current_state` completo cada 3s cuando solo se requiere el timestamp de cuenta regresiva es un desperdicio del 95% del payload.

---

### 🥉 OFENSOR #3: Sondeos en Salas de Espera y Espectadores (`BingoLiveViewer.tsx` y `TablesView.tsx` / `GameContainer.tsx`)
- **Ubicaciones:**
  - `src/features/lobby/BingoLiveViewer.tsx` (Línea 357): Sondeo cada 4.000 ms cargando sesiones activas.
  - `src/features/tables/TablesView.tsx` (Líneas 398 y 490):
    - Cada 2.500 ms (2.5s) al estar en una mesa: llama a `GameRepository.getActiveSession` (`.select('*')` en `game_sessions`) y `TableRepository.getTableById` (`.select('*')` en `game_tables`).
  - `src/features/games/components/GameContainer.tsx` (Línea 903): Sondeo cada 2.500 ms esperando inicio de sesión.
- **Cálculo de Tráfico:**
  - En `TablesView.tsx`: 24 peticiones/min * 2 consultas = 48 consultas/min por jugador en sala de espera.
  - 48 consultas/min * 60 = 2.880 consultas/hora. Con `.select('*')` trayendo configuraciones y estados de partida (8 KB), representa **23 MB/hora por jugador en espera**.
- **Defecto Arquitectónico:** Se ejecutan paralelamente con canales WebSocket Realtime ya conectados, sin comprobar si el WebSocket está sano antes de consultar.

---

### 🏅 OFENSOR #4: Bucle Global de Administración Ininterrumpido (`AdminView.tsx`)
- **Ubicación:** `src/features/admin/AdminView.tsx` (Líneas 242 y 246)
- **Frecuencia:**
  - Bucle de datos: Cada 15.000 ms (15 segundos) recarga simultáneamente **13 consultas**:
    - `getMetrics()`, `getUsersList()`, `getDepositsList()`, `getWithdrawalsList()`, `getWalletsList()`, `getTablesList()`, `getMatchesList()`, `getGamesOverview()`, `getSupportTickets()`, `getAdminNotifications()`, `getAuditLogs(50)`, `getSystemSettings()`.
  - Bucle de reloj: Cada 5.000 ms (5 segundos) consulta `AdminRepository.getServerTime()`.
- **Cálculo de Tráfico:**
  - Cada ciclo de 15 segundos transfiere entre 40 KB y 80 KB de datos administrativos.
  - 4 ciclos/min * 60 KB = 240 KB/min = **14.4 MB/hora**.
  - Si un administrador mantiene el panel abierto en segundo plano durante una jornada de 8 horas: **~115 MB por día**.

---

### 🎖️ OFENSOR #5: Consultas Comodín Masivas (`.select('*')`) y Nombres de Canales Dinámicos
- **Ubicaciones:**
  - 48 llamadas `.select('*')` en repositorios centrales:
    - `GameRepository.getActiveSession` -> `.select('*')` en `game_sessions` (arrastra `current_state` masivo).
    - `TableRepository.getPublicTables` y `getTableById` -> `.select('*')` en `game_tables`.
    - `WalletRepository.getBalance` y `getTransactions` -> `.select('*')`.
    - `AdvertisingRepository.getAssets` -> `.select('*')`.
    - `NotificationRepository.getUserNotifications` -> `.select('*')`.
  - **Canales con Nombres Dinámicos:**
    - `RealtimeManager.ts`: `public-game-tables-lobby-${Date.now()}`
    - `AdService.ts`: `ad_service_realtime_${Date.now()}`
    - `SystemAuditRunner.ts`: `audit_test_${Date.now()}`
    - Estos nombres dinámicos impiden que Supabase reutilice el topic WebSocket, forzando la apertura de canales aislados en el cluster de Realtime.
  - **Triple Latido:**
    - `useHeartbeat.ts`: Cada 25s RPC `record_user_heartbeat`.
    - `PresenceService.ts`: Cada 25s `profiles.update({ is_online: true, last_seen })`.
    - Canal Realtime `global_presence`: WebSocket presence tracking.
    - Tres mecanismos paralelos compitiendo por reportar presencia.

---

## 3. PLAN DE ACCIÓN Y OPTIMIZACIONES QUIRÚRGICAS (SIN ROMPER NADA)

### Reglas Absolutas Aplicadas:
- NO borrar tablas, migraciones, wallets ni partidas.
- NO desactivar Realtime ni RLS.
- NO romper la lógica del juego. Mantener la resiliencia en redes inestables.

### Fase 1: Optimización del Servidor Backend (`server.ts`)
1. **Detección de Inactividad (Backoff Inteligente):**
   - Si no hay sesiones de Bingo en estado `WAITING`, `READY`, `SALES` o `DRAWING`, aumentar el intervalo de sondeo de 2s a 15s.
   - Tan pronto como se detecte una sesión en curso o cuenta regresiva activa, reducir el intervalo a 3.5s (ritmo de balotas).
   - Eliminar la consulta redundante de `game_sessions` en `server.ts` ya que `run_bingo_engine_tick()` hace la verificación internamente en PostgreSQL.
2. **Optimización de Expiración de Turnos:**
   - Ajustar el intervalo de turnos expirados de 3s a 8s (los turnos mínimos en Truco/Dominó son de 15s a 30s).
   - Ahorro inmediato en servidor: **> 75% de las llamadas HTTP (~3.2 GB/mes)**.

### Fase 2: Optimización de Consultas en Lobby y Mesas
1. **`BingoLobbySection.tsx`:**
   - Excluir `current_state` del SELECT periódico en el lobby. Solo consultar columnas requeridas para tarjetas de lobby: `id, table_id, countdown_ends_at, status, game_type`.
   - Ajustar el intervalo de respaldo de 3s a 10s cuando el canal Realtime esté activo.
2. **`BingoLiveViewer.tsx`:**
   - Incrementar intervalo de 4s a 10s, y pausar cuando la pestaña no esté visible (`document.hidden`).
3. **`TablesView.tsx` y `GameContainer.tsx`:**
   - Si el canal Realtime WebSocket está en estado `SUBSCRIBED`, espaciar el sondeo de respaldo de 2.5s a 12s.
   - En `getActiveSession`: seleccionar columnas explícitas necesarias en lugar de `select('*')`.

### Fase 3: Optimización del Panel de Administración (`AdminView.tsx`)
1. Reemplazar el sondeo ciego incondicional de 15s por:
   - Sondeo pasivo cada 60s (o refresco manual / cambio de pestaña).
   - Pausa automática cuando la ventana está en segundo plano (`visibilitychange`).
   - Aumentar el intervalo de `getServerTime()` de 5s a 60s (el cliente puede avanzar el reloj localmente por segundo).

### Fase 4: Limpieza de Canales Dinámicos y Sustitución de `.select('*')`
1. Reemplazar canales con nombres variables `Date.now()` por canales estáticos o agrupados por usuario/mesa.
2. Reemplazar `.select('*')` en `GameRepository.getActiveSession`, `TableRepository.getTableById`, `WalletRepository.getBalance`, `AdvertisingRepository.getAssets` por listas de columnas explícitas.
3. Unificar el latido de presencia para no triplicar tráfico cada 25 segundos.

---

## 4. ESTIMACIÓN DE REDUCCIÓN DE EGRESS TRAS LA APLICACIÓN

| Área de Optimización | Egress Antes (Mes) | Egress Proyectado (Mes) | Reducción (%) |
|---|---|---|---|
| Demonios en `server.ts` | ~4.3 GB | ~0.8 GB | -81% |
| Lobby de Bingo (`BingoLobbySection`) | ~2.2 GB | ~0.3 GB | -86% |
| Mesas y Espectadores (`TablesView` + `BingoLiveViewer`) | ~1.5 GB | ~0.3 GB | -80% |
| Panel Admin (`AdminView.tsx`) | ~0.8 GB | ~0.1 GB | -87% |
| Consultas Comodín y Latidos Duplicados | ~0.7 GB | ~0.2 GB | -71% |
| **TOTAL** | **~9.5 GB** | **~1.7 GB** | **~82% de Reducción** |

**Resultado Esperado:** Reducción del uso de Egress de 190% (9.48 GB) a menos del 35% del límite gratuito (aprox. 1.7 GB), situando al proyecto holgadamente por debajo de la cuota de 5 GB sin interrumpir el funcionamiento en vivo de ningún juego.
