// ==============================================================================
// RASPANDO LA OLLA — PIEDRA, PAPEL O TIJERA (1v1)
// ==============================================================================
// Mecanismo de compromiso simultáneo (Commit-Reveal), mejor de 3 rondas,
// resolución de victorias y liquidación de pozo.
// ==============================================================================

import { useState } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, Hand, Scissors, ShieldAlert, Sparkles } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

type Choice = 'ROCK' | 'PAPER' | 'SCISSORS';

interface RPSState {
  player1UserId: string;
  player2UserId: string;
  player1Score: number;
  player2Score: number;
  currentRound: number;
  maxScore: number; // Por defecto gana el primero a 2 puntos (Mejor de 3)
  player1Choice: Choice | null;
  player2Choice: Choice | null;
  player1Committed: boolean;
  player2Committed: boolean;
  roundWinnerUserId: string | 'TIE' | null;
  winnerUserId: string | null;
  isTie: boolean;
}

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

  const p1 = uniquePlayers[0]?.userId || table.hostUserId;
  const p2 = uniquePlayers[1]?.userId && uniquePlayers[1]?.userId !== p1 ? uniquePlayers[1].userId : '';

  const initialRPSState: RPSState = {
    player1UserId: p1,
    player2UserId: p2,
    player1Score: 0,
    player2Score: 0,
    currentRound: 1,
    maxScore: 2, // Primero a 2 puntos gana
    player1Choice: null,
    player2Choice: null,
    player1Committed: false,
    player2Committed: false,
    roundWinnerUserId: null,
    winnerUserId: null,
    isTie: false,
  };

  const {
    gameState,
    isSettling,
    dispatchAction,
  } = useGameEngine({
    table,
    players: uniquePlayers,
    currentUserId,
    initialState: initialRPSState,
  });

  const state = (gameState as unknown as RPSState) || initialRPSState;
  const isP1 = currentUserId === state.player1UserId;

  const hasCommitted = isP1 ? state.player1Committed : state.player2Committed;
  const opponentCommitted = isP1 ? state.player2Committed : state.player1Committed;
  const bothCommitted = state.player1Committed && state.player2Committed;

  const myChoice = isP1 ? state.player1Choice : state.player2Choice;
  const opponentChoice = bothCommitted ? (isP1 ? state.player2Choice : state.player1Choice) : null;

  const handleMakeChoice = async (choice: Choice) => {
    if (hasCommitted || state.winnerUserId || isSettling) return;

    let p1Choice = state.player1Choice;
    let p2Choice = state.player2Choice;
    let p1Comm = state.player1Committed;
    let p2Comm = state.player2Committed;

    if (isP1) {
      p1Choice = choice;
      p1Comm = true;
    } else {
      p2Choice = choice;
      p2Comm = true;
    }

    let roundWinner: string | 'TIE' | null = null;
    let p1Score = state.player1Score;
    let p2Score = state.player2Score;
    let winnerId: string | null = null;
    let roundNum = state.currentRound;

    // Si ambos ya eligieron en esta ronda, calculamos el ganador de la ronda
    if (p1Comm && p2Comm && p1Choice && p2Choice) {
      if (p1Choice === p2Choice) {
        roundWinner = 'TIE';
      } else if (
        (p1Choice === 'ROCK' && p2Choice === 'SCISSORS') ||
        (p1Choice === 'PAPER' && p2Choice === 'ROCK') ||
        (p1Choice === 'SCISSORS' && p2Choice === 'PAPER')
      ) {
        roundWinner = state.player1UserId;
        p1Score += 1;
      } else {
        roundWinner = state.player2UserId;
        p2Score += 1;
      }

      if (p1Score >= state.maxScore) {
        winnerId = state.player1UserId;
      } else if (p2Score >= state.maxScore) {
        winnerId = state.player2UserId;
      }
    }

    const nextState: RPSState = {
      ...state,
      player1Choice: p1Choice,
      player2Choice: p2Choice,
      player1Committed: p1Comm,
      player2Committed: p2Comm,
      player1Score: p1Score,
      player2Score: p2Score,
      roundWinnerUserId: roundWinner,
      winnerUserId: winnerId,
    };

    await dispatchAction(
      'SUBMIT_CHOICE',
      { choice, userId: currentUserId },
      nextState as unknown as Record<string, unknown>,
      null,
      winnerId,
      false
    );
  };

  const handleNextRound = async () => {
    if (!bothCommitted || state.winnerUserId || isSettling) return;

    const nextState: RPSState = {
      ...state,
      currentRound: state.currentRound + 1,
      player1Choice: null,
      player2Choice: null,
      player1Committed: false,
      player2Committed: false,
      roundWinnerUserId: null,
    };

    await dispatchAction(
      'NEXT_ROUND',
      { round: state.currentRound + 1 },
      nextState as unknown as Record<string, unknown>,
      null
    );
  };

  const isGameOver = Boolean(state.winnerUserId);
  const isWinner = state.winnerUserId === currentUserId;
  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  const renderIcon = (c: Choice | null) => {
    if (c === 'ROCK') return '🪨';
    if (c === 'PAPER') return '📄';
    if (c === 'SCISSORS') return '✂️';
    return '❓';
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

          <div className="text-right">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
              Ronda {state.currentRound}
            </span>
          </div>
        </div>

        {/* Marcador de Puntos */}
        <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-2 gap-4 text-center">
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Tú</div>
            <div className="text-2xl font-black text-amber-400 font-mono">
              {isP1 ? state.player1Score : state.player2Score} / {state.maxScore}
            </div>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Rival</div>
            <div className="text-2xl font-black text-slate-300 font-mono">
              {isP1 ? state.player2Score : state.player1Score} / {state.maxScore}
            </div>
          </div>
        </div>
      </div>

      {/* Arena de Duelo */}
      <div className="w-full bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-center">
        {bothCommitted ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center space-y-2">
                <div className="text-5xl animate-bounce">{renderIcon(myChoice)}</div>
                <div className="text-xs text-amber-400 font-bold">Tu jugada</div>
              </div>
              <div className="text-2xl font-black text-slate-500">VS</div>
              <div className="text-center space-y-2">
                <div className="text-5xl animate-bounce">{renderIcon(opponentChoice)}</div>
                <div className="text-xs text-slate-400 font-bold">Rival</div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-sm font-bold">
              {state.roundWinnerUserId === 'TIE' ? (
                <span className="text-amber-300">¡Ronda empatada! Nadie anota punto.</span>
              ) : state.roundWinnerUserId === currentUserId ? (
                <span className="text-emerald-400">¡Ganaste esta ronda! (+1 punto)</span>
              ) : (
                <span className="text-red-400">El rival ganó esta ronda.</span>
              )}
            </div>

            {!isGameOver && (
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
              {(['ROCK', 'PAPER', 'SCISSORS'] as Choice[]).map((c) => (
                <button
                  key={c}
                  id={`rps-choice-${c.toLowerCase()}`}
                  disabled={hasCommitted || isGameOver || isSettling}
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
                    {c === 'ROCK' ? 'Piedra' : c === 'PAPER' ? 'Papel' : 'Tijera'}
                  </span>
                </button>
              ))}
            </div>

            <div className="text-[11px] text-slate-500">
              {opponentCommitted ? '🟢 El rival ya hizo su jugada secreta.' : '⚪ El rival está pensando su jugada.'}
            </div>
          </div>
        )}
      </div>

      {/* Overlay de Resultado Final */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">¡VICTORIA EN EL DUELO! 🏆</div>
              <p className="text-xs text-slate-300">
                Has alcanzado los 2 puntos y ganas:{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">DUELO FINALIZADO</div>
              <p className="text-xs text-slate-400">Tu rival alcanzó primero el puntaje de victoria.</p>
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
