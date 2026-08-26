# 🎮 ARQUITECTURA DEL MOTOR DE JUEGOS (GAME ENGINE) — RASPANDO LA OLLA

**Versión:** 2.0 (Fase 2 - Diseño de Interfaz Común y Motores)  
**Estado:** 🔒 SAFE DEVELOPMENT MODE

---

## 1. Interfaz Común del Motor (Game Engine Interface)

Todos los juegos implementan una interfaz estándar y desacoplada:

```typescript
export interface GameEngine<TState, TSecretState, TAction, TResult> {
  // Inicializa el estado inicial al arrancar la partida
  initializeSession(config: GameTableConfig, players: GamePlayer[]): {
    publicState: TState;
    secretState: TSecretState;
    firstTurnUserId: string;
  };

  // Valida y aplica una acción enviada por un jugador
  processAction(
    currentState: TState,
    secretState: TSecretState,
    action: TAction,
    actorUserId: string
  ): {
    isValid: boolean;
    errorCode?: string;
    nextPublicState: TState;
    nextSecretState: TSecretState;
    nextTurnUserId?: string;
    isGameOver: boolean;
    result?: TResult;
  };

  // Maneja el vencimiento del tiempo de turno
  handleTimeout(
    currentState: TState,
    secretState: TSecretState,
    turnUserId: string
  ): {
    nextPublicState: TState;
    nextSecretState: TSecretState;
    isGameOver: boolean;
    result?: TResult;
  };
}
```

---

## 2. Catálogo de los 8 Juegos y sus Modelos de Motor

### 1. 3 en Raya (Tic-Tac-Toe)
- **Modalidad:** 1v1 por turnos alternos.
- **Estado:** Tablero 3x3 (`null | 'X' | 'O'`).
- **Validación Servidor:** Casilla libre, turno correspondiente, detección de 3 en línea o empate.

### 2. Piedra, Papel o Tijera
- **Modalidad:** 1v1 simultáneo.
- **Mecanismo:** Commit-Reveal criptográfico de 2 fases.
- **Validación Servidor:** Verificación de hash SHA-256 antes de revelar la elección.

### 3. Damas Clásicas
- **Modalidad:** 1v1 por turnos.
- **Estado:** Tablero 8x8 con piezas estándar y coronaciones (Damas).
- **Validación Servidor:** Movimiento diagonal, captura obligatoria cuando exista, coronación al llegar a la última fila.

### 4. Dominó Venezolano
- **Modalidad:** 1v1 individual o 2v2 en parejas.
- **Fichas:** Doble 6 (28 fichas).
- **Estado Oculto:** Manos de 7 fichas por jugador, fichas sobrantes en la sopa.
- **Validación Servidor:** Tranca, salida, cuadraturas de extremos y conteo de puntos en mano.

### 5. Truco Venezolano
- **Modalidad:** 1v1 o 2v2 (Baraja española de 40 cartas).
- **Estado Oculto:** Manos de 3 cartas, cartas de la vira.
- **Validación Servidor:** Flor, Envido, Truco, Retruco, Vale Cuatro y resolución de bazas.

### 6. Bingo 75
- **Modalidad:** Multijugador masivo con pozo acumulado.
- **Sorteo Servidor:** Extracción de balotas (1 al 75) mediante generador de números pseudoaleatorios criptográficos (`pgcrypto` / PRNG server-side).
- **Validación:** Comprobación server-side de patrones (Línea, Cuatro Esquinas, Cartón Lleno).

### 7. Polla Venezolana
- **Modalidad:** Pronósticos o cartas según especificación regional formal.
- **Estado:** Pronósticos registrados antes del cierre de mesa y liquidación por puntaje de aciertos.

### 8. Atrapaíto
- **Modalidad:** Juego tradicional de cartas o fichas rápidas.
- **Validación Servidor:** Secuencia de captura y descarte rápido server-authoritative.
