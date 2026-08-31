// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: AJEDREZ (CHESS)
// ==============================================================================
// Motor determinista 1v1 con validación robusta usando chess.js.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { ChessState, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { Chess } from 'chess.js';

export class ChessEngine implements IGameEngine<ChessState> {
  public readonly gameType = 'chess';

  public initialize(table: GameTable, players: TablePlayer[]): ChessState {
    const uniquePlayers = [...players]
      .filter((p, index, self) => self.findIndex((other) => other.userId === p.userId) === index)
      .sort((a, b) => a.seatNumber - b.seatNumber);
    const p1 = uniquePlayers[0];
    const p2 = uniquePlayers[1];

    return {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playerWhiteUserId: p1?.userId || table.hostUserId,
      playerBlackUserId: p2?.userId || '',
      moveHistory: [],
      winnerUserId: null,
      isDraw: false,
    };
  }

  public validateAction(state: ChessState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.winnerUserId || state.isDraw) {
      return { valid: false, reason: 'La partida ya ha finalizado.' };
    }

    let chess: Chess;
    try {
      chess = new Chess(state.fen);
    } catch (e) {
      return { valid: false, reason: 'FEN de la partida inválido.' };
    }

    // Turno activo según el color de chess.js ('w' = blancas, 'b' = negras)
    const activeColor = chess.turn();
    const expectedTurnUserId = activeColor === 'w' ? state.playerWhiteUserId : state.playerBlackUserId;

    if (action.userId !== expectedTurnUserId) {
      return { valid: false, reason: 'No es tu turno de jugar.' };
    }

    if (action.actionType === 'MOVE') {
      const { from, to, promotion } = action.actionData;
      if (typeof from !== 'string' || typeof to !== 'string') {
        return { valid: false, reason: 'Posiciones de origen y destino inválidas.' };
      }

      try {
        const moves = chess.moves({ square: from as any, verbose: true });
        const isLegal = moves.some(
          (m) => m.to === to && (!promotion || m.promotion === promotion)
        );
        if (!isLegal) {
          return { valid: false, reason: 'Movimiento ilegal según las reglas del ajedrez.' };
        }
      } catch (e) {
        return { valid: false, reason: 'Error validando el movimiento en las reglas.' };
      }

      return { valid: true };
    }

    return { valid: false, reason: `Acción no soportada: ${action.actionType}` };
  }

  public applyAction(state: ChessState, action: GameActionPayload): ActionResult<ChessState> {
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

    if (action.actionType === 'MOVE') {
      const { from, to, promotion } = action.actionData;
      const chess = new Chess(state.fen);

      let moveResult;
      try {
        moveResult = chess.move({
          from: from as string,
          to: to as string,
          promotion: (promotion as string) || undefined,
        });
      } catch (e: any) {
        return {
          newState: state,
          isValid: false,
          errorMessage: e.message || 'Error al procesar el movimiento.',
          isGameOver: false,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      const isGameOver = chess.isGameOver();
      let winnerUserId: string | null = null;
      let isDraw = false;
      let drawReason: ChessState['drawReason'] = undefined;

      if (isGameOver) {
        if (chess.isCheckmate()) {
          winnerUserId = action.userId;
        } else {
          isDraw = true;
          if (chess.isStalemate()) drawReason = 'stalemate';
          else if (chess.isThreefoldRepetition()) drawReason = 'threefold_repetition';
          else if (chess.isInsufficientMaterial()) drawReason = 'insufficient_material';
          else drawReason = 'fifty_moves';
        }
      }

      const nextHistory = [
        ...state.moveHistory,
        {
          from: from as string,
          to: to as string,
          san: moveResult.san,
          userId: action.userId,
          timestamp: action.clientTimestamp || Date.now(),
        },
      ];

      const newState: ChessState = {
        ...state,
        fen: chess.fen(),
        moveHistory: nextHistory,
        winnerUserId,
        isDraw,
        drawReason,
      };

      return {
        newState,
        isValid: true,
        isGameOver,
        winnerUserId,
        winnerTeamIndex: null,
        isDraw,
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

  public getSanitizedStateForPlayer(state: ChessState, _userId: string): ChessState {
    return state;
  }
}
