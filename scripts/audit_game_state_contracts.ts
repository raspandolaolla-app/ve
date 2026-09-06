import { getGameEngine } from '../src/features/games/engines';
import { normalizeGameStateByType } from '../src/features/games/utils/gameStateGuard';
import type { GameTable, TablePlayer } from '../src/types/tables';
import type { GameType } from '../src/types/games';

const games: GameType[] = [
  'tic_tac_toe',
  'rock_paper_scissors',
  'checkers',
  'domino_venezolano',
  'truco_venezolano',
  'bingo',
  'polla_venezolana',
  'atrapaito',
  'chess',
  'una_olla'
];

const mockPlayers: TablePlayer[] = [
  { tableId: 't1', userId: 'u1', seatNumber: 1, status: 'PLAYING', displayName: 'Jugador 1', avatarUrl: '', joinedAt: '' },
  { tableId: 't1', userId: 'u2', seatNumber: 2, status: 'PLAYING', displayName: 'Jugador 2', avatarUrl: '', joinedAt: '' }
];

const mockTable = (gt: GameType): GameTable => ({
  id: 't1',
  gameType: gt,
  name: 'Mesa 1',
  hostUserId: 'u1',
  mode: '1v1',
  entryFee: 10,
  currency: 'VES',
  minPlayers: 2,
  maxPlayers: 4,
  currentPlayersCount: 2,
  status: 'ACTIVE',
  isPrivate: false,
  joinCode: '123',
  shareToken: '123',
  createdAt: '',
  config: {}
});

console.log('=== CONTRACT MATRIX: engine.initialize vs normalizeGameStateByType ===');
for (const g of games) {
  const engine = getGameEngine(g);
  const table = mockTable(g);
  const initState = engine.initialize(table, mockPlayers);
  const norm1 = normalizeGameStateByType(g, initState, initState, mockPlayers);
  const normEmpty = normalizeGameStateByType(g, {}, initState, mockPlayers);
  const normNull = normalizeGameStateByType(g, null, initState, mockPlayers);

  console.log(`[${g}]`);
  console.log(`  initState keys:`, Object.keys(initState || {}));
  console.log(`  norm(initState): isValid=${norm1.isValid}, missingProps=${JSON.stringify(norm1.missingProps)}`);
  console.log(`  norm({}): isValid=${normEmpty.isValid}, missingProps=${JSON.stringify(normEmpty.missingProps)}`);
  console.log(`  norm(null): isValid=${normNull.isValid}, missingProps=${JSON.stringify(normNull.missingProps)}`);
}
