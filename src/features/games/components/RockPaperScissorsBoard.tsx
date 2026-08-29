// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: PIEDRA, PAPEL O TIJERA
// ==============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import type { RPSState, RPSChoice } from '../../../types/games';

interface RockPaperScissorsBoardProps {
  state: RPSState;
  currentUserId: string;
  onSubmitChoice: (choice: RPSChoice) => void;
  onNextRound?: () => void;
}

const CHOICES: { id: RPSChoice; label: string; icon: string; beats: string; color: string }[] = [
  { id: 'rock', label: 'Piedra', icon: '🪨', beats: 'Tijera', color: 'from-amber-600 to-yellow-600' },
  { id: 'paper', label: 'Papel', icon: '📄', beats: 'Piedra', color: 'from-blue-600 to-cyan-600' },
  { id: 'scissors', label: 'Tijera', icon: '✂️', beats: 'Papel', color: 'from-emerald-600 to-teal-600' },
];

export const RockPaperScissorsBoard: React.FC<RockPaperScissorsBoardProps> = ({
  state,
  currentUserId,
  onSubmitChoice,
  onNextRound,
}) => {
  const playerIds = Object.keys(state.playerNames);
  const p1Id = playerIds[0];
  const p2Id = playerIds[1];

  const myChoiceData = state.playerChoices[currentUserId];
  const hasCommitted = Boolean(myChoiceData?.committed);
  const mySelectedChoice = myChoiceData?.choice;

  const opponentId = playerIds.find((id) => id !== currentUserId) || '';
  const opponentChoiceData = state.playerChoices[opponentId];
  const opponentHasCommitted = Boolean(opponentChoiceData?.committed);
  const opponentRevealedChoice = opponentChoiceData?.choice;

  const isSelecting = state.phase === 'selecting';
  const isRoundResult = state.phase === 'round_result' || state.phase === 'match_ended';

  return (
    <div id="rps-board-container" className="flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full">
      {/* Marcador superior */}
      <div id="rps-scoreboard" className="grid grid-cols-2 gap-4 w-full mb-6">
        {p1Id && (
          <div
            id="rps-player-1-card"
            className={`p-4 rounded-xl border transition-all ${
              state.scores[p1Id] > 0
                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-400/30'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-200 truncate max-w-[120px]">
                  {state.playerNames[p1Id] || 'Jugador 1'}
                </div>
                <div className="flex items-center space-x-1 mt-0.5">
                  {p1Id === currentUserId && (
                    <span className="text-[10px] text-amber-400 font-mono font-semibold uppercase">
                      (Tú)
                    </span>
                  )}
                  {state.playerChoices[p1Id]?.committed && isSelecting && (
                    <span className="inline-flex items-center text-[10px] text-emerald-400 font-medium space-x-0.5">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Listo</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-black text-white font-mono">{state.scores[p1Id] || 0}</span>
                <span className="text-xs text-neutral-500 font-mono">/{state.targetWins}</span>
              </div>
            </div>
          </div>
        )}

        {p2Id && (
          <div
            id="rps-player-2-card"
            className={`p-4 rounded-xl border transition-all ${
              state.scores[p2Id] > 0
                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-400/30'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-200 truncate max-w-[120px]">
                  {state.playerNames[p2Id] || 'Jugador 2'}
                </div>
                <div className="flex items-center space-x-1 mt-0.5">
                  {p2Id === currentUserId && (
                    <span className="text-[10px] text-amber-400 font-mono font-semibold uppercase">
                      (Tú)
                    </span>
                  )}
                  {state.playerChoices[p2Id]?.committed && isSelecting && (
                    <span className="inline-flex items-center text-[10px] text-emerald-400 font-medium space-x-0.5">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Listo</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-black text-white font-mono">{state.scores[p2Id] || 0}</span>
                <span className="text-xs text-neutral-500 font-mono">/{state.targetWins}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Duelo / Clash Arena */}
      <div id="rps-arena" className="w-full bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 mb-6 relative overflow-hidden shadow-2xl">
        <div className="text-center mb-4">
          <span className="text-xs font-bold tracking-widest text-neutral-400 uppercase font-mono">
            Ronda {state.round} • Al mejor de {state.targetWins * 2 - 1} (Primero a {state.targetWins})
          </span>
        </div>

        {/* Zona de Confrontación */}
        <div className="flex items-center justify-around py-4">
          {/* Lado Mi Jugador */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-neutral-400 mb-2 font-medium">Tu Elección</span>
            <div className="w-24 h-24 rounded-2xl bg-neutral-800/80 border-2 border-neutral-700 flex items-center justify-center text-4xl shadow-inner">
              {mySelectedChoice ? (
                <span>
                  {mySelectedChoice === 'rock' ? '🪨' : mySelectedChoice === 'paper' ? '📄' : '✂️'}
                </span>
              ) : hasCommitted ? (
                <ShieldCheck className="w-10 h-10 text-emerald-400 animate-pulse" />
              ) : (
                <span className="text-neutral-600 text-3xl font-mono">?</span>
              )}
            </div>
            <span className="text-xs text-neutral-400 mt-2 font-mono">
              {mySelectedChoice
                ? mySelectedChoice.toUpperCase()
                : hasCommitted
                ? 'COMPROMETIDA'
                : 'PENDIENTE'}
            </span>
          </div>

          {/* VS Icon */}
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-amber-500 font-mono">VS</span>
            {isSelecting && (
              <span className="text-[10px] text-neutral-500 mt-1 font-mono">EN VIVO</span>
            )}
          </div>

          {/* Lado Oponente */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-neutral-400 mb-2 font-medium">
              {state.playerNames[opponentId] || 'Oponente'}
            </span>
            <div className="w-24 h-24 rounded-2xl bg-neutral-800/80 border-2 border-neutral-700 flex items-center justify-center text-4xl shadow-inner">
              {isRoundResult && opponentRevealedChoice ? (
                <span>
                  {opponentRevealedChoice === 'rock'
                    ? '🪨'
                    : opponentRevealedChoice === 'paper'
                    ? '📄'
                    : '✂️'}
                </span>
              ) : opponentHasCommitted ? (
                <ShieldCheck className="w-10 h-10 text-emerald-400" />
              ) : (
                <span className="text-neutral-600 text-3xl font-mono">?</span>
              )}
            </div>
            <span className="text-xs text-neutral-400 mt-2 font-mono">
              {isRoundResult && opponentRevealedChoice
                ? opponentRevealedChoice.toUpperCase()
                : opponentHasCommitted
                ? 'JUGADA OCULTA'
                : 'PENSANDO...'}
            </span>
          </div>
        </div>

        {/* Resumen del Duelo */}
        <AnimatePresence>
          {isRoundResult && state.history.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 rounded-xl bg-neutral-800/80 border border-neutral-700 text-center"
            >
              <p className="text-sm font-semibold text-neutral-200">
                {state.history[state.history.length - 1].summary}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Selector de Opciones (Si estamos en fase de selección) */}
      {isSelecting && !hasCommitted && (
        <div id="rps-choices-panel" className="w-full">
          <div className="text-center text-xs font-semibold text-neutral-300 mb-3">
            Selecciona tu jugada secreta para esta ronda:
          </div>
          <div className="grid grid-cols-3 gap-3">
            {CHOICES.map((choice) => (
              <motion.button
                key={choice.id}
                id={`rps-choice-${choice.id}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSubmitChoice(choice.id)}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border bg-gradient-to-b ${choice.color} border-neutral-700/60 shadow-lg text-white transition-all cursor-pointer hover:border-white/40`}
              >
                <span className="text-4xl mb-2">{choice.icon}</span>
                <span className="text-sm font-bold">{choice.label}</span>
                <span className="text-[10px] text-white/70 mt-0.5">Vence a {choice.beats}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Mensaje de espera si ya elegí pero falta oponente */}
      {isSelecting && hasCommitted && (
        <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 text-center text-sm text-neutral-400">
          <span className="animate-pulse font-medium text-emerald-400">
            ✓ Tu jugada está bloqueada en la cadena. Esperando a que el oponente elija...
          </span>
        </div>
      )}

      {/* Botón Siguiente Ronda si procede */}
      {state.phase === 'round_result' && onNextRound && (
        <div className="mt-4">
          <button
            id="rps-next-round-btn"
            onClick={onNextRound}
            className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold transition-all shadow-lg hover:shadow-amber-500/20"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Siguiente Ronda</span>
          </button>
        </div>
      )}

      {/* Si el partido concluyó */}
      {state.phase === 'match_ended' && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-neutral-950 font-bold flex items-center space-x-2 shadow-xl">
          <Trophy className="w-5 h-5" />
          <span>¡Duelo concluido! Ganador oficial: {state.playerNames[state.winnerUserId || '']}</span>
        </div>
      )}
    </div>
  );
};
