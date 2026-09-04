// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: ADMINISTRACIÓN Y ROLES
// ==============================================================================

export type UserRole = 'PLAYER' | 'OPERATOR' | 'ADMIN' | 'SUPER_ADMIN';

export type AdminTabId =
  | 'dashboard'
  | 'users'
  | 'polla'
  | 'kyc'
  | 'deposits'
  | 'withdrawals'
  | 'entry-fees'
  | 'wallets'
  | 'accounting'
  | 'tables'
  | 'matches'
  | 'games'
  | 'tournaments'
  | 'manuals'
  | 'activity'
  | 'announcements'
  | 'support'
  | 'notifications'
  | 'audit'
  | 'system-test'
  | 'settings'
  | 'security'
  | 'maintenance'
  | 'reports'
  | 'lobby-content';

export interface EntryFeeItem {
  id: string;
  amount: number;
  gameType?: string | null;
  mode?: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GameConfigItem {
  gameId: string;
  name: string;
  shortDescription: string;
  iconName: string;
  isActive: boolean;
  maintenanceMessage?: string | null;
  minPlayers: number;
  maxPlayers: number;
  allowedModes: string[];
  minEntryFee: number;
  maxEntryFee: number;
  config: Record<string, any>;
  displayOrder: number;
  updatedAt: string;
}

export interface GameManualItem {
  gameId: string;
  title: string;
  objective: string;
  playersInfo: string;
  preparation: string;
  turnRules: string;
  winningRules: string;
  scoringRules: string;
  disconnectionRules: string;
  cancellationRules: string;
  fullContentMarkdown: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface SystemAnnouncementItem {
  id: string;
  title: string;
  content: string;
  type: 'GENERAL' | 'IMPORTANT' | 'MAINTENANCE' | 'PROMOTION' | 'UPDATE' | 'SECURITY' | 'MARQUEE';
  priority: number;
  targetAudience: 'ALL' | 'PLAYERS' | 'OPERATORS' | 'UNVERIFIED';
  isActive: boolean;
  startsAt: string;
  expiresAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KYCVerificationItem {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  documentType: string;
  idNumber?: string;
  fullLegalName?: string;
  documentStoragePath: string;
  documentBackStoragePath?: string;
  selfieStoragePath?: string;
  verificationMethod?: 'DOCUMENT_UPLOAD' | 'WHATSAPP';
  status: 'UNSUBMITTED' | 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_MORE_INFORMATION';
  reviewerId?: string;
  reviewerNotes?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface SystemSettings {
  serviceFeePercent: number; // Por defecto 10
  winnerPercent: number;     // Por defecto 90
  minimumAge: number;        // Por defecto 18
  minDepositAmount: number;
  maxDepositAmount: number;
  minWithdrawalAmount: number;
  maxWithdrawalAmount: number;
  maintenanceMode: boolean;
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
  isOnline?: boolean;
  lastSeenAt?: string;
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
  gameType?: string;
  gameName: string;
  trackingCode: string;
  status: 'WAITING_PLAYERS' | 'FULL' | 'IN_GAME' | 'FINISHED' | 'CANCELLED' | 'PAUSED' | 'CLOSED' | 'TERMINATED' | 'EXPIRED' | 'OPEN';
  entryFee: number;
  currentPot: number;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  creatorId: string;
  creatorName?: string;
  createdAt: string;
  updatedAt?: string;
  lastActivityAt?: string;
  inactivityMinutes?: number;
  gameStarted?: boolean;
  currentTurn?: string | null;
  spectatorsCount?: number;
  playersList?: Array<{
    userId: string;
    seatNumber: number;
    userName: string;
    isReady: boolean;
    isOnline?: boolean;
    lastSeenAt?: string;
    status?: string;
  }>;
  isProblematic?: boolean;
  problemReasons?: string[];
  duplicatePlayers?: string[];
  occupiedSeatsList?: number[];
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

export interface ProtectedAdminStatus {
  email: string;
  protectionStatus: 'PROTECTED';
  description: string;
  registeredInAuth: boolean;
  userId?: string | null;
  accountStatus: string;
  role: UserRole;
  isProtected: boolean;
}

export interface AdminActivityItem {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  startedAt: string;
  lastSeenAt: string;
  endedAt?: string | null;
  status: 'ACTIVE' | 'IDLE' | 'DISCONNECTED' | 'ENDED';
  sessionDurationSeconds: number;
  lastActivityType: string;
  clientPlatform?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingOverview {
  totalAvailableBalance: number;
  totalHeldBalance: number;
  totalWalletFunds: number;
  walletsCount: number;
  approvedDepositsSum: number;
  approvedDepositsCount: number;
  pendingDepositsSum: number;
  pendingDepositsCount: number;
  completedWithdrawalsSum: number;
  completedWithdrawalsCount: number;
  pendingWithdrawalsSum: number;
  pendingWithdrawalsCount: number;
  totalPrizesAwarded: number;
  totalRakeCollected: number;
  settledMatchesCount: number;
  netOperatingMargin: number;
  calculatedAt: string;
}

export interface MaintenanceDryRunResult {
  expiredSessionsCount: number;
  oldNotificationsCount: number;
  oldAuditLogsCount: number;
  totalEligibleRecords: number;
  evaluatedAt: string;
  canProceed: boolean;
}

export interface ServerTimeData {
  serverTimestamp: string;
  timezone: string;
  caracasTimestamp: string;
  caracasFormatted: string;
  epochMs: number;
}


