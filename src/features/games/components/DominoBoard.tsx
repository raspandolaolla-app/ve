// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DOMINÓ VENEZOLANO
// ==============================================================================

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { SkipForward, Sparkles, AlertCircle } from 'lucide-react';
import type { DominoState, DominoTile } from '../../../types/games';

interface DominoBoardProps {
  state: DominoState;
  currentUserId: string;
  onPlayTile: (tile: DominoTile, side: 'left' | 'right') => void;
  onPassTurn: () => void;
}

export const DominoBoard: React.FC<DominoBoardProps> = ({
  state,
  currentUserId,
  onPlayTile,
  onPassTurn,
}) => {
  const [selectedTile, setSelectedTile] = useState<DominoTile | null>(null);

  const isMyTurn = state.turnUserId === currentUserId && state.status === 'playing';
  const myHand = state.hands[currentUserId] || [];

  const handleTileClick = (tile: DominoTile) => {
    if (!isMyTurn) return;

    // Si el tablero está vacío, se juega directo
    if (state.board.length === 0) {
      onPlayTile(tile, 'left');
      return;
    }

    const matchesLeft = tile[0] === state.leftEnd || tile[1] === state.leftEnd;
    const matchesRight = tile[0] === state.rightEnd || tile[1] === state.rightEnd;

    // Si solo empareja por un lado, jugar automáticamente por ese lado
    if (matchesLeft && !matchesRight) {
      onPlayTile(tile, 'left');
      setSelectedTile(null);
    } else if (!matchesLeft && matchesRight) {
      onPlayTile(tile, 'right');
      setSelectedTile(null);
    } else if (matchesLeft && matchesRight) {
      // Abre selector de lado
      setSelectedTile(tile);
    }
  };

  return (
    <div id="domino-board-container" className="flex flex-col items-center justify-between p-4 max-w-2xl mx-auto w-full min-h-[460px]">
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
        className="w-full flex-1 min-h-[220px] rounded-2xl bg-emerald-950/60 border-4 border-amber-900/40 p-4 flex flex-col items-center justify-center relative overflow-x-auto shadow-2xl"
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
                className="w-8 h-16 bg-amber-50 border-2 border-neutral-800 rounded-md flex flex-col items-center justify-between py-1 shadow-md text-neutral-950 font-black text-xs select-none"
              >
                <span>{placed.tile[0]}</span>
                <div className="w-full h-0.5 bg-neutral-800" />
                <span>{placed.tile[1]}</span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Puntas del Tablero */}
        {state.board.length > 0 && (
          <div className="absolute top-2 left-3 right-3 flex justify-between text-[11px] font-mono text-emerald-400">
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
            className="px-3 py-1 bg-amber-500 text-neutral-950 font-bold text-xs rounded-lg"
          >
            Izquierda ({state.leftEnd})
          </button>
          <button
            onClick={() => {
              onPlayTile(selectedTile, 'right');
              setSelectedTile(null);
            }}
            className="px-3 py-1 bg-amber-500 text-neutral-950 font-bold text-xs rounded-lg"
          >
            Derecha ({state.rightEnd})
          </button>
          <button
            onClick={() => setSelectedTile(null)}
            className="px-2 py-1 bg-neutral-800 text-neutral-400 text-xs rounded-lg"
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
              className="flex items-center space-x-1 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg text-xs font-semibold"
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
                className={`w-10 h-20 bg-amber-50 border-2 border-neutral-900 rounded-lg flex flex-col items-center justify-between py-2 shadow-lg font-black text-sm select-none transition-all ${
                  canPlay
                    ? 'cursor-pointer hover:border-amber-500 ring-2 ring-amber-400/40'
                    : 'opacity-40 cursor-not-allowed'
                }`}
              >
                <span className="text-neutral-950">{tile[0]}</span>
                <div className="w-full h-0.5 bg-neutral-900" />
                <span className="text-neutral-950">{tile[1]}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
