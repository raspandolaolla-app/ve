// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: AJEDREZ (CHESS BOARD)
// ==============================================================================
// Tablero interactivo 8x8 con validación FIDE en tiempo real vía chess.js,
// soporte de coronación, enroque, capturas, giro de tablero, historial SAN,
// captura de piezas y sincronización server-authoritative.
// ==============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Chess } from 'chess.js';
import { 
  Trophy, 
  ArrowLeftRight, 
  Flag, 
  Handshake, 
  AlertCircle, 
  Shield, 
  Clock, 
  User 
} from 'lucide-react';
import type { ChessState } from '../../../types/games';
import type { TablePlayer } from '../../../types/tables';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';

// Glifos Unicode de piezas de ajedrez de alta legibilidad
const PIECE_SYMBOLS: Record<string, { w: string; b: string; name: string }> = {
  p: { w: '♙', b: '♟', name: 'Peón' },
  n: { w: '♘', b: '♞', name: 'Caballo' },
  b: { w: '♗', b: '♝', name: 'Alfil' },
  r: { w: '♖', b: '♜', name: 'Torre' },
  q: { w: '♕', b: '♛', name: 'Dama' },
  k: { w: '♔', b: '♚', name: 'Rey' },
};

interface ChessBoardProps {
  state: ChessState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  players: TablePlayer[];
  onMovePiece: (from: string, to: string, promotion?: string) => void;
  onResign?: () => void;
  onOfferDraw?: () => void;
  onAcceptDraw?: () => void;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  players,
  onMovePiece,
  onResign,
  onOfferDraw,
  onAcceptDraw,
}) => {
  const fen = state?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Instancia local de chess.js para calcular movimientos válidos en el cliente
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch (e) {
      console.error('[ChessBoard] Error instanciando FEN:', fen, e);
      return new Chess();
    }
  }, [fen]);

  // Identificar jugadores y colores
  const whitePlayer = useMemo(() => {
    return players.find((p) => p.userId === state.playerWhiteUserId) || players[0];
  }, [players, state.playerWhiteUserId]);

  const blackPlayer = useMemo(() => {
    return players.find((p) => p.userId === state.playerBlackUserId) || players[1];
  }, [players, state.playerBlackUserId]);

  const isWhite = currentUserId === state.playerWhiteUserId;
  const isBlack = currentUserId === state.playerBlackUserId;
  const myColor = isWhite ? 'w' : isBlack ? 'b' : null;

  // Orientación del tablero (por defecto las negras ven el tablero invertido)
  const [flipped, setFlipped] = useState<boolean>(isBlack);

  // Estados de interacción
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [showResignModal, setShowResignModal] = useState(false);

  // Estado del juego
  const activeColor = chess.turn(); // 'w' | 'b'
  const isMyTurn = !state.winnerUserId && !state.isDraw && activeColor === myColor;
  const inCheck = chess.inCheck();
  const isGameOver = Boolean(state.winnerUserId) || state.isDraw;

  // Movimientos válidos para la casilla seleccionada
  const legalMovesForSelected = useMemo(() => {
    if (!selectedSquare || isGameOver || !isMyTurn) return [];
    try {
      return chess.moves({ square: selectedSquare as any, verbose: true }) as any[];
    } catch {
      return [];
    }
  }, [chess, selectedSquare, isGameOver, isMyTurn]);

  // Casillas de último movimiento para resaltado visual
  const lastMove = useMemo(() => {
    if (!state.moveHistory || state.moveHistory.length === 0) return null;
    return state.moveHistory[state.moveHistory.length - 1];
  }, [state.moveHistory]);

  // Material capturado
  const capturedMaterial = useMemo(() => {
    const counts = {
      p: 8, n: 2, b: 2, r: 2, q: 1,
    };
    const whiteRemaining = { ...counts };
    const blackRemaining = { ...counts };

    const board = chess.board();
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== 'k') {
          if (piece.color === 'w') {
            whiteRemaining[piece.type] = Math.max(0, (whiteRemaining[piece.type] || 0) - 1);
          } else {
            blackRemaining[piece.type] = Math.max(0, (blackRemaining[piece.type] || 0) - 1);
          }
        }
      }
    }

    // Piezas capturadas por las blancas = piezas negras perdidas
    const whiteCapturedPieces: string[] = [];
    Object.entries(blackRemaining).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) whiteCapturedPieces.push(type);
    });

    // Piezas capturadas por las negras = piezas blancas perdidas
    const blackCapturedPieces: string[] = [];
    Object.entries(whiteRemaining).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) blackCapturedPieces.push(type);
    });

    return { whiteCapturedPieces, blackCapturedPieces };
  }, [chess]);

  // Manejo de clic en casilla
  const handleSquareClick = useCallback((squareName: string) => {
    if (!isMyTurn || isGameOver) return;

    const piece = chess.get(squareName as any);

    // Si hace clic en una pieza propia, seleccionarla
    if (piece && piece.color === myColor) {
      if (selectedSquare === squareName) {
        setSelectedSquare(null); // Deseleccionar al hacer clic de nuevo
      } else {
        setSelectedSquare(squareName);
      }
      return;
    }

    // Si ya tenía una casilla seleccionada y hace clic en un destino
    if (selectedSquare) {
      const move = legalMovesForSelected.find((m) => m.to === squareName);
      if (!move) {
        setSelectedSquare(null);
        return;
      }

      // Detección de coronación de peón (Rank 8 para blancas, Rank 1 para negras)
      const selectedPiece = chess.get(selectedSquare as any);
      const isPawnPromotion =
        selectedPiece?.type === 'p' &&
        ((myColor === 'w' && squareName.endsWith('8')) || (myColor === 'b' && squareName.endsWith('1')));

      if (isPawnPromotion) {
        setPendingPromotion({ from: selectedSquare, to: squareName });
        setSelectedSquare(null);
        return;
      }

      // Ejecutar movimiento regular
      onMovePiece(selectedSquare, squareName);
      setSelectedSquare(null);
    }
  }, [chess, isMyTurn, isGameOver, myColor, selectedSquare, legalMovesForSelected, onMovePiece]);

  // Ejecución de coronación
  const handleSelectPromotionPiece = (promotionPiece: 'q' | 'r' | 'b' | 'n') => {
    if (pendingPromotion) {
      onMovePiece(pendingPromotion.from, pendingPromotion.to, promotionPiece);
      setPendingPromotion(null);
    }
  };

  const handleTimeout = () => {
    if (isMyTurn && sessionId) {
      GameRepository.expireTurn(sessionId);
    }
  };

  // Generación de la cuadrícula de casillas
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const topPlayer = flipped ? whitePlayer : blackPlayer;
  const bottomPlayer = flipped ? blackPlayer : whitePlayer;
  const topColor = flipped ? 'w' : 'b';
  const bottomColor = flipped ? 'b' : 'w';

  return (
    <div id="chess-board-container" className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-2xl mx-auto w-full select-none">
      
      {/* 1. Marcador Superior (Jugador Oponente) */}
      <div 
        id="chess-top-player-card"
        className={`w-full flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition-all mb-2 ${
          activeColor === topColor && !isGameOver
            ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
            : 'bg-neutral-900/70 border-neutral-800'
        }`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shadow-inner ${
            topColor === 'w' 
              ? 'bg-neutral-100 text-neutral-900 border-neutral-300' 
              : 'bg-neutral-950 text-neutral-100 border-neutral-700'
          }`}>
            {topColor === 'w' ? '♔' : '♚'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider truncate">
                {topPlayer?.displayName || (topColor === 'w' ? 'Blancas' : 'Negras')}
              </span>
              {topPlayer?.userId === currentUserId && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/30 font-medium">
                  TÚ
                </span>
              )}
            </div>
            {/* Piezas capturadas por el jugador superior */}
            <div className="flex items-center space-x-0.5 text-xs text-neutral-400 h-4">
              {(topColor === 'w' ? capturedMaterial.whiteCapturedPieces : capturedMaterial.blackCapturedPieces).map((p, idx) => (
                <span key={idx} className="opacity-80">
                  {PIECE_SYMBOLS[p]?.[topColor === 'w' ? 'b' : 'w'] || p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Reloj o Estado */}
        {activeColor === topColor && !isGameOver && (
          <div className="flex items-center space-x-1 text-xs text-amber-400 font-mono font-bold bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/30">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            <span>Turno Activo</span>
          </div>
        )}
      </div>

      {/* 2. TABLERO DE AJEDREZ 8x8 */}
      <div className="relative w-full aspect-square max-w-[500px] bg-neutral-900 p-1.5 sm:p-2.5 rounded-2xl sm:rounded-3xl border-2 border-neutral-800 shadow-2xl overflow-hidden">
        <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-xl overflow-hidden border border-neutral-700/60">
          {ranks.map((rank, rankIdx) =>
            files.map((file, fileIdx) => {
              const squareName = `${file}${rank}`;
              const piece = chess.get(squareName as any);
              const isDarkSquare = (rankIdx + fileIdx) % 2 === 1;

              const isSelected = selectedSquare === squareName;
              const isLastMoveSquare = lastMove && (lastMove.from === squareName || lastMove.to === squareName);
              const isLegalTarget = legalMovesForSelected.some((m) => m.to === squareName);
              const isKingInCheck = inCheck && piece?.type === 'k' && piece?.color === activeColor;

              return (
                <div
                  key={squareName}
                  id={`chess-sq-${squareName}`}
                  onClick={() => handleSquareClick(squareName)}
                  className={`relative flex items-center justify-center cursor-pointer transition-colors duration-150 touch-manipulation select-none ${
                    isDarkSquare ? 'bg-[#769656]' : 'bg-[#eeeed2]'
                  } ${isSelected ? 'ring-4 ring-amber-400 ring-inset z-10 !bg-amber-300/80' : ''} ${
                    isLastMoveSquare && !isSelected ? '!bg-amber-200/60 dark:!bg-yellow-600/40' : ''
                  } ${isKingInCheck ? '!bg-rose-500/80 animate-pulse' : ''}`}
                >
                  {/* Coordenadas en los bordes */}
                  {fileIdx === 0 && (
                    <span className={`absolute top-0.5 left-1 text-[9px] sm:text-[10px] font-bold font-mono pointer-events-none ${
                      isDarkSquare ? 'text-[#eeeed2]' : 'text-[#769656]'
                    }`}>
                      {rank}
                    </span>
                  )}
                  {rankIdx === 7 && (
                    <span className={`absolute bottom-0.5 right-1 text-[9px] sm:text-[10px] font-bold font-mono pointer-events-none ${
                      isDarkSquare ? 'text-[#eeeed2]' : 'text-[#769656]'
                    }`}>
                      {file}
                    </span>
                  )}

                  {/* Pieza de Ajedrez */}
                  {piece && (
                    <motion.div
                      layoutId={`piece-${squareName}`}
                      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                      className={`text-2xl sm:text-4xl md:text-5xl font-serif font-black leading-none drop-shadow-md transform transition-transform active:scale-95 ${
                        piece.color === 'w' 
                          ? 'text-neutral-50 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' 
                          : 'text-neutral-900 drop-shadow-[0_1px_2px_rgba(255,255,255,0.4)]'
                      }`}
                    >
                      {PIECE_SYMBOLS[piece.type]?.[piece.color] || piece.type}
                    </motion.div>
                  )}

                  {/* Indicador de movimiento legal (Punto para vacía, Aro para captura) */}
                  {isLegalTarget && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {piece ? (
                        <div className="w-full h-full border-4 border-amber-500/80 rounded-full animate-pulse" />
                      ) : (
                        <div className="w-3 h-3 sm:w-4 sm:h-4 bg-neutral-900/30 rounded-full ring-2 ring-neutral-900/20" />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal de Coronación / Promoción de Peón */}
        <AnimatePresence>
          {pendingPromotion && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-4 rounded-2xl"
            >
              <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                Elige pieza de coronación
              </h3>
              <div className="grid grid-cols-4 gap-2 sm:gap-3 bg-neutral-900 p-3 rounded-2xl border border-neutral-700 shadow-2xl">
                {(['q', 'r', 'b', 'n'] as const).map((pType) => (
                  <button
                    key={pType}
                    onClick={() => handleSelectPromotionPiece(pType)}
                    className="flex flex-col items-center p-2.5 rounded-xl bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-white transition-all transform hover:scale-105 touch-manipulation"
                  >
                    <span className="text-3xl sm:text-4xl">
                      {PIECE_SYMBOLS[pType]?.[myColor || 'w'] || pType}
                    </span>
                    <span className="text-[10px] font-bold mt-1">
                      {PIECE_SYMBOLS[pType]?.name || pType}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Marcador Inferior (Jugador Local) */}
      <div 
        id="chess-bottom-player-card"
        className={`w-full flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition-all mt-2 ${
          activeColor === bottomColor && !isGameOver
            ? 'bg-amber-500/10 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
            : 'bg-neutral-900/70 border-neutral-800'
        }`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border shadow-inner ${
            bottomColor === 'w' 
              ? 'bg-neutral-100 text-neutral-900 border-neutral-300' 
              : 'bg-neutral-950 text-neutral-100 border-neutral-700'
          }`}>
            {bottomColor === 'w' ? '♔' : '♚'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider truncate">
                {bottomPlayer?.displayName || (bottomColor === 'w' ? 'Blancas' : 'Negras')}
              </span>
              {bottomPlayer?.userId === currentUserId && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/30 font-medium">
                  TÚ
                </span>
              )}
            </div>
            {/* Piezas capturadas por el jugador inferior */}
            <div className="flex items-center space-x-0.5 text-xs text-neutral-400 h-4">
              {(bottomColor === 'w' ? capturedMaterial.whiteCapturedPieces : capturedMaterial.blackCapturedPieces).map((p, idx) => (
                <span key={idx} className="opacity-80">
                  {PIECE_SYMBOLS[p]?.[bottomColor === 'w' ? 'b' : 'w'] || p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Temporizador o Indicador de Turno */}
        <div className="flex items-center space-x-2">
          {activeColor === bottomColor && !isGameOver && (
            <div className="flex items-center space-x-1.5">
              {turnExpiresAt && (
                <TurnTimer
                  turnExpiresAt={turnExpiresAt}
                  durationSeconds={60}
                  isMyTurn={isMyTurn}
                  activePlayerName={bottomPlayer?.displayName || 'Jugador'}
                  onTimeout={handleTimeout}
                />
              )}
              <div className="flex items-center space-x-1 text-xs text-amber-400 font-mono font-bold bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/30">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span>{isMyTurn ? 'Tu Turno' : 'Turno Activo'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Barra de Controles y Acciones */}
      <div className="w-full flex items-center justify-between gap-2 mt-3 text-xs">
        <button
          onClick={() => setFlipped((prev) => !prev)}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors border border-neutral-800 touch-manipulation"
          title="Girar orientación del tablero"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
          <span>Girar Vista</span>
        </button>

        {/* Historial de últimos movimientos */}
        <div className="flex-1 max-w-[200px] sm:max-w-xs overflow-x-auto whitespace-nowrap bg-neutral-900/60 px-3 py-1.5 rounded-xl border border-neutral-800/80 font-mono text-[11px] text-neutral-400 flex items-center space-x-2 scrollbar-none">
          {state.moveHistory && state.moveHistory.length > 0 ? (
            state.moveHistory.slice(-4).map((m, idx) => (
              <span key={idx} className="bg-neutral-800/80 px-1.5 py-0.5 rounded text-neutral-200">
                {m.san}
              </span>
            ))
          ) : (
            <span className="text-neutral-500">Sin jugadas aún</span>
          )}
        </div>

        {/* Botón Rendirse */}
        {!isGameOver && (isWhite || isBlack) && (
          <button
            onClick={() => setShowResignModal(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors border border-rose-500/30 touch-manipulation"
          >
            <Flag className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rendirse</span>
          </button>
        )}
      </div>

      {/* Modal de Confirmación de Rendición */}
      <AnimatePresence>
        {showResignModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
                <Flag className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">¿Deseas rendirte?</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  La partida finalizará y se declarará la victoria a favor de tu rival con la liquidación correspondiente.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowResignModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowResignModal(false);
                    if (onResign) onResign();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shadow-lg shadow-rose-600/30"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
