// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: MESAS DE JUEGO
// ==============================================================================

import type { CurrencyCode } from './wallet';
import type { GameType, GameMode } from './games';

export type TableStatus =
  | 'OPEN'
  | 'FULL'
  | 'IN_GAME'
  | 'CLOSED'
  | 'CANCELLED'
  | 'waiting'
  | 'ready'
  | 'active'
  | 'finished';

export type PlayerSeatStatus = 'WAITING' | 'READY' | 'PLAYING' | 'LEFT' | 'DISCONNECTED';

export interface GameTable {
  id: string;
  gameType: GameType;
  name?: string;
  mode: GameMode;
  entryFee: number;
  currency: CurrencyCode;
  minPlayers?: number;
  maxPlayers: number;
  currentPlayersCount: number;
  status: TableStatus;
  hostUserId: string;
  isPrivate: boolean; // Trancaíto = true
  joinCode: string;   // Token público alfanumérico (ej. TRK-9842)
  shareToken: string; // Token público para enlaces compartibles
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  config: Record<string, unknown>;
}

export interface TablePlayer {
  id?: string;
  tableId: string;
  userId: string;
  seatNumber: number;
  seatIndex?: number;
  teamIndex?: number;
  status?: PlayerSeatStatus;
  isReady?: boolean;
  isOnline?: boolean;
  joinedAt: string;
  displayName: string;
  avatarUrl?: string;
}

export interface CreateTablePayload {
  gameType: GameType;
  name?: string;
  mode: GameMode;
  entryFee: number;
  maxPlayers: number;
  isPrivate: boolean;
  config?: Record<string, unknown>;
}

export interface JoinTableResult {
  success: boolean;
  tablePlayerId?: string;
  seatNumber?: number;
  message?: string;
  error?: string;
}
