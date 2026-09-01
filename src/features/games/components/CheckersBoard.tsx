// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DAMAS VENEZOLANAS
// ==============================================================================
// Diseño premium de madera real con fichas 3D realistas
// Estética clásica elegante con identidad venezolana cálida
// Compatible 100% con Supabase y GameContainer
// ==============================================================================

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Crown, Trophy, Zap } from 'lucide-react';
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

// ==============================================================================
// COMPONENTE: FICHA DE DAMA REALISTA 3D
// ==============================================================================
const CheckerPiece: React.FC<{
  player: number;
  isKing: boolean;
  isSelected: boolean;
}> = ({ player, isKing, isSelected }) => {
  const isWhite = player === 1;

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`relative w-[82%] h-[82%] rounded-full ${isSelected ? 'scale-110' : ''}`}
      style={{
        // Cuerpo principal de la ficha con gradiente radial 3D
        background: isWhite
          ? 'radial-gradient(circle at 32% 28%, #F5E6D3 0%, #E8D5B7 25%, #C9A876 55%, #A8865A 80%, #8B6B43 100%)'
          : 'radial-gradient(circle at 32% 28%, #6B4423 0%, #4E2E17 25%, #3A2010 55%, #2A160A 80%, #1A0D05 100%)',
        // Sombra proyectada realista + anillos concéntricos tallados
        boxShadow: `
          0 4px 8px rgba(0, 0, 0, 0.5),
          0 2px 4px rgba(0, 0, 0, 0.4),
          inset 0 2px 3px rgba(255, 255, 255, ${isWhite ? '0.5' : '0.15'}),
          inset 0 -3px 5px rgba(0, 0, 0, 0.4)
        `,
      }}
    >
      {/* Anillo exterior tallado */}
      <div
        className="absolute inset-[8%] rounded-full"
        style={{
          border: isWhite
            ? '2px solid rgba(139, 107, 67, 0.6)'
            : '2px solid rgba(201, 168, 118, 0.35)',
          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
        }}
      />

      {/* Anillo medio tallado */}
      <div
        className="absolute inset-[20%] rounded-full"
        style={{
          border: isWhite
            ? '1.5px solid rgba(139, 107, 67, 0.45)'
            : '1.5px solid rgba(201, 168, 118, 0.25)',
        }}
      />

      {/* Centro elevado de la ficha */}
      <div
        className="absolute inset-[32%] rounded-full"
        style={{
          background: isWhite
            ? 'radial-gradient(circle at 35% 30%, #FAF0E1 0%, #E8D5B7 50%, #C9A876 100%)'
            : 'radial-gradient(circle at 35% 30%, #5C3A1E 0%, #3A2010 50%, #241207 100%)',
          boxShadow: `
            0 1px 2px rgba(0, 0, 0, 0.3),
            inset 0 1px 2px rgba(255, 255, 255, ${isWhite ? '0.4' : '0.1'})
          `,
        }}
      >
        {/* Corona para Damas */}
        {isKing && (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Crown
              className="w-[80%] h-[80%]"
              style={{
                color: isWhite ? '#B8860B' : '#FFD700',
                filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))',
                strokeWidth: 2.5,
              }}
            />
          </motion.div>
        )}
      </div>

      {/* Brillo superior de iluminación */}
      <div
        className="absolute top-[6%] left-[18%] right-[18%] h-[22%] rounded-full pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.45), transparent)',
          filter: 'blur(1px)',
        }}
      />

      {/* Halo dorado de selección */}
      {isSelected && (
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          className="absolute -inset-1 rounded-full pointer-events-none"
          style={{
            boxShadow: '0 0 0 3px rgba(255, 200, 80, 0.8), 0 0 20px rgba(255, 190, 60, 0.6)',
          }}
        />
      )}
    </motion.div>
  );
};

// ==============================================================================
// COMPONENTE PRINCIPAL DEL TABLERO
// ==============================================================================
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

    if (selectedCell) {
      if (selectedCell.row === row && selectedCell.col === col) {
        setSelectedCell(null);
        return;
      }

      if (!clickedPiece) {
        onMovePiece({
          from: selectedCell,
          to: { row, col },
        });
        setSelectedCell(null);
        return;
      }
    }

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
      {/* ===== MARCADOR SUPERIOR PREMIUM ===== */}
      <div id="checkers-scoreboard" className="grid grid-cols-2 gap-2 sm:gap-3 w-full mb-3">
        {state.players.map((p, index) => {
          const pLives = (state.lives && state.lives[p.userId] !== undefined) ? state.lives[p.userId] : 3;
          const uppercaseName = (p.name || 'JUGADOR').toUpperCase();
          const isActive = state.turnUserId === p.userId && state.status === 'playing';
          const captures = state.capturedCount[p.userId] || 0;
          const isWhitePlayer = p.playerNumber === 1;

          return (
            <motion.div
              key={p.userId}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              id={`checkers-player-card-${p.userId}`}
              className={`relative p-3 rounded-xl border-2 transition-all duration-300 overflow-hidden ${
                isActive ? 'border-amber-500/70' : 'border-[#3E2B1F]'
              }`}
              style={{
                background: 'linear-gradient(145deg, #2B1D14 0%, #241811 50%, #1C120C 100%)',
                boxShadow: isActive
                  ? '0 6px 20px rgba(255, 180, 60, 0.25), inset 0 1px 0 rgba(255, 220, 150, 0.15)'
                  : '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 220, 150, 0.08)',
              }}
            >
              {/* Barra superior indicadora de turno */}
              {isActive && (
                <motion.div
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: 'linear-gradient(to right, transparent, #FFC94B, transparent)' }}
                />
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate min-w-0">
                  {/* Miniatura de ficha del jugador */}
                  <div
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full shrink-0 relative"
                    style={{
                      background: isWhitePlayer
                        ? 'radial-gradient(circle at 32% 28%, #F5E6D3 0%, #E8D5B7 30%, #C9A876 65%, #A8865A 100%)'
                        : 'radial-gradient(circle at 32% 28%, #6B4423 0%, #4E2E17 30%, #3A2010 65%, #241207 100%)',
                      boxShadow: '0 3px 6px rgba(0, 0, 0, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.3), inset 0 -2px 3px rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <div
                      className="absolute inset-[25%] rounded-full"
                      style={{
                        border: isWhitePlayer
                          ? '1.5px solid rgba(139, 107, 67, 0.5)'
                          : '1.5px solid rgba(201, 168, 118, 0.3)',
                      }}
                    />
                  </div>

                  <div className="truncate min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-[#F0E2C8] truncate max-w-[90px] sm:max-w-[110px] leading-tight">
                      {uppercaseName}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {p.userId === currentUserId && (
                        <span className="text-[9px] text-amber-400 font-mono font-bold uppercase">
                          (TÚ)
                        </span>
                      )}
                      {isActive && (
                        <span className="text-[9px] text-amber-300 font-mono uppercase animate-pulse">
                          • Turno
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Capturas */}
                <div className="flex flex-col items-end">
                  <span className="text-[9px] text-[#A8865A] uppercase tracking-wider">Capturas</span>
                  <motion.span
                    key={captures}
                    initial={{ scale: 1.4, color: '#FFC94B' }}
                    animate={{ scale: 1, color: '#F0E2C8' }}
                    className="text-xl sm:text-2xl font-black font-mono leading-none"
                  >
                    {captures}
                  </motion.span>
                </div>
              </div>

              {/* Vidas */}
              <div className="pt-2 mt-2 border-t border-[#3E2B1F]">
                <PlayerLives lives={pLives} size="sm" showText={false} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ===== TEMPORIZADOR ===== */}
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

      {/* ===== INDICADOR DE COLOR ===== */}
      <div
        id="checkers-color-indicator"
        className="w-full flex items-center justify-between px-3 py-2 mb-3 rounded-xl border border-[#3E2B1F]"
        style={{
          background: 'linear-gradient(145deg, #2B1D14 0%, #1C120C 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 220, 150, 0.08)',
        }}
      >
        <span className="text-[10px] font-bold text-[#A8865A] uppercase tracking-wider">Tu color:</span>
        <span className="flex items-center space-x-1.5">
          <span
            className="w-3.5 h-3.5 rounded-full inline-block"
            style={{
              background: isPlayer1
                ? 'radial-gradient(circle at 32% 28%, #F5E6D3, #C9A876 70%, #A8865A)'
                : 'radial-gradient(circle at 32% 28%, #6B4423, #3A2010 70%, #241207)',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.3)',
            }}
          />
          <span className="text-[10px] sm:text-xs font-bold text-[#F0E2C8] uppercase tracking-wider">
            {isPlayer1 ? 'Claras (abajo)' : 'Oscuras (abajo)'}
          </span>
        </span>
      </div>

      {/* ===== BANNER DE VICTORIA ===== */}
      <AnimatePresence>
        {state.status !== 'playing' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="mb-3 text-center"
          >
            <div
              className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl font-black text-sm text-[#2B1D14] relative overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, #FFD97A 0%, #F5C04E 50%, #E0A83A 100%)',
                boxShadow: '0 8px 24px rgba(255, 190, 60, 0.4), inset 0 2px 3px rgba(255, 255, 255, 0.5)',
              }}
            >
              <Trophy className="w-5 h-5" />
              <span>
                ¡PARTIDA CONCLUIDA! GANADOR: {(state.players.find((p) => p.userId === state.winnerUserId)?.name || 'EMPATE').toUpperCase()}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== TABLERO DE MADERA PREMIUM ===== */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="w-full max-w-[380px] sm:max-w-[460px] rounded-xl p-2.5 sm:p-3.5"
        style={{
          // Marco de madera de caoba
          background: 'linear-gradient(145deg, #8B5A2B 0%, #7A4A22 25%, #6B4423 50%, #5C3A1E 75%, #4E2E17 100%)',
          boxShadow: `
            0 20px 50px rgba(0, 0, 0, 0.7),
            0 8px 20px rgba(0, 0, 0, 0.5),
            inset 0 2px 3px rgba(255, 220, 150, 0.3),
            inset 0 -2px 4px rgba(0, 0, 0, 0.5)
          `,
        }}
      >
        {/* Veta de madera del marco */}
        <div
          className="rounded-lg p-1.5 sm:p-2"
          style={{
            background: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0px, transparent 2px, transparent 6px, rgba(0,0,0,0.06) 8px)',
          }}
        >
          {/* Superficie de juego */}
          <div
            id="checkers-grid"
            className="grid grid-cols-8 gap-0 rounded-md overflow-hidden w-full aspect-square"
            style={{
              boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.6)',
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
                const isMyPiece = piece && piece.userId === currentUserId;

                return (
                  <div
                    key={`${vr}_${vc}`}
                    id={`checkers-cell-${vr}-${vc}`}
                    onClick={() => handleCellClick(vr, vc)}
                    className={`relative flex items-center justify-center select-none aspect-square ${
                      isMyTurn && (isMyPiece || (!piece && isDarkCell)) ? 'cursor-pointer' : 'cursor-default'
                    }`}
                    style={{
                      // Casillas de madera: nogal oscuro / arce claro
                      background: isDarkCell
                        ? 'linear-gradient(135deg, #6D4C33 0%, #5D4027 50%, #4E341E 100%)'
                        : 'linear-gradient(135deg, #EFDFC0 0%, #E8D5B7 50%, #DCC69F 100%)',
                      boxShadow: isDarkCell
                        ? 'inset 0 1px 2px rgba(0, 0, 0, 0.25)'
                        : 'inset 0 1px 1px rgba(255, 255, 255, 0.4)',
                    }}
                  >
                    {/* Textura sutil de veta de madera */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-30"
                      style={{
                        background: isDarkCell
                          ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.08) 0px, transparent 1px, transparent 4px, rgba(0,0,0,0.08) 5px)'
                          : 'repeating-linear-gradient(45deg, rgba(139,107,67,0.08) 0px, transparent 1px, transparent 4px, rgba(139,107,67,0.08) 5px)',
                      }}
                    />

                    {/* Resaltado de último movimiento */}
                    {isLastMove && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: 'radial-gradient(circle, rgba(255, 200, 80, 0.35) 0%, rgba(255, 200, 80, 0.15) 100%)',
                        }}
                      />
                    )}

                    {/* Punto de destino válido */}
                    {isMyTurn && selectedCell && !piece && isDarkCell && (
                      <motion.div
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="absolute w-[30%] h-[30%] rounded-full pointer-events-none"
                        style={{
                          background: 'radial-gradient(circle, rgba(255, 210, 90, 0.9) 0%, rgba(255, 190, 60, 0.5) 60%, transparent 100%)',
                          boxShadow: '0 0 12px rgba(255, 190, 60, 0.7)',
                        }}
                      />
                    )}

                    {/* Ficha */}
                    <AnimatePresence>
                      {piece && (
                        <CheckerPiece
                          player={piece.player}
                          isKing={piece.isKing}
                          isSelected={isSelected}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>

      {/* ===== PIE DE TABLERO ===== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-3 flex items-center justify-center gap-2 text-[10px] text-[#A8865A] font-mono uppercase tracking-widest"
      >
        <div className="w-10 h-px" style={{ background: 'linear-gradient(to right, transparent, #8B5A2B)' }} />
        <span>🇻 Damas Venezolanas 🇪</span>
        <div className="w-10 h-px" style={{ background: 'linear-gradient(to left, transparent, #8B5A2B)' }} />
      </motion.div>
    </div>
  );
};
