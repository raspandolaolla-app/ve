// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE BINGO (75 Y 90 BOLAS / QUINIELA)
// ==============================================================================
// • SIN cartones por defecto: los jugadores COMPRAN (1-20) durante la venta
// • Modalidad desde table.config.bingoMode (75 | 90), por defecto 90
// • Cartón 90 bolas = QUINIELA: 3 filas x 9 columnas, 15 números, 4 vacíos/fila
// • Cartón 75 bolas = 5x5 con centro libre
// • Compatible con RNG autoritativo de Supabase (DRAW_BALL recibe ball del servidor)
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
  grid[2][2] = 0; // centro libre
  return { id, grid };
};

const genCard90 = (id: string) => {
  // Quiniela: 3x9, 15 números (5 por fila), columnas por decena
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

  public validateAction(state: any, action: GameActionPayload): { valid: boolean; reason?: string } {
    const t = action.actionType;
    if (t === 'BUY_CARDS') {
      if (state.status !== 'SALES') return { valid: false, reason: 'La venta de cartones está cerrada.' };
      const owned = state.players?.[action.userId]?.cards?.length || 0;
      const count = Number(action.actionData?.count) || 0;
      if (count < 1 || owned + count > state.maxCardsPerPlayer) return { valid: false, reason: 'Límite de 20 cartones por jugador.' };
      return { valid: true };
    }
    if (t === 'CLOSE_SALES') {
      if (action.userId !== state.hostUserId) return { valid: false, reason: 'Solo el anfitrión cierra la venta.' };
      return { valid: true };
    }
    if (t === 'DRAW_BALL') {
      if (state.status !== 'PLAYING' && state.status !== 'SALES') return { valid: false, reason: 'La partida no está activa.' };
      const ball = Number(action.actionData?.ball);
      if (!ball || state.drawnBalls.includes(ball)) return { valid: false, reason: 'Balota ya cantada.' };
      return { valid: true };
    }
    if (t === 'MARK_NUMBER') return { valid: true };
    if (t === 'CLAIM_BINGO') return { valid: state.status === 'PLAYING' ? true : false, reason: 'Partida no activa.' };
    return { valid: false, reason: `Acción no soportada: ${t}` };
  }

  public applyAction(state: any, action: GameActionPayload): ActionResult<any> {
    const v = this.validateAction(state, action);
    if (!v.valid) {
      return { newState: state, isValid: false, errorMessage: v.reason, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }
    const next = JSON.parse(JSON.stringify(state));
    const t = action.actionType;

    if (t === 'BUY_CARDS') {
      const count = Number(action.actionData?.count) || 1;
      const p = next.players[action.userId];
      for (let i = 0; i < count; i++) {
        const id = `card_${action.userId}_${Date.now()}_${i}`;
        p.cards.push(next.mode === 75 ? genCard75(id) : genCard90(id));
      }
      next.lastActionLog = `🎫 ${p.name} compró ${count} cartón(es) → ${p.cards.length}`;
      return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    if (t === 'CLOSE_SALES') {
      next.salesClosed = true;
      next.status = 'PLAYING';
      next.lastActionLog = '🔔 ¡Venta cerrada! Comienza el sorteo';
      return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    if (t === 'DRAW_BALL') {
      if (next.status === 'SALES') {
        next.status = 'PLAYING';
        next.salesClosed = true;
        next.lastActionLog = '🔔 ¡Venta cerrada! Comienza el sorteo';
      }
      const ball = Number(action.actionData?.ball);
      next.drawnBalls.push(ball);
      next.currentBall = ball;
      next.lastActionLog = `🎱 Balota cantada: ${ball}`;
      const done = next.drawnBalls.length >= next.mode;
      return { newState: next, isValid: true, isGameOver: done, winnerUserId: done ? next.winnerUserId : null, winnerTeamIndex: null, isDraw: done && !next.winnerUserId };
    }

    if (t === 'CLAIM_BINGO') {
      const p = next.players[action.userId];
      const called = new Set(next.drawnBalls);
      const full = (p?.cards || []).some((card: any) => {
        let ok = true, any = false;
        card.grid.forEach((row: any[]) => row.forEach((val: any) => {
          const n = Number(val);
          if (n > 0) { any = true; if (!called.has(n)) ok = false; }
        }));
        return any && ok;
      });
      if (full) {
        next.status = 'FINISHED';
        next.winnerUserId = action.userId;
        next.lastActionLog = `🏆 ¡BINGO! ${p.name} gana con cartón lleno`;
        return { newState: next, isValid: true, isGameOver: true, winnerUserId: action.userId, winnerTeamIndex: null, isDraw: false };
      }
      return { newState: state, isValid: false, errorMessage: 'Aún no tienes cartón lleno.', isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
  }

  public getSanitizedStateForPlayer(state: any, userId: string): any {
    const sanitized = JSON.parse(JSON.stringify(state));
    Object.keys(sanitized.players || {}).forEach((uid) => {
      if (uid !== userId) {
        sanitized.players[uid].cardCount = sanitized.players[uid].cards?.length || 0;
        sanitized.players[uid].cards = [];
      }
    });
    return sanitized;
  }
}
