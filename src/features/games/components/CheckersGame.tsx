// ==============================================================================
// RASPANDO LA OLLA — DAMAS (CHECKERS 8x8 CRILLO)
// ==============================================================================
// Tablero 8x8, movimientos diagonales, saltos de captura, coronación de Damas
// y victoria por eliminación de piezas rivales.
// ==============================================================================

import { useState } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { GameAbandonButton } from '../../../components/common/GameAbandonButton';
import { Trophy, RefreshCw, Crown } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

type PieceType = 'RED' | 'RED_KING' | 'BLACK' | 'BLACK_KING' | null;

interface CheckersState {
  board: PieceType[]; // 64 casillas
  playerRedUserId: string; // Jugador 1 (mueve hacia abajo / piezas rojas)
  playerBlackUserId: string; // Jugador 2 (mueve hacia arriba / piezas negras)
  winnerUserId: string | null;
  isTie: boolean;
}

const INITIAL_BOARD: PieceType[] = Array(64).fill(null);
// Posición inicial estándar 8x8 en casillas oscuras
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    const isDark = (row + col) % 2 === 1;
    if (isDark) {
      const idx = row * 8 + col;
      if (row < 3) INITIAL_BOARD[idx] = 'RED';
      else if (row > 4) INITIAL_BOARD[idx] = 'BLACK';
    }
  }
}

export function CheckersGame({
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
  const uniquePlayers = Array.from(
    new Map(players.map((p) => [p.userId, p])).values()
  ).sort((a, b) => a.seatNumber - b.seatNumber);

  const p1 = uniquePlayers[0]?.userId || table.hostUserId;
  const p2 = uniquePlayers[1]?.userId && uniquePlayers[1]?.userId !== p1 ? uniquePlayers[1].userId : '';

  const initialCheckersState: CheckersState = {
    board: INITIAL_BOARD,
    playerRedUserId: p1,
    playerBlackUserId: p2,
    winnerUserId: null,
    isTie: false,
  };

  const {
    gameState,
    currentTurnUserId,
    isMyTurn,
    isSettling,
    dispatchAction,
    abandonNotice,
  } = useGameEngine({
    table,
    players: uniquePlayers,
    currentUserId,
    initialState: initialCheckersState,
  });

  const state = (gameState as unknown as CheckersState) || initialCheckersState;
  const board = state.board || INITIAL_BOARD;

  const isRed = currentUserId === state.playerRedUserId;
  const myPieceColor = isRed ? 'RED' : 'BLACK';

  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);

  // Calcular movimientos válidos para una casilla
  const getValidMoves = (fromIdx: number): { toIdx: number; isCapture: boolean; capturedIdx?: number }[] => {
    const piece = board[fromIdx];
    if (!piece) return [];

    const isKing = piece.includes('KING');
    const pieceIsRed = piece.startsWith('RED');
    if (pieceIsRed !== isRed) return [];

    const fromRow = Math.floor(fromIdx / 8);
    const fromCol = fromIdx % 8;
    const moves: { toIdx: number; isCapture: boolean; capturedIdx?: number }[] = [];

    // Direcciones de movimiento
    const directions: [number, number][] = [];
    if (isKing) {
      directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    } else if (isRed) {
      directions.push([1, -1], [1, 1]); // Rojo avanza hacia filas superiores
    } else {
      directions.push([-1, -1], [-1, 1]); // Negro avanza hacia filas inferiores
    }

    for (const [dRow, dCol] of directions) {
      const stepRow = fromRow + dRow;
      const stepCol = fromCol + dCol;

      if (stepRow >= 0 && stepRow < 8 && stepCol >= 0 && stepCol < 8) {
        const stepIdx = stepRow * 8 + stepCol;
        const targetPiece = board[stepIdx];

        if (!targetPiece) {
          // Movimiento simple a casilla vacía
          moves.push({ toIdx: stepIdx, isCapture: false });
        } else {
          const targetIsOpponent = pieceIsRed ? targetPiece.startsWith('BLACK') : targetPiece.startsWith('RED');
          if (targetIsOpponent) {
            // Comprobar salto de captura
            const jumpRow = stepRow + dRow;
            const jumpCol = stepCol + dCol;
            if (jumpRow >= 0 && jumpRow < 8 && jumpCol >= 0 && jumpCol < 8) {
              const jumpIdx = jumpRow * 8 + jumpCol;
              if (!board[jumpIdx]) {
                moves.push({ toIdx: jumpIdx, isCapture: true, capturedIdx: stepIdx });
              }
            }
          }
        }
      }
    }

    return moves;
  };

  const validMovesForSelected = selectedSquare !== null ? getValidMoves(selectedSquare) : [];

  const handleSquareClick = async (idx: number) => {
    if (!isMyTurn || state.winnerUserId || isSettling) return;

    const clickedPiece = board[idx];
    const isMyPiece = clickedPiece && (isRed ? clickedPiece.startsWith('RED') : clickedPiece.startsWith('BLACK'));

    if (isMyPiece) {
      setSelectedSquare(idx);
      return;
    }

    if (selectedSquare !== null) {
      const move = validMovesForSelected.find((m) => m.toIdx === idx);
      if (!move) return;

      // Ejecutar movimiento
      const newBoard = [...board];
      const movingPiece = newBoard[selectedSquare]!;
      newBoard[selectedSquare] = null;

      // Si fue captura, eliminar pieza capturada
      if (move.isCapture && move.capturedIdx !== undefined) {
        newBoard[move.capturedIdx] = null;
      }

      // Coronación a Dama (Rey)
      const toRow = Math.floor(idx / 8);
      let finalPiece = movingPiece;
      if (isRed && toRow === 7 && movingPiece === 'RED') {
        finalPiece = 'RED_KING';
      } else if (!isRed && toRow === 0 && movingPiece === 'BLACK') {
        finalPiece = 'BLACK_KING';
      }
      newBoard[idx] = finalPiece;

      // Comprobar si el rival se quedó sin piezas
      const opponentHasPieces = newBoard.some((p) =>
        p && (isRed ? p.startsWith('BLACK') : p.startsWith('RED'))
      );

      let winnerId: string | null = null;
      if (!opponentHasPieces) {
        winnerId = currentUserId || null;
      }

      const nextTurn = currentUserId === state.playerRedUserId ? state.playerBlackUserId : state.playerRedUserId;

      const nextState: CheckersState = {
        ...state,
        board: newBoard,
        winnerUserId: winnerId,
      };

      setSelectedSquare(null);

      await dispatchAction(
        'MOVE_PIECE',
        { from: selectedSquare, to: idx, isCapture: move.isCapture },
        nextState as unknown as Record<string, unknown>,
        winnerId ? null : nextTurn,
        winnerId,
        false
      );
    }
  };

  const redCount = board.filter((p) => p && p.startsWith('RED')).length;
  const blackCount = board.filter((p) => p && p.startsWith('BLACK')).length;

  const isGameOver = Boolean(state.winnerUserId);
  const isWinner = state.winnerUserId === currentUserId;
  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-2xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">Damas Clásicas (8x8)</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 border border-amber-300"></span>
              <span>Rojas: {redCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full bg-slate-800 border border-slate-600"></span>
              <span>Negras: {blackCount}</span>
            </div>

            {!isGameOver && (
              <GameAbandonButton
                sessionId={table.id}
                tableId={table.id}
                onAbandonSuccess={onLeave}
                compact
              />
            )}
          </div>
        </div>

        {/* Banner de Abandono del Rival */}
        {abandonNotice && (
          <div className="mt-3 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold text-center animate-bounce shadow-lg">
            {abandonNotice}
          </div>
        )}

        {/* Turno */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Turno:</span>
            {isGameOver ? (
              <span className="font-bold text-amber-400">Partida Finalizada</span>
            ) : isMyTurn ? (
              <span className="font-bold text-emerald-400 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                ¡Tu turno! Selecciona una ficha para mover
              </span>
            ) : (
              <span className="font-medium text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                Esperando movimiento rival...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tablero 8x8 */}
      <div className="bg-slate-950 border-4 border-slate-800 rounded-3xl p-3 shadow-2xl">
        <div className="grid grid-cols-8 gap-1 w-[320px] h-[320px] sm:w-[420px] sm:h-[420px]">
          {board.map((piece, idx) => {
            const row = Math.floor(idx / 8);
            const col = idx % 8;
            const isDark = (row + col) % 2 === 1;
            const isSelected = selectedSquare === idx;
            const isValidDestination = validMovesForSelected.some((m) => m.toIdx === idx);

            return (
              <button
                key={idx}
                id={`checkers-sq-${idx}`}
                disabled={!isDark || isGameOver || isSettling}
                onClick={() => handleSquareClick(idx)}
                className={`relative flex items-center justify-center rounded-lg transition-all ${
                  isDark ? 'bg-slate-900/90' : 'bg-slate-800/40'
                } ${isSelected ? 'ring-2 ring-amber-400 bg-amber-950/40' : ''} ${
                  isValidDestination ? 'ring-2 ring-emerald-400 bg-emerald-950/40' : ''
                }`}
              >
                {/* Indicador de destino válido */}
                {isValidDestination && (
                  <div className="absolute w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
                )}

                {/* Pieza de Damas */}
                {piece && (
                  <div
                    className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                      piece.startsWith('RED')
                        ? 'bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-amber-200 text-slate-950'
                        : 'bg-gradient-to-br from-slate-700 to-slate-900 border-2 border-slate-500 text-white'
                    }`}
                  >
                    {piece.includes('KING') && <Crown className="w-4 h-4 text-yellow-300 stroke-[3]" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overlay de Resultado */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">
                {(state as any).winner === 'OPPONENT_BY_ABANDON' || (state as any).abandoned || abandonNotice
                  ? '¡VICTORIA POR ABANDONO! 🏆'
                  : '¡VICTORIA EN DAMAS! 🏆'}
              </div>
              <p className="text-xs text-slate-300">
                {(state as any).winner === 'OPPONENT_BY_ABANDON' || (state as any).abandoned || abandonNotice
                  ? '¡Tu rival ha abandonado la partida! Has ganado:'
                  : 'Has capturado todas las fichas rivales y ganas:'}{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">PARTIDA FINALIZADA</div>
              <p className="text-xs text-slate-400">El rival ha eliminado todas tus fichas.</p>
            </div>
          )}

          {isSettling && (
            <div className="text-xs text-amber-300 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Liquidando premio 90/10 en Supabase...</span>
            </div>
          )}

          <Button variant="primary" onClick={onLeave} className="w-full py-3">
            Volver al Lobby de Mesas
          </Button>
        </div>
      )}
    </div>
  );
}
