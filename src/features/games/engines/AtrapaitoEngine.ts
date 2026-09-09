// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: ATRAPAÍTO CRIOLLO
// ==============================================================================
// Motor determinista y autorizado por servidor para Atrapaíto Criollo tradicional:
// Tablero de 15 filas x 8 columnas, 10 muros por jugador, canicas Azul y Roja.
// El objetivo es llegar a la fila 0 (meta) bloqueando al rival con muros tácticos
// sin encerrar completamente a ningún jugador (siempre debe existir camino a la meta).
//
// NOTA CRÍTICA: Atrapaíto Criollo NO ES Parchís ni Ludo. Son juegos completamente distintos.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type {
  AtrapaitoCriolloState,
  AtrapaitoPosition,
  AtrapaitoWall,
  GameActionPayload,
} from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

export const COLS = 8;
export const ROWS = 15;
export const INITIAL_WALLS = 10;

export class AtrapaitoEngine implements IGameEngine<AtrapaitoCriolloState> {
  public readonly gameType = 'atrapaito';

  public initialize(table: GameTable, players: TablePlayer[]): AtrapaitoCriolloState {
    const uniquePlayers = Array.from(
      new Map(
        players.map((player) => [
          (player as any).user_id || player.userId,
          player,
        ])
      ).values()
    ).sort((a, b) => (a.seatNumber ?? 1) - (b.seatNumber ?? 1));

    const blueUserId = uniquePlayers[0]?.userId || null;
    const redUserId = uniquePlayers[1]?.userId || null;
    const now = Date.now();

    const livesMap: Record<string, number> = {};
    if (blueUserId) livesMap[blueUserId] = 3;
    if (redUserId) livesMap[redUserId] = 3;

    return {
      bluePos: { col: 4, row: 14 },
      redPos: { col: 3, row: 14 },
      walls: [],
      blueWalls: INITIAL_WALLS,
      redWalls: INITIAL_WALLS,
      turn: 'BLUE',
      action: 'MOVE',
      wallOrientation: 'HORIZONTAL',
      pendingWall: null,
      winner: null,
      mode: 'ONLINE',
      isAiThinking: false,
      consecutiveDraws: 0,
      blueUserId,
      redUserId,
      currentTurnUserId: blueUserId,
      turnUserId: blueUserId,
      turnDurationSeconds: 15,
      turnStartedAt: now as any,
      turnDeadlineAt: (now + 15000) as any,
      turnExpiresAt: new Date(now + 15000).toISOString(),
      boardType: 'CRIOLLO_WALLS',
      status: 'playing',
      lives: livesMap,
    };
  }

  public validateAction(state: AtrapaitoCriolloState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.winner !== null || state.status === 'game_won' || state.status === 'cancelled') {
      return { valid: false, reason: 'La partida ya ha finalizado.' };
    }

    if (action.actionType === 'TIMEOUT_AUTO_MOVE' || action.actionType === 'PLAYER_TIMEOUT') {
      return { valid: true };
    }

    // Validar turno de usuario
    if (state.currentTurnUserId && action.userId !== state.currentTurnUserId) {
      return { valid: false, reason: 'No es tu turno de jugar.' };
    }

    const currentPos = state.turn === 'BLUE' ? state.bluePos : state.redPos;
    const opponentPos = state.turn === 'BLUE' ? state.redPos : state.bluePos;
    const wallsAvailable = state.turn === 'BLUE' ? state.blueWalls : state.redWalls;

    if (action.actionType === 'MOVE_MARBLE' || action.actionType === 'MOVE') {
      const targetCol = action.actionData?.col ?? action.actionData?.toCol;
      const targetRow = action.actionData?.row ?? action.actionData?.toRow;
      if (typeof targetCol !== 'number' || typeof targetRow !== 'number') {
        return { valid: false, reason: 'Coordenadas de movimiento inválidas.' };
      }

      const validMoves = this.getValidMoves(currentPos, opponentPos, state.walls);
      const isLegal = validMoves.some((m) => m.col === targetCol && m.row === targetRow);
      if (!isLegal) {
        return { valid: false, reason: 'Movimiento no permitido según las reglas de Atrapaíto Criollo.' };
      }
      return { valid: true };
    }

    if (action.actionType === 'PLACE_WALL' || action.actionType === 'WALL') {
      if (wallsAvailable <= 0) {
        return { valid: false, reason: 'No te quedan muros disponibles.' };
      }

      const col = action.actionData?.col;
      const row = action.actionData?.row;
      const isHorizontal = !!action.actionData?.isHorizontal;

      if (typeof col !== 'number' || typeof row !== 'number') {
        return { valid: false, reason: 'Coordenadas de muro inválidas.' };
      }

      const candidate: AtrapaitoWall = {
        col,
        row,
        isHorizontal,
        placedBy: state.turn,
      };

      if (!this.isValidWall(candidate, state.walls, state.bluePos, state.redPos)) {
        return { valid: false, reason: 'La colocación del muro bloquea el camino completo o se superpone a otro muro.' };
      }

      return { valid: true };
    }

    return { valid: false, reason: `Acción desconocida para Atrapaíto: ${action.actionType}` };
  }

  public applyAction(state: AtrapaitoCriolloState, action: GameActionPayload): ActionResult<AtrapaitoCriolloState> {
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
    const duration = (state.turnDurationSeconds || 15) * 1000;
    const nextDeadlineIso = new Date(now + duration).toISOString();

    if (action.actionType === 'TIMEOUT_AUTO_MOVE' || action.actionType === 'PLAYER_TIMEOUT') {
      return this.handleTimeout(state);
    }

    if (action.actionType === 'MOVE_MARBLE' || action.actionType === 'MOVE') {
      const targetCol = Number(action.actionData?.col ?? action.actionData?.toCol ?? 0);
      const targetRow = Number(action.actionData?.row ?? action.actionData?.toRow ?? 0);
      const newPos: AtrapaitoPosition = { col: targetCol, row: targetRow };

      const isBlue = state.turn === 'BLUE';
      const updatedBluePos = isBlue ? newPos : state.bluePos;
      const updatedRedPos = !isBlue ? newPos : state.redPos;

      // Verificar si llegó a la meta (fila 0)
      if (newPos.row === 0) {
        const winnerColor = state.turn;
        const winnerUserId = isBlue ? state.blueUserId : state.redUserId;

        return {
          newState: {
            ...state,
            bluePos: updatedBluePos,
            redPos: updatedRedPos,
            winner: winnerColor,
            status: 'game_won',
            action: 'MOVE',
            turnDeadlineAt: null as any,
            turnExpiresAt: null,
          },
          isValid: true,
          isGameOver: true,
          winnerUserId,
          winnerTeamIndex: isBlue ? 0 : 1,
          isDraw: false,
        };
      }

      // Rotar turno
      const nextTurn = isBlue ? 'RED' : 'BLUE';
      const nextUserId = isBlue ? state.redUserId : state.blueUserId;

      return {
        newState: {
          ...state,
          bluePos: updatedBluePos,
          redPos: updatedRedPos,
          turn: nextTurn,
          currentTurnUserId: nextUserId,
          turnUserId: nextUserId,
          action: 'MOVE',
          pendingWall: null,
          turnStartedAt: now as any,
          turnDeadlineAt: (now + duration) as any,
          turnExpiresAt: nextDeadlineIso,
        },
        isValid: true,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    if (action.actionType === 'PLACE_WALL' || action.actionType === 'WALL') {
      const col = Number(action.actionData?.col ?? 0);
      const row = Number(action.actionData?.row ?? 0);
      const isHorizontal = !!action.actionData?.isHorizontal;

      const isBlue = state.turn === 'BLUE';
      const candidate: AtrapaitoWall = {
        col,
        row,
        isHorizontal,
        placedBy: state.turn,
      };

      const updatedWalls = [...state.walls, candidate];
      const updatedBlueWalls = isBlue ? state.blueWalls - 1 : state.blueWalls;
      const updatedRedWalls = !isBlue ? state.redWalls - 1 : state.redWalls;

      const nextTurn = isBlue ? 'RED' : 'BLUE';
      const nextUserId = isBlue ? state.redUserId : state.blueUserId;

      return {
        newState: {
          ...state,
          walls: updatedWalls,
          blueWalls: updatedBlueWalls,
          redWalls: updatedRedWalls,
          turn: nextTurn,
          currentTurnUserId: nextUserId,
          turnUserId: nextUserId,
          action: 'MOVE',
          pendingWall: null,
          turnStartedAt: now as any,
          turnDeadlineAt: (now + duration) as any,
          turnExpiresAt: nextDeadlineIso,
        },
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
      errorMessage: 'Acción no reconocida.',
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  public getValidMoves(cur: AtrapaitoPosition, opp: AtrapaitoPosition, walls: AtrapaitoWall[]): AtrapaitoPosition[] {
    const valid: AtrapaitoPosition[] = [];
    const dirs = [
      [0, -1], // Norte
      [0, 1],  // Sur
      [-1, 0], // Oeste
      [1, 0],  // Este
    ];

    for (const [dc, dr] of dirs) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;

      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;

      const target = { col: nc, row: nr };

      if (!this.isMoveBlocked(cur, target, walls)) {
        if (target.col === opp.col && target.row === opp.row) {
          // Intento de salto sobre el rival
          const jc = target.col + dc;
          const jr = target.row + dr;
          if (jc >= 0 && jc < COLS && jr >= 0 && jr < ROWS) {
            const jumpTarget = { col: jc, row: jr };
            if (!this.isMoveBlocked(target, jumpTarget, walls)) {
              valid.push(jumpTarget);
              continue;
            }
          }
          // Si el salto frontal está bloqueado, saltos diagonales
          const diagDirs = dc === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
          for (const [ddc, ddr] of diagDirs) {
            const dnc = target.col + ddc;
            const dnr = target.row + ddr;
            if (dnc >= 0 && dnc < COLS && dnr >= 0 && dnr < ROWS) {
              const diagTarget = { col: dnc, row: dnr };
              if (!this.isMoveBlocked(target, diagTarget, walls)) {
                valid.push(diagTarget);
              }
            }
          }
        } else {
          valid.push(target);
        }
      }
    }

    return valid;
  }

  public isMoveBlocked(p1: AtrapaitoPosition, p2: AtrapaitoPosition, walls: AtrapaitoWall[]): boolean {
    const minC = Math.min(p1.col, p2.col);
    const maxC = Math.max(p1.col, p2.col);
    const minR = Math.min(p1.row, p2.row);
    const maxR = Math.max(p1.row, p2.row);

    if (p1.col === p2.col) {
      // Movimiento vertical
      for (const w of walls) {
        if (w.isHorizontal && w.row === minR) {
          if (w.col === minC || w.col === minC - 1) return true;
        }
      }
    } else if (p1.row === p2.row) {
      // Movimiento horizontal
      for (const w of walls) {
        if (!w.isHorizontal && w.col === minC) {
          if (w.row === minR || w.row === minR - 1) return true;
        }
      }
    }
    return false;
  }

  public canReachFinish(start: AtrapaitoPosition, walls: AtrapaitoWall[]): boolean {
    const queue: AtrapaitoPosition[] = [start];
    const visited: boolean[][] = Array.from({ length: COLS }, () => Array(ROWS).fill(false));
    visited[start.col][start.row] = true;

    const dirs = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr.row === 0) return true;

      for (const [dc, dr] of dirs) {
        const nc = curr.col + dc;
        const nr = curr.row + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (visited[nc][nr]) continue;

        const next = { col: nc, row: nr };
        if (!this.isMoveBlocked(curr, next, walls)) {
          visited[nc][nr] = true;
          queue.push(next);
        }
      }
    }
    return false;
  }

  public isValidWall(
    candidate: AtrapaitoWall,
    currentWalls: AtrapaitoWall[],
    bluePos: AtrapaitoPosition,
    redPos: AtrapaitoPosition
  ): boolean {
    if (candidate.col < 0 || candidate.col >= COLS - 1 || candidate.row < 0 || candidate.row >= ROWS - 1) {
      return false;
    }

    for (const w of currentWalls) {
      if (w.isHorizontal === candidate.isHorizontal) {
        if (candidate.isHorizontal && w.row === candidate.row) {
          if (w.col === candidate.col || w.col === candidate.col - 1 || w.col === candidate.col + 1) return false;
        } else if (!candidate.isHorizontal && w.col === candidate.col) {
          if (w.row === candidate.row || w.row === candidate.row - 1 || w.row === candidate.row + 1) return false;
        }
      } else {
        if (w.col === candidate.col && w.row === candidate.row) return false;
      }
    }

    const simulated = [...currentWalls, candidate];
    if (!this.canReachFinish(bluePos, simulated)) return false;
    if (!this.canReachFinish(redPos, simulated)) return false;

    return true;
  }

  private handleTimeout(state: AtrapaitoCriolloState): ActionResult<AtrapaitoCriolloState> {
    const isBlue = state.turn === 'BLUE';
    const currentUserId = isBlue ? state.blueUserId : state.redUserId;
    const opponentUserId = isBlue ? state.redUserId : state.blueUserId;

    const updatedLives = { ...(state.lives || {}) };
    const currentLives = ((currentUserId ? updatedLives[currentUserId] : 3) ?? 3) - 1;
    if (currentUserId) {
      updatedLives[currentUserId] = Math.max(0, currentLives);
    }

    if (currentLives <= 0) {
      const winnerColor = isBlue ? 'RED' : 'BLUE';
      return {
        newState: {
          ...state,
          status: 'game_won',
          lives: updatedLives,
          winner: winnerColor,
          currentTurnUserId: null,
          turnUserId: null,
        },
        isValid: true,
        isGameOver: true,
        winnerUserId: opponentUserId,
        winnerTeamIndex: isBlue ? 1 : 0,
        isDraw: false,
      };
    }

    const nextTurn = isBlue ? 'RED' : 'BLUE';
    const nextUserId = opponentUserId;
    const now = Date.now();
    const duration = (state.turnDurationSeconds || 15) * 1000;
    const nextDeadlineIso = new Date(now + duration).toISOString();

    return {
      newState: {
        ...state,
        lives: updatedLives,
        turn: nextTurn,
        currentTurnUserId: nextUserId,
        turnUserId: nextUserId,
        action: 'MOVE',
        pendingWall: null,
        turnStartedAt: now as any,
        turnDeadlineAt: (now + duration) as any,
        turnExpiresAt: nextDeadlineIso,
      },
      isValid: true,
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  public getSanitizedStateForPlayer(state: AtrapaitoCriolloState, _userId: string): AtrapaitoCriolloState {
    return state;
  }

  public getBotMove(state: AtrapaitoCriolloState, userId: string): GameActionPayload | null {
    if (state.currentTurnUserId !== userId || state.winner !== null) return null;
    const currentPos = state.turn === 'BLUE' ? state.bluePos : state.redPos;
    const opponentPos = state.turn === 'BLUE' ? state.redPos : state.bluePos;
    const moves = this.getValidMoves(currentPos, opponentPos, state.walls);

    if (moves.length > 0) {
      // Mover hacia la meta (menor fila)
      moves.sort((a, b) => a.row - b.row);
      const chosen = moves[0];
      return {
        sessionId: '',
        userId,
        actionType: 'MOVE_MARBLE',
        actionData: { col: chosen.col, row: chosen.row },
        clientTimestamp: Date.now(),
      };
    }
    return null;
  }
}
