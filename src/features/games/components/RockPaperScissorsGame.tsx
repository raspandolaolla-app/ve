// ==============================================================================
// RASPANDO LA OLLA — PIEDRA, PAPEL O TIJERA (1v1) - 3 VIDAS
// ==============================================================================
// Alineado con RockPaperScissorsEngine.ts - 3 Vidas, Empates Reales y Duelos Justos
// ==============================================================================

import type { GameTable, TablePlayer } from '../../../types/tables';
import type { RPSState, RPSChoice } from '../../../types/games';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, ShieldAlert, Heart } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';
import { initializeRPSState, processRPSAction, nextRound, translateChoice } from '../engines/RockPaperScissorsEngine';
import { TurnTimer } from './TurnTimer';

export function RockPaperScissorsGame({
  table,
  players,
  currentUserId,
  turnExpiresAt,
  onLeave,
}: {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  turnExpiresAt?: string;
  onLeave: () => void;
}) {
  const uniquePlayers = Array.from(
    new Map(players.map((p) => [p.userId, p])).values()
  ).sort((a, b) => a.seatNumber - b.seatNumber);

  const playerNames: Record<string, string> = {};
  uniquePlayers.forEach((p) => {
    playerNames[p.userId] = p.displayName || 'Jugador';
  });

  const p1UserId = uniquePlayers[0]?.userId || table.hostUserId;
  const p2UserId = uniquePlayers[1]?.userId && uniquePlayers[1].userId !== p1UserId ? uniquePlayers[1].userId : '';

  const initialRPSState: RPSState = initializeRPSState(p1UserId, p2UserId);
  initialRPSState.playerNames = playerNames;

  const {
    gameState,
    isSettling,
    settlementResult,
    dispatchAction,
  } = useGameEngine({
    table,
    players: uniquePlayers,
    currentUserId,
    initialState: initialRPSState,
  });

  const state = (gameState as unknown as RPSState) || initialRPSState;

  const isPlayer1 = currentUserId === (state.player1Id || p1UserId);
  const opponentId = isPlayer1 
    ? (state.player2Id || p2UserId || Object.keys(state.playerNames || {}).find((id) => id !== currentUserId) || '')
    : (state.player1Id || p1UserId || Object.keys(state.playerNames || {}).find((id) => id !== currentUserId) || '');

  const myLives = isPlayer1 ? (state.player1Lives ?? 3) : (state.player2Lives ?? 3);
  const opponentLives = isPlayer1 ? (state.player2Lives ?? 3) : (state.player1Lives ?? 3);

  const rawMyChoice = isPlayer1 ? state.player1Choice : state.player2Choice;
  const rawOpponentChoice = isPlayer1 ? state.player2Choice : state.player1Choice;

  const myChoice = rawMyChoice ? (rawMyChoice.toString().toUpperCase() as RPSChoice) : null;
  const opponentChoice = rawOpponentChoice ? (rawOpponentChoice.toString().toUpperCase() as RPSChoice) : null;

  const hasCommitted = Boolean(myChoice || state.playerChoices?.[currentUserId || '']?.committed);
  const opponentCommitted = Boolean(opponentChoice || (opponentId && state.playerChoices?.[opponentId]?.committed));

  const isMyTurn = (state.status === 'ROUND_COMMIT' || state.phase === 'selecting') && !hasCommitted && !isSettling;
  const isRoundReveal = state.status === 'ROUND_REVEAL' || state.phase === 'round_result';
  const isGameOver = state.status === 'MATCH_ENDED' || state.status === 'game_won' || Boolean(state.matchWinner) || myLives <= 0 || opponentLives <= 0;

  // Manejar selección de jugada
  const handleMakeChoice = async (choice: RPSChoice) => {
    if (!isMyTurn || hasCommitted || isGameOver || isSettling) {
      return;
    }

    const nextState = processRPSAction(state, currentUserId || '', choice);

    const isMatchWon = nextState.status === 'MATCH_ENDED' || Boolean(nextState.matchWinner);
    const winnerUserId = isMatchWon 
      ? (nextState.matchWinner === 'PLAYER1' ? nextState.player1Id : nextState.player2Id)
      : null;

    await dispatchAction(
      'CHOOSE',
      { choice, userId: currentUserId },
      nextState as unknown as Record<string, unknown>,
      null,
      winnerUserId,
      false
    );
  };

  // Manejar siguiente ronda
  const handleNextRound = async () => {
    if (!isRoundReveal || isSettling || isGameOver) return;

    const nextState = nextRound(state);

    await dispatchAction(
      'NEXT_ROUND',
      { round: nextState.roundNumber || nextState.round },
      nextState as unknown as Record<string, unknown>,
      null
    );
  };

  // Manejar timeout de turno: jugar automáticamente jugada aleatoria
  const handleTurnTimeout = () => {
    if (!hasCommitted && isMyTurn && !isGameOver && !isSettling) {
      console.warn('[RPS_GAME] Timeout alcanzado: eligiendo jugada aleatoria automática');
      const choices: RPSChoice[] = ['ROCK', 'PAPER', 'SCISSORS'];
      const randomChoice = choices[Math.floor(Math.random() * choices.length)];
      handleMakeChoice(randomChoice);
    }
  };

  const isWinner = state.matchWinner 
    ? state.matchWinner === (isPlayer1 ? 'PLAYER1' : 'PLAYER2')
    : (state.winnerUserId === currentUserId || opponentLives <= 0);

  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  const renderIcon = (c: RPSChoice | null | undefined) => {
    switch (c?.toUpperCase()) {
      case 'ROCK': return '✊';
      case 'PAPER': return '✋';
      case 'SCISSORS': return '✌️';
      default: return '❓';
    }
  };

  const getChoiceLabel = (c: RPSChoice) => {
    switch (c?.toUpperCase()) {
      case 'ROCK': return 'Piedra';
      case 'PAPER': return 'Papel';
      case 'SCISSORS': return 'Tijera';
      default: return 'Opción';
    }
  };

  const renderLives = (lives: number, label: string) => (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className="flex gap-1">
        {[...Array(3)].map((_, i) => (
          <Heart 
            key={i} 
            className={`w-6 h-6 transition-all duration-300 ${i < lives ? 'fill-red-500 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'fill-slate-800 text-slate-700'}`} 
          />
        ))}
      </div>
    </div>
  );

  return (
    <div id="rps-game-wrapper" className="flex flex-col items-center justify-center p-4 max-w-xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">Piedra, Papel o Tijera (Duelo 3 Vidas)</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
              Ronda {state.roundNumber || state.round || 1}
            </span>
          </div>
        </div>

        {/* Marcador de Vidas con Corazones */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex justify-around items-center">
          {renderLives(myLives, 'Tus Vidas')}
          <div className="text-xl font-black text-amber-500 italic">VS</div>
          {renderLives(opponentLives, opponentId ? state.playerNames[opponentId] || 'Rival' : 'Rival')}
        </div>
      </div>

      {/* Temporizador de Turno Sincronizado */}
      {turnExpiresAt && !isGameOver && (
        <div className="w-full">
          <TurnTimer
            turnExpiresAt={turnExpiresAt}
            durationSeconds={15}
            isMyTurn={isMyTurn}
            activePlayerName={isMyTurn ? 'TÚ' : (opponentId ? state.playerNames[opponentId] || 'Rival' : 'Rival')}
            status={state.status}
            onTimeout={handleTurnTimeout}
          />
        </div>
      )}

      {/* Arena de Duelo */}
      <div className="w-full bg-slate-900 border-2 border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 text-center">
        {isRoundReveal || isGameOver ? (
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
              {state.roundWinner === 'DRAW' ? (
                <span className="text-amber-300">🤝 ¡Ronda empatada! Nadie pierde vida.</span>
              ) : (state.roundWinner === (isPlayer1 ? 'PLAYER1' : 'PLAYER2')) || state.roundWinnerUserId === currentUserId ? (
                <span className="text-emerald-400">🎉 ¡Ganaste esta ronda! (-1 Vida al rival)</span>
              ) : (
                <span className="text-red-400">
                  💀 Perdiste esta ronda (-1 Vida).
                </span>
              )}
            </div>

            {isRoundReveal && !isGameOver && (
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
              {(['ROCK', 'PAPER', 'SCISSORS'] as RPSChoice[]).map((c) => (
                <button
                  key={c}
                  id={`rps-game-choice-${c?.toLowerCase()}`}
                  disabled={hasCommitted || isGameOver || isSettling || !isMyTurn}
                  onClick={() => handleMakeChoice(c)}
                  className={`p-4 sm:p-6 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all select-none cursor-pointer ${
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
              <div className="text-3xl font-black text-emerald-400 mb-1">¡VICTORIA EN EL DUELO! 🏆</div>
              <p className="text-xs text-slate-300">
                Has agotado las 3 vidas de tu rival y ganas:{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">DUELO FINALIZADO</div>
              <p className="text-xs text-slate-400">
                {opponentId ? state.playerNames[opponentId] || 'Tu rival' : 'Tu rival'} ha agotado tus 3 vidas.
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
