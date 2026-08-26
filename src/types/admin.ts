// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: ADMINISTRACIÓN Y ROLES
// ==============================================================================

export type UserRole = 'PLAYER' | 'OPERATOR' | 'ADMIN' | 'SUPER_ADMIN';

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
  pendingDepositsCount: number;
  pendingWithdrawalsCount: number;
  totalVolumePlayed: number;
  totalPrizesAwarded: number;
  totalServiceFeesCollected: number;
  securityAlertsCount: number;
}
