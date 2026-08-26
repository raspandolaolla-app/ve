// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: 3 EN RAYA (TIC TAC TOE)
// ==============================================================================

import React from 'react';
import { motion } from 'motion/react';
import { Trophy, RefreshCw, Sparkles } from 'lucide-react';
import type { TicTacToeState } from '../../../types/games';

interface TicTacToeBoardProps {
  state: TicTacToeState;
  currentUserId: string;
  onPlaceSymbol: (cellIndex: number) => void;
  onNextRound?: () => void;
}

export const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({
  state,
  currentUserId,
  onPlaceSymbol,
  onNextRound,
}) => {
  const isMyTurn = state.turnUserId === currentUserId && state.status === 'playing';
  const mySymbol = state.playerSymbols[currentUserId] || 'X';

  const playerIds = Object.keys(state.playerSymbols);
  const p1Id = playerIds[0];
  const p2Id = playerIds[1];

  return (
    <div id="tictactoe-board-container" className="flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full">
      {/* Marcador superior */}
      <div id="tictactoe-scoreboard" className="grid grid-cols-2 gap-4 w-full mb-6">
        {/* Jugador 1 */}
        {p1Id && (
          <div
            id="tictactoe-player-1-card"
            className={`p-4 rounded-xl border transition-all ${
              state.turnUserId === p1Id && state.status === 'playing'
                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-400/50'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 font-bold flex items-center justify-center text-lg border border-red-500/30">
                  X
                </span>
                <div>
                  <div className="text-sm font-semibold text-neutral-200 truncate max-w-[110px]">
                    {state.playerNames[p1Id] || 'Jugador 1'}
                  </div>
                  {p1Id === currentUserId && (
                    <span className="text-[10px] text-amber-400 font-mono tracking-wider font-semibold uppercase">
                      (Tú)
                    </span>
                  )}
                </div>
              </div>
              <span className="text-2xl font-black text-white font-mono">{state.scores[p1Id] || 0}</span>
            </div>
          </div>
        )}

        {/* Jugador 2 */}
        {p2Id && (
          <div
            id="tictactoe-player-2-card"
            className={`p-4 rounded-xl border transition-all ${
              state.turnUserId === p2Id && state.status === 'playing'
                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-400/50'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-lg border border-blue-500/30">
                  O
                </span>
                <div>
                  <div className="text-sm font-semibold text-neutral-200 truncate max-w-[110px]">
                    {state.playerNames[p2Id] || 'Jugador 2'}
                  </div>
                  {p2Id === currentUserId && (
                    <span className="text-[10px] text-amber-400 font-mono tracking-wider font-semibold uppercase">
                      (Tú)
                    </span>
                  )}
                </div>
              </div>
              <span className="text-2xl font-black text-white font-mono">{state.scores[p2Id] || 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Estado del turno */}
      <div id="tictactoe-status-banner" className="mb-4 text-center">
        {state.status === 'playing' && (
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-sm">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isMyTurn ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-neutral-300 font-medium">
              {isMyTurn ? '¡Es tu turno de marcar!' : `Esperando jugada de ${state.playerNames[state.turnUserId] || 'oponente'}...`}
            </span>
          </div>
        )}

        {state.status === 'round_won' && (
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold text-sm animate-bounce">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>¡Ronda ganada por {state.playerNames[state.roundWinnerUserId || ''] || 'ganador'}!</span>
          </div>
        )}

        {state.status === 'draw' && (
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-300 font-semibold text-sm">
            <span>¡Empate en el tablero! Todas las casillas ocupadas.</span>
          </div>
        )}

        {state.status === 'game_won' && (
          <div className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 text-neutral-950 font-bold text-base shadow-lg">
            <Sparkles className="w-5 h-5 text-neutral-950" />
            <span>¡Partida concluida! Ganador: {state.playerNames[state.winnerUserId || '']}</span>
          </div>
        )}
      </div>

      {/* Cuadrícula 3x3 */}
      <div
        id="tictactoe-grid"
        className="grid grid-cols-3 gap-3 w-full max-w-[340px] aspect-square p-3 rounded-2xl bg-neutral-900/90 border border-neutral-800 shadow-2xl relative"
      >
        {state.board.map((symbol, index) => {
          const isWinningCell = state.winningLine?.includes(index);
          const isCellEmpty = symbol === null;
          const canClick = isMyTurn && isCellEmpty;

          return (
            <motion.button
              key={index}
              id={`tictactoe-cell-${index}`}
              whileHover={canClick ? { scale: 1.05 } : {}}
              whileTap={canClick ? { scale: 0.95 } : {}}
              onClick={() => canClick && onPlaceSymbol(index)}
              disabled={!canClick}
              className={`flex items-center justify-center rounded-xl font-black text-4xl select-none transition-colors ${
                isWinningCell
                  ? 'bg-amber-500 text-neutral-950 shadow-lg ring-2 ring-amber-300'
                  : symbol === 'X'
                  ? 'bg-neutral-800/90 text-red-400 border border-neutral-700/60'
                  : symbol === 'O'
                  ? 'bg-neutral-800/90 text-blue-400 border border-neutral-700/60'
                  : canClick
                  ? 'bg-neutral-800/40 hover:bg-neutral-800/80 border border-neutral-700/40 cursor-pointer hover:border-amber-500/50'
                  : 'bg-neutral-800/20 border border-neutral-800/50 cursor-not-allowed'
              }`}
            >
              {symbol && (
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                >
                  {symbol}
                </motion.span>
              )}
              {!symbol && canClick && (
                <span className="opacity-0 hover:opacity-25 text-neutral-500 text-2xl font-bold">
                  {mySymbol}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Botón Siguiente Ronda si procede */}
      {state.status === 'round_won' && onNextRound && (
        <div className="mt-6">
          <button
            id="tictactoe-next-round-btn"
            onClick={onNextRound}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition-all shadow-lg hover:shadow-amber-500/20"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Iniciar Siguiente Ronda</span>
          </button>
        </div>
      )}
    </div>
  );
};
