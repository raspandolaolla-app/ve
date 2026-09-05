// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: DAMAS (CHECKERS)
// ==============================================================================
// Tablero 8x8 con movimientos diagonales, saltos de captura y coronación.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { CheckersState, CheckersPiece, CheckersMove, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

import { normalizeCheckersState } from '../utils/gameStateGuard';

export class CheckersEngine implements IGameEngine<CheckersState> {
  public readonly gameType = 'checkers';

  public initialize(table: GameTable, players: TablePlayer[]): CheckersState {
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

    const board: (CheckersPiece | null)[][] = Array(8)
      .fill(null)
      .map(() => Array(8).fill(null));

    // Colocar fichas del Jugador 1 (filas 0, 1, 2)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          board[r][c] = {
            id: `p1_${r}_${c}`,
            player: 1,
            userId: p1UserId,
            isKing: false,
          };
        }
      }
    }

    // Colocar fichas del Jugador 2 (filas 5, 6, 7)
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          board[r][c] = {
            id: `p2_${r}_${c}`,
            player: 2,
            userId: p2UserId,
            isKing: false,
          };
        }
      }
    }

    const capturedCount: Record<string, number> = {};
    if (p1UserId) capturedCount[p1UserId] = 0;
    if (p2UserId) capturedCount[p2UserId] = 0;

    return {
      board,
      turnUserId: p1UserId,
      players: [
        { userId: p1UserId, playerNumber: 1, name: p1?.displayName || 'Jugador 1 (Blancas)' },
        { userId: p2UserId, playerNumber: 2, name: p2?.displayName || 'Jugador 2 (Negras)' },
      ],
      capturedCount,
      lives: {
        [p1UserId]: 3,
        [p2UserId]: 3,
      },
      status: 'playing',
      winnerUserId: null,
      lastMove: null,
    };
  }

  public validateAction(state: CheckersState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status !== 'playing') {
      return { valid: false, reason: 'La partida no está activa.' };
    }

    if (action.actionType === 'TIMEOUT' || (action as any).type === 'TIMEOUT') {
      return { valid: true };
    }

    if (action.userId !== state.turnUserId) {
      return { valid: false, reason: 'No es tu turno de mover.' };
    }

    if (action.actionType === 'MOVE_PIECE') {
      const move = action.actionData.move as CheckersMove;
      if (!move || !move.from || !move.to) {
        return { valid: false, reason: 'Coordenadas de movimiento incompletas.' };
      }

      const { from, to } = move;
      if (from.row < 0 || from.row > 7 || from.col < 0 || from.col > 7 || to.row < 0 || to.row > 7 || to.col < 0 || to.col > 7) {
        return { valid: false, reason: 'Casilla fuera del tablero.' };
      }

      const piece = state.board[from.row][from.col];
      if (!piece) {
        return { valid: false, reason: 'No hay ninguna ficha en la casilla de origen.' };
      }

      if (piece.userId !== action.userId) {
        return { valid: false, reason: 'La ficha seleccionada no te pertenece.' };
      }

      if (state.board[to.row][to.col] !== null) {
        return { valid: false, reason: 'La casilla destino está ocupada.' };
      }

      const rowDiff = to.row - from.row;
      const colDiff = Math.abs(to.col - from.col);

      // Movimiento normal de 1 paso
      if (Math.abs(rowDiff) === 1 && colDiff === 1) {
        if (!piece.isKing) {
          if (piece.player === 1 && rowDiff !== 1) return { valid: false, reason: 'Las fichas normales solo avanzan hacia adelante.' };
          if (piece.player === 2 && rowDiff !== -1) return { valid: false, reason: 'Las fichas normales solo avanzan hacia adelante.' };
        }
        return { valid: true };
      }

      // Salto de captura de 2 pasos
      if (Math.abs(rowDiff) === 2 && colDiff === 2) {
        const midRow = (from.row + to.row) / 2;
        const midCol = (from.col + to.col) / 2;
        const jumpedPiece = state.board[midRow][midCol];

        if (!jumpedPiece) {
          return { valid: false, reason: 'No hay ninguna ficha contraria para capturar en el salto.' };
        }

        if (jumpedPiece.userId === action.userId) {
          return { valid: false, reason: 'No puedes capturar tus propias fichas.' };
        }

        return { valid: true };
      }

      return { valid: false, reason: 'Movimiento no permitido según las reglas de damas.' };
    }

    return { valid: false, reason: `Acción no reconocida: ${action.actionType}` };
  }

  public applyAction(state: CheckersState, action: GameActionPayload): ActionResult<CheckersState> {
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

    if (action.actionType === 'TIMEOUT' || (action as any).type === 'TIMEOUT') {
      const botMove = this.getBotMove(state, action.userId);
      if (botMove) {
        return this.applyAction(state, botMove);
      }
      const actionUserNorm = String(action.userId || '').trim().toLowerCase();
      const opponent =
        state.players.find((p) => String(p.userId || '').trim().toLowerCase() !== actionUserNorm) ||
        state.players[0];
      const nextTurnUserId = opponent?.userId || action.userId;
      const updatedState: CheckersState = {
        ...state,
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

    if (action.actionType === 'MOVE_PIECE') {
      const move = action.actionData.move as CheckersMove;
      const { from, to } = move;

      const newBoard = state.board.map((row) => [...row]);
      let piece = { ...newBoard[from.row][from.col]! };
      newBoard[from.row][from.col] = null;

      // Coronación a Dama/Reina
      if (piece.player === 1 && to.row === 7) piece.isKing = true;
      if (piece.player === 2 && to.row === 0) piece.isKing = true;

      newBoard[to.row][to.col] = piece;

      // Captura si fue un salto
      const capturedCounts = { ...state.capturedCount };
      if (Math.abs(to.row - from.row) === 2) {
        const midRow = (from.row + to.row) / 2;
        const midCol = (from.col + to.col) / 2;
        newBoard[midRow][midCol] = null;
        capturedCounts[action.userId] = (capturedCounts[action.userId] || 0) + 1;
      }

      // Determinar oponente de forma robusta
      const actionUserNorm = String(action.userId || '').trim().toLowerCase();
      const opponent =
        state.players.find((p) => String(p.userId || '').trim().toLowerCase() !== actionUserNorm) ||
        state.players[0];
      const nextTurnUserId = opponent?.userId || action.userId;

      // Contar fichas restantes del oponente
      let opponentPieces = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (
            newBoard[r][c]?.userId &&
            String(newBoard[r][c]?.userId || '').trim().toLowerCase() === String(opponent?.userId || '').trim().toLowerCase()
          ) {
            opponentPieces++;
          }
        }
      }

      const isWon = opponentPieces === 0;

      const updatedState: CheckersState = {
        ...state,
        board: newBoard,
        turnUserId: isWon ? state.turnUserId : nextTurnUserId,
        capturedCount: capturedCounts,
        status: isWon ? 'game_won' : 'playing',
        winnerUserId: isWon ? action.userId : null,
        lastMove: move,
      };
      (updatedState as any).currentTurnUserId = updatedState.turnUserId;

      return {
        newState: updatedState,
        isValid: true,
        isGameOver: isWon,
        winnerUserId: isWon ? action.userId : null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    return {
      newState: state,
      isValid: false,
      errorMessage: 'Acción no procesada',
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  public getSanitizedStateForPlayer(state: CheckersState, _userId: string): CheckersState {
    const normalized = normalizeCheckersState(state);
    return normalized.state;
  }

  public getBotMove(state: CheckersState, userId: string): GameActionPayload | null {
    if (state.turnUserId !== userId || state.status !== 'playing') return null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = state.board[r][c];
        if (piece && piece.userId === userId) {
          const dir = piece.player === 1 ? 1 : -1;
          const targets = [
            { row: r + dir, col: c - 1 },
            { row: r + dir, col: c + 1 },
          ];
          for (const target of targets) {
            if (
              target.row >= 0 &&
              target.row < 8 &&
              target.col >= 0 &&
              target.col < 8 &&
              state.board[target.row][target.col] === null
            ) {
              return {
                sessionId: '',
                userId,
                actionType: 'MOVE_PIECE',
                actionData: {
                  from: { row: r, col: c },
                  to: { row: target.row, col: target.col },
                },
                clientTimestamp: Date.now(),
              };
            }
          }
        }
      }
    }
    return null;
  }
}
