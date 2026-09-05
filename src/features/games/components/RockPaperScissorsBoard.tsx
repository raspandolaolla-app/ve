import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, RefreshCw, Trophy, Sparkles } from 'lucide-react';
import type { RPSState, RPSChoice } from '../engines/RockPaperScissorsEngine';
import { TurnTimer } from './TurnTimer';

interface RockPaperScissorsBoardProps {
  state: RPSState;
  currentUserId: string;
  isMyTurn?: boolean;
  hasPlayerChosen?: boolean;
  turnExpiresAt?: string;
  sessionId?: string;
  turnTimeLeft?: number;
  onAction?: (actionType: string, data: any) => void;
  onSubmitChoice?: (choice: RPSChoice) => void;
  onNextRound?: () => void;
  onTimeout?: () => void;
  onTurnTimeout?: () => void;
}

export const RockPaperScissorsBoard: React.FC<RockPaperScissorsBoardProps> = ({ 
  state, 
  currentUserId, 
  isMyTurn: propIsMyTurn,
  hasPlayerChosen: propHasPlayerChosen,
  turnExpiresAt,
  sessionId,
  turnTimeLeft,
  onAction,
  onSubmitChoice,
  onNextRound,
  onTimeout,
  onTurnTimeout,
}) => {
  const [selectedChoice, setSelectedChoice] = useState<'ROCK' | 'PAPER' | 'SCISSORS' | null>(null);

  const isPlayer1 = currentUserId === state.player1Id || (!state.player1Id && Object.keys(state.playerNames || {})[0] === currentUserId);
  const opponentId = isPlayer1 
    ? (state.player2Id || Object.keys(state.playerNames || {}).find((id) => id !== currentUserId) || '')
    : (state.player1Id || Object.keys(state.playerNames || {}).find((id) => id !== currentUserId) || '');

  const myLives = isPlayer1 
    ? (state.player1Lives ?? state.lives?.[currentUserId] ?? 3) 
    : (state.player2Lives ?? state.lives?.[currentUserId] ?? 3);

  const opponentLives = isPlayer1 
    ? (state.player2Lives ?? state.lives?.[opponentId] ?? 3) 
    : (state.player1Lives ?? state.lives?.[opponentId] ?? 3);

  const rawMyChoice = isPlayer1 
    ? (state.player1Choice || state.playerChoices?.[currentUserId]?.choice) 
    : (state.player2Choice || state.playerChoices?.[currentUserId]?.choice);

  const rawOpponentChoice = isPlayer1 
    ? (state.player2Choice || state.playerChoices?.[opponentId]?.choice) 
    : (state.player1Choice || state.playerChoices?.[opponentId]?.choice);

  const myChoice = rawMyChoice ? (rawMyChoice.toString().toUpperCase() as 'ROCK' | 'PAPER' | 'SCISSORS') : selectedChoice;
  const opponentChoice = rawOpponentChoice ? (rawOpponentChoice.toString().toUpperCase() as 'ROCK' | 'PAPER' | 'SCISSORS') : null;
  const hasChosen = Boolean(myChoice || state.playerChoices?.[currentUserId]?.committed || propHasPlayerChosen);

  const isRoundCommit = state.status === 'ROUND_COMMIT' || state.phase === 'selecting';
  const isRoundReveal = state.status === 'ROUND_REVEAL' || state.phase === 'round_result';
  const isMatchEnded = state.status === 'MATCH_ENDED' || state.status === 'game_won' || Boolean(state.matchWinner) || myLives <= 0 || opponentLives <= 0;

  // Determinar si es el turno de este jugador para elegir
  const computedIsMyTurn = propIsMyTurn !== undefined 
    ? propIsMyTurn 
    : (isRoundCommit && !hasChosen && !isMatchEnded);

  const activeTurnName = computedIsMyTurn 
    ? 'TÚ' 
    : (state.playerNames?.[opponentId] || 'OPONENTE');

  // Resetear selección local cuando se cambia a nueva ronda
  useEffect(() => {
    if (isRoundCommit) {
      setSelectedChoice(null);
    }
  }, [state.roundNumber, state.round, isRoundCommit]);

  // Auto-avanzar a la siguiente ronda después de 2.5 segundos de mostrar el resultado
  useEffect(() => {
    if (isRoundReveal && !isMatchEnded) {
      const timer = setTimeout(() => {
        if (onAction) onAction('NEXT_ROUND', {});
        if (onNextRound) onNextRound();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isRoundReveal, isMatchEnded, onAction, onNextRound]);

  const handleChoice = (choice: 'ROCK' | 'PAPER' | 'SCISSORS') => {
    // Validar turno
    if (!computedIsMyTurn) {
      console.warn('[RPS] No es tu turno para elegir jugada');
      return;
    }

    // Validar que no haya elegido ya
    if (hasChosen) {
      console.warn('[RPS] Ya elegiste, esperando al oponente');
      return;
    }

    // Validar estado de ronda
    if (!isRoundCommit || isMatchEnded) {
      console.warn('[RPS] La ronda no está activa para selecciones');
      return;
    }

    setSelectedChoice(choice);
    if (onAction) onAction('CHOOSE', { choice });
    if (onSubmitChoice) onSubmitChoice(choice);
  };

  const handleTimeout = () => {
    console.warn('[RPS] Temporizador de turno agotado');
    if (onTurnTimeout) {
      onTurnTimeout();
    } else if (onTimeout) {
      onTimeout();
    } else if (!hasChosen && isRoundCommit) {
      // Auto-elegir jugada aleatoria si no hay handler provisto
      const choices: ('ROCK' | 'PAPER' | 'SCISSORS')[] = ['ROCK', 'PAPER', 'SCISSORS'];
      const randomChoice = choices[Math.floor(Math.random() * choices.length)];
      handleChoice(randomChoice);
    }
  };

  const getChoiceIcon = (choice: string | null | undefined) => {
    switch (choice?.toUpperCase()) {
      case 'ROCK': return '✊';
      case 'PAPER': return '✋';
      case 'SCISSORS': return '✌️';
      default: return '❓';
    }
  };

  const getChoiceName = (choice: string | null | undefined) => {
    switch (choice?.toUpperCase()) {
      case 'ROCK': return 'Piedra';
      case 'PAPER': return 'Papel';
      case 'SCISSORS': return 'Tijera';
      default: return 'Esperando...';
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

  // Pantalla de Fin de Partida
  if (isMatchEnded) {
    const iWon = state.matchWinner 
      ? state.matchWinner === (isPlayer1 ? 'PLAYER1' : 'PLAYER2') 
      : (state.winnerUserId === currentUserId || opponentLives <= 0);

    return (
      <div id="rps-game-over-screen" className="flex flex-col items-center justify-center p-8 text-center w-full max-w-md mx-auto">
        <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} className="mb-6">
          <Trophy className={`w-24 h-24 ${iWon ? 'text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]' : 'text-slate-600'}`} />
        </motion.div>
        <h2 className="text-3xl font-black text-white mb-2">
          {iWon ? '🏆 ¡HAS GANADO LA PARTIDA!' : '😔 HAS PERDIDO LA PARTIDA'}
        </h2>
        <p className="text-slate-400 mb-6 text-sm">
          {iWon ? 'Felicidades, has agotado las vidas de tu oponente.' : 'Tu oponente ha agotado tus 3 vidas.'}
        </p>
      </div>
    );
  }

  const isDraw = state.roundWinner === 'DRAW' || (isRoundReveal && myChoice && opponentChoice && myChoice === opponentChoice);
  const myWonRound = (state.roundWinner === (isPlayer1 ? 'PLAYER1' : 'PLAYER2')) || (state.roundWinnerUserId === currentUserId);

  return (
    <div id="rps-board-container" className="flex flex-col items-center justify-center p-4 max-w-xl mx-auto w-full">
      {/* Temporizador de Turno */}
      {turnExpiresAt && (
        <div className="w-full max-w-md mb-4">
          <TurnTimer
            turnExpiresAt={turnExpiresAt}
            durationSeconds={state.turnDurationSeconds || 15}
            isMyTurn={computedIsMyTurn}
            activePlayerName={activeTurnName}
            status={state.status}
            onTimeout={handleTimeout}
          />
        </div>
      )}

      {/* Marcador de Vidas */}
      <div id="rps-lives-display" className="flex justify-between w-full max-w-md mb-6 px-4">
        {isPlayer1 ? (
          <>
            {renderLives(myLives, "Tus Vidas")}
            {renderLives(opponentLives, "Rival")}
          </>
        ) : (
          <>
            {renderLives(opponentLives, "Rival")}
            {renderLives(myLives, "Tus Vidas")}
          </>
        )}
      </div>

      {/* Indicador de Turno Activo */}
      <div className="w-full max-w-md mb-3 text-center">
        {computedIsMyTurn && !hasChosen ? (
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            <span>🎯 Tu turno - Elige tu jugada</span>
          </div>
        ) : hasChosen && isRoundCommit ? (
          <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>⏳ Esperando la elección del oponente...</span>
          </div>
        ) : null}
      </div>

      {/* Área de Enfrentamiento */}
      <div id="rps-duel-arena" className="relative w-full max-w-md h-64 bg-[#0B0F17] rounded-3xl border border-slate-800 flex items-center justify-center mb-8 overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between w-full px-6 sm:px-12">
          {/* Mi elección */}
          <motion.div key={myChoice || 'waiting-me'} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
            <span className="text-5xl sm:text-6xl mb-2 filter drop-shadow-lg">
              {isRoundCommit && !hasChosen ? '❓' : getChoiceIcon(myChoice)}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-300">
              {isRoundCommit && !hasChosen ? 'Eligiendo...' : getChoiceName(myChoice)}
            </span>
          </motion.div>

          {/* VS */}
          <div className="text-xl sm:text-2xl font-black text-amber-500 italic">VS</div>

          {/* Elección del oponente */}
          <motion.div key={opponentChoice || 'waiting-opponent'} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
            <span className="text-5xl sm:text-6xl mb-2 filter drop-shadow-lg">
              {isRoundCommit ? '❓' : getChoiceIcon(opponentChoice)}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-300">
              {isRoundCommit ? 'Oculto' : getChoiceName(opponentChoice)}
            </span>
          </motion.div>
        </div>

        {/* Resultado de la ronda (Overlay) */}
        <AnimatePresence>
          {isRoundReveal && (state.roundWinner || myChoice) && (
            <motion.div 
              initial={{ y: 50, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              exit={{ y: -50, opacity: 0 }}
              className="absolute bottom-4 left-0 right-0 text-center px-4"
            >
              <span className={`text-sm sm:text-base font-black px-4 py-2 rounded-full shadow-lg ${
                isDraw ? 'bg-slate-600 text-white border border-slate-500' :
                myWonRound ? 'bg-emerald-500 text-white border border-emerald-400' : 'bg-red-500 text-white border border-red-400'
              }`}>
                {isDraw ? '🤝 ¡EMPATE! (Nadie pierde vida)' : 
                 myWonRound ? '🎉 ¡GANASTE! (-1 Vida al rival)' : '💀 PERDISTE (-1 Vida)'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controles de Elección */}
      {isRoundCommit && !hasChosen && (
        <div id="rps-choice-buttons" className="grid grid-cols-3 gap-3 sm:gap-4 w-full max-w-md">
          {[
            { id: 'ROCK', icon: '✊', label: 'Piedra' },
            { id: 'PAPER', icon: '✋', label: 'Papel' },
            { id: 'SCISSORS', icon: '✌️', label: 'Tijera' }
          ].map((option) => (
            <button
              key={option.id}
              id={`rps-choice-btn-${option.id.toLowerCase()}`}
              data-testid={`rps-${option.id.toLowerCase()}`}
              disabled={!computedIsMyTurn || hasChosen || isMatchEnded}
              onClick={() => handleChoice(option.id as any)}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all touch-manipulation cursor-pointer ${
                computedIsMyTurn && !hasChosen
                  ? 'bg-gradient-to-br from-[#131926] to-[#1e293b] hover:from-[#1A2235] hover:to-[#27354f] border border-slate-700 hover:border-amber-500/50 shadow-lg hover:scale-105 active:scale-95 group'
                  : 'bg-slate-850 border border-slate-800 text-slate-500 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="text-4xl mb-2 group-hover:scale-110 transition-transform">{option.icon}</span>
              <span className="text-sm font-bold text-slate-300 group-hover:text-white">{option.label}</span>
            </button>
          ))}
        </div>
      )}

      {isRoundCommit && hasChosen && (
        <div id="rps-waiting-opponent" className="text-center p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl w-full max-w-md">
          <RefreshCw className="w-6 h-6 text-amber-400 mx-auto mb-2 animate-spin" />
          <p className="text-amber-400 font-bold text-sm">Esperando la elección del oponente...</p>
        </div>
      )}
    </div>
  );
};
