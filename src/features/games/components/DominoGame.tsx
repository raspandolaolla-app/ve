// ==============================================================================
// RASPANDO LA OLLA — DOMINÓ VENEZOLANO (TRANCAÍTO Y TRADICIONAL)
// ==============================================================================
// 28 fichas (Doble Seis), extremos del tablero, colocación validada, pase automático,
// tranca/cierre de partida por conteo de puntos y liquidación de pozo.
// ==============================================================================

import { useState } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, Layers, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

export type DominoTile = [number, number];

// Generar las 28 fichas estándar de dominó
const ALL_TILES: DominoTile[] = [];
for (let i = 0; i <= 6; i++) {
  for (let j = i; j <= 6; j++) {
    ALL_TILES.push([i, j]);
  }
}

interface PlacedTile {
  tile: DominoTile;
  end: 'LEFT' | 'RIGHT';
}

interface DominoState {
  player1UserId: string;
  player2UserId: string;
  player1Hand: DominoTile[];
  player2Hand: DominoTile[];
  boardTiles: PlacedTile[];
  leftEnd: number | null;
  rightEnd: number | null;
  consecutivePasses: number;
  winnerUserId: string | null;
  isTranca: boolean;
  isTie: boolean;
}

// Reparto inicial determinista de fichas para la partida
function generateInitialHands(): { hand1: DominoTile[]; hand2: DominoTile[] } {
  // Mezcla de fichas
  const shuffled = [...ALL_TILES].sort(() => Math.random() - 0.5);
  return {
    hand1: shuffled.slice(0, 7),
    hand2: shuffled.slice(7, 14),
  };
}

export function DominoGame({
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

  const { hand1, hand2 } = generateInitialHands();

  const initialDominoState: DominoState = {
    player1UserId: p1,
    player2UserId: p2,
    player1Hand: hand1,
    player2Hand: hand2,
    boardTiles: [],
    leftEnd: null,
    rightEnd: null,
    consecutivePasses: 0,
    winnerUserId: null,
    isTranca: false,
    isTie: false,
  };

  const {
    gameState,
    currentTurnUserId,
    isMyTurn,
    isSettling,
    dispatchAction,
  } = useGameEngine({
    table,
    players: uniquePlayers,
    currentUserId,
    initialState: initialDominoState,
  });

  const state = (gameState as unknown as DominoState) || initialDominoState;
  const isP1 = currentUserId === state.player1UserId;

  const myHand: DominoTile[] = (isP1 ? state.player1Hand : state.player2Hand) || [];
  const opponentHandCount = (isP1 ? state.player2Hand?.length : state.player1Hand?.length) || 0;

  const [selectedTile, setSelectedTile] = useState<DominoTile | null>(null);

  // Comprobar si una ficha puede jugarse en el tablero
  const canPlayTile = (tile: DominoTile): { canLeft: boolean; canRight: boolean } => {
    if (state.leftEnd === null && state.rightEnd === null) {
      return { canLeft: true, canRight: true }; // Primera jugada
    }
    const canLeft = tile[0] === state.leftEnd || tile[1] === state.leftEnd;
    const canRight = tile[0] === state.rightEnd || tile[1] === state.rightEnd;
    return { canLeft: Boolean(canLeft), canRight: Boolean(canRight) };
  };

  const playableTiles = myHand.filter((t) => {
    const { canLeft, canRight } = canPlayTile(t);
    return canLeft || canRight;
  });

  const canPass = playableTiles.length === 0;

  // Realizar jugada colocando la ficha en el extremo correspondiente
  const handlePlayTile = async (tile: DominoTile, targetEnd: 'LEFT' | 'RIGHT') => {
    if (!isMyTurn || state.winnerUserId || isSettling) return;

    let newLeft = state.leftEnd;
    let newRight = state.rightEnd;

    if (newLeft === null && newRight === null) {
      // Primera ficha en el tablero
      newLeft = tile[0];
      newRight = tile[1];
    } else if (targetEnd === 'LEFT') {
      newLeft = tile[0] === state.leftEnd ? tile[1] : tile[0];
    } else {
      newRight = tile[0] === state.rightEnd ? tile[1] : tile[0];
    }

    const newMyHand = myHand.filter((t) => !(t[0] === tile[0] && t[1] === tile[1]));
    const newP1Hand = isP1 ? newMyHand : state.player1Hand;
    const newP2Hand = isP1 ? state.player2Hand : newMyHand;

    const newBoardTiles: PlacedTile[] = [
      ...state.boardTiles,
      { tile, end: targetEnd },
    ];

    let winnerId: string | null = null;
    // Comprobar si vació la mano (Dominó)
    if (newMyHand.length === 0) {
      winnerId = currentUserId || null;
    }

    const nextTurn = currentUserId === state.player1UserId ? state.player2UserId : state.player1UserId;

    const nextState: DominoState = {
      ...state,
      player1Hand: newP1Hand,
      player2Hand: newP2Hand,
      boardTiles: newBoardTiles,
      leftEnd: newLeft,
      rightEnd: newRight,
      consecutivePasses: 0,
      winnerUserId: winnerId,
    };

    setSelectedTile(null);

    await dispatchAction(
      'PLAY_TILE',
      { tile, targetEnd },
      nextState as unknown as Record<string, unknown>,
      winnerId ? null : nextTurn,
      winnerId,
      false
    );
  };

  // Pasar el turno (cuando no tiene fichas válidas)
  const handlePass = async () => {
    if (!isMyTurn || !canPass || state.winnerUserId || isSettling) return;

    const passes = state.consecutivePasses + 1;
    let winnerId: string | null = null;
    let isTranca = false;
    let isTie = false;

    // Si ambos pasan de forma consecutiva -> TRANCA (Cierre de juego)
    if (passes >= 2) {
      isTranca = true;
      const p1Points = (state.player1Hand || []).reduce((sum, t) => sum + t[0] + t[1], 0);
      const p2Points = (state.player2Hand || []).reduce((sum, t) => sum + t[0] + t[1], 0);

      if (p1Points < p2Points) {
        winnerId = state.player1UserId;
      } else if (p2Points < p1Points) {
        winnerId = state.player2UserId;
      } else {
        isTie = true;
      }
    }

    const nextTurn = currentUserId === state.player1UserId ? state.player2UserId : state.player1UserId;

    const nextState: DominoState = {
      ...state,
      consecutivePasses: passes,
      winnerUserId: winnerId,
      isTranca,
      isTie,
    };

    await dispatchAction(
      'PASS_TURN',
      { consecutivePasses: passes },
      nextState as unknown as Record<string, unknown>,
      winnerId || isTie ? null : nextTurn,
      winnerId,
      isTie
    );
  };

  const isGameOver = Boolean(state.winnerUserId || state.isTie);
  const isWinner = state.winnerUserId === currentUserId;
  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-4xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">Dominó Venezolano (Doble Seis)</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Fichas rival: {opponentHandCount}</span>
            </div>
          </div>
        </div>

        {/* Turno e Indicadores de Extremos */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Turno:</span>
            {isGameOver ? (
              <span className="font-bold text-amber-400">Partida Finalizada</span>
            ) : isMyTurn ? (
              <span className="font-bold text-emerald-400 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                ¡Tu turno de jugar o trancar!
              </span>
            ) : (
              <span className="font-medium text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                Esperando jugada rival...
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-amber-400">
              Punta Izquierda: <strong>{state.leftEnd ?? '-'}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-amber-400">
              Punta Derecha: <strong>{state.rightEnd ?? '-'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Mesa de Juego Verde / Fichas Jugadas */}
      <div className="w-full min-h-[220px] bg-gradient-to-br from-emerald-950/80 to-slate-950 border-4 border-emerald-900/60 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-3 left-4 text-[10px] font-mono text-emerald-500/60 uppercase tracking-widest">
          Mesa Criolla • Dominó Oficial
        </div>

        {state.boardTiles.length === 0 ? (
          <div className="text-center text-emerald-400/60 text-xs py-8">
            La mesa está limpia. Coloca la primera ficha para abrir las dos puntas.
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2 py-4 max-w-2xl">
            {state.boardTiles.map((item, idx) => (
              <div
                key={idx}
                className="w-10 h-16 sm:w-12 sm:h-20 bg-slate-100 border-2 border-slate-400 rounded-lg flex flex-col items-center justify-between py-1 shadow-md text-slate-950 font-black text-sm select-none"
              >
                <span>{item.tile[0]}</span>
                <div className="w-full h-0.5 bg-slate-400"></div>
                <span>{item.tile[1]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mano de Fichas del Jugador Actual */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Tus Fichas ({myHand.length})
          </div>

          {isMyTurn && canPass && !isGameOver && (
            <Button size="sm" variant="danger" onClick={handlePass}>
              Paso (No tengo pinta)
            </Button>
          )}
        </div>

        {/* Fichas en mano */}
        <div className="flex flex-wrap items-center gap-3">
          {myHand.map((tile, idx) => {
            const { canLeft, canRight } = canPlayTile(tile);
            const isPlayable = isMyTurn && !isGameOver && (canLeft || canRight);
            const isSelected = selectedTile && selectedTile[0] === tile[0] && selectedTile[1] === tile[1];

            return (
              <div key={idx} className="flex flex-col items-center gap-1.5">
                <button
                  id={`domino-tile-${tile[0]}-${tile[1]}`}
                  disabled={!isPlayable || isSettling}
                  onClick={() => {
                    if (state.leftEnd === null) {
                      handlePlayTile(tile, 'LEFT');
                    } else if (canLeft && canRight && state.leftEnd !== state.rightEnd) {
                      setSelectedTile(tile);
                    } else if (canLeft) {
                      handlePlayTile(tile, 'LEFT');
                    } else if (canRight) {
                      handlePlayTile(tile, 'RIGHT');
                    }
                  }}
                  className={`w-12 h-20 sm:w-14 sm:h-24 rounded-xl border-2 flex flex-col items-center justify-between py-1.5 font-black text-lg select-none transition-all ${
                    isSelected
                      ? 'bg-amber-100 border-amber-500 ring-4 ring-amber-400 scale-105 text-slate-950 shadow-xl'
                      : isPlayable
                      ? 'bg-slate-100 border-slate-300 text-slate-950 hover:-translate-y-2 hover:shadow-lg cursor-pointer'
                      : 'bg-slate-800/80 border-slate-700 text-slate-500 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span>{tile[0]}</span>
                  <div className="w-full h-0.5 bg-slate-400"></div>
                  <span>{tile[1]}</span>
                </button>

                {/* Si requiere elegir extremo */}
                {isSelected && (
                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      onClick={() => handlePlayTile(tile, 'LEFT')}
                      className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
                    >
                      Punta Izq
                    </button>
                    <button
                      onClick={() => handlePlayTile(tile, 'RIGHT')}
                      className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
                    >
                      Punta Der
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Overlay de Resultado */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {state.isTie ? (
            <div>
              <div className="text-3xl font-black text-amber-400 mb-1">¡TRANCA EMPATADA!</div>
              <p className="text-xs text-slate-300">
                Ambos jugadores sumaron la misma cantidad de puntos en mano. Reembolso del 100%.
              </p>
            </div>
          ) : isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">
                {state.isTranca ? '¡GANASTE POR TRANCA! 🏆' : '¡DOMINÓ! GANASTE 🏆'}
              </div>
              <p className="text-xs text-slate-300">
                Has ganado el 90% del pozo:{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">
                {state.isTranca ? 'TRANCA: GANÓ EL RIVAL' : 'DOMINÓ: GANÓ EL RIVAL'}
              </div>
              <p className="text-xs text-slate-400">El rival se quedó con menos puntos o vació su mano.</p>
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
