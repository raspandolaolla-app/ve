// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: AJEDREZ (CHESS)
// ==============================================================================
// Motor determinista 1v1 con validación server-authoritative usando chess.js.
// Reglas FIDE: movimientos legales, jaque, jaque mate, enroque, al paso, coronación,
// tablas (ahogado, repetición triple, material insuficiente, 50 movimientos, mutuo acuerdo),
// rendición y tiempo fuera.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { ChessState, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { Chess } from 'chess.js';

import { normalizeChessState } from '../utils/gameStateGuard';

export class ChessEngine implements IGameEngine<ChessState> {
  public readonly gameType = 'chess';

  public initialize(table: GameTable, players: TablePlayer[]): ChessState {
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

    const playerWhiteUserId = p1?.userId || table.hostUserId;
    const playerBlackUserId = p2?.userId && p2.userId !== playerWhiteUserId ? p2.userId : '';

    if (playerWhiteUserId && playerBlackUserId && playerWhiteUserId === playerBlackUserId) {
      throw new Error('Un jugador no puede ocupar dos puestos en la misma mesa');
    }

    return {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playerWhiteUserId,
      playerBlackUserId,
      currentTurnUserId: playerWhiteUserId,
      turnDurationSeconds: 15,
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

    // Acciones especiales
    if (action.actionType === 'RESIGN') {
      if (action.userId !== state.playerWhiteUserId && action.userId !== state.playerBlackUserId) {
        return { valid: false, reason: 'Solo los jugadores de la partida pueden rendirse.' };
      }
      return { valid: true };
    }

    if (action.actionType === 'TIMEOUT') {
      // El jugador cuyo tiempo expiró pierde
      const activeColor = chess.turn();
      const expectedTurnUserId = activeColor === 'w' ? state.playerWhiteUserId : state.playerBlackUserId;
      if (action.userId !== expectedTurnUserId) {
        return { valid: false, reason: 'Solo el jugador en turno puede sufrir tiempo fuera.' };
      }
      return { valid: true };
    }

    if (action.actionType === 'OFFER_DRAW') {
      if (action.userId !== state.playerWhiteUserId && action.userId !== state.playerBlackUserId) {
        return { valid: false, reason: 'Solo los jugadores de la partida pueden ofrecer tablas.' };
      }
      return { valid: true };
    }

    if (action.actionType === 'ACCEPT_DRAW') {
      if (action.userId !== state.playerWhiteUserId && action.userId !== state.playerBlackUserId) {
        return { valid: false, reason: 'Solo los jugadores de la partida pueden aceptar tablas.' };
      }
      return { valid: true };
    }

    // Movimiento regular
    if (action.actionType === 'MOVE') {
      // Turno activo según el color de chess.js ('w' = blancas, 'b' = negras)
      const activeColor = chess.turn();
      const expectedTurnUserId = activeColor === 'w' ? state.playerWhiteUserId : state.playerBlackUserId;

      if (action.userId !== expectedTurnUserId) {
        return { valid: false, reason: 'No es tu turno de jugar.' };
      }

      const { from, to, promotion } = action.actionData || {};
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

    // 1. Rendición
    if (action.actionType === 'RESIGN') {
      const winnerUserId = action.userId === state.playerWhiteUserId ? state.playerBlackUserId : state.playerWhiteUserId;
      const newState: ChessState = {
        ...state,
        winnerUserId,
        isDraw: false,
      };
      return {
        newState,
        isValid: true,
        isGameOver: true,
        winnerUserId,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    // 2. Tiempo Fuera (Timeout)
    if (action.actionType === 'TIMEOUT') {
      const winnerUserId = action.userId === state.playerWhiteUserId ? state.playerBlackUserId : state.playerWhiteUserId;
      const newState: ChessState = {
        ...state,
        winnerUserId,
        isDraw: false,
      };
      return {
        newState,
        isValid: true,
        isGameOver: true,
        winnerUserId,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    // 3. Tablas de común acuerdo
    if (action.actionType === 'ACCEPT_DRAW') {
      const newState: ChessState = {
        ...state,
        winnerUserId: null,
        isDraw: true,
        drawReason: 'mutual_agreement',
      };
      return {
        newState,
        isValid: true,
        isGameOver: true,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: true,
      };
    }

    // 4. Movimiento de Ajedrez
    if (action.actionType === 'MOVE') {
      const { from, to, promotion } = action.actionData || {};
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

      const nextActiveColor = chess.turn();
      const nextTurnUserId = nextActiveColor === 'w' ? state.playerWhiteUserId : state.playerBlackUserId;

      const newState: ChessState = {
        ...state,
        fen: chess.fen(),
        currentTurnUserId: isGameOver ? undefined : nextTurnUserId,
        turnDurationSeconds: 15,
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
    const normalized = normalizeChessState(state);
    return normalized.state;
  }
}
