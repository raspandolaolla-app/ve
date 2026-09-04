// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE BINGO (RNG CLIENTE DETERMINÍSTICO)
// ==============================================================================
// • Los cartones NO se guardan en el estado: se regeneran determinísticamente
// • Solo se persiste el contador cardsPurchased (que se SUMA, no se pisa)
// • Todos los dispositivos regeneran los MISMOS cartones (semilla fija)
// • Soporta 75 y 90 bolas (quiniela)
// • RNG determinístico cliente (no depende de RPC de Supabase)
// • getSanitizedStateForPlayer PRESERVA hostUserId y cardsPurchased (público)
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

const hashString = (str: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWith = <T,>(arr: T[], rnd: () => number): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const genCard75 = (id: string, rnd: () => number) => {
  const cols: number[][] = [];
  for (let c = 0; c < 5; c++) {
    const pool = shuffleWith(Array.from({ length: 15 }, (_, i) => c * 15 + 1 + i), rnd);
    cols.push(pool.slice(0, 5));
  }
  const grid: (number | null)[][] = [];
  for (let r = 0; r < 5; r++) grid.push(cols.map((col) => col[r]));
  grid[2][2] = 0;
  return { id, grid };
};

const genCard90 = (id: string, rnd: () => number) => {
  const chosen = shuffleWith(Array.from({ length: 90 }, (_, i) => i + 1), rnd).slice(0, 15).sort((a, b) => a - b);
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

const regenerateAllCards = (state: any) => {
  if (!state.cards || typeof state.cards !== 'object') state.cards = {};
  const purchased = state.cardsPurchased || {};
  const is75 = state.variant === '75' || state.mode === 75;
  Object.keys(purchased).forEach((uid) => {
    const count = purchased[uid] || 0;
    const cards: any[] = [];
    for (let i = 0; i < count; i++) {
      const seed = hashString(`${state.seed}|${uid}|${i}`);
      const rnd = mulberry32(seed);
      cards.push(is75 ? genCard75(`card_${uid}_${i}`, rnd) : genCard90(`card_${uid}_${i}`, rnd));
    }
    state.cards[uid] = cards;
  });
};

// ✅ NUEVO: Genera la próxima bola determinísticamente basada en la semilla de la partida
// Esto garantiza que TODOS los jugadores vean la misma bola sin necesidad de RPC
const generateNextBall = (state: any): number => {
  const drawn = state.drawnBalls || [];
  const maxBalls = state.totalBalls || state.mode || 90;
  const available: number[] = [];
  for (let i = 1; i <= maxBalls; i++) {
    if (!drawn.includes(i)) available.push(i);
  }
  if (available.length === 0) return -1;
  // Semilla determinística: seed de la partida + número de bolas ya sacadas
  const seed = hashString(`${state.seed}|ball|${drawn.length}`);
  const rnd = mulberry32(seed);
  const idx = Math.floor(rnd() * available.length);
  return available[idx];
};

export class BingoEngine implements IGameEngine<any> {
  public readonly gameType = 'bingo';

  public initialize(table: GameTable, players: TablePlayer[]): any {
    const unique = Array.from(new Map(players.map((p) => [(p as any).user_id || p.userId, p])).values());
    const mode = Number((table.config as any)?.bingoMode || (table as any).bingoMode || 90) === 75 ? 75 : 90;

    const cards: Record<string, any[]> = {};
    const cardsPurchased: Record<string, number> = {};
    unique.forEach((p: any) => {
      cards[p.userId] = [];
      cardsPurchased[p.userId] = 0;
    });

    return {
      variant: mode === 90 ? '90' : '75',
      mode,
      status: 'SALES',
      hostUserId: table.hostUserId,
      seed: Math.floor(Math.random() * 1e9),
      cards,
      cardsPurchased,
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
  }

  public validateAction(state: any, action: GameActionPayload): { valid: boolean; reason?: string } {
    const t = action.actionType;

    if (t === 'BUY_CARDS') {
      const sStatus = String(state.status || '').toUpperCase();
      const hasDrawn = Array.isArray(state.drawnBalls) && state.drawnBalls.length > 0;
      const isSalesAllowed = !hasDrawn && (
        ['SALES', 'WAITING', 'READY', 'OPEN'].includes(sStatus) ||
        sStatus === 'IN_PROGRESS' ||
        sStatus === ''
      );
      if (!isSalesAllowed) return { valid: false, reason: 'La venta de cartones está cerrada.' };
      const owned = state.cardsPurchased?.[action.userId] || 0;
      const count = Number(action.actionData?.count) || 0;
      if (count < 1 || owned + count > (state.maxCardsPerPlayer || 20)) {
        return { valid: false, reason: 'Límite de 20 cartones por jugador.' };
      }
      return { valid: true };
    }

    if (t === 'CLOSE_SALES') {
      if (action.userId !== state.hostUserId) return { valid: false, reason: 'Solo el anfitrión cierra la venta.' };
      return { valid: true };
    }

    if (t === 'DRAW_BALL' || t === 'AUTO_DRAW_BALL' || t === 'SERVER_AUTO_DRAW') {
      const sStatus = String(state.status || '').toUpperCase();
      if (sStatus !== 'PLAYING' && sStatus !== 'SALES' && sStatus !== 'DRAWING' && sStatus !== 'IN_PROGRESS') {
        return { valid: false, reason: 'La partida no está activa.' };
      }
      const isSystemAction =
        action.userId === '00000000-0000-0000-0000-000000000000' ||
        Boolean(action.actionData?.serverSide) ||
        Boolean(action.actionData?.automated);
      if (!isSystemAction && state.hostUserId && action.userId !== state.hostUserId) {
        return { valid: false, reason: 'Solo el anfitrión o el servidor puede extraer balotas.' };
      }
      // Si ya se sacaron todas las bolas, no se puede sacar más
      const maxBalls = state.totalBalls || state.mode || 90;
      if ((state.drawnBalls || []).length >= maxBalls) {
        return { valid: false, reason: 'Ya se sacaron todas las bolas.' };
      }
      return { valid: true };
    }

    if (t === 'MARK_NUMBER') return { valid: true };

    if (t === 'CLAIM_BINGO') return { valid: state.status === 'PLAYING', reason: 'Partida no activa.' };

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
      if (!next.cardsPurchased) next.cardsPurchased = {};
      next.cardsPurchased[action.userId] = (next.cardsPurchased[action.userId] || 0) + count;
      regenerateAllCards(next);
      const playerName = next.playerNames?.[action.userId] || 'Jugador';
      next.lastActionLog = `🎫 ${playerName} compró ${count} cartón(es) → total ${next.cardsPurchased[action.userId]}`;
      return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    if (t === 'CLOSE_SALES') {
      next.status = 'PLAYING';
      next.lastActionLog = '🔔 ¡Venta cerrada! Comienza el sorteo';
      return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    if (t === 'DRAW_BALL' || t === 'AUTO_DRAW_BALL' || t === 'SERVER_AUTO_DRAW') {
      if (next.status === 'SALES') {
        next.status = 'PLAYING';
      }
      // Intentar usar la ball de actionData (si vino del RNG del servidor o RPC)
      let ball = Number(action.actionData?.ball || action.actionData?.ball_number);
      // Si no vino o es inválida, generarla determinísticamente
      if (!ball || !Number.isFinite(ball) || (next.drawnBalls || []).includes(ball)) {
        ball = generateNextBall(next);
      }
      if (ball && ball > 0) {
        next.drawnBalls = next.drawnBalls || [];
        next.drawnBalls.push(ball);
        next.currentBall = ball;
        next.lastActionLog = `🎱 Balota cantada: ${ball}`;
      }
      const maxBalls = next.totalBalls || next.mode || 90;
      const done = (next.drawnBalls?.length || 0) >= maxBalls;
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
      regenerateAllCards(next);
      const called = new Set(next.drawnBalls || []);
      const userCards = next.cards?.[action.userId] || [];
      const hasBingo = userCards.some((card: any) => {
        let ok = true, any = false;
        (card.grid || []).forEach((row: any[]) => row.forEach((val: any) => {
          const n = Number(val);
          if (n > 0) { any = true; if (!called.has(n)) ok = false; }
        }));
        return any && ok;
      });

      if (hasBingo) {
        next.status = 'FINISHED';
        next.winnerUserId = action.userId;
        const playerName = next.playerNames?.[action.userId] || 'Ganador';
        next.lastActionLog = `🏆 ¡BINGO! ${playerName} gana con cartón lleno`;
        return { newState: next, isValid: true, isGameOver: true, winnerUserId: action.userId, winnerTeamIndex: null, isDraw: false };
      }
      return { newState: state, isValid: false, errorMessage: 'Aún no tienes cartón lleno.', isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
    }

    return { newState: next, isValid: true, isGameOver: false, winnerUserId: null, winnerTeamIndex: null, isDraw: false };
  }

  public getSanitizedStateForPlayer(state: any, userId: string): any {
    const sanitized = JSON.parse(JSON.stringify(state));

    sanitized.hostUserId = state.hostUserId;
    sanitized.seed = state.seed;
    sanitized.maxCardsPerPlayer = state.maxCardsPerPlayer;
    sanitized.cardPrice = state.cardPrice;

    if (!sanitized.cardsPurchased) sanitized.cardsPurchased = {};

    regenerateAllCards(sanitized);

    if (sanitized.cards && typeof sanitized.cards === 'object') {
      Object.keys(sanitized.cards).forEach((uid) => {
        if (uid !== userId) {
          sanitized.cards[uid] = [];
        }
      });
    }

    return sanitized;
  }
}
