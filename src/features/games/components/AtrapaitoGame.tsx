// ==============================================================================
// RASPANDO LA OLLA — ATRAPAÍTO (JUEGO CRIOLLO DE REFLEJOS)
// ==============================================================================
// Arena interactiva de reflejos, tokens criollos voladores, combos y multiplicadores,
// cronómetro de ronda sincronizado y liquidación de pozo al mayor puntaje.
// ==============================================================================

import { useState, useEffect, useRef } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, Zap, Timer, Coins } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

interface TargetItem {
  id: string;
  x: number; // Porcentaje 5 - 85
  y: number; // Porcentaje 5 - 80
  points: number;
  type: 'COIN' | 'TOTUMA' | 'DOMINO';
}

interface AtrapaitoState {
  scores: Record<string, number>; // userId -> puntos
  timeLeft: number;
  isRunning: boolean;
  winnerUserId: string | null;
  isTie: boolean;
}

export function AtrapaitoGame({
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
  const initialScores: Record<string, number> = {};
  players.forEach((p) => {
    initialScores[p.userId] = 0;
  });

  const initialAtrapaitoState: AtrapaitoState = {
    scores: initialScores,
    timeLeft: 20, // 20 segundos de ronda intensa
    isRunning: false,
    winnerUserId: null,
    isTie: false,
  };

  const {
    gameState,
    isHost,
    isSettling,
    dispatchAction,
  } = useGameEngine({
    table,
    players,
    currentUserId,
    initialState: initialAtrapaitoState,
  });

  const state = (gameState as unknown as AtrapaitoState) || initialAtrapaitoState;
  const myScore = (currentUserId ? state.scores?.[currentUserId] : 0) || 0;

  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [combo, setCombo] = useState(1);

  // Generar tokens en posiciones aleatorias
  const spawnTarget = () => {
    const types: ('COIN' | 'TOTUMA' | 'DOMINO')[] = ['COIN', 'TOTUMA', 'DOMINO'];
    const selectedType = types[Math.floor(Math.random() * types.length)];
    const pts = selectedType === 'COIN' ? 10 : selectedType === 'TOTUMA' ? 25 : 50;

    const newTarget: TargetItem = {
      id: `target_${Date.now()}_${Math.random()}`,
      x: Math.floor(Math.random() * 75) + 10,
      y: Math.floor(Math.random() * 70) + 10,
      points: pts,
      type: selectedType,
    };

    setTargets((prev) => [...prev.slice(-4), newTarget]);
  };

  // Iniciar partida (Host)
  const handleStartGame = async () => {
    if (!isHost || state.isRunning || state.winnerUserId || isSettling) return;

    const nextState: AtrapaitoState = {
      ...state,
      isRunning: true,
      timeLeft: 20,
    };

    await dispatchAction(
      'START_GAME',
      { startedAt: new Date().toISOString() },
      nextState as unknown as Record<string, unknown>,
      null
    );
  };

  // Intervalo del cronómetro y aparición de tokens
  useEffect(() => {
    if (!state.isRunning || state.winnerUserId) return;

    const spawnInterval = setInterval(() => {
      spawnTarget();
    }, 900);

    const timerInterval = setInterval(() => {
      if (isHost && state.timeLeft > 0) {
        const nextTime = state.timeLeft - 1;
        if (nextTime <= 0) {
          // Finalizar ronda
          let highestScore = -1;
          let winnerId: string | null = null;
          let tie = false;

          Object.entries(state.scores || {}).forEach(([uid, pts]) => {
            if (pts > highestScore) {
              highestScore = pts;
              winnerId = uid;
              tie = false;
            } else if (pts === highestScore && highestScore > 0) {
              tie = true;
            }
          });

          const finalState: AtrapaitoState = {
            ...state,
            timeLeft: 0,
            isRunning: false,
            winnerUserId: tie ? null : winnerId,
            isTie: tie,
          };

          dispatchAction(
            'END_GAME',
            { scores: state.scores, winnerUserId: tie ? null : winnerId },
            finalState as unknown as Record<string, unknown>,
            null,
            tie ? null : winnerId,
            tie
          );
        } else {
          dispatchAction(
            'TIME_TICK',
            { timeLeft: nextTime },
            { ...state, timeLeft: nextTime } as unknown as Record<string, unknown>,
            null
          );
        }
      }
    }, 1000);

    return () => {
      clearInterval(spawnInterval);
      clearInterval(timerInterval);
    };
  }, [state.isRunning, state.timeLeft, isHost, state.scores, state.winnerUserId]);

  // Atrapada de token por el jugador
  const handleCatchTarget = async (targetId: string, basePts: number) => {
    if (!currentUserId || !state.isRunning || state.winnerUserId || isSettling) return;

    setTargets((prev) => prev.filter((t) => t.id !== targetId));

    const earned = basePts * combo;
    setCombo((c) => Math.min(4, c + 1));

    const newScores = {
      ...state.scores,
      [currentUserId]: (state.scores?.[currentUserId] || 0) + earned,
    };

    const nextState: AtrapaitoState = {
      ...state,
      scores: newScores,
    };

    await dispatchAction(
      'CATCH_TOKEN',
      { targetId, earned, userId: currentUserId },
      nextState as unknown as Record<string, unknown>,
      null
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
              <h2 className="text-base font-black text-slate-100">Atrapaíto Criollo</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-950 border border-slate-800 text-amber-400 font-mono font-bold text-sm">
              <Timer className="w-4 h-4 text-amber-400" />
              <span>{state.timeLeft}s</span>
            </div>

            {isHost && !state.isRunning && !isGameOver && (
              <Button size="sm" variant="primary" onClick={handleStartGame}>
                <Zap className="w-4 h-4 mr-1.5" />
                ¡Comenzar Ronda!
              </Button>
            )}
          </div>
        </div>

        {/* Marcador en vivo */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Tu Puntaje:</span>
            <span className="font-mono font-bold text-emerald-400 text-sm">{myScore} pts</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
              Combo x{combo}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {players.map((p) => (
              <div key={p.userId} className="font-mono text-slate-300 text-[11px]">
                {p.displayName}: <strong className="text-amber-400">{state.scores?.[p.userId] || 0}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Arena de Reflejos */}
      <div className="w-full h-[380px] bg-slate-950 border-4 border-slate-800 rounded-3xl relative overflow-hidden shadow-2xl select-none">
        {!state.isRunning && !isGameOver ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-950/90 z-10">
            <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Coins className="w-10 h-10 animate-bounce" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Prepárate para atrapar tokens criollos</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Haz clic o pulsa rápidamente las monedas y fichas que aparezcan en pantalla para sumar puntos antes de que acabe el tiempo.
            </p>
          </div>
        ) : (
          targets.map((target) => (
            <button
              key={target.id}
              id={`atrapaito-token-${target.id}`}
              onClick={() => handleCatchTarget(target.id, target.points)}
              style={{
                top: `${target.y}%`,
                left: `${target.x}%`,
              }}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 p-3 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-amber-200 text-slate-950 font-black shadow-lg animate-in zoom-in-50 hover:scale-125 active:scale-75 transition-all flex items-center justify-center gap-1 cursor-pointer"
            >
              {target.type === 'COIN' && <span className="text-xl sm:text-2xl">🪙</span>}
              {target.type === 'TOTUMA' && <span className="text-xl sm:text-2xl">🥥</span>}
              {target.type === 'DOMINO' && <span className="text-xl sm:text-2xl">🎲</span>}
              <span className="text-[10px] sm:text-xs font-mono font-black">+{target.points}</span>
            </button>
          ))
        )}
      </div>

      {/* Overlay de Resultado */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {state.isTie ? (
            <div>
              <div className="text-3xl font-black text-amber-400 mb-1">¡EMPATE EN PUNTOS!</div>
              <p className="text-xs text-slate-300">
                Ambos participantes obtuvieron la misma puntuación. Reembolso del 100%.
              </p>
            </div>
          ) : isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">¡MÁXIMO PUNTAJE! 🏆</div>
              <p className="text-xs text-slate-300">
                Has ganado con {myScore} puntos y te llevas:{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">RONDA FINALIZADA</div>
              <p className="text-xs text-slate-400">Otro participante acumuló más puntos de reflejos.</p>
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
