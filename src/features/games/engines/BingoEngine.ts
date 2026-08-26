// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: BINGO ONLINE (75 BOLAS)
// ==============================================================================
// Cartones 5x5, balotera secuencial, marcaje de números y validación de BINGO.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { BingoState, BingoCard, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

export class BingoEngine implements IGameEngine<BingoState> {
  public readonly gameType = 'bingo';

  public initialize(table: GameTable, players: TablePlayer[]): BingoState {
    const cards: Record<string, BingoCard> = {};
    const playerNames: Record<string, string> = {};

    players.forEach((p) => {
      cards[p.userId] = this.generateBingoCard();
      playerNames[p.userId] = p.displayName || `Jugador ${p.seatNumber}`;
    });

    return {
      drawnBalls: [],
      currentBall: null,
      cards,
      playerNames,
      winnerUserId: null,
      status: 'in_progress',
      callIntervalMs: 4000,
      totalBalls: 75,
    };
  }

  public validateAction(state: BingoState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status === 'bingo_won' || state.status === 'finished') {
      return { valid: false, reason: 'La partida de Bingo ya ha finalizado.' };
    }

    if (action.actionType === 'DRAW_BALL') {
      if (state.drawnBalls.length >= state.totalBalls) {
        return { valid: false, reason: 'Ya se han extraído todas las 75 balotas.' };
      }
      return { valid: true };
    }

    if (action.actionType === 'MARK_NUMBER') {
      const { row, col } = action.actionData as { row: number; col: number };
      const card = state.cards[action.userId];
      if (!card) return { valid: false, reason: 'No tienes un cartón registrado.' };

      if (row < 0 || row > 4 || col < 0 || col > 4) {
        return { valid: false, reason: 'Posición fuera del cartón (5x5).' };
      }

      const num = this.getCardValue(card, row, col);
      if (num !== 'FREE' && !state.drawnBalls.includes(num as number)) {
        return { valid: false, reason: `El número ${num} aún no ha sido cantado por la balotera.` };
      }

      return { valid: true };
    }

    if (action.actionType === 'CLAIM_BINGO') {
      const card = state.cards[action.userId];
      if (!card) return { valid: false, reason: 'Cartón no encontrado.' };

      const isBingoValid = this.verifyBingoCard(card, state.drawnBalls);
      if (!isBingoValid) {
        return { valid: false, reason: '¡Canto falso! Tu cartón no completa un Bingo válido.' };
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
      // Extraer una bola no repetida entre 1 y 75
      const available = Array.from({ length: 75 }, (_, i) => i + 1).filter(
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

    if (action.actionType === 'MARK_NUMBER') {
      const { row, col } = action.actionData as { row: number; col: number };
      const card = state.cards[action.userId];
      const newMarked = card.marked.map((r) => [...r]);
      newMarked[row][col] = true;

      const updatedCard = {
        ...card,
        marked: newMarked,
      };

      const updatedCards = {
        ...state.cards,
        [action.userId]: updatedCard,
      };

      const updatedState: BingoState = {
        ...state,
        cards: updatedCards,
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

  private generateBingoCard(): BingoCard {
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
    marked[2][2] = true; // Casilla central FREE marcada por defecto

    return { b, i, n, g, o, marked };
  }

  private getCardValue(card: BingoCard, row: number, col: number): number | 'FREE' {
    switch (col) {
      case 0:
        return card.b[row];
      case 1:
        return card.i[row];
      case 2:
        return card.n[row];
      case 3:
        return card.g[row];
      case 4:
        return card.o[row];
      default:
        return 0;
    }
  }

  private verifyBingoCard(card: BingoCard, drawnBalls: number[]): boolean {
    // Validar que cada casilla marcada corresponda a una bola cantada
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (card.marked[r][c]) {
          const val = this.getCardValue(card, r, c);
          if (val !== 'FREE' && !drawnBalls.includes(val as number)) {
            return false;
          }
        }
      }
    }

    // Verificar al menos una línea completa (Horizontal, Vertical o Diagonal)
    // Filas
    for (let r = 0; r < 5; r++) {
      if (card.marked[r].every((m) => m)) return true;
    }

    // Columnas
    for (let c = 0; c < 5; c++) {
      let colFull = true;
      for (let r = 0; r < 5; r++) {
        if (!card.marked[r][c]) colFull = false;
      }
      if (colFull) return true;
    }

    // Diagonales
    const diag1 = card.marked[0][0] && card.marked[1][1] && card.marked[2][2] && card.marked[3][3] && card.marked[4][4];
    const diag2 = card.marked[0][4] && card.marked[1][3] && card.marked[2][2] && card.marked[3][1] && card.marked[4][0];

    return diag1 || diag2;
  }
}
