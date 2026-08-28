// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: ATRAPAÍTO (PARCHÍS / LUDO VENEZOLANO)
// ==============================================================================
// Motor determinista y autorizado por servidor para las 5 modalidades de Atrapaíto:
// 1. Individual a 4 (4 jugadores, 4 colores, 4 fichas/color)
// 2. Parejas a 4 (2v2: Amarillo+Rojo vs Azul+Verde)
// 3. 1 contra 1 (2 jugadores, 2 colores/jugador)
// 4. 6 Fichas (2 jugadores, 6 fichas/color, 3 salen en casillas seguras)
// 5. 3 contra 3 (6 jugadores, 6 colores, 2 equipos)
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type {
  AtrapaitoState,
  AtrapaitoMode,
  AtrapaitoColor,
  AtrapaitoPiece,
  AtrapaitoPlayer,
  AtrapaitoLegalMove,
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
  } as Record<AtrapaitoColor, number>,
  finalEntrySquares: {
    yellow: 68,
    blue: 17,
    red: 34,
    green: 51,
  } as Record<AtrapaitoColor, number>,
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
  } as Record<AtrapaitoColor, number>,
  finalEntrySquares: {
    yellow: 102,
    red: 17,
    orange: 34,
    blue: 51,
    green: 68,
    cyan: 85,
  } as Record<AtrapaitoColor, number>,
  safeSquares: [5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68, 73, 80, 85, 90, 97, 102],
  finalPathLength: 8,
};

export class AtrapaitoEngine implements IGameEngine<AtrapaitoState> {
  public readonly gameType = 'atrapaito';

  public initialize(table: GameTable, players: TablePlayer[]): AtrapaitoState {
    const cfg = (table.config || {}) as Record<string, any>;
    const rawMode = (cfg.atrapaitoMode || cfg.mode || table.mode || 'INDIVIDUAL_4') as string;
    let mode: AtrapaitoMode = 'INDIVIDUAL_4';

    if (players.length === 6) {
      mode = 'THREE_VS_THREE';
    } else if (players.length === 2) {
      mode = rawMode === 'SIX_PIECES' ? 'SIX_PIECES' : 'ONE_VS_ONE';
    } else if (players.length === 4) {
      mode = rawMode === 'PAIRS_4' ? 'PAIRS_4' : 'INDIVIDUAL_4';
    }

    const boardType = mode === 'THREE_VS_THREE' ? '6_COLORS' : '4_COLORS';
    const config = boardType === '6_COLORS' ? BOARD_CONFIG_6 : BOARD_CONFIG_4;

    const playerMap: Record<string, AtrapaitoPlayer> = {};
    const playerNames: Record<string, string> = {};
    const livesMap: Record<string, number> = {};
    const playerOrder: string[] = players.map((p) => p.userId);

    const colorsAssigned: Record<string, AtrapaitoColor[]> = {};
    const teamsAssigned: Record<string, 'A' | 'B' | null> = {};

    if (mode === 'INDIVIDUAL_4') {
      const colors: AtrapaitoColor[] = ['yellow', 'blue', 'red', 'green'];
      players.forEach((p, idx) => {
        colorsAssigned[p.userId] = [colors[idx % 4]];
        teamsAssigned[p.userId] = null;
      });
    } else if (mode === 'PAIRS_4') {
      const colors: AtrapaitoColor[] = ['yellow', 'blue', 'red', 'green'];
      players.forEach((p, idx) => {
        colorsAssigned[p.userId] = [colors[idx % 4]];
        teamsAssigned[p.userId] = idx % 2 === 0 ? 'A' : 'B';
      });
    } else if (mode === 'ONE_VS_ONE' || mode === 'SIX_PIECES') {
      if (players.length >= 2) {
        colorsAssigned[players[0].userId] = ['yellow', 'red'];
        teamsAssigned[players[0].userId] = 'A';
        colorsAssigned[players[1].userId] = ['blue', 'green'];
        teamsAssigned[players[1].userId] = 'B';
      }
    } else if (mode === 'THREE_VS_THREE') {
      const colors: AtrapaitoColor[] = ['yellow', 'blue', 'red', 'green', 'orange', 'cyan'];
      players.forEach((p, idx) => {
        colorsAssigned[p.userId] = [colors[idx % 6]];
        teamsAssigned[p.userId] = idx % 2 === 0 ? 'A' : 'B';
      });
    }

    players.forEach((p, idx) => {
      const pName = p.displayName?.trim() || `Jugador ${idx + 1}`;
      playerNames[p.userId] = pName;
      livesMap[p.userId] = 3;

      playerMap[p.userId] = {
        userId: p.userId,
        name: pName,
        colors: colorsAssigned[p.userId] || ['yellow'],
        team: teamsAssigned[p.userId] || null,
        seat: p.seatNumber || idx + 1,
        lives: 3,
        status: 'active',
      };
    });

    const piecesMap: Record<string, AtrapaitoPiece> = {};
    const activeColors: AtrapaitoColor[] =
      boardType === '6_COLORS'
        ? ['yellow', 'blue', 'red', 'green', 'orange', 'cyan']
        : ['yellow', 'blue', 'red', 'green'];

    const piecesPerColor = mode === 'SIX_PIECES' ? 6 : 4;

    activeColors.forEach((color) => {
      for (let i = 1; i <= piecesPerColor; i++) {
        const pieceId = `${color}_${i}`;
        let pieceState: AtrapaitoPiece['state'] = 'HOME';
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

  public validateAction(state: AtrapaitoState, action: GameActionPayload): { valid: boolean; reason?: string } {
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

  public applyAction(state: AtrapaitoState, action: GameActionPayload): ActionResult<AtrapaitoState> {
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
      const dice = (action.actionData.diceValue as number) || Math.floor(Math.random() * 6) + 1;
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
          diceValue: 6,
          turnPhase: 'TURN_ENDED',
          lastActionDescription: desc,
        });

        return {
          newState: nextState,
          isValid: true,
          isGameOver: nextState.status === 'game_won',
          winnerUserId: nextState.winnerUserId,
          winnerTeamIndex: nextState.winnerTeam === 'A' ? 0 : nextState.winnerTeam === 'B' ? 1 : null,
          isDraw: false,
        };
      }

      const legalMoves = this.calculateLegalMoves(state, dice, state.activeColor, false);

      if (legalMoves.length === 0) {
        if (dice === 6 && consecutiveSixes < 3) {
          const updatedState: AtrapaitoState = {
            ...state,
            diceValue: 6,
            consecutiveSixes,
            turnPhase: 'ROLL_DICE',
            legalMoves: [],
            lastActionDescription: 'Sacaste 6 sin movimientos posibles. ¡Vuelves a lanzar el dado!',
            turnStartedAt: now,
            turnDeadlineAt: now + 30000,
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

        const nextState = this.advanceToNextTurn({
          ...state,
          diceValue: dice,
          consecutiveSixes: 0,
          turnPhase: 'TURN_ENDED',
          legalMoves: [],
          lastActionDescription: `Sacaste un ${dice}. Sin movimientos legales disponibles.`,
        });

        return {
          newState: nextState,
          isValid: true,
          isGameOver: nextState.status === 'game_won',
          winnerUserId: nextState.winnerUserId,
          winnerTeamIndex: nextState.winnerTeam === 'A' ? 0 : nextState.winnerTeam === 'B' ? 1 : null,
          isDraw: false,
        };
      }

      const updatedState: AtrapaitoState = {
        ...state,
        diceValue: dice,
        consecutiveSixes,
        turnPhase: 'SELECT_PIECE',
        legalMoves,
        lastActionDescription: `Sacaste un ${dice}. ${legalMoves.length} movimiento(s) disponible(s).`,
        turnStartedAt: now,
        turnDeadlineAt: now + 30000,
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

    if (action.actionType === 'MOVE_PIECE' || action.actionType === 'SELECT_PIECE') {
      const pieceId = (action.actionData.pieceId || action.actionData.cardId) as string;
      const move = state.legalMoves.find((m) => m.pieceId === pieceId);

      if (!move) {
        return {
          newState: state,
          isValid: false,
          errorMessage: 'Movimiento no válido.',
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
      errorMessage: 'Acción no soportada',
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  private executePieceMove(state: AtrapaitoState, move: AtrapaitoLegalMove): ActionResult<AtrapaitoState> {
    const config = state.boardType === '6_COLORS' ? BOARD_CONFIG_6 : BOARD_CONFIG_4;
    const pieces = { ...state.pieces };
    const movingPiece = { ...pieces[move.pieceId] };
    const player = state.players[state.currentTurnUserId];

    let lastDesc = '';
    let bonusType: 'CAPTURE_20' | 'GOAL_10' | null = null;
    let bonusSteps = 0;

    movingPiece.position = move.toPosition;
    movingPiece.pathProgress += move.steps;

    if (move.isExitMove) {
      movingPiece.state = 'ON_BOARD';
      lastDesc = `¡Ficha de ${movingPiece.color} salió a la casilla de salida!`;
    } else if (move.isGoalEntry) {
      movingPiece.state = 'FINISHED';
      movingPiece.position = 999;
      lastDesc = `¡Ficha de ${movingPiece.color} ha llegado a la META! (+10 pasos de bonus)`;
      bonusType = 'GOAL_10';
      bonusSteps = 10;
    } else {
      const isFinalPath = move.toPosition >= 101 && move.toPosition <= 108;
      movingPiece.state = isFinalPath
        ? 'FINAL_PATH'
        : config.safeSquares.includes(move.toPosition)
        ? 'SAFE'
        : 'ON_BOARD';

      lastDesc = `Avanzó ${move.steps} casilla(s) con ficha ${movingPiece.color}.`;
    }

    pieces[move.pieceId] = movingPiece;

    if (
      !move.isExitMove &&
      !move.isGoalEntry &&
      movingPiece.position <= config.totalTrackSquares &&
      !config.safeSquares.includes(movingPiece.position)
    ) {
      Object.keys(pieces).forEach((otherId) => {
        if (otherId === move.pieceId) return;
        const other = pieces[otherId];
        if (other.position === movingPiece.position && other.state !== 'HOME' && other.state !== 'FINISHED') {
          const isEnemy = !player.colors.includes(other.color);
          if (isEnemy) {
            pieces[otherId] = {
              ...other,
              state: 'HOME',
              position: 0,
              pathProgress: 0,
            };
            bonusType = 'CAPTURE_20';
            bonusSteps = 20;
            lastDesc = `¡CAPTURÓ una ficha enemiga en la casilla ${movingPiece.position}! (+20 pasos de bonus)`;
          }
        }
      });
    }

    const isWin = this.checkWinCondition(state, pieces);
    if (isWin) {
      const winnerUserId = state.currentTurnUserId;
      const winnerTeam = player.team;
      const nextState: AtrapaitoState = {
        ...state,
        pieces,
        status: 'game_won',
        winnerUserId,
        winnerTeam,
        lastActionDescription: `¡VICTORIA! ${player.name} ha ganado la partida de Atrapaíto.`,
      };

      return {
        newState: nextState,
        isValid: true,
        isGameOver: true,
        winnerUserId,
        winnerTeamIndex: winnerTeam === 'A' ? 0 : winnerTeam === 'B' ? 1 : null,
        isDraw: false,
      };
    }

    if (bonusType) {
      const bonusColor = movingPiece.color;
      const bonusLegalMoves = this.calculateLegalMoves(
        { ...state, pieces },
        bonusSteps,
        bonusColor,
        true
      );

      if (bonusLegalMoves.length > 0) {
        const nextState: AtrapaitoState = {
          ...state,
          pieces,
          turnPhase: 'BONUS_MOVE',
          lastMovedPieceId: movingPiece.id,
          pendingBonus: { type: bonusType, bonusSteps, color: bonusColor },
          legalMoves: bonusLegalMoves,
          lastActionDescription: `${lastDesc} Selecciona una ficha para aplicar el bonus +${bonusSteps}.`,
        };
        return {
          newState: nextState,
          isValid: true,
          isGameOver: false,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }
    }

    if (state.diceValue === 6 && state.consecutiveSixes < 3) {
      const nextState: AtrapaitoState = {
        ...state,
        pieces,
        turnPhase: 'ROLL_DICE',
        lastMovedPieceId: movingPiece.id,
        pendingBonus: null,
        legalMoves: [],
        lastActionDescription: `${lastDesc} ¡Sacaste un 6, vuelve a lanzar el dado!`,
        turnStartedAt: Date.now(),
        turnDeadlineAt: Date.now() + 30000,
      };
      return {
        newState: nextState,
        isValid: true,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    const nextState = this.advanceToNextTurn({
      ...state,
      pieces,
      lastMovedPieceId: movingPiece.id,
      pendingBonus: null,
      lastActionDescription: lastDesc,
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

  private calculateLegalMoves(
    state: AtrapaitoState,
    steps: number,
    color: AtrapaitoColor,
    isBonus: boolean
  ): AtrapaitoLegalMove[] {
    const config = state.boardType === '6_COLORS' ? BOARD_CONFIG_6 : BOARD_CONFIG_4;
    const legalMoves: AtrapaitoLegalMove[] = [];
    const player = state.players[state.currentTurnUserId];

    const allowedColors: AtrapaitoColor[] = [color];

    if (state.mode === 'PAIRS_4' || state.mode === 'THREE_VS_THREE') {
      const ownColors = player.colors;
      const ownPiecesOut = Object.values(state.pieces).filter(
        (p) => ownColors.includes(p.color) && p.state !== 'FINISHED'
      );
      if (ownPiecesOut.length === 0) {
        Object.values(state.players).forEach((otherP) => {
          if (otherP.team === player.team) {
            allowedColors.push(...otherP.colors);
          }
        });
      }
    }

    allowedColors.forEach((c) => {
      const pieces = Object.values(state.pieces).filter((p) => p.color === c && p.state !== 'FINISHED');

      pieces.forEach((piece) => {
        if (piece.state === 'HOME') {
          if (steps === 5 && !isBonus) {
            const exitPos = config.exitSquares[c];
            const piecesOnExit = Object.values(state.pieces).filter(
              (p) => p.position === exitPos && p.state !== 'HOME' && p.state !== 'FINISHED'
            );
            const ownBarrier = piecesOnExit.filter((p) => p.color === c).length >= 2;

            if (!ownBarrier) {
              legalMoves.push({
                pieceId: piece.id,
                fromPosition: 0,
                toPosition: exitPos,
                steps: 5,
                isExitMove: true,
              });
            }
          }
          return;
        }

        let moveSteps = steps;
        if (steps === 6 && !isBonus) {
          const allOut = Object.values(state.pieces)
            .filter((p) => p.color === c)
            .every((p) => p.state !== 'HOME');
          if (allOut) {
            moveSteps = 7;
          }
        }

        const maxPath = config.totalTrackSquares + config.finalPathLength + 1;
        const targetProgress = piece.pathProgress + moveSteps;

        if (targetProgress > maxPath) return;

        let targetPos = 0;
        let isGoalEntry = false;

        if (targetProgress === maxPath) {
          targetPos = 999;
          isGoalEntry = true;
        } else if (targetProgress > config.totalTrackSquares) {
          const finalOffset = targetProgress - config.totalTrackSquares;
          targetPos = 100 + finalOffset;
        } else {
          const exitSquare = config.exitSquares[c];
          targetPos = ((exitSquare - 1 + targetProgress - 1) % config.totalTrackSquares) + 1;
        }

        const hasBarrier = this.checkBarrierOnPath(state, targetPos);
        if (!hasBarrier) {
          legalMoves.push({
            pieceId: piece.id,
            fromPosition: piece.position,
            toPosition: targetPos,
            steps: moveSteps,
            isGoalEntry,
          });
        }
      });
    });

    return legalMoves;
  }

  private checkBarrierOnPath(state: AtrapaitoState, targetPos: number): boolean {
    const config = state.boardType === '6_COLORS' ? BOARD_CONFIG_6 : BOARD_CONFIG_4;

    if (targetPos <= config.totalTrackSquares) {
      const piecesOnTarget = Object.values(state.pieces).filter(
        (p) => p.position === targetPos && p.state !== 'HOME' && p.state !== 'FINISHED'
      );
      if (piecesOnTarget.length >= 2) return true;
    }

    return false;
  }

  private advanceToNextTurn(state: AtrapaitoState): AtrapaitoState {
    const playerOrder = state.playerOrder;
    const currentIdx = playerOrder.indexOf(state.currentTurnUserId);
    const nextIdx = (currentIdx + 1) % playerOrder.length;
    const nextUserId = playerOrder[nextIdx];
    const nextPlayer = state.players[nextUserId];
    const nextColor = nextPlayer?.colors[0] || 'yellow';
    const now = Date.now();

    return {
      ...state,
      currentTurnUserId: nextUserId,
      turnUserId: nextUserId,
      activeColor: nextColor,
      turnPhase: 'ROLL_DICE',
      diceValue: null,
      consecutiveSixes: 0,
      pendingBonus: null,
      legalMoves: [],
      turnStartedAt: now,
      turnDeadlineAt: now + 30000,
    };
  }

  private handleTimeout(state: AtrapaitoState): ActionResult<AtrapaitoState> {
    const currentUserId = state.currentTurnUserId;
    const livesMap = { ...state.lives };
    const currentLives = (livesMap[currentUserId] ?? 3) - 1;
    livesMap[currentUserId] = Math.max(0, currentLives);

    const playersMap = { ...state.players };
    if (playersMap[currentUserId]) {
      playersMap[currentUserId] = {
        ...playersMap[currentUserId],
        lives: livesMap[currentUserId],
        status: currentLives <= 0 ? 'eliminated' : 'active',
      };
    }

    let nextState: AtrapaitoState = {
      ...state,
      lives: livesMap,
      players: playersMap,
      lastActionDescription: `¡Tiempo agotado para ${state.playerNames[currentUserId]}! Pierde 1 vida (Restantes: ${currentLives}).`,
    };

    if (state.legalMoves.length > 0) {
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

  private checkWinCondition(state: AtrapaitoState, pieces: Record<string, AtrapaitoPiece>): boolean {
    const mode = state.mode;

    if (mode === 'SIX_PIECES') {
      const colors: AtrapaitoColor[] = ['yellow', 'red', 'blue', 'green'];
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

  public getSanitizedStateForPlayer(state: AtrapaitoState, _userId: string): AtrapaitoState {
    return state;
  }
}
