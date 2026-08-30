// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: ATRAPAÍTO (PARCHÍS / LUDO VENEZOLANO)
// ==============================================================================
// Componente SVG altamente interactivo, responsivo y adaptativo para Atrapaíto.
// Soporta tableros de 4 y 6 colores, animaciones de dados, casillas seguras,
// barreras, capturas, vidas y resaltado de movimientos legales.
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dices, Heart, Shield, Sparkles, Trophy, Zap, AlertCircle } from 'lucide-react';
import type { AtrapaitoState, AtrapaitoColor, AtrapaitoPiece } from '../../../types/games';
import { BOARD_CONFIG_4, BOARD_CONFIG_6 } from '../engines/AtrapaitoEngine';

interface AtrapaitoBoardProps {
  state: AtrapaitoState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onRollDice: () => void;
  onMovePiece: (pieceId: string) => void;
}

const COLOR_MAP: Record<AtrapaitoColor, { bg: string; fill: string; border: string; text: string; hex: string }> = {
  yellow: { bg: 'bg-yellow-500', fill: 'fill-yellow-500', border: 'border-yellow-400', text: 'text-yellow-400', hex: '#eab308' },
  red: { bg: 'bg-red-600', fill: 'fill-red-600', border: 'border-red-500', text: 'text-red-400', hex: '#dc2626' },
  blue: { bg: 'bg-blue-600', fill: 'fill-blue-600', border: 'border-blue-500', text: 'text-blue-400', hex: '#2563eb' },
  green: { bg: 'bg-emerald-600', fill: 'fill-emerald-600', border: 'border-emerald-500', text: 'text-emerald-400', hex: '#10b981' },
  orange: { bg: 'bg-orange-500', fill: 'fill-orange-500', border: 'border-orange-400', text: 'text-orange-400', hex: '#f97316' },
  cyan: { bg: 'bg-cyan-500', fill: 'fill-cyan-500', border: 'border-cyan-400', text: 'text-cyan-400', hex: '#06b6d4' },
};

export const AtrapaitoBoard: React.FC<AtrapaitoBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  onRollDice,
  onMovePiece,
}) => {
  const isMyTurn = state.currentTurnUserId === currentUserId;
  const myPlayer = state.players[currentUserId];
  const activeColor = state.activeColor || 'yellow';
  const activeColorTheme = COLOR_MAP[activeColor] || COLOR_MAP.yellow;

  // Calculador de tiempo de turno restante
  const [timeLeftSec, setTimeLeftSec] = useState<number>(30);

  useEffect(() => {
    const deadline = state.turnDeadlineAt || (turnExpiresAt ? new Date(turnExpiresAt).getTime() : Date.now() + 30000);
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeftSec(remaining);
    }, 500);

    return () => clearInterval(interval);
  }, [state.turnDeadlineAt, turnExpiresAt]);

  const legalPieceIds = new Set(state.legalMoves.map((m) => m.pieceId));

  return (
    <div id="atrapaito-board-wrapper" className="flex flex-col items-center justify-between w-full max-w-4xl mx-auto p-2 sm:p-4 space-y-4">
      {/* BANNER SUPERIOR: MODO DE JUEGO & TURNO Y VIDAS */}
      <div className="w-full bg-neutral-900/90 border border-neutral-800 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <span className="text-xl">🇻🇪</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-black text-white uppercase tracking-wider">
                ATRAPAÍTO <span className="text-amber-400 text-xs font-mono">({state.mode.replace(/_/g, ' ')})</span>
              </h2>
            </div>
            <p className="text-xs text-neutral-400">
              Parchís venezolano multijugador • Suministrado por Respando La Olla
            </p>
          </div>
        </div>

        {/* TEMPORIZADOR DE TURNO (30s) Y BANNER DE ACCIÓN */}
        <div className="flex items-center space-x-3">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono uppercase text-neutral-400">Tiempo de Turno</span>
            <div className={`text-lg font-black font-mono ${timeLeftSec <= 5 ? 'text-red-500 animate-bounce' : 'text-amber-400'}`}>
              {timeLeftSec}s
            </div>
          </div>
          <div className="w-12 h-1.5 rounded-full bg-neutral-800 overflow-hidden hidden sm:block">
            <div
              className={`h-full transition-all duration-500 ${timeLeftSec <= 5 ? 'bg-red-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(100, (timeLeftSec / 30) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* BANNER DE ESTADO DEL TURNO ACTUAL */}
      <div className={`w-full p-3 rounded-2xl border flex items-center justify-between gap-2 shadow-lg transition-all ${
        isMyTurn
          ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
          : 'bg-neutral-900 border-neutral-800 text-neutral-300'
      }`}>
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${activeColorTheme.bg} animate-pulse`} />
          <span className="text-xs sm:text-sm font-bold">
            {isMyTurn ? '¡ES TU TURNO DE JUGAR!' : `Turno de: ${state.playerNames[state.currentTurnUserId] || 'Jugador'}`}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-mono font-bold ${activeColorTheme.bg} text-neutral-950`}>
            {activeColor}
          </span>
        </div>

        {/* DADO E INDICADOR DE RESULTADO */}
        {state.diceValue !== null && (
          <div className="flex items-center space-x-2 bg-neutral-950 px-3 py-1 rounded-xl border border-neutral-800 font-mono">
            <span className="text-xs text-neutral-400">Dado:</span>
            <span className="text-lg font-black text-amber-400">{state.diceValue}</span>
          </div>
        )}
      </div>

      {/* MENSAJE DE ÚLTIMA ACCIÓN / BONUS */}
      {state.lastActionDescription && (
        <div className="w-full text-xs font-mono text-center px-3 py-2 rounded-xl bg-neutral-900/60 border border-neutral-800 text-neutral-300 flex items-center justify-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">{state.lastActionDescription}</span>
        </div>
      )}

      {/* ÁREA PRINCIPAL DEL TABLERO Y BOTÓN DADO */}
      <div className="w-full flex flex-col md:flex-row items-center justify-center gap-6 my-2">
        {/* TABLERO SVG DE ATRAPAÍTO */}
        <div className="relative w-full max-w-[480px] aspect-square bg-neutral-950 rounded-3xl border-4 border-neutral-800 p-2 shadow-2xl overflow-hidden flex items-center justify-center">
          <AtrapaitoSVG
            state={state}
            currentUserId={currentUserId}
            legalPieceIds={legalPieceIds}
            onMovePiece={onMovePiece}
          />
        </div>

        {/* CONTROLES Y DADO INTERACTIVO */}
        <div className="flex flex-col items-center justify-center space-y-4 w-full md:w-64">
          {/* LANZAR DADO O MENSAJE */}
          {state.turnPhase === 'ROLL_DICE' && isMyTurn ? (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={onRollDice}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-lg uppercase tracking-wider shadow-2xl flex items-center justify-center space-x-2 cursor-pointer border border-amber-300"
            >
              <Dices className="w-6 h-6 animate-spin" />
              <span>LANZAR DADO</span>
            </motion.button>
          ) : state.turnPhase === 'SELECT_PIECE' && isMyTurn ? (
            <div className="w-full p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-center space-y-2">
              <Zap className="w-6 h-6 text-amber-400 mx-auto animate-bounce" />
              <div className="text-xs font-bold text-amber-300 uppercase">
                SELECCIONA UNA FICHA RESALTADA
              </div>
              <p className="text-[11px] text-neutral-400">
                Haz clic directamente en la ficha sobre el tablero.
              </p>
            </div>
          ) : (
            <div className="w-full p-4 rounded-2xl bg-neutral-900 border border-neutral-800 text-center text-xs text-neutral-400">
              Esperando acción del jugador actual...
            </div>
          )}

          {/* LISTA DE FICHAS CON MOVIMIENTOS LEGALES */}
          {isMyTurn && state.legalMoves.length > 0 && (
            <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-3 space-y-2">
              <span className="text-[11px] font-bold text-neutral-300 uppercase block mb-1">
                Fichas disponibles para mover:
              </span>
              <div className="flex flex-wrap gap-2 justify-center">
                {state.legalMoves.map((m) => {
                  const piece = state.pieces[m.pieceId];
                  const colorTheme = COLOR_MAP[piece?.color || 'yellow'];
                  return (
                    <motion.button
                      key={m.pieceId}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onMovePiece(m.pieceId)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-mono flex items-center space-x-1.5 cursor-pointer ${colorTheme.bg} text-neutral-950 border-white/40 shadow-lg`}
                    >
                      <span>Ficha #{piece?.pieceNumber}</span>
                      <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded">+{m.steps}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PANEL DE JUGADORES Y VIDAS */}
          <div className="w-full bg-neutral-900/80 border border-neutral-800 rounded-2xl p-3 space-y-2">
            <span className="text-[11px] font-mono text-neutral-400 uppercase block border-b border-neutral-800 pb-1">
              Jugadores y Vidas (3 ❤️)
            </span>
            <div className="space-y-1.5">
              {state.playerOrder.map((uId) => {
                const player = state.players[uId];
                if (!player) return null;
                const isCurrent = uId === state.currentTurnUserId;
                const isUser = uId === currentUserId;
                const lives = state.lives[uId] ?? 3;

                return (
                  <div
                    key={uId}
                    className={`p-2 rounded-xl border flex items-center justify-between text-xs ${
                      isCurrent
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div className="flex space-x-0.5">
                        {player.colors.map((c) => (
                          <div key={c} className={`w-2.5 h-2.5 rounded-full ${COLOR_MAP[c]?.bg}`} />
                        ))}
                      </div>
                      <span className="font-semibold truncate max-w-[100px]">
                        {player.name} {isUser && '(Tú)'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      {[1, 2, 3].map((heartNum) => (
                        <Heart
                          key={heartNum}
                          className={`w-3.5 h-3.5 ${
                            heartNum <= lives
                              ? 'text-red-500 fill-red-500 animate-pulse'
                              : 'text-neutral-700 fill-neutral-800'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==============================================================================
// TABLERO SVG COMPLETO DE ATRAPAÍTO / PARCHÍS VENEZOLANO
// ==============================================================================
interface AtrapaitoSVGProps {
  state: AtrapaitoState;
  currentUserId: string;
  legalPieceIds: Set<string>;
  onMovePiece: (pieceId: string) => void;
}

const AtrapaitoSVG: React.FC<AtrapaitoSVGProps> = ({
  state,
  currentUserId,
  legalPieceIds,
  onMovePiece,
}) => {
  // Dimensiones del canvas SVG (500x500 para 4 colores)
  return (
    <svg viewBox="0 0 500 500" className="w-full h-full select-none">
      {/* FONDO PRINCIPAL DEL TABLERO */}
      <rect x="0" y="0" width="500" height="500" fill="#171717" rx="20" />

      {/* CASAS / BASES DE LOS 4 COLORES */}
      {/* Top-Left: AMARILLO */}
      <rect x="10" y="10" width="190" height="190" fill="#eab308" rx="16" opacity="0.9" />
      <rect x="30" y="30" width="150" height="150" fill="#09090b" rx="12" />

      {/* Top-Right: ROJO */}
      <rect x="300" y="10" width="190" height="190" fill="#dc2626" rx="16" opacity="0.9" />
      <rect x="320" y="30" width="150" height="150" fill="#09090b" rx="12" />

      {/* Bottom-Right: VERDE */}
      <rect x="300" y="300" width="190" height="190" fill="#10b981" rx="16" opacity="0.9" />
      <rect x="320" y="320" width="150" height="150" fill="#09090b" rx="12" />

      {/* Bottom-Left: AZUL */}
      <rect x="10" y="300" width="190" height="190" fill="#2563eb" rx="16" opacity="0.9" />
      <rect x="30" y="320" width="150" height="150" fill="#09090b" rx="12" />

      {/* META CENTRAL EN TRIÁNGULOS DE COLORES */}
      <polygon points="200,200 250,250 200,300" fill="#2563eb" opacity="0.8" />
      <polygon points="200,200 250,250 300,200" fill="#eab308" opacity="0.8" />
      <polygon points="300,200 250,250 300,300" fill="#dc2626" opacity="0.8" />
      <polygon points="200,300 250,250 300,300" fill="#10b981" opacity="0.8" />
      <circle cx="250" cy="250" r="22" fill="#09090b" stroke="#f59e0b" strokeWidth="3" />
      <text x="250" y="255" textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="bold">META</text>

      {/* CASILLAS Y PASILLOS PRINCIPALES */}
      {/* Pasillo Amarillo Top (X: 200..300, Y: 10..200) */}
      <rect x="200" y="10" width="100" height="190" fill="#18181b" stroke="#27272a" strokeWidth="1" />
      <rect x="233" y="10" width="34" height="190" fill="#eab308" opacity="0.2" />

      {/* Pasillo Rojo Right (X: 300..490, Y: 200..300) */}
      <rect x="300" y="200" width="190" height="100" fill="#18181b" stroke="#27272a" strokeWidth="1" />
      <rect x="300" y="233" width="190" height="34" fill="#dc2626" opacity="0.2" />

      {/* Pasillo Verde Bottom (X: 200..300, Y: 300..490) */}
      <rect x="200" y="300" width="100" height="190" fill="#18181b" stroke="#27272a" strokeWidth="1" />
      <rect x="233" y="300" width="34" height="190" fill="#10b981" opacity="0.2" />

      {/* Pasillo Azul Left (X: 10..200, Y: 200..300) */}
      <rect x="10" y="200" width="190" height="100" fill="#18181b" stroke="#27272a" strokeWidth="1" />
      <rect x="10" y="233" width="190" height="34" fill="#2563eb" opacity="0.2" />

      {/* RENDERIZADO DE FICHAS */}
      {(Object.values(state.pieces) as AtrapaitoPiece[]).map((piece) => {
        const isLegal = legalPieceIds.has(piece.id);
        const coords = getPieceSVGCoordinates(piece);

        return (
          <g
            key={piece.id}
            onClick={() => isLegal && onMovePiece(piece.id)}
            className={isLegal ? 'cursor-pointer hover:scale-110 transition-transform' : ''}
          >
            {/* Halo brillante para fichas con movimiento legal */}
            {isLegal && (
              <circle
                cx={coords.x}
                cy={coords.y}
                r="18"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3"
                className="animate-ping"
              />
            )}

            <circle
              cx={coords.x}
              cy={coords.y}
              r="14"
              fill={COLOR_MAP[piece.color]?.hex || '#ffffff'}
              stroke="#ffffff"
              strokeWidth="2"
              className="shadow-lg"
            />
            <text
              x={coords.x}
              y={coords.y + 4}
              textAnchor="middle"
              fill="#09090b"
              fontSize="10"
              fontWeight="900"
            >
              {piece.pieceNumber}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// Convierte la posición lógica de una ficha en coordenadas X,Y dentro del canvas SVG (500x500)
function getPieceSVGCoordinates(piece: AtrapaitoPiece): { x: number; y: number } {
  // 1. Casa / Home Base
  if (piece.state === 'HOME' || piece.position === 0) {
    const offsets = [
      { x: 70, y: 70 },
      { x: 140, y: 70 },
      { x: 70, y: 140 },
      { x: 140, y: 140 },
      { x: 105, y: 70 },
      { x: 105, y: 140 },
    ];
    const offset = offsets[(piece.pieceNumber - 1) % offsets.length];

    if (piece.color === 'yellow') return { x: offset.x, y: offset.y };
    if (piece.color === 'red') return { x: 300 + offset.x, y: offset.y };
    if (piece.color === 'green') return { x: 300 + offset.x, y: 300 + offset.y };
    if (piece.color === 'blue') return { x: offset.x, y: 300 + offset.y };
  }

  // 2. Meta final alcanzada
  if (piece.state === 'FINISHED' || piece.position === 999) {
    if (piece.color === 'yellow') return { x: 250, y: 220 };
    if (piece.color === 'red') return { x: 280, y: 250 };
    if (piece.color === 'green') return { x: 250, y: 280 };
    if (piece.color === 'blue') return { x: 220, y: 250 };
  }

  // 3. Pasillo Final (101 a 108)
  if (piece.state === 'FINAL_PATH' || piece.position >= 101) {
    const step = piece.position - 100;
    if (piece.color === 'yellow') return { x: 250, y: 20 + step * 20 };
    if (piece.color === 'red') return { x: 480 - step * 20, y: 250 };
    if (piece.color === 'green') return { x: 250, y: 480 - step * 20 };
    if (piece.color === 'blue') return { x: 20 + step * 20, y: 250 };
  }

  // 4. Recorrido Principal (Circuito 1 a 68)
  const pos = piece.position;
  if (pos >= 1 && pos <= 17) {
    return { x: 200 + (pos % 3) * 33, y: 20 + Math.floor(pos / 3) * 28 };
  } else if (pos >= 18 && pos <= 34) {
    return { x: 320 + Math.floor((pos - 18) / 3) * 28, y: 200 + ((pos - 18) % 3) * 33 };
  } else if (pos >= 35 && pos <= 51) {
    return { x: 280 - (pos % 3) * 33, y: 320 + Math.floor((pos - 35) / 3) * 28 };
  } else {
    return { x: 180 - Math.floor((pos - 52) / 3) * 28, y: 280 - ((pos - 52) % 3) * 33 };
  }
}
