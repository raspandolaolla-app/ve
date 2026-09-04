// ==============================================================================
// RASPANDO LA OLLA — PIEDRA, PAPEL O TIJERA (1v1) - VERSIÓN CORREGIDA
// ==============================================================================
// Alineado con RockPaperScissorsEngine.ts - Selección simultánea protegida
// Mejor de 3 rondas (primero a 2 puntos gana)
// ==============================================================================

import type { GameTable, TablePlayer } from '../../../types/tables';
import type { RPSState, RPSChoice } from '../../../types/games';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { GameAbandonButton } from '../../../components/common/GameAbandonButton';
import { Trophy, RefreshCw, ShieldAlert } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

export function RockPaperScissorsGame({
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

  const playerNames: Record<string, string> = {};
  uniquePlayers.forEach((p) => {
    playerNames[p.userId] = p.displayName || 'Jugador';
  });

  const initialRPSState: RPSState = {
    round: 1,
    targetWins: 2, // Primero a 2 puntos gana (mejor de 3)
    scores: {},
    playerNames,
    playerChoices: {},
    phase: 'selecting',
    status: 'playing',
    winnerUserId: null,
    roundWinnerUserId: null,
    history: [],
  };

  const {
    gameState,
    isSettling,
    settlementResult,
    dispatchAction,
    abandonNotice,
  } = useGameEngine({
    table,
    players: uniquePlayers,
    currentUserId,
    initialState: initialRPSState,
  });

  const state = (gameState as unknown as RPSState) || initialRPSState;

  // Inicializar playerChoices si no existe
  const myChoiceData = state.playerChoices[currentUserId || ''] || { choice: undefined, committed: false };
  const opponentId = Object.keys(state.playerChoices).find((id) => id !== currentUserId);
  const opponentChoiceData = opponentId ? state.playerChoices[opponentId] || { choice: undefined, committed: false } : null;

  const myChoice = myChoiceData.choice;
  const hasCommitted = myChoiceData.committed;
  const opponentChoice = opponentChoiceData?.choice;
  const opponentCommitted = opponentChoiceData?.committed || false;

  const myScore = state.scores[currentUserId || ''] || 0;
  const opponentScore = opponentId ? state.scores[opponentId] || 0 : 0;

  const isMyTurn = state.phase === 'selecting' && !hasCommitted && !isSettling;

  // Manejar selección de jugada
  const handleMakeChoice = async (choice: RPSChoice) => {
    if (!isMyTurn || hasCommitted || state.status === 'game_won' || isSettling) {
      return;
    }

    // Actualizar playerChoices con la nueva selección
    const updatedChoices = {
      ...state.playerChoices,
      [currentUserId || '']: {
        choice,
        committed: true,
      },
    };

    const playerIds = Object.keys(updatedChoices);
    const allCommitted = playerIds.length >= 2 && playerIds.every((id) => updatedChoices[id]?.committed);

    let nextState: RPSState;

    if (!allCommitted) {
      // Aún falta el oponente por elegir
      nextState = {
        ...state,
        playerChoices: updatedChoices,
        phase: 'selecting',
      };
    } else {
      // Ambos han elegido - evaluar ronda
      const [id1, id2] = playerIds;
      const c1 = updatedChoices[id1]?.choice!;
      const c2 = updatedChoices[id2]?.choice!;

      let roundWinnerId: string | null = null;
      const newScores = { ...state.scores };

      if (c1 !== c2) {
        // Determinar ganador de la ronda
        if (
          (c1 === 'rock' && c2 === 'scissors') ||
          (c1 === 'scissors' && c2 === 'paper') ||
          (c1 === 'paper' && c2 === 'rock')
        ) {
          roundWinnerId = id1;
        } else {
          roundWinnerId = id2;
        }
        newScores[roundWinnerId] = (newScores[roundWinnerId] || 0) + 1;
      }

      // Verificar si alguien alcanzó el puntaje de victoria
      const isMatchWon = roundWinnerId !== null && newScores[roundWinnerId] >= state.targetWins;

      nextState = {
        ...state,
        playerChoices: updatedChoices,
        scores: newScores,
        phase: isMatchWon ? 'match_ended' : 'round_result',
        status: isMatchWon ? 'game_won' : 'round_won',
        winnerUserId: isMatchWon ? roundWinnerId : null,
        roundWinnerUserId: roundWinnerId,
        history: [
          ...state.history,
          {
            roundNumber: state.round,
            choices: { [id1]: c1, [id2]: c2 },
            winnerUserId: roundWinnerId,
            summary: roundWinnerId
              ? `${playerNames[roundWinnerId] || 'Ganador'} ganó la ronda ${state.round}`
              : `Empate en la ronda ${state.round}`,
          },
        ],
      };
    }

    await dispatchAction(
      'SUBMIT_CHOICE',
      { choice, userId: currentUserId },
      nextState as unknown as Record<string, unknown>,
      null, // En RPS no hay turnos secuenciales
      nextState.status === 'game_won' ? nextState.winnerUserId : null,
      false
    );
  };

  // Manejar siguiente ronda
  const handleNextRound = async () => {
    if (state.phase !== 'round_result' || isSettling) return;

    // Resetear elecciones para la nueva ronda
    const resetChoices: Record<string, { choice?: RPSChoice; committed: boolean }> = {};
    Object.keys(state.playerChoices).forEach((id) => {
      resetChoices[id] = { committed: false };
    });

    const nextState: RPSState = {
      ...state,
      round: state.round + 1,
      playerChoices: resetChoices,
      phase: 'selecting',
      status: 'playing',
      roundWinnerUserId: null,
    };

    await dispatchAction(
      'NEXT_ROUND',
      { round: state.round + 1 },
      nextState as unknown as Record<string, unknown>,
      null
    );
  };

  const isGameOver = state.status === 'game_won';
  const isWinner = state.winnerUserId === currentUserId;
  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  const renderIcon = (c: RPSChoice | null | undefined) => {
    if (c === 'rock') return '🪨';
    if (c === 'paper') return '📄';
    if (c === 'scissors') return '✂️';
    return '❓';
  };

  const getChoiceLabel = (c: RPSChoice) => {
    return c === 'rock' ? 'Piedra' : c === 'paper' ? 'Papel' : 'Tijera';
  };

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
              <h2 className="text-base font-black text-slate-100">Piedra, Papel o Tijera (1v1)</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
              Ronda {state.round}
            </span>

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

        {/* Marcador de Puntos */}
        <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-2 gap-4 text-center">
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Tú</div>
            <div className="text-2xl font-black text-amber-400 font-mono">
              {myScore} / {state.targetWins}
            </div>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">
              {opponentId ? state.playerNames[opponentId] || 'Rival' : 'Rival'}
            </div>
            <div className="text-2xl font-black text-slate-300 font-mono">
              {opponentScore} / {state.targetWins}
            </div>
          </div>
        </div>
      </div>

      {/* Arena de Duelo */}
      <div className="w-full bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-center">
        {state.phase === 'round_result' || state.phase === 'match_ended' ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center space-y-2">
                <div className="text-5xl animate-bounce">{renderIcon(myChoice)}</div>
                <div className="text-xs text-amber-400 font-bold">Tu jugada</div>
              </div>
              <div className="text-2xl font-black text-slate-500">VS</div>
              <div className="text-center space-y-2">
                <div className="text-5xl animate-bounce">{renderIcon(opponentChoice)}</div>
                <div className="text-xs text-slate-400 font-bold">
                  {opponentId ? state.playerNames[opponentId] || 'Rival' : 'Rival'}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-bold">
              {state.roundWinnerUserId === null ? (
                <span className="text-amber-300">¡Ronda empatada! Nadie anota punto.</span>
              ) : state.roundWinnerUserId === currentUserId ? (
                <span className="text-emerald-400">¡Ganaste esta ronda! (+1 punto)</span>
              ) : (
                <span className="text-red-400">
                  {opponentId ? state.playerNames[opponentId] || 'El rival' : 'El rival'} ganó esta ronda.
                </span>
              )}
            </div>

            {state.phase === 'round_result' && (
              <Button variant="primary" onClick={handleNextRound} className="w-full py-3">
                Siguiente Ronda
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm font-bold text-slate-300">
              {hasCommitted ? (
                <div className="flex items-center justify-center gap-2 text-amber-300">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Elección fijada ({renderIcon(myChoice)}). Esperando al rival...</span>
                </div>
              ) : (
                <span>Selecciona tu jugada para esta ronda:</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(['rock', 'paper', 'scissors'] as RPSChoice[]).map((c) => (
                <button
                  key={c}
                  id={`rps-choice-${c}`}
                  disabled={hasCommitted || isGameOver || isSettling || state.phase !== 'selecting'}
                  onClick={() => handleMakeChoice(c)}
                  className={`p-4 sm:p-6 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all select-none ${
                    myChoice === c
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 scale-105 shadow-lg shadow-amber-500/20'
                      : !hasCommitted
                      ? 'bg-slate-950/80 border-slate-800 hover:bg-amber-500/10 hover:border-amber-500/40 active:scale-95 text-slate-200'
                      : 'bg-slate-950/40 border-slate-800/40 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="text-4xl sm:text-5xl">{renderIcon(c)}</span>
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {getChoiceLabel(c)}
                  </span>
                </button>
              ))}
            </div>

            <div className="text-[11px] text-slate-500">
              {opponentCommitted
                ? '🟢 El rival ya hizo su jugada secreta.'
                : '⚪ El rival está pensando su jugada.'}
            </div>
          </div>
        )}
      </div>

      {/* Overlay de Resultado Final */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">
                {(state as any).winner === 'OPPONENT_BY_ABANDON' || (state as any).abandoned || abandonNotice
                  ? '¡VICTORIA POR ABANDONO! 🏆'
                  : '¡VICTORIA EN EL DUELO! 🏆'}
              </div>
              <p className="text-xs text-slate-300">
                {(state as any).winner === 'OPPONENT_BY_ABANDON' || (state as any).abandoned || abandonNotice
                  ? '¡Tu rival ha abandonado el duelo! Has ganado:'
                  : `Has alcanzado los ${state.targetWins} puntos y ganas:`}{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">DUELO FINALIZADO</div>
              <p className="text-xs text-slate-400">
                {opponentId ? state.playerNames[opponentId] || 'Tu rival' : 'Tu rival'} alcanzó primero el puntaje de victoria.
              </p>
            </div>
          )}

          {isSettling && (
            <div className="text-xs text-amber-300 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Liquidando premio 90/10 en Supabase...</span>
            </div>
          )}

          {settlementResult?.error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-xs text-red-300">
              <ShieldAlert className="w-4 h-4 inline mr-2" />
              Error en liquidación: {settlementResult.error}
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
