// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: DAMAS (CHECKERS)
// ==============================================================================
// Tablero 8x8 con movimientos diagonales, saltos de captura y coronación.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { CheckersState, CheckersPiece, CheckersMove, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

export class CheckersEngine implements IGameEngine<CheckersState> {
  public readonly gameType = 'checkers';

  public initialize(table: GameTable, players: TablePlayer[]): CheckersState {
    const sortedPlayers = [...players].sort((a, b) => a.seatNumber - b.seatNumber);
    const p1 = sortedPlayers[0];
    const p2 = sortedPlayers[1] || sortedPlayers[0];

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
            userId: p1.userId,
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
            userId: p2.userId,
            isKing: false,
          };
        }
      }
    }

    return {
      board,
      turnUserId: p1.userId,
      players: [
        { userId: p1.userId, playerNumber: 1, name: p1.displayName || 'Jugador 1 (Blancas)' },
        { userId: p2.userId, playerNumber: 2, name: p2.displayName || 'Jugador 2 (Negras)' },
      ],
      capturedCount: {
        [p1.userId]: 0,
        [p2.userId]: 0,
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

      // Determinar oponente
      const opponent = state.players.find((p) => p.userId !== action.userId)!;

      // Contar fichas restantes del oponente
      let opponentPieces = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (newBoard[r][c]?.userId === opponent.userId) {
            opponentPieces++;
          }
        }
      }

      const isWon = opponentPieces === 0;

      const updatedState: CheckersState = {
        ...state,
        board: newBoard,
        turnUserId: isWon ? state.turnUserId : opponent.userId,
        capturedCount: capturedCounts,
        status: isWon ? 'game_won' : 'playing',
        winnerUserId: isWon ? action.userId : null,
        lastMove: move,
      };

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
    return state;
  }
}
