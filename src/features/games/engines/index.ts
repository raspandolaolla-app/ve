// ==============================================================================
// RASPANDO LA OLLA — REGISTRO CENTRAL DE MOTORES DE JUEGO
// ==============================================================================

import type { GameType } from '../../../types/games';
import type { IGameEngine } from './GameEngine';
import { TicTacToeEngine } from './TicTacToeEngine';
import { RockPaperScissorsEngine } from './RockPaperScissorsEngine';
import { CheckersEngine } from './CheckersEngine';
import { DominoEngine } from './DominoEngine';
import { TrucoEngine } from './TrucoEngine';
import { BingoEngine } from './BingoEngine';
import { PollaEngine } from './PollaEngine';
import { AtrapaitoEngine } from './AtrapaitoEngine';

export * from './GameEngine';
export * from './TicTacToeEngine';
export * from './RockPaperScissorsEngine';
export * from './CheckersEngine';
export * from './DominoEngine';
export * from './TrucoEngine';
export * from './BingoEngine';
export * from './PollaEngine';
export * from './AtrapaitoEngine';

export function getGameEngine(gameType: GameType): IGameEngine<any> {
  switch (gameType) {
    case 'tic_tac_toe':
      return new TicTacToeEngine();
    case 'rock_paper_scissors':
      return new RockPaperScissorsEngine();
    case 'checkers':
      return new CheckersEngine();
    case 'domino_venezolano':
      return new DominoEngine();
    case 'truco_venezolano':
      return new TrucoEngine();
    case 'bingo':
      return new BingoEngine();
    case 'polla_venezolana':
      return new PollaEngine();
    case 'atrapaito':
      return new AtrapaitoEngine();
    default:
      throw new Error(`Motor de juego no soportado: ${gameType}`);
  }
}
