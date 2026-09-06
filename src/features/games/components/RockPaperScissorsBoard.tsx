import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Trophy, Loader } from 'lucide-react';
import type { RPSChoice, RPSState } from '../engines/RockPaperScissorsEngine';

interface RockPaperScissorsBoardProps {
  state: RPSState;
  currentUserId: string;
  hasPlayerChosen: boolean;
  onSubmitChoice: (choice: RPSChoice) => void;
  onNextRound: () => void;
}

const RockPaperScissorsBoard: React.FC<RockPaperScissorsBoardProps> = ({
  state,
  currentUserId,
  hasPlayerChosen,
  onSubmitChoice,
  onNextRound,
}) => {
  const [showResult, setShowResult] = useState(false);

  // Auto-avanzar a la siguiente ronda después de mostrar el resultado
  useEffect(() => {
    if (state.status === 'ROUND_REVEAL' && state.roundWinner) {
      setShowResult(true);
      const timer = setTimeout(() => {
        setShowResult(false);
        onNextRound();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [state.status, state.roundWinner, onNextRound]);

  const handleChoice = (choice: RPSChoice) => {
    // Guard estricto: Solo permitir elegir en fase de commit y si no ha elegido aún
    if (state.status !== 'ROUND_COMMIT') {
      console.warn('[RPS] No es el momento de elegir');
      return;
    }
    if (hasPlayerChosen) {
      console.warn('[RPS] Ya elegiste, esperando al oponente');
      return;
    }
    if (state.status === 'MATCH_ENDED') {
      console.warn('[RPS] La partida ya terminó');
      return;
    }
    
    onSubmitChoice(choice);
  };

  const getResultMessage = () => {
    if (!state.roundWinner) return null;
    
    if (state.roundWinner === 'DRAW') {
      return { text: '🤝 ¡EMPATE! (Nadie pierde vida)', color: 'text-amber-400', bg: 'bg-amber-500/20' };
    }
    
    const isPlayer1 = currentUserId === state.player1Id;
    const isWinner = (state.roundWinner === 'PLAYER1' && isPlayer1) || (state.roundWinner === 'PLAYER2' && !isPlayer1);
    
    return isWinner
      ? { text: '🎉 ¡GANASTE! (-1 Vida al rival)', color: 'text-emerald-400', bg: 'bg-emerald-500/20' }
      : { text: '💀 PERDISTE (-1 Vida)', color: 'text-red-400', bg: 'bg-red-500/20' };
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden bg-gradient-to-br from-[#0F1523] to-[#1A2235] rounded-2xl p-6 border border-slate-800">
      {/* Vidas de los jugadores */}
      <div className="flex justify-between items-center mb-6">
        <div className="text-center">
          <p className="text-white text-sm font-bold mb-2">Jugador 1</p>
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart key={i} size={24} className={i < state.player1Lives ? 'text-red-500 fill-red-500' : 'text-slate-600'} />
            ))}
          </div>
        </div>
        <div className="text-center">
          <p className="text-amber-400 text-xl font-black">RONDA {state.roundNumber}</p>
          <p className="text-slate-400 text-xs">Mejor de 3</p>
        </div>
        <div className="text-center">
          <p className="text-white text-sm font-bold mb-2">Jugador 2</p>
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart key={i} size={24} className={i < state.player2Lives ? 'text-red-500 fill-red-500' : 'text-slate-600'} />
            ))}
          </div>
        </div>
      </div>

      {/* Arena de enfrentamiento */}
      <div className="flex justify-center items-center gap-8 mb-6">
        <div className="text-center">
          <AnimatePresence>
            {state.player1Choice && state.status === 'ROUND_REVEAL' && (
              <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} className="text-6xl mb-2">
                {state.player1Choice === 'rock' ? '🪨' : state.player1Choice === 'paper' ? '📄' : '✂️'}
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-white text-sm">
            {state.player1Choice && state.status === 'ROUND_REVEAL' ? 'Jugador 1' : state.status === 'ROUND_COMMIT' && state.player1Choice ? '✓ Eligió' : 'Esperando...'}
          </p>
        </div>
        <div className="text-4xl text-amber-400 font-black">VS</div>
        <div className="text-center">
          <AnimatePresence>
            {state.player2Choice && state.status === 'ROUND_REVEAL' && (
              <motion.div initial={{ scale: 0, rotate: 180 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} className="text-6xl mb-2">
                {state.player2Choice === 'rock' ? '🪨' : state.player2Choice === 'paper' ? '📄' : '✂️'}
              </motion.div>
            )}
          </AnimatePresence>
          <p className="text-white text-sm">
            {state.player2Choice && state.status === 'ROUND_REVEAL' ? 'Jugador 2' : state.status === 'ROUND_COMMIT' && state.player2Choice ? '✓ Eligió' : 'Esperando...'}
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
      {state.status === 'ROUND_COMMIT' && (
        <>
          <div className="flex gap-4 mb-4">
            {(['rock', 'paper', 'scissors'] as RPSChoice[]).map((choice) => (
              <button
                key={choice}
                onClick={() => handleChoice(choice)}
                disabled={hasPlayerChosen}
                data-testid={`rps-${choice}`}
                className={`flex-1 px-4 py-4 rounded-xl font-bold text-lg transition-all ${
                  !hasPlayerChosen 
                    ? 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg hover:scale-105 active:scale-95' 
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-50'
                }`}
              >
                {choice === 'rock' ? '🪨 Piedra' : choice === 'paper' ? '📄 Papel' : '✂️ Tijera'}
              </button>
            ))}
          </div>

          {/* Indicador de estado CORREGIDO y blindado */}
          <div className="text-center mt-4">
            {hasPlayerChosen ? (
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
      {state.status === 'MATCH_ENDED' && (
        <div className="text-center p-6 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl border-2 border-amber-500">
          <Trophy size={48} className="text-amber-400 mx-auto mb-4" />
          <p className="text-2xl font-black text-amber-400 mb-2">🏆 ¡VICTORIA!</p>
          <p className="text-white">
            {state.matchWinner === state.player1Id ? 'Jugador 1 gana el match' : 'Jugador 2 gana el match'}
          </p>
        </div>
      )}
    </div>
  );
};

export default RockPaperScissorsBoard;
