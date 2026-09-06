import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Trophy, Loader } from 'lucide-react';
import type { RPSChoice, RPSState } from '../engines/RockPaperScissorsEngine';

export interface RockPaperScissorsBoardProps {
  state: RPSState;
  currentUserId?: string;
  isMyTurn?: boolean;
  hasPlayerChosen?: boolean;
  turnExpiresAt?: string;
  sessionId?: string;
  turnTimeLeft?: number;
  onAction?: (actionType: string, data: any) => void;
  onSubmitChoice?: (choice: RPSChoice) => void;
  onNextRound?: () => void;
  onTurnTimeout?: () => void;
  onTimeout?: () => void;
}

export const RockPaperScissorsBoard: React.FC<RockPaperScissorsBoardProps> = ({
  state,
  currentUserId,
  isMyTurn = true,
  hasPlayerChosen = false,
  turnTimeLeft = 0,
  onAction,
  onSubmitChoice,
  onNextRound,
}) => {
  const [showResult, setShowResult] = useState(false);

  // Auto-avanzar a la siguiente ronda después de mostrar el resultado
  useEffect(() => {
    if ((state.status === 'ROUND_REVEAL' || state.phase === 'round_result') && state.roundWinner) {
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
  }, [state.status, state.phase, state.roundWinner, onNextRound, onAction]);

  const handleChoice = (choice: RPSChoice) => {
    // ✅ VALIDACIÓN: Solo permitir elegir si la partida no ha terminado
    if (state.status === 'MATCH_ENDED' || state.phase === 'match_ended') {
      console.warn('[RPS] La partida ya terminó');
      return;
    }
    
    // ✅ VALIDACIÓN: No permitir elegir si ya eligió
    if (hasPlayerChosen) {
      console.warn('[RPS] Ya elegiste, esperando al oponente');
      return;
    }
    
    // ✅ VALIDACIÓN: Solo permitir elegir en fase de commit/selección
    if (state.status !== 'ROUND_COMMIT' && state.phase !== 'selecting') {
      console.warn('[RPS] No es el momento de elegir');
      return;
    }
    
    if (onSubmitChoice) {
      onSubmitChoice(choice);
    } else if (onAction) {
      onAction('CHOOSE', { choice });
    }
  };

  const isPlayer1 = currentUserId 
    ? currentUserId === state.player1Id 
    : state.player1Id === state.currentTurnUserId;

  const getResultMessage = () => {
    if (!state.roundWinner) return null;
    
    if (state.roundWinner === 'DRAW') {
      return {
        text: '🤝 ¡EMPATE! (Nadie pierde vida)',
        color: 'text-amber-400',
        bg: 'bg-amber-500/20',
      };
    }
    
    // Determinar si el jugador actual ganó o perdió
    const isWinner = 
      (state.roundWinner === 'PLAYER1' && isPlayer1) ||
      (state.roundWinner === 'PLAYER2' && !isPlayer1);
    
    return isWinner
      ? {
          text: '🎉 ¡GANASTE! (-1 Vida al rival)',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/20',
        }
      : {
          text: '💀 PERDISTE (-1 Vida)',
          color: 'text-red-400',
          bg: 'bg-red-500/20',
        };
  };

  const p1Name = state.playerNames?.[state.player1Id] || 'Jugador 1';
  const p2Name = (state.player2Id && state.playerNames?.[state.player2Id]) || 'Jugador 2';

  const p1Lives = state.player1Lives ?? (state.lives && state.player1Id ? state.lives[state.player1Id] : 3) ?? 3;
  const p2Lives = state.player2Lives ?? (state.lives && state.player2Id ? state.lives[state.player2Id] : 3) ?? 3;

  const p1Chosen = Boolean(state.player1Choice || state.playerChoices?.[state.player1Id]?.committed);
  const p2Chosen = Boolean(state.player2Choice || (state.player2Id && state.playerChoices?.[state.player2Id]?.committed));

  const getChoiceIcon = (choice: string | null | undefined) => {
    if (!choice) return null;
    const c = choice.toLowerCase();
    if (c === 'rock') return '🪨';
    if (c === 'paper') return '📄';
    if (c === 'scissors') return '✂️';
    return null;
  };

  const isRevealing = state.status === 'ROUND_REVEAL' || state.phase === 'round_result';
  const isGameOver = state.status === 'MATCH_ENDED' || state.phase === 'match_ended' || Boolean(state.matchWinner);

  // ✅ ELIMINADO: TurnTimer no se usa en RPS (juego simultáneo)
  // Los jugadores eligen libremente sin presión de tiempo

  return (
    <div id="rps-board-container" className="w-full max-w-full overflow-x-hidden bg-gradient-to-br from-[#0F1523] to-[#1A2235] rounded-2xl p-6 border border-slate-800">
      {/* Vidas de los jugadores */}
      <div id="rps-lives-display" data-testid="player-lives" className="flex justify-between items-center mb-6">
        <div className="text-center">
          <p className="text-white text-sm font-bold mb-2">{p1Name}</p>
          <div className="flex gap-1 justify-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart
                key={i}
                size={22}
                className={i < p1Lives ? 'text-red-500 fill-red-500' : 'text-slate-600'}
              />
            ))}
          </div>
        </div>
        
        <div className="text-center">
          <p className="text-amber-400 text-xl font-black">RONDA {state.roundNumber || state.round || 1}</p>
          <p className="text-slate-400 text-xs">Mejor de 3 Vidas</p>
        </div>
        
        <div className="text-center">
          <p className="text-white text-sm font-bold mb-2">{p2Name}</p>
          <div className="flex gap-1 justify-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart
                key={i}
                size={22}
                className={i < p2Lives ? 'text-red-500 fill-red-500' : 'text-slate-600'}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Arena de enfrentamiento */}
      <div id="rps-duel-arena" className="flex justify-center items-center gap-8 mb-6 py-4 bg-slate-900/60 rounded-xl border border-slate-800/80">
        <div className="text-center min-w-[100px]">
          <AnimatePresence mode="wait">
            {state.player1Choice && isRevealing ? (
              <motion.div
                key="p1-reveal"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                className="text-6xl mb-2"
              >
                {getChoiceIcon(state.player1Choice)}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <p className="text-white text-sm font-medium">
            {state.player1Choice && isRevealing 
              ? p1Name 
              : p1Chosen
              ? '✓ Eligió'
              : 'Esperando...'}
          </p>
        </div>
        
        <div className="text-4xl text-amber-400 font-black">VS</div>
        
        <div className="text-center min-w-[100px]">
          <AnimatePresence mode="wait">
            {state.player2Choice && isRevealing ? (
              <motion.div
                key="p2-reveal"
                initial={{ scale: 0, rotate: 180 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                className="text-6xl mb-2"
              >
                {getChoiceIcon(state.player2Choice)}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <p className="text-white text-sm font-medium">
            {state.player2Choice && isRevealing 
              ? p2Name 
              : p2Chosen
              ? '✓ Eligió'
              : 'Esperando...'}
          </p>
        </div>
      </div>

      {/* Resultado de la ronda */}
      <AnimatePresence>
        {showResult && state.roundWinner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`text-center p-4 rounded-xl mb-6 ${getResultMessage()?.bg}`}
          >
            <p className={`text-xl font-black ${getResultMessage()?.color}`}>
              {getResultMessage()?.text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botones de selección */}
      {(state.status === 'ROUND_COMMIT' || state.phase === 'selecting') && !isGameOver && (
        <>
          <div className="flex gap-3 mb-4">
            <button
              id="rps-choice-btn-rock"
              onClick={() => handleChoice('ROCK')}
              disabled={hasPlayerChosen || isGameOver}
              data-testid="rps-rock"
              className={`
                flex-1 px-4 py-4 rounded-xl font-bold text-lg transition-all
                ${!hasPlayerChosen && !isGameOver
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg hover:scale-105 active:scale-95 cursor-pointer' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'}
              `}
            >
              🪨 Piedra
            </button>
            <button
              id="rps-choice-btn-paper"
              onClick={() => handleChoice('PAPER')}
              disabled={hasPlayerChosen || isGameOver}
              data-testid="rps-paper"
              className={`
                flex-1 px-4 py-4 rounded-xl font-bold text-lg transition-all
                ${!hasPlayerChosen && !isGameOver
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg hover:scale-105 active:scale-95 cursor-pointer' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'}
              `}
            >
              📄 Papel
            </button>
            <button
              id="rps-choice-btn-scissors"
              onClick={() => handleChoice('SCISSORS')}
              disabled={hasPlayerChosen || isGameOver}
              data-testid="rps-scissors"
              className={`
                flex-1 px-4 py-4 rounded-xl font-bold text-lg transition-all
                ${!hasPlayerChosen && !isGameOver
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg hover:scale-105 active:scale-95 cursor-pointer' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'}
              `}
            >
              ✂️ Tijera
            </button>
          </div>

          {/* Indicador de estado */}
          <div className="text-center py-1">
            {hasPlayerChosen ? (
              <div className="flex items-center justify-center gap-2 text-cyan-400 font-bold">
                <Loader size={16} className="animate-spin" />
                <span>Esperando al rival...</span>
              </div>
            ) : (
              <span className="text-emerald-400 font-bold">
                🎯 Elige tu jugada
              </span>
            )}
          </div>
        </>
      )}

      {/* Victoria final */}
      {isGameOver && (
        <div id="rps-game-over-screen" data-testid="rps-victory-banner" className="text-center p-6 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl border-2 border-amber-500">
          <Trophy size={48} className="text-amber-400 mx-auto mb-4" />
          <p className="text-2xl font-black text-amber-400 mb-2">
            🏆 ¡VICTORIA!
          </p>
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
