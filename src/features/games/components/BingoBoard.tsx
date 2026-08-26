// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: BINGO ONLINE (75 BOLAS)
// ==============================================================================

import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Trophy, Radio } from 'lucide-react';
import type { BingoState } from '../../../types/games';

interface BingoBoardProps {
  state: BingoState;
  currentUserId: string;
  onMarkNumber: (row: number, col: number) => void;
  onClaimBingo: () => void;
  onDrawBall?: () => void;
}

export const BingoBoard: React.FC<BingoBoardProps> = ({
  state,
  currentUserId,
  onMarkNumber,
  onClaimBingo,
  onDrawBall,
}) => {
  const myCard = state.cards[currentUserId];
  const columns = ['B', 'I', 'N', 'G', 'O'];

  return (
    <div id="bingo-board-container" className="flex flex-col items-center justify-between p-4 max-w-xl mx-auto w-full">
      {/* Balotera en Vivo */}
      <div id="bingo-caller-display" className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-neutral-950 font-black text-2xl shadow-lg animate-pulse">
            {state.currentBall !== null ? state.currentBall : '—'}
          </div>
          <div>
            <div className="flex items-center space-x-1 text-xs text-amber-400 font-bold uppercase font-mono">
              <Radio className="w-3.5 h-3.5 text-red-500 animate-ping" />
              <span>Balotera en Vivo</span>
            </div>
            <div className="text-xs text-neutral-400 font-mono mt-0.5">
              Extraídas: {state.drawnBalls.length} / {state.totalBalls}
            </div>
          </div>
        </div>

        {onDrawBall && state.status === 'in_progress' && (
          <button
            onClick={onDrawBall}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs shadow-md transition-all"
          >
            Extraer Balota
          </button>
        )}
      </div>

      {/* Historial de Balotas Recientes */}
      <div className="w-full mb-4 flex items-center space-x-1.5 overflow-x-auto py-1">
        <span className="text-[10px] text-neutral-500 font-mono mr-1">ÚLTIMAS:</span>
        {state.drawnBalls.slice(-8).reverse().map((b, idx) => (
          <span
            key={idx}
            className="px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-amber-300 font-mono text-xs font-bold shrink-0"
          >
            {b}
          </span>
        ))}
      </div>

      {/* Cartón de Bingo 5x5 */}
      {myCard && (
        <div id="bingo-card" className="w-full max-w-[340px] bg-neutral-950 border-2 border-amber-500/40 rounded-2xl p-3 shadow-2xl">
          {/* Encabezado B-I-N-G-O */}
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {columns.map((col, idx) => (
              <div
                key={col}
                className="py-1 rounded-lg bg-gradient-to-b from-amber-500 to-amber-600 text-neutral-950 font-black text-center text-sm shadow-sm"
              >
                {col}
              </div>
            ))}
          </div>

          {/* Celdas 5x5 */}
          <div className="grid grid-cols-5 gap-1.5">
            {Array(5)
              .fill(0)
              .map((_, row) =>
                columns.map((_, col) => {
                  let val: number | 'FREE' = 0;
                  if (col === 0) val = myCard.b[row];
                  if (col === 1) val = myCard.i[row];
                  if (col === 2) val = myCard.n[row];
                  if (col === 3) val = myCard.g[row];
                  if (col === 4) val = myCard.o[row];

                  const isMarked = myCard.marked[row][col];
                  const isDrawn = val === 'FREE' || state.drawnBalls.includes(val as number);

                  return (
                    <motion.button
                      key={`${row}_${col}`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onMarkNumber(row, col)}
                      className={`aspect-square rounded-xl font-black text-sm flex items-center justify-center select-none border transition-all ${
                        isMarked
                          ? 'bg-amber-500 text-neutral-950 border-amber-300 shadow-md ring-2 ring-amber-400/50'
                          : isDrawn
                          ? 'bg-neutral-800 border-amber-500/50 text-amber-400 cursor-pointer hover:bg-neutral-700'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 cursor-pointer'
                      }`}
                    >
                      {val === 'FREE' ? '★' : val}
                    </motion.button>
                  );
                })
              )}
          </div>
        </div>
      )}

      {/* Botón Cantar Bingo */}
      <div className="w-full mt-5">
        <button
          id="claim-bingo-btn"
          onClick={onClaimBingo}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-base uppercase tracking-wider shadow-xl hover:shadow-amber-500/20 transition-all flex items-center justify-center space-x-2"
        >
          <Sparkles className="w-5 h-5 text-neutral-950" />
          <span>¡Cantar BINGO!</span>
        </button>
      </div>
    </div>
  );
};
