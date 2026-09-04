// ==============================================================================
// RASPANDO LA OLLA — GUARDIA Y NORMALIZADOR DE ESTADOS DE JUEGO TRANSVERSAL
// ==============================================================================
// Garantiza la integridad del esquema por tipo de juego, previene excepciones
// fatales por propiedades faltantes (playerSymbols, playerNames, hands, etc.)
// y asegura sanitización segura sin filtrar datos privados ni romper el renderizado.
// ==============================================================================

import type {
  GameType,
  TicTacToeState,
  TicTacToeSymbol,
  RPSState,
  CheckersState,
  DominoState,
  TrucoState,
  BingoState,
  PollaState,
  AtrapaitoState,
  UnaOllaState,
  ChessState,
} from '../../../types/games';
import type { TablePlayer } from '../../../types/tables';

export interface StateValidationResult<T = any> {
  state: T;
  isValid: boolean;
  missingProps: string[];
}

/**
 * Normaliza y valida un estado de La Vieja (Tic-Tac-Toe).
 */
export function normalizeTicTacToeState(
  rawState: any,
  fallbackInitialState?: TicTacToeState,
  players?: TablePlayer[]
): StateValidationResult<TicTacToeState> {
  const missingProps: string[] = [];

  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  // Comprobar campos obligatorios
  if (!Array.isArray(raw.board) || raw.board.length !== 9) missingProps.push('board');
  if (!raw.playerSymbols || typeof raw.playerSymbols !== 'object') missingProps.push('playerSymbols');
  if (!raw.playerNames || typeof raw.playerNames !== 'object') missingProps.push('playerNames');
  if (!raw.scores || typeof raw.scores !== 'object') missingProps.push('scores');

  // Construir playerSymbols y playerNames garantizados
  const guaranteedPlayerSymbols: Record<string, TicTacToeSymbol> = {
    ...(fallbackInitialState?.playerSymbols || {}),
    ...(raw.playerSymbols || {}),
  };
  const guaranteedPlayerNames: Record<string, string> = {
    ...(fallbackInitialState?.playerNames || {}),
    ...(raw.playerNames || {}),
  };
  const guaranteedScores: Record<string, number> = {
    ...(fallbackInitialState?.scores || {}),
    ...(raw.scores || {}),
  };
  const guaranteedLives: Record<string, number> = {
    ...(fallbackInitialState?.lives || {}),
    ...(raw.lives || {}),
  };

  if (players && players.length > 0) {
    players.forEach((p, idx) => {
      const uId = p.userId;
      if (!guaranteedPlayerSymbols[uId]) {
        guaranteedPlayerSymbols[uId] = idx === 0 ? 'X' : 'O';
      }
      if (!guaranteedPlayerNames[uId]) {
        guaranteedPlayerNames[uId] = p.displayName || `Jugador ${idx + 1}`;
      }
      if (guaranteedScores[uId] === undefined) {
        guaranteedScores[uId] = 0;
      }
      if (guaranteedLives[uId] === undefined) {
        guaranteedLives[uId] = 3;
      }
    });
  }

  // Si aún no hay símbolos configurados, asignar al menos uno para el primer turno
  const firstPlayerId = Object.keys(guaranteedPlayerSymbols)[0] || players?.[0]?.userId || raw.turnUserId || 'p1';
  if (!guaranteedPlayerSymbols[firstPlayerId]) {
    guaranteedPlayerSymbols[firstPlayerId] = 'X';
  }
  if (!guaranteedPlayerNames[firstPlayerId]) {
    guaranteedPlayerNames[firstPlayerId] = 'Jugador 1';
  }
  if (guaranteedScores[firstPlayerId] === undefined) {
    guaranteedScores[firstPlayerId] = 0;
  }
  if (guaranteedLives[firstPlayerId] === undefined) {
    guaranteedLives[firstPlayerId] = 3;
  }

  const normalizedBoard = Array.isArray(raw.board) && raw.board.length === 9
    ? [...raw.board]
    : (Array.isArray(fallbackInitialState?.board) && fallbackInitialState.board.length === 9
        ? [...fallbackInitialState.board]
        : Array(9).fill(null));

  const normalizedState: TicTacToeState = {
    board: normalizedBoard,
    turnUserId: raw.turnUserId || raw.currentTurnUserId || fallbackInitialState?.turnUserId || firstPlayerId,
    playerSymbols: guaranteedPlayerSymbols,
    playerNames: guaranteedPlayerNames,
    lives: guaranteedLives,
    round: typeof raw.round === 'number' ? raw.round : (fallbackInitialState?.round || 1),
    targetWins: typeof raw.targetWins === 'number' ? raw.targetWins : (fallbackInitialState?.targetWins || 3),
    scores: guaranteedScores,
    status: raw.status || fallbackInitialState?.status || 'playing',
    winningLine: Array.isArray(raw.winningLine) ? raw.winningLine : (fallbackInitialState?.winningLine || null),
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    roundWinnerUserId: raw.roundWinnerUserId ?? fallbackInitialState?.roundWinnerUserId ?? null,
    moveHistory: Array.isArray(raw.moveHistory) ? raw.moveHistory : (fallbackInitialState?.moveHistory || []),
  };

  (normalizedState as any).currentTurnUserId = normalizedState.turnUserId;

  const isStructurallyValid = Boolean(
    normalizedState &&
    Array.isArray(normalizedState.board) &&
    normalizedState.board.length === 9 &&
    typeof normalizedState.playerSymbols === 'object' &&
    normalizedState.turnUserId
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Normaliza y valida un estado de Piedra, Papel o Tijera.
 */
export function normalizeRPSState(
  rawState: any,
  fallbackInitialState?: RPSState,
  players?: TablePlayer[]
): StateValidationResult<RPSState> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  if (!raw.playerChoices || typeof raw.playerChoices !== 'object') missingProps.push('playerChoices');
  if (!raw.playerNames || typeof raw.playerNames !== 'object') missingProps.push('playerNames');
  if (!raw.scores || typeof raw.scores !== 'object') missingProps.push('scores');

  const guaranteedPlayerNames: Record<string, string> = {
    ...(fallbackInitialState?.playerNames || {}),
    ...(raw.playerNames || {}),
  };
  const guaranteedScores: Record<string, number> = {
    ...(fallbackInitialState?.scores || {}),
    ...(raw.scores || {}),
  };
  const guaranteedLives: Record<string, number> = {
    ...(fallbackInitialState?.lives || {}),
    ...(raw.lives || {}),
  };
  const guaranteedChoices: Record<string, any> = {
    ...(fallbackInitialState?.playerChoices || {}),
    ...(raw.playerChoices || {}),
  };

  if (players && players.length > 0) {
    players.forEach((p, idx) => {
      const uId = p.userId;
      if (!guaranteedPlayerNames[uId]) {
        guaranteedPlayerNames[uId] = p.displayName || `Jugador ${idx + 1}`;
      }
      if (guaranteedScores[uId] === undefined) {
        guaranteedScores[uId] = 0;
      }
      if (guaranteedLives[uId] === undefined) {
        guaranteedLives[uId] = 3;
      }
      if (!guaranteedChoices[uId]) {
        guaranteedChoices[uId] = { committed: false };
      }
    });
  }

  const normalizedState: RPSState = {
    round: typeof raw.round === 'number' ? raw.round : (fallbackInitialState?.round || 1),
    targetWins: typeof raw.targetWins === 'number' ? raw.targetWins : (fallbackInitialState?.targetWins || 3),
    scores: guaranteedScores,
    playerNames: guaranteedPlayerNames,
    lives: guaranteedLives,
    playerChoices: guaranteedChoices,
    phase: raw.phase || fallbackInitialState?.phase || 'selecting',
    status: raw.status || fallbackInitialState?.status || 'playing',
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    roundWinnerUserId: raw.roundWinnerUserId ?? fallbackInitialState?.roundWinnerUserId ?? null,
    history: Array.isArray(raw.history) ? raw.history : (fallbackInitialState?.history || []),
  };

  const isStructurallyValid = Boolean(
    normalizedState &&
    typeof normalizedState.playerChoices === 'object' &&
    typeof normalizedState.scores === 'object' &&
    typeof normalizedState.playerNames === 'object'
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Normaliza y valida un estado de Damas (Checkers).
 */
export function normalizeCheckersState(
  rawState: any,
  fallbackInitialState?: CheckersState,
  players?: TablePlayer[]
): StateValidationResult<CheckersState> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  if (!Array.isArray(raw.board)) missingProps.push('board');
  if (!Array.isArray(raw.players)) missingProps.push('players');
  if (!raw.turnUserId && !raw.currentTurnUserId) missingProps.push('turnUserId');

  const normalizedPlayers = Array.isArray(raw.players) && raw.players.length > 0
    ? raw.players
    : (fallbackInitialState?.players || (players || []).map((p, idx) => ({
        userId: p.userId,
        playerNumber: (idx + 1) as 1 | 2,
        name: p.displayName || `Jugador ${idx + 1}`,
      })));

  const turnUser = raw.turnUserId || raw.currentTurnUserId || fallbackInitialState?.turnUserId || (fallbackInitialState as any)?.currentTurnUserId || normalizedPlayers[0]?.userId || '';

  const defaultBoard = Array(8).fill(null).map(() => Array(8).fill(null));

  const normalizedState: CheckersState = {
    board: Array.isArray(raw.board) && raw.board.length === 8 ? raw.board : (Array.isArray(fallbackInitialState?.board) && fallbackInitialState.board.length === 8 ? fallbackInitialState.board : defaultBoard),
    turnUserId: turnUser,
    players: normalizedPlayers,
    capturedCount: raw.capturedCount || fallbackInitialState?.capturedCount || {},
    lives: raw.lives || fallbackInitialState?.lives || {},
    status: raw.status || fallbackInitialState?.status || 'playing',
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    lastMove: raw.lastMove ?? fallbackInitialState?.lastMove ?? null,
    validMovesForCurrentPlayer: Array.isArray(raw.validMovesForCurrentPlayer) ? raw.validMovesForCurrentPlayer : undefined,
  };

  (normalizedState as any).currentTurnUserId = turnUser;

  const isStructurallyValid = Boolean(
    normalizedState &&
    Array.isArray(normalizedState.board) &&
    normalizedState.board.length === 8 &&
    Array.isArray(normalizedState.players) &&
    normalizedState.turnUserId
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

export interface DominoDeckAudit {
  isValid: boolean;
  tileCount: number;
  invalidTiles: Array<{ userId: string; index: number; tile: any; reason: string }>;
  duplicateTiles: string[];
  emptyHandsUsers: string[];
  errors: string[];
}

/**
 * Inspecciona rigurosamente la baraja y manos de Dominó Venezolano.
 * Detecta fichas -1, null, undefined, valores fuera de rango [0-6], fichas duplicadas y manos vacías.
 */
export function inspectDominoDeck(state: DominoState, requiredPlayers?: TablePlayer[]): DominoDeckAudit {
  const invalidTiles: Array<{ userId: string; index: number; tile: any; reason: string }> = [];
  const seenTiles = new Map<string, string>();
  const duplicateTiles: string[] = [];
  const emptyHandsUsers: string[] = [];
  const errors: string[] = [];
  let tileCount = 0;

  const hands = state?.hands || {};

  // Verificar jugadores requeridos
  if (requiredPlayers && requiredPlayers.length > 0) {
    for (const p of requiredPlayers) {
      const uId = p.userId;
      const hand = hands[uId];
      if (!Array.isArray(hand) || (hand.length === 0 && (!state.board || state.board.length === 0))) {
        emptyHandsUsers.push(uId);
      }
    }
  }

  for (const [uId, hand] of Object.entries(hands)) {
    if (!Array.isArray(hand)) {
      errors.push(`Mano de jugador ${uId} no es un arreglo`);
      continue;
    }
    hand.forEach((t, idx) => {
      tileCount++;
      if (!t || !Array.isArray(t) || t.length !== 2) {
        invalidTiles.push({ userId: uId, index: idx, tile: t, reason: 'Formato de ficha inválido (no es [a,b])' });
        return;
      }
      const [a, b] = t;
      if (
        typeof a !== 'number' ||
        typeof b !== 'number' ||
        !Number.isInteger(a) ||
        !Number.isInteger(b) ||
        a < 0 ||
        a > 6 ||
        b < 0 ||
        b > 6 ||
        a === -1 ||
        b === -1
      ) {
        invalidTiles.push({ userId: uId, index: idx, tile: t, reason: `Valores fuera de rango [0-6] o -1 detectado: [${a},${b}]` });
        return;
      }

      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seenTiles.has(key)) {
        duplicateTiles.push(key);
      } else {
        seenTiles.set(key, uId);
      }
    });
  }

  // Verificar fichas en el tablero
  if (Array.isArray(state?.board)) {
    state.board.forEach((pt, idx) => {
      tileCount++;
      const t = pt?.tile;
      if (!t || !Array.isArray(t) || t.length !== 2) {
        invalidTiles.push({ userId: 'board', index: idx, tile: t, reason: 'Ficha en tablero inválida' });
        return;
      }
      const [a, b] = t;
      if (
        typeof a !== 'number' ||
        typeof b !== 'number' ||
        !Number.isInteger(a) ||
        !Number.isInteger(b) ||
        a < 0 ||
        a > 6 ||
        b < 0 ||
        b > 6 ||
        a === -1 ||
        b === -1
      ) {
        invalidTiles.push({ userId: 'board', index: idx, tile: t, reason: `Ficha en tablero con valores inválidos: [${a},${b}]` });
        return;
      }
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      if (seenTiles.has(key)) {
        duplicateTiles.push(key);
      } else {
        seenTiles.set(key, 'board');
      }
    });
  }

  if (invalidTiles.length > 0) errors.push(`${invalidTiles.length} fichas con valores inválidos o -1`);
  if (duplicateTiles.length > 0) errors.push(`Fichas duplicadas detectadas: ${duplicateTiles.join(', ')}`);
  if (emptyHandsUsers.length > 0) errors.push(`Jugadores sin fichas asignadas: ${emptyHandsUsers.join(', ')}`);

  return {
    isValid: errors.length === 0,
    tileCount,
    invalidTiles,
    duplicateTiles,
    emptyHandsUsers,
    errors,
  };
}

/**
 * Normaliza y valida un estado de Dominó Venezolano.
 */
export function normalizeDominoState(
  rawState: any,
  fallbackInitialState?: DominoState,
  players?: TablePlayer[]
): StateValidationResult<DominoState> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  if (!raw.hands || typeof raw.hands !== 'object') missingProps.push('hands');
  if (!Array.isArray(raw.board)) missingProps.push('board');
  if (!raw.playerNames || typeof raw.playerNames !== 'object') missingProps.push('playerNames');

  // Evaluar si las manos de rawState contienen fichas -1 o inválidas
  let rawHandsValid = true;
  if (raw.hands && typeof raw.hands === 'object') {
    for (const hand of Object.values(raw.hands)) {
      if (Array.isArray(hand)) {
        for (const t of hand) {
          if (!Array.isArray(t) || t[0] === -1 || t[1] === -1 || t[0] < 0 || t[0] > 6 || t[1] < 0 || t[1] > 6) {
            rawHandsValid = false;
            break;
          }
        }
      }
      if (!rawHandsValid) break;
    }
  } else {
    rawHandsValid = false;
  }

  // Si las manos en rawState están corruptas con -1 pero fallbackInitialState tiene fichas válidas, recuperarlas
  const guaranteedHands: Record<string, any> = rawHandsValid
    ? { ...(fallbackInitialState?.hands || {}), ...(raw.hands || {}) }
    : { ...(fallbackInitialState?.hands || {}) };

  const guaranteedNames: Record<string, string> = {
    ...(fallbackInitialState?.playerNames || {}),
    ...(raw.playerNames || {}),
  };
  const guaranteedScores: Record<string, number> = {
    ...(fallbackInitialState?.cumulativeScores || {}),
    ...(raw.cumulativeScores || {}),
  };

  if (players && players.length > 0) {
    players.forEach((p, idx) => {
      const uId = p.userId;
      if (!guaranteedNames[uId]) {
        guaranteedNames[uId] = p.displayName || `Jugador ${idx + 1}`;
      }
      if (!guaranteedHands[uId]) {
        guaranteedHands[uId] = fallbackInitialState?.hands?.[uId] || [];
      }
      if (guaranteedScores[uId] === undefined) {
        guaranteedScores[uId] = 0;
      }
    });
  }

  const turnUser = raw.turnUserId || raw.currentTurnUserId || fallbackInitialState?.turnUserId || (fallbackInitialState as any)?.currentTurnUserId || Object.keys(guaranteedNames)[0] || '';

  const normalizedState: DominoState = {
    hands: guaranteedHands,
    board: Array.isArray(raw.board) ? raw.board : (fallbackInitialState?.board || []),
    leftEnd: raw.leftEnd !== undefined ? raw.leftEnd : (fallbackInitialState?.leftEnd ?? null),
    rightEnd: raw.rightEnd !== undefined ? raw.rightEnd : (fallbackInitialState?.rightEnd ?? null),
    turnUserId: turnUser,
    playerOrder: Array.isArray(raw.playerOrder) ? raw.playerOrder : (fallbackInitialState?.playerOrder || Object.keys(guaranteedNames)),
    playerNames: guaranteedNames,
    lives: raw.lives || fallbackInitialState?.lives,
    targetScore: typeof raw.targetScore === 'number' ? raw.targetScore : (fallbackInitialState?.targetScore || 100),
    cumulativeScores: guaranteedScores,
    round: typeof raw.round === 'number' ? raw.round : (fallbackInitialState?.round || 1),
    passesInRow: typeof raw.passesInRow === 'number' ? raw.passesInRow : 0,
    status: raw.status || fallbackInitialState?.status || 'playing',
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    roundWinnerUserId: raw.roundWinnerUserId ?? fallbackInitialState?.roundWinnerUserId ?? null,
    isTranca: Boolean(raw.isTranca),
  };

  (normalizedState as any).currentTurnUserId = turnUser;

  // Auditoría exhaustiva de la baraja y manos
  const deckAudit = inspectDominoDeck(normalizedState, players);
  if (!deckAudit.isValid) {
    missingProps.push('DOMINO_INVALID_DECK');
  }

  const isStructurallyValid = Boolean(
    normalizedState &&
    typeof normalizedState.hands === 'object' &&
    Array.isArray(normalizedState.board) &&
    normalizedState.turnUserId &&
    deckAudit.isValid
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Normaliza y valida un estado de Truco Venezolano.
 */
export function normalizeTrucoState(
  rawState: any,
  fallbackInitialState?: TrucoState,
  players?: TablePlayer[]
): StateValidationResult<TrucoState> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  if (!raw.hands || typeof raw.hands !== 'object') missingProps.push('hands');
  if (!raw.playerNames || typeof raw.playerNames !== 'object') missingProps.push('playerNames');
  if (!raw.points || typeof raw.points !== 'object') missingProps.push('points');

  const guaranteedHands: Record<string, any> = {
    ...(fallbackInitialState?.hands || {}),
    ...(raw.hands || {}),
  };
  const guaranteedNames: Record<string, string> = {
    ...(fallbackInitialState?.playerNames || {}),
    ...(raw.playerNames || {}),
  };
  const guaranteedPoints: Record<string, number> = {
    ...(fallbackInitialState?.points || {}),
    ...(raw.points || {}),
  };

  if (players && players.length > 0) {
    players.forEach((p, idx) => {
      const uId = p.userId;
      if (!guaranteedNames[uId]) {
        guaranteedNames[uId] = p.displayName || `Jugador ${idx + 1}`;
      }
      if (!guaranteedHands[uId]) {
        guaranteedHands[uId] = [];
      }
      if (guaranteedPoints[uId] === undefined) {
        guaranteedPoints[uId] = 0;
      }
    });
  }

  const turnUser = raw.turnUserId || raw.currentTurnUserId || fallbackInitialState?.turnUserId || (fallbackInitialState as any)?.currentTurnUserId || Object.keys(guaranteedNames)[0] || '';

  const normalizedState: TrucoState = {
    vira: raw.vira || fallbackInitialState?.vira || { id: 'default_vira', number: 1, suit: 'espadas' },
    hands: guaranteedHands,
    playedTricks: Array.isArray(raw.playedTricks) ? raw.playedTricks : (fallbackInitialState?.playedTricks || []),
    trickWinners: Array.isArray(raw.trickWinners) ? raw.trickWinners : (fallbackInitialState?.trickWinners || []),
    turnUserId: turnUser,
    playerOrder: Array.isArray(raw.playerOrder) ? raw.playerOrder : (fallbackInitialState?.playerOrder || Object.keys(guaranteedNames)),
    playerNames: guaranteedNames,
    points: guaranteedPoints,
    targetPoints: typeof raw.targetPoints === 'number' ? raw.targetPoints : (fallbackInitialState?.targetPoints || 24),
    cantoState: raw.cantoState || fallbackInitialState?.cantoState || {
      envidoPoints: 2,
      envidoAccepted: null,
      trucoPoints: 1,
      trucoAccepted: null,
      florCalledBy: [],
    },
    status: raw.status || fallbackInitialState?.status || 'playing',
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
  };

  (normalizedState as any).currentTurnUserId = turnUser;

  const isStructurallyValid = Boolean(
    normalizedState &&
    typeof normalizedState.hands === 'object' &&
    normalizedState.vira &&
    normalizedState.turnUserId
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Normaliza y valida un estado de Bingo.
 */
export function normalizeBingoState(
  rawState: any,
  fallbackInitialState?: BingoState,
  players?: TablePlayer[]
): StateValidationResult<BingoState> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  if (!raw.cards || typeof raw.cards !== 'object') missingProps.push('cards');
  if (!Array.isArray(raw.drawnBalls)) missingProps.push('drawnBalls');

  const guaranteedCards: Record<string, any> = {
    ...(fallbackInitialState?.cards || {}),
    ...(raw.cards || {}),
  };
  const guaranteedNames: Record<string, string> = {
    ...(fallbackInitialState?.playerNames || {}),
    ...(raw.playerNames || {}),
  };

  if (players && players.length > 0) {
    players.forEach((p, idx) => {
      const uId = p.userId;
      if (!guaranteedNames[uId]) {
        guaranteedNames[uId] = p.displayName || `Jugador ${idx + 1}`;
      }
      if (!guaranteedCards[uId]) {
        guaranteedCards[uId] = [];
      }
    });
  }

  const normalizedState: BingoState = {
    variant: raw.variant || fallbackInitialState?.variant || '75',
    drawnBalls: Array.isArray(raw.drawnBalls) ? raw.drawnBalls : (fallbackInitialState?.drawnBalls || []),
    currentBall: raw.currentBall ?? fallbackInitialState?.currentBall ?? null,
    cards: guaranteedCards,
    cards80: raw.cards80 || fallbackInitialState?.cards80,
    cards90: raw.cards90 || fallbackInitialState?.cards90,
    cardsPurchased: raw.cardsPurchased || fallbackInitialState?.cardsPurchased || {},
    playerNames: guaranteedNames,
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    status: raw.status || fallbackInitialState?.status || 'in_progress',
    callIntervalMs: typeof raw.callIntervalMs === 'number' ? raw.callIntervalMs : (fallbackInitialState?.callIntervalMs || 4000),
    totalBalls: typeof raw.totalBalls === 'number' ? raw.totalBalls : (fallbackInitialState?.totalBalls || 75),
    totalPoolBs: typeof raw.totalPoolBs === 'number' ? raw.totalPoolBs : (fallbackInitialState?.totalPoolBs || 0),
    winnerPoolBs: typeof raw.winnerPoolBs === 'number' ? raw.winnerPoolBs : (fallbackInitialState?.winnerPoolBs || 0),
    systemFeeBs: typeof raw.systemFeeBs === 'number' ? raw.systemFeeBs : (fallbackInitialState?.systemFeeBs || 0),
  };

  const isStructurallyValid = Boolean(
    normalizedState &&
    typeof normalizedState.cards === 'object' &&
    Array.isArray(normalizedState.drawnBalls)
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Normaliza y valida un estado de Ajedrez (Chess).
 */
export function normalizeChessState(
  rawState: any,
  fallbackInitialState?: ChessState,
  players?: TablePlayer[]
): StateValidationResult<ChessState> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  const defaultFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  if (!raw.fen || typeof raw.fen !== 'string') missingProps.push('fen');

  const pWhite = raw.playerWhiteUserId || fallbackInitialState?.playerWhiteUserId || players?.[0]?.userId || '';
  const pBlack = raw.playerBlackUserId || fallbackInitialState?.playerBlackUserId || players?.[1]?.userId || '';
  const turnUser = raw.currentTurnUserId || raw.turnUserId || fallbackInitialState?.currentTurnUserId || (fallbackInitialState as any)?.turnUserId || pWhite;

  const normalizedState: ChessState = {
    fen: raw.fen && typeof raw.fen === 'string' ? raw.fen : (fallbackInitialState?.fen || defaultFen),
    playerWhiteUserId: pWhite,
    playerBlackUserId: pBlack,
    currentTurnUserId: turnUser,
    turnExpiresAt: raw.turnExpiresAt || fallbackInitialState?.turnExpiresAt,
    turnDurationSeconds: raw.turnDurationSeconds || fallbackInitialState?.turnDurationSeconds || 15,
    playerNames: raw.playerNames || fallbackInitialState?.playerNames || {},
    moveHistory: Array.isArray(raw.moveHistory) ? raw.moveHistory : (fallbackInitialState?.moveHistory || []),
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    isDraw: Boolean(raw.isDraw),
    drawReason: raw.drawReason || fallbackInitialState?.drawReason,
  };

  (normalizedState as any).turnUserId = turnUser;

  const isStructurallyValid = Boolean(
    normalizedState &&
    typeof normalizedState.fen === 'string' &&
    normalizedState.currentTurnUserId
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Normaliza y valida un estado de Polla Venezolana.
 */
export function normalizePollaState(
  rawState: any,
  fallbackInitialState?: PollaState,
  players?: TablePlayer[]
): StateValidationResult<PollaState> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  if (!Array.isArray(raw.fixtures)) missingProps.push('fixtures');
  if (!raw.predictions || typeof raw.predictions !== 'object') missingProps.push('predictions');
  if (!raw.playerNames || typeof raw.playerNames !== 'object') missingProps.push('playerNames');

  const guaranteedNames: Record<string, string> = {
    ...(fallbackInitialState?.playerNames || {}),
    ...(raw.playerNames || {}),
  };
  const guaranteedPredictions: Record<string, any> = {
    ...(fallbackInitialState?.predictions || {}),
    ...(raw.predictions || {}),
  };

  if (players && players.length > 0) {
    players.forEach((p, idx) => {
      const uId = p.userId;
      if (!guaranteedNames[uId]) {
        guaranteedNames[uId] = p.displayName || `Jugador ${idx + 1}`;
      }
      if (!guaranteedPredictions[uId]) {
        guaranteedPredictions[uId] = [];
      }
    });
  }

  const normalizedState: PollaState = {
    fixtures: Array.isArray(raw.fixtures) ? raw.fixtures : (fallbackInitialState?.fixtures || []),
    predictions: guaranteedPredictions,
    playerNames: guaranteedNames,
    leaderboard: Array.isArray(raw.leaderboard) ? raw.leaderboard : (fallbackInitialState?.leaderboard || []),
    status: raw.status || fallbackInitialState?.status || 'open_picks',
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    activeBlock: raw.activeBlock || fallbackInitialState?.activeBlock,
    selectedDate: raw.selectedDate || fallbackInitialState?.selectedDate,
    myTickets: Array.isArray(raw.myTickets) ? raw.myTickets : fallbackInitialState?.myTickets,
    blockWinners: Array.isArray(raw.blockWinners) ? raw.blockWinners : fallbackInitialState?.blockWinners,
  };

  const isStructurallyValid = Boolean(
    normalizedState &&
    Array.isArray(normalizedState.fixtures) &&
    typeof normalizedState.predictions === 'object'
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Normaliza y valida un estado de Atrapaíto (Parchís / Ludo Criollo).
 */
export function normalizeAtrapaitoState(
  rawState: any,
  fallbackInitialState?: AtrapaitoState,
  players?: TablePlayer[]
): StateValidationResult<any> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  // DETECCIÓN Y NORMALIZACIÓN DE ATRAPAÍTO CRIOLLO (Canicas y Muros)
  const isCriollo = Boolean(
    raw.bluePos !== undefined ||
    raw.walls !== undefined ||
    raw.blueWalls !== undefined ||
    raw.turn === 'BLUE' ||
    raw.turn === 'RED' ||
    (fallbackInitialState as any)?.bluePos !== undefined
  );

  if (isCriollo) {
    const blueUser = raw.blueUserId || (fallbackInitialState as any)?.blueUserId || players?.[0]?.userId || null;
    const redUser = raw.redUserId || (fallbackInitialState as any)?.redUserId || players?.[1]?.userId || null;
    const turn = raw.turn || (fallbackInitialState as any)?.turn || 'BLUE';
    const currentTurnUser = raw.currentTurnUserId || raw.turnUserId || (turn === 'RED' ? redUser : blueUser);

    const criolloState = {
      bluePos: raw.bluePos || (fallbackInitialState as any)?.bluePos || { col: 4, row: 14 },
      redPos: raw.redPos || (fallbackInitialState as any)?.redPos || { col: 3, row: 14 },
      walls: Array.isArray(raw.walls) ? raw.walls : ((fallbackInitialState as any)?.walls || []),
      blueWalls: typeof raw.blueWalls === 'number' ? raw.blueWalls : ((fallbackInitialState as any)?.blueWalls ?? 10),
      redWalls: typeof raw.redWalls === 'number' ? raw.redWalls : ((fallbackInitialState as any)?.redWalls ?? 10),
      turn,
      action: raw.action || (fallbackInitialState as any)?.action || 'MOVE',
      wallOrientation: raw.wallOrientation || (fallbackInitialState as any)?.wallOrientation || 'HORIZONTAL',
      pendingWall: raw.pendingWall ?? (fallbackInitialState as any)?.pendingWall ?? null,
      winner: raw.winner ?? (fallbackInitialState as any)?.winner ?? null,
      mode: raw.mode || (fallbackInitialState as any)?.mode || 'ONLINE',
      isAiThinking: Boolean(raw.isAiThinking),
      consecutiveDraws: raw.consecutiveDraws || 0,
      blueUserId: blueUser,
      redUserId: redUser,
      currentTurnUserId: currentTurnUser,
      turnUserId: currentTurnUser,
      turnDurationSeconds: raw.turnDurationSeconds || 15,
      boardType: 'CRIOLLO_WALLS',
    };

    return {
      state: criolloState,
      isValid: Boolean(criolloState.bluePos && criolloState.redPos),
      missingProps: [],
    };
  }

  if (!raw.pieces || typeof raw.pieces !== 'object') missingProps.push('pieces');
  if (!raw.players || typeof raw.players !== 'object') missingProps.push('players');

  const guaranteedPlayers: Record<string, any> = {
    ...(fallbackInitialState?.players || {}),
    ...(raw.players || {}),
  };
  const guaranteedPieces: Record<string, any> = {
    ...(fallbackInitialState?.pieces || {}),
    ...(raw.pieces || {}),
  };
  const guaranteedNames: Record<string, string> = {
    ...(fallbackInitialState?.playerNames || {}),
    ...(raw.playerNames || {}),
  };
  const guaranteedLives: Record<string, number> = {
    ...(fallbackInitialState?.lives || {}),
    ...(raw.lives || {}),
  };

  if (players && players.length > 0) {
    players.forEach((p, idx) => {
      const uId = p.userId;
      if (!guaranteedNames[uId]) {
        guaranteedNames[uId] = p.displayName || `Jugador ${idx + 1}`;
      }
      if (guaranteedLives[uId] === undefined) {
        guaranteedLives[uId] = 3;
      }
    });
  }

  const firstUserId = Object.keys(guaranteedPlayers)[0] || players?.[0]?.userId || '';
  const turnUser = raw.currentTurnUserId || raw.turnUserId || fallbackInitialState?.currentTurnUserId || fallbackInitialState?.turnUserId || firstUserId;

  const normalizedState: AtrapaitoState = {
    mode: raw.mode || fallbackInitialState?.mode || 'INDIVIDUAL_4',
    boardType: raw.boardType || fallbackInitialState?.boardType || '4_COLORS',
    pieces: guaranteedPieces,
    players: guaranteedPlayers,
    playerOrder: Array.isArray(raw.playerOrder) ? raw.playerOrder : (fallbackInitialState?.playerOrder || Object.keys(guaranteedPlayers)),
    currentTurnUserId: turnUser,
    activeColor: raw.activeColor || fallbackInitialState?.activeColor || 'yellow',
    turnPhase: raw.turnPhase || fallbackInitialState?.turnPhase || 'ROLL_DICE',
    diceValue: raw.diceValue !== undefined ? raw.diceValue : (fallbackInitialState?.diceValue ?? null),
    consecutiveSixes: typeof raw.consecutiveSixes === 'number' ? raw.consecutiveSixes : (fallbackInitialState?.consecutiveSixes || 0),
    lastMovedPieceId: raw.lastMovedPieceId ?? fallbackInitialState?.lastMovedPieceId ?? null,
    pendingBonus: raw.pendingBonus || fallbackInitialState?.pendingBonus || null,
    legalMoves: Array.isArray(raw.legalMoves) ? raw.legalMoves : (fallbackInitialState?.legalMoves || []),
    status: raw.status || fallbackInitialState?.status || 'playing',
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    winnerTeam: raw.winnerTeam || fallbackInitialState?.winnerTeam || null,
    lastActionDescription: raw.lastActionDescription || fallbackInitialState?.lastActionDescription || null,
    lives: guaranteedLives,
    playerNames: guaranteedNames,
    turnUserId: turnUser,
    turnStartedAt: typeof raw.turnStartedAt === 'number' ? raw.turnStartedAt : (fallbackInitialState?.turnStartedAt || Date.now()),
    turnDeadlineAt: typeof raw.turnDeadlineAt === 'number' ? raw.turnDeadlineAt : (fallbackInitialState?.turnDeadlineAt || Date.now() + 15000),
  };

  const isStructurallyValid = Boolean(
    normalizedState &&
    typeof normalizedState.pieces === 'object' &&
    typeof normalizedState.players === 'object' &&
    normalizedState.currentTurnUserId
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Normaliza y valida un estado de UNA-OLLA.
 */
export function normalizeUnaOllaState(
  rawState: any,
  fallbackInitialState?: UnaOllaState,
  players?: TablePlayer[]
): StateValidationResult<UnaOllaState> {
  const missingProps: string[] = [];
  const raw = rawState && typeof rawState === 'object' ? rawState : {};

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
  }

  if (!raw.players || typeof raw.players !== 'object') missingProps.push('players');
  if (!raw.topCard) missingProps.push('topCard');

  const guaranteedPlayers: Record<string, any> = {
    ...(fallbackInitialState?.players || {}),
    ...(raw.players || {}),
  };
  const guaranteedLives: Record<string, number> = {
    ...(fallbackInitialState?.lives || {}),
    ...(raw.lives || {}),
  };

  if (players && players.length > 0) {
    players.forEach((p) => {
      const uId = p.userId;
      if (guaranteedLives[uId] === undefined) {
        guaranteedLives[uId] = 3;
      }
    });
  }

  const defaultTopCard = { id: 'top_default', color: 'red' as const, type: 'number' as const, number: 7 };
  const turnUser = raw.currentTurnUserId || raw.turnUserId || fallbackInitialState?.currentTurnUserId || (fallbackInitialState as any)?.turnUserId || Object.keys(guaranteedPlayers)[0] || '';

  const normalizedState: UnaOllaState = {
    players: guaranteedPlayers,
    playerOrder: Array.isArray(raw.playerOrder) ? raw.playerOrder : (fallbackInitialState?.playerOrder || Object.keys(guaranteedPlayers)),
    currentTurnUserId: turnUser,
    direction: raw.direction === -1 ? -1 : 1,
    topCard: raw.topCard || fallbackInitialState?.topCard || defaultTopCard,
    currentColor: raw.currentColor || fallbackInitialState?.currentColor || 'red',
    drawPileCount: typeof raw.drawPileCount === 'number' ? raw.drawPileCount : (fallbackInitialState?.drawPileCount || 60),
    discardPile: Array.isArray(raw.discardPile) ? raw.discardPile : (fallbackInitialState?.discardPile || []),
    turnStartedAt: typeof raw.turnStartedAt === 'number' ? raw.turnStartedAt : (fallbackInitialState?.turnStartedAt || Date.now()),
    turnDeadlineAt: typeof raw.turnDeadlineAt === 'number' ? raw.turnDeadlineAt : (fallbackInitialState?.turnDeadlineAt || Date.now() + 15000),
    lives: guaranteedLives,
    inactivityStaircase: raw.inactivityStaircase || fallbackInitialState?.inactivityStaircase || {},
    unaOllaCalls: raw.unaOllaCalls || fallbackInitialState?.unaOllaCalls || {},
    status: raw.status || fallbackInitialState?.status || 'PLAYING',
    winnerUserId: raw.winnerUserId ?? fallbackInitialState?.winnerUserId ?? null,
    roundWinnerUserId: raw.roundWinnerUserId ?? fallbackInitialState?.roundWinnerUserId ?? null,
    lastActionLog: raw.lastActionLog || fallbackInitialState?.lastActionLog || null,
    activeEffects: raw.activeEffects || fallbackInitialState?.activeEffects,
  };

  (normalizedState as any).turnUserId = turnUser;

  const isStructurallyValid = Boolean(
    normalizedState &&
    typeof normalizedState.players === 'object' &&
    normalizedState.topCard &&
    normalizedState.currentTurnUserId
  );

  return {
    state: normalizedState,
    isValid: isStructurallyValid && missingProps.length === 0,
    missingProps,
  };
}

/**
 * Función Maestra: Normaliza cualquier estado de juego garantizando integridad y tipado estricto.
 */
export function normalizeGameStateByType(
  gameType: GameType | string,
  rawState: any,
  fallbackInitialState?: any,
  players?: TablePlayer[]
): StateValidationResult {
  const cleanType = (gameType || '').toLowerCase().trim();

  switch (cleanType) {
    case 'tic_tac_toe':
    case 'la_vieja':
    case '3_en_raya':
    case 'tictactoe':
      return normalizeTicTacToeState(rawState, fallbackInitialState, players);
    case 'rock_paper_scissors':
    case 'piedra_papel_tijera':
    case 'rps':
      return normalizeRPSState(rawState, fallbackInitialState, players);
    case 'checkers':
    case 'damas':
    case 'damas_criollas':
      return normalizeCheckersState(rawState, fallbackInitialState, players);
    case 'domino_venezolano':
    case 'domino':
    case 'dominos':
      return normalizeDominoState(rawState, fallbackInitialState, players);
    case 'truco_venezolano':
    case 'truco':
      return normalizeTrucoState(rawState, fallbackInitialState, players);
    case 'bingo':
    case 'bingo_la_olla':
      return normalizeBingoState(rawState, fallbackInitialState, players);
    case 'polla_venezolana':
    case 'polla':
      return normalizePollaState(rawState, fallbackInitialState, players);
    case 'atrapaito':
    case 'parchis':
    case 'ludo':
      return normalizeAtrapaitoState(rawState, fallbackInitialState, players);
    case 'una_olla':
    case 'uno':
      return normalizeUnaOllaState(rawState, fallbackInitialState, players);
    case 'chess':
    case 'ajedrez':
      return normalizeChessState(rawState, fallbackInitialState, players);
    default:
      return {
        state: rawState || fallbackInitialState || {},
        isValid: Boolean(rawState),
        missingProps: rawState ? [] : ['state_empty'],
      };
  }
}

