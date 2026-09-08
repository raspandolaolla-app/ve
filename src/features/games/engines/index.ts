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
import { UnaOllaEngine } from './UnaOllaEngine';
import { ChessEngine } from './ChessEngine';

export * from './GameEngine';
export * from './TicTacToeEngine';
export * from './RockPaperScissorsEngine';
export * from './CheckersEngine';
export * from './DominoEngine';
export * from './TrucoEngine';
export * from './BingoEngine';
export * from './PollaEngine';
export * from './AtrapaitoEngine';
export * from './UnaOllaEngine';
export * from './ChessEngine';

export function getGameEngine(gameType: GameType | string): IGameEngine<any> {
  const clean = (gameType || '').toLowerCase().trim();
  if (clean === 'una_olla' || clean === 'una-olla' || clean === 'una_olla_card_game' || clean === 'olla') {
    return new UnaOllaEngine();
  }

  switch (clean) {
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
    case 'chess':
    case 'ajedrez':
      return new ChessEngine();
    default:
      throw new Error(`Motor de juego no soportado: ${gameType}`);
  }
}
