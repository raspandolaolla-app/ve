// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DAMAS (CHECKERS)
// ==============================================================================

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Crown, Sparkles } from 'lucide-react';
import type { CheckersState, CheckersMove } from '../../../types/games';

interface CheckersBoardProps {
  state: CheckersState;
  currentUserId: string;
  onMovePiece: (move: CheckersMove) => void;
}

export const CheckersBoard: React.FC<CheckersBoardProps> = ({
  state,
  currentUserId,
  onMovePiece,
}) => {
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);

  const isMyTurn = state.turnUserId === currentUserId && state.status === 'playing';
  const myPlayer = state.players.find((p) => p.userId === currentUserId);
  const opponent = state.players.find((p) => p.userId !== currentUserId);

  const handleCellClick = (row: number, col: number) => {
    if (!isMyTurn) return;

    const clickedPiece = state.board[row][col];

    // Si ya seleccionó una ficha propia y hace clic en una casilla vacía (destino)
    if (selectedCell) {
      if (selectedCell.row === row && selectedCell.col === col) {
        setSelectedCell(null); // Deseleccionar
        return;
      }

      if (!clickedPiece) {
        // Enviar movimiento al motor
        onMovePiece({
          from: selectedCell,
          to: { row, col },
        });
        setSelectedCell(null);
        return;
      }
    }

    // Seleccionar ficha propia
    if (clickedPiece && clickedPiece.userId === currentUserId) {
      setSelectedCell({ row, col });
    }
  };

  return (
    <div id="checkers-board-container" className="flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full">
      {/* Marcador Superior */}
      <div id="checkers-scoreboard" className="grid grid-cols-2 gap-4 w-full mb-4">
        {state.players.map((p) => (
          <div
            key={p.userId}
            id={`checkers-player-card-${p.userId}`}
            className={`p-3 rounded-xl border transition-all ${
              state.turnUserId === p.userId && state.status === 'playing'
                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-400/30'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-5 h-5 rounded-full border ${
                    p.playerNumber === 1
                      ? 'bg-neutral-200 border-white shadow-sm'
                      : 'bg-neutral-950 border-neutral-600'
                  }`}
                />
                <div>
                  <div className="text-sm font-semibold text-neutral-200 truncate max-w-[100px]">
                    {p.name}
                  </div>
                  {p.userId === currentUserId && (
                    <span className="text-[10px] text-amber-400 font-mono font-semibold uppercase">
                      (Tú)
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-neutral-400">Capturas:</span>
                <span className="ml-1 text-sm font-bold text-white font-mono">
                  {state.capturedCount[p.userId] || 0}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Banner de Turno */}
      <div className="mb-3 text-center">
        {state.status === 'playing' ? (
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
            <span
              className={`w-2 h-2 rounded-full ${
                isMyTurn ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              {isMyTurn
                ? 'Tu turno: selecciona una ficha y haz clic en la casilla destino'
                : `Esperando movimiento de ${opponent?.name || 'oponente'}...`}
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-neutral-950 font-bold text-sm shadow-lg">
            <Sparkles className="w-4 h-4" />
            <span>¡Partida concluida! Ganador: {state.players.find(p => p.userId === state.winnerUserId)?.name}</span>
          </div>
        )}
      </div>

      {/* Tablero 8x8 */}
      <div
        id="checkers-grid"
        className="grid grid-cols-8 gap-0.5 p-2 rounded-2xl bg-neutral-950 border-2 border-neutral-800 shadow-2xl w-full max-w-[380px] aspect-square"
      >
        {state.board.map((row, rIdx) =>
          row.map((piece, cIdx) => {
            const isDarkCell = (rIdx + cIdx) % 2 === 1;
            const isSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
            const isLastMove =
              (state.lastMove?.from.row === rIdx && state.lastMove?.from.col === cIdx) ||
              (state.lastMove?.to.row === rIdx && state.lastMove?.to.col === cIdx);

            return (
              <div
                key={`${rIdx}_${cIdx}`}
                id={`checkers-cell-${rIdx}-${cIdx}`}
                onClick={() => handleCellClick(rIdx, cIdx)}
                className={`relative flex items-center justify-center select-none aspect-square cursor-pointer transition-all ${
                  isDarkCell ? 'bg-neutral-800/90' : 'bg-neutral-900/40'
                } ${isSelected ? 'ring-2 ring-amber-400 z-10' : ''} ${
                  isLastMove ? 'bg-amber-950/40' : ''
                }`}
              >
                {piece && (
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shadow-lg transition-transform ${
                      piece.player === 1
                        ? 'bg-neutral-100 border-2 border-neutral-300 text-neutral-900'
                        : 'bg-neutral-950 border-2 border-neutral-700 text-amber-400'
                    } ${isSelected ? 'scale-110 shadow-amber-500/50' : ''}`}
                  >
                    {piece.isKing && <Crown className="w-4 h-4 text-amber-500" />}
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
