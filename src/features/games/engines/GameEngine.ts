// ==============================================================================
// RASPANDO LA OLLA — CONTRATO BASE DE MOTORES DE JUEGO
// ==============================================================================
// Arquitectura desacoplada, pura y determinista para los 8 juegos tradicionales.
// ==============================================================================

import type { GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

export interface ActionResult<TState> {
  newState: TState;
  isValid: boolean;
  errorMessage?: string;
  isGameOver: boolean;
  winnerUserId: string | null;
  winnerTeamIndex: number | null;
  isDraw: boolean;
}

export interface IGameEngine<TState> {
  readonly gameType: string;
  initialize(table: GameTable, players: TablePlayer[]): TState;
  validateAction(state: TState, action: GameActionPayload): { valid: boolean; reason?: string };
  applyAction(state: TState, action: GameActionPayload): ActionResult<TState>;
  getSanitizedStateForPlayer(state: TState, userId: string): TState;
  getBotMove?(state: TState, userId: string): GameActionPayload | null;
}
