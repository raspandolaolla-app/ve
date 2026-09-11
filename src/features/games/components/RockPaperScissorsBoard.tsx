import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Trophy, Loader, Clock, AlertTriangle } from 'lucide-react';
import type { RPSChoice, RPSState } from '../engines/RockPaperScissorsEngine';

export interface RockPaperScissorsBoardProps {
  state: RPSState;
  currentUserId?: string;
  hasPlayerChosen?: boolean;
  onSubmitChoice?: (choice: RPSChoice) => void;
  onNextRound?: () => void;
  isMyTurn?: boolean;
  onAction?: (actionType: string, data: any) => void;
  turnExpiresAt?: string;
  sessionId?: string;
  turnTimeLeft?: number;
  onTurnTimeout?: () => void;
  onTimeout?: () => void;
}

export const RockPaperScissorsBoard: React.FC<RockPaperScissorsBoardProps> = ({
  state,
  currentUserId = '',
  hasPlayerChosen: externalHasPlayerChosen = false,
  onSubmitChoice,
  onNextRound,
  onAction,
  turnExpiresAt,
  onTimeout,
  onTurnTimeout,
}) => {
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timeoutTriggeredRef = useRef(false);

  const currentRound = state.roundNumber || state.round || 1;
  const [localCommittedRound, setLocalCommittedRound] = useState<number | null>(null);

  // Limpiar el estado de elección local si la ronda del servidor ya avanzó
  useEffect(() => {
    if (localCommittedRound !== null && localCommittedRound < currentRound) {
      setLocalCommittedRound(null);
    }
  }, [currentRound, localCommittedRound]);

  const isSelecting = state.status === 'ROUND_COMMIT' || state.phase === 'selecting';
  const isRevealing = (state.status === 'ROUND_REVEAL' || state.phase === 'round_result') && !isSelecting;
  const isGameOver =
    state.status === 'MATCH_ENDED' ||
    state.phase === 'match_ended' ||
    Boolean(state.matchWinner) ||
    (state.player1Lives !== undefined && state.player1Lives <= 0) ||
    (state.player2Lives !== undefined && state.player2Lives <= 0);

  // Determinar con certeza si el jugador local ha elegido en la ronda ACTUAL
  const hasChosenThisRound = useMemo(() => {
    // 1. Si el jugador local ya seleccionó su jugada en esta ronda específica en esta sesión
    if (localCommittedRound === currentRound) {
      return true;
    }

    // 2. Si Supabase reporta estado explícito de compromiso para el usuario en playerChoices
    const userChoiceState = state.playerChoices?.[currentUserId];
    if (userChoiceState && typeof userChoiceState.committed === 'boolean') {
      return userChoiceState.committed;
    }

    // 3. En fase de selección (ROUND_COMMIT / selecting), ignorar cualquier elección residual de rondas previas
    if (isSelecting) {
      return false;
    }

    // 4. En fase de revelación de resultado, verificar si existe jugada revelada
    const isP1 = currentUserId === state.player1Id;
    if (isP1 && state.player1Choice) return true;
    if (!isP1 && state.player2Choice) return true;

    return Boolean(externalHasPlayerChosen);
  }, [
    currentRound,
    localCommittedRound,
    state.playerChoices,
    currentUserId,
    isSelecting,
    state.player1Id,
    state.player1Choice,
    state.player2Choice,
    externalHasPlayerChosen,
  ]);

  // Sincronización del temporizador de ronda (15s autoritativos)
  useEffect(() => {
    if (!isSelecting || isGameOver || !turnExpiresAt) {
      setTimeLeft(null);
      timeoutTriggeredRef.current = false;
      return;
    }

    const calculateRemaining = () => {
      const expires = new Date(turnExpiresAt).getTime();
      if (isNaN(expires)) return null;
      return Math.max(0, Math.ceil((expires - Date.now()) / 1000));
    };

    const initialLeft = calculateRemaining();
    setTimeLeft(initialLeft);
    timeoutTriggeredRef.current = false;

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeLeft(remaining);

      if (remaining === 0 && !timeoutTriggeredRef.current) {
        timeoutTriggeredRef.current = true;
        clearInterval(interval);
        if (onTimeout) {
          onTimeout();
        } else if (onTurnTimeout) {
          onTurnTimeout();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [turnExpiresAt, isSelecting, isGameOver, onTimeout, onTurnTimeout]);

  // Auto-avanzar a la siguiente ronda después de mostrar el resultado
  const advanceTriggeredForRoundRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRevealing) {
      advanceTriggeredForRoundRef.current = null;
      setShowResult(false);
      return;
    }

    if (isRevealing && state.roundWinner && !isGameOver) {
      if (advanceTriggeredForRoundRef.current === currentRound) {
        return;
      }
      advanceTriggeredForRoundRef.current = currentRound;
      setShowResult(true);
      const timer = setTimeout(() => {
        setShowResult(false);
        if (onNextRound) {
          onNextRound();
        } else if (onAction) {
          onAction('NEXT_ROUND', {});
        }
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [
    isRevealing,
    state.roundWinner,
    currentRound,
    isGameOver,
    onNextRound,
    onAction,
  ]);

  const handleChoice = (choice: RPSChoice) => {
    // ✅ GUARD 1: Solo permitir elegir si estamos en fase de compromiso (ROUND_COMMIT / selecting)
    if (!isSelecting || isGameOver) {
      console.warn('[RPS] No es el momento de elegir');
      return;
    }
    
    // ✅ GUARD 2: No permitir elegir si el jugador ya hizo su jugada en esta ronda
    if (hasChosenThisRound) {
      console.warn('[RPS] Ya elegiste, esperando al oponente');
      return;
    }

    setLocalCommittedRound(currentRound);
    
    // Si pasa ambos guards, la jugada es válida
    if (onSubmitChoice) {
      onSubmitChoice(choice);
    } else if (onAction) {
      onAction('CHOOSE', { choice });
    }
  };

  const isPlayer1 = currentUserId === state.player1Id;

  const getResultMessage = () => {
    if (!state.roundWinner) return null;
    
    if (state.roundWinner === 'DRAW') {
      return { text: '🤝 ¡EMPATE! (Nadie pierde vida)', color: 'text-amber-400', bg: 'bg-amber-500/20' };
    }
    
    const isWinner = (state.roundWinner === 'PLAYER1' && isPlayer1) || (state.roundWinner === 'PLAYER2' && !isPlayer1);
    
    return isWinner
      ? { text: '🎉 ¡GANASTE! (-1 Vida al rival)', color: 'text-emerald-400', bg: 'bg-emerald-500/20' }
      : { text: '💀 PERDISTE (-1 Vida)', color: 'text-red-400', bg: 'bg-red-500/20' };
  };

  const getChoiceIcon = (choice: string | null | undefined) => {
    if (!choice) return null;
    const c = choice.toLowerCase();
    if (c === 'rock') return '🪨';
    if (c === 'paper') return '📄';
    if (c === 'scissors') return '✂️';
    return null;
  };

  const p1Name = state.playerNames?.[state.player1Id] || 'Jugador 1';
  const p2Name = (state.player2Id && state.playerNames?.[state.player2Id]) || 'Jugador 2';

  const p1Lives = state.player1Lives ?? (state.lives && state.player1Id ? state.lives[state.player1Id] : 3) ?? 3;
  const p2Lives = state.player2Lives ?? (state.lives && state.player2Id ? state.lives[state.player2Id] : 3) ?? 3;

  const p1HasChosen = Boolean(
    (currentUserId === state.player1Id && hasChosenThisRound) ||
    state.playerChoices?.[state.player1Id]?.committed ||
    (!isSelecting && state.player1Choice !== null && state.player1Choice !== undefined)
  );
  const p2HasChosen = Boolean(
    (currentUserId === state.player2Id && hasChosenThisRound) ||
    (state.player2Id && state.playerChoices?.[state.player2Id]?.committed) ||
    (!isSelecting && state.player2Choice !== null && state.player2Choice !== undefined)
  );

  return (
    <div id="rps-board-container" className="w-full max-w-full overflow-x-hidden bg-gradient-to-br from-[#0F1523] to-[#1A2235] rounded-2xl p-6 border border-slate-800">
      {/* Vidas de los jugadores */}
      <div id="rps-lives-display" data-testid="player-lives" className="flex justify-between items-center mb-6">
        <div className="text-center">
          <p className="text-white text-sm font-bold mb-2">{p1Name}</p>
          <div className="flex gap-1 justify-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart key={i} size={24} className={i < p1Lives ? 'text-red-500 fill-red-500' : 'text-slate-600'} />
            ))}
          </div>
        </div>
        <div className="text-center">
          <p className="text-amber-400 text-xl font-black">RONDA {currentRound}</p>
          <p className="text-slate-400 text-xs">Mejor de 3 Vidas</p>
        </div>
        <div className="text-center">
          <p className="text-white text-sm font-bold mb-2">{p2Name}</p>
          <div className="flex gap-1 justify-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart key={i} size={24} className={i < p2Lives ? 'text-red-500 fill-red-500' : 'text-slate-600'} />
            ))}
          </div>
        </div>
      </div>

      {/* Arena de enfrentamiento */}
      <div id="rps-duel-arena" className="flex justify-center items-center gap-8 mb-6 py-4 bg-slate-900/60 rounded-xl border border-slate-800/80">
        <div className="text-center min-w-[100px]">
          <AnimatePresence mode="wait">
            {state.player1Choice && isRevealing ? (
              <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} className="text-6xl mb-2">
                {getChoiceIcon(state.player1Choice)}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <p className="text-white text-sm font-medium">
            {state.player1Choice && isRevealing ? p1Name : p1HasChosen ? '✓ Eligió' : 'Esperando...'}
          </p>
        </div>
        <div className="text-4xl text-amber-400 font-black">VS</div>
        <div className="text-center min-w-[100px]">
          <AnimatePresence mode="wait">
            {state.player2Choice && isRevealing ? (
              <motion.div initial={{ scale: 0, rotate: 180 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} className="text-6xl mb-2">
                {getChoiceIcon(state.player2Choice)}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <p className="text-white text-sm font-medium">
            {state.player2Choice && isRevealing ? p2Name : p2HasChosen ? '✓ Eligió' : 'Esperando...'}
          </p>
        </div>
      </div>

      {/* Resultado de la ronda */}
      <AnimatePresence>
        {showResult && state.roundWinner && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className={`text-center p-4 rounded-xl mb-6 ${getResultMessage()?.bg}`}>
            <p className={`text-xl font-black ${getResultMessage()?.color}`}>{getResultMessage()?.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botones de selección y estado */}
      {isSelecting && !isGameOver && (
        <>
          {/* Temporizador de Ronda Autoritativo */}
          {timeLeft !== null && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <div
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border font-mono text-xs font-bold ${
                  timeLeft <= 5
                    ? 'bg-red-950 border-red-600 text-red-400 animate-pulse'
                    : 'bg-neutral-900 border-neutral-800 text-amber-400'
                }`}
              >
                {timeLeft <= 5 ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5" />
                )}
                <span>
                  {timeLeft === 0
                    ? 'TIEMPO AGOTADO'
                    : `00:${String(timeLeft).padStart(2, '0')}`}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-4 mb-4">
            {(['rock', 'paper', 'scissors'] as const).map((choice) => (
              <button
                key={choice}
                id={`rps-choice-btn-${choice}`}
                onClick={() => handleChoice(choice as RPSChoice)}
                disabled={hasChosenThisRound || isGameOver}
                data-testid={`rps-${choice}`}
                className={`flex-1 px-4 py-4 rounded-xl font-bold text-lg transition-all ${
                  !hasChosenThisRound && !isGameOver
                    ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg hover:scale-105 active:scale-95 cursor-pointer' 
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
                }`}
              >
                {choice === 'rock' ? '🪨 Piedra' : choice === 'paper' ? '📄 Papel' : '✂️ Tijera'}
              </button>
            ))}
          </div>

          {/* Indicador de estado CORREGIDO y blindado */}
          <div className="text-center mt-4">
            {hasChosenThisRound ? (
              <div className="flex items-center justify-center gap-2 text-cyan-400 font-bold animate-pulse">
                <Loader size={18} className="animate-spin" />
                <span>✓ Tu jugada registrada. Esperando al rival...</span>
              </div>
            ) : (
              <span className="text-emerald-400 font-bold text-lg">
                🎯 ¡Es tu turno! Elige tu jugada
              </span>
            )}
          </div>
        </>
      )}

      {/* Victoria final */}
      {(state.status === 'MATCH_ENDED' || state.phase === 'match_ended' || isGameOver) && (
        <div id="rps-game-over-screen" data-testid="rps-victory-banner" className="text-center p-6 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl border-2 border-amber-500">
          <Trophy size={48} className="text-amber-400 mx-auto mb-4" />
          <p className="text-2xl font-black text-amber-400 mb-2">🏆 ¡VICTORIA!</p>
          <p className="text-white font-medium">
            {state.matchWinner === 'PLAYER1' || state.winnerUserId === state.player1Id
              ? `${p1Name} gana el match`
              : `${p2Name} gana el match`}
          </p>
        </div>
      )}
    </div>
  );
};

export default RockPaperScissorsBoard;
