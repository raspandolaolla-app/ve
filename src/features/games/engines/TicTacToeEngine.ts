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

import { normalizeTicTacToeState } from '../utils/gameStateGuard';

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
    const normalized = normalizeTicTacToeState(state).state;

    if (action.actionType === 'NEXT_ROUND') {
      if (normalized.status !== 'round_won' && normalized.status !== 'draw') {
        return { valid: false, reason: 'La ronda actual aún no ha finalizado.' };
      }
      return { valid: true };
    }

    if (normalized.status !== 'playing') {
      return { valid: false, reason: 'La partida no está en estado activo.' };
    }

    if (action.userId !== normalized.turnUserId) {
      return { valid: false, reason: 'No es tu turno de jugar.' };
    }

    if (action.actionType === 'PLACE_SYMBOL') {
      const cellIndex = action.actionData?.cellIndex as number;
      if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex > 8) {
        return { valid: false, reason: 'Posición de casilla inválida (0-8).' };
      }

      if (normalized.board[cellIndex] !== null) {
        return { valid: false, reason: 'Esta casilla ya está ocupada.' };
      }

      return { valid: true };
    }

    return { valid: false, reason: `Tipo de acción no soportada: ${action.actionType}` };
  }

  public applyAction(state: TicTacToeState, action: GameActionPayload): ActionResult<TicTacToeState> {
    const normalized = normalizeTicTacToeState(state).state;
    const validation = this.validateAction(normalized, action);
    if (!validation.valid) {
      return {
        newState: normalized,
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
      const pSymbols = normalized.playerSymbols || {};
      const symbol = pSymbols[action.userId] || (Object.keys(pSymbols).length === 0 ? 'X' : 'O');
      const newBoard = [...normalized.board];
      newBoard[cellIndex] = symbol;

      const newHistory = [
        ...normalized.moveHistory,
        {
          cellIndex,
          symbol,
          userId: action.userId,
          timestamp: action.clientTimestamp || Date.now(),
        },
      ];

      // Determinar oponente de forma estricta y alternada (A -> B -> A -> B)
      const actionUserNorm = String(action.userId || '').trim().toLowerCase();
      const allPlayerIds = Object.keys(pSymbols).map((id) => id.trim());
      const candidateIds =
        (normalized as any).playerOrder && Array.isArray((normalized as any).playerOrder) && (normalized as any).playerOrder.length > 0
          ? (normalized as any).playerOrder.map((id: any) => String(id).trim())
          : allPlayerIds;

      const currentIdx = candidateIds.findIndex((id: string) => id.toLowerCase() === actionUserNorm);
      let nextTurnUserId = action.userId;
      if (candidateIds.length > 1) {
        if (currentIdx !== -1) {
          nextTurnUserId = candidateIds[(currentIdx + 1) % candidateIds.length];
        } else {
          const opponentId = candidateIds.find((id: string) => id.toLowerCase() !== actionUserNorm);
          if (opponentId) {
            nextTurnUserId = opponentId;
          }
        }
      }

      // Verificar si hay ganador de la ronda
      const winningCombo = this.checkWinner(newBoard);

      if (winningCombo) {
        const newScores = {
          ...normalized.scores,
          [action.userId]: (normalized.scores[action.userId] || 0) + 1,
        };

        const isMatchWon = newScores[action.userId] >= normalized.targetWins;

        const updatedState: TicTacToeState = {
          ...normalized,
          board: newBoard,
          scores: newScores,
          winningLine: winningCombo,
          roundWinnerUserId: action.userId,
          winnerUserId: isMatchWon ? action.userId : null,
          status: isMatchWon ? 'game_won' : 'round_won',
          moveHistory: newHistory,
          turnUserId: isMatchWon ? action.userId : nextTurnUserId,
        };
        (updatedState as any).currentTurnUserId = updatedState.turnUserId;

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
          ...normalized,
          board: newBoard,
          status: 'draw',
          winningLine: null,
          roundWinnerUserId: null,
          winnerUserId: null,
          moveHistory: newHistory,
          turnUserId: nextTurnUserId,
        };
        (updatedState as any).currentTurnUserId = nextTurnUserId;

        return {
          newState: updatedState,
          isValid: true,
          isGameOver: false,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      // Turno continuado al oponente (A -> B -> A -> B)
      const updatedState: TicTacToeState = {
        ...normalized,
        board: newBoard,
        turnUserId: nextTurnUserId,
        moveHistory: newHistory,
      };
      (updatedState as any).currentTurnUserId = nextTurnUserId;

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
      const actionUserNorm = String(action.userId || '').trim().toLowerCase();
      const allPlayerIds = Object.keys(normalized.playerSymbols || {}).map((id) => id.trim());
      const candidateIds =
        (normalized as any).playerOrder && Array.isArray((normalized as any).playerOrder) && (normalized as any).playerOrder.length > 0
          ? (normalized as any).playerOrder.map((id: any) => String(id).trim())
          : allPlayerIds;

      const currentIdx = candidateIds.findIndex((id: string) => id.toLowerCase() === actionUserNorm);
      const nextRoundStarter =
        candidateIds.length > 1
          ? currentIdx !== -1
            ? candidateIds[(currentIdx + 1) % candidateIds.length]
            : candidateIds.find((id: string) => id.toLowerCase() !== actionUserNorm) || candidateIds[0] || action.userId
          : candidateIds[0] || action.userId;

      const updatedState: TicTacToeState = {
        ...normalized,
        board: Array(9).fill(null),
        round: normalized.round + 1,
        turnUserId: nextRoundStarter,
        status: 'playing',
        winningLine: null,
        roundWinnerUserId: null,
        moveHistory: [],
      };
      (updatedState as any).currentTurnUserId = nextRoundStarter;

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
      newState: normalized,
      isValid: false,
      errorMessage: 'Acción no reconocida',
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  public getSanitizedStateForPlayer(state: TicTacToeState, _userId: string): TicTacToeState {
    const normalized = normalizeTicTacToeState(state);
    return normalized.state;
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
