// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: LA VIEJA
// ==============================================================================

import React from 'react';
import { motion } from 'motion/react';
import { Trophy, RefreshCw, Sparkles } from 'lucide-react';
import type { TicTacToeState } from '../../../types/games';
import { PlayerLives } from './PlayerLives';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';

interface TicTacToeBoardProps {
  state: TicTacToeState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onPlaceSymbol: (cellIndex: number) => void;
  onNextRound?: () => void;
}

export const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  onPlaceSymbol,
  onNextRound,
}) => {
  const playerSymbols = state?.playerSymbols || {};
  const playerNames = state?.playerNames || {};
  const scores = state?.scores || {};
  const lives = state?.lives || {};
  const board = Array.isArray(state?.board) ? state.board : Array(9).fill(null);
  const round = state?.round || 1;
  const status = state?.status || 'playing';
  const turnUserId = state?.turnUserId || currentUserId;

  const isMyTurn = turnUserId === currentUserId && status === 'playing';
  const mySymbol = playerSymbols[currentUserId] || 'X';

  const playerIds = Object.keys(playerSymbols);
  const p1Id = playerIds[0] || currentUserId;
  const p2Id = playerIds[1] || '';

  const handleTimeout = () => {
    if (isMyTurn && sessionId) {
      GameRepository.expireTurn(sessionId);
    }
  };

  const activeTurnName = (playerNames[turnUserId] || 'OPONENTE').toUpperCase();

  return (
    <div id="tictactoe-board-container" className="flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full">
      {/* Indicador de Ronda y Modalidad */}
      <div id="tictactoe-round-header" className="w-full mb-3 flex items-center justify-between px-3 py-2.5 rounded-xl bg-neutral-900/40 border border-neutral-800/80 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Ronda <strong className="text-white font-mono text-sm">{round}</strong>
        </span>
        <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
          AL MEJOR DE 5 (3 VICTORIAS PARA GANAR)
        </span>
      </div>

      {/* Marcador superior con Vidas y Nombres en MAYÚSCULAS */}
      <div id="tictactoe-scoreboard" className="grid grid-cols-2 gap-3 sm:gap-4 w-full mb-4">
        {/* Jugador 1 */}
        {p1Id && (
          <div
            id="tictactoe-player-1-card"
            className={`p-3.5 rounded-xl border transition-all ${
              turnUserId === p1Id && status === 'playing'
                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-400/50'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate">
                  <span className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 font-bold flex items-center justify-center text-base border border-red-500/30 shrink-0">
                    X
                  </span>
                  <div className="truncate">
                    <div className="text-xs sm:text-sm font-bold text-neutral-200 truncate max-w-[100px]">
                      {(playerNames[p1Id] || 'JUGADOR 1').toUpperCase()}
                    </div>
                    {p1Id === currentUserId && (
                      <span className="text-[10px] text-amber-400 font-mono tracking-wider font-semibold uppercase">
                        (TÚ)
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xl font-black text-white font-mono">{scores[p1Id] || 0}</span>
              </div>

              {/* Vidas */}
              <div className="pt-1 border-t border-neutral-800/80">
                <PlayerLives
                  lives={lives[p1Id] !== undefined ? lives[p1Id] : 3}
                  size="sm"
                  showText={false}
                />
              </div>
            </div>
          </div>
        )}

        {/* Jugador 2 */}
        {p2Id && (
          <div
            id="tictactoe-player-2-card"
            className={`p-3.5 rounded-xl border transition-all ${
              turnUserId === p2Id && status === 'playing'
                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-400/50'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate">
                  <span className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-base border border-blue-500/30 shrink-0">
                    O
                  </span>
                  <div className="truncate">
                    <div className="text-xs sm:text-sm font-bold text-neutral-200 truncate max-w-[100px]">
                      {(playerNames[p2Id] || 'JUGADOR 2').toUpperCase()}
                    </div>
                    {p2Id === currentUserId && (
                      <span className="text-[10px] text-amber-400 font-mono tracking-wider font-semibold uppercase">
                        (TÚ)
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xl font-black text-white font-mono">{scores[p2Id] || 0}</span>
              </div>

              {/* Vidas */}
              <div className="pt-1 border-t border-neutral-800/80">
                <PlayerLives
                  lives={lives[p2Id] !== undefined ? lives[p2Id] : 3}
                  size="sm"
                  showText={false}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Temporizador de Turno Sincronizado */}
      <div className="w-full mb-3">
        <TurnTimer
          turnExpiresAt={turnExpiresAt}
          durationSeconds={30}
          isMyTurn={isMyTurn}
          activePlayerName={activeTurnName}
          status={state.status}
          onTimeout={handleTimeout}
        />
      </div>

      {/* Estado del turno / Ronda */}
      <div id="tictactoe-status-banner" className="mb-4 text-center">
        {state.status === 'round_won' && (
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold text-sm animate-bounce">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>
              ¡RONDA GANADA POR {(state.playerNames[state.roundWinnerUserId || ''] || 'GANADOR').toUpperCase()}!
            </span>
          </div>
        )}

        {state.status === 'draw' && (
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-300 font-semibold text-sm">
            <span>¡EMPATE EN EL TABLERO! TODAS LAS CASILLAS OCUPADAS.</span>
          </div>
        )}

        {state.status === 'game_won' && (
          <div className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 text-neutral-950 font-bold text-base shadow-lg">
            <Sparkles className="w-5 h-5 text-neutral-950" />
            <span>
              ¡PARTIDA CONCLUIDA! GANADOR:{' '}
              {(state.playerNames[state.winnerUserId || ''] || 'GANADOR').toUpperCase()}
            </span>
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
              {symbol}
            </motion.button>
          );
        })}
      </div>

      {(state.status === 'round_won' || state.status === 'draw') && onNextRound && (
        <button
          onClick={onNextRound}
          className="mt-4 flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm shadow-lg transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          <span>SIGUIENTE RONDA</span>
        </button>
      )}
    </div>
  );
};
