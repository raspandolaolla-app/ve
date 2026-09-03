import { useState, useEffect, useMemo } from 'react';

export interface CardProgress {
  cardId: string;
  userId: string;
  userName: string;
  matchedNumbers: number;
  totalNumbers: number;
  numbersNeeded: number; // Cuántos faltan para ganar
  percentage: number;
  isCloseToWin: boolean; // 3 números o menos
  isVeryCloseToWin: boolean; // 1 número
  isWinner: boolean;
  cardNumbers: number[];
  matchedNumbersList: number[];
}

export function extractCardNumbers(card: any): { numbers: number[]; minLineMissing?: number } {
  if (!card) return { numbers: [] };

  // Caso 1: Array plano de números explícito
  if (Array.isArray(card.numbers) && card.numbers.length > 0) {
    const nums = card.numbers.filter((n: any) => typeof n === 'number' && n > 0);
    return { numbers: nums };
  }
  if (Array.isArray(card.card_numbers) && card.card_numbers.length > 0) {
    const nums = card.card_numbers.filter((n: any) => typeof n === 'number' && n > 0);
    return { numbers: nums };
  }

  // Caso 2: Bingo 75 estándar con b, i, n, g, o
  if (card.b && card.i && card.n && card.g && card.o) {
    const b = card.b.filter((x: any) => typeof x === 'number' && x > 0);
    const i = card.i.filter((x: any) => typeof x === 'number' && x > 0);
    const n = card.n.filter((x: any) => typeof x === 'number' && x > 0);
    const g = card.g.filter((x: any) => typeof x === 'number' && x > 0);
    const o = card.o.filter((x: any) => typeof x === 'number' && x > 0);

    const allNums = [...b, ...i, ...n, ...g, ...o];
    return { numbers: allNums };
  }

  // Caso 3: Cuadrícula 2D (grid o rows)
  const grid = card.grid || card.rows;
  if (Array.isArray(grid) && Array.isArray(grid[0])) {
    const flat: number[] = [];
    grid.forEach((row: any[]) => {
      row.forEach((cell: any) => {
        const val = Number(cell);
        if (!isNaN(val) && val > 0) {
          flat.push(val);
        }
      });
    });
    return { numbers: flat };
  }

  return { numbers: [] };
}

// Calcular líneas en Bingo 75 o matrices cuadradas para detectar proximidad en filas/columnas/diagonales
function calculateMinMissingInLines(card: any, drawnSet: Set<number>): number | null {
  // Para formato b, i, n, g, o (5x5)
  if (card.b && card.i && card.n && card.g && card.o) {
    const matrix: (number | null)[][] = [];
    for (let r = 0; r < 5; r++) {
      matrix.push([
        typeof card.b[r] === 'number' ? card.b[r] : null,
        typeof card.i[r] === 'number' ? card.i[r] : null,
        typeof card.n[r] === 'number' ? card.n[r] : null, // (r=2 suele ser 'FREE')
        typeof card.g[r] === 'number' ? card.g[r] : null,
        typeof card.o[r] === 'number' ? card.o[r] : null,
      ]);
    }

    let minMissing = 5;

    // Filas
    for (let r = 0; r < 5; r++) {
      const lineNums = matrix[r].filter((x): x is number => x !== null && x > 0);
      const missing = lineNums.filter(num => !drawnSet.has(num)).length;
      if (missing < minMissing) minMissing = missing;
    }

    // Columnas
    for (let c = 0; c < 5; c++) {
      const lineNums: number[] = [];
      for (let r = 0; r < 5; r++) {
        const v = matrix[r][c];
        if (v !== null && v > 0) lineNums.push(v);
      }
      const missing = lineNums.filter(num => !drawnSet.has(num)).length;
      if (missing < minMissing) minMissing = missing;
    }

    // Diagonales
    const diag1 = [matrix[0][0], matrix[1][1], matrix[2][2], matrix[3][3], matrix[4][4]].filter((x): x is number => x !== null && x > 0);
    const diag2 = [matrix[0][4], matrix[1][3], matrix[2][2], matrix[3][1], matrix[4][0]].filter((x): x is number => x !== null && x > 0);
    const missingDiag1 = diag1.filter(num => !drawnSet.has(num)).length;
    const missingDiag2 = diag2.filter(num => !drawnSet.has(num)).length;
    if (missingDiag1 < minMissing) minMissing = missingDiag1;
    if (missingDiag2 < minMissing) minMissing = missingDiag2;

    return minMissing;
  }

  // Si tiene grid 5x5
  if (Array.isArray(card.grid) && card.grid.length === 5 && Array.isArray(card.grid[0]) && card.grid[0].length === 5) {
    let minMissing = 5;
    for (let r = 0; r < 5; r++) {
      const lineNums = card.grid[r].map(Number).filter((v: number) => !isNaN(v) && v > 0);
      const missing = lineNums.filter((num: number) => !drawnSet.has(num)).length;
      if (missing < minMissing) minMissing = missing;
    }
    for (let c = 0; c < 5; c++) {
      const lineNums: number[] = [];
      for (let r = 0; r < 5; r++) {
        const v = Number(card.grid[r][c]);
        if (!isNaN(v) && v > 0) lineNums.push(v);
      }
      const missing = lineNums.filter((num: number) => !drawnSet.has(num)).length;
      if (missing < minMissing) minMissing = missing;
    }
    return minMissing;
  }

  return null;
}

export const useBingoProgress = (
  drawnBalls: number[] = [],
  purchasedCards: any[] = [],
  winningPattern?: string // 'FULL_HOUSE', 'LINE', etc.
) => {
  const [progress, setProgress] = useState<CardProgress[]>([]);

  const calculateProgress = useMemo(() => {
    if (!purchasedCards || purchasedCards.length === 0) return [];

    const drawnSet = new Set(drawnBalls.map(Number));

    return purchasedCards.map((card, index) => {
      const { numbers: cardNumbers } = extractCardNumbers(card);
      const totalNumbers = cardNumbers.length || 1;

      // Calcular números acertados
      const matchedNumbersList = cardNumbers.filter(num => drawnSet.has(num));
      const matchedNumbers = matchedNumbersList.length;
      
      const fullHouseMissing = Math.max(0, totalNumbers - matchedNumbers);
      const lineMissing = calculateMinMissingInLines(card, drawnSet);

      let numbersNeeded: number;
      if (winningPattern === 'LINE' && lineMissing !== null) {
        numbersNeeded = lineMissing;
      } else if (winningPattern === 'FULL_HOUSE') {
        numbersNeeded = fullHouseMissing;
      } else {
        // Por defecto: si alguna línea está más cerca de cantar victoria, se toma esa proximidad
        numbersNeeded = lineMissing !== null ? Math.min(lineMissing, fullHouseMissing) : fullHouseMissing;
      }

      const percentage = totalNumbers > 0 ? (matchedNumbers / totalNumbers) * 100 : 0;

      // Determinar estado
      const isWinner = numbersNeeded === 0 || fullHouseMissing === 0;
      const isVeryCloseToWin = numbersNeeded === 1; // 1 número para ganar
      const isCloseToWin = numbersNeeded <= 3 && numbersNeeded > 1; // 2-3 números

      const cardId = card.id || card.card_id || card.cardId || `card_${index}`;
      const userId = card.user_id || card.userId || '';
      const userName = card.user?.display_name || card.userName || card.player_name || 'Jugador';

      return {
        cardId,
        userId,
        userName,
        matchedNumbers,
        totalNumbers,
        numbersNeeded,
        percentage,
        isCloseToWin,
        isVeryCloseToWin,
        isWinner,
        cardNumbers,
        matchedNumbersList,
      };
    }).sort((a, b) => {
      // Priorizar el que esté a 1 de ganar, luego por menor números restantes, luego por mayor %
      if (a.numbersNeeded !== b.numbersNeeded) {
        return a.numbersNeeded - b.numbersNeeded;
      }
      return b.percentage - a.percentage;
    });
  }, [drawnBalls, purchasedCards, winningPattern]);

  useEffect(() => {
    setProgress(calculateProgress);
  }, [calculateProgress]);

  // Obtener el líder actual
  const leader = progress[0] || null;
  const hasMultipleLeaders =
    progress.length > 1 &&
    progress[0].matchedNumbers === progress[1].matchedNumbers;

  return {
    progress,
    leader,
    hasMultipleLeaders,
    anyCloseToWin: progress.some(p => p.isCloseToWin || p.isVeryCloseToWin),
    anyVeryCloseToWin: progress.some(p => p.isVeryCloseToWin),
  };
};
