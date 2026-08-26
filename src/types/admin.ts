// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: ADMINISTRACIÓN Y ROLES
// ==============================================================================

export type UserRole = 'PLAYER' | 'OPERATOR' | 'ADMIN' | 'SUPER_ADMIN';

export type AdminTabId =
  | 'dashboard'
  | 'users'
  | 'deposits'
  | 'withdrawals'
  | 'wallets'
  | 'tables'
  | 'matches'
  | 'games'
  | 'support'
  | 'notifications'
  | 'audit'
  | 'settings'
  | 'security'
  | 'reports';

export interface SystemSettings {
  serviceFeePercent: number; // Por defecto 10
  winnerPercent: number;     // Por defecto 90
  minimumAge: number;        // Por defecto 18
  minDepositAmount: number;
  maxDepositAmount: number;
  minWithdrawalAmount: number;
  maxWithdrawalAmount: number;
  maintenanceMode: boolean;
  mfaRequiredForWithdrawal: boolean;
  kycRequiredForRealMoney: boolean;
}

export interface AdminDashboardMetrics {
  registeredUsersCount: number;
  activeUsersCount: number;
  connectedUsersCount: number;
  activeTablesCount: number;
  activeMatchesCount: number;
  finishedMatchesCount: number;
  pendingDepositsCount: number;
  pendingWithdrawalsCount: number;
  pendingTicketsCount: number;
  totalVolumePlayed: number;
  totalPrizesAwarded: number;
  totalServiceFeesCollected: number;
  securityAlertsCount: number;
}

export interface AdminUserItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneMasked?: string;
  cedulaMasked?: string;
  state?: string;
  role: UserRole;
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  availableBalance: number;
  heldBalance: number;
  totalBalance: number;
  gamesPlayed?: number;
  gamesWon?: number;
  createdAt: string;
  updatedAt?: string;
  isTwoFactorEnabled?: boolean;
}

export interface AdminDepositItem {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  amount: number;
  currency: string;
  originBankCode: string;
  originPhone: string;
  referenceNumber: string;
  paymentDate: string;
  receiptUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface AdminWithdrawalItem {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'IN_REVIEW' | 'COMPLETED' | 'REJECTED';
  bankCode?: string;
  bankName?: string;
  phoneNumber?: string;
  idDocument?: string;
  accountHolderName?: string;
  bankReference?: string;
  rejectionReason?: string;
  processedBy?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AdminWalletItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  currency: string;
  availableBalance: number;
  heldBalance: number;
  totalBalance: number;
  lastMovementAt?: string;
}

export interface AdminLedgerEntryItem {
  id: string;
  walletId: string;
  userId: string;
  entryType: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  balanceAfterAvailable: number;
  balanceAfterHeld: number;
  referenceTable: string;
  referenceId: string;
  description: string;
  createdAt: string;
}

export interface AdminTableItem {
  id: string;
  gameId: string;
  gameName: string;
  trackingCode: string;
  status: 'WAITING_PLAYERS' | 'FULL' | 'IN_GAME' | 'FINISHED' | 'CANCELLED';
  entryFee: number;
  currentPot: number;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  creatorId: string;
  creatorName?: string;
  createdAt: string;
  playersList?: Array<{
    userId: string;
    seatNumber: number;
    userName: string;
    isReady: boolean;
  }>;
}

export interface AdminMatchItem {
  id: string;
  tableId: string;
  gameId: string;
  gameName: string;
  status: 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED' | 'REFUNDED';
  totalPot: number;
  serviceFee: number;
  winnerPayout: number;
  winnerUserId?: string;
  winnerName?: string;
  playersCount: number;
  startedAt: string;
  endedAt?: string;
}

export interface AdminGameItem {
  id: string;
  name: string;
  shortDescription: string;
  minPlayers: number;
  maxPlayers: number;
  minEntryFee: number;
  maxEntryFee: number;
  activeTables: number;
  activePlayers: number;
  totalMatchesPlayed: number;
  totalVolume: number;
  isActive: boolean;
}

export interface AdminSupportTicketItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  category: 'PAYMENTS' | 'GAMES' | 'ACCOUNT' | 'RULES' | 'OTHER';
  subject: string;
  description: string;
  relatedTableId?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';
  assignedOperatorId?: string;
  assignedOperatorName?: string;
  createdAt: string;
  updatedAt: string;
  responses?: Array<{
    id: string;
    authorName: string;
    authorRole: UserRole;
    message: string;
    createdAt: string;
  }>;
}

export interface AdminNotificationItem {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TICKET' | 'SECURITY' | 'INCIDENT' | 'SYSTEM';
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  isRead: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

export interface AdminAuditLogItem {
  id: string;
  actorId?: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'SECURITY_ALERT';
  ipAddress?: string;
  metadata: Record<string, any>;
  createdAt: string;
}

