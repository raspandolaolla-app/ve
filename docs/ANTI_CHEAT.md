# 🛡️ ARQUITECTURA ANTI-CHEAT & MOTOR SERVER-AUTHORITATIVE — RASPANDO LA OLLA

**Versión:** 2.0 (Fase 2 - Diseño de Integridad de Juegos)  
**Estado:** 🔒 SAFE DEVELOPMENT MODE

---

## 1. Principio Fundamental: Servidor como Autoridad Absoluta

1. **El cliente nunca envía estados finales:** El navegador solo transmite **intenciones de movimiento** (ej: `PLAY_TILE`, `PLACE_MARK`, `COMMIT_MOVE`).
2. **Cálculo Determinista en el Servidor:** La transición de estado, validación de reglas, verificación de turnos y condiciones de victoria son ejecutadas de manera aislada en el servidor (PostgreSQL Functions / Edge Functions).
3. **Protección de Estado Oculto (Fog of War):** La mano de fichas de Dominó, cartas de Truco o el cartón de Bingo no se envían sin filtrar al cliente de otros jugadores. Cada cliente solo recibe sus propios datos privados y el estado público de la mesa.

---

## 2. Esquema Commit-Reveal Criptográfico (Juegos Simultáneos)

Para juegos de elección simultánea (como **Piedra, Papel o Tijera**):

```
Fase 1 (Commit):
Jugador 1 ──> Envía Hash = SHA256(Elección + Salt Secreto) ──> Servidor almacena Hash
Jugador 2 ──> Envía Hash = SHA256(Elección + Salt Secreto) ──> Servidor almacena Hash

Fase 2 (Reveal):
Cuando ambos Commit están registrados:
Jugador 1 ──> Envía (Elección, Salt) ──> Servidor verifica SHA256
Jugador 2 ──> Envía (Elección, Salt) ──> Servidor verifica SHA256

Fase 3 (Resolución):
Servidor evalúa la matriz ganadora y proclama el resultado oficial.
```
* **Ventaja:** Ningún jugador (ni siquiera interceptando tráfico WebSocket/Realtime) puede conocer la jugada de su oponente antes de comprometer la suya.

---

## 3. Secuenciación e Idempotencia de Acciones (`sequence_number`)

Cada partida mantiene un contador incremental estricto (`sequence_number`):
- Si el servidor espera la jugada `#4` y recibe `#5` o `#3`, la rechaza inmediatamente como desincronización o intento de replay attack.
- La restricción `UNIQUE (session_id, sequence_number)` en la base de datos previene colisiones por doble clic o latencia.

---

## 4. Detección de Anomalías y Abandono de Partidas

1. **Reloj de Turno del Servidor (`turn_deadline_at`):**
   - El tiempo de turno (ej: 30 segundos por jugada) se mide según el reloj de PostgreSQL (`NOW()`), nunca con `setTimeout()` del navegador.
   - Si vence el plazo, el servidor ejecuta un auto-pase o penalización por timeout.
2. **Pérdida de Conexión & Reconexión:**
   - La desconexión detectada por Realtime Presence otorga una ventana de gracia configurable (ej: 60 segundos) para que el jugador se reconecte.
   - Si el tiempo de reconexión expira sin retorno, la partida se declara como abandono (`ABANDONED`) y se adjudica la victoria reglamentaria al jugador restante.

---

## 5. Matriz de Rate Limiting por Endpoint / Operación

| Operación | Límite Máximo Recomendado | Acción ante Exceso |
| :--- | :--- | :--- |
| **Inicio de Sesión (Login)** | 5 intentos / minuto por IP | Bloqueo temporal de 15 min |
| **Ingreso a Mesa (`join_table`)** | 1 intento / 3 segundos por usuario | Rechazo con código `TOO_MANY_REQUESTS` |
| **Acción de Juego (`game_action`)** | 2 acciones / segundo por usuario | Descarte de evento |
| **Solicitud de Recarga / Retiro** | 3 solicitudes / hora por usuario | Bloqueo preventivo de formulario |
| **Creación de Tickets de Soporte** | 5 tickets / día por usuario | Alerta a moderación |
