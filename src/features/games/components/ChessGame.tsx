// ==============================================================================
// RASPANDO LA OLLA — AJEDREZ (CHESS 2-PLAYER)
// ==============================================================================
// Tablero 8x8 con soporte para todas las reglas del ajedrez (en passant, enroque,
// coronación, jaque, jaque mate, tablas), giro automático de tablero según color,
// registro de movimientos en tiempo real y liquidación 90/10 en Supabase.
// ==============================================================================

import { useState, useMemo } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import type { ChessState } from '../../../types/games';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, AlertCircle, Sparkles, HelpCircle, User, ArrowLeftRight } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';
import { Chess } from 'chess.js';

// Mapeo visual de piezas de ajedrez (Sólidas para óptima legibilidad)
const PIECE_GLYPHS: Record<string, string> = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚'
};

const PIECE_NAMES_ES: Record<string, string> = {
  p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey'
};

export function ChessGame({
  table,
  players,
  currentUserId,
  onLeave,
}: {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  onLeave: () => void;
}) {
  const p1 = players[0]?.userId || table.hostUserId;
  const p2 = players[1]?.userId || '';

  const initialChessState: ChessState = {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playerWhiteUserId: p1,
    playerBlackUserId: p2,
    moveHistory: [],
    winnerUserId: null,
    isDraw: false,
  };

  const {
    gameState,
    currentTurnUserId,
    isMyTurn,
    isSettling,
    dispatchAction,
  } = useGameEngine({
    table,
    players,
    currentUserId,
    initialState: initialChessState,
  });

  const state = (gameState as unknown as ChessState) || initialChessState;
  const fen = state.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Instanciar chess.js para calcular movimientos y estados legales locales
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch (e) {
      console.error('Error instanciando chess.js con FEN:', fen, e);
      return new Chess();
    }
  }, [fen]);

  // Identificar colores
  const isWhite = currentUserId === state.playerWhiteUserId;
  const isBlack = currentUserId === state.playerBlackUserId;
  const myColor = isWhite ? 'w' : isBlack ? 'b' : null; // null para espectadores

  // Control para voltear manualmente la visualización del tablero
  const [flipBoard, setFlipBoard] = useState<boolean>(isBlack);

  // Estados de selección y jugabilidad
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);

  // Obtener todos los movimientos posibles para la casilla seleccionada
  const validMovesForSelected = useMemo(() => {
    if (!selectedSquare) return [];
    try {
      return chess.moves({ square: selectedSquare as any, verbose: true }) as any[];
    } catch {
      return [];
    }
  }, [chess, selectedSquare]);

  // Comprobar si el rey del jugador actual está en jaque
  const inCheck = chess.inCheck();
  const currentTurnColor = chess.turn(); // 'w' o 'b'

  // Procesamiento de clicks en el tablero
  const handleSquareClick = async (squareName: string) => {
    if (!isMyTurn || state.winnerUserId || state.isDraw || isSettling) return;

    const piece = chess.get(squareName as any);
    const isMyPiece = piece && piece.color === myColor;

    if (isMyPiece) {
      setSelectedSquare(squareName);
      return;
    }

    if (selectedSquare) {
      // Comprobar si es un destino válido
      const move = validMovesForSelected.find((m) => m.to === squareName);
      if (!move) {
        setSelectedSquare(null);
        return;
      }

      // Si es una promoción, mostrar overlay
      const isPromotion =
        piece === null &&
        chess.get(selectedSquare as any)?.type === 'p' &&
        (squareName.endsWith('8') || squareName.endsWith('1'));

      if (isPromotion) {
        setPromotionPending({ from: selectedSquare, to: squareName });
        return;
      }

      // Ejecutar movimiento estándar
      await executeMove(selectedSquare, squareName);
    }
  };

  const executeMove = async (from: string, to: string, promotion?: string) => {
    setSelectedSquare(null);
    setPromotionPending(null);

    const tempChess = new Chess(fen);
    let moveResult;
    try {
      moveResult = tempChess.move({ from, to, promotion });
    } catch (e: any) {
      console.error('Movimiento inválido local:', e.message);
      return;
    }

    const isGameOver = tempChess.isGameOver();
    let winnerId: string | null = null;
    let isDraw = false;
    let drawReason: ChessState['drawReason'] = undefined;

    if (isGameOver) {
      if (tempChess.isCheckmate()) {
        winnerId = currentUserId || null;
      } else {
        isDraw = true;
        if (tempChess.isStalemate()) drawReason = 'stalemate';
        else if (tempChess.isThreefoldRepetition()) drawReason = 'threefold_repetition';
        else if (tempChess.isInsufficientMaterial()) drawReason = 'insufficient_material';
        else drawReason = 'fifty_moves';
      }
    }

    const nextTurn = winnerId || isDraw
      ? null
      : currentUserId === state.playerWhiteUserId
      ? state.playerBlackUserId
      : state.playerWhiteUserId;

    const nextHistory = [
      ...state.moveHistory,
      {
        from,
        to,
        san: moveResult.san,
        userId: currentUserId || '',
        timestamp: Date.now(),
      },
    ];

    const nextState: ChessState = {
      ...state,
      fen: tempChess.fen(),
      moveHistory: nextHistory,
      winnerUserId: winnerId,
      isDraw,
      drawReason,
    };

    await dispatchAction(
      'MOVE',
      { from, to, promotion },
      nextState as unknown as Record<string, unknown>,
      nextTurn,
      winnerId,
      isDraw
    );
  };

  // Re-ordenar la matriz de casillas según si el tablero está volteado
  const boardLayout = useMemo(() => {
    const squares: { name: string; piece: any; isDark: boolean }[] = [];
    
    // Rango 8 a 1 (filas) y de 'a' a 'h' (columnas)
    const ranks = flipBoard ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = flipBoard ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    for (const rank of ranks) {
      for (const file of files) {
        const name = `${file}${rank}`;
        const rankIdx = rank - 1;
        const fileIdx = file.charCodeAt(0) - 97;
        const isDark = (rankIdx + fileIdx) % 2 === 0; // f1 = d f, rankIdx + fileIdx % 2
        const piece = chess.get(name as any);
        squares.push({ name, piece, isDark });
      }
    }
    return squares;
  }, [chess, flipBoard]);

  // Contar material capturado para mostrar
  const capturedPieces = useMemo(() => {
    const initialCounts: Record<string, number> = {
      p: 8, n: 2, b: 2, r: 2, q: 1
    };
    
    const whiteCaptured = { ...initialCounts };
    const blackCaptured = { ...initialCounts };

    // Restar las piezas aún presentes en el tablero
    for (let r = 1; r <= 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = String.fromCharCode(97 + c);
        const piece = chess.get(`${file}${r}` as any);
        if (piece && piece.type !== 'k') {
          if (piece.color === 'w') {
            whiteCaptured[piece.type]--;
          } else {
            blackCaptured[piece.type]--;
          }
        }
      }
    }

    return {
      whiteCaptured: Object.entries(whiteCaptured).filter(([_, qty]) => qty > 0),
      blackCaptured: Object.entries(blackCaptured).filter(([_, qty]) => qty > 0)
    };
  }, [chess]);

  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);
  const isGameOver = Boolean(state.winnerUserId) || state.isDraw;
  const isWinner = state.winnerUserId === currentUserId;

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center p-4 gap-6 max-w-6xl mx-auto w-full">
      {/* Contenedor Principal: Tablero e Indicadores */}
      <div className="flex flex-col items-center space-y-6 w-full lg:max-w-xl shrink-0">
        
        {/* Info Box */}
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-100">Ajedrez Clásico</h2>
                <p className="text-xs text-slate-400">
                  Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
                </p>
              </div>
            </div>

            <button
              onClick={() => setFlipBoard((prev) => !prev)}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 transition-colors border border-slate-700/50 flex items-center gap-1.5 text-xs font-mono"
              title="Voltear Tablero"
            >
              <ArrowLeftRight className="w-4 h-4 text-slate-400" />
              <span>Girar Vista</span>
            </button>
          </div>

          {/* Turno e Indicadores de Estado */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Turno:</span>
              {isGameOver ? (
                <span className="font-bold text-amber-400">Partida Finalizada</span>
              ) : isMyTurn ? (
                <span className="font-bold text-emerald-400 flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  ¡Tu turno! ({myColor === 'w' ? 'Blancas' : 'Negras'})
                </span>
              ) : (
                <span className="font-medium text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  Esperando jugada rival... ({currentTurnColor === 'w' ? 'Blancas' : 'Negras'})
                </span>
              )}
            </div>

            {inCheck && !isGameOver && (
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold text-[10px] uppercase tracking-wide animate-bounce">
                ⚠️ ¡JAQUE AL REY!
              </span>
            )}
          </div>
        </div>

        {/* Visualizador de Piezas Capturadas (Rival de Blancas) */}
        <div className="w-full flex items-center justify-between px-3 text-xs bg-slate-900/40 py-2.5 rounded-2xl border border-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-mono">
              {flipBoard ? 'B' : 'N'}
            </div>
            <span className="font-semibold text-slate-300">
              {flipBoard ? players[0]?.displayName || 'Blancas' : players[1]?.displayName || 'Negras'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(flipBoard ? capturedPieces.blackCaptured : capturedPieces.whiteCaptured).map(([type, qty]) => (
              <span
                key={type}
                className="inline-flex items-center justify-center bg-slate-800 border border-slate-700/60 text-slate-300 rounded-lg px-1.5 py-0.5 text-[11px] font-mono shadow-sm"
              >
                {PIECE_GLYPHS[type]} <span className="text-[9px] text-slate-400 ml-0.5">{qty}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Tablero de Ajedrez */}
        <div className="relative bg-slate-950 border-4 border-slate-800 rounded-3xl p-3 shadow-2xl w-[320px] sm:w-[460px] md:w-[480px]">
          <div className="grid grid-cols-8 gap-1.5 aspect-square">
            {boardLayout.map(({ name, piece, isDark }) => {
              const isSelected = selectedSquare === name;
              const isPossibleDest = validMovesForSelected.some((m) => m.to === name);

              return (
                <button
                  key={name}
                  id={`chess-sq-${name}`}
                  disabled={isGameOver || isSettling}
                  onClick={() => handleSquareClick(name)}
                  className={`relative flex items-center justify-center aspect-square rounded-lg transition-all border border-transparent select-none group ${
                    isDark
                      ? 'bg-amber-900/80 text-amber-100 hover:bg-amber-900'
                      : 'bg-amber-100/90 text-amber-950 hover:bg-amber-100'
                  } ${isSelected ? 'ring-2 ring-emerald-400 shadow-md bg-emerald-900/40' : ''} ${
                    isPossibleDest ? 'ring-2 ring-amber-400 bg-amber-500/20' : ''
                  }`}
                >
                  {/* Etiqueta de la casilla en las esquinas para orientación */}
                  {(name.endsWith('1') || name.startsWith('a')) && (
                    <span className="absolute bottom-0.5 right-1 text-[8px] font-semibold opacity-30 select-none pointer-events-none">
                      {name}
                    </span>
                  )}

                  {/* Indicador de destino posible */}
                  {isPossibleDest && !piece && (
                    <div className="absolute w-2.5 h-2.5 rounded-full bg-amber-400 opacity-80 shadow-sm animate-pulse" />
                  )}

                  {/* Ficha Visual de la Pieza */}
                  {piece && (
                    <div
                      className={`w-4/5 h-4/5 rounded-full flex items-center justify-center text-xl sm:text-3xl font-bold select-none cursor-grab active:cursor-grabbing transition-transform ${
                        piece.color === 'w'
                          ? 'text-amber-500 drop-shadow-[0_1.5px_1.5px_rgba(255,255,255,0.7)]'
                          : 'text-slate-900 drop-shadow-[0_1.5px_1.5px_rgba(255,255,255,0.25)]'
                      } hover:scale-105 active:scale-95`}
                      title={`${piece.color === 'w' ? 'Blancas' : 'Negras'} - ${PIECE_NAMES_ES[piece.type]}`}
                    >
                      {PIECE_GLYPHS[piece.type]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Modal Overlay para Selección de Coronación */}
          {promotionPending && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-6 space-y-4 z-20">
              <Sparkles className="w-8 h-8 text-amber-400 animate-pulse" />
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Coronación de Peón</h4>
              <p className="text-xs text-slate-400 max-w-[240px] text-center">
                Tu peón ha llegado al final del tablero. Elige una pieza de rango superior:
              </p>
              <div className="grid grid-cols-2 gap-3 w-full max-w-[260px]">
                {[
                  { id: 'q', name: 'Dama', glyph: '♛' },
                  { id: 'r', name: 'Torre', glyph: '♜' },
                  { id: 'b', name: 'Alfil', glyph: '♝' },
                  { id: 'n', name: 'Caballo', glyph: '♞' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => executeMove(promotionPending.from, promotionPending.to, p.id)}
                    className="flex flex-col items-center justify-center p-3 bg-slate-900 border border-slate-800 rounded-2xl hover:border-amber-400/60 hover:bg-slate-800 text-slate-100 transition-all select-none"
                  >
                    <span className="text-2xl text-amber-400">{p.glyph}</span>
                    <span className="text-[10px] text-slate-400 font-medium mt-1">{p.name}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPromotionPending(null)}
                className="text-xs text-slate-400 hover:text-slate-100 underline pt-1"
              >
                Cancelar movimiento
              </button>
            </div>
          )}
        </div>

        {/* Visualizador de Piezas Capturadas (Rival de Negras) */}
        <div className="w-full flex items-center justify-between px-3 text-xs bg-slate-900/40 py-2.5 rounded-2xl border border-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-mono">
              {flipBoard ? 'N' : 'B'}
            </div>
            <span className="font-semibold text-slate-300">
              {flipBoard ? players[1]?.displayName || 'Negras' : players[0]?.displayName || 'Blancas'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(flipBoard ? capturedPieces.whiteCaptured : capturedPieces.blackCaptured).map(([type, qty]) => (
              <span
                key={type}
                className="inline-flex items-center justify-center bg-slate-800 border border-slate-700/60 text-slate-300 rounded-lg px-1.5 py-0.5 text-[11px] font-mono shadow-sm"
              >
                {PIECE_GLYPHS[type]} <span className="text-[9px] text-slate-400 ml-0.5">{qty}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Panel Lateral: Historial y Estado de Cierre */}
      <div className="flex flex-col space-y-6 w-full lg:max-w-xs shrink-0 h-full">
        
        {/* Historial de Movimientos */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col h-[320px] sm:h-[420px] lg:h-[480px]">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            📝 Historial de Jugadas
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {state.moveHistory && state.moveHistory.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {state.moveHistory.map((mv, index) => {
                  const isWhiteMove = index % 2 === 0;
                  const moveNum = Math.floor(index / 2) + 1;
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg ${
                        mv.userId === currentUserId
                          ? 'bg-emerald-500/10 text-emerald-300 font-semibold'
                          : 'bg-slate-950/40 text-slate-300'
                      }`}
                    >
                      <span className="text-[10px] text-slate-500 font-mono">
                        {isWhiteMove ? `${moveNum}.` : ''}
                      </span>
                      <span className="font-mono">{mv.san}</span>
                      <span className="text-[9px] text-slate-400 font-medium">
                        ({mv.from}→{mv.to})
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <HelpCircle className="w-7 h-7 text-slate-700 mb-1.5" />
                <p className="text-xs text-slate-400">Aún no se han realizado movimientos en la mesa.</p>
              </div>
            )}
          </div>
        </div>

        {/* Overlay o Panel de Resultados */}
        {isGameOver && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            {state.winnerUserId ? (
              isWinner ? (
                <div>
                  <div className="text-2xl font-black text-emerald-400 mb-1">¡VICTORIA EN AJEDREZ! 🏆</div>
                  <p className="text-xs text-slate-300">
                    Has logrado el jaque mate definitivo y ganas:{' '}
                    <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-2xl font-black text-slate-300 mb-1">PARTIDA FINALIZADA</div>
                  <p className="text-xs text-slate-400">El rival ha logrado el jaque mate sobre tu rey.</p>
                </div>
              )
            ) : (
              <div>
                <div className="text-2xl font-black text-amber-400 mb-1">EMPATE TÉCNICO 🤝</div>
                <p className="text-xs text-slate-300">
                  La partida ha finalizado en tablas. Motivo: <strong className="text-amber-400 uppercase tracking-wider text-[11px] font-mono">
                    {state.drawReason === 'stalemate'
                      ? 'Ahogado'
                      : state.drawReason === 'threefold_repetition'
                      ? 'Triple Repetición'
                      : state.drawReason === 'insufficient_material'
                      ? 'Material Insuficiente'
                      : 'Regla de 50 jugadas'}
                  </strong>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Se ha reembolsado el 100% de las entradas.
                </p>
              </div>
            )}

            {isSettling && (
              <div className="text-xs text-amber-300 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Liquidando fondos en Supabase...</span>
              </div>
            )}

            <Button id="chess-leave-lobby-btn" variant="primary" onClick={onLeave} className="w-full py-3">
              Volver al Lobby de Mesas
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
