// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DOMINÓ VENEZOLANO
// ==============================================================================
// Con soporte para Vista NORMAL (números) y CLÁSICA (puntos de dominó pips)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { SkipForward, Eye } from 'lucide-react';
import type { DominoState, DominoTile } from '../../../types/games';
import { GameRepository } from '../../../services/repositories/GameRepository';
import { PlayerLives } from './PlayerLives';
import { TurnTimer } from './TurnTimer';

interface DominoBoardProps {
  state: DominoState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
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
  const isCorrupted = !tile || !Array.isArray(tile) || tile.length !== 2 || tile[0] === -1 || tile[1] === -1 || tile[0] < 0 || tile[0] > 6 || tile[1] < 0 || tile[1] > 6;

  if (isCorrupted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-1 select-none text-[10px] text-red-500 font-mono font-bold">
        <span>ERR</span>
        <div className="w-full h-0.5 bg-red-500 my-0.5" />
        <span>[-]</span>
      </div>
    );
  }

  const left = tile[0];
  const right = tile[1];

  return (
    <div className="w-full h-full flex flex-col items-center justify-between p-1 select-none">
      {mode === 'CLASSIC' ? (
        <>
          <div className="w-full flex-1 flex items-center justify-center">
            <DominoPipHalf value={left} size={size} />
          </div>
          <div className="w-full h-0.5 bg-neutral-900/80 my-0.5" />
          <div className="w-full flex-1 flex items-center justify-center">
            <DominoPipHalf value={right} size={size} />
          </div>
        </>
      ) : (
        <>
          <span className={`font-black text-neutral-950 ${isSm ? 'text-[11px]' : 'text-sm sm:text-base'}`}>
            {left}
          </span>
          <div className="w-full h-0.5 bg-neutral-900 my-0.5" />
          <span className={`font-black text-neutral-950 ${isSm ? 'text-[11px]' : 'text-sm sm:text-base'}`}>
            {right}
          </span>
        </>
      )}
    </div>
  );
};

export const DominoBoard: React.FC<DominoBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
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
  const activeTurnUserName = (state.playerNames[state.turnUserId] || 'JUGADOR').toUpperCase();

  const handleTileClick = (tile: DominoTile) => {
    if (!isMyTurn) return;

    if (state.board.length === 0) {
      onPlayTile(tile, 'left');
      setSelectedTile(null);
      return;
    }

    const fitsLeft = state.leftEnd === null || tile[0] === state.leftEnd || tile[1] === state.leftEnd;
    const fitsRight = state.rightEnd === null || tile[0] === state.rightEnd || tile[1] === state.rightEnd;

    if (fitsLeft && !fitsRight) {
      onPlayTile(tile, 'left');
      setSelectedTile(null);
    } else if (fitsRight && !fitsLeft) {
      onPlayTile(tile, 'right');
      setSelectedTile(null);
    } else if (fitsLeft && fitsRight) {
      setSelectedTile(tile);
    }
  };

  const handleTimeout = () => {
    if (isMyTurn && sessionId) {
      GameRepository.expireTurn(sessionId).then((expired) => {
        if (!expired) {
          onPassTurn();
        }
      });
    }
  };

  const hasPlayableTile = myHand.some(
    (tile) =>
      state.leftEnd === null ||
      tile[0] === state.leftEnd ||
      tile[1] === state.leftEnd ||
      tile[0] === state.rightEnd ||
      tile[1] === state.rightEnd
  );

  return (
    <div id="domino-board-container" className="flex flex-col items-center justify-center p-4 max-w-4xl mx-auto w-full">
      {/* Selector de Modo de Vista */}
      <div className="w-full flex items-center justify-between mb-3 px-1">
        <div className="flex items-center space-x-2 text-xs font-semibold text-neutral-400">
          <Eye className="w-4 h-4 text-amber-400" />
          <span>ESTILO DE FICHAS:</span>
        </div>
        <div className="flex items-center space-x-1 bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
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

      {/* Temporizador Sincronizado */}
      <div className="w-full mb-3">
        <TurnTimer
          turnExpiresAt={turnExpiresAt}
          durationSeconds={10}
          isMyTurn={isMyTurn}
          activePlayerName={activeTurnUserName}
          status={state.status}
          onTimeout={handleTimeout}
        />
      </div>

      {/* Marcador Superior con Vidas y Nombres en MAYÚSCULAS */}
      <div id="domino-scoreboard" className="grid grid-cols-2 gap-3 w-full mb-3">
        {state.playerOrder.map((uId) => {
          const pLives = (state.lives && state.lives[uId] !== undefined) ? state.lives[uId] : 3;
          const uppercaseName = (state.playerNames[uId] || 'JUGADOR').toUpperCase();

          return (
            <div
              key={uId}
              id={`domino-player-card-${uId}`}
              className={`p-3 rounded-xl border transition-all ${
                state.turnUserId === uId && state.status === 'playing'
                  ? 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-400/30'
                  : 'bg-neutral-900/60 border-neutral-800'
              }`}
            >
              <div className="flex flex-col space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="truncate">
                    <div className="text-xs sm:text-sm font-bold text-neutral-200 truncate max-w-[110px]">
                      {uppercaseName}
                    </div>
                    {uId === currentUserId && (
                      <span className="text-[10px] text-amber-400 font-mono font-semibold uppercase">
                        (TÚ)
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-400">Fichas:</span>
                    <span className="ml-1 text-xs font-bold text-white font-mono">
                      {state.hands[uId]?.length || 0}
                    </span>
                  </div>
                </div>

                {/* Vidas */}
                <div className="pt-1 border-t border-neutral-800/80 flex items-center justify-between">
                  <PlayerLives lives={pLives} size="sm" showText={false} />
                  <span className="text-[10px] text-neutral-400 font-mono">
                    Pts: {state.cumulativeScores[uId] || 0}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mesa del Dominó */}
      <div
        id="domino-board-table"
        className="w-full min-h-[220px] sm:min-h-[260px] p-4 rounded-2xl bg-gradient-to-b from-emerald-950/70 to-neutral-950 border-2 border-emerald-900/50 shadow-2xl flex items-center justify-center overflow-x-auto relative mb-4"
      >
        {state.board.length === 0 ? (
          <span className="text-xs sm:text-sm text-emerald-400/60 font-medium italic animate-pulse">
            Mesa limpia. Esperando la primera jugada...
          </span>
        ) : (
          <div id="domino-tiles-chain" className="flex items-center space-x-1 sm:space-x-1.5 py-4 px-2 min-w-max">
            {state.board.map((pt, idx) => (
              <motion.div
                key={idx}
                id={`domino-placed-tile-${idx}`}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-9 h-16 sm:w-11 sm:h-20 bg-neutral-100 rounded-lg border border-neutral-300 shadow-md flex-shrink-0"
              >
                <DominoTileRender
                  tile={pt.flipped ? [pt.tile[1], pt.tile[0]] : pt.tile}
                  mode={viewMode}
                  size="sm"
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Panel de Selección de Extremo */}
      {selectedTile && (
        <div id="domino-side-selector" className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-between w-full max-w-md">
          <span className="text-xs font-bold text-amber-300 uppercase">
            ¿En cuál extremo deseas jugar [{selectedTile[0]}|{selectedTile[1]}]?
          </span>
          <div className="flex space-x-2">
            <button
              id="domino-play-left-btn"
              onClick={() => {
                onPlayTile(selectedTile, 'left');
                setSelectedTile(null);
              }}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs"
            >
              IZQUIERDA
            </button>
            <button
              id="domino-play-right-btn"
              onClick={() => {
                onPlayTile(selectedTile, 'right');
                setSelectedTile(null);
              }}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs"
            >
              DERECHA
            </button>
          </div>
        </div>
      )}

      {/* Mi Mano de Fichas */}
      <div id="domino-my-hand-container" className="w-full flex flex-col items-center">
        <div className="flex items-center justify-between w-full mb-2">
          <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
            TUS FICHAS EN MANO ({myHand.length})
          </span>
          {isMyTurn && !hasPlayableTile && (
            <button
              id="domino-pass-turn-btn"
              onClick={onPassTurn}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 text-xs font-bold transition-colors animate-pulse"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>PASAR TURNO</span>
            </button>
          )}
        </div>

        <div id="domino-hand-grid" className="flex flex-wrap gap-2 justify-center max-w-full">
          {myHand.map((tile, idx) => {
            const isPlayable =
              isMyTurn &&
              (state.leftEnd === null ||
                tile[0] === state.leftEnd ||
                tile[1] === state.leftEnd ||
                tile[0] === state.rightEnd ||
                tile[1] === state.rightEnd);

            return (
              <motion.button
                key={idx}
                id={`domino-hand-tile-${tile[0]}-${tile[1]}`}
                whileHover={isPlayable ? { scale: 1.08, y: -4 } : {}}
                whileTap={isPlayable ? { scale: 0.95 } : {}}
                onClick={() => handleTileClick(tile)}
                disabled={!isPlayable}
                className={`w-11 h-20 sm:w-14 sm:h-24 rounded-xl border-2 transition-all shadow-lg ${
                  isPlayable
                    ? 'bg-gradient-to-b from-amber-100 to-amber-200 border-amber-400 cursor-pointer shadow-amber-500/20 ring-2 ring-amber-400/50'
                    : 'bg-neutral-200 border-neutral-400 opacity-60 cursor-not-allowed'
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
