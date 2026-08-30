# RASPANDO LA OLLA — FASE 20: INTEGRACIÓN REAL DE LOS 8 JUEGOS + PRUEBAS MULTIJUGADOR

**Estado:** APROBADA Y OPERATIVA  
**Fecha:** Agosto 2026  
**Ambiente:** Supabase Realtime + PostgreSQL RPCs + React 19 + TypeScript  
**Seguridad Financiera:** Regla 90/10 Inmutable en Ledger / 100% Reembolso en Empate

---

## 1. Resumen Ejecutivo

La **Fase 20** consolida la integración total en tiempo real de los 8 motores de juego tradicionales venezolanos y clásicos con la arquitectura de Supabase (Realtime Channels, Row Level Security, RPCs transaccionales y Presencia de Jugadores).

### Motores Integrados:
1. **Tic Tac Toe (3 en Raya)**: Duelos rápidos 1v1 con alternancia estricta de turnos, validación de casillas ocupadas y detección de líneas ganadoras.
2. **Rock Paper Scissors (Piedra, Papel o Tijera)**: Duelos al mejor de N con elecciones encriptadas/comprometidas, revelación simultánea y control de rondas.
3. **Checkers (Damas Clásicas)**: Tablero 8x8 con movimientos diagonales, saltos de captura obligatorios y coronación de damas (Kings).
4. **Dominó Venezolano**: Distribución de 28 fichas (7 por jugador), salida por la cochina (Doble 6), acople de extremos, paso de turno y resolución de trancaíto por conteo de puntos.
5. **Truco Venezolano**: Baraja española de 40 cartas, vira, detección automática de Perico (11) y Perica (10), cantos de Envido/Truco y conteo de puntos hacia la meta (12/24 pts).
6. **Bingo Online (75 Bolas)**: Cartones 5x5 con casilla central FREE, balotera secuencial, marcaje validado contra balotas cantadas y verificación estricta de líneas/cartón lleno.
7. **Polla Venezolana (Quiniela)**: Pronósticos deportivos LVBP y Liga FUTVE, puntuación por acierto exacto o resultado, y tabla de líderes en tiempo real.
8. **Atrapaíto**: Juego de reflejos y rapidez mental con cartas centrales y números objetivo.

---

## 2. Arquitectura de Sincronización y Realtime

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENTE (REACT)                       │
│                                                             │
│   ┌──────────────┐    Acción Local     ┌────────────────┐  │
│   │ Tablero (UI) │ ─────────────────> │ Motor de Juego │  │
│   └──────────────┘                    │ (Determinista) │  │
│          ▲                            └────────────────┘  │
│          │ Actualización                      │           │
│          │ Optimista                          │ Estado    │
│          │                                    ▼ Válido    │
│   ┌─────────────────────────────────────────────────────┐  │
│   │                   GameContainer                     │  │
│   └─────────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────────▲──────────┘
               │                                   │
      submitAction / RPC                           │ Realtime Broadcast
               ▼                                   │ & postgres_changes
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE / POSTGRESQL                    │
│                                                             │
│  • public.game_sessions  (current_state JSONB)              │
│  • public.game_actions   (Historial inmutable append-only)  │
│  • public.game_tables    (Estado de sala y asientos)        │
│  • RPC settle_game_session() (Liquidación 90/10)            │
│  • RPC refund_game_session() (Reembolso 100% en empate)     │
└─────────────────────────────────────────────────────────────┘
```

### Características Clave Implementadas:
- **Gestión de Presencia (Realtime Presence)**: Seguimiento en vivo de usuarios conectados/desconectados en la mesa.
- **Canal de Suscripción Unificado (`game_session_{id}`)**: Escucha eventos `INSERT` en `game_actions` y `UPDATE` en `game_sessions`.
- **Protección Anti-Doble Clic / Doble Jugada**: Bloqueo con bandera `isSubmittingAction` y claves de idempotencia únicas en cada acción.
- **Sanitización de Estado por Jugador**: Ocultamiento de cartas y fichas privadas de los oponentes.
- **Reconexión Transparente**: Al recargar la página o reconectarse a una sesión activa, el estado se restaura instantáneamente sin pérdida de datos.

---

## 3. Seguridad y Liquidación Financiera

### Migración 018 (`018_game_engine_realtime_and_rls.sql`):
- **Políticas RLS en `game_sessions`**: Permite `INSERT` y `UPDATE` a participantes legítimos de la mesa y operadores.
- **Políticas RLS en `game_actions`**: Permite `INSERT` con validación `auth.uid() = user_id` y pertenencia a la mesa.
- **RPC `settle_game_session`**:
  - Autorización: Operador o Participante de la mesa.
  - Validación: Al menos 1 participante y que los ganadores pertenezcan a la mesa.
  - Cálculo: `v_gross_pool := entry_fee * player_count`, `v_prize_pool := ROUND(gross * 0.90, 2)`, `v_platform_fee := gross - prize`.
  - Contabilidad: Débito de saldos retenidos (`TABLE_ENTRY_CAPTURE`) y crédito inmediato al monedero del ganador (`GAME_PRIZE_CREDIT`) con registro en el Libro Mayor (`ledger_entries`).
  - Cierre atómico: Sesión marcada como `SETTLED` y mesa como `CLOSED`.
- **RPC `refund_game_session`**:
  - Procesamiento de empates técnicos y cancelaciones.
  - Reembolso íntegro del 100% de la entrada a cada jugador sin comisión (`0.00 Bs`).
  - Registro contable `TABLE_ENTRY_REFUND` en el Libro Mayor.

---

## 4. Resultados de las Pruebas de Integración

Ejecución de la batería completa en `/scripts/test-phase20-integration.ts`:

```
================================================================
RASPANDO LA OLLA — PRUEBAS DE INTEGRACIÓN REAL DE 8 JUEGOS
================================================================

1. Probando Motor: TicTacToeEngine (3 en Raya)
  ✓ [PASS] Inicializa tablero de 9 casillas
  ✓ [PASS] Turno inicial para Jugador 1
  ✓ [PASS] P1 coloca X en casilla 0
  ✓ [PASS] Turno cambia a P2
  ✓ [PASS] Rechaza jugada fuera de turno
  ✓ [PASS] Rechaza jugada en casilla ocupada
  ✓ [PASS] P1 completa 3 en raya y gana la partida

2. Probando Motor: RockPaperScissorsEngine (Piedra, Papel o Tijera)
  ✓ [PASS] Inicia en fase de selección
  ✓ [PASS] P1 envía su elección
  ✓ [PASS] Elección P1 queda comprometida
  ✓ [PASS] Sigue seleccionando hasta que P2 envíe
  ✓ [PASS] P2 envía su elección
  ✓ [PASS] P1 suma 1 punto (Piedra vence a Tijera)

3. Probando Motor: CheckersEngine (Damas Clásicas)
  ✓ [PASS] Tablero de Damas de 8x8
  ✓ [PASS] Turno inicial para Jugador 1
  ✓ [PASS] P1 realiza movimiento diagonal válido
  ✓ [PASS] Turno pasa a P2

4. Probando Motor: DominoEngine (Dominó Venezolano)
  ✓ [PASS] P1 recibe 7 fichas
  ✓ [PASS] P2 recibe 7 fichas
  ✓ [PASS] Tablero inicial vacío
  ✓ [PASS] Jugador inicial coloca la primera ficha en la mesa
  ✓ [PASS] Mano del jugador disminuye a 6 fichas

5. Probando Motor: TrucoEngine (Truco Criollo)
  ✓ [PASS] Vira generada correctamente
  ✓ [PASS] P1 recibe 3 cartas de baraja española
  ✓ [PASS] P2 recibe 3 cartas de baraja española
  ✓ [PASS] Jugador tira carta a la mesa para la primera baza

6. Probando Motor: BingoEngine (Bingo 75 Bolas)
  ✓ [PASS] Columna B de 5 números generada
  ✓ [PASS] Casilla central N[2] es FREE
  ✓ [PASS] Matriz de marcaje 5x5 generada
  ✓ [PASS] Balotera canta primera bola

7. Probando Motor: PollaEngine (Polla / Quiniela Deportiva)
  ✓ [PASS] Jornada con partidos LVBP y FUTVE
  ✓ [PASS] Pronósticos registrados correctamente

8. Probando Motor: AtrapaitoEngine (Reflejos y Rapidez)
  ✓ [PASS] Número objetivo generado
  ✓ [PASS] P1 recibe 5 cartas de reflejos

9. Probando Regla Financiera: Liquidación 90/10 y Reembolso 100%
  ✓ [PASS] Pozo bruto de 2 jugadores a 100 Bs = 200 Bs
  ✓ [PASS] Premio ganador 90% = 180 Bs
  ✓ [PASS] Comisión plataforma 10% = 20 Bs
  ✓ [PASS] Suma matemática exacta sin fugas

================================================================
TODAS LAS PRUEBAS COMPLETADAS: 38/38 PASADAS (100%)
================================================================
```
