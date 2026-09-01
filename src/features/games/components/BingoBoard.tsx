// ==============================================================================
// RASPANDO LA OLLA — TABLERO MULTIMODAL DE BINGO VIRTUAL (75, 80, 90 BOLAS)
// ==============================================================================

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Radio, Trophy, Layers, Lock, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { BcvRepository } from '../../../services/repositories/BcvRepository';
import type { BingoState, BingoCard75, BingoCard80, BingoCard90 } from '../../../types/games';

interface BingoBoardProps {
  state: BingoState;
  currentUserId: string;
  onMarkNumber: (row: number, col: number) => void;
  onClaimBingo: () => void;
  onDrawBall?: () => void;
  isSalesClosed?: boolean;
  countdownSeconds?: number | null;
  bcvRate?: number;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export const BingoBoard: React.FC<BingoBoardProps> = ({
  state,
  currentUserId,
  onMarkNumber,
  onClaimBingo,
  onDrawBall,
  isSalesClosed = false,
  countdownSeconds = null,
  bcvRate = 50,
  isMuted = false,
  onToggleMute,
}) => {
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const variant = state.variant || '75';

  const userCards75 = state.cards[currentUserId] || [];
  const userCards80 = state.cards80?.[currentUserId] || [];
  const userCards90 = state.cards90?.[currentUserId] || [];

  const cardCount = Math.max(userCards75.length, userCards80.length, userCards90.length, 1);
  const playerName = (state.playerNames[currentUserId] || 'JUGADOR').toUpperCase();

  const getMissingCount = (): number => {
    if (variant === '75' && userCards75[activeCardIndex]) {
      const card = userCards75[activeCardIndex];
      const isCellMatched = (row: number, col: number): boolean => {
        if (row === 2 && col === 2) return true; // FREE
        let val: number | 'FREE' = 0;
        if (col === 0) val = card.b[row];
        else if (col === 1) val = card.i[row];
        else if (col === 2) val = card.n[row];
        else if (col === 3) val = card.g[row];
        else if (col === 4) val = card.o[row];
        return state.drawnBalls.includes(val as number) || card.marked[row][col];
      };

      let minMissing = 5;

      // Rows
      for (let r = 0; r < 5; r++) {
        let missing = 0;
        for (let c = 0; c < 5; c++) {
          if (!isCellMatched(r, c)) missing++;
        }
        if (missing < minMissing) minMissing = missing;
      }

      // Cols
      for (let c = 0; c < 5; c++) {
        let missing = 0;
        for (let r = 0; r < 5; r++) {
          if (!isCellMatched(r, c)) missing++;
        }
        if (missing < minMissing) minMissing = missing;
      }

      // Diag1
      let d1 = 0;
      for (let i = 0; i < 5; i++) {
        if (!isCellMatched(i, i)) d1++;
      }
      if (d1 < minMissing) minMissing = d1;

      // Diag2
      let d2 = 0;
      for (let i = 0; i < 5; i++) {
        if (!isCellMatched(i, 4 - i)) d2++;
      }
      if (d2 < minMissing) minMissing = d2;

      return minMissing;
    }

    if (variant === '80' && userCards80[activeCardIndex]) {
      const card = userCards80[activeCardIndex];
      let minMissing = 4;

      const isCellMatched = (row: number, col: number): boolean => {
        const val = card.grid[col]?.[row];
        if (!val) return false;
        return state.drawnBalls.includes(val) || (card.marked[row]?.[col] || false);
      };

      // Rows
      for (let r = 0; r < 4; r++) {
        let missing = 0;
        for (let c = 0; c < 4; c++) {
          if (!isCellMatched(r, c)) missing++;
        }
        if (missing < minMissing) minMissing = missing;
      }

      // Cols
      for (let c = 0; c < 4; c++) {
        let missing = 0;
        for (let r = 0; r < 4; r++) {
          if (!isCellMatched(r, c)) missing++;
        }
        if (missing < minMissing) minMissing = missing;
      }

      return minMissing;
    }

    if (variant === '90' && userCards90[activeCardIndex]) {
      const card = userCards90[activeCardIndex];
      let totalNumbers = 0;
      let totalMatched = 0;

      card.rows.forEach((rowArr, rowIdx) => {
        rowArr.forEach((val, colIdx) => {
          if (val !== null) {
            totalNumbers++;
            const isMatched = state.drawnBalls.includes(val) || (card.marked[rowIdx]?.[colIdx] || false);
            if (isMatched) totalMatched++;
          }
        });
      });

      return totalNumbers - totalMatched;
    }

    return 5;
  };

  const missingToWin = getMissingCount();

  const totalPool = state.totalPoolBs || 0;
  const winnerPool = state.winnerPoolBs || Math.round(totalPool * 0.90 * 100) / 100;
  const systemFee = state.systemFeeBs || Math.round(totalPool * 0.10 * 100) / 100;

  const formatSeconds = (secs: number | null): string => {
    if (secs === null) return '02:00';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div id="bingo-board-container" className="flex flex-col items-center justify-between p-4 max-w-xl mx-auto w-full space-y-3">
      {/* Banner de Pozo Acumulado (90/10) */}
      <div id="bingo-pool-banner" className="w-full bg-slate-900/90 border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-2">
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">
              BINGO {variant} BOLAS — {playerName}
            </div>
            <div className="text-xs text-slate-200 font-mono">
              Premio Ganador (90%): <span className="font-bold text-emerald-400">{winnerPool.toFixed(2)} Bs</span>
              <span className="text-[10px] text-slate-400 ml-1.5 font-sans">
                ({BcvRepository.formatUsdCompact(winnerPool, bcvRate)})
              </span>
            </div>
          </div>
        </div>

        <div className="text-right font-mono">
          <div className="text-[10px] text-slate-400">
            Comisión Sistema (10%): {systemFee.toFixed(2)} Bs
          </div>
          <div className="text-[10px] text-slate-500">
            Pozo Total: {totalPool.toFixed(2)} Bs
          </div>
        </div>
      </div>

      {/* Temporizador de Cierre de Ventas o Conteo Regresivo */}
      {countdownSeconds !== null && countdownSeconds > 0 && (
        <div className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono shadow-md ${
          isSalesClosed
            ? 'bg-red-500/10 border-red-500/40 text-red-300 animate-pulse'
            : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
        }`}>
          <div className="flex items-center space-x-2">
            {isSalesClosed ? <Lock className="w-4 h-4 text-red-400" /> : <ShieldCheck className="w-4 h-4 text-emerald-400" />}
            <span className="font-bold">
              {isSalesClosed ? '🔒 VENTAS CERRADAS' : 'EL SORTEO COMENZARÁ EN'}
            </span>
          </div>
          <span className="font-black text-sm">{formatSeconds(countdownSeconds)}</span>
        </div>
      )}

      {/* Balotera en Vivo */}
      <div id="bingo-caller-display" className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-300 flex items-center justify-center text-slate-950 font-black text-2xl shadow-xl ring-4 ring-amber-500/30 animate-pulse">
            {state.currentBall !== null ? state.currentBall : '—'}
          </div>
          <div>
            <div className="flex items-center space-x-1.5 text-xs text-amber-400 font-bold uppercase font-mono">
              <Radio className="w-3.5 h-3.5 text-red-500 animate-ping" />
              <span>Balotera Server-Authoritative</span>
              {onToggleMute && (
                <button
                  onClick={onToggleMute}
                  className="ml-2 p-1 rounded bg-slate-800 hover:bg-slate-750 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Activar Sonido' : 'Silenciar'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3 h-3 text-red-400" />
                  ) : (
                    <Volume2 className="w-3 h-3 text-emerald-400" />
                  )}
                </button>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              Extraídas: {state.drawnBalls.length} / {state.totalBalls || (variant === '90' ? 90 : variant === '80' ? 80 : 75)}
            </div>
          </div>
        </div>

        {onDrawBall && state.status === 'in_progress' && (
          <button
            onClick={onDrawBall}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all"
          >
            Extraer Balota
          </button>
        )}
      </div>

      {/* Historial de Balotas Recientes */}
      <div className="w-full flex items-center space-x-1.5 overflow-x-auto py-1">
        <span className="text-[10px] text-slate-500 font-mono mr-1">ÚLTIMAS:</span>
        {state.drawnBalls.length === 0 ? (
          <span className="text-[11px] text-slate-500 italic">Esperando inicio del sorteo...</span>
        ) : (
          state.drawnBalls.slice(-8).reverse().map((b, idx) => (
            <span
              key={idx}
              className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold shrink-0 ${
                idx === 0
                  ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                  : 'bg-slate-800 border border-slate-700 text-amber-300'
              }`}
            >
              {b}
            </span>
          ))
        )}
      </div>

      {/* Paginador de Cartones si el usuario tiene múltiples cartones */}
      {cardCount > 1 && (
        <div className="w-full flex items-center space-x-2 overflow-x-auto pb-1">
          <div className="flex items-center text-xs font-bold text-slate-400 space-x-1 shrink-0">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Mis Cartones ({cardCount}):</span>
          </div>
          {Array.from({ length: cardCount }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveCardIndex(idx)}
              className={`px-3 py-1 rounded-lg font-mono text-xs font-bold transition-all shrink-0 ${
                activeCardIndex === idx
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-400'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Cartón #{idx + 1}
            </button>
          ))}
        </div>
      )}

      {/* RENDERIZADO DEL CARTÓN SEGÚN LA MODALIDAD (75, 80 O 90) */}
      {variant === '75' && userCards75[activeCardIndex] && (
        <div id="bingo-card-75" className="w-full max-w-[340px] bg-slate-950 border-2 border-amber-500/40 rounded-2xl p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-amber-400 uppercase font-mono">
                Cartón #{activeCardIndex + 1} de {cardCount}
              </span>
              {missingToWin === 1 && (
                <span className="text-[9px] bg-red-600 text-white font-extrabold px-1.5 py-0.5 rounded animate-pulse shadow-sm">
                  ⚠️ A 1 BALOTA
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono uppercase">
              BINGO 75
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {['B', 'I', 'N', 'G', 'O'].map((col) => (
              <div
                key={col}
                className="py-1 rounded-lg bg-gradient-to-b from-amber-500 to-amber-600 text-slate-950 font-black text-center text-sm shadow-sm"
              >
                {col}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {Array(5)
              .fill(0)
              .map((_, row) =>
                ['B', 'I', 'N', 'G', 'O'].map((_, col) => {
                  const card = userCards75[activeCardIndex];
                  let val: number | 'FREE' = 0;
                  if (col === 0) val = card.b[row];
                  if (col === 1) val = card.i[row];
                  if (col === 2) val = card.n[row];
                  if (col === 3) val = card.g[row];
                  if (col === 4) val = card.o[row];

                  const isMarked = card.marked[row][col];
                  const isDrawn = val === 'FREE' || state.drawnBalls.includes(val as number);

                  return (
                    <motion.button
                      key={`${row}_${col}`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onMarkNumber(row, col)}
                      className={`aspect-square rounded-xl font-black text-sm flex items-center justify-center select-none border transition-all ${
                        isMarked
                          ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md ring-2 ring-amber-400/50'
                          : isDrawn
                          ? 'bg-slate-800 border-amber-500/50 text-amber-400 cursor-pointer hover:bg-slate-700'
                          : 'bg-slate-900 border-slate-800 text-slate-400 cursor-pointer'
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

      {/* BINGO 80 (4x4) */}
      {variant === '80' && userCards80[activeCardIndex] && (
        <div id="bingo-card-80" className="w-full max-w-[320px] bg-slate-950 border-2 border-orange-500/40 rounded-2xl p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-orange-400 uppercase font-mono">
                Cartón #{activeCardIndex + 1} de {cardCount}
              </span>
              {missingToWin === 1 && (
                <span className="text-[9px] bg-red-600 text-white font-extrabold px-1.5 py-0.5 rounded animate-pulse shadow-sm">
                  ⚠️ A 1 BALOTA
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono uppercase">
              BINGO 80 (4x4)
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {userCards80[activeCardIndex].grid.map((colArr, colIdx) =>
              colArr.map((val, rowIdx) => {
                const card = userCards80[activeCardIndex];
                const isMarked = card.marked[rowIdx]?.[colIdx];
                const isDrawn = state.drawnBalls.includes(val);

                return (
                  <motion.button
                    key={`${colIdx}_${rowIdx}`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onMarkNumber(rowIdx, colIdx)}
                    className={`h-14 rounded-xl font-black text-base flex items-center justify-center border transition-all ${
                      isMarked
                        ? 'bg-orange-500 text-slate-950 border-orange-300 shadow-md'
                        : isDrawn
                        ? 'bg-slate-800 border-orange-500/50 text-orange-400'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {val}
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* BINGO 90 (3x9) */}
      {variant === '90' && userCards90[activeCardIndex] && (
        <div id="bingo-card-90" className="w-full bg-slate-950 border-2 border-yellow-500/40 rounded-2xl p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-yellow-400 uppercase font-mono">
                Cartón #{activeCardIndex + 1} de {cardCount}
              </span>
              {missingToWin === 1 && (
                <span className="text-[9px] bg-red-600 text-white font-extrabold px-1.5 py-0.5 rounded animate-pulse shadow-sm">
                  ⚠️ A 1 BALOTA
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono uppercase">
              BINGO 90 (15 Números)
            </span>
          </div>

          <div className="grid grid-cols-9 gap-1">
            {userCards90[activeCardIndex].rows.map((rowArr, rowIdx) =>
              rowArr.map((val, colIdx) => {
                if (val === null) {
                  return (
                    <div
                      key={`empty_${rowIdx}_${colIdx}`}
                      className="h-10 rounded-lg bg-slate-900/40 border border-slate-800/40"
                    />
                  );
                }

                const isMarked = userCards90[activeCardIndex].marked[rowIdx]?.[colIdx];
                const isDrawn = state.drawnBalls.includes(val);

                return (
                  <motion.button
                    key={`${rowIdx}_${colIdx}`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onMarkNumber(rowIdx, colIdx)}
                    className={`h-10 rounded-lg font-black text-xs flex items-center justify-center border transition-all ${
                      isMarked
                        ? 'bg-yellow-500 text-slate-950 border-yellow-300 shadow-md'
                        : isDrawn
                        ? 'bg-slate-800 border-yellow-500/50 text-yellow-400'
                        : 'bg-slate-900 border-slate-800 text-slate-300'
                    }`}
                  >
                    {val}
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Botón Flotante/Principal de Cantar Bingo con Safe Area */}
      <div className="w-full pt-2 pb-safe">
        <button
          id="claim-bingo-btn"
          onClick={onClaimBingo}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-base uppercase tracking-wider shadow-2xl hover:shadow-amber-500/30 transition-all flex items-center justify-center space-x-2"
        >
          <Sparkles className="w-5 h-5 text-slate-950" />
          <span>🎉 ¡CANTAR BINGO!</span>
        </button>
      </div>
    </div>
  );
};
