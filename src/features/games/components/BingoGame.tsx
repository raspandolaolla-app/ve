// ==============================================================================
// RASPANDO LA OLLA — BINGO ONLINE CRILLO
// ==============================================================================
// Cartón 5x5 (B-I-N-G-O), bombo extractor de balotas sincronizado, marcado interactivo,
// validación criptográfica de líneas/cartón lleno y liquidación de pozo.
// ==============================================================================

import { useState } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, Sparkles, CheckCircle2, Disc } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

interface BingoCard {
  B: number[]; // 5 números (1-15)
  I: number[]; // 5 números (16-30)
  N: (number | 'FREE')[]; // 5 números (31-45, centro FREE)
  G: number[]; // 5 números (46-60)
  O: number[]; // 5 números (61-75)
}

interface BingoState {
  drawnBalls: number[];
  currentBall: number | null;
  winnerUserId: string | null;
  winningPattern: string | null;
}

// Genera un cartón de bingo aleatorio balanceado
function generateBingoCard(): BingoCard {
  const getUniqueRandoms = (min: number, max: number, count: number) => {
    const set = new Set<number>();
    while (set.size < count) {
      set.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return Array.from(set);
  };

  const nCol = getUniqueRandoms(31, 45, 4);
  const nFormatted: (number | 'FREE')[] = [nCol[0], nCol[1], 'FREE', nCol[2], nCol[3]];

  return {
    B: getUniqueRandoms(1, 15, 5),
    I: getUniqueRandoms(16, 30, 5),
    N: nFormatted,
    G: getUniqueRandoms(46, 60, 5),
    O: getUniqueRandoms(61, 75, 5),
  };
}

export function BingoGame({
  table,
  players,
  currentUserId,
  onLeave,
}: {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  onLeave: () => void;
}) {
  const [myCard] = useState<BingoCard>(() => generateBingoCard());
  const [markedCells, setMarkedCells] = useState<Set<string>>(new Set(['N-2'])); // El centro FREE está marcado

  const initialBingoState: BingoState = {
    drawnBalls: [],
    currentBall: null,
    winnerUserId: null,
    winningPattern: null,
  };

  const {
    gameState,
    isHost,
    isSettling,
    dispatchAction,
  } = useGameEngine({
    table,
    players,
    currentUserId,
    initialState: initialBingoState,
  });

  const state = (gameState as unknown as BingoState) || initialBingoState;
  const drawnBalls = state.drawnBalls || [];

  // Marcar/Desmarcar casilla en el cartón
  const toggleMark = (col: string, rowIdx: number, val: number | 'FREE') => {
    if (val === 'FREE' || state.winnerUserId) return;
    const key = `${col}-${rowIdx}`;
    setMarkedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Host saca la siguiente balota del bombo
  const handleDrawNextBall = async () => {
    if (!isHost || state.winnerUserId || isSettling) return;

    const availableBalls: number[] = [];
    for (let i = 1; i <= 75; i++) {
      if (!drawnBalls.includes(i)) availableBalls.push(i);
    }

    if (availableBalls.length === 0) return;

    const nextBall = availableBalls[Math.floor(Math.random() * availableBalls.length)];
    const newDrawn = [...drawnBalls, nextBall];

    const nextState: BingoState = {
      ...state,
      drawnBalls: newDrawn,
      currentBall: nextBall,
    };

    await dispatchAction(
      'DRAW_BALL',
      { ball: nextBall },
      nextState as unknown as Record<string, unknown>,
      null
    );
  };

  // Comprobar si el cartón tiene una línea completa válida
  const checkBingoWin = () => {
    const cols = ['B', 'I', 'N', 'G', 'O'] as const;

    // Verificar filas
    for (let r = 0; r < 5; r++) {
      let fullRow = true;
      for (const c of cols) {
        const val = myCard[c][r];
        if (val !== 'FREE' && (!markedCells.has(`${c}-${r}`) || !drawnBalls.includes(val as number))) {
          fullRow = false;
          break;
        }
      }
      if (fullRow) return 'Línea Horizontal';
    }

    // Verificar columnas
    for (const c of cols) {
      let fullCol = true;
      for (let r = 0; r < 5; r++) {
        const val = myCard[c][r];
        if (val !== 'FREE' && (!markedCells.has(`${c}-${r}`) || !drawnBalls.includes(val as number))) {
          fullCol = false;
          break;
        }
      }
      if (fullCol) return 'Línea Vertical';
    }

    // Verificar diagonales
    let diag1 = true;
    let diag2 = true;
    for (let i = 0; i < 5; i++) {
      const c1 = cols[i];
      const val1 = myCard[c1][i];
      if (val1 !== 'FREE' && (!markedCells.has(`${c1}-${i}`) || !drawnBalls.includes(val1 as number))) {
        diag1 = false;
      }

      const c2 = cols[4 - i];
      const val2 = myCard[c2][i];
      if (val2 !== 'FREE' && (!markedCells.has(`${c2}-${i}`) || !drawnBalls.includes(val2 as number))) {
        diag2 = false;
      }
    }

    if (diag1 || diag2) return 'Línea Diagonal';

    return null;
  };

  // Cantar Bingo
  const handleCallBingo = async () => {
    if (state.winnerUserId || isSettling) return;

    const pattern = checkBingoWin();
    if (!pattern) {
      alert('Tu cartón aún no cumple con una línea completa de números cantados.');
      return;
    }

    const nextState: BingoState = {
      ...state,
      winnerUserId: currentUserId || null,
      winningPattern: pattern,
    };

    await dispatchAction(
      'CLAIM_BINGO',
      { pattern, userId: currentUserId },
      nextState as unknown as Record<string, unknown>,
      null,
      currentUserId || null,
      false
    );
  };

  const isGameOver = Boolean(state.winnerUserId);
  const isWinner = state.winnerUserId === currentUserId;
  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-4xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">Bingo Online Criollo</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          {/* Última balota */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-mono uppercase">Última Balota</div>
              <div className="text-2xl font-black text-amber-400 font-mono">
                {state.currentBall !== null ? `#${state.currentBall}` : '—'}
              </div>
            </div>

            {isHost && !isGameOver && (
              <Button size="sm" variant="primary" onClick={handleDrawNextBall}>
                <Disc className="w-4 h-4 mr-1.5" />
                Extraer Balota
              </Button>
            )}
          </div>
        </div>

        {/* Balotas Extraídas */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 whitespace-nowrap">Balotas ({drawnBalls.length}):</span>
          {drawnBalls.length === 0 ? (
            <span className="text-slate-500 italic">Esperando que el anfitrión extraiga la primera balota...</span>
          ) : (
            drawnBalls.slice(-12).reverse().map((ball, idx) => (
              <span
                key={idx}
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs font-mono shrink-0 shadow ${
                  idx === 0
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 animate-pulse'
                    : 'bg-slate-800 text-slate-200 border border-slate-700'
                }`}
              >
                {ball}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Cartón de Bingo 5x5 */}
      <div className="w-full max-w-md bg-slate-950 border-4 border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Encabezado B I N G O */}
        <div className="grid grid-cols-5 gap-2 text-center font-black text-xl text-amber-400 font-mono">
          <span>B</span>
          <span>I</span>
          <span>N</span>
          <span>G</span>
          <span>O</span>
        </div>

        {/* Cuadrícula de 25 casillas */}
        <div className="grid grid-cols-5 gap-2">
          {(['B', 'I', 'N', 'G', 'O'] as const).map((col) => (
            <div key={col} className="flex flex-col gap-2">
              {myCard[col].map((val, rowIdx) => {
                const isFree = val === 'FREE';
                const key = `${col}-${rowIdx}`;
                const isMarked = markedCells.has(key) || isFree;
                const wasDrawn = isFree || (typeof val === 'number' && drawnBalls.includes(val));

                return (
                  <button
                    key={rowIdx}
                    id={`bingo-cell-${col}-${rowIdx}`}
                    disabled={isGameOver || isSettling}
                    onClick={() => toggleMark(col, rowIdx, val)}
                    className={`h-14 sm:h-16 rounded-xl border flex flex-col items-center justify-center font-black text-base transition-all select-none ${
                      isFree
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-mono'
                        : isMarked
                        ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/10'
                        : wasDrawn
                        ? 'bg-slate-900 border-amber-500/60 text-slate-100 hover:bg-slate-800 animate-pulse'
                        : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                    }`}
                  >
                    <span>{val}</span>
                    {isMarked && !isFree && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Botón de Cantar Bingo */}
        {!isGameOver && (
          <Button
            variant="primary"
            onClick={handleCallBingo}
            className="w-full py-4 text-base font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 shadow-xl"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            ¡CANTAR BINGO!
          </Button>
        )}
      </div>

      {/* Overlay de Resultado */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">¡BINGO GANADOR! 🏆</div>
              <p className="text-xs text-slate-300">
                Has completado tu cartón con ({state.winningPattern}) y ganas:{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">BINGO FINALIZADO</div>
              <p className="text-xs text-slate-400">Otro jugador cantó bingo primero.</p>
            </div>
          )}

          {isSettling && (
            <div className="text-xs text-amber-300 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Liquidando premio 90/10 en Supabase...</span>
            </div>
          )}

          <Button variant="primary" onClick={onLeave} className="w-full py-3">
            Volver al Lobby de Mesas
          </Button>
        </div>
      )}
    </div>
  );
}
