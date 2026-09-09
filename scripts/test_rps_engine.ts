import { RockPaperScissorsEngine } from '../src/features/games/engines/RockPaperScissorsEngine';
import type { GameTable, TablePlayer } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

async function runTests() {
  console.log('--- TEST: RockPaperScissorsEngine Invariant and Lifecycle Verification ---');

  const engine = new RockPaperScissorsEngine();

  const mockTable: GameTable = {
    id: 'test-table-uuid',
    name: 'Mesa RPS Test',
    gameType: 'rock_paper_scissors',
    hostUserId: 'user-p1',
    status: 'ACTIVE',
    minPlayers: 2,
    maxPlayers: 2,
    currentPlayers: 2,
    minBet: 10,
    maxBet: 100,
    isPrivate: false,
    rules: { turnDuration: 15 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPlayers: TablePlayer[] = [
    {
      tableId: 'test-table-uuid',
      userId: 'user-p1',
      displayName: 'Jugador 1',
      seatNumber: 1,
      status: 'PLAYING',
      isHost: true,
      joinedAt: new Date().toISOString(),
    },
    {
      tableId: 'test-table-uuid',
      userId: 'user-p2',
      displayName: 'Jugador 2',
      seatNumber: 2,
      status: 'PLAYING',
      isHost: false,
      joinedAt: new Date().toISOString(),
    },
  ];

  // 1. Inicialización
  const initialState = engine.initialize(mockTable, mockPlayers);
  assert(initialState.currentTurnUserId === null, 'initialState.currentTurnUserId is strictly null');
  assert(initialState.turnUserId === null, 'initialState.turnUserId is strictly null');
  assert(initialState.status === 'ROUND_COMMIT', 'initialState.status is ROUND_COMMIT');
  assert(initialState.player1Lives === 3 && initialState.player2Lives === 3, 'Both players start with 3 lives');

  // 2. Jugador 1 envía Piedra
  const p1Action = {
    sessionId: 'session-123',
    userId: 'user-p1',
    actionType: 'CHOOSE',
    actionData: { choice: 'ROCK' },
    clientTimestamp: Date.now(),
  };
  const val1 = engine.validateAction(initialState, p1Action);
  assert(val1.valid, 'P1 choice validation is valid');
  const res1 = engine.applyAction(initialState, p1Action);
  assert(res1.isValid, 'P1 choice applyAction is valid');
  assert(res1.newState.currentTurnUserId === null, 'After P1 choice, currentTurnUserId remains null');
  assert(res1.newState.player1Choice === 'ROCK', 'Player 1 choice is ROCK');
  assert(res1.newState.player2Choice === null, 'Player 2 choice is still null');

  // 3. Jugador 2 envía Tijera
  const p2Action = {
    sessionId: 'session-123',
    userId: 'user-p2',
    actionType: 'CHOOSE',
    actionData: { choice: 'SCISSORS' },
    clientTimestamp: Date.now(),
  };
  const val2 = engine.validateAction(res1.newState, p2Action);
  assert(val2.valid, 'P2 choice validation is valid');
  const res2 = engine.applyAction(res1.newState, p2Action);
  assert(res2.isValid, 'P2 choice applyAction is valid');
  assert(res2.newState.status === 'ROUND_REVEAL', 'After both choose, status is ROUND_REVEAL');
  assert(res2.newState.currentTurnUserId === null, 'In ROUND_REVEAL, currentTurnUserId is strictly null');
  assert(res2.newState.roundWinner === 'PLAYER1', 'Player 1 (ROCK) beats Player 2 (SCISSORS)');
  assert(res2.newState.player2Lives === 2, 'Player 2 loses 1 life (2 remaining)');
  assert(res2.newState.player1Lives === 3, 'Player 1 maintains 3 lives');

  // 4. Siguiente Ronda
  const nextRndAction = {
    sessionId: 'session-123',
    userId: 'user-p1',
    actionType: 'NEXT_ROUND',
    clientTimestamp: Date.now(),
  };
  const valNext = engine.validateAction(res2.newState, nextRndAction);
  assert(valNext.valid, 'NEXT_ROUND validation is valid');
  const resNext = engine.applyAction(res2.newState, nextRndAction);
  assert(resNext.isValid, 'NEXT_ROUND applyAction is valid');
  assert(resNext.newState.status === 'ROUND_COMMIT', 'Next round is back in ROUND_COMMIT');
  assert(resNext.newState.currentTurnUserId === null, 'In next round, currentTurnUserId is strictly null');
  assert(resNext.newState.roundNumber === 2, 'Round number is now 2');
  assert(resNext.newState.player1Choice === null && resNext.newState.player2Choice === null, 'Choices are cleared for new round');

  console.log('--- ALL RPS ENGINE INVARIANT TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
