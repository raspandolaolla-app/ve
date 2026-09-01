// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DAMAS VENEZOLANAS
// ==============================================================================
// Diseño épico 3D con identidad venezolana, optimizado para móviles
// Compatible 100% con Supabase y GameContainer
// ==============================================================================

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Sparkles, Flame, Zap, Trophy } from 'lucide-react';
import type { CheckersState, CheckersMove } from '../../../types/games';
import { PlayerLives } from './PlayerLives';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';

interface CheckersBoardProps {
  state: CheckersState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onMovePiece: (move: CheckersMove) => void;
}

export const CheckersBoard: React.FC<CheckersBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  onMovePiece,
}) => {
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const isMyTurn = state.turnUserId === currentUserId && state.status === 'playing';
  const myPlayer = state.players.find((p) => p.userId === currentUserId);
  const opponent = state.players.find((p) => p.userId !== currentUserId);

  // Determinar perspectiva de tablero según el color asignado
  const isPlayer1 = myPlayer?.playerNumber === 1;

  const getLogicalCoords = (vr: number, vc: number) => {
    return {
      row: isPlayer1 ? 7 - vr : vr,
      col: isPlayer1 ? 7 - vc : vc,
    };
  };

  const handleCellClick = (vr: number, vc: number) => {
    if (!isMyTurn) return;

    const { row, col } = getLogicalCoords(vr, vc);
    const clickedPiece = state.board[row][col];

    // Si ya seleccionó una ficha propia y hace clic en una casilla destino
    if (selectedCell) {
      if (selectedCell.row === row && selectedCell.col === col) {
        setSelectedCell(null); // Deseleccionar
        return;
      }

      if (!clickedPiece) {
        // Enviar movimiento en coordenadas lógicas autoritativas
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

  const handleTimeout = () => {
    if (isMyTurn && sessionId) {
      GameRepository.expireTurn(sessionId);
    }
  };

  const activeTurnPlayer = state.players.find((p) => p.userId === state.turnUserId);

  return (
    <div id="checkers-board-container" className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-xl mx-auto w-full">
      {/* Header Épico con Gradiente Venezolano */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
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
                Damas
              </div>
              <div className="text-lg sm:text-xl font-black text-white font-mono leading-none">
                8×8 Criollo
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-blue-500/20 to-red-500/20 border border-amber-500/30">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-wider">
              Duelo Épico
            </span>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
      </motion.div>

      {/* Marcador Épico con Efectos 3D */}
      <div id="checkers-scoreboard" className="grid grid-cols-2 gap-2 sm:gap-3 w-full mb-3">
        {state.players.map((p, index) => {
          const pLives = (state.lives && state.lives[p.userId] !== undefined) ? state.lives[p.userId] : 3;
          const uppercaseName = (p.name || 'JUGADOR').toUpperCase();
          const isActive = state.turnUserId === p.userId && state.status === 'playing';
          const captures = state.capturedCount[p.userId] || 0;

          return (
            <motion.div
              key={p.userId}
              initial={{ x: index === 0 ? -50 : 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              id={`checkers-player-card-${p.userId}`}
              className={`relative p-3 sm:p-4 rounded-2xl border-2 transition-all duration-300 ${
                isActive
                  ? 'bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-transparent border-amber-500 shadow-lg shadow-amber-500/30'
                  : 'bg-gradient-to-br from-neutral-900/80 via-neutral-900/60 to-neutral-950/40 border-neutral-800'
              }`}
              style={{
                backdropFilter: 'blur(10px)',
                boxShadow: isActive
                  ? '0 8px 32px rgba(251, 191, 36, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  : '0 4px 16px rgba(0, 0, 0, 0.3)',
              }}
            >
              {isActive && (
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/20 to-transparent pointer-events-none"
                />
              )}

              <div className="relative z-10 flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 truncate min-w-0">
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-lg sm:text-xl font-black border-2 shrink-0 ${
                        p.playerNumber === 1
                          ? 'bg-gradient-to-br from-neutral-100 to-neutral-300 border-amber-400/50 text-neutral-900'
                          : 'bg-gradient-to-br from-neutral-800 to-neutral-950 border-red-500/50 text-amber-400'
                      }`}
                      style={{
                        boxShadow: p.playerNumber === 1
                          ? '0 4px 12px rgba(255, 255, 255, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.4)'
                          : '0 4px 12px rgba(239, 68, 68, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {p.playerNumber === 1 ? '⚪' : '⚫'}
                    </motion.div>

                    <div className="truncate min-w-0">
                      <div className="text-xs sm:text-sm font-black text-white truncate max-w-[80px] sm:max-w-[100px] leading-tight">
                        {uppercaseName}
                      </div>
                      <div className="flex items-center space-x-1 mt-0.5">
                        {p.userId === currentUserId && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] text-yellow-400 font-mono tracking-wider font-black uppercase bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/30"
                          >
                            <Zap className="w-2.5 h-2.5" />
                            TÚ
                          </motion.span>
                        )}
                      </div>
                    </div>
                  </div>

                  <motion.div
                    key={captures}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-end"
                  >
                    <div className="text-[9px] sm:text-[10px] text-neutral-400 font-mono">Capturas</div>
                    <div
                      className="text-2xl sm:text-3xl font-black text-white font-mono leading-none"
                      style={{
                        textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
                      }}
                    >
                      {captures}
                    </div>
                  </motion.div>
                </div>

                <div className="pt-2 border-t border-neutral-800/50">
                  <PlayerLives lives={pLives} size="sm" showText={false} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Temporizador de Turno Sincronizado */}
      <div className="w-full mb-3">
        <TurnTimer
          turnExpiresAt={turnExpiresAt}
          durationSeconds={30}
          isMyTurn={isMyTurn}
          activePlayerName={activeTurnPlayer?.name || 'OPONENTE'}
          status={state.status}
          onTimeout={handleTimeout}
        />
      </div>

      {/* Indicador de Color del Jugador */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        id="checkers-color-indicator"
        className="w-full flex items-center justify-between px-3 py-2 mb-3 rounded-xl bg-gradient-to-r from-neutral-900/80 to-neutral-800/80 border-2 border-amber-500/30 text-xs font-bold text-neutral-300"
        style={{
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        }}
      >
        <span className="text-amber-400 font-black uppercase tracking-wider">Tu Color:</span>
        {isPlayer1 ? (
          <span className="flex items-center space-x-1.5 text-neutral-100">
            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-300 border-2 border-amber-400/50 inline-block shadow-lg" />
            <span className="font-black uppercase tracking-wider text-[10px] sm:text-xs">⚪ BLANCAS (ABAJO)</span>
          </span>
        ) : (
          <span className="flex items-center space-x-1.5 text-neutral-100">
            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-950 border-2 border-red-500/50 inline-block shadow-lg" />
            <span className="font-black uppercase tracking-wider text-[10px] sm:text-xs">⚫ NEGRAS (ABAJO)</span>
          </span>
        )}
      </motion.div>

      {/* Banner de Estado */}
      <AnimatePresence>
        {state.status !== 'playing' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="mb-3 text-center"
          >
            <div className="inline-flex items-center space-x-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-neutral-950 font-black text-sm shadow-2xl shadow-amber-500/50 relative overflow-hidden">
              <motion.div
                animate={{ x: [-100, 500] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
              />
              <Trophy className="relative z-10 w-5 h-5" />
              <span className="relative z-10">
                ¡PARTIDA CONCLUIDA! GANADOR: {(state.players.find((p) => p.userId === state.winnerUserId)?.name || 'EMPATE').toUpperCase()}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tablero 8x8 con Efectos 3D Venezolanos */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        id="checkers-grid"
        className="relative grid grid-cols-8 gap-0.5 sm:gap-1 p-2 sm:p-3 rounded-3xl border-2 border-amber-500/30 w-full max-w-[360px] sm:max-w-[420px] aspect-square"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        {Array.from({ length: 8 }).map((_, vr) =>
          Array.from({ length: 8 }).map((_, vc) => {
            const { row: rIdx, col: cIdx } = getLogicalCoords(vr, vc);
            const piece = state.board[rIdx][cIdx];
            const isDarkCell = (rIdx + cIdx) % 2 === 1;
            const isSelected = selectedCell?.row === rIdx && selectedCell?.col === cIdx;
            const isLastMove =
              (state.lastMove?.from.row === rIdx && state.lastMove?.from.col === cIdx) ||
              (state.lastMove?.to.row === rIdx && state.lastMove?.to.col === cIdx);

            return (
              <motion.div
                key={`${vr}_${vc}`}
                id={`checkers-cell-${vr}-${vc}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: (vr * 8 + vc) * 0.005 }}
                onClick={() => handleCellClick(vr, vc)}
                className={`relative flex items-center justify-center select-none aspect-square cursor-pointer transition-all duration-200 ${
                  isDarkCell
                    ? 'bg-gradient-to-br from-neutral-800/90 to-neutral-900/90'
                    : 'bg-gradient-to-br from-neutral-900/40 to-neutral-950/40'
                } ${isSelected ? 'ring-2 ring-amber-400 z-10' : ''} ${
                  isLastMove ? 'bg-amber-950/40' : ''
                }`}
                style={{
                  borderRadius: '4px',
                  boxShadow: isDarkCell
                    ? 'inset 0 1px 2px rgba(0, 0, 0, 0.3)'
                    : 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
                }}
                whileHover={isMyTurn && isDarkCell ? { scale: 1.05 } : {}}
                whileTap={isMyTurn && isDarkCell ? { scale: 0.95 } : {}}
              >
                {/* Efecto de hover para casillas válidas */}
                {isMyTurn && isDarkCell && !piece && (
                  <motion.div
                    animate={{ opacity: [0.2, 0.4, 0.2] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent rounded pointer-events-none"
                  />
                )}

                {/* Pieza de Damas con Efecto 3D */}
                <AnimatePresence>
                  {piece && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 180 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                      className={`relative w-[85%] h-[85%] rounded-full flex items-center justify-center shadow-2xl transition-transform ${
                        piece.player === 1
                          ? 'bg-gradient-to-br from-neutral-100 via-neutral-200 to-neutral-300 border-[3px] border-amber-400/60 text-neutral-900'
                          : 'bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-950 border-[3px] border-red-500/60 text-amber-400'
                      } ${isSelected ? 'scale-110 shadow-amber-500/50' : ''}`}
                      style={{
                        boxShadow: piece.player === 1
                          ? '0 6px 20px rgba(255, 255, 255, 0.4), 0 3px 10px rgba(251, 191, 36, 0.3), inset 0 2px 8px rgba(255, 255, 255, 0.6)'
                          : '0 6px 20px rgba(0, 0, 0, 0.6), 0 3px 10px rgba(239, 68, 68, 0.3), inset 0 2px 8px rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {/* Efecto de brillo superior */}
                      <div className="absolute top-1 left-1/4 right-1/4 h-1/4 bg-gradient-to-b from-white/40 to-transparent rounded-full pointer-events-none" />

                      {/* Corona para Damas */}
                      {piece.isKing && (
                        <motion.div
                          animate={{ rotate: [0, 5, -5, 0] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <Crown className="w-[50%] h-[50%] text-amber-500 drop-shadow-lg" />
                        </motion.div>
                      )}

                      {/* Efecto de pulso para pieza seleccionada */}
                      {isSelected && (
                        <motion.div
                          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="absolute inset-0 rounded-full bg-amber-400/30 pointer-events-none"
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Efecto de último movimiento */}
                {isLastMove && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-transparent rounded pointer-events-none"
                  />
                )}
              </motion.div>
            );
          })
        )}
      </motion.div>

      {/* Footer decorativo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-4 flex items-center justify-center gap-2 text-[10px] text-amber-400/60 font-mono uppercase tracking-wider"
      >
        <div className="w-8 h-px bg-gradient-to-r from-transparent to-amber-500/50" />
        <span>🇻🇪 DAMAS VENEZOLANAS 🇻🇪</span>
        <div className="w-8 h-px bg-gradient-to-l from-transparent to-amber-500/50" />
      </motion.div>
    </div>
  );
};
