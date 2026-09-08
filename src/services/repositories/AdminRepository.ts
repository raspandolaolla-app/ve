// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE ADMINISTRACIÓN (FACADE PATTERN / RBAC PROTEGIDO)
// ==============================================================================
// Arquitectura modular: Este repositorio actúa como Facade centralizado delegando
// directamente a los repositorios modulares especializados en ./admin/.
// Proporciona 100% de compatibilidad hacia atrás para todo el ecosistema de la WebApp.
// ==============================================================================

import {
  AdminDashboardRepository,
  AdminUsersRepository,
  AdminFinancialRepository,
  AdminAuditRepository,
  AdminTablesRepository,
  AdminKYCRepository,
  AdminGameConfigRepository,
  AdminSupportRepository,
} from './admin';

// Re-exportar repositorios especializados para consumo directo
export * from './admin';

// Re-exportar tipos administrativos
export type * from '../../types/admin';

/**
 * AdminRepository (Facade)
 * Consolida el acceso a todas las operaciones administrativas divididas por dominio.
 */
export class AdminRepository {
  // ============================================================================
  // DOMINIO 1: GESTIÓN DE USUARIOS Y ROLES (RBAC)
  // ============================================================================
  public static getUserRole = AdminUsersRepository.getUserRole;
  public static isAuthorizedSuperAdmin = AdminUsersRepository.isAuthorizedSuperAdmin;
  public static getUsersList = AdminUsersRepository.getUsersList;
  public static getUsers = AdminUsersRepository.getUsers;
  public static getUserById = AdminUsersRepository.getUserById;
  public static getProtectedAdminsStatus = AdminUsersRepository.getProtectedAdminsStatus;
  public static initiatePeerRecovery = AdminUsersRepository.initiatePeerRecovery;
  public static updateUserAccountStatus = AdminUsersRepository.updateUserAccountStatus;
  public static updateUserRole = AdminUsersRepository.updateUserRole;
  public static recordHeartbeat = AdminUsersRepository.recordHeartbeat;
  public static endUserSession = AdminUsersRepository.endUserSession;
  public static getActivitySessions = AdminUsersRepository.getActivitySessions;

  // ============================================================================
  // DOMINIO 2: AUDITORÍA Y AJUSTES DEL SISTEMA
  // ============================================================================
  public static recordAdminAudit = AdminAuditRepository.recordAdminAudit;
  public static getAuditLogs = AdminAuditRepository.getAuditLogs;
  public static getSystemSettings = AdminAuditRepository.getSystemSettings;
  public static updateSystemSetting = AdminAuditRepository.updateSystemSetting;
  public static runMaintenanceDryRun = AdminAuditRepository.runMaintenanceDryRun;
  public static executeMaintenanceCleanup = AdminAuditRepository.executeMaintenanceCleanup;
  public static adminPurgeTestData = AdminAuditRepository.adminPurgeTestData;

  // ============================================================================
  // DOMINIO 3: MÉTRICAS Y DASHBOARD GENERAL
  // ============================================================================
  public static getMetrics = AdminDashboardRepository.getMetrics;
  public static getDashboardMetrics = AdminDashboardRepository.getDashboardMetrics;
  public static getAdminDashboardMetrics = AdminDashboardRepository.getAdminDashboardMetrics;
  public static getPlatformStatistics = AdminDashboardRepository.getPlatformStatistics;
  public static getDailyReport = AdminDashboardRepository.getDailyReport;
  public static getRevenueMetrics = AdminDashboardRepository.getRevenueMetrics;
  public static getMatchesList = AdminDashboardRepository.getMatchesList;
  public static getGamesOverview = AdminDashboardRepository.getGamesOverview;
  public static getServerTime = AdminDashboardRepository.getServerTime;

  // ============================================================================
  // DOMINIO 4: OPERACIONES FINANCIERAS Y BILLETERAS
  // ============================================================================
  public static getDepositsList = AdminFinancialRepository.getDepositsList;
  public static approveDeposit = AdminFinancialRepository.approveDeposit;
  public static rejectDeposit = AdminFinancialRepository.rejectDeposit;
  public static getWithdrawalsList = AdminFinancialRepository.getWithdrawalsList;
  public static processWithdrawal = AdminFinancialRepository.processWithdrawal;
  public static rejectWithdrawal = AdminFinancialRepository.rejectWithdrawal;
  public static getWalletsList = AdminFinancialRepository.getWalletsList;
  public static getUserLedger = AdminFinancialRepository.getUserLedger;
  public static getAccountingOverview = AdminFinancialRepository.getAccountingOverview;
  public static getFinancialMetrics = AdminFinancialRepository.getFinancialMetrics;
  public static getLedgerEntries = AdminFinancialRepository.getLedgerEntries;

  // ============================================================================
  // DOMINIO 5: GESTIÓN DE MESAS Y CICLO DE VIDA DE PARTIDAS
  // ============================================================================
  public static getTablesList = AdminTablesRepository.getTablesList;
  public static getAllTables = AdminTablesRepository.getAllTables;
  public static cancelTable = AdminTablesRepository.cancelTable;
  public static terminateTable = AdminTablesRepository.terminateTable;
  public static disconnectPlayer = AdminTablesRepository.disconnectPlayer;
  public static cleanupTable = AdminTablesRepository.cleanupTable;
  public static cleanupAllInvalidTables = AdminTablesRepository.cleanupAllInvalidTables;
  public static cleanupAllEmptyTables = AdminTablesRepository.cleanupAllEmptyTables;
  public static autoCleanExpiredTables = AdminTablesRepository.autoCleanExpiredTables;
  public static cleanupFinishedBingoTables = AdminTablesRepository.cleanupFinishedBingoTables;

  // ============================================================================
  // DOMINIO 6: VERIFICACIONES KYC Y ARCHIVOS SEGUROS
  // ============================================================================
  public static getKYCVerificationsList = AdminKYCRepository.getKYCVerificationsList;
  public static processKYCVerification = AdminKYCRepository.processKYCVerification;
  public static getStorageSignedUrl = AdminKYCRepository.getStorageSignedUrl;

  // ============================================================================
  // DOMINIO 7: CONFIGURACIÓN DE JUEGOS Y ANUNCIOS
  // ============================================================================
  public static getEntryFeesList = AdminGameConfigRepository.getEntryFeesList;
  public static saveEntryFee = AdminGameConfigRepository.saveEntryFee;
  public static deleteEntryFee = AdminGameConfigRepository.deleteEntryFee;
  public static getGameConfigsList = AdminGameConfigRepository.getGameConfigsList;
  public static saveGameConfig = AdminGameConfigRepository.saveGameConfig;
  public static getGameManualsList = AdminGameConfigRepository.getGameManualsList;
  public static saveGameManual = AdminGameConfigRepository.saveGameManual;
  public static getAnnouncementsList = AdminGameConfigRepository.getAnnouncementsList;
  public static saveAnnouncement = AdminGameConfigRepository.saveAnnouncement;
  public static deleteAnnouncement = AdminGameConfigRepository.deleteAnnouncement;

  // ============================================================================
  // DOMINIO 8: SOPORTE Y NOTIFICACIONES ADMINISTRATIVAS
  // ============================================================================
  public static getSupportTickets = AdminSupportRepository.getSupportTickets;
  public static updateTicketStatus = AdminSupportRepository.updateTicketStatus;
  public static getAdminNotifications = AdminSupportRepository.getAdminNotifications;
  public static markNotificationAsRead = AdminSupportRepository.markNotificationAsRead;
}
