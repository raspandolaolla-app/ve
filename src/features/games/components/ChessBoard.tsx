// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE AJEDREZ PROFESIONAL INTERACTIVO (FIDE)
// ==============================================================================
// Tablero interactivo de alta fidelidad con temas intercambiables (Madera Clásica,
// Moderno FIDE, Alto Contraste), piezas vectoriales HD con relieve 3D,
// avisos dinámicos de Jaque/Jaque Mate, modal táctil de promoción y reloj de turno.
// ==============================================================================

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Chess } from 'chess.js';
import { 
  Trophy, 
  ArrowLeftRight, 
  Flag, 
  Clock, 
  Palette, 
  Crown,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import type { ChessState } from '../../../types/games';
import type { TablePlayer } from '../../../types/tables';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';
import { ChessPieceSVG, PieceType, PieceColor } from './ChessPieces';

// Temas visuales del tablero
export type ChessBoardTheme = 'classic-wood' | 'modern' | 'high-contrast';

interface ThemeConfig {
  id: ChessBoardTheme;
  name: string;
  lightSquare: string;
  darkSquare: string;
  borderStyle: string;
  coordsLight: string;
  coordsDark: string;
  accentGlow: string;
}

const BOARD_THEMES: Record<ChessBoardTheme, ThemeConfig> = {
  'classic-wood': {
    id: 'classic-wood',
    name: 'Clásico Madera',
    lightSquare: 'bg-[#f0d9b5]',
    darkSquare: 'bg-[#b58863]',
    borderStyle: 'border-[#78350f]/80 shadow-[0_8px_30px_rgba(69,26,3,0.5)] bg-gradient-to-br from-[#451a03] via-[#78350f] to-[#451a03]',
    coordsLight: 'text-[#f0d9b5]',
    coordsDark: 'text-[#b58863]',
    accentGlow: 'from-amber-600/30 to-amber-900/30',
  },
  'modern': {
    id: 'modern',
    name: 'Moderno FIDE',
    lightSquare: 'bg-[#eeeed2]',
    darkSquare: 'bg-[#769656]',
    borderStyle: 'border-neutral-700/80 shadow-[0_8px_30px_rgba(0,0,0,0.7)] bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900',
    coordsLight: 'text-[#eeeed2]',
    coordsDark: 'text-[#769656]',
    accentGlow: 'from-emerald-600/30 to-emerald-950/30',
  },
  'high-contrast': {
    id: 'high-contrast',
    name: 'Alto Contraste',
    lightSquare: 'bg-[#f8fafc]',
    darkSquare: 'bg-[#1e3a8a]',
    borderStyle: 'border-blue-900/90 shadow-[0_8px_30px_rgba(15,23,42,0.8)] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950',
    coordsLight: 'text-[#f8fafc]',
    coordsDark: 'text-[#1e3a8a]',
    accentGlow: 'from-blue-600/30 to-slate-900/30',
  },
};

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Peón',
  n: 'Caballo',
  b: 'Alfil',
  r: 'Torre',
  q: 'Dama',
  k: 'Rey',
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
  onTimeout?: () => void;
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
  onTimeout,
}) => {
  const fen = state?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Preferencia local de tema de tablero
  const [boardTheme, setBoardTheme] = useState<ChessBoardTheme>(() => {
    return (localStorage.getItem('pulplay_chess_theme') as ChessBoardTheme) || 'classic-wood';
  });

  const handleThemeChange = (newTheme: ChessBoardTheme) => {
    setBoardTheme(newTheme);
    localStorage.setItem('pulplay_chess_theme', newTheme);
  };

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
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [dismissGameOverModal, setDismissGameOverModal] = useState(false);

  // Estado del juego
  const activeColor = chess.turn(); // 'w' | 'b'
  const isMyTurn = !state.winnerUserId && !state.isDraw && activeColor === myColor;
  const inCheck = chess.inCheck();
  const isCheckmate = chess.isCheckmate();
  const isGameOver = Boolean(state.winnerUserId) || state.isDraw || isCheckmate;

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
    const counts: Record<string, number> = {
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

    const whiteCapturedPieces: PieceType[] = [];
    Object.entries(blackRemaining).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) whiteCapturedPieces.push(type as PieceType);
    });

    const blackCapturedPieces: PieceType[] = [];
    Object.entries(whiteRemaining).forEach(([type, count]) => {
      for (let i = 0; i < count; i++) blackCapturedPieces.push(type as PieceType);
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
        setSelectedSquare(null);
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

  // Ejecución de coronación seleccionada por el jugador
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
  const topColor: PieceColor = flipped ? 'w' : 'b';
  const bottomColor: PieceColor = flipped ? 'b' : 'w';

  const currentTheme = BOARD_THEMES[boardTheme] || BOARD_THEMES['classic-wood'];

  const winnerPlayer = state.winnerUserId
    ? (state.winnerUserId === state.playerWhiteUserId ? whitePlayer : blackPlayer)
    : null;

  return (
    <div id="chess-board-container" className="flex flex-col items-center justify-center p-1.5 sm:p-3 max-w-2xl mx-auto w-full select-none game-immersive-container">
      
      {/* ALERTA VISUAL DE JAQUE FLOTANTE */}
      <AnimatePresence>
        {inCheck && !isGameOver && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="w-full mb-2 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 text-white px-3.5 py-1.5 rounded-xl shadow-lg border border-rose-400/40 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
              </span>
              <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-200" />
                {activeColor === myColor ? '¡JAQUE! Tu Rey está siendo atacado' : '¡JAQUE AL REY RIVAL!'}
              </span>
            </div>
            <span className="text-[10px] bg-black/30 font-mono px-2 py-0.5 rounded-md font-bold text-rose-100 uppercase">
              {activeColor === 'w' ? 'Turno Blancas' : 'Turno Negras'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. MARCADOR SUPERIOR (JUGADOR OPONENTE) */}
      <div 
        id="chess-top-player-card"
        className={`w-full flex items-center justify-between p-2 sm:p-2.5 rounded-2xl border transition-all mb-2 ${
          activeColor === topColor && !isGameOver
            ? 'bg-amber-500/15 border-amber-500/60 shadow-lg ring-1 ring-amber-500/40'
            : 'bg-neutral-900/80 border-neutral-800'
        }`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center p-1 border shadow-md ${
            topColor === 'w' 
              ? 'bg-neutral-100 border-neutral-300' 
              : 'bg-neutral-950 border-neutral-700'
          }`}>
            <ChessPieceSVG type="k" color={topColor} className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider truncate">
                {topPlayer?.displayName || (topColor === 'w' ? 'Blancas' : 'Negras')}
              </span>
              {topPlayer?.userId === currentUserId && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/40 font-bold">
                  TÚ
                </span>
              )}
            </div>
            {/* Piezas capturadas por el jugador superior */}
            <div className="flex items-center space-x-1 text-xs text-neutral-400 h-5 mt-0.5">
              {(topColor === 'w' ? capturedMaterial.whiteCapturedPieces : capturedMaterial.blackCapturedPieces).map((p, idx) => (
                <div key={idx} className="w-3.5 h-3.5 opacity-90 hover:scale-125 transition-transform">
                  <ChessPieceSVG type={p} color={topColor === 'w' ? 'b' : 'w'} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reloj o Estado de Turno */}
        <div className="flex items-center space-x-2">
          {activeColor === topColor && !isGameOver && (
            <div className="flex items-center space-x-1.5">
              {turnExpiresAt && (
                <TurnTimer
                  turnExpiresAt={turnExpiresAt}
                  durationSeconds={15}
                  isMyTurn={false}
                  activePlayerName={topPlayer?.displayName || 'Oponente'}
                />
              )}
              <div className="flex items-center space-x-1 text-xs text-amber-400 font-mono font-bold bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/40">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span className="hidden sm:inline">Turno Activo</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. TABLERO DE AJEDREZ 8x8 CON TEMA CLÁSICO/MODERNO/ALTO CONTRASTE */}
      <div 
        className={`relative w-full aspect-square max-w-[520px] p-2 sm:p-3 rounded-2xl sm:rounded-3xl border-4 ${currentTheme.borderStyle} transition-all duration-300`}
      >
        <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-xl overflow-hidden shadow-inner border border-black/40">
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
                  className={`relative flex items-center justify-center cursor-pointer transition-all duration-100 touch-manipulation select-none ${
                    isDarkSquare ? currentTheme.darkSquare : currentTheme.lightSquare
                  } ${
                    isSelected ? 'ring-4 ring-amber-400 ring-inset z-10 !bg-amber-300/80 shadow-inner' : ''
                  } ${
                    isLastMoveSquare && !isSelected ? '!bg-amber-400/40' : ''
                  } ${
                    isKingInCheck ? '!bg-rose-600/90 ring-4 ring-rose-500 ring-inset animate-pulse z-10' : ''
                  }`}
                >
                  {/* Coordenadas en los bordes */}
                  {fileIdx === 0 && (
                    <span className={`absolute top-0.5 left-1 text-[9px] sm:text-[10px] font-black font-mono pointer-events-none opacity-80 ${
                      isDarkSquare ? currentTheme.coordsLight : currentTheme.coordsDark
                    }`}>
                      {rank}
                    </span>
                  )}
                  {rankIdx === 7 && (
                    <span className={`absolute bottom-0.5 right-1 text-[9px] sm:text-[10px] font-black font-mono pointer-events-none opacity-80 ${
                      isDarkSquare ? currentTheme.coordsLight : currentTheme.coordsDark
                    }`}>
                      {file}
                    </span>
                  )}

                  {/* Pieza de Ajedrez Vectorial HD */}
                  {piece && (
                    <motion.div
                      layoutId={`chess-piece-${squareName}`}
                      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                      className="w-[82%] h-[82%] flex items-center justify-center transform active:scale-90 transition-transform"
                    >
                      <ChessPieceSVG 
                        type={piece.type as PieceType} 
                        color={piece.color as PieceColor} 
                      />
                    </motion.div>
                  )}

                  {/* Indicador de movimiento legal interactivo */}
                  {isLegalTarget && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      {piece ? (
                        <div className="w-full h-full border-4 border-rose-500/90 bg-rose-500/20 rounded-full animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.6)]" />
                      ) : (
                        <div className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 bg-emerald-500/80 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.7)] ring-2 ring-emerald-300/60 animate-bounce" />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal de Coronación / Promoción de Peón Táctil */}
        <AnimatePresence>
          {pendingPromotion && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 bg-neutral-950/85 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 rounded-2xl"
            >
              <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-5 max-w-xs w-full shadow-2xl text-center space-y-4">
                <div className="flex items-center justify-center space-x-2 text-amber-400">
                  <Crown className="w-6 h-6 animate-bounce" />
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                    Elegir Promoción
                  </h3>
                </div>
                <p className="text-xs text-neutral-300">
                  Tu peón ha llegado a la meta. Selecciona la pieza a coronar:
                </p>
                <div className="grid grid-cols-4 gap-2.5">
                  {(['q', 'r', 'b', 'n'] as const).map((pType) => (
                    <button
                      key={pType}
                      onClick={() => handleSelectPromotionPiece(pType)}
                      className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 border border-neutral-700 hover:border-amber-400 transition-all transform hover:scale-105 active:scale-95 touch-manipulation group shadow-lg"
                    >
                      <div className="w-10 h-10 mb-1">
                        <ChessPieceSVG type={pType} color={myColor || 'w'} />
                      </div>
                      <span className="text-[11px] font-extrabold text-neutral-200 group-hover:text-neutral-950">
                        {PIECE_NAMES[pType]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. MARCADOR INFERIOR (JUGADOR LOCAL) */}
      <div 
        id="chess-bottom-player-card"
        className={`w-full flex items-center justify-between p-2 sm:p-2.5 rounded-2xl border transition-all mt-2 ${
          activeColor === bottomColor && !isGameOver
            ? 'bg-amber-500/15 border-amber-500/60 shadow-lg ring-1 ring-amber-500/40'
            : 'bg-neutral-900/80 border-neutral-800'
        }`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center p-1 border shadow-md ${
            bottomColor === 'w' 
              ? 'bg-neutral-100 border-neutral-300' 
              : 'bg-neutral-950 border-neutral-700'
          }`}>
            <ChessPieceSVG type="k" color={bottomColor} className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wider truncate">
                {bottomPlayer?.displayName || (bottomColor === 'w' ? 'Blancas' : 'Negras')}
              </span>
              {bottomPlayer?.userId === currentUserId && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-500/40 font-bold">
                  TÚ
                </span>
              )}
            </div>
            {/* Piezas capturadas por el jugador inferior */}
            <div className="flex items-center space-x-1 text-xs text-neutral-400 h-5 mt-0.5">
              {(bottomColor === 'w' ? capturedMaterial.whiteCapturedPieces : capturedMaterial.blackCapturedPieces).map((p, idx) => (
                <div key={idx} className="w-3.5 h-3.5 opacity-90 hover:scale-125 transition-transform">
                  <ChessPieceSVG type={p} color={bottomColor === 'w' ? 'b' : 'w'} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Temporizador e Indicador de Turno */}
        <div className="flex items-center space-x-2">
          {activeColor === bottomColor && !isGameOver && (
            <div className="flex items-center space-x-1.5">
              {turnExpiresAt && (
                <TurnTimer
                  turnExpiresAt={turnExpiresAt}
                  durationSeconds={15}
                  isMyTurn={isMyTurn}
                  activePlayerName={bottomPlayer?.displayName || 'Jugador'}
                  onTimeout={() => {
                    if (isMyTurn) {
                      if (onTimeout) onTimeout();
                      else handleTimeout();
                    }
                  }}
                />
              )}
              <div className="flex items-center space-x-1 text-xs text-amber-400 font-mono font-bold bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/40">
                <Clock className="w-3.5 h-3.5 animate-pulse" />
                <span>{isMyTurn ? 'Tu Turno' : 'Turno Activo'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. BARRA DE CONTROLES, TEMAS Y HISTORIAL SAN */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 mt-3 text-xs">
        
        {/* Botón Selector de Temas */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setShowThemeModal(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors border border-neutral-800 touch-manipulation font-medium"
            title="Cambiar estilo visual del tablero"
          >
            <Palette className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">{currentTheme.name}</span>
            <span className="sm:hidden">Tema</span>
          </button>

          <button
            onClick={() => setFlipped((prev) => !prev)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 transition-colors border border-neutral-800 touch-manipulation"
            title="Girar orientación del tablero"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Girar</span>
          </button>
        </div>

        {/* Historial de últimos movimientos en notación SAN */}
        <div className="flex-1 max-w-[220px] sm:max-w-xs overflow-x-auto whitespace-nowrap bg-neutral-900/80 px-3 py-2 rounded-xl border border-neutral-800 font-mono text-[11px] text-neutral-400 flex items-center space-x-2 scrollbar-none shadow-inner">
          {state.moveHistory && state.moveHistory.length > 0 ? (
            state.moveHistory.slice(-4).map((m, idx) => (
              <span key={idx} className="bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-200 font-bold">
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
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors border border-rose-500/30 touch-manipulation font-bold"
          >
            <Flag className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rendirse</span>
          </button>
        )}
      </div>

      {/* MODAL DE SELECCIÓN DE ESTILO DEL TABLERO */}
      <AnimatePresence>
        {showThemeModal && (
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
              className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <div className="flex items-center space-x-2">
                  <Palette className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Estilo del Tablero</h3>
                </div>
                <button 
                  onClick={() => setShowThemeModal(false)}
                  className="text-neutral-400 hover:text-white text-xs px-2 py-1 bg-neutral-800 rounded-lg"
                >
                  Cerrar
                </button>
              </div>

              <div className="space-y-2.5">
                {(Object.values(BOARD_THEMES) as ThemeConfig[]).map((thm) => (
                  <button
                    key={thm.id}
                    onClick={() => {
                      handleThemeChange(thm.id);
                      setShowThemeModal(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                      boardTheme === thm.id
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-md'
                        : 'bg-neutral-800/60 border-neutral-700/60 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {/* Mini preview 2x2 de casillas */}
                      <div className="w-8 h-8 rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2 border border-black/40 shadow-inner">
                        <div className={thm.lightSquare} />
                        <div className={thm.darkSquare} />
                        <div className={thm.darkSquare} />
                        <div className={thm.lightSquare} />
                      </div>
                      <div>
                        <div className="font-bold text-sm">{thm.name}</div>
                        <div className="text-[10px] text-neutral-400">
                          {thm.id === 'classic-wood' && 'Marfil y nogal madera cálido'}
                          {thm.id === 'modern' && 'Verde campeonato FIDE'}
                          {thm.id === 'high-contrast' && 'Blanco y azul índigo profundo'}
                        </div>
                      </div>
                    </div>
                    {boardTheme === thm.id && (
                      <CheckCircle2 className="w-5 h-5 text-amber-400" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE JAQUE MATE / FIN DE PARTIDA */}
      <AnimatePresence>
        {isGameOver && !dismissGameOverModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center"
            >
              <div className="w-16 h-16 rounded-3xl bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
                <Trophy className="w-8 h-8 animate-bounce" />
              </div>
              
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">
                  {state.isDraw ? 'TABLAS / EMPATE' : 'PARTIDA FINALIZADA'}
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                  {isCheckmate || state.winnerUserId ? '♟ ¡JAQUE MATE!' : '🤝 EMPATE'}
                </h2>
                
                {winnerPlayer && (
                  <p className="text-sm font-bold text-amber-300 mt-2 bg-amber-500/10 py-1.5 px-3 rounded-xl border border-amber-500/30 inline-block">
                    Ganador: {winnerPlayer.displayName} ({winnerPlayer.userId === state.playerWhiteUserId ? 'Blancas ♔' : 'Negras ♚'})
                  </p>
                )}
                {state.isDraw && (
                  <p className="text-xs text-neutral-400 mt-2">
                    La partida concluyó en empate sin ganador.
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setDismissGameOverModal(true)}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-black text-sm transition-all shadow-lg shadow-amber-500/30 flex items-center justify-center space-x-2"
                >
                  <span>Revisar Tablero</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIRMACIÓN DE RENDICIÓN */}
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
