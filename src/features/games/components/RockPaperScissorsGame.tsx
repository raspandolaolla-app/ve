import React from 'react';
import RockPaperScissorsBoard from './RockPaperScissorsBoard';
import type { RPSChoice, RPSState } from '../engines/RockPaperScissorsEngine';

interface RockPaperScissorsGameProps {
  state: RPSState;
  currentUserId: string;
  hasPlayerChosen: boolean;
  onSubmitChoice: (choice: RPSChoice) => void;
  onNextRound: () => void;
}

const RockPaperScissorsGame: React.FC<RockPaperScissorsGameProps> = ({
  state,
  currentUserId,
  hasPlayerChosen,
  onSubmitChoice,
  onNextRound,
}) => {
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
