// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DAMAS (CHECKERS)
// ==============================================================================

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Crown, Sparkles } from 'lucide-react';
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

  // Determinar perspectiva de tablero según el color asignado:
  // Jugador 1 (Blancas): invierte la grilla para tener Blancas en la parte INFERIOR.
  // Jugador 2 (Negras): mantiene la grilla normal (Negras en filas 5-7 -> parte INFERIOR).
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
    <div id="checkers-board-container" className="flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full">
      {/* Marcador Superior con Vidas y Nombres en MAYÚSCULAS */}
      <div id="checkers-scoreboard" className="grid grid-cols-2 gap-3 sm:gap-4 w-full mb-3">
        {state.players.map((p) => {
          const pLives = (state.lives && state.lives[p.userId] !== undefined) ? state.lives[p.userId] : 3;
          const uppercaseName = (p.name || 'JUGADOR').toUpperCase();

          return (
            <div
              key={p.userId}
              id={`checkers-player-card-${p.userId}`}
              className={`p-3 rounded-xl border transition-all ${
                state.turnUserId === p.userId && state.status === 'playing'
                  ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-400/30'
                  : 'bg-neutral-900/60 border-neutral-800'
              }`}
            >
              <div className="flex flex-col space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 truncate">
                    <div
                      className={`w-4 h-4 rounded-full border shrink-0 ${
                        p.playerNumber === 1
                          ? 'bg-neutral-200 border-white shadow-sm'
                          : 'bg-neutral-950 border-neutral-600'
                      }`}
                    />
                    <div className="truncate">
                      <div className="text-xs sm:text-sm font-bold text-neutral-200 truncate max-w-[110px]">
                        {uppercaseName}
                      </div>
                      {p.userId === currentUserId && (
                        <span className="text-[10px] text-amber-400 font-mono font-semibold uppercase">
                          (TÚ)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-neutral-400">Capturas:</span>
                    <span className="ml-1 text-xs font-bold text-white font-mono">
                      {state.capturedCount[p.userId] || 0}
                    </span>
                  </div>
                </div>

                {/* Vidas de Jugador */}
                <div className="pt-1 border-t border-neutral-800/80 flex items-center justify-between">
                  <PlayerLives lives={pLives} size="sm" showText={false} />
                </div>
              </div>
            </div>
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

      {/* Banner de Estado */}
      <div className="mb-3 text-center">
        {state.status !== 'playing' && (
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-neutral-950 font-bold text-sm shadow-lg">
            <Sparkles className="w-4 h-4" />
            <span>
              ¡PARTIDA CONCLUIDA! GANADOR:{' '}
              {(state.players.find((p) => p.userId === state.winnerUserId)?.name || 'EMPATE').toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Indicator of Player Color and Perspective */}
      <div id="checkers-color-indicator" className="w-full flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold text-neutral-300">
        <span>TU COLOR:</span>
        {isPlayer1 ? (
          <span className="flex items-center space-x-1.5 text-amber-300">
            <span className="w-3.5 h-3.5 rounded-full bg-neutral-100 border border-neutral-300 inline-block" />
            <span>⚪ BLANCAS (PIEZAS ABAJO)</span>
          </span>
        ) : (
          <span className="flex items-center space-x-1.5 text-amber-400">
            <span className="w-3.5 h-3.5 rounded-full bg-neutral-950 border border-neutral-600 inline-block" />
            <span>⚫ NEGRAS (PIEZAS ABAJO)</span>
          </span>
        )}
      </div>

      {/* Tablero 8x8 con Perspectiva Visual Correcta */}
      <div
        id="checkers-grid"
        className="grid grid-cols-8 gap-0.5 p-2 rounded-2xl bg-neutral-950 border-2 border-neutral-800 shadow-2xl w-full max-w-[380px] aspect-square"
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
              <div
                key={`${vr}_${vc}`}
                id={`checkers-cell-${vr}-${vc}`}
                onClick={() => handleCellClick(vr, vc)}
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
