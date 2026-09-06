// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: BILLETERA Y LEDGER
// ==============================================================================

export type CurrencyCode = 'VES'; // Bolívares Venezolanos (Bs.)

export type LedgerEntryType =
  | 'DEPOSIT_CREDIT'
  | 'WITHDRAWAL_HOLD'
  | 'WITHDRAWAL_CAPTURE'
  | 'WITHDRAWAL_RELEASE'
  | 'GAME_ENTRY_HOLD'
  | 'GAME_ENTRY_CAPTURE'
  | 'GAME_ENTRY_RELEASE'
  | 'PRIZE_CREDIT'
  | 'PLATFORM_FEE'
  | 'ADMIN_ADJUSTMENT'
  | 'deposit'
  | 'withdrawal'
  | 'game_entry'
  | 'game_prize'
  | 'service_fee'
  | 'refund';

export type LedgerDirection = 'CREDIT' | 'DEBIT' | 'HOLD' | 'RELEASE';

export type TransactionStatus =
  | 'pending'
  | 'under_review'
  | 'reserved'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'failed';

export interface WalletBalance {
  userId: string;
  currency: CurrencyCode;
  availableBalance: number; // Saldo disponible para jugar o retirar
  heldBalance: number;      // Saldo retenido en partidas activas o retiros en proceso
  totalBalance: number;     // availableBalance + heldBalance
  isLocked?: boolean;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  amount: number;
  currency: CurrencyCode;
  type: LedgerEntryType;
  direction?: LedgerDirection;
  status: TransactionStatus;
  reference: string;
  idempotencyKey?: string;
  balanceAfterAvailable?: number;
  balanceAfterHeld?: number;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
}

export interface LedgerEntry {
  id: string;
  walletId?: string;
  userId: string;
  entryType: LedgerEntryType;
  direction: LedgerDirection;
  amount: number;
  balanceAfterAvailable: number;
  balanceAfterHeld: number;
  referenceTable?: string;
  referenceId?: string;
  idempotencyKey: string;
  description: string;
  actorId?: string;
  createdAt: string;
}

export interface WithdrawalRequestResult {
  success: boolean;
  withdrawalId?: string;
  heldAmount?: number;
  remainingAvailable?: number;
  message?: string;
  error?: string;
}
