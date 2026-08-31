// ==============================================================================
// RASPANDO LA OLLA — GUARDIA Y NORMALIZADOR DE ESTADOS DE JUEGO
// ==============================================================================
// Garantiza la integridad del esquema por tipo de juego, previene excepciones
// fatales por propiedades faltantes (playerSymbols, playerNames, hands, etc.)
// y asegura sanitización segura sin filtrar datos privados ni romper el renderizado.
// ==============================================================================

import type {
  GameType,
  TicTacToeState,
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

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
    return {
      state: fallbackInitialState || {
        board: Array(9).fill(null),
        turnUserId: players?.[0]?.userId || '',
        playerSymbols: {},
        playerNames: {},
        lives: {},
        round: 1,
        targetWins: 3,
        scores: {},
        status: 'playing',
        winningLine: null,
        winnerUserId: null,
        roundWinnerUserId: null,
        moveHistory: [],
      },
      isValid: false,
      missingProps,
    };
  }

  // Comprobar campos obligatorios
  if (!Array.isArray(rawState.board)) missingProps.push('board');
  if (!rawState.playerSymbols || typeof rawState.playerSymbols !== 'object') missingProps.push('playerSymbols');
  if (!rawState.playerNames || typeof rawState.playerNames !== 'object') missingProps.push('playerNames');
  if (!rawState.scores || typeof rawState.scores !== 'object') missingProps.push('scores');

  // Construir playerSymbols y playerNames garantizados
  const guaranteedPlayerSymbols: Record<string, 'X' | 'O'> = { ...(rawState.playerSymbols || {}) };
  const guaranteedPlayerNames: Record<string, string> = { ...(rawState.playerNames || {}) };
  const guaranteedScores: Record<string, number> = { ...(rawState.scores || {}) };
  const guaranteedLives: Record<string, number> = { ...(rawState.lives || {}) };

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

  const normalizedBoard = Array.isArray(rawState.board) && rawState.board.length === 9
    ? rawState.board
    : (fallbackInitialState?.board || Array(9).fill(null));

  const firstPlayerId = Object.keys(guaranteedPlayerSymbols)[0] || players?.[0]?.userId || '';

  const normalizedState: TicTacToeState = {
    board: normalizedBoard,
    turnUserId: rawState.turnUserId || fallbackInitialState?.turnUserId || firstPlayerId,
    playerSymbols: guaranteedPlayerSymbols,
    playerNames: guaranteedPlayerNames,
    lives: guaranteedLives,
    round: typeof rawState.round === 'number' ? rawState.round : (fallbackInitialState?.round || 1),
    targetWins: typeof rawState.targetWins === 'number' ? rawState.targetWins : (fallbackInitialState?.targetWins || 3),
    scores: guaranteedScores,
    status: rawState.status || fallbackInitialState?.status || 'playing',
    winningLine: Array.isArray(rawState.winningLine) ? rawState.winningLine : null,
    winnerUserId: rawState.winnerUserId ?? null,
    roundWinnerUserId: rawState.roundWinnerUserId ?? null,
    moveHistory: Array.isArray(rawState.moveHistory) ? rawState.moveHistory : [],
  };

  return {
    state: normalizedState,
    isValid: missingProps.length === 0,
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

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
    return {
      state: fallbackInitialState || {
        round: 1,
        targetWins: 3,
        scores: {},
        playerNames: {},
        lives: {},
        playerChoices: {},
        phase: 'selecting',
        status: 'playing',
        winnerUserId: null,
        roundWinnerUserId: null,
        history: [],
      },
      isValid: false,
      missingProps,
    };
  }

  if (!rawState.playerChoices || typeof rawState.playerChoices !== 'object') missingProps.push('playerChoices');
  if (!rawState.playerNames || typeof rawState.playerNames !== 'object') missingProps.push('playerNames');
  if (!rawState.scores || typeof rawState.scores !== 'object') missingProps.push('scores');

  const guaranteedPlayerNames: Record<string, string> = { ...(rawState.playerNames || {}) };
  const guaranteedScores: Record<string, number> = { ...(rawState.scores || {}) };
  const guaranteedLives: Record<string, number> = { ...(rawState.lives || {}) };
  const guaranteedChoices: Record<string, any> = { ...(rawState.playerChoices || {}) };

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
    round: typeof rawState.round === 'number' ? rawState.round : (fallbackInitialState?.round || 1),
    targetWins: typeof rawState.targetWins === 'number' ? rawState.targetWins : (fallbackInitialState?.targetWins || 3),
    scores: guaranteedScores,
    playerNames: guaranteedPlayerNames,
    lives: guaranteedLives,
    playerChoices: guaranteedChoices,
    phase: rawState.phase || fallbackInitialState?.phase || 'selecting',
    status: rawState.status || fallbackInitialState?.status || 'playing',
    winnerUserId: rawState.winnerUserId ?? null,
    roundWinnerUserId: rawState.roundWinnerUserId ?? null,
    history: Array.isArray(rawState.history) ? rawState.history : [],
  };

  return {
    state: normalizedState,
    isValid: missingProps.length === 0,
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

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
    return {
      state: fallbackInitialState || {
        board: [],
        turnUserId: players?.[0]?.userId || '',
        players: [],
        capturedCount: {},
        status: 'playing',
        winnerUserId: null,
        lastMove: null,
      },
      isValid: false,
      missingProps,
    };
  }

  if (!Array.isArray(rawState.board)) missingProps.push('board');
  if (!Array.isArray(rawState.players)) missingProps.push('players');
  if (!rawState.turnUserId) missingProps.push('turnUserId');

  const normalizedPlayers = Array.isArray(rawState.players) && rawState.players.length > 0
    ? rawState.players
    : (fallbackInitialState?.players || (players || []).map((p, idx) => ({
        userId: p.userId,
        playerNumber: (idx + 1) as 1 | 2,
        name: p.displayName || `Jugador ${idx + 1}`,
      })));

  const normalizedState: CheckersState = {
    board: Array.isArray(rawState.board) ? rawState.board : (fallbackInitialState?.board || []),
    turnUserId: rawState.turnUserId || fallbackInitialState?.turnUserId || normalizedPlayers[0]?.userId || '',
    players: normalizedPlayers,
    capturedCount: rawState.capturedCount || fallbackInitialState?.capturedCount || {},
    lives: rawState.lives || fallbackInitialState?.lives,
    status: rawState.status || fallbackInitialState?.status || 'playing',
    winnerUserId: rawState.winnerUserId ?? null,
    lastMove: rawState.lastMove ?? null,
    validMovesForCurrentPlayer: Array.isArray(rawState.validMovesForCurrentPlayer) ? rawState.validMovesForCurrentPlayer : undefined,
  };

  return {
    state: normalizedState,
    isValid: missingProps.length === 0,
    missingProps,
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

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
    return {
      state: fallbackInitialState || {
        hands: {},
        board: [],
        leftEnd: null,
        rightEnd: null,
        turnUserId: players?.[0]?.userId || '',
        playerOrder: [],
        playerNames: {},
        lives: {},
        targetScore: 100,
        cumulativeScores: {},
        round: 1,
        passesInRow: 0,
        status: 'playing',
        winnerUserId: null,
        roundWinnerUserId: null,
        isTranca: false,
      },
      isValid: false,
      missingProps,
    };
  }

  if (!rawState.hands || typeof rawState.hands !== 'object') missingProps.push('hands');
  if (!Array.isArray(rawState.board)) missingProps.push('board');
  if (!rawState.playerNames || typeof rawState.playerNames !== 'object') missingProps.push('playerNames');

  const guaranteedHands: Record<string, any> = { ...(rawState.hands || fallbackInitialState?.hands || {}) };
  const guaranteedNames: Record<string, string> = { ...(rawState.playerNames || fallbackInitialState?.playerNames || {}) };
  const guaranteedScores: Record<string, number> = { ...(rawState.cumulativeScores || fallbackInitialState?.cumulativeScores || {}) };

  if (players && players.length > 0) {
    players.forEach((p, idx) => {
      const uId = p.userId;
      if (!guaranteedNames[uId]) {
        guaranteedNames[uId] = p.displayName || `Jugador ${idx + 1}`;
      }
      if (!guaranteedHands[uId]) {
        guaranteedHands[uId] = [];
      }
      if (guaranteedScores[uId] === undefined) {
        guaranteedScores[uId] = 0;
      }
    });
  }

  const normalizedState: DominoState = {
    hands: guaranteedHands,
    board: Array.isArray(rawState.board) ? rawState.board : (fallbackInitialState?.board || []),
    leftEnd: rawState.leftEnd !== undefined ? rawState.leftEnd : (fallbackInitialState?.leftEnd ?? null),
    rightEnd: rawState.rightEnd !== undefined ? rawState.rightEnd : (fallbackInitialState?.rightEnd ?? null),
    turnUserId: rawState.turnUserId || fallbackInitialState?.turnUserId || Object.keys(guaranteedNames)[0] || '',
    playerOrder: Array.isArray(rawState.playerOrder) ? rawState.playerOrder : (fallbackInitialState?.playerOrder || Object.keys(guaranteedNames)),
    playerNames: guaranteedNames,
    lives: rawState.lives || fallbackInitialState?.lives,
    targetScore: typeof rawState.targetScore === 'number' ? rawState.targetScore : (fallbackInitialState?.targetScore || 100),
    cumulativeScores: guaranteedScores,
    round: typeof rawState.round === 'number' ? rawState.round : (fallbackInitialState?.round || 1),
    passesInRow: typeof rawState.passesInRow === 'number' ? rawState.passesInRow : 0,
    status: rawState.status || fallbackInitialState?.status || 'playing',
    winnerUserId: rawState.winnerUserId ?? null,
    roundWinnerUserId: rawState.roundWinnerUserId ?? null,
    isTranca: Boolean(rawState.isTranca),
  };

  return {
    state: normalizedState,
    isValid: missingProps.length === 0,
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

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
    return {
      state: fallbackInitialState || {
        vira: { id: 'default_vira', number: 1, suit: 'espadas' },
        hands: {},
        playedTricks: [],
        trickWinners: [],
        turnUserId: players?.[0]?.userId || '',
        playerOrder: [],
        playerNames: {},
        points: {},
        targetPoints: 24,
        cantoState: {
          envidoPoints: 2,
          envidoAccepted: null,
          trucoPoints: 1,
          trucoAccepted: null,
          florCalledBy: [],
        },
        status: 'playing',
        winnerUserId: null,
      },
      isValid: false,
      missingProps,
    };
  }

  if (!rawState.hands || typeof rawState.hands !== 'object') missingProps.push('hands');
  if (!rawState.playerNames || typeof rawState.playerNames !== 'object') missingProps.push('playerNames');
  if (!rawState.points || typeof rawState.points !== 'object') missingProps.push('points');

  const guaranteedHands: Record<string, any> = { ...(rawState.hands || fallbackInitialState?.hands || {}) };
  const guaranteedNames: Record<string, string> = { ...(rawState.playerNames || fallbackInitialState?.playerNames || {}) };
  const guaranteedPoints: Record<string, number> = { ...(rawState.points || fallbackInitialState?.points || {}) };

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

  const normalizedState: TrucoState = {
    vira: rawState.vira || fallbackInitialState?.vira || { id: 'default_vira', number: 1, suit: 'espadas' },
    hands: guaranteedHands,
    playedTricks: Array.isArray(rawState.playedTricks) ? rawState.playedTricks : [],
    trickWinners: Array.isArray(rawState.trickWinners) ? rawState.trickWinners : [],
    turnUserId: rawState.turnUserId || fallbackInitialState?.turnUserId || Object.keys(guaranteedNames)[0] || '',
    playerOrder: Array.isArray(rawState.playerOrder) ? rawState.playerOrder : (fallbackInitialState?.playerOrder || Object.keys(guaranteedNames)),
    playerNames: guaranteedNames,
    points: guaranteedPoints,
    targetPoints: typeof rawState.targetPoints === 'number' ? rawState.targetPoints : (fallbackInitialState?.targetPoints || 24),
    cantoState: rawState.cantoState || fallbackInitialState?.cantoState || {
      envidoPoints: 2,
      envidoAccepted: null,
      trucoPoints: 1,
      trucoAccepted: null,
      florCalledBy: [],
    },
    status: rawState.status || fallbackInitialState?.status || 'playing',
    winnerUserId: rawState.winnerUserId ?? null,
  };

  return {
    state: normalizedState,
    isValid: missingProps.length === 0,
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

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
    return {
      state: fallbackInitialState || {
        variant: '75',
        drawnBalls: [],
        currentBall: null,
        cards: {},
        cardsPurchased: {},
        playerNames: {},
        winnerUserId: null,
        status: 'in_progress',
        callIntervalMs: 4000,
        totalBalls: 75,
        totalPoolBs: 0,
        winnerPoolBs: 0,
        systemFeeBs: 0,
      },
      isValid: false,
      missingProps,
    };
  }

  if (!rawState.cards || typeof rawState.cards !== 'object') missingProps.push('cards');
  if (!Array.isArray(rawState.drawnBalls)) missingProps.push('drawnBalls');

  const guaranteedCards: Record<string, any> = { ...(rawState.cards || fallbackInitialState?.cards || {}) };
  const guaranteedNames: Record<string, string> = { ...(rawState.playerNames || fallbackInitialState?.playerNames || {}) };

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
    variant: rawState.variant || fallbackInitialState?.variant || '75',
    drawnBalls: Array.isArray(rawState.drawnBalls) ? rawState.drawnBalls : [],
    currentBall: rawState.currentBall ?? null,
    cards: guaranteedCards,
    cards80: rawState.cards80 || fallbackInitialState?.cards80,
    cards90: rawState.cards90 || fallbackInitialState?.cards90,
    cardsPurchased: rawState.cardsPurchased || fallbackInitialState?.cardsPurchased || {},
    playerNames: guaranteedNames,
    winnerUserId: rawState.winnerUserId ?? null,
    status: rawState.status || fallbackInitialState?.status || 'in_progress',
    callIntervalMs: typeof rawState.callIntervalMs === 'number' ? rawState.callIntervalMs : 4000,
    totalBalls: typeof rawState.totalBalls === 'number' ? rawState.totalBalls : 75,
    totalPoolBs: typeof rawState.totalPoolBs === 'number' ? rawState.totalPoolBs : 0,
    winnerPoolBs: typeof rawState.winnerPoolBs === 'number' ? rawState.winnerPoolBs : 0,
    systemFeeBs: typeof rawState.systemFeeBs === 'number' ? rawState.systemFeeBs : 0,
  };

  return {
    state: normalizedState,
    isValid: missingProps.length === 0,
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

  const defaultFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  if (!rawState || typeof rawState !== 'object') {
    missingProps.push('state_is_null_or_not_object');
    return {
      state: fallbackInitialState || {
        fen: defaultFen,
        playerWhiteUserId: players?.[0]?.userId || '',
        playerBlackUserId: players?.[1]?.userId || '',
        currentTurnUserId: players?.[0]?.userId || '',
        moveHistory: [],
        winnerUserId: null,
        isDraw: false,
      },
      isValid: false,
      missingProps,
    };
  }

  if (!rawState.fen || typeof rawState.fen !== 'string') missingProps.push('fen');

  const pWhite = rawState.playerWhiteUserId || fallbackInitialState?.playerWhiteUserId || players?.[0]?.userId || '';
  const pBlack = rawState.playerBlackUserId || fallbackInitialState?.playerBlackUserId || players?.[1]?.userId || '';

  const normalizedState: ChessState = {
    fen: rawState.fen && typeof rawState.fen === 'string' ? rawState.fen : defaultFen,
    playerWhiteUserId: pWhite,
    playerBlackUserId: pBlack,
    currentTurnUserId: rawState.currentTurnUserId || fallbackInitialState?.currentTurnUserId || pWhite,
    turnExpiresAt: rawState.turnExpiresAt || fallbackInitialState?.turnExpiresAt,
    turnDurationSeconds: rawState.turnDurationSeconds || fallbackInitialState?.turnDurationSeconds || 15,
    playerNames: rawState.playerNames || fallbackInitialState?.playerNames || {},
    moveHistory: Array.isArray(rawState.moveHistory) ? rawState.moveHistory : [],
    winnerUserId: rawState.winnerUserId ?? null,
    isDraw: Boolean(rawState.isDraw),
    drawReason: rawState.drawReason,
  };

  return {
    state: normalizedState,
    isValid: missingProps.length === 0,
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
      return normalizeTicTacToeState(rawState, fallbackInitialState, players);
    case 'rock_paper_scissors':
      return normalizeRPSState(rawState, fallbackInitialState, players);
    case 'checkers':
      return normalizeCheckersState(rawState, fallbackInitialState, players);
    case 'domino_venezolano':
      return normalizeDominoState(rawState, fallbackInitialState, players);
    case 'truco_venezolano':
      return normalizeTrucoState(rawState, fallbackInitialState, players);
    case 'bingo':
      return normalizeBingoState(rawState, fallbackInitialState, players);
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
