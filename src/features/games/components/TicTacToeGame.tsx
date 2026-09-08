// ==============================================================================
// RASPANDO LA OLLA — 3 EN RAYA (TIC TAC TOE CRILLO)
// ==============================================================================
// Tablero 3x3 interactivo, validación de casillas, sincronización de turnos
// y detección matemática de victoria/empate.
// ==============================================================================

import { useState } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, X as XIcon, Circle as OIcon, AlertCircle } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

interface TicTacToeState {
  board: (string | null)[]; // 9 casillas: 'X', 'O', null
  playerXUserId: string;
  playerOUserId: string;
  winnerUserId: string | null;
  isTie: boolean;
  winningLine: number[] | null;
}

const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Filas
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columnas
  [0, 4, 8], [2, 4, 6],             // Diagonales
];

export function TicTacToeGame({
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

  const initialGameState: TicTacToeState = {
    board: Array(9).fill(null),
    playerXUserId: p1,
    playerOUserId: p2,
    winnerUserId: null,
    isTie: false,
    winningLine: null,
  };

  const {
    gameState,
    currentTurnUserId,
    isMyTurn,
    loading,
    isSettling,
    settlementResult,
    dispatchAction,
  } = useGameEngine({
    table,
    players: uniquePlayers,
    currentUserId,
    initialState: initialGameState,
  });

  const state = (gameState as unknown as TicTacToeState) || initialGameState;
  const board = state.board || Array(9).fill(null);

  const isPlayerX = currentUserId === state.playerXUserId;
  const mySymbol = isPlayerX ? 'X' : 'O';

  const checkWinner = (newBoard: (string | null)[]) => {
    for (const combo of WINNING_COMBOS) {
      const [a, b, c] = combo;
      if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) {
        return {
          winnerSymbol: newBoard[a],
          line: combo,
        };
      }
    }
    return null;
  };

  const handleCellClick = async (index: number) => {
    if (!isMyTurn || board[index] !== null || state.winnerUserId || state.isTie || isSettling) {
      return;
    }

    const newBoard = [...board];
    newBoard[index] = mySymbol;

    const winResult = checkWinner(newBoard);
    const isFull = newBoard.every((cell) => cell !== null);

    let winnerId: string | null = null;
    let tie = false;
    let winningLine: number[] | null = null;

    if (winResult) {
      winnerId = winResult.winnerSymbol === 'X' ? state.playerXUserId : state.playerOUserId;
      winningLine = winResult.line;
    } else if (isFull) {
      tie = true;
    }

    const nextTurn = currentUserId === state.playerXUserId ? state.playerOUserId : state.playerXUserId;

    const nextState: TicTacToeState = {
      ...state,
      board: newBoard,
      winnerUserId: winnerId,
      isTie: tie,
      winningLine,
    };

    await dispatchAction(
      'MAKE_MOVE',
      { index, symbol: mySymbol },
      nextState as unknown as Record<string, unknown>,
      winnerId || tie ? null : nextTurn,
      winnerId,
      tie
    );
  };

  const isGameOver = Boolean(state.winnerUserId || state.isTie);
  const isWinner = state.winnerUserId === currentUserId;
  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">3 en Raya Criollo</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Tu Símbolo</div>
            <div className="text-lg font-black text-amber-400 font-mono flex items-center justify-end gap-1">
              {mySymbol === 'X' ? <XIcon className="w-5 h-5 text-amber-400" /> : <OIcon className="w-5 h-5 text-blue-400" />}
              <span>({mySymbol})</span>
            </div>
          </div>
        </div>

        {/* Turno Actual */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Turno:</span>
            {isGameOver ? (
              <span className="font-bold text-amber-400">Partida Finalizada</span>
            ) : isMyTurn ? (
              <span className="font-bold text-emerald-400 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                ¡Tu turno! Haz tu jugada
              </span>
            ) : (
              <span className="font-medium text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                Esperando al rival...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tablero 3x3 */}
      <div className="relative bg-slate-900 border-2 border-slate-800 rounded-3xl p-4 shadow-2xl">
        <div className="grid grid-cols-3 gap-3 w-72 h-72 sm:w-80 sm:h-80">
          {board.map((cell, index) => {
            const isWinningCell = state.winningLine?.includes(index);
            return (
              <button
                key={index}
                id={`tictactoe-cell-${index}`}
                disabled={!isMyTurn || cell !== null || isGameOver || isSettling}
                onClick={() => handleCellClick(index)}
                className={`flex items-center justify-center rounded-2xl text-4xl sm:text-5xl font-black transition-all duration-200 select-none ${
                  isWinningCell
                    ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-500/20 animate-bounce'
                    : cell
                    ? 'bg-slate-950/80 border border-slate-800 text-slate-100 cursor-default'
                    : isMyTurn && !isGameOver
                    ? 'bg-slate-950/40 border border-slate-700/60 hover:bg-amber-500/10 hover:border-amber-500/40 cursor-pointer active:scale-95'
                    : 'bg-slate-950/30 border border-slate-800/40 cursor-not-allowed opacity-60'
                }`}
              >
                {cell === 'X' && <XIcon className="w-12 h-12 text-amber-400 stroke-[3]" />}
                {cell === 'O' && <OIcon className="w-12 h-12 text-blue-400 stroke-[3]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overlay de Resultado */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {state.isTie ? (
            <div>
              <div className="text-3xl font-black text-amber-400 mb-1">¡EMPATE TÉCNICO!</div>
              <p className="text-xs text-slate-300">
                Se procedió con el <strong className="text-emerald-400">100% de devolución</strong> de las entradas a cada jugador.
              </p>
            </div>
          ) : isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">¡VICTORIA! 🏆</div>
              <p className="text-xs text-slate-300">
                Has ganado el 90% del pozo acumulado:{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">PARTIDA FINALIZADA</div>
              <p className="text-xs text-slate-400">Tu rival ha completado el 3 en raya.</p>
            </div>
          )}

          {isSettling && (
            <div className="text-xs text-amber-300 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Liquidando fondos en Supabase Ledger...</span>
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
