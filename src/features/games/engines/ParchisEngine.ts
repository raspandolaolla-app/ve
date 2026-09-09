// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: PARCHÍS / LUDO VENEZOLANO
// ==============================================================================
// Motor determinista y autorizado por servidor para las 5 modalidades de Parchís:
// 1. Individual a 4 (4 jugadores, 4 colores, 4 fichas/color)
// 2. Parejas a 4 (2v2: Amarillo+Rojo vs Azul+Verde)
// 3. 1 contra 1 (2 jugadores, 2 colores/jugador)
// 4. 6 Fichas (2 jugadores, 6 fichas/color, 3 salen en casillas seguras)
// 5. 3 contra 3 (6 jugadores, 6 colores, 2 equipos)
// NOTA CRÍTICA: Parchís / Ludo es un juego de fichas, dados y casillas.
// Es un juego totalmente diferente de Atrapaíto Criollo (muros y canicas).
// ==============================================================================

import { RngService } from '../../../services/rng/RngService';
import type { IGameEngine, ActionResult } from './GameEngine';
import type {
  ParchisState,
  ParchisMode,
  ParchisColor,
  ParchisPiece,
  ParchisPlayer,
  ParchisLegalMove,
  GameActionPayload,
} from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

export const BOARD_CONFIG_4 = {
  totalTrackSquares: 68,
  exitSquares: {
    yellow: 5,
    blue: 22,
    red: 39,
    green: 56,
  } as Record<ParchisColor, number>,
  finalEntrySquares: {
    yellow: 68,
    blue: 17,
    red: 34,
    green: 51,
  } as Record<ParchisColor, number>,
  safeSquares: [5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68],
  finalPathLength: 8,
};

export const BOARD_CONFIG_6 = {
  totalTrackSquares: 102,
  exitSquares: {
    yellow: 5,
    red: 22,
    orange: 39,
    blue: 56,
    green: 73,
    cyan: 90,
  } as Record<ParchisColor, number>,
  finalEntrySquares: {
    yellow: 102,
    red: 17,
    orange: 34,
    blue: 51,
    green: 68,
    cyan: 85,
  } as Record<ParchisColor, number>,
  safeSquares: [5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68, 73, 80, 85, 90, 97, 102],
  finalPathLength: 8,
};

export class ParchisEngine implements IGameEngine<ParchisState> {
  public readonly gameType = 'parchis';

  public initialize(table: GameTable, players: TablePlayer[]): ParchisState {
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

    const cfg = (table.config || {}) as Record<string, any>;
    const rawMode = (cfg.parchisMode || cfg.atrapaitoMode || cfg.mode || table.mode || 'INDIVIDUAL_4') as string;
    let mode: ParchisMode = 'INDIVIDUAL_4';

    if (uniquePlayers.length === 6) {
      mode = 'THREE_VS_THREE';
    } else if (uniquePlayers.length === 2) {
      mode = rawMode === 'SIX_PIECES' ? 'SIX_PIECES' : 'ONE_VS_ONE';
    } else if (uniquePlayers.length === 4) {
      mode = rawMode === 'PAIRS_4' ? 'PAIRS_4' : 'INDIVIDUAL_4';
    }

    const boardType = mode === 'THREE_VS_THREE' ? '6_COLORS' : '4_COLORS';
    const config = boardType === '6_COLORS' ? BOARD_CONFIG_6 : BOARD_CONFIG_4;

    const playerMap: Record<string, ParchisPlayer> = {};
    const playerNames: Record<string, string> = {};
    const livesMap: Record<string, number> = {};
    const playerOrder: string[] = uniquePlayers.map((p) => p.userId);

    const colorsAssigned: Record<string, ParchisColor[]> = {};
    const teamsAssigned: Record<string, 'A' | 'B' | null> = {};

    if (mode === 'INDIVIDUAL_4') {
      const colors: ParchisColor[] = ['yellow', 'blue', 'red', 'green'];
      uniquePlayers.forEach((p, idx) => {
        colorsAssigned[p.userId] = [colors[idx % 4]];
        teamsAssigned[p.userId] = null;
      });
    } else if (mode === 'PAIRS_4') {
      const colors: ParchisColor[] = ['yellow', 'blue', 'red', 'green'];
      uniquePlayers.forEach((p, idx) => {
        colorsAssigned[p.userId] = [colors[idx % 4]];
        teamsAssigned[p.userId] = idx % 2 === 0 ? 'A' : 'B';
      });
    } else if (mode === 'ONE_VS_ONE' || mode === 'SIX_PIECES') {
      if (uniquePlayers.length >= 2) {
        colorsAssigned[uniquePlayers[0].userId] = ['yellow', 'red'];
        teamsAssigned[uniquePlayers[0].userId] = 'A';
        colorsAssigned[uniquePlayers[1].userId] = ['blue', 'green'];
        teamsAssigned[uniquePlayers[1].userId] = 'B';
      }
    } else if (mode === 'THREE_VS_THREE') {
      const colors: ParchisColor[] = ['yellow', 'blue', 'red', 'green', 'orange', 'cyan'];
      uniquePlayers.forEach((p, idx) => {
        colorsAssigned[p.userId] = [colors[idx % 6]];
        teamsAssigned[p.userId] = idx % 2 === 0 ? 'A' : 'B';
      });
    }

    uniquePlayers.forEach((p, idx) => {
      const pName = p.displayName?.trim() || `Jugador ${idx + 1}`;
      playerNames[p.userId] = pName;
      livesMap[p.userId] = 3;

      playerMap[p.userId] = {
        userId: p.userId,
        name: pName,
        avatarUrl: p.avatarUrl,
        colors: colorsAssigned[p.userId] || ['yellow'],
        team: teamsAssigned[p.userId] || null,
        seat: p.seatNumber || idx + 1,
        lives: 3,
        status: 'active',
      };
    });

    const piecesMap: Record<string, ParchisPiece> = {};
    const activeColors: ParchisColor[] =
      boardType === '6_COLORS'
        ? ['yellow', 'blue', 'red', 'green', 'orange', 'cyan']
        : ['yellow', 'blue', 'red', 'green'];

    const piecesPerColor = mode === 'SIX_PIECES' ? 6 : 4;

    activeColors.forEach((color) => {
      for (let i = 1; i <= piecesPerColor; i++) {
        const pieceId = `${color}_${i}`;
        let pieceState: ParchisPiece['state'] = 'HOME';
        let position = 0;
        let pathProgress = 0;

        if (mode === 'SIX_PIECES' && i > 3) {
          pieceState = 'ON_BOARD';
          const exitSquare = config.exitSquares[color] || 5;
          position = (exitSquare + (i - 4) * 2) % config.totalTrackSquares || config.totalTrackSquares;
          pathProgress = (i - 4) * 2 + 1;
        }

        piecesMap[pieceId] = {
          id: pieceId,
          color,
          pieceNumber: i,
          state: pieceState,
          position,
          pathProgress,
        };
      }
    });

    const firstUserId = playerOrder[0] || '';
    const firstColor = playerMap[firstUserId]?.colors[0] || 'yellow';
    const now = Date.now();

    return {
      mode,
      boardType,
      pieces: piecesMap,
      players: playerMap,
      playerOrder,
      currentTurnUserId: firstUserId,
      turnUserId: firstUserId,
      activeColor: firstColor,
      turnPhase: 'ROLL_DICE',
      diceValue: null,
      consecutiveSixes: 0,
      lastMovedPieceId: null,
      pendingBonus: null,
      legalMoves: [],
      status: 'playing',
      winnerUserId: null,
      winnerTeam: null,
      lastActionDescription: 'Partida iniciada. ¡Lanza el dado para comenzar!',
      lives: livesMap,
      playerNames,
      turnStartedAt: now,
      turnDeadlineAt: now + 30000,
    };
  }

  public validateAction(state: ParchisState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status === 'game_won' || state.status === 'cancelled') {
      return { valid: false, reason: 'La partida ya ha finalizado.' };
    }

    if (action.actionType === 'TIMEOUT_AUTO_MOVE' || action.actionType === 'PLAYER_TIMEOUT') {
      return { valid: true };
    }

    if (action.userId !== state.currentTurnUserId) {
      return { valid: false, reason: 'No es tu turno de jugar.' };
    }

    if (action.actionType === 'ROLL_DICE') {
      if (state.turnPhase !== 'ROLL_DICE') {
        return { valid: false, reason: 'Ya has lanzado el dado en este turno.' };
      }
      return { valid: true };
    }

    if (action.actionType === 'MOVE_PIECE' || action.actionType === 'SELECT_PIECE') {
      if (state.turnPhase !== 'SELECT_PIECE' && state.turnPhase !== 'BONUS_MOVE') {
        return { valid: false, reason: 'Debes lanzar el dado antes de mover una ficha.' };
      }
      const pieceId = (action.actionData.pieceId || action.actionData.cardId) as string;
      const isLegal = state.legalMoves.some((m) => m.pieceId === pieceId);
      if (!isLegal) {
        return { valid: false, reason: 'Esa ficha no tiene un movimiento legal disponible.' };
      }
      return { valid: true };
    }

    return { valid: false, reason: `Acción desconocida: ${action.actionType}` };
  }

  public applyAction(state: ParchisState, action: GameActionPayload): ActionResult<ParchisState> {
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

    const now = Date.now();

    if (action.actionType === 'TIMEOUT_AUTO_MOVE' || action.actionType === 'PLAYER_TIMEOUT') {
      return this.handleTimeout(state);
    }

    if (action.actionType === 'ROLL_DICE') {
      const dice = (action.actionData.diceValue as number) || RngService.getRandomIntSecure(1, 6);
      const consecutiveSixes = dice === 6 ? state.consecutiveSixes + 1 : 0;

      if (consecutiveSixes === 3) {
        const updatedPieces = { ...state.pieces };
        let desc = '¡Tres 6 consecutivos! La última ficha movida vuelve a casa.';

        if (state.lastMovedPieceId && updatedPieces[state.lastMovedPieceId]) {
          const piece = updatedPieces[state.lastMovedPieceId];
          if (piece.state !== 'FINAL_PATH' && piece.state !== 'FINISHED') {
            updatedPieces[state.lastMovedPieceId] = {
              ...piece,
              state: 'HOME',
              position: 0,
              pathProgress: 0,
            };
          } else {
            desc = '¡Tres 6 consecutivos! La ficha estaba a salvo en el pasillo final y no regresa.';
          }
        }

        const nextState = this.advanceToNextTurn({
          ...state,
          pieces: updatedPieces,
          consecutiveSixes: 0,
          diceValue: dice,
          lastActionDescription: desc,
          turnStartedAt: now,
          turnDeadlineAt: now + 30000,
        });

        return {
          newState: nextState,
          isValid: true,
          isGameOver: false,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      const legalMoves = this.calculateLegalMoves(state, dice);

      if (legalMoves.length === 0) {
        const nextState = this.advanceToNextTurn({
          ...state,
          diceValue: dice,
          consecutiveSixes,
          lastActionDescription: `Dado: ${dice}. No hay movimientos legales disponibles.`,
          turnStartedAt: now,
          turnDeadlineAt: now + 30000,
        });

        return {
          newState: nextState,
          isValid: true,
          isGameOver: false,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      return {
        newState: {
          ...state,
          diceValue: dice,
          consecutiveSixes,
          turnPhase: 'SELECT_PIECE',
          legalMoves,
          lastActionDescription: `Dado: ${dice}. Selecciona la ficha que deseas mover.`,
          turnDeadlineAt: now + 30000,
        },
        isValid: true,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    if (action.actionType === 'MOVE_PIECE' || action.actionType === 'SELECT_PIECE') {
      const pieceId = (action.actionData.pieceId || action.actionData.cardId) as string;
      const move = state.legalMoves.find((m) => m.pieceId === pieceId);
      if (!move) {
        return {
          newState: state,
          isValid: false,
          errorMessage: 'Movimiento no permitido para la ficha seleccionada.',
          isGameOver: false,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      return this.executePieceMove(state, move);
    }

    return {
      newState: state,
      isValid: false,
      errorMessage: 'Acción no reconocida.',
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  private executePieceMove(state: ParchisState, move: ParchisLegalMove): ActionResult<ParchisState> {
    const updatedPieces = { ...state.pieces };
    const piece = { ...updatedPieces[move.pieceId] };
    const config = state.boardType === '6_COLORS' ? BOARD_CONFIG_6 : BOARD_CONFIG_4;
    const now = Date.now();

    let bonus: { type: 'CAPTURE_20' | 'GOAL_10'; bonusSteps: number; color: ParchisColor } | null = null;
    let description = '';

    if (move.isExitMove) {
      piece.state = 'ON_BOARD';
      piece.position = config.exitSquares[piece.color];
      piece.pathProgress = 1;
      description = `¡Ficha de ${piece.color} sale a la casilla de salida (${piece.position})!`;
    } else {
      piece.position = move.toPosition;
      piece.pathProgress += move.steps;

      if (move.isGoalEntry) {
        piece.state = 'FINISHED';
        bonus = { type: 'GOAL_10', bonusSteps: 10, color: piece.color };
        description = `¡Ficha de ${piece.color} ha llegado a la META! ¡Ganas 10 pasos de bonificación!`;
      } else if (piece.pathProgress > config.totalTrackSquares) {
        piece.state = 'FINAL_PATH';
        description = `Ficha de ${piece.color} avanza por el pasillo de meta.`;
      } else {
        piece.state = config.safeSquares.includes(piece.position) ? 'SAFE' : 'ON_BOARD';
        description = `Ficha de ${piece.color} avanzó ${move.steps} casillas hasta la posición ${piece.position}.`;
      }
    }

    // Comprobar si hubo captura
    if (move.isCapture) {
      Object.values(updatedPieces).forEach((other) => {
        if (
          other.id !== piece.id &&
          other.position === piece.position &&
          other.state === 'ON_BOARD' &&
          other.color !== piece.color
        ) {
          updatedPieces[other.id] = {
            ...other,
            state: 'HOME',
            position: 0,
            pathProgress: 0,
          };
          description += ` ¡Captura a la ficha de ${other.color}! Ganas 20 pasos de premio.`;
          bonus = { type: 'CAPTURE_20', bonusSteps: 20, color: piece.color };
        }
      });
    }

    updatedPieces[move.pieceId] = piece;

    // Verificar si el jugador o equipo ha ganado la partida
    const hasWon = this.checkWinCondition(state, updatedPieces);
    if (hasWon) {
      const activePlayer = state.players[state.currentTurnUserId];
      return {
        newState: {
          ...state,
          pieces: updatedPieces,
          status: 'game_won',
          winnerUserId: state.currentTurnUserId,
          winnerTeam: activePlayer.team,
          lastActionDescription: `¡Partida finalizada! ¡Victoria para ${activePlayer.name}!`,
        },
        isValid: true,
        isGameOver: true,
        winnerUserId: state.currentTurnUserId,
        winnerTeamIndex: activePlayer.team === 'A' ? 0 : activePlayer.team === 'B' ? 1 : null,
        isDraw: false,
      };
    }

    // Si hay premio de 20 o 10, conceder turno de bonificación
    if (bonus) {
      const bonusMoves = this.calculateLegalMovesForSteps(
        { ...state, pieces: updatedPieces },
        bonus.color,
        bonus.bonusSteps
      );

      if (bonusMoves.length > 0) {
        return {
          newState: {
            ...state,
            pieces: updatedPieces,
            turnPhase: 'BONUS_MOVE',
            pendingBonus: bonus,
            legalMoves: bonusMoves,
            lastMovedPieceId: piece.id,
            lastActionDescription: description,
            turnDeadlineAt: now + 30000,
          },
          isValid: true,
          isGameOver: false,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      } else {
        description += ' (No hay fichas para aplicar la bonificación).';
      }
    }

    // Si sacó 6, repite turno (a menos que haya alcanzado 3 consecutivos)
    if (state.diceValue === 6 && state.consecutiveSixes < 2) {
      return {
        newState: {
          ...state,
          pieces: updatedPieces,
          turnPhase: 'ROLL_DICE',
          diceValue: null,
          legalMoves: [],
          lastMovedPieceId: piece.id,
          lastActionDescription: `${description} ¡Sacaste 6! Vuelves a tirar el dado.`,
          turnStartedAt: now,
          turnDeadlineAt: now + 30000,
        },
        isValid: true,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    // Avanzar al siguiente turno de forma normal
    const nextState = this.advanceToNextTurn({
      ...state,
      pieces: updatedPieces,
      lastMovedPieceId: piece.id,
      consecutiveSixes: 0,
      lastActionDescription: description,
      turnStartedAt: now,
      turnDeadlineAt: now + 30000,
    });

    return {
      newState: nextState,
      isValid: true,
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  private calculateLegalMoves(state: ParchisState, dice: number): ParchisLegalMove[] {
    const activePlayer = state.players[state.currentTurnUserId];
    if (!activePlayer) return [];

    const moves: ParchisLegalMove[] = [];
    activePlayer.colors.forEach((color) => {
      const colorMoves = this.calculateLegalMovesForSteps(state, color, dice);
      moves.push(...colorMoves);
    });

    return moves;
  }

  private calculateLegalMovesForSteps(
    state: ParchisState,
    color: ParchisColor,
    steps: number
  ): ParchisLegalMove[] {
    const config = state.boardType === '6_COLORS' ? BOARD_CONFIG_6 : BOARD_CONFIG_4;
    const pieces = Object.values(state.pieces).filter((p) => p.color === color);
    const moves: ParchisLegalMove[] = [];

    const exitSquare = config.exitSquares[color];
    const finalEntrySquare = config.finalEntrySquares[color];
    const totalSquares = config.totalTrackSquares;

    // Regla de salida con 5
    if (steps === 5) {
      const homePiece = pieces.find((p) => p.state === 'HOME');
      if (homePiece) {
        const piecesOnExit = Object.values(state.pieces).filter(
          (p) => p.position === exitSquare && p.state === 'ON_BOARD'
        );
        const hasBarrier = piecesOnExit.length >= 2;
        if (!hasBarrier) {
          const isCapture = piecesOnExit.length === 1 && piecesOnExit[0].color !== color;
          moves.push({
            pieceId: homePiece.id,
            fromPosition: 0,
            toPosition: exitSquare,
            steps: 5,
            isExitMove: true,
            isCapture,
          });
        }
      }
    }

    // Regla de movimiento de fichas en pista y pasillo final
    pieces.forEach((piece) => {
      if (piece.state === 'HOME' || piece.state === 'FINISHED') return;

      const currentProgress = piece.pathProgress;
      const targetProgress = currentProgress + steps;
      const maxProgress = totalSquares + config.finalPathLength;

      if (targetProgress > maxProgress) {
        return;
      }

      let isGoalEntry = false;
      let targetPosition = 0;

      if (targetProgress === maxProgress) {
        isGoalEntry = true;
        targetPosition = 999;
      } else if (targetProgress > totalSquares) {
        const finalStep = targetProgress - totalSquares;
        targetPosition = 1000 + finalStep;
      } else {
        targetPosition = ((piece.position - 1 + steps) % totalSquares) + 1;
      }

      // Validar barreras en el camino
      const hasBarrierBlocking = this.isPathBlockedByBarrier(state, piece, steps, config);
      if (hasBarrierBlocking) return;

      // Validar barrera en la casilla destino
      if (targetPosition <= totalSquares) {
        const piecesAtTarget = Object.values(state.pieces).filter(
          (p) => p.position === targetPosition && (p.state === 'ON_BOARD' || p.state === 'SAFE')
        );
        if (piecesAtTarget.length >= 2) return;

        const isSafeSquare = config.safeSquares.includes(targetPosition);
        const isCapture = piecesAtTarget.length === 1 && piecesAtTarget[0].color !== color && !isSafeSquare;

        moves.push({
          pieceId: piece.id,
          fromPosition: piece.position,
          toPosition: targetPosition,
          steps,
          isCapture,
          isGoalEntry: false,
        });
      } else {
        moves.push({
          pieceId: piece.id,
          fromPosition: piece.position,
          toPosition: targetPosition,
          steps,
          isCapture: false,
          isGoalEntry,
        });
      }
    });

    return moves;
  }

  private isPathBlockedByBarrier(
    state: ParchisState,
    piece: ParchisPiece,
    steps: number,
    config: typeof BOARD_CONFIG_4 | typeof BOARD_CONFIG_6
  ): boolean {
    const total = config.totalTrackSquares;
    for (let s = 1; s < steps; s++) {
      const intermediatePos = ((piece.position - 1 + s) % total) + 1;
      const piecesThere = Object.values(state.pieces).filter(
        (p) => p.position === intermediatePos && (p.state === 'ON_BOARD' || p.state === 'SAFE')
      );
      if (piecesThere.length >= 2) {
        return true;
      }
    }
    return false;
  }

  private advanceToNextTurn(state: ParchisState): ParchisState {
    const order = state.playerOrder;
    const currentIdx = order.indexOf(state.currentTurnUserId);
    const nextIdx = (currentIdx + 1) % order.length;
    const nextUserId = order[nextIdx];
    const nextPlayer = state.players[nextUserId];
    const nextColor = nextPlayer ? nextPlayer.colors[0] : state.activeColor;
    const now = Date.now();

    return {
      ...state,
      currentTurnUserId: nextUserId,
      turnUserId: nextUserId,
      activeColor: nextColor,
      turnPhase: 'ROLL_DICE',
      diceValue: null,
      consecutiveSixes: 0,
      legalMoves: [],
      pendingBonus: null,
      turnStartedAt: now,
      turnDeadlineAt: now + 30000,
    };
  }

  private handleTimeout(state: ParchisState): ActionResult<ParchisState> {
    const player = state.players[state.currentTurnUserId];
    const updatedLives = { ...state.lives };
    const currentLives = (updatedLives[state.currentTurnUserId] ?? 3) - 1;
    updatedLives[state.currentTurnUserId] = Math.max(0, currentLives);

    if (currentLives <= 0) {
      const order = state.playerOrder.filter((id) => id !== state.currentTurnUserId);
      const winnerId = order[0] || null;
      const winnerPlayer = winnerId ? state.players[winnerId] : null;

      return {
        newState: {
          ...state,
          status: 'game_won',
          lives: updatedLives,
          winnerUserId: winnerId,
          winnerTeam: winnerPlayer?.team || null,
          lastActionDescription: `Tiempo agotado para ${player?.name || 'el jugador'}. Partida finalizada.`,
        },
        isValid: true,
        isGameOver: true,
        winnerUserId: winnerId,
        winnerTeamIndex: winnerPlayer?.team === 'A' ? 0 : winnerPlayer?.team === 'B' ? 1 : null,
        isDraw: false,
      };
    }

    let nextState: ParchisState = {
      ...state,
      lives: updatedLives,
      lastActionDescription: `¡Tiempo agotado para ${player?.name || 'el jugador'}! Pierde una vida (${currentLives} restantes).`,
    };

    if (state.turnPhase === 'SELECT_PIECE' && state.legalMoves.length > 0) {
      const autoMove = state.legalMoves[0];
      return this.executePieceMove(nextState, autoMove);
    }

    nextState = this.advanceToNextTurn(nextState);

    return {
      newState: nextState,
      isValid: true,
      isGameOver: nextState.status === 'game_won',
      winnerUserId: nextState.winnerUserId,
      winnerTeamIndex: nextState.winnerTeam === 'A' ? 0 : nextState.winnerTeam === 'B' ? 1 : null,
      isDraw: false,
    };
  }

  private checkWinCondition(state: ParchisState, pieces: Record<string, ParchisPiece>): boolean {
    const mode = state.mode;

    if (mode === 'SIX_PIECES') {
      const colors: ParchisColor[] = ['yellow', 'red', 'blue', 'green'];
      for (const col of colors) {
        const finishedCount = Object.values(pieces).filter(
          (p) => p.color === col && p.state === 'FINISHED'
        ).length;
        if (finishedCount >= 6) return true;
      }
      return false;
    }

    const activePlayer = state.players[state.currentTurnUserId];
    const playerColors = activePlayer.colors;

    const allFinished = Object.values(pieces)
      .filter((p) => playerColors.includes(p.color))
      .every((p) => p.state === 'FINISHED');

    return allFinished;
  }

  public getSanitizedStateForPlayer(state: ParchisState, _userId: string): ParchisState {
    return state;
  }

  public getBotMove(state: ParchisState, userId: string): GameActionPayload | null {
    if (state.currentTurnUserId !== userId || state.status !== 'playing') return null;
    if (state.turnPhase === 'ROLL_DICE' || state.diceValue === null) {
      return {
        sessionId: '',
        userId,
        actionType: 'ROLL_DICE',
        actionData: {},
        clientTimestamp: Date.now(),
      };
    }
    if (state.legalMoves && state.legalMoves.length > 0) {
      return {
        sessionId: '',
        userId,
        actionType: 'MOVE_PIECE',
        actionData: { pieceId: state.legalMoves[0].pieceId },
        clientTimestamp: Date.now(),
      };
    }
    return {
      sessionId: '',
      userId,
      actionType: 'PASS_TURN',
      actionData: {},
      clientTimestamp: Date.now(),
    };
  }
}
