// ==============================================================================
// RASPANDO LA OLLA — ATRAPAÍTO (PARCHÍS CRIOLLO MODERNO)
// ==============================================================================
// Rediseño visual profesional: Tablero central SVG 3D, 4 zonas de jugador,
// dado realista, chat en tiempo real, temporizador sincronizado y estética púrpura.
// ==============================================================================

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, AlertCircle, RefreshCw, Volume2, VolumeX, ShieldAlert } from 'lucide-react';
import type { AtrapaitoState, AtrapaitoColor, AtrapaitoPiece } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { AtrapaitoBoardSVG } from './atrapaito/AtrapaitoBoardSVG';
import { AtrapaitoDice } from './atrapaito/AtrapaitoDice';
import { AtrapaitoPlayerCard } from './atrapaito/AtrapaitoPlayerCard';
import { AtrapaitoChat } from './atrapaito/AtrapaitoChat';
import { TurnTimer } from './TurnTimer';

export interface AtrapaitoBoardProps {
  state: AtrapaitoState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  table?: GameTable;
  players?: TablePlayer[];
  realtimeStatus?: string;
  onlineUsers?: string[] | Set<string>;
  onExit?: () => void;
  onPlayAgain?: () => void;
  onRollDice: () => void;
  onMovePiece: (pieceId: string) => void;
}

export const AtrapaitoBoard: React.FC<AtrapaitoBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  table,
  players = [],
  realtimeStatus = 'CONNECTED',
  onlineUsers = [],
  onExit,
  onPlayAgain,
  onRollDice,
  onMovePiece,
}) => {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Set de usuarios en línea normalizado
  const onlineSet = useMemo(() => {
    return onlineUsers instanceof Set ? onlineUsers : new Set(onlineUsers || []);
  }, [onlineUsers]);

  // Determinar turno actual y roles
  const isMyTurn = state.currentTurnUserId === currentUserId;
  const myPlayer = state.players[currentUserId];
  const activePlayerName = state.playerNames[state.currentTurnUserId] || 'Jugador';
  const activeColor = state.activeColor || 'yellow';

  // Conjunto de IDs de fichas legales para resaltar y permitir clic
  const legalPieceIdsSet = useMemo(() => {
    return new Set(state.legalMoves.map((m) => m.pieceId));
  }, [state.legalMoves]);

  // Lista de piezas legales del usuario actual para el selector rápido en móvil
  const myLegalPieces = useMemo(() => {
    if (!isMyTurn || state.turnPhase !== 'SELECT_PIECE') return [];
    return (Object.values(state.pieces) as AtrapaitoPiece[]).filter((p) =>
      legalPieceIdsSet.has(p.id)
    );
  }, [isMyTurn, state.turnPhase, state.pieces, legalPieceIdsSet]);

  // Jugadores organizados por color para los 4 cuadrantes del tablero
  const playersByColor = useMemo(() => {
    const map: Record<AtrapaitoColor, { player?: any; pieces: AtrapaitoPiece[] }> = {
      yellow: { pieces: [] },
      green: { pieces: [] },
      red: { pieces: [] },
      blue: { pieces: [] },
      orange: { pieces: [] },
      cyan: { pieces: [] },
    };

    // Asignar piezas a cada color
    Object.values(state.pieces).forEach((piece) => {
      if (map[piece.color]) {
        map[piece.color].pieces.push(piece);
      }
    });

    // Asignar jugador a cada color
    Object.values(state.players).forEach((p) => {
      p.colors.forEach((c) => {
        if (map[c]) {
          map[c].player = p;
        }
      });
    });

    return map;
  }, [state.pieces, state.players]);

  // Conteo de jugadores activos
  const seatedPlayersCount = Object.keys(state.players).length || players.length || 1;

  // Estado del dado
  const canRollDice = isMyTurn && (state.turnPhase === 'ROLL_DICE' || state.turnPhase === 'BONUS_MOVE');

  return (
    <div
      id="atrapaito-arena-container"
      className="relative flex flex-col min-h-screen w-full bg-gradient-to-b from-[#180829] via-[#0e0419] to-[#08020e] text-slate-100 select-none overflow-x-hidden"
    >
      {/* 1. ENCABEZADO SUPERIOR MODERNO */}
      <header className="w-full border-b border-purple-950/40 bg-neutral-950/80 backdrop-blur-md px-3 sm:px-6 py-2.5 flex items-center justify-between z-30 sticky top-0">
        {/* Botón Salir con modal de confirmación */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 border border-purple-900/40 flex items-center justify-center text-neutral-300 hover:text-white transition-all shadow-md touch-manipulation cursor-pointer"
            title="Salir de la mesa"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Identidad del juego */}
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-black tracking-wider text-white flex items-center gap-1.5">
                <span>ATRAPAÍTO</span>
                <span className="text-xs">🇻🇪</span>
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-mono font-black uppercase">
                {state.mode.replace(/_/g, ' ')}
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline">
              Parchís Criollo • PulsoPLAY
            </span>
          </div>
        </div>

        {/* Centro / Temporizador Sincronizado */}
        <div className="flex items-center space-x-2">
          <TurnTimer
            turnExpiresAt={turnExpiresAt || (state.turnDeadlineAt ? new Date(state.turnDeadlineAt).toISOString() : undefined)}
            durationSeconds={30}
            isMyTurn={isMyTurn}
            activePlayerName={activePlayerName}
            status={state.status === 'game_won' ? 'finished' : 'playing'}
          />
        </div>

        {/* Lado derecho: Jugadores en mesa, audio y estado realtime */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs font-mono text-neutral-300">
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-bold text-white">{seatedPlayersCount}</span>
            <span className="text-neutral-500">/4</span>
          </div>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="w-9 h-9 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title={soundEnabled ? 'Silenciar sonidos' : 'Activar sonidos'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-purple-400" /> : <VolumeX className="w-4 h-4 text-neutral-600" />}
          </button>

          {/* Badge Realtime */}
          <div
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider border ${
              realtimeStatus === 'CONNECTED'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                realtimeStatus === 'CONNECTED' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span className="hidden sm:inline">
              {realtimeStatus === 'CONNECTED' ? 'EN VIVO' : 'CONECTANDO'}
            </span>
          </div>
        </div>
      </header>

      {/* 2. CHAT FLOTANTE SUPERIOR (MENSAJES AUTO-FADE) */}
      <AtrapaitoChat
        tableId={table?.id || sessionId || 'mesa_atrapaito'}
        currentUserId={currentUserId}
        currentUserName={myPlayer?.name || 'Jugador'}
        currentUserAvatar={myPlayer?.avatarUrl}
      />

      {/* 3. ALERTA DE RECONEXIÓN (SI CORRESPONDE) */}
      {realtimeStatus !== 'CONNECTED' && (
        <div className="w-full bg-amber-500/20 border-b border-amber-500/40 px-4 py-1.5 flex items-center justify-center space-x-2 text-xs font-mono text-amber-300 z-20">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Sincronizando estado en vivo con la mesa de Atrapaíto...</span>
        </div>
      )}

      {/* 4. CONTENIDO PRINCIPAL: JUGADORES + TABLERO CENTRAL */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 max-w-5xl mx-auto w-full">
        {/* FILA SUPERIOR DE JUGADORES (Amarillo y Verde) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 w-full max-w-xl mb-2 sm:mb-3">
          {/* Jugador Amarillo (Top-Left) */}
          <AtrapaitoPlayerCard
            player={playersByColor.yellow.player}
            color="yellow"
            isCurrentTurn={state.currentTurnUserId === playersByColor.yellow.player?.userId}
            isLocalUser={currentUserId === playersByColor.yellow.player?.userId}
            isOnline={onlineSet.has(playersByColor.yellow.player?.userId || '')}
            lives={playersByColor.yellow.player?.lives ?? 3}
            pieces={playersByColor.yellow.pieces}
            seatLabel="Asiento 1"
          />

          {/* Jugador Verde (Top-Right) */}
          <AtrapaitoPlayerCard
            player={playersByColor.green.player}
            color="green"
            isCurrentTurn={state.currentTurnUserId === playersByColor.green.player?.userId}
            isLocalUser={currentUserId === playersByColor.green.player?.userId}
            isOnline={onlineSet.has(playersByColor.green.player?.userId || '')}
            lives={playersByColor.green.player?.lives ?? 3}
            pieces={playersByColor.green.pieces}
            seatLabel="Asiento 4"
          />
        </div>

        {/* TABLERO CENTRAL SVG RESPONSIVE */}
        <div className="relative w-full max-w-xl aspect-square rounded-3xl p-1 sm:p-2 bg-gradient-to-b from-purple-950/30 to-black/60 border border-purple-900/40 shadow-[0_10px_40px_-10px_rgba(147,51,234,0.3)] flex items-center justify-center">
          <AtrapaitoBoardSVG
            state={state}
            currentUserId={currentUserId}
            legalPieceIds={legalPieceIdsSet}
            onMovePiece={onMovePiece}
          />
        </div>

        {/* FILA INFERIOR DE JUGADORES (Azul y Rojo) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 w-full max-w-xl mt-2 sm:mb-3">
          {/* Jugador Azul (Bottom-Left) */}
          <AtrapaitoPlayerCard
            player={playersByColor.blue.player}
            color="blue"
            isCurrentTurn={state.currentTurnUserId === playersByColor.blue.player?.userId}
            isLocalUser={currentUserId === playersByColor.blue.player?.userId}
            isOnline={onlineSet.has(playersByColor.blue.player?.userId || '')}
            lives={playersByColor.blue.player?.lives ?? 3}
            pieces={playersByColor.blue.pieces}
            seatLabel="Asiento 2"
          />

          {/* Jugador Rojo (Bottom-Right) */}
          <AtrapaitoPlayerCard
            player={playersByColor.red.player}
            color="red"
            isCurrentTurn={state.currentTurnUserId === playersByColor.red.player?.userId}
            isLocalUser={currentUserId === playersByColor.red.player?.userId}
            isOnline={onlineSet.has(playersByColor.red.player?.userId || '')}
            lives={playersByColor.red.player?.lives ?? 3}
            pieces={playersByColor.red.pieces}
            seatLabel="Asiento 3"
          />
        </div>

        {/* 5. ZONA DE CONTROLES, DADO Y ACCIONES RÁPIDAS */}
        <div className="w-full max-w-xl bg-neutral-900/90 border border-purple-900/40 rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-md flex flex-col space-y-3 mt-2">
          {/* Fila principal: Dado 3D + Botón de Acción Grande */}
          <div className="flex items-center justify-between gap-3">
            {/* Dado 3D Interactivo */}
            <div className="shrink-0 flex items-center space-x-2">
              <AtrapaitoDice
                value={state.diceValue}
                isRolling={false}
                canRoll={canRollDice}
                onRoll={onRollDice}
                consecutiveSixes={state.consecutiveSixes}
                size="md"
              />
            </div>

            {/* Mensaje y Botón de Acción Principal */}
            <div className="flex-1 flex flex-col justify-center">
              {isMyTurn ? (
                <>
                  {canRollDice ? (
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={onRollDice}
                      className="w-full min-h-[48px] py-2.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-black text-sm sm:text-base uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      <span>🎲</span>
                      <span>LANZAR DADO</span>
                    </motion.button>
                  ) : state.turnPhase === 'SELECT_PIECE' ? (
                    <div className="text-center py-2 px-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-bold animate-pulse">
                      ✨ Toca tu ficha en el tablero o abajo para mover
                    </div>
                  ) : state.turnPhase === 'BONUS_MOVE' ? (
                    <div className="text-center py-2 px-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-bold">
                      🔥 ¡Bonus de movimiento activo! (+{state.pendingBonus?.bonusSteps || 0} pasos)
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-center py-2.5 px-3 rounded-2xl bg-neutral-950/80 border border-neutral-800 text-neutral-400 text-xs sm:text-sm font-mono flex items-center justify-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Esperando a {activePlayerName}...</span>
                </div>
              )}
            </div>
          </div>

          {/* Selector rápido de fichas para móviles (cuando es momento de mover) */}
          <AnimatePresence>
            {myLegalPieces.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-1 border-t border-neutral-800 flex flex-col space-y-1.5"
              >
                <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                  Movimientos Disponibles:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {myLegalPieces.map((piece) => {
                    const moveInfo = state.legalMoves.find((m) => m.pieceId === piece.id);
                    const isExiting = piece.state === 'HOME';
                    return (
                      <motion.button
                        key={piece.id}
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onMovePiece(piece.id)}
                        className="py-2 px-2.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/40 text-left transition-colors flex flex-col justify-center cursor-pointer shadow-md"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-white">
                          <span>Ficha #{piece.pieceNumber}</span>
                          <span className="text-amber-400 font-mono text-[10px]">
                            {isExiting ? 'SALIR' : `+${state.diceValue}`}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-neutral-400 truncate">
                          {isExiting
                            ? 'A casilla de salida'
                            : moveInfo
                            ? `A casilla ${moveInfo.toPosition}`
                            : 'Avanzar'}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* 6. MODAL DE CONFIRMACIÓN PARA SALIR DE LA MESA */}
      <AnimatePresence>
        {showExitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-purple-500/30 rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center space-x-3 text-amber-400">
                <ShieldAlert className="w-6 h-6" />
                <h3 className="text-base font-bold text-white">¿Abandonar partida?</h3>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Si sales ahora mientras la partida está en curso, se te considerará retirado y
                podrías perder tu apuesta en la mesa.
              </p>
              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  Continuar Jugando
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExitConfirm(false);
                    onExit?.();
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  Salir de la Mesa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
