// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: LA VIEJA (3 EN RAYA CRIOLLO)
// ==============================================================================
// Diseño moderno 3D con identidad venezolana, optimizado para móviles
// Mantiene compatibilidad total con Supabase y sistema de rondas
// ==============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RefreshCw, Sparkles, Star, Flame, Zap } from 'lucide-react';
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

  // Animación de partículas para celda ganadora
  const WinningParticle = ({ delay }: { delay: number }) => (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
      transition={{ duration: 1.5, delay, repeat: Infinity, repeatDelay: 0.5 }}
      className="absolute w-2 h-2 bg-yellow-400 rounded-full"
    />
  );

  return (
    <div
      id="tictactoe-board-container"
      className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-xl mx-auto w-full"
    >
      {/* Header Épico con Gradiente Venezolano */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        id="tictactoe-round-header"
        className="w-full mb-3 sm:mb-4 relative overflow-hidden rounded-2xl border-2 border-amber-500/30"
        style={{
          background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(59, 130, 246, 0.15) 50%, rgba(239, 68, 68, 0.15) 100%)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="relative z-10 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg"
            >
              <Flame className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <div className="text-[10px] sm:text-xs font-bold text-amber-400 uppercase tracking-wider">
                Ronda
              </div>
              <div className="text-xl sm:text-2xl font-black text-white font-mono leading-none">
                {round}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-blue-500/20 to-red-500/20 border border-amber-500/30">
              <Star className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-wider">
                Al Mejor de 5
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] text-amber-300/80 font-mono mt-0.5">
              (3 Victorias para Ganar)
            </div>
          </div>
        </div>

        {/* Línea decorativa inferior */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
      </motion.div>

      {/* Marcador Épico con Efectos 3D */}
      <div
        id="tictactoe-scoreboard"
        className="grid grid-cols-2 gap-2 sm:gap-3 w-full mb-4"
      >
        {/* Jugador 1 - X */}
        {p1Id && (
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            id="tictactoe-player-1-card"
            className={`relative p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 ${
              turnUserId === p1Id && status === 'playing'
                ? 'bg-gradient-to-br from-red-500/20 via-red-600/10 to-transparent border-red-500 shadow-lg shadow-red-500/30'
                : 'bg-gradient-to-br from-neutral-900/80 via-neutral-900/60 to-neutral-950/40 border-neutral-800'
            }`}
            style={{
              backdropFilter: 'blur(10px)',
              boxShadow: turnUserId === p1Id && status === 'playing' 
                ? '0 8px 32px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                : '0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            {turnUserId === p1Id && status === 'playing' && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/20 to-transparent pointer-events-none"
              />
            )}

            <div className="relative z-10 flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate min-w-0">
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white font-black flex items-center justify-center text-lg sm:text-xl border-2 border-red-400/50 shadow-lg shrink-0"
                    style={{
                      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    X
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                      className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border border-yellow-600"
                    />
                  </motion.div>

                  <div className="truncate min-w-0">
                    <div className="text-xs sm:text-sm font-black text-white truncate max-w-[80px] sm:max-w-[100px] leading-tight">
                      {(playerNames[p1Id] || 'JUGADOR 1').toUpperCase()}
                    </div>
                    {p1Id === currentUserId && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-yellow-400 font-mono tracking-wider font-black uppercase bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/30 mt-0.5"
                      >
                        <Zap className="w-2.5 h-2.5" />
                        TÚ
                      </motion.span>
                    )}
                  </div>
                </div>

                <motion.div
                  key={scores[p1Id] || 0}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-2xl sm:text-3xl font-black text-white font-mono leading-none"
                  style={{
                    textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
                  }}
                >
                  {scores[p1Id] || 0}
                </motion.div>
              </div>

              {/* Vidas */}
              <div className="pt-2 border-t border-neutral-800/50">
                <PlayerLives
                  lives={lives[p1Id] !== undefined ? lives[p1Id] : 3}
                  size="sm"
                  showText={false}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Jugador 2 - O */}
        {p2Id && (
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            id="tictactoe-player-2-card"
            className={`relative p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 ${
              turnUserId === p2Id && status === 'playing'
                ? 'bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-transparent border-blue-500 shadow-lg shadow-blue-500/30'
                : 'bg-gradient-to-br from-neutral-900/80 via-neutral-900/60 to-neutral-950/40 border-neutral-800'
            }`}
            style={{
              backdropFilter: 'blur(10px)',
              boxShadow: turnUserId === p2Id && status === 'playing' 
                ? '0 8px 32px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                : '0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            {turnUserId === p2Id && status === 'playing' && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/20 to-transparent pointer-events-none"
              />
            )}

            <div className="relative z-10 flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate min-w-0">
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: -5 }}
                    className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white font-black flex items-center justify-center text-lg sm:text-xl border-2 border-blue-400/50 shadow-lg shrink-0"
                    style={{
                      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    O
                    <motion.div
                      animate={{ rotate: -360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                      className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full border border-yellow-600"
                    />
                  </motion.div>

                  <div className="truncate min-w-0">
                    <div className="text-xs sm:text-sm font-black text-white truncate max-w-[80px] sm:max-w-[100px] leading-tight">
                      {(playerNames[p2Id] || 'JUGADOR 2').toUpperCase()}
                    </div>
                    {p2Id === currentUserId && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-yellow-400 font-mono tracking-wider font-black uppercase bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/30 mt-0.5"
                      >
                        <Zap className="w-2.5 h-2.5" />
                        TÚ
                      </motion.span>
                    )}
                  </div>
                </div>

                <motion.div
                  key={scores[p2Id] || 0}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-2xl sm:text-3xl font-black text-white font-mono leading-none"
                  style={{
                    textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
                  }}
                >
                  {scores[p2Id] || 0}
                </motion.div>
              </div>

              {/* Vidas */}
              <div className="pt-2 border-t border-neutral-800/50">
                <PlayerLives
                  lives={lives[p2Id] !== undefined ? lives[p2Id] : 3}
                  size="sm"
                  showText={false}
                />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Temporizador de Turno Sincronizado */}
      <div className="w-full mb-3 sm:mb-4">
        <TurnTimer
          turnExpiresAt={turnExpiresAt}
          durationSeconds={30}
          isMyTurn={isMyTurn}
          activePlayerName={activeTurnName}
          status={state.status}
          onTimeout={handleTimeout}
        />
      </div>

      {/* Estado del turno / Ronda con Animaciones */}
      <AnimatePresence mode="wait">
        {state.status === 'round_won' && (
          <motion.div
            key="round-won"
            initial={{ scale: 0.8, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            id="tictactoe-status-banner"
            className="mb-4 text-center"
          >
            <div className="inline-flex items-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500/30 via-yellow-500/30 to-amber-500/30 border-2 border-amber-500/60 text-amber-200 font-black text-sm shadow-2xl shadow-amber-500/30 relative overflow-hidden">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="absolute -left-2 -top-2 w-8 h-8 bg-yellow-400/20 rounded-full blur-xl"
              />
              <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
              <span className="relative z-10">
                ¡RONDA GANADA POR {(state.playerNames[state.roundWinnerUserId || ''] || 'GANADOR').toUpperCase()}!
              </span>
            </div>
          </motion.div>
        )}

        {state.status === 'draw' && (
          <motion.div
            key="draw"
            initial={{ scale: 0.8, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            id="tictactoe-status-banner"
            className="mb-4 text-center"
          >
            <div className="inline-flex items-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-neutral-800 via-neutral-700 to-neutral-800 border-2 border-neutral-600 text-neutral-200 font-black text-sm shadow-xl">
              <span>¡EMPATE EN EL TABLERO!</span>
            </div>
          </motion.div>
        )}

        {state.status === 'game_won' && (
          <motion.div
            key="game-won"
            initial={{ scale: 0.5, opacity: 0, y: -30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            id="tictactoe-status-banner"
            className="mb-4 text-center"
          >
            <div className="inline-flex items-center space-x-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-neutral-950 font-black text-base shadow-2xl shadow-amber-500/50 relative overflow-hidden">
              <motion.div
                animate={{ x: [-100, 500] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
              />
              <Sparkles className="w-6 h-6 text-neutral-950 shrink-0" />
              <span className="relative z-10">
                ¡PARTIDA CONCLUIDA! GANADOR: {(state.playerNames[state.winnerUserId || ''] || 'GANADOR').toUpperCase()}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tablero 3x3 con Efectos 3D Venezolanos */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        id="tictactoe-grid"
        className="relative grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-[320px] sm:max-w-[360px] aspect-square p-3 sm:p-4 rounded-3xl border-2 border-amber-500/30"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Líneas decorativas de fondo */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/3 w-px h-full bg-gradient-to-b from-transparent via-amber-500/20 to-transparent" />
          <div className="absolute top-0 right-1/3 w-px h-full bg-gradient-to-b from-transparent via-amber-500/20 to-transparent" />
          <div className="absolute left-0 top-1/3 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <div className="absolute left-0 bottom-1/3 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
        </div>

        {state.board.map((symbol, index) => {
          const isWinningCell = state.winningLine?.includes(index);
          const isCellEmpty = symbol === null;
          const canClick = isMyTurn && isCellEmpty;

          return (
            <motion.button
              key={index}
              id={`tictactoe-cell-${index}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileHover={canClick ? { scale: 1.05, rotateY: 5 } : {}}
              whileTap={canClick ? { scale: 0.95 } : {}}
              onClick={() => canClick && onPlaceSymbol(index)}
              disabled={!canClick}
              className={`relative flex items-center justify-center rounded-2xl font-black text-5xl sm:text-6xl select-none transition-all duration-300 ${
                isWinningCell
                  ? 'bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600 text-neutral-950 shadow-2xl shadow-amber-500/50 border-2 border-yellow-300'
                  : symbol === 'X'
                  ? 'bg-gradient-to-br from-red-500/20 via-red-600/10 to-red-700/5 text-red-400 border-2 border-red-500/40'
                  : symbol === 'O'
                  ? 'bg-gradient-to-br from-blue-500/20 via-blue-600/10 to-blue-700/5 text-blue-400 border-2 border-blue-500/40'
                  : canClick
                  ? 'bg-gradient-to-br from-neutral-800/60 via-neutral-900/40 to-neutral-950/20 hover:from-amber-500/20 hover:via-yellow-500/10 hover:to-amber-600/5 border-2 border-neutral-700/50 hover:border-amber-500/60 cursor-pointer'
                  : 'bg-gradient-to-br from-neutral-900/30 to-neutral-950/10 border-2 border-neutral-800/30 cursor-not-allowed'
              }`}
              style={{
                boxShadow: isWinningCell
                  ? '0 8px 32px rgba(251, 191, 36, 0.6), inset 0 2px 8px rgba(255, 255, 255, 0.3)'
                  : symbol
                  ? '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  : '0 4px 12px rgba(0, 0, 0, 0.3)',
                perspective: '1000px',
                transformStyle: 'preserve-3d',
              }}
            >
              {symbol === 'X' && (
                <motion.span
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className="drop-shadow-lg"
                  style={{
                    textShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
                  }}
                >
                  X
                </motion.span>
              )}
              {symbol === 'O' && (
                <motion.span
                  initial={{ scale: 0, rotate: 180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className="drop-shadow-lg"
                  style={{
                    textShadow: '0 0 20px rgba(59, 130, 246, 0.6)',
                  }}
                >
                  O
                </motion.span>
              )}

              {isWinningCell && (
                <>
                  <WinningParticle delay={0} />
                  <WinningParticle delay={0.3} />
                  <WinningParticle delay={0.6} />
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute inset-0 rounded-2xl bg-yellow-400/20 pointer-events-none"
                  />
                </>
              )}

              {canClick && !symbol && (
                <motion.div
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent pointer-events-none"
                />
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {/* Botón de Siguiente Ronda */}
      <AnimatePresence>
        {(state.status === 'round_won' || state.status === 'draw') && onNextRound && (
          <motion.button
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            onClick={onNextRound}
            className="mt-5 flex items-center space-x-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:via-yellow-300 hover:to-amber-400 text-neutral-950 font-black text-base shadow-2xl shadow-amber-500/40 transition-all duration-300 relative overflow-hidden group"
            style={{
              boxShadow: '0 8px 32px rgba(251, 191, 36, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.3)',
            }}
          >
            <motion.div
              animate={{ x: [-100, 500] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
            />
            <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            <span className="relative z-10 uppercase tracking-wider">SIGUIENTE RONDA</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Footer decorativo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-4 flex items-center justify-center gap-2 text-[10px] text-amber-400/60 font-mono uppercase tracking-wider"
      >
        <div className="w-8 h-px bg-gradient-to-r from-transparent to-amber-500/50" />
        <span>🇻🇪 3 EN RAYA CRIOLLO 🇻🇪</span>
        <div className="w-8 h-px bg-gradient-to-l from-transparent to-amber-500/50" />
      </motion.div>
    </div>
  );
};
