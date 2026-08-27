// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DOMINÓ VENEZOLANO
// ==============================================================================
// Con soporte para Vista NORMAL (números) y CLÁSICA (puntos de dominó pips)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { SkipForward, Eye } from 'lucide-react';
import type { DominoState, DominoTile } from '../../../types/games';

interface DominoBoardProps {
  state: DominoState;
  currentUserId: string;
  onPlayTile: (tile: DominoTile, side: 'left' | 'right') => void;
  onPassTurn: () => void;
}

type ViewMode = 'NORMAL' | 'CLASSIC';

// Matriz 3x3 de pips para los números de 0 a 6
const PIP_INDICES: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const DominoPipHalf: React.FC<{ value: number; size?: 'sm' | 'md' }> = ({ value, size = 'md' }) => {
  const activeIndices = PIP_INDICES[value] || [];
  const pipDotSize = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5 sm:w-2 sm:h-2';

  return (
    <div className="w-full h-full grid grid-cols-3 grid-rows-3 gap-0.5 p-0.5 items-center justify-items-center">
      {Array.from({ length: 9 }).map((_, idx) => (
        <div key={idx} className="w-full h-full flex items-center justify-center">
          {activeIndices.includes(idx) ? (
            <div className={`${pipDotSize} bg-neutral-950 rounded-full shadow-inner`} />
          ) : null}
        </div>
      ))}
    </div>
  );
};

interface DominoTileRenderProps {
  tile: DominoTile;
  mode: ViewMode;
  size?: 'sm' | 'md';
}

const DominoTileRender: React.FC<DominoTileRenderProps> = ({ tile, mode, size = 'md' }) => {
  const isSm = size === 'sm';

  return (
    <div className="w-full h-full flex flex-col items-center justify-between p-1 select-none">
      {mode === 'CLASSIC' ? (
        <>
          <div className="w-full flex-1 flex items-center justify-center">
            <DominoPipHalf value={tile[0]} size={size} />
          </div>
          <div className="w-full h-0.5 bg-neutral-900/80 my-0.5" />
          <div className="w-full flex-1 flex items-center justify-center">
            <DominoPipHalf value={tile[1]} size={size} />
          </div>
        </>
      ) : (
        <>
          <span className={`font-black text-neutral-950 ${isSm ? 'text-[11px]' : 'text-sm sm:text-base'}`}>
            {tile[0]}
          </span>
          <div className="w-full h-0.5 bg-neutral-900 my-0.5" />
          <span className={`font-black text-neutral-950 ${isSm ? 'text-[11px]' : 'text-sm sm:text-base'}`}>
            {tile[1]}
          </span>
        </>
      )}
    </div>
  );
};

export const DominoBoard: React.FC<DominoBoardProps> = ({
  state,
  currentUserId,
  onPlayTile,
  onPassTurn,
}) => {
  const [selectedTile, setSelectedTile] = useState<DominoTile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('domino_view_mode');
    return saved === 'CLASSIC' ? 'CLASSIC' : 'NORMAL';
  });

  useEffect(() => {
    localStorage.setItem('domino_view_mode', viewMode);
  }, [viewMode]);

  const isMyTurn = state.turnUserId === currentUserId && state.status === 'playing';
  const myHand = state.hands[currentUserId] || [];

  const handleTileClick = (tile: DominoTile) => {
    if (!isMyTurn) return;

    if (state.board.length === 0) {
      onPlayTile(tile, 'left');
      return;
    }

    const matchesLeft = tile[0] === state.leftEnd || tile[1] === state.leftEnd;
    const matchesRight = tile[0] === state.rightEnd || tile[1] === state.rightEnd;

    if (matchesLeft && !matchesRight) {
      onPlayTile(tile, 'left');
      setSelectedTile(null);
    } else if (!matchesLeft && matchesRight) {
      onPlayTile(tile, 'right');
      setSelectedTile(null);
    } else if (matchesLeft && matchesRight) {
      setSelectedTile(tile);
    }
  };

  return (
    <div id="domino-board-container" className="flex flex-col items-center justify-between p-2 sm:p-4 max-w-2xl mx-auto w-full min-h-[480px]">
      {/* Selector de Vista de Fichas (NORMAL vs CLÁSICA) */}
      <div className="w-full flex items-center justify-between bg-neutral-900/80 border border-neutral-800 rounded-xl px-3 py-2 mb-3">
        <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-300">
          <Eye className="w-4 h-4 text-amber-400" />
          <span>Vista de fichas:</span>
        </div>
        <div className="flex items-center space-x-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
          <button
            id="domino-view-normal-btn"
            onClick={() => setViewMode('NORMAL')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
              viewMode === 'NORMAL'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            ● NORMAL (6 | 4)
          </button>
          <button
            id="domino-view-classic-btn"
            onClick={() => setViewMode('CLASSIC')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
              viewMode === 'CLASSIC'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            ● CLÁSICA (Puntos)
          </button>
        </div>
      </div>

      {/* Marcador Superior */}
      <div id="domino-scoreboard" className="grid grid-cols-2 gap-3 w-full mb-3">
        {state.playerOrder.map((uId) => (
          <div
            key={uId}
            id={`domino-player-card-${uId}`}
            className={`p-3 rounded-xl border transition-all ${
              state.turnUserId === uId && state.status === 'playing'
                ? 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-400/30'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-neutral-200 truncate block max-w-[120px]">
                  {state.playerNames[uId] || 'Jugador'}
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  {state.hands[uId]?.length || 0} fichas restantes
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-white font-mono">
                  {state.cumulativeScores[uId] || 0}
                </span>
                <span className="text-[10px] text-neutral-500 block font-mono">/{state.targetScore} pts</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mesa Verde / Tablero Central de Dominó */}
      <div
        id="domino-table"
        className="w-full flex-1 min-h-[220px] rounded-2xl bg-emerald-950/80 border-4 border-amber-900/40 p-4 flex flex-col items-center justify-center relative overflow-x-auto shadow-2xl"
      >
        {state.board.length === 0 ? (
          <div className="text-center text-emerald-300/60 font-mono text-xs">
            Mano abierta. El jugador en turno debe iniciar la partida.
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 overflow-x-auto max-w-full p-2">
            {state.board.map((placed, idx) => (
              <motion.div
                key={idx}
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="w-9 h-18 sm:w-10 sm:h-20 bg-amber-50 border-2 border-neutral-900 rounded-lg shadow-md flex items-center justify-center select-none shrink-0"
              >
                <DominoTileRender tile={placed.tile} mode={viewMode} size="sm" />
              </motion.div>
            ))}
          </div>
        )}

        {/* Puntas del Tablero */}
        {state.board.length > 0 && (
          <div className="absolute top-2 left-3 right-3 flex justify-between text-[11px] font-mono text-emerald-300">
            <span>Punta Izquierda: [{state.leftEnd}]</span>
            <span>Punta Derecha: [{state.rightEnd}]</span>
          </div>
        )}
      </div>

      {/* Diálogo emergente para elegir lado si la ficha juega en ambos extremos */}
      {selectedTile && (
        <div className="my-2 p-3 bg-neutral-900 border border-amber-500/50 rounded-xl flex items-center space-x-3">
          <span className="text-xs text-neutral-200 font-semibold">
            ¿Por cuál punta deseas jugar [{selectedTile[0]}-{selectedTile[1]}]?
          </span>
          <button
            onClick={() => {
              onPlayTile(selectedTile, 'left');
              setSelectedTile(null);
            }}
            className="px-3 py-1 bg-amber-500 text-neutral-950 font-bold text-xs rounded-lg hover:bg-amber-400"
          >
            Izquierda ({state.leftEnd})
          </button>
          <button
            onClick={() => {
              onPlayTile(selectedTile, 'right');
              setSelectedTile(null);
            }}
            className="px-3 py-1 bg-amber-500 text-neutral-950 font-bold text-xs rounded-lg hover:bg-amber-400"
          >
            Derecha ({state.rightEnd})
          </button>
          <button
            onClick={() => setSelectedTile(null)}
            className="px-2 py-1 bg-neutral-800 text-neutral-400 text-xs rounded-lg hover:bg-neutral-700"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Zona de Fichas de Mi Mano (Hand Drawer) */}
      <div id="domino-hand-drawer" className="w-full mt-3 bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-neutral-300">
            Tus Fichas {isMyTurn && <span className="text-emerald-400">(¡Es tu turno!)</span>}
          </span>
          {isMyTurn && (
            <button
              id="domino-pass-btn"
              onClick={onPassTurn}
              className="flex items-center space-x-1 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg text-xs font-semibold transition-colors"
            >
              <SkipForward className="w-3 h-3" />
              <span>Paso</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {myHand.map((tile, idx) => {
            const canPlay =
              isMyTurn &&
              (state.board.length === 0 ||
                tile[0] === state.leftEnd ||
                tile[1] === state.leftEnd ||
                tile[0] === state.rightEnd ||
                tile[1] === state.rightEnd);

            return (
              <motion.button
                key={idx}
                id={`domino-hand-tile-${idx}`}
                whileHover={canPlay ? { scale: 1.1, y: -4 } : {}}
                whileTap={canPlay ? { scale: 0.95 } : {}}
                onClick={() => canPlay && handleTileClick(tile)}
                disabled={!canPlay}
                className={`w-11 h-22 sm:w-12 sm:h-24 bg-amber-50 border-2 border-neutral-900 rounded-xl flex items-center justify-center shadow-lg font-black text-sm select-none transition-all ${
                  canPlay
                    ? 'cursor-pointer hover:border-amber-500 ring-2 ring-amber-400/50'
                    : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <DominoTileRender tile={tile} mode={viewMode} size="md" />
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
