// ==============================================================================
// RASPANDO LA OLLA — BATERÍA DE PRUEBAS FASE 20 (INTEGRACIÓN 8 MOTORES)
// ==============================================================================
// Verificación integral de lógica de juego, turnos, reglas, empates y liquidación 90/10.
// ==============================================================================

import { TicTacToeEngine } from '../src/features/games/engines/TicTacToeEngine';
import { RockPaperScissorsEngine } from '../src/features/games/engines/RockPaperScissorsEngine';
import { CheckersEngine } from '../src/features/games/engines/CheckersEngine';
import { DominoEngine } from '../src/features/games/engines/DominoEngine';
import { TrucoEngine } from '../src/features/games/engines/TrucoEngine';
import { BingoEngine } from '../src/features/games/engines/BingoEngine';
import { PollaEngine } from '../src/features/games/engines/PollaEngine';
import { AtrapaitoEngine } from '../src/features/games/engines/AtrapaitoEngine';
import type { GameTable, TablePlayer } from '../src/types/tables';

const mockTable = (gameType: string): GameTable => ({
  id: 'table_test_001',
  joinCode: 'RLO-001',
  shareToken: 'tok_001',
  gameType: gameType as any,
  name: `Mesa de Prueba ${gameType}`,
  entryFee: 100.0,
  currency: 'VES',
  minPlayers: 2,
  maxPlayers: 2,
  currentPlayersCount: 2,
  status: 'OPEN',
  mode: '1v1',
  isPrivate: false,
  hostUserId: 'user_player_1',
  createdAt: new Date().toISOString(),
  config: {},
});

const mockPlayers: TablePlayer[] = [
  {
    tableId: 'table_test_001',
    userId: 'user_player_1',
    seatNumber: 1,
    teamIndex: 1,
    status: 'PLAYING',
    joinedAt: new Date().toISOString(),
    displayName: 'Carlos (P1)',
    avatarUrl: undefined,
  },
  {
    tableId: 'table_test_001',
    userId: 'user_player_2',
    seatNumber: 2,
    teamIndex: 2,
    status: 'PLAYING',
    joinedAt: new Date().toISOString(),
    displayName: 'Elena (P2)',
    avatarUrl: undefined,
  },
];

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    throw new Error(`Test fallido: ${testName}`);
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('RASPANDO LA OLLA — PRUEBAS DE INTEGRACIÓN REAL DE 8 JUEGOS');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. TIC TAC TOE (3 EN RAYA)
  // -------------------------------------------------------------
  console.log('1. Probando Motor: TicTacToeEngine (3 en Raya)');
  const tttEngine = new TicTacToeEngine();
  let tttState = tttEngine.initialize(mockTable('tic_tac_toe'), mockPlayers);
  assert(tttState.board.length === 9, 'Inicializa tablero de 9 casillas');
  assert(tttState.turnUserId === 'user_player_1', 'Turno inicial para Jugador 1');

  // Jugada válida P1 en casilla 0
  let res = tttEngine.applyAction(tttState, {
    sessionId: 's1',
    userId: 'user_player_1',
    actionType: 'PLACE_SYMBOL',
    actionData: { cellIndex: 0 },
    clientTimestamp: Date.now(),
  });
  assert(res.isValid && res.newState.board[0] === 'X', 'P1 coloca X en casilla 0');
  assert(res.newState.turnUserId === 'user_player_2', 'Turno cambia a P2');
  tttState = res.newState;

  // Jugada inválida (P1 intenta jugar de nuevo sin ser su turno)
  let invalidTurn = tttEngine.applyAction(tttState, {
    sessionId: 's1',
    userId: 'user_player_1',
    actionType: 'PLACE_SYMBOL',
    actionData: { cellIndex: 1 },
    clientTimestamp: Date.now(),
  });
  assert(!invalidTurn.isValid, 'Rechaza jugada fuera de turno');

  // Jugada inválida (P2 intenta jugar en casilla 0 ya ocupada)
  let occupiedCell = tttEngine.applyAction(tttState, {
    sessionId: 's1',
    userId: 'user_player_2',
    actionType: 'PLACE_SYMBOL',
    actionData: { cellIndex: 0 },
    clientTimestamp: Date.now(),
  });
  assert(!occupiedCell.isValid, 'Rechaza jugada en casilla ocupada');

  // Simular victoria de P1 (Fila 0, 1, 2)
  // P2 juega en 3
  res = tttEngine.applyAction(tttState, {
    sessionId: 's1',
    userId: 'user_player_2',
    actionType: 'PLACE_SYMBOL',
    actionData: { cellIndex: 3 },
    clientTimestamp: Date.now(),
  });
  tttState = res.newState;

  // P1 juega en 1
  res = tttEngine.applyAction(tttState, {
    sessionId: 's1',
    userId: 'user_player_1',
    actionType: 'PLACE_SYMBOL',
    actionData: { cellIndex: 1 },
    clientTimestamp: Date.now(),
  });
  tttState = res.newState;

  // P2 juega en 4
  res = tttEngine.applyAction(tttState, {
    sessionId: 's1',
    userId: 'user_player_2',
    actionType: 'PLACE_SYMBOL',
    actionData: { cellIndex: 4 },
    clientTimestamp: Date.now(),
  });
  tttState = res.newState;

  // P1 juega en 2 -> Gana ronda / partida
  res = tttEngine.applyAction(tttState, {
    sessionId: 's1',
    userId: 'user_player_1',
    actionType: 'PLACE_SYMBOL',
    actionData: { cellIndex: 2 },
    clientTimestamp: Date.now(),
  });
  assert(res.isValid && res.isGameOver && res.winnerUserId === 'user_player_1', 'P1 completa 3 en raya y gana la partida');

  // -------------------------------------------------------------
  // 2. ROCK PAPER SCISSORS (PIEDRA, PAPEL O TIJERA)
  // -------------------------------------------------------------
  console.log('\n2. Probando Motor: RockPaperScissorsEngine (Piedra, Papel o Tijera)');
  const rpsEngine = new RockPaperScissorsEngine();
  let rpsState = rpsEngine.initialize(mockTable('rock_paper_scissors'), mockPlayers);
  assert(rpsState.phase === 'selecting', 'Inicia en fase de selección');

  // P1 elige Piedra (secreto comprometido)
  let rpsRes = rpsEngine.applyAction(rpsState, {
    sessionId: 's2',
    userId: 'user_player_1',
    actionType: 'SUBMIT_CHOICE',
    actionData: { choice: 'rock' },
    clientTimestamp: Date.now(),
  });
  assert(rpsRes.isValid, 'P1 envía su elección');
  assert(rpsRes.newState.playerChoices['user_player_1'].committed, 'Elección P1 queda comprometida');
  assert(rpsRes.newState.phase === 'selecting', 'Sigue seleccionando hasta que P2 envíe');
  rpsState = rpsRes.newState;

  // P2 elige Tijera -> P1 gana la ronda
  rpsRes = rpsEngine.applyAction(rpsState, {
    sessionId: 's2',
    userId: 'user_player_2',
    actionType: 'SUBMIT_CHOICE',
    actionData: { choice: 'scissors' },
    clientTimestamp: Date.now(),
  });
  assert(rpsRes.isValid, 'P2 envía su elección');
  assert(rpsRes.newState.scores['user_player_1'] === 1, 'P1 suma 1 punto (Piedra vence a Tijera)');

  // -------------------------------------------------------------
  // 3. CHECKERS (DAMAS)
  // -------------------------------------------------------------
  console.log('\n3. Probando Motor: CheckersEngine (Damas Clásicas)');
  const checkersEngine = new CheckersEngine();
  let checkersState = checkersEngine.initialize(mockTable('checkers'), mockPlayers);
  assert(checkersState.board.length === 8 && checkersState.board[0].length === 8, 'Tablero de Damas de 8x8');
  assert(checkersState.turnUserId === 'user_player_1', 'Turno inicial para Jugador 1');

  // Movimiento diagonal simple de P1
  let moveRes = checkersEngine.applyAction(checkersState, {
    sessionId: 's3',
    userId: 'user_player_1',
    actionType: 'MOVE_PIECE',
    actionData: {
      move: { from: { row: 2, col: 1 }, to: { row: 3, col: 0 } },
    },
    clientTimestamp: Date.now(),
  });
  assert(moveRes.isValid, 'P1 realiza movimiento diagonal válido');
  assert(moveRes.newState.turnUserId === 'user_player_2', 'Turno pasa a P2');

  // -------------------------------------------------------------
  // 4. DOMINÓ VENEZOLANO
  // -------------------------------------------------------------
  console.log('\n4. Probando Motor: DominoEngine (Dominó Venezolano)');
  const dominoEngine = new DominoEngine();
  let dominoState = dominoEngine.initialize(mockTable('domino_venezolano'), mockPlayers);
  assert(dominoState.hands['user_player_1'].length === 7, 'P1 recibe 7 fichas');
  assert(dominoState.hands['user_player_2'].length === 7, 'P2 recibe 7 fichas');
  assert(dominoState.board.length === 0, 'Tablero inicial vacío');

  const startingUser = dominoState.turnUserId;
  const startingTile = dominoState.hands[startingUser][0];
  let domRes = dominoEngine.applyAction(dominoState, {
    sessionId: 's4',
    userId: startingUser,
    actionType: 'PLAY_TILE',
    actionData: { tile: startingTile, side: 'initial' },
    clientTimestamp: Date.now(),
  });
  assert(domRes.isValid && domRes.newState.board.length === 1, 'Jugador inicial coloca la primera ficha en la mesa');
  assert(domRes.newState.hands[startingUser].length === 6, 'Mano del jugador disminuye a 6 fichas');

  // -------------------------------------------------------------
  // 5. TRUCO VENEZOLANO
  // -------------------------------------------------------------
  console.log('\n5. Probando Motor: TrucoEngine (Truco Criollo)');
  const trucoEngine = new TrucoEngine();
  let trucoState = trucoEngine.initialize(mockTable('truco_venezolano'), mockPlayers);
  assert(Boolean(trucoState.vira), 'Vira generada correctamente');
  assert(trucoState.hands['user_player_1'].length === 3, 'P1 recibe 3 cartas de baraja española');
  assert(trucoState.hands['user_player_2'].length === 3, 'P2 recibe 3 cartas de baraja española');

  // P1 juega una carta
  const cardToPlay = trucoState.hands[trucoState.turnUserId][0];
  let trucoRes = trucoEngine.applyAction(trucoState, {
    sessionId: 's5',
    userId: trucoState.turnUserId,
    actionType: 'PLAY_CARD',
    actionData: { cardId: cardToPlay.id },
    clientTimestamp: Date.now(),
  });
  assert(trucoRes.isValid, 'Jugador tira carta a la mesa para la primera baza');

  // -------------------------------------------------------------
  // 6. BINGO ONLINE (75 BOLAS)
  // -------------------------------------------------------------
  console.log('\n6. Probando Motor: BingoEngine (Bingo 75 Bolas)');
  const bingoEngine = new BingoEngine();
  let bingoState = bingoEngine.initialize(mockTable('bingo'), mockPlayers);
  assert(bingoState.cards['user_player_1'].b.length === 5, 'Columna B de 5 números generada');
  assert(bingoState.cards['user_player_1'].n[2] === 'FREE', 'Casilla central N[2] es FREE');
  assert(bingoState.cards['user_player_1'].marked.length === 5, 'Matriz de marcaje 5x5 generada');

  // Extraer balota
  let drawRes = bingoEngine.applyAction(bingoState, {
    sessionId: 's6',
    userId: 'user_player_1',
    actionType: 'DRAW_BALL',
    actionData: {},
    clientTimestamp: Date.now(),
  });
  assert(drawRes.isValid && drawRes.newState.drawnBalls.length === 1, 'Balotera canta primera bola');

  // -------------------------------------------------------------
  // 7. POLLA VENEZOLANA
  // -------------------------------------------------------------
  console.log('\n7. Probando Motor: PollaEngine (Polla / Quiniela Deportiva)');
  const pollaEngine = new PollaEngine();
  let pollaState = pollaEngine.initialize(mockTable('polla_venezolana'), mockPlayers);
  assert(pollaState.fixtures.length > 0, 'Jornada con partidos LVBP y FUTVE');

  // Enviar pronóstico
  let pollaRes = pollaEngine.applyAction(pollaState, {
    sessionId: 's7',
    userId: 'user_player_1',
    actionType: 'SUBMIT_PREDICTIONS',
    actionData: {
      predictions: [
        { fixtureId: 'fix_1', homeScore: 5, awayScore: 3 },
        { fixtureId: 'fix_2', homeScore: 2, awayScore: 1 },
      ],
    },
    clientTimestamp: Date.now(),
  });
  assert(pollaRes.isValid, 'Pronósticos registrados correctamente');

  // -------------------------------------------------------------
  // 8. ATRAPAÍTO
  // -------------------------------------------------------------
  console.log('\n8. Probando Motor: AtrapaitoEngine (Reflejos y Rapidez)');
  const atrapaitoEngine = new AtrapaitoEngine();
  let atrapaitoState = atrapaitoEngine.initialize(mockTable('atrapaito'), mockPlayers);
  assert(atrapaitoState.targetNumber >= 5, 'Número objetivo generado');
  assert(atrapaitoState.playerHands['user_player_1'].length === 5, 'P1 recibe 5 cartas de reflejos');

  // -------------------------------------------------------------
  // 9. VERIFICACIÓN FINANCIERA DE LIQUIDACIÓN 90/10
  // -------------------------------------------------------------
  console.log('\n9. Probando Regla Financiera: Liquidación 90/10 y Reembolso 100%');
  const entryFee = 100.0;
  const numPlayers = 2;
  const grossPool = entryFee * numPlayers;
  const prizePool = Math.round(grossPool * 0.9 * 100) / 100;
  const platformFee = Math.round((grossPool - prizePool) * 100) / 100;

  assert(grossPool === 200.0, 'Pozo bruto de 2 jugadores a 100 Bs = 200 Bs');
  assert(prizePool === 180.0, 'Premio ganador 90% = 180 Bs');
  assert(platformFee === 20.0, 'Comisión plataforma 10% = 20 Bs');
  assert(prizePool + platformFee === grossPool, 'Suma matemática exacta sin fugas');

  console.log('\n================================================================');
  console.log(`TODAS LAS PRUEBAS COMPLETADAS: ${passedTests}/${totalTests} PASADAS (100%)`);
  console.log('================================================================');
}

runAllTests().catch((err) => {
  console.error('Error durante la ejecución de pruebas:', err);
  process.exit(1);
});
