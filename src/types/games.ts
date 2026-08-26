// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: JUEGOS Y REGLAS
// ==============================================================================

export type GameType =
  | 'tic_tac_toe'      // 3 en Raya
  | 'rock_paper_scissors' // Piedra, Papel o Tijera
  | 'checkers'         // Damas
  | 'domino_venezolano'// Dominó Venezolano
  | 'truco_venezolano' // Truco Venezolano
  | 'bingo'            // Bingo Online
  | 'polla_venezolana' // Polla Venezolana
  | 'atrapaito';       // Atrapaíto

export type GameMode = '1v1' | '2v2' | '1v3' | '1v4' | 'mass_participation';

export interface GameMetadata {
  id: GameType;
  name: string;
  shortDescription: string;
  minPlayers: number;
  maxPlayers: number;
  allowedModes: GameMode[];
  minEntryFee: number;
  maxEntryFee: number;
  isActive: boolean;
  requiresCommitReveal?: boolean;
}

export interface GameSession {
  id: string;
  tableId: string;
  gameType: GameType;
  roundNumber: number;
  currentTurnUserId?: string;
  turnExpiresAt?: string;
  status: 'initializing' | 'in_progress' | 'settling' | 'completed' | 'abandoned';
  grossPool: number;
  winnerPrizeAmount: number; // 90% del pozo bruto
  serviceFeeAmount: number;   // 10% del pozo bruto
  winnerUserId?: string;
  winnerTeamIndex?: number;
  isSettled: boolean;
  settledAt?: string;
}

export interface GameActionPayload {
  sessionId: string;
  actionType: string;
  actionData: Record<string, unknown>;
  clientTimestamp: number;
}
