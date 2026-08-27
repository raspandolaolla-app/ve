// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: JUEGOS Y REGLAS
// ==============================================================================

export type GameType =
  | 'tic_tac_toe'      // 3 en Raya
  | 'rock_paper_scissors' // Piedra, Papel o Tijera
  | 'checkers'         // Damas
  | 'domino_venezolano'// Dominó Venezolano
  | 'truco_venezolano' // Truco Venezolano
  | 'bingo'            // Bingo Online
  | 'polla_venezolana' // Polla Venezolana
  | 'atrapaito';       // Atrapaíto

export type GameMode = '1v1' | '2v2' | '1v3' | '1v4' | 'mass_participation';

export interface GameMetadata {
  id: GameType;
  name: string;
  shortDescription: string;
  minPlayers: number;
  maxPlayers: number;
  allowedModes: GameMode[];
  minEntryFee: number;
  maxEntryFee: number;
  isActive: boolean;
  requiresCommitReveal?: boolean;
}

export interface GameSession {
  id: string;
  tableId: string;
  gameType: GameType;
  roundNumber: number;
  currentTurnUserId?: string;
  turnExpiresAt?: string;
  status: 'initializing' | 'in_progress' | 'settling' | 'completed' | 'abandoned';
  grossPool: number;
  winnerPrizeAmount: number; // 90% del pozo bruto
  serviceFeeAmount: number;   // 10% del pozo bruto
  winnerUserId?: string;
  winnerTeamIndex?: number;
  isSettled: boolean;
  settledAt?: string;
  currentState?: Record<string, unknown>;
}

export interface GameActionPayload {
  sessionId: string;
  userId: string;
  actionType: string;
  actionData: Record<string, unknown>;
  clientTimestamp: number;
  sequenceNumber?: number;
  idempotencyKey?: string;
}

// ------------------------------------------------------------------------------
// 1. TRES EN RAYA (TIC TAC TOE)
// ------------------------------------------------------------------------------
export type TicTacToeSymbol = 'X' | 'O';

export interface TicTacToeState {
  board: (TicTacToeSymbol | null)[]; // 9 celdas (0-8)
  turnUserId: string;
  playerSymbols: Record<string, TicTacToeSymbol>; // userId -> 'X' | 'O'
  playerNames: Record<string, string>;
  lives?: Record<string, number>;
  round: number;
  targetWins: number;
  scores: Record<string, number>;
  status: 'playing' | 'round_won' | 'game_won' | 'draw';
  winningLine: number[] | null;
  winnerUserId: string | null;
  roundWinnerUserId: string | null;
  moveHistory: {
    cellIndex: number;
    symbol: TicTacToeSymbol;
    userId: string;
    timestamp: number;
  }[];
}

// ------------------------------------------------------------------------------
// 2. PIEDRA, PAPEL O TIJERA (ROCK PAPER SCISSORS)
// ------------------------------------------------------------------------------
export type RPSChoice = 'rock' | 'paper' | 'scissors';

export interface RPSRoundRecord {
  roundNumber: number;
  choices: Record<string, RPSChoice>;
  winnerUserId: string | null; // null = empate
  summary: string;
}

export interface RPSState {
  round: number;
  targetWins: number;
  scores: Record<string, number>;
  playerNames: Record<string, string>;
  lives?: Record<string, number>;
  playerChoices: Record<string, { choice?: RPSChoice; committed: boolean; hash?: string }>;
  phase: 'selecting' | 'round_result' | 'match_ended';
  status: 'playing' | 'round_won' | 'game_won' | 'draw';
  winnerUserId: string | null;
  roundWinnerUserId: string | null;
  history: RPSRoundRecord[];
}

// ------------------------------------------------------------------------------
// 3. DAMAS (CHECKERS)
// ------------------------------------------------------------------------------
export interface CheckersPiece {
  id: string;
  player: 1 | 2;
  userId: string;
  isKing: boolean;
}

export interface CheckersMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  captured?: { row: number; col: number };
}

export interface CheckersState {
  board: (CheckersPiece | null)[][]; // 8x8
  turnUserId: string;
  players: { userId: string; playerNumber: 1 | 2; name: string }[];
  capturedCount: Record<string, number>;
  lives?: Record<string, number>;
  status: 'playing' | 'game_won' | 'draw';
  winnerUserId: string | null;
  lastMove: CheckersMove | null;
  validMovesForCurrentPlayer?: CheckersMove[];
}

// ------------------------------------------------------------------------------
// 4. DOMINÓ VENEZOLANO
// ------------------------------------------------------------------------------
export type DominoTile = [number, number]; // [0..6, 0..6]

export interface DominoPlacedTile {
  tile: DominoTile;
  side: 'left' | 'right' | 'initial';
  flipped: boolean;
  playedByUserId: string;
}

export interface DominoState {
  hands: Record<string, DominoTile[]>;
  board: DominoPlacedTile[];
  leftEnd: number | null;
  rightEnd: number | null;
  turnUserId: string;
  playerOrder: string[];
  playerNames: Record<string, string>;
  lives?: Record<string, number>;
  targetScore: number;
  cumulativeScores: Record<string, number>;
  round: number;
  passesInRow: number;
  status: 'playing' | 'round_won' | 'tranca_won' | 'game_won' | 'draw';
  winnerUserId: string | null;
  roundWinnerUserId: string | null;
  isTranca: boolean;
}

// ------------------------------------------------------------------------------
// 5. TRUCO VENEZOLANO
// ------------------------------------------------------------------------------
export type TrucoSuit = 'espadas' | 'bastos' | 'oros' | 'copas';

export interface TrucoCard {
  number: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
  suit: TrucoSuit;
  id: string;
  isPerico?: boolean;
  isPerica?: boolean;
}

export interface TrucoState {
  vira: TrucoCard;
  hands: Record<string, TrucoCard[]>;
  playedTricks: {
    trickNumber: number;
    cards: { userId: string; card: TrucoCard }[];
    winnerUserId: string | null;
  }[];
  trickWinners: (string | null)[];
  turnUserId: string;
  playerOrder: string[];
  playerNames: Record<string, string>;
  points: Record<string, number>;
  targetPoints: number; // 12 o 24
  cantoState: {
    envidoPoints: number;
    envidoAccepted: boolean | null;
    trucoPoints: number;
    trucoAccepted: boolean | null;
    florCalledBy: string[];
  };
  status: 'playing' | 'round_won' | 'game_won';
  winnerUserId: string | null;
}

// ------------------------------------------------------------------------------
// 6. BINGO ONLINE
// ------------------------------------------------------------------------------
export interface BingoCard {
  b: number[]; // 5
  i: number[]; // 5
  n: (number | 'FREE')[]; // 5 (center FREE)
  g: number[]; // 5
  o: number[]; // 5
  marked: boolean[][]; // 5x5
}

export interface BingoState {
  drawnBalls: number[];
  currentBall: number | null;
  cards: Record<string, BingoCard>;
  playerNames: Record<string, string>;
  winnerUserId: string | null;
  status: 'in_progress' | 'bingo_won' | 'finished';
  callIntervalMs: number;
  totalBalls: number;
}

// ------------------------------------------------------------------------------
// 7. POLLA VENEZOLANA (QUINIELA DE ANIMALITOS 00-76)
// ------------------------------------------------------------------------------
export type PollaBlockType = 'MAÑANA' | 'TARDE';

export interface PollaTicket {
  id: string;
  userId: string;
  block: PollaBlockType;
  drawDate: string; // YYYY-MM-DD
  animalitos: string[]; // 6 códigos de animalitos (ej: ['00', '15', '22', '31', '45', '76'])
  costBs: number; // 250 Bs
  hits: number;
  status: 'PENDING' | 'WINNER' | 'NOT_WINNER' | 'CANCELLED';
  prizeBs: number;
  createdAt: string;
}

export interface PollaLotteryResult {
  lotteryName: string;
  numbers: string[]; // Códigos de animalitos (00-76)
}

export interface PollaDrawResultItem {
  id: string;
  drawDate: string;
  block: PollaBlockType;
  drawTime: string; // '08:00', '09:00', ..., '19:00'
  lotteries: PollaLotteryResult[];
  createdAt: string;
}

export interface PollaBlockWinner {
  block: PollaBlockType;
  drawDate: string;
  winnerUserId: string | null;
  winnerName: string | null;
  winnerTicketId: string | null;
  hits: number;
  prizeBs: number;
}

export interface PollaFixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  category: string;
  date: string;
  result?: { homeScore: number; awayScore: number; status: 'pending' | 'finished' };
}

export interface PollaPrediction {
  fixtureId: string;
  predictedHomeScore: number;
  predictedAwayScore: number;
  pick: 'HOME' | 'DRAW' | 'AWAY';
}

export interface PollaState {
  fixtures: PollaFixture[];
  predictions: Record<string, PollaPrediction[]>; // userId -> picks
  playerNames: Record<string, string>;
  leaderboard: { userId: string; points: number; correctExact: number; correctOutcome: number }[];
  status: 'open_picks' | 'in_progress' | 'settled';
  winnerUserId: string | null;
  // Campos extendidos para Polla Venezolana (Animalitos)
  activeBlock?: PollaBlockType;
  selectedDate?: string;
  myTickets?: PollaTicket[];
  blockWinners?: PollaBlockWinner[];
}

// ------------------------------------------------------------------------------
// 8. ATRAPAÍTO
// ------------------------------------------------------------------------------
export interface AtrapaitoState {
  targetNumber: number;
  currentCardsInMiddle: { id: string; value: number; label: string }[];
  playerHands: Record<string, { id: string; value: number; label: string }[]>;
  playerNames: Record<string, string>;
  playerScores: Record<string, number>;
  targetScore: number;
  turnUserId: string;
  status: 'playing' | 'round_won' | 'game_won';
  winnerUserId: string | null;
  lastReaction: { userId: string; success: boolean; delta: number; message: string } | null;
}

