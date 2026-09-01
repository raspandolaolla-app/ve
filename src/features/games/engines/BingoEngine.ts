// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE BINGO (RETROCOMPATIBLE)
// ==============================================================================
// • Funciona con ESTRUCTURA VIEJA: state.cards = { [userId]: [...] }
// • Funciona con ESTRUCTURA NUEVA: state.players[userId].cards = [...]
// • Soporta BUY_CARDS en ambas estructuras
// • Sin cartones por defecto: los jugadores COMPRAN (1-20) durante la venta
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const genCard75 = (id: string) => {
  const cols: number[][] = [];
  for (let c = 0; c < 5; c++) {
    const pool = shuffle(Array.from({ length: 15 }, (_, i) => c * 15 + 1 + i));
    cols.push(pool.slice(0, 5));
  }
  const grid: (number | null)[][] = [];
  for (let r = 0; r < 5; r++) grid.push(cols.map((col) => col[r]));
  grid[2][2] = 0;
  return { id, grid };
};

const genCard90 = (id: string) => {
  const chosen = shuffle(Array.from({ length: 90 }, (_, i) => i + 1)).slice(0, 15).sort((a, b) => a - b);
  const grid: (number | null)[][] = [Array(9).fill(null), Array(9).fill(null), Array(9).fill(null)];
  const rowCounts = [0, 0, 0];
  const colCounts = Array(9).fill(0);
  for (const n of chosen) {
    const col = Math.min(8, Math.floor((n - 1) / 10));
    let placed = false;
    for (let r = 0; r < 3; r++) {
      if (grid[r][col] === null && rowCounts[r] < 5 && colCounts[col] < 2) {
        grid[r][col] = n; rowCounts[r]++; colCounts[col]++; placed = true; break;
      }
    }
    if (!placed) {
      for (let r = 0; r < 3; r++) {
        if (rowCounts[r] < 5) {
          const c2 = grid[r].findIndex((x) => x === null);
          if (c2 !== -1) { grid[r][c2] = n; rowCounts[r]++; placed = true; break; }
        }
      }
    }
  }
  return { id, grid };
};

export class BingoEngine implements IGameEngine<any> {
  public readonly gameType = 'bingo';

  public initialize(table: GameTable, players: TablePlayer[]): any {
    const unique = Array.from(new Map(players.map((p) => [(p as any).user_id || p.userId, p])).values());
    const mode = Number((table.config as any)?.bingoMode || (table as any).bingoMode || 90) === 75 ? 75 : 90;

    // Detectar si usar estructura vieja o nueva
    const useLegacyStructure = true; // Por defecto usar la vieja para compatibilidad

    if (useLegacyStructure) {
      // ESTRUCTURA VIEJA: cards = { [userId]: [...] }
      const cards: Record<string, any[]> = {};
      unique.forEach((p: any) => {
        cards[p.userId] = [];
      });
      return {
        variant: mode === 90 ? '90' : '75',
        status: 'SALES',
        hostUserId: table.hostUserId,
        cards,
        cardsPurchased: {},
        playerNames: Object.fromEntries(unique.map((p: any) => [p.userId, p.displayName || p.name || 'JUGADOR'])),
        drawnBalls: [],
        currentBall: null,
        callIntervalMs: 4000,
        totalBalls: mode,
        maxCardsPerPlayer: 20,
        cardPrice: Number((table.config as any)?.cardPrice ?? table.entryFee ?? 0),
        winnerUserId: null,
        lastActionLog: '🎫 Fase de venta: compra tus cartones',
      };
    } else {
      // ESTRUCTURA NUEVA: players = { [userId]: { cards: [] } }
      const playersRec: Record<string, any> = {};
      unique.forEach((p: any) => {
        playersRec[p.userId] = { userId: p.userId, name: p.displayName || p.name || 'JUGADOR', cards: [] };
      });
      return {
        mode,
        status: 'SALES',
        hostUserId: table.hostUserId,
        players: playersRec,
        drawnBalls: [],
        currentBall: null,
        salesClosed: false,
        maxCardsPerPlayer: 20,
        cardPrice: Number((table.config as any)?.cardPrice ?? table.entryFee ?? 0),
        autoDraw: false,
        winnerUserId: null,
        lastActionLog: '🎫 Fase de venta: compra tus cartones',
      };
    }
  }

  public validateAction(state: any, action: GameActionPayload): { valid: boolean; reason?: string } {
    const t = action.actionType;

    if (t === 'BUY_CARDS') {
      if (state.status !== 'SALES') return { valid: false, reason: 'La venta de cartones está cerrada.' };

      // Detectar estructura
      if (state.cards && typeof state.cards === 'object' && !Array.isArray(state.cards)) {
        // Estructura vieja
        const owned = state.cards[action.userId]?.length || 0;
        const count = Number(action.actionData?.count) || 0;
        if (count < 1 || owned + count > (state.maxCardsPerPlayer || 20)) {
          return { valid: false, reason: 'Límite de 20 cartones por jugador.' };
        }
        return { valid: true };
      } else if (state.players && state.players[action.userId]) {
        // Estructura nueva
        const owned = state.players[action.userId].cards?.length || 0;
        const count = Number(action.actionData?.count) || 0;
        if (count < 1 || owned + count > (state.maxCardsPerPlayer || 20)) {
          return { valid: false, reason: 'Límite de 20 cartones por jugador.' };
        }
        return { valid: true };
      }
      return { valid: false, reason: 'Estructura de estado no reconocida.' };
    }

    if (t === 'CLOSE_SALES') {
      if (action.userId !== state.hostUserId) return { valid: false, reason: 'Solo el anfitrión cierra la venta.' };
      return { valid: true };
    }

    if (t === 'DRAW_BALL') {
      if (state.status !== 'PLAYING' && state.status !== 'SALES') {
        return { valid: false, reason: 'La partida no está activa.' };
      }
      const ball = Number(action.actionData?.ball);
      if (!ball || state.drawnBalls.includes(ball)) return { valid: false, reason: 'Balota ya cantada.' };
      return { valid: true };
    }

    if (t === 'MARK_NUMBER') return { valid: true };

    if (t === 'CLAIM_BINGO') {
      return { valid: state.status === 'PLAYING', reason: 'Partida no activa.' };
    }

    return { valid: false, reason: `Acción no soportada: ${t}` };
  }

  public applyAction(state: any, action: GameActionPayload): ActionResult<any> {
    const v = this.validateAction(state, action);
    if (!v.valid) {
      return {
        newState: state,
        isValid: false,
        errorMessage: v.reason,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    const next = JSON.parse(JSON.stringify(state));
    const t = action.actionType;

    if (t === 'BUY_CARDS') {
      const count = Number(action.actionData?.count) || 1;
      const mode = next.variant === '90' || next.mode === 90 ? 90 : 75;

      if (next.cards && typeof next.cards === 'object' && !Array.isArray(next.cards)) {
        // ESTRUCTURA VIEJA
        if (!next.cards[action.userId]) next.cards[action.userId] = [];
        for (let i = 0; i < count; i++) {
          const id = `card_${action.userId}_${Date.now()}_${i}`;
          next.cards[action.userId].push(mode === 75 ? genCard75(id) : genCard90(id));
        }
        if (!next.cardsPurchased) next.cardsPurchased = {};
        next.cardsPurchased[action.userId] = (next.cardsPurchased[action.userId] || 0) + count;
      } else if (next.players && next.players[action.userId]) {
        // ESTRUCTURA NUEVA
        const p = next.players[action.userId];
        for (let i = 0; i < count; i++) {
          const id = `card_${action.userId}_${Date.now()}_${i}`;
          p.cards.push(mode === 75 ? genCard75(id) : genCard90(id));
        }
      }

      next.lastActionLog = `🎫 Compraste ${count} cartón(es)`;
      return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    if (t === 'CLOSE_SALES') {
      if (next.salesClosed !== undefined) next.salesClosed = true;
      next.status = 'PLAYING';
      next.lastActionLog = '🔔 ¡Venta cerrada! Comienza el sorteo';
      return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    if (t === 'DRAW_BALL') {
      if (next.status === 'SALES') {
        next.status = 'PLAYING';
        if (next.salesClosed !== undefined) next.salesClosed = true;
        next.lastActionLog = '🔔 ¡Venta cerrada! Comienza el sorteo';
      }
      const ball = Number(action.actionData?.ball);
      next.drawnBalls.push(ball);
      next.currentBall = ball;
      next.lastActionLog = `🎱 Balota cantada: ${ball}`;
      const maxBalls = next.totalBalls || next.mode || 90;
      const done = next.drawnBalls.length >= maxBalls;
      return {
        newState: next,
        isValid: true,
        isGameOver: done,
        winnerUserId: done ? next.winnerUserId : null,
        winnerTeamIndex: null,
        isDraw: done && !next.winnerUserId,
      };
    }

    if (t === 'CLAIM_BINGO') {
      const called = new Set(next.drawnBalls);
      let hasBingo = false;

      if (next.cards && typeof next.cards === 'object' && !Array.isArray(next.cards)) {
        // Estructura vieja
        const userCards = next.cards[action.userId] || [];
        hasBingo = userCards.some((card: any) => {
          let ok = true, any = false;
          const grid = card.grid || card;
          if (Array.isArray(grid)) {
            grid.forEach((row: any[]) => row.forEach((val: any) => {
              const n = Number(val);
              if (n > 0) { any = true; if (!called.has(n)) ok = false; }
            }));
          }
          return any && ok;
        });
      } else if (next.players && next.players[action.userId]) {
        // Estructura nueva
        const p = next.players[action.userId];
        hasBingo = (p?.cards || []).some((card: any) => {
          let ok = true, any = false;
          card.grid.forEach((row: any[]) => row.forEach((val: any) => {
            const n = Number(val);
            if (n > 0) { any = true; if (!called.has(n)) ok = false; }
          }));
          return any && ok;
        });
      }

      if (hasBingo) {
        next.status = 'FINISHED';
        next.winnerUserId = action.userId;
        const playerName = next.playerNames?.[action.userId] || next.players?.[action.userId]?.name || 'Ganador';
        next.lastActionLog = `🏆 ¡BINGO! ${playerName} gana con cartón lleno`;
        return { newState: next, isValid: true, isGameOver: true, winnerUserId: action.userId, winnerTeamIndex: null, isDraw: false };
      }
      return { newState: state, isValid: false, errorMessage: 'Aún no tienes cartón lleno.', isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
  }

  public getSanitizedStateForPlayer(state: any, userId: string): any {
    const sanitized = JSON.parse(JSON.stringify(state));

    if (sanitized.cards && typeof sanitized.cards === 'object' && !Array.isArray(sanitized.cards)) {
      // Estructura vieja: ocultar cartas de otros jugadores
      Object.keys(sanitized.cards).forEach((uid) => {
        if (uid !== userId) {
          sanitized.cards[uid] = [];
        }
      });
    } else if (sanitized.players) {
      // Estructura nueva: ocultar cartas de otros jugadores
      Object.keys(sanitized.players).forEach((uid) => {
        if (uid !== userId) {
          sanitized.players[uid].cardCount = sanitized.players[uid].cards?.length || 0;
          sanitized.players[uid].cards = [];
        }
      });
    }

    return sanitized;
  }
}
