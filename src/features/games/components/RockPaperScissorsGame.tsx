import React from 'react';
import RockPaperScissorsBoard from './RockPaperScissorsBoard';
import type { RPSChoice, RPSState } from '../engines/RockPaperScissorsEngine';

export interface RockPaperScissorsGameProps {
  state?: RPSState;
  currentUserId?: string;
  hasPlayerChosen?: boolean;
  onSubmitChoice?: (choice: RPSChoice) => void;
  onNextRound?: () => void;
  isMyTurn?: boolean;
  turnTimeLeft?: number;
  onTurnTimeout?: () => void;
  table?: any;
  players?: any[];
  turnExpiresAt?: string;
  onLeave?: () => void;
}

export const RockPaperScissorsGame: React.FC<RockPaperScissorsGameProps> = ({
  state,
  currentUserId = '',
  hasPlayerChosen = false,
  onSubmitChoice = () => {},
  onNextRound = () => {},
}) => {
  if (!state) {
    return null;
  }

  return (
    <RockPaperScissorsBoard
      state={state}
      currentUserId={currentUserId}
      hasPlayerChosen={hasPlayerChosen}
      onSubmitChoice={onSubmitChoice}
      onNextRound={onNextRound}
    />
  );
};

export default RockPaperScissorsGame;
