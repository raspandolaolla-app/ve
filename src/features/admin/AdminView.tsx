// ==============================================================================
// RASPANDO LA OLLA — PANEL ADMINISTRATIVO PROFESIONAL (FASE 23)
// ==============================================================================
// Control exclusivo y centralizado conectado directamente a Supabase:
// - Verificación de identidad y rol en servidor (RLS / RBAC).
// - Super Admins únicos autorizados: v19629049@gmail.com y pulsoplay2026@gmail.com.
// - 14 Módulos Integrados: Dashboard, Usuarios, Recargas, Retiros, Billeteras,
//   Mesas, Partidas, Juegos, Soporte, Notificaciones, Auditoría, Ajustes, Seguridad, Reportes.
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AdminRepository } from '../../services/repositories/AdminRepository';
import { PaymentRepository } from '../../services/repositories/PaymentRepository';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../utils/constants';
import type {
  AdminTabId,
  AdminDashboardMetrics,
  AdminUserItem,
  AdminDepositItem,
  AdminWithdrawalItem,
  AdminWalletItem,
  AdminTableItem,
  AdminMatchItem,
  AdminGameItem,
  AdminSupportTicketItem,
  AdminNotificationItem,
  AdminAuditLogItem,
  SystemSettings,
  UserRole,
} from '../../types/admin';

// Modular Tabs
import { AdminDashboardTab } from './tabs/AdminDashboardTab';
import { AdminUsersTab } from './tabs/AdminUsersTab';
import { AdminDepositsTab } from './tabs/AdminDepositsTab';
import { AdminWithdrawalsTab } from './tabs/AdminWithdrawalsTab';
import { AdminWalletsTab } from './tabs/AdminWalletsTab';
import { AdminTablesTab } from './tabs/AdminTablesTab';
import { AdminMatchesTab } from './tabs/AdminMatchesTab';
import { AdminGamesTab } from './tabs/AdminGamesTab';
import { AdminSupportTab } from './tabs/AdminSupportTab';
import { AdminNotificationsTab } from './tabs/AdminNotificationsTab';
import { AdminAuditTab } from './tabs/AdminAuditTab';
import { AdminSettingsTab } from './tabs/AdminSettingsTab';
import { AdminSecurityTab } from './tabs/AdminSecurityTab';
import { AdminReportsTab } from './tabs/AdminReportsTab';

import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  LayoutDashboard,
  Users,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Table,
  Gamepad2,
  Dices,
  MessageSquare,
  Bell,
  FileCheck2,
  Settings,
  BarChart3,
  RefreshCw,
  AlertCircle,
  Key,
} from 'lucide-react';

export function AdminView() {
  const { user, profile, role } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // States for all modules
  const [metrics, setMetrics] = useState<AdminDashboardMetrics>({
    registeredUsersCount: 0,
    activeUsersCount: 0,
    connectedUsersCount: 0,
    activeTablesCount: 0,
    activeMatchesCount: 0,
    finishedMatchesCount: 0,
    pendingDepositsCount: 0,
    pendingWithdrawalsCount: 0,
    pendingTicketsCount: 0,
    totalVolumePlayed: 0,
    totalPrizesAwarded: 0,
    totalServiceFeesCollected: 0,
    securityAlertsCount: 0,
  });

  const [usersList, setUsersList] = useState<AdminUserItem[]>([]);
  const [depositsList, setDepositsList] = useState<AdminDepositItem[]>([]);
  const [withdrawalsList, setWithdrawalsList] = useState<AdminWithdrawalItem[]>([]);
  const [walletsList, setWalletsList] = useState<AdminWalletItem[]>([]);
  const [tablesList, setTablesList] = useState<AdminTableItem[]>([]);
  const [matchesList, setMatchesList] = useState<AdminMatchItem[]>([]);
  const [gamesList, setGamesList] = useState<AdminGameItem[]>([]);
  const [ticketsList, setTicketsList] = useState<AdminSupportTicketItem[]>([]);
  const [notificationsList, setNotificationsList] = useState<AdminNotificationItem[]>([]);
  const [auditLogsList, setAuditLogsList] = useState<AdminAuditLogItem[]>([]);
  const [settingsData, setSettingsData] = useState<SystemSettings>({
    serviceFeePercent: 10,
    winnerPercent: 90,
    minimumAge: 18,
    minDepositAmount: 50,
    maxDepositAmount: 50000,
    minWithdrawalAmount: 100,
    maxWithdrawalAmount: 20000,
    maintenanceMode: false,
    mfaRequiredForWithdrawal: true,
    kycRequiredForRealMoney: true,
  });

  const userEmail = user?.email || profile?.email || null;
  const isSuperAdmin =
    role === 'SUPER_ADMIN' &&
    userEmail !== null &&
    AUTHORIZED_SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === userEmail.toLowerCase());

  const isAuthorized = role === 'ADMIN' || role === 'SUPER_ADMIN' || isSuperAdmin;

  // Carga centralizada de datos
  const loadAllAdminData = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    try {
      const [
        fetchedMetrics,
        fetchedUsers,
        fetchedDeposits,
        fetchedWithdrawals,
        fetchedWallets,
        fetchedTables,
        fetchedMatches,
        fetchedGames,
        fetchedTickets,
        fetchedNotifications,
        fetchedLogs,
        fetchedSettings,
      ] = await Promise.all([
        AdminRepository.getMetrics(),
        AdminRepository.getUsersList(),
        AdminRepository.getDepositsList(),
        AdminRepository.getWithdrawalsList(),
        AdminRepository.getWalletsList(),
        AdminRepository.getTablesList(),
        AdminRepository.getMatchesList(),
        AdminRepository.getGamesOverview(),
        AdminRepository.getSupportTickets(),
        AdminRepository.getAdminNotifications(),
        AdminRepository.getAuditLogs(50),
        AdminRepository.getSystemSettings(),
      ]);

      setMetrics(fetchedMetrics);
      setUsersList(fetchedUsers);
      setDepositsList(fetchedDeposits);
      setWithdrawalsList(fetchedWithdrawals);
      setWalletsList(fetchedWallets);
      setTablesList(fetchedTables);
      setMatchesList(fetchedMatches);
      setGamesList(fetchedGames);
      setTicketsList(fetchedTickets);
      setNotificationsList(fetchedNotifications);
      setAuditLogsList(fetchedLogs);
      setSettingsData(fetchedSettings);
      setInitialLoaded(true);
    } catch (err) {
      console.error('[AdminView] Error sincronizando datos administrativos:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    loadAllAdminData();
    // Auto-refresco pasivo cada 60s
    const interval = setInterval(() => {
      loadAllAdminData();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadAllAdminData]);

  // Handlers para Recargas
  const handleApproveDeposit = async (depositId: string) => {
    return await PaymentRepository.approveDeposit(depositId);
  };

  const handleRejectDeposit = async (depositId: string, reason: string) => {
    return await AdminRepository.rejectDeposit(depositId, reason);
  };

  // Handlers para Retiros
  const handleCompleteWithdrawal = async (withdrawalId: string, bankRef: string) => {
    return await PaymentRepository.completeWithdrawal(withdrawalId, bankRef);
  };

  const handleRejectWithdrawal = async (withdrawalId: string, reason: string) => {
    return await PaymentRepository.rejectWithdrawal(withdrawalId, reason);
  };

  // Handler para Usuarios y Roles
  const handleUpdateUserStatus = async (
    userId: string,
    targetEmail: string,
    newStatus: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED',
    reason: string
  ) => {
    const res = await AdminRepository.updateUserAccountStatus(userId, targetEmail, newStatus, reason);
    if (!res.success) {
      alert(res.error || 'Error al actualizar el estado del usuario');
    }
  };

  const handleUpdateUserRole = async (userId: string, targetEmail: string, newRole: UserRole) => {
    const res = await AdminRepository.updateUserRole(userId, targetEmail, newRole);
    if (!res.success) {
      alert(res.error || 'Error al actualizar el rol');
    }
  };

  // Handler para Mesas
  const handleCancelTable = async (tableId: string, reason: string) => {
    return await AdminRepository.cancelTable(tableId, reason);
  };

  // Handler para Tickets
  const handleUpdateTicketStatus = async (
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'
  ) => {
    return await AdminRepository.updateTicketStatus(ticketId, status);
  };

  // Handler para Notificaciones
  const handleMarkNotificationAsRead = async (id: string) => {
    await AdminRepository.markNotificationAsRead(id);
    setNotificationsList((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  // Handler para Configuración
  const handleUpdateSetting = async (key: string, value: any) => {
    return await AdminRepository.updateSystemSetting(key, value);
  };

  // Verificación de acceso
  if (!isAuthorized) {
    return (
      <div id="admin-unauthorized" className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-800/60 flex items-center justify-center mx-auto text-red-400">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Acceso Administrativo Restringido</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Esta consola está reservada exclusivamente para operadores y administradores autorizados. Su intento ha sido registrado de forma segura.
        </p>
      </div>
    );
  }

  // Lista de Pestañas
  const navTabs: Array<{
    id: AdminTabId;
    label: string;
    icon: any;
    badge?: number;
    superAdminOnly?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Usuarios', icon: Users },
    {
      id: 'deposits',
      label: 'Recargas',
      icon: ArrowDownLeft,
      badge: metrics.pendingDepositsCount > 0 ? metrics.pendingDepositsCount : undefined,
    },
    {
      id: 'withdrawals',
      label: 'Retiros',
      icon: ArrowUpRight,
      badge: metrics.pendingWithdrawalsCount > 0 ? metrics.pendingWithdrawalsCount : undefined,
    },
    { id: 'wallets', label: 'Billeteras', icon: Wallet },
    { id: 'tables', label: 'Mesas', icon: Table },
    { id: 'matches', label: 'Partidas', icon: Gamepad2 },
    { id: 'games', label: 'Juegos', icon: Dices },
    {
      id: 'support',
      label: 'Soporte',
      icon: MessageSquare,
      badge: metrics.pendingTicketsCount > 0 ? metrics.pendingTicketsCount : undefined,
    },
    {
      id: 'notifications',
      label: 'Alertas',
      icon: Bell,
      badge: notificationsList.filter((n) => !n.isRead).length || undefined,
    },
    { id: 'audit', label: 'Auditoría', icon: FileCheck2 },
    { id: 'settings', label: 'Ajustes', icon: Settings },
    { id: 'security', label: 'Seguridad', icon: ShieldCheck, superAdminOnly: true },
    { id: 'reports', label: 'Reportes', icon: BarChart3 },
  ];

  return (
    <div id="admin-panel-root" className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-4">
      {/* Encabezado Superior del Panel de Control */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-100 tracking-tight">
                Consola Administrativa Profesional
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                  isSuperAdmin
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                {isSuperAdmin ? <Key className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                {isSuperAdmin ? 'SUPER_ADMIN EXCLUSIVO' : role}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Sesión activa: <span className="text-slate-300">{userEmail || 'admin@raspando.com'}</span> • Conexión Activa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-admin-refresh-all"
            type="button"
            onClick={loadAllAdminData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>Sincronizar</span>
          </button>
        </div>
      </div>

      {/* Navegación Modular (Tabs de Control) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-1.5 shadow-md">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isActive
                        ? 'bg-slate-950 text-amber-400'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido Dinámico del Módulo Seleccionado */}
      <div className="pt-2">
        {activeTab === 'dashboard' && (
          <AdminDashboardTab metrics={metrics} onNavigateTab={(t) => setActiveTab(t)} />
        )}

        {activeTab === 'users' && (
          <AdminUsersTab
            users={usersList}
            currentUserRole={role}
            currentUserEmail={userEmail}
            onUpdateStatus={handleUpdateUserStatus}
            onUpdateRole={handleUpdateUserRole}
            onRefresh={loadAllAdminData}
          />
        )}

        {activeTab === 'deposits' && (
          <AdminDepositsTab
            deposits={depositsList}
            onApproveDeposit={handleApproveDeposit}
            onRejectDeposit={handleRejectDeposit}
            onRefresh={loadAllAdminData}
          />
        )}

        {activeTab === 'withdrawals' && (
          <AdminWithdrawalsTab
            withdrawals={withdrawalsList}
            onCompleteWithdrawal={handleCompleteWithdrawal}
            onRejectWithdrawal={handleRejectWithdrawal}
            onRefresh={loadAllAdminData}
          />
        )}

        {activeTab === 'wallets' && (
          <AdminWalletsTab wallets={walletsList} onRefresh={loadAllAdminData} />
        )}

        {activeTab === 'tables' && (
          <AdminTablesTab
            tables={tablesList}
            onCancelTable={handleCancelTable}
            onRefresh={loadAllAdminData}
          />
        )}

        {activeTab === 'matches' && (
          <AdminMatchesTab matches={matchesList} onRefresh={loadAllAdminData} />
        )}

        {activeTab === 'games' && (
          <AdminGamesTab games={gamesList} onRefresh={loadAllAdminData} />
        )}

        {activeTab === 'support' && (
          <AdminSupportTab
            tickets={ticketsList}
            onUpdateStatus={handleUpdateTicketStatus}
            onRefresh={loadAllAdminData}
          />
        )}

        {activeTab === 'notifications' && (
          <AdminNotificationsTab
            notifications={notificationsList}
            onMarkAsRead={handleMarkNotificationAsRead}
            onRefresh={loadAllAdminData}
          />
        )}

        {activeTab === 'audit' && (
          <AdminAuditTab logs={auditLogsList} onRefresh={loadAllAdminData} />
        )}

        {activeTab === 'settings' && (
          <AdminSettingsTab
            settings={settingsData}
            currentUserRole={role}
            onUpdateSetting={handleUpdateSetting}
            onRefresh={loadAllAdminData}
          />
        )}

        {activeTab === 'security' && (
          <AdminSecurityTab currentUserRole={role} currentUserEmail={userEmail} />
        )}

        {activeTab === 'reports' && <AdminReportsTab metrics={metrics} />}
      </div>
    </div>
  );
}
