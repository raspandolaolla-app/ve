import React from 'react';
import RockPaperScissorsBoard from './RockPaperScissorsBoard';
import type { RPSChoice, RPSState } from '../engines/RockPaperScissorsEngine';

export interface RockPaperScissorsGameProps {
  state?: RPSState;
  isMyTurn?: boolean;
  hasPlayerChosen?: boolean;
  turnTimeLeft?: number; // Se mantiene para compatibilidad pero no se usa
  onSubmitChoice?: (choice: RPSChoice) => void;
  onNextRound?: () => void;
  onTurnTimeout?: () => void; // Se mantiene para compatibilidad pero no se usa
  table?: any;
  players?: any[];
  currentUserId?: string;
  turnExpiresAt?: string;
  onLeave?: () => void;
}

export const RockPaperScissorsGame: React.FC<RockPaperScissorsGameProps> = ({
  state,
  isMyTurn = false,
  hasPlayerChosen = false,
  turnTimeLeft = 0,
  onSubmitChoice = () => {},
  onNextRound = () => {},
  currentUserId,
}) => {
  // ✅ ELIMINADO: Lógica de temporizador
  // RPS es un juego simultáneo (commit-reveal), no requiere temporizador por turno

  if (!state) {
    return null;
  }

  return (
    <RockPaperScissorsBoard
      state={state}
      isMyTurn={isMyTurn}
      hasPlayerChosen={hasPlayerChosen}
      turnTimeLeft={turnTimeLeft}
      currentUserId={currentUserId}
      onSubmitChoice={onSubmitChoice}
      onNextRound={onNextRound}
    />
  );
};

export default RockPaperScissorsGame;
