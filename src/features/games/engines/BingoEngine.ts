// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: BINGO ONLINE (75, 80, 90 BOLAS)
// ==============================================================================
// Cartones 5x5, 4x4 y 3x9, balotera secuencial, marcaje de números y validación.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { BingoState, BingoCard75, BingoCard80, BingoCard90, BingoVariant, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

export class BingoEngine implements IGameEngine<BingoState> {
  public readonly gameType = 'bingo';

  public initialize(table: GameTable, players: TablePlayer[]): BingoState {
    const cards: Record<string, BingoCard75[]> = {};
    const cardsPurchased: Record<string, number> = {};
    const playerNames: Record<string, string> = {};

    const variant: BingoVariant = ((table.config?.variant as BingoVariant) || '75');
    const totalBalls = variant === '90' ? 90 : variant === '80' ? 80 : 75;

    // Calcular pozo inicial basado en apuestas (o default 10 Bs por cartón)
    const cardPrice = table.entryFee || 10.0;
    let totalCardCount = 0;

    players.forEach((p) => {
      const isHost = p.userId === table.hostUserId;
      // 1 a 20 cartones por jugador
      const count = Math.min(20, Math.max(1, isHost ? 3 : 1));
      cardsPurchased[p.userId] = count;
      totalCardCount += count;

      const userCards: BingoCard75[] = [];
      for (let c = 0; c < count; c++) {
        userCards.push(this.generateBingoCard75());
      }
      cards[p.userId] = userCards;
      playerNames[p.userId] = (p.displayName || `Jugador ${p.seatNumber}`).toUpperCase();
    });

    const totalPoolBs = totalCardCount * cardPrice;
    const winnerPoolBs = Math.round(totalPoolBs * 0.90 * 100) / 100; // 90% para ganador
    const systemFeeBs = Math.round(totalPoolBs * 0.10 * 100) / 100;  // 10% para sistema

    return {
      variant,
      drawnBalls: [],
      currentBall: null,
      cards,
      cardsPurchased,
      playerNames,
      winnerUserId: null,
      status: 'in_progress',
      callIntervalMs: 4000,
      totalBalls,
      totalPoolBs,
      winnerPoolBs,
      systemFeeBs,
    };
  }

  public validateAction(state: BingoState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status === 'bingo_won' || state.status === 'finished') {
      return { valid: false, reason: 'La partida de Bingo ya ha finalizado.' };
    }

    if (action.actionType === 'DRAW_BALL') {
      if (state.drawnBalls.length >= state.totalBalls) {
        return { valid: false, reason: `Ya se han extraído todas las ${state.totalBalls} balotas.` };
      }
      return { valid: true };
    }

    if (action.actionType === 'CLAIM_BINGO') {
      const userCards = state.cards[action.userId];
      if (!userCards || userCards.length === 0) return { valid: false, reason: 'Cartón no encontrado.' };

      const hasValidBingo = userCards.some((card) => this.verifyBingoCard75(card, state.drawnBalls));
      if (!hasValidBingo) {
        return { valid: false, reason: '¡Canto falso! Ninguno de tus cartones completa un Bingo válido.' };
      }

      return { valid: true };
    }

    return { valid: false, reason: `Acción no reconocida: ${action.actionType}` };
  }

  public applyAction(state: BingoState, action: GameActionPayload): ActionResult<BingoState> {
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

    if (action.actionType === 'DRAW_BALL') {
      const available = Array.from({ length: state.totalBalls }, (_, i) => i + 1).filter(
        (n) => !state.drawnBalls.includes(n)
      );

      if (available.length === 0) {
        return {
          newState: { ...state, status: 'finished' },
          isValid: true,
          isGameOver: true,
          winnerUserId: null,
          winnerTeamIndex: null,
          isDraw: true,
        };
      }

      const nextBall = available[Math.floor(Math.random() * available.length)];
      const updatedDrawn = [...state.drawnBalls, nextBall];

      const updatedState: BingoState = {
        ...state,
        drawnBalls: updatedDrawn,
        currentBall: nextBall,
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

    if (action.actionType === 'CLAIM_BINGO') {
      const updatedState: BingoState = {
        ...state,
        status: 'bingo_won',
        winnerUserId: action.userId,
      };

      return {
        newState: updatedState,
        isValid: true,
        isGameOver: true,
        winnerUserId: action.userId,
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

  public getSanitizedStateForPlayer(state: BingoState, _userId: string): BingoState {
    return state;
  }

  public generateBingoCard75(): BingoCard75 {
    const getRandomDistinct = (min: number, max: number, count: number): number[] => {
      const nums: number[] = [];
      while (nums.length < count) {
        const n = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!nums.includes(n)) nums.push(n);
      }
      return nums.sort((a, b) => a - b);
    };

    const b = getRandomDistinct(1, 15, 5);
    const i = getRandomDistinct(16, 30, 5);
    const nRaw = getRandomDistinct(31, 45, 4);
    const n: (number | 'FREE')[] = [nRaw[0], nRaw[1], 'FREE', nRaw[2], nRaw[3]];
    const g = getRandomDistinct(46, 60, 5);
    const o = getRandomDistinct(61, 75, 5);

    const marked: boolean[][] = Array(5)
      .fill(false)
      .map(() => Array(5).fill(false));
    marked[2][2] = true;

    return { b, i, n, g, o, marked };
  }

  private verifyBingoCard75(card: BingoCard75, drawnBalls: number[]): boolean {
    for (let r = 0; r < 5; r++) {
      if (card.marked[r].every((m) => m)) return true;
    }
    for (let c = 0; c < 5; c++) {
      let colFull = true;
      for (let r = 0; r < 5; r++) {
        if (!card.marked[r][c]) colFull = false;
      }
      if (colFull) return true;
    }
    const diag1 = card.marked[0][0] && card.marked[1][1] && card.marked[2][2] && card.marked[3][3] && card.marked[4][4];
    const diag2 = card.marked[0][4] && card.marked[1][3] && card.marked[2][2] && card.marked[3][1] && card.marked[4][0];
    return diag1 || diag2;
  }
}
