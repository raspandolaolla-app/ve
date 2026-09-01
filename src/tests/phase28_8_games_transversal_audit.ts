// ==============================================================================
// RASPANDO LA OLLA — FASE 28: AUDITORÍA TRANSVERSAL DE LOS 8 JUEGOS Y CICLO DE VIDA
// ==============================================================================
// 1. Verificación de inicialización pura de cada motor (8 juegos tradicionales + extras).
// 2. Aislamiento de mesa: Sin jugadas, la partida PERMANECE ACTIVA (sin forfeits ni abandonos).
// 3. Normalización resiliente de estados parciales a través de gameStateGuard.
// 4. Validación de movimientos y prevención de finalización prematura.
// ==============================================================================

import { getGameEngine } from '../features/games/engines';
import {
  normalizeTicTacToeState,
  normalizeRPSState,
  normalizeCheckersState,
  normalizeDominoState,
  normalizeTrucoState,
  normalizeBingoState,
  normalizePollaState,
  normalizeAtrapaitoState,
  normalizeGameStateByType,
} from '../features/games/utils/gameStateGuard';
import type { GameTable, TablePlayer } from '../types/tables';
import type { GameActionPayload } from '../types/games';

interface AuditResult {
  game: string;
  initialized: boolean;
  activeWithoutMoves: boolean;
  validMoveExecuted: boolean;
  invalidMoveRejected: boolean;
  stateGuardPass: boolean;
  notes: string[];
}

export function run8GamesTransversalAudit(): {
  allPassed: boolean;
  results: AuditResult[];
} {
  console.log('\n======================================================================');
  console.log('       FASE 28: AUDITORÍA TRANSVERSAL DE LOS 8 JUEGOS DE LA PLATAFORMA   ');
  console.log('======================================================================');

  const now = new Date().toISOString();

  const p1: TablePlayer = {
    tableId: 'table_audit',
    userId: 'user_audit_p1',
    displayName: 'Carlos Criollo',
    seatNumber: 1,
    isReady: true,
    joinedAt: now,
  };

  const p2: TablePlayer = {
    tableId: 'table_audit',
    userId: 'user_audit_p2',
    displayName: 'Maria Llanera',
    seatNumber: 2,
    isReady: true,
    joinedAt: now,
  };

  const p3: TablePlayer = {
    tableId: 'table_audit',
    userId: 'user_audit_p3',
    displayName: 'Pedro Guaro',
    seatNumber: 3,
    isReady: true,
    joinedAt: now,
  };

  const p4: TablePlayer = {
    tableId: 'table_audit',
    userId: 'user_audit_p4',
    displayName: 'Ana Oriental',
    seatNumber: 4,
    isReady: true,
    joinedAt: now,
  };

  const createMockTable = (
    gameType: any,
    name: string,
    minPlayers = 2,
    maxPlayers = 2,
    config: Record<string, any> = {}
  ): GameTable => ({
    id: `table_audit_${gameType}`,
    gameType,
    name,
    mode: '1v1',
    entryFee: 25,
    currency: 'VES',
    minPlayers,
    maxPlayers,
    currentPlayersCount: minPlayers,
    status: 'IN_PROGRESS',
    hostUserId: p1.userId,
    isPrivate: false,
    joinCode: 'AUDIT01',
    shareToken: 'AUDIT01_TOKEN',
    config,
    createdAt: now,
  });

  const auditResults: AuditResult[] = [];

  // ----------------------------------------------------------------------------
  // 1. LA VIEJA (TIC TAC TOE)
  // ----------------------------------------------------------------------------
  {
    const notes: string[] = [];
    const table = createMockTable('tic_tac_toe', 'Mesa La Vieja');

    const engine = getGameEngine('tic_tac_toe');
    const state = engine.initialize(table, [p1, p2]);
    const initOk = state.status === 'playing' && state.turnUserId === p1.userId && state.board.length === 9;
    if (initOk) notes.push('Inicializado correctamente');

    const restingOk = state.status === 'playing' && state.winnerUserId === null;

    const action: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'PLACE_SYMBOL',
      actionData: { cellIndex: 4 },
      clientTimestamp: Date.now(),
    };
    const moveRes = engine.applyAction(state, action);
    const moveOk = moveRes.isValid && moveRes.newState.board[4] === 'X' && moveRes.newState.turnUserId === p2.userId;

    const invAction: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'PLACE_SYMBOL',
      actionData: { cellIndex: 0 },
      clientTimestamp: Date.now(),
    };
    const invRes = engine.applyAction(moveRes.newState, invAction);
    const invOk = !invRes.isValid;

    const guarded = normalizeTicTacToeState({ board: ['X'] });
    const guardOk = Array.isArray(guarded.state.board) && guarded.state.board.length === 9 && guarded.state.status === 'playing';

    auditResults.push({
      game: '1. La Vieja (tic_tac_toe)',
      initialized: initOk,
      activeWithoutMoves: restingOk,
      validMoveExecuted: moveOk,
      invalidMoveRejected: invOk,
      stateGuardPass: guardOk,
      notes,
    });
  }

  // ----------------------------------------------------------------------------
  // 2. PIEDRA, PAPEL O TIJERA
  // ----------------------------------------------------------------------------
  {
    const notes: string[] = [];
    const table = createMockTable('rock_paper_scissors', 'Mesa PPT');

    const engine = getGameEngine('rock_paper_scissors');
    const state = engine.initialize(table, [p1, p2]);
    const initOk = state.phase === 'selecting' && state.status === 'playing';

    const restingOk = state.status === 'playing' && state.winnerUserId === null;

    const action: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'SUBMIT_CHOICE',
      actionData: { choice: 'rock' },
      clientTimestamp: Date.now(),
    };
    const moveRes = engine.applyAction(state, action);
    const moveOk = moveRes.isValid && moveRes.newState.playerChoices[p1.userId]?.committed === true;

    const invAction: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'SUBMIT_CHOICE',
      actionData: { choice: 'paper' },
      clientTimestamp: Date.now(),
    };
    const invRes = engine.applyAction(moveRes.newState, invAction);
    const invOk = !invRes.isValid;

    const guarded = normalizeRPSState({ scores: { [p1.userId]: 1 } });
    const guardOk = guarded.state.phase === 'selecting' && guarded.state.scores[p1.userId] === 1;

    auditResults.push({
      game: '2. Piedra, Papel o Tijera (rock_paper_scissors)',
      initialized: initOk,
      activeWithoutMoves: restingOk,
      validMoveExecuted: moveOk,
      invalidMoveRejected: invOk,
      stateGuardPass: guardOk,
      notes,
    });
  }

  // ----------------------------------------------------------------------------
  // 3. DAMAS VENEZOLANAS (CHECKERS)
  // ----------------------------------------------------------------------------
  {
    const notes: string[] = [];
    const table = createMockTable('checkers', 'Mesa Damas');

    const engine = getGameEngine('checkers');
    const state = engine.initialize(table, [p1, p2]);
    const initOk = state.status === 'playing' && state.board.length === 8;

    const restingOk = state.status === 'playing' && state.winnerUserId === null;

    const action: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'MOVE_PIECE',
      actionData: { move: { from: { row: 2, col: 1 }, to: { row: 3, col: 0 } } },
      clientTimestamp: Date.now(),
    };
    const moveRes = engine.applyAction(state, action);
    const moveOk = moveRes.isValid && moveRes.newState.board[3][0] !== null;

    const invAction: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p2.userId,
      actionType: 'MOVE_PIECE',
      actionData: { move: { from: { row: 5, col: 0 }, to: { row: 4, col: 1 } } },
      clientTimestamp: Date.now(),
    };
    const invRes = engine.applyAction(state, invAction);
    const invOk = !invRes.isValid;

    const guarded = normalizeCheckersState(state);
    const guardOk = Array.isArray(guarded.state.board) && guarded.state.board.length === 8;

    auditResults.push({
      game: '3. Damas Venezolanas (checkers)',
      initialized: initOk,
      activeWithoutMoves: restingOk,
      validMoveExecuted: moveOk,
      invalidMoveRejected: invOk,
      stateGuardPass: guardOk,
      notes,
    });
  }

  // ----------------------------------------------------------------------------
  // 4. DOMINÓ VENEZOLANO
  // ----------------------------------------------------------------------------
  {
    const notes: string[] = [];
    const table = createMockTable('domino_venezolano', 'Mesa Dominó');

    const engine = getGameEngine('domino_venezolano');
    const state = engine.initialize(table, [p1, p2]);
    const initOk = state.status === 'playing' && Boolean(state.turnUserId) && state.board.length === 0;

    const restingOk = state.status === 'playing' && state.winnerUserId === null;

    const starterHand = state.hands[state.turnUserId];
    const firstTile = starterHand[0];
    const action: GameActionPayload = {
      sessionId: 'sess_1',
      userId: state.turnUserId,
      actionType: 'PLAY_TILE',
      actionData: { tile: firstTile, side: 'right' },
      clientTimestamp: Date.now(),
    };
    const moveRes = engine.applyAction(state, action);
    const moveOk = moveRes.isValid && moveRes.newState.board.length === 1;

    const invAction: GameActionPayload = {
      sessionId: 'sess_1',
      userId: moveRes.newState.turnUserId,
      actionType: 'PLAY_TILE',
      actionData: { tile: [9, 9], side: 'left' },
      clientTimestamp: Date.now(),
    };
    const invRes = engine.applyAction(moveRes.newState, invAction);
    const invOk = !invRes.isValid;

    const guarded = normalizeDominoState({ board: [] });
    const guardOk = Array.isArray(guarded.state.board) && guarded.state.status === 'playing';

    auditResults.push({
      game: '4. Dominó Venezolano (domino_venezolano)',
      initialized: initOk,
      activeWithoutMoves: restingOk,
      validMoveExecuted: moveOk,
      invalidMoveRejected: invOk,
      stateGuardPass: guardOk,
      notes,
    });
  }

  // ----------------------------------------------------------------------------
  // 5. TRUCO VENEZOLANO
  // ----------------------------------------------------------------------------
  {
    const notes: string[] = [];
    const table = createMockTable('truco_venezolano', 'Mesa Truco');

    const engine = getGameEngine('truco_venezolano');
    const state = engine.initialize(table, [p1, p2]);
    const initOk = state.status === 'playing' && Boolean(state.vira) && state.hands[p1.userId]?.length === 3;

    const restingOk = state.status === 'playing' && state.winnerUserId === null;

    const currentHand = state.hands[state.turnUserId];
    const cardToPlay = currentHand[0];
    const action: GameActionPayload = {
      sessionId: 'sess_1',
      userId: state.turnUserId,
      actionType: 'PLAY_CARD',
      actionData: { cardId: cardToPlay.id },
      clientTimestamp: Date.now(),
    };
    const moveRes = engine.applyAction(state, action);
    const moveOk = moveRes.isValid && (moveRes.newState.playedTricks.length > 0 || moveRes.newState.hands[state.turnUserId].length < 3);

    const invAction: GameActionPayload = {
      sessionId: 'sess_1',
      userId: state.turnUserId,
      actionType: 'PLAY_CARD',
      actionData: { cardId: 'non_existent_card_id' },
      clientTimestamp: Date.now(),
    };
    const invRes = engine.applyAction(state, invAction);
    const invOk = !invRes.isValid;

    const guarded = normalizeTrucoState({ points: {} });
    const guardOk = typeof guarded.state.targetPoints === 'number' && guarded.state.status === 'playing';

    auditResults.push({
      game: '5. Truco Venezolano (truco_venezolano)',
      initialized: initOk,
      activeWithoutMoves: restingOk,
      validMoveExecuted: moveOk,
      invalidMoveRejected: invOk,
      stateGuardPass: guardOk,
      notes,
    });
  }

  // ----------------------------------------------------------------------------
  // 6. BINGO ONLINE
  // ----------------------------------------------------------------------------
  {
    const notes: string[] = [];
    const table = createMockTable('bingo', 'Sala Bingo 75', 2, 50, { variant: '75' });

    const engine = getGameEngine('bingo');
    const state = engine.initialize(table, [p1, p2]);
    const initOk = state.status === 'in_progress' && state.cards[p1.userId]?.length > 0;

    const restingOk = state.status === 'in_progress' && state.winnerUserId === null;

    const action: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'DRAW_BALL',
      actionData: { ball: 42 },
      clientTimestamp: Date.now(),
    };
    const moveRes = engine.applyAction(state, action);
    const moveOk = moveRes.isValid && moveRes.newState.drawnBalls.includes(42);

    const invAction: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'CLAIM_BINGO',
      actionData: {},
      clientTimestamp: Date.now(),
    };
    const invRes = engine.applyAction(moveRes.newState, invAction);
    const invOk = !invRes.isValid;

    const guarded = normalizeBingoState({ drawnBalls: [] });
    const guardOk = Array.isArray(guarded.state.drawnBalls) && guarded.state.status === 'in_progress';

    auditResults.push({
      game: '6. Bingo Online (bingo)',
      initialized: initOk,
      activeWithoutMoves: restingOk,
      validMoveExecuted: moveOk,
      invalidMoveRejected: invOk,
      stateGuardPass: guardOk,
      notes,
    });
  }

  // ----------------------------------------------------------------------------
  // 7. POLLA VENEZOLANA
  // ----------------------------------------------------------------------------
  {
    const notes: string[] = [];
    const table = createMockTable('polla_venezolana', 'Polla LVBP', 2, 100);

    const engine = getGameEngine('polla_venezolana');
    const state = engine.initialize(table, [p1, p2]);
    const initOk = state.status === 'open_picks' && state.fixtures.length > 0;

    const restingOk = state.status === 'open_picks' && state.winnerUserId === null;

    const action: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'SUBMIT_PREDICTIONS',
      actionData: {
        predictions: [{ fixtureId: 'fix_1', predictedHome: 5, predictedAway: 3 }],
      },
      clientTimestamp: Date.now(),
    };
    const moveRes = engine.applyAction(state, action);
    const moveOk = moveRes.isValid && moveRes.newState.predictions[p1.userId]?.length === 1;

    const invAction: GameActionPayload = {
      sessionId: 'sess_1',
      userId: p1.userId,
      actionType: 'SUBMIT_PREDICTIONS',
      actionData: { predictions: [] },
      clientTimestamp: Date.now(),
    };
    const invRes = engine.applyAction(state, invAction);
    const invOk = !invRes.isValid;

    const guarded = normalizePollaState(state);
    const guardOk = guarded.state.fixtures.length > 0;

    auditResults.push({
      game: '7. Polla Venezolana (polla_venezolana)',
      initialized: initOk,
      activeWithoutMoves: restingOk,
      validMoveExecuted: moveOk,
      invalidMoveRejected: invOk,
      stateGuardPass: guardOk,
      notes,
    });
  }

  // ----------------------------------------------------------------------------
  // 8. ATRAPAÍTO (PARCHÍS CRIOLLO)
  // ----------------------------------------------------------------------------
  {
    const notes: string[] = [];
    const table = createMockTable('atrapaito', 'Mesa Atrapaíto', 4, 4, { atrapaitoMode: 'INDIVIDUAL_4' });

    const engine = getGameEngine('atrapaito');
    const state = engine.initialize(table, [p1, p2, p3, p4]);
    const initOk = state.status === 'playing' && state.turnPhase === 'ROLL_DICE' && Boolean(state.turnUserId);

    const restingOk = state.status === 'playing' && state.winnerUserId === null;

    const action: GameActionPayload = {
      sessionId: 'sess_1',
      userId: state.turnUserId,
      actionType: 'ROLL_DICE',
      actionData: { diceValue: 5 },
      clientTimestamp: Date.now(),
    };
    const moveRes = engine.applyAction(state, action);
    const moveOk = moveRes.isValid && moveRes.newState.diceValue === 5;

    const otherUser = p4.userId === state.turnUserId ? p1.userId : p4.userId;
    const invAction: GameActionPayload = {
      sessionId: 'sess_1',
      userId: otherUser,
      actionType: 'ROLL_DICE',
      actionData: { diceValue: 3 },
      clientTimestamp: Date.now(),
    };
    const invRes = engine.applyAction(state, invAction);
    const invOk = !invRes.isValid;

    const guarded = normalizeAtrapaitoState({ players: {} });
    const guardOk = guarded.state.turnPhase === 'ROLL_DICE' && guarded.state.status === 'playing';

    auditResults.push({
      game: '8. Atrapaíto / Parchís (atrapaito)',
      initialized: initOk,
      activeWithoutMoves: restingOk,
      validMoveExecuted: moveOk,
      invalidMoveRejected: invOk,
      stateGuardPass: guardOk,
      notes,
    });
  }

  // ----------------------------------------------------------------------------
  // RESUMEN Y REPORTE
  // ----------------------------------------------------------------------------
  let allPassed = true;
  for (const res of auditResults) {
    const passed =
      res.initialized &&
      res.activeWithoutMoves &&
      res.validMoveExecuted &&
      res.invalidMoveRejected &&
      res.stateGuardPass;

    if (!passed) allPassed = false;

    console.log(`\n▶ ${res.game}:`);
    console.log(`  - Inicialización limpia: ${res.initialized ? '✓' : '✗'}`);
    console.log(`  - Permanece activa en reposo (sin jugadas): ${res.activeWithoutMoves ? '✓' : '✗'}`);
    console.log(`  - Ejecución de jugada válida: ${res.validMoveExecuted ? '✓' : '✗'}`);
    console.log(`  - Rechazo de jugada inválida: ${res.invalidMoveRejected ? '✓' : '✗'}`);
    console.log(`  - Resiliencia StateGuard: ${res.stateGuardPass ? '✓' : '✗'}`);
  }

  console.log(`\n======================================================================`);
  console.log(`RESULTADO AUDITORÍA 8 JUEGOS: ${allPassed ? '✓ 100% PASADA' : '✗ HUBO FALLOS'}`);
  console.log(`======================================================================\n`);

  return { allPassed, results: auditResults };
}
