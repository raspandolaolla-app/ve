// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: 3 EN RAYA (TIC TAC TOE)
// ==============================================================================
// Motor determinista 1v1 con validación de jugadas, turnos y líneas ganadoras.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { TicTacToeState, TicTacToeSymbol, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

const WINNING_COMBINATIONS = [
  [0, 1, 2], // Fila superior
  [3, 4, 5], // Fila central
  [6, 7, 8], // Fila inferior
  [0, 3, 6], // Columna izquierda
  [1, 4, 7], // Columna centro
  [2, 5, 8], // Columna derecha
  [0, 4, 8], // Diagonal principal
  [2, 4, 6], // Diagonal secundaria
];

export class TicTacToeEngine implements IGameEngine<TicTacToeState> {
  public readonly gameType = 'tic_tac_toe';

  public initialize(table: GameTable, players: TablePlayer[]): TicTacToeState {
    const uniquePlayers = Array.from(
      new Map(
        players.map((player) => [
          (player as any).user_id || player.userId,
          player,
        ])
      ).values()
    ).sort((a, b) => (a.seatNumber ?? 1) - (b.seatNumber ?? 1));

    if (players.length !== uniquePlayers.length) {
      throw new Error('Un jugador no puede ocupar dos puestos en la misma mesa');
    }

    const p1 = uniquePlayers[0];
    const p2 = uniquePlayers[1];

    const p1UserId = p1?.userId || table.hostUserId;
    const p2UserId = p2?.userId && p2.userId !== p1UserId ? p2.userId : '';

    if (p1UserId && p2UserId && p1UserId === p2UserId) {
      throw new Error('Un jugador no puede ocupar dos puestos en la misma mesa');
    }

    const playerSymbols: Record<string, TicTacToeSymbol> = {
      [p1UserId]: 'X',
    };
    if (p2UserId) {
      playerSymbols[p2UserId] = 'O';
    }

    const playerNames: Record<string, string> = {
      [p1UserId]: p1?.displayName || 'Jugador 1 (X)',
    };
    if (p2UserId) {
      playerNames[p2UserId] = p2?.displayName || 'Jugador 2 (O)';
    }

    const scores: Record<string, number> = {
      [p1UserId]: 0,
    };
    if (p2UserId) {
      scores[p2UserId] = 0;
    }

    const lives: Record<string, number> = {
      [p1UserId]: 3,
    };
    if (p2UserId) {
      lives[p2UserId] = 3;
    }

    return {
      board: Array(9).fill(null),
      turnUserId: p1UserId,
      playerSymbols,
      playerNames,
      lives,
      round: 1,
      targetWins: 3, // Al mejor de 5 (Primero a 3 victorias)
      scores,
      status: 'playing',
      winningLine: null,
      winnerUserId: null,
      roundWinnerUserId: null,
      moveHistory: [],
    };
  }

  /**
   * Obtiene un movimiento válido para el BOT en La Vieja
   */
  public getBotMove(state: TicTacToeState, userId: string): GameActionPayload | null {
    if (state.turnUserId !== userId || state.status !== 'playing') return null;

    const emptyIndices: number[] = [];
    state.board.forEach((cell, idx) => {
      if (cell === null) emptyIndices.push(idx);
    });
    if (emptyIndices.length === 0) return null;

    let movePos = emptyIndices[0];
    if (emptyIndices.includes(4)) {
      movePos = 4;
    } else {
      const corners = [0, 2, 6, 8].filter((c) => emptyIndices.includes(c));
      if (corners.length > 0) {
        movePos = corners[Math.floor(Math.random() * corners.length)];
      } else {
        movePos = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
      }
    }

    return {
      sessionId: '',
      userId,
      actionType: 'MAKE_MOVE',
      actionData: { index: movePos, position: movePos },
      clientTimestamp: Date.now(),
    };
  }

  public validateAction(state: TicTacToeState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (action.actionType === 'NEXT_ROUND') {
      if (state.status !== 'round_won' && state.status !== 'draw') {
        return { valid: false, reason: 'La ronda actual aún no ha finalizado.' };
      }
      return { valid: true };
    }

    if (state.status !== 'playing') {
      return { valid: false, reason: 'La partida no está en estado activo.' };
    }

    if (action.userId !== state.turnUserId) {
      return { valid: false, reason: 'No es tu turno de jugar.' };
    }

    if (action.actionType === 'PLACE_SYMBOL') {
      const cellIndex = action.actionData.cellIndex as number;
      if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) {
        return { valid: false, reason: 'Posición de casilla inválida (0-8).' };
      }

      if (state.board[cellIndex] !== null) {
        return { valid: false, reason: 'Esta casilla ya está ocupada.' };
      }

      return { valid: true };
    }

    return { valid: false, reason: `Tipo de acción no soportada: ${action.actionType}` };
  }

  public applyAction(state: TicTacToeState, action: GameActionPayload): ActionResult<TicTacToeState> {
    const validation = this.validateAction(state, action);
    if (!validation.valid) {
      return {
        newState: state,
        isValid: false,
        errorMessage: validation.reason,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    if (action.actionType === 'PLACE_SYMBOL') {
      const cellIndex = action.actionData.cellIndex as number;
      const symbol = state.playerSymbols[action.userId];
      const newBoard = [...state.board];
      newBoard[cellIndex] = symbol;

      const newHistory = [
        ...state.moveHistory,
        {
          cellIndex,
          symbol,
          userId: action.userId,
          timestamp: action.clientTimestamp || Date.now(),
        },
      ];

      // Verificar si hay ganador de la ronda
      const winningCombo = this.checkWinner(newBoard);
      const playerIds = Object.keys(state.playerSymbols);
      const nextTurnUserId = playerIds.find((id) => id !== action.userId) || action.userId;

      if (winningCombo) {
        const newScores = {
          ...state.scores,
          [action.userId]: (state.scores[action.userId] || 0) + 1,
        };

        const isMatchWon = newScores[action.userId] >= state.targetWins;

        const updatedState: TicTacToeState = {
          ...state,
          board: newBoard,
          scores: newScores,
          winningLine: winningCombo,
          roundWinnerUserId: action.userId,
          winnerUserId: isMatchWon ? action.userId : null,
          status: isMatchWon ? 'game_won' : 'round_won',
          moveHistory: newHistory,
        };

        return {
          newState: updatedState,
          isValid: true,
          isGameOver: isMatchWon,
          winnerUserId: isMatchWon ? action.userId : null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      // Verificar empate (todas las casillas ocupadas sin ganador)
      const isBoardFull = newBoard.every((cell) => cell !== null);
      if (isBoardFull) {
        const updatedState: TicTacToeState = {
          ...state,
          board: newBoard,
          status: 'draw',
          winningLine: null,
          roundWinnerUserId: null,
          winnerUserId: null,
          moveHistory: newHistory,
        };

        return {
          newState: updatedState,
          isValid: true,
          isGameOver: false,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      // Turno continuado
      const updatedState: TicTacToeState = {
        ...state,
        board: newBoard,
        turnUserId: nextTurnUserId,
        moveHistory: newHistory,
      };

      return {
        newState: updatedState,
        isValid: true,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    if (action.actionType === 'NEXT_ROUND') {
      const playerIds = Object.keys(state.playerSymbols);
      const updatedState: TicTacToeState = {
        ...state,
        board: Array(9).fill(null),
        round: state.round + 1,
        turnUserId: playerIds[state.round % playerIds.length],
        status: 'playing',
        winningLine: null,
        roundWinnerUserId: null,
        moveHistory: [],
      };

      return {
        newState: updatedState,
        isValid: true,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    return {
      newState: state,
      isValid: false,
      errorMessage: 'Acción no reconocida',
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  public getSanitizedStateForPlayer(state: TicTacToeState, _userId: string): TicTacToeState {
    return state; // El tablero de 3 en Raya es de información perfecta y pública
  }

  private checkWinner(board: (TicTacToeSymbol | null)[]): number[] | null {
    for (const combo of WINNING_COMBINATIONS) {
      const [a, b, c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return combo;
      }
    }
    return null;
  }
}
