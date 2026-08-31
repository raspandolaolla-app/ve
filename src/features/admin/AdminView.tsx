// ==============================================================================
// RASPANDO LA OLLA — PANEL ADMINISTRATIVO PROFESIONAL (FASE 23 & RESTRUCTURACIÓN)
// ==============================================================================
// Control exclusivo y centralizado conectado directamente a Supabase:
// - Verificación de identidad y rol en servidor (RLS / RBAC).
// - Super Admins únicos autorizados: v19629049@gmail.com y pulsoplay2026@gmail.com.
// - 24 Módulos Integrados: 100% Visibles, Accesibles y Responsivos en todos los dispositivos.
// ==============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AdminRepository } from '../../services/repositories/AdminRepository';
import { PaymentRepository } from '../../services/repositories/PaymentRepository';
import { PresenceService } from '../../services/PresenceService';
import { getSupabaseClient } from '../../lib/supabase/client';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../utils/constants';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
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

// Modular Tabs (Todos los 24 Módulos Existentes)
import { AdminDashboardTab } from './tabs/AdminDashboardTab';
import { AdminUsersTab } from './tabs/AdminUsersTab';
import { AdminKYCTab } from './tabs/AdminKYCTab';
import { AdminPollaTab } from './tabs/AdminPollaTab';
import { AdminDepositsTab } from './tabs/AdminDepositsTab';
import { AdminWithdrawalsTab } from './tabs/AdminWithdrawalsTab';
import { AdminEntryFeesTab } from './tabs/AdminEntryFeesTab';
import { AdminWalletsTab } from './tabs/AdminWalletsTab';
import { AdminAccountingTab } from './tabs/AdminAccountingTab';
import { AdminTablesTab } from './tabs/AdminTablesTab';
import { AdminMatchesTab } from './tabs/AdminMatchesTab';
import { AdminGamesTab } from './tabs/AdminGamesTab';
import { AdminGameManualsTab } from './tabs/AdminGameManualsTab';
import { AdminActivityTab } from './tabs/AdminActivityTab';
import { AdminAnnouncementsTab } from './tabs/AdminAnnouncementsTab';
import { AdminSupportTab } from './tabs/AdminSupportTab';
import { AdminNotificationsTab } from './tabs/AdminNotificationsTab';
import { AdminAuditTab } from './tabs/AdminAuditTab';
import { AdminSystemTestTab } from './tabs/AdminSystemTestTab';
import { AdminSettingsTab } from './tabs/AdminSettingsTab';
import { AdminSecurityTab } from './tabs/AdminSecurityTab';
import { AdminMaintenanceTab } from './tabs/AdminMaintenanceTab';
import { AdminReportsTab } from './tabs/AdminReportsTab';
import { AdminLobbyContentTab } from './tabs/AdminLobbyContentTab';

import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  LayoutDashboard,
  Users,
  FileCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Wallet,
  DollarSign,
  Table,
  Gamepad2,
  Dices,
  BookOpen,
  Activity,
  Megaphone,
  MessageSquare,
  Bell,
  FileCheck2,
  FlaskConical,
  Settings,
  BarChart3,
  RefreshCw,
  AlertCircle,
  Key,
  Clock,
  Wrench,
  Ticket,
  Image as ImageIcon,
  Search,
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  Filter,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

type ToolCategory = 'all' | 'general' | 'users' | 'finances' | 'games' | 'system';

interface AdminToolDefinition {
  id: AdminTabId;
  label: string;
  shortLabel: string;
  description: string;
  icon: any;
  category: 'general' | 'users' | 'finances' | 'games' | 'system';
  categoryLabel: string;
  badge?: number | string;
  superAdminOnly?: boolean;
}

export function AdminView() {
  const { user, profile, role } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabId>('dashboard');
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Filtros y Navegación de Herramientas
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory>('all');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  const [serverTimeFormatted, setServerTimeFormatted] = useState<string>('');

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
        serverTime,
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
        AdminRepository.getServerTime(),
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

      if (serverTime) {
        setServerTimeFormatted(serverTime.caracasFormatted);
      }

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
    const interval = setInterval(() => {
      loadAllAdminData();
    }, 15000);

    const clockInterval = setInterval(async () => {
      if (isAuthorized) {
        const st = await AdminRepository.getServerTime();
        if (st) setServerTimeFormatted(st.caracasFormatted);
      }
    }, 5000);

    const unsubPresence = PresenceService.subscribeToOnlineUsers((onlineIds) => {
      setUsersList((prevUsers) =>
        prevUsers.map((u) => {
          const isRecent = u.lastSeenAt ? Date.now() - new Date(u.lastSeenAt).getTime() < 240000 : false;
          const isOnline = onlineIds.includes(u.id) || Boolean(u.isOnline) || isRecent;
          return u.isOnline === isOnline ? u : { ...u, isOnline };
        })
      );
    });

    const supabase = getSupabaseClient();
    let realtimeChannel: any = null;

    if (supabase && isAuthorized) {
      realtimeChannel = supabase
        .channel('admin_live_users_roles_wallets_sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
          const freshUsers = await AdminRepository.getUsersList();
          setUsersList(freshUsers);
          const freshMetrics = await AdminRepository.getMetrics();
          setMetrics(freshMetrics);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, async () => {
          const freshUsers = await AdminRepository.getUsersList();
          setUsersList(freshUsers);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, async () => {
          const freshUsers = await AdminRepository.getUsersList();
          setUsersList(freshUsers);
        })
        .subscribe();
    }

    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
      unsubPresence();
      if (supabase && realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [loadAllAdminData, isAuthorized]);

  // Handlers para Recargas
  const handleApproveDeposit = async (depositId: string) => {
    return await PaymentRepository.approveDeposit(depositId);
  };

  const handleRejectDeposit = async (depositId: string, reason: string) => {
    return await AdminRepository.rejectDeposit(depositId, reason);
  };

  // Handlers para Retiros
  const handleCompleteWithdrawal = async (withdrawalId: string, bankRef: string, totpCode?: string) => {
    return await PaymentRepository.completeWithdrawal(withdrawalId, bankRef, undefined, totpCode);
  };

  const handleRejectWithdrawal = async (withdrawalId: string, reason: string, totpCode?: string) => {
    return await PaymentRepository.rejectWithdrawal(withdrawalId, reason, undefined, totpCode);
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
      alert(sanitizeUserErrorMessage(res.error, 'No fue posible actualizar el estado del usuario.'));
    }
  };

  const handleUpdateUserRole = async (userId: string, targetEmail: string, newRole: UserRole) => {
    const res = await AdminRepository.updateUserRole(userId, targetEmail, newRole);
    if (!res.success) {
      alert(sanitizeUserErrorMessage(res.error, 'No fue posible actualizar el rol del usuario.'));
    }
  };

  // Handler para Mesas
  const handleCancelTable = async (tableId: string, reason: string) => {
    return await AdminRepository.cancelTable(tableId, reason);
  };

  const handleTerminateTable = async (tableId: string, reason: string, refundPlayers: boolean) => {
    return await AdminRepository.terminateTable(tableId, reason, refundPlayers);
  };

  const handleCleanupTable = async (tableId: string) => {
    return await AdminRepository.cleanupTable(tableId);
  };

  const handleCleanupAllEmptyTables = async () => {
    return await AdminRepository.cleanupAllEmptyTables();
  };

  const handleDisconnectPlayer = async (tableId: string, userId: string, reason?: string) => {
    return await AdminRepository.disconnectPlayer(tableId, userId, reason);
  };

  const handleAutoCleanTables = async (inactiveMinutes?: number) => {
    return await AdminRepository.autoCleanExpiredTables(inactiveMinutes || 15);
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
    setNotificationsList((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  };

  // Handler para Configuración
  const handleUpdateSetting = async (key: string, value: any) => {
    return await AdminRepository.updateSystemSetting(key, value);
  };

  // Definición Maestra de las 24 Herramientas Administrativas
  const allTools: AdminToolDefinition[] = useMemo(
    () => [
      // 1. General & Analítica (3)
      {
        id: 'dashboard',
        label: 'Dashboard & KPIs',
        shortLabel: 'Dashboard',
        description: 'Métricas clave en vivo y accesos directos',
        icon: LayoutDashboard,
        category: 'general',
        categoryLabel: 'General & Analítica',
      },
      {
        id: 'reports',
        label: 'Reportes & Análisis',
        shortLabel: 'Reportes',
        description: 'Rendimiento de plataforma y balances',
        icon: BarChart3,
        category: 'general',
        categoryLabel: 'General & Analítica',
      },
      {
        id: 'activity',
        label: 'Sesiones & Actividad',
        shortLabel: 'Actividad',
        description: 'Presencia de usuarios y conexiones en vivo',
        icon: Activity,
        category: 'general',
        categoryLabel: 'General & Analítica',
      },

      // 2. Usuarios & Cumplimiento (4)
      {
        id: 'users',
        label: 'Gestión de Usuarios',
        shortLabel: 'Usuarios',
        description: 'Cuentas, estados, perfiles y roles',
        icon: Users,
        category: 'users',
        categoryLabel: 'Usuarios & Cumplimiento',
      },
      {
        id: 'kyc',
        label: 'Expedientes KYC',
        shortLabel: 'Expedientes KYC',
        description: 'Verificación de identidad y documentos',
        icon: FileCheck,
        category: 'users',
        categoryLabel: 'Usuarios & Cumplimiento',
      },
      {
        id: 'support',
        label: 'Tickets de Soporte',
        shortLabel: 'Soporte',
        description: 'Atención de reclamos e incidencias',
        icon: MessageSquare,
        category: 'users',
        categoryLabel: 'Usuarios & Cumplimiento',
        badge: metrics.pendingTicketsCount > 0 ? metrics.pendingTicketsCount : undefined,
      },
      {
        id: 'notifications',
        label: 'Alertas del Sistema',
        shortLabel: 'Alertas',
        description: 'Bandeja de notificaciones y alertas',
        icon: Bell,
        category: 'users',
        categoryLabel: 'Usuarios & Cumplimiento',
        badge: notificationsList.filter((n) => !n.isRead).length || undefined,
      },

      // 3. Finanzas & Billetera (5)
      {
        id: 'deposits',
        label: 'Recargas Bancarias',
        shortLabel: 'Recargas',
        description: 'Aprobación y verificación de Pago Móvil',
        icon: ArrowDownLeft,
        category: 'finances',
        categoryLabel: 'Finanzas & Billetera',
        badge: metrics.pendingDepositsCount > 0 ? metrics.pendingDepositsCount : undefined,
      },
      {
        id: 'withdrawals',
        label: 'Retiros Solicitados',
        shortLabel: 'Retiros',
        description: 'Liquidaciones bancarias y pagos a usuarios',
        icon: ArrowUpRight,
        category: 'finances',
        categoryLabel: 'Finanzas & Billetera',
        badge: metrics.pendingWithdrawalsCount > 0 ? metrics.pendingWithdrawalsCount : undefined,
      },
      {
        id: 'wallets',
        label: 'Billeteras de Usuarios',
        shortLabel: 'Billeteras',
        description: 'Auditoría de saldos y fondos de jugadores',
        icon: Wallet,
        category: 'finances',
        categoryLabel: 'Finanzas & Billetera',
      },
      {
        id: 'accounting',
        label: 'Libro Mayor & Contabilidad',
        shortLabel: 'Contabilidad',
        description: 'Registro inmutable del Ledger y flujo financiero',
        icon: DollarSign,
        category: 'finances',
        categoryLabel: 'Finanzas & Billetera',
      },
      {
        id: 'entry-fees',
        label: 'Montos de Entrada (BCV)',
        shortLabel: 'Montos de Entrada',
        description: 'Límites de apuestas y cuotas autorizadas',
        icon: Coins,
        category: 'finances',
        categoryLabel: 'Finanzas & Billetera',
      },

      // 4. Mesas, Juegos & Lobby (7)
      {
        id: 'tables',
        label: 'Mesas en Vivo',
        shortLabel: 'Mesas',
        description: 'Supervisión, expulsión y cierre de salas',
        icon: Table,
        category: 'games',
        categoryLabel: 'Mesas, Juegos & Lobby',
      },
      {
        id: 'matches',
        label: 'Historial de Partidas',
        shortLabel: 'Partidas',
        description: 'Registro de sesiones, ganadores y pozos',
        icon: Gamepad2,
        category: 'games',
        categoryLabel: 'Mesas, Juegos & Lobby',
      },
      {
        id: 'games',
        label: 'Catálogo de Juegos',
        shortLabel: 'Juegos',
        description: 'Activación y parámetros por juego',
        icon: Dices,
        category: 'games',
        categoryLabel: 'Mesas, Juegos & Lobby',
      },
      {
        id: 'polla',
        label: 'Polla Venezolana',
        shortLabel: 'Polla',
        description: 'Gestión de animalitos, sorteos y boletos',
        icon: Ticket,
        category: 'games',
        categoryLabel: 'Mesas, Juegos & Lobby',
      },
      {
        id: 'manuals',
        label: 'Reglas y Manuales',
        shortLabel: 'Reglas & Manuales',
        description: 'Documentación oficial y reglamentos',
        icon: BookOpen,
        category: 'games',
        categoryLabel: 'Mesas, Juegos & Lobby',
      },
      {
        id: 'announcements',
        label: 'Anuncios Públicos',
        shortLabel: 'Anuncios',
        description: 'Banners y comunicados para jugadores',
        icon: Megaphone,
        category: 'games',
        categoryLabel: 'Mesas, Juegos & Lobby',
      },
      {
        id: 'lobby-content',
        label: 'Contenido del Lobby',
        shortLabel: 'Contenido Lobby',
        description: 'Gestor multimedia y tarjetas visuales',
        icon: ImageIcon,
        category: 'games',
        categoryLabel: 'Mesas, Juegos & Lobby',
      },

      // 5. Seguridad & Sistema (5)
      {
        id: 'audit',
        label: 'Registro de Auditoría',
        shortLabel: 'Auditoría',
        description: 'Trazabilidad inmutable de eventos del sistema',
        icon: FileCheck2,
        category: 'system',
        categoryLabel: 'Seguridad & Sistema',
      },
      {
        id: 'system-test',
        label: 'Auditoría & Test Automatizado',
        shortLabel: 'Auditoría & Test',
        description: 'Pruebas de integridad y validación en vivo',
        icon: FlaskConical,
        category: 'system',
        categoryLabel: 'Seguridad & Sistema',
      },
      {
        id: 'settings',
        label: 'Ajustes del Sistema',
        shortLabel: 'Ajustes',
        description: 'Comisiones, edades mínimas y parámetros',
        icon: Settings,
        category: 'system',
        categoryLabel: 'Seguridad & Sistema',
      },
      {
        id: 'security',
        label: 'Seguridad Avanzada & 2FA',
        shortLabel: 'Seguridad',
        description: 'Protección con 2FA y blindaje administrativo',
        icon: ShieldCheck,
        category: 'system',
        categoryLabel: 'Seguridad & Sistema',
        superAdminOnly: true,
      },
      {
        id: 'maintenance',
        label: 'Modo Mantenimiento',
        shortLabel: 'Mantenimiento',
        description: 'Control de parada operativa del sistema',
        icon: Wrench,
        category: 'system',
        categoryLabel: 'Seguridad & Sistema',
        superAdminOnly: true,
      },
    ],
    [metrics, notificationsList]
  );

  // Filtrado de herramientas por búsqueda y categoría
  const filteredTools = useMemo(() => {
    return allTools.filter((tool) => {
      // Filtrar por permisos
      if (tool.superAdminOnly && !isSuperAdmin) {
        return false;
      }
      // Filtrar por categoría
      if (selectedCategory !== 'all' && tool.category !== selectedCategory) {
        return false;
      }
      // Filtrar por término de búsqueda
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = tool.label.toLowerCase().includes(query);
        const matchShort = tool.shortLabel.toLowerCase().includes(query);
        const matchDesc = tool.description.toLowerCase().includes(query);
        const matchCat = tool.categoryLabel.toLowerCase().includes(query);
        return matchName || matchShort || matchDesc || matchCat;
      }
      return true;
    });
  }, [allTools, isSuperAdmin, selectedCategory, searchQuery]);

  // Herramienta activa actual
  const currentTool = useMemo(() => {
    return allTools.find((t) => t.id === activeTab) || allTools[0];
  }, [allTools, activeTab]);

  // Selección de herramienta con cierre de drawer
  const handleSelectTool = (tabId: AdminTabId) => {
    setActiveTab(tabId);
    setMobileDrawerOpen(false);
    // Desplazamiento suave al tope del área de contenido
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Conteo total de pendientes para insignia global
  const totalPendingBadges =
    (metrics.pendingDepositsCount || 0) +
    (metrics.pendingWithdrawalsCount || 0) +
    (metrics.pendingTicketsCount || 0) +
    (notificationsList.filter((n) => !n.isRead).length || 0);

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

  // Lista de categorías para botones y filtros
  const categoryFilters: Array<{ id: ToolCategory; label: string; count: number }> = [
    { id: 'all', label: 'Todas', count: allTools.length },
    { id: 'general', label: 'General', count: allTools.filter((t) => t.category === 'general').length },
    { id: 'users', label: 'Usuarios', count: allTools.filter((t) => t.category === 'users').length },
    { id: 'finances', label: 'Finanzas', count: allTools.filter((t) => t.category === 'finances').length },
    { id: 'games', label: 'Juegos & Mesas', count: allTools.filter((t) => t.category === 'games').length },
    { id: 'system', label: 'Sistema', count: allTools.filter((t) => t.category === 'system').length },
  ];

  return (
    <div id="admin-panel-root" className="space-y-4 max-w-7xl mx-auto px-2 sm:px-4 py-3">
      {/* 1. Encabezado Superior Profesional */}
      <header className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
                  Consola Administrativa Profesional
                </h1>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
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
                Operador: <span className="text-slate-300 font-semibold">{userEmail || 'admin@raspando.com'}</span> • 24 Herramientas Activas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
            {/* Reloj Oficial Caracas */}
            {serverTimeFormatted && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/90 border border-amber-500/30 text-xs font-mono text-amber-400">
                <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                <span>{serverTimeFormatted}</span>
                <span className="text-[10px] text-slate-500 font-sans">CCS (UTC-4)</span>
              </div>
            )}

            <button
              id="btn-admin-refresh-all"
              type="button"
              onClick={loadAllAdminData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
              title="Sincronizar todos los módulos con la base de datos"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              <span>Sincronizar</span>
            </button>

            {/* Botón Móvil: Abrir Drawer de Todas las Herramientas */}
            <button
              id="btn-mobile-open-tools-drawer"
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow-lg hover:bg-amber-400 transition-all cursor-pointer"
            >
              <Menu className="w-4 h-4" />
              <span>Herramientas (24)</span>
              {totalPendingBadges > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-950 text-amber-400 text-[10px] font-black ml-0.5">
                  {totalPendingBadges}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Barra de Búsqueda Rápida y Salto de Herramienta */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="admin-tools-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar entre las 24 herramientas..."
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Selector desplegable nativo para cambio instantáneo en cualquier pantalla */}
          <div className="w-full sm:w-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap hidden md:inline">Salto directo:</span>
            <select
              id="admin-quick-tool-select"
              value={activeTab}
              onChange={(e) => handleSelectTool(e.target.value as AdminTabId)}
              className="w-full sm:w-64 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-semibold text-amber-300 focus:outline-none focus:border-amber-500/60 cursor-pointer"
            >
              <optgroup label="General & Analítica">
                <option value="dashboard">Dashboard & KPIs</option>
                <option value="reports">Reportes & Análisis</option>
                <option value="activity">Sesiones & Actividad</option>
              </optgroup>
              <optgroup label="Usuarios & Cumplimiento">
                <option value="users">Gestión de Usuarios</option>
                <option value="kyc">Expedientes KYC</option>
                <option value="support">Tickets de Soporte</option>
                <option value="notifications">Alertas del Sistema</option>
              </optgroup>
              <optgroup label="Finanzas & Billetera">
                <option value="deposits">Recargas Bancarias</option>
                <option value="withdrawals">Retiros Solicitados</option>
                <option value="wallets">Billeteras de Usuarios</option>
                <option value="accounting">Libro Mayor & Contabilidad</option>
                <option value="entry-fees">Montos de Entrada (BCV)</option>
              </optgroup>
              <optgroup label="Mesas, Juegos & Lobby">
                <option value="tables">Mesas en Vivo</option>
                <option value="matches">Historial de Partidas</option>
                <option value="games">Catálogo de Juegos</option>
                <option value="polla">Polla Venezolana</option>
                <option value="manuals">Reglas y Manuales</option>
                <option value="announcements">Anuncios Públicos</option>
                <option value="lobby-content">Contenido del Lobby</option>
              </optgroup>
              <optgroup label="Seguridad & Sistema">
                <option value="audit">Registro de Auditoría</option>
                <option value="system-test">Auditoría & Test</option>
                <option value="settings">Ajustes del Sistema</option>
                {isSuperAdmin && <option value="security">Seguridad Avanzada & 2FA</option>}
                {isSuperAdmin && <option value="maintenance">Modo Mantenimiento</option>}
              </optgroup>
            </select>
          </div>
        </div>
      </header>

      {/* 2. Barra Móvil de Filtros por Categoría */}
      <div className="lg:hidden bg-slate-900/90 border border-slate-800 rounded-2xl p-2 shadow-md">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
          {categoryFilters.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'bg-slate-950/60 border border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>

        {/* Carrusel horizontal de herramientas con botones visibles */}
        <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
          {filteredTools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTab === tool.id;
            return (
              <button
                key={tool.id}
                id={`mobile-tab-btn-${tool.id}`}
                type="button"
                onClick={() => handleSelectTool(tool.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400'
                    : 'bg-slate-950/70 border border-slate-800 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                <span>{tool.shortLabel}</span>
                {tool.badge !== undefined && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                      isActive ? 'bg-slate-950 text-amber-400' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {tool.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Estructura Principal: Sidebar en Desktop + Área de Contenido */}
      <div className="flex flex-col lg:flex-row items-start gap-4">
        {/* SIDEBAR DE ESCRITORIO (Completo, Categorizado y con Desplazamiento Vertical Suave) */}
        <aside
          id="admin-desktop-sidebar"
          className="hidden lg:block w-72 xl:w-80 shrink-0 bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-xl sticky top-4 max-h-[calc(100vh-100px)] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700"
        >
          {/* Encabezado del Sidebar */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                Directorio ({filteredTools.length}/24)
              </span>
            </div>
            {totalPendingBadges > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {totalPendingBadges} pendientes
              </span>
            )}
          </div>

          {/* Filtros de Categoría */}
          <div className="grid grid-cols-3 gap-1 mb-3">
            {categoryFilters.slice(0, 6).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold text-center transition-all truncate cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                }`}
                title={cat.label}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Listado de Herramientas Agrupadas */}
          <div className="space-y-4">
            {['general', 'users', 'finances', 'games', 'system'].map((catKey) => {
              const catTools = filteredTools.filter((t) => t.category === catKey);
              if (catTools.length === 0) return null;

              const categoryTitles: Record<string, string> = {
                general: 'General & Analítica',
                users: 'Usuarios & Cumplimiento',
                finances: 'Finanzas & Billetera',
                games: 'Mesas, Juegos & Lobby',
                system: 'Seguridad & Sistema',
              };

              return (
                <div key={catKey} className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80 px-2 py-1 flex items-center justify-between">
                    <span>{categoryTitles[catKey]}</span>
                    <span className="text-slate-500 font-mono">({catTools.length})</span>
                  </div>

                  <div className="space-y-1">
                    {catTools.map((tool) => {
                      const Icon = tool.icon;
                      const isActive = activeTab === tool.id;

                      return (
                        <button
                          key={tool.id}
                          id={`sidebar-tab-btn-${tool.id}`}
                          type="button"
                          onClick={() => handleSelectTool(tool.id)}
                          className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer group ${
                            isActive
                              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/60 bg-slate-950/40 border border-transparent hover:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon
                              className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                                isActive ? 'text-slate-950' : 'text-amber-400'
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate leading-tight">{tool.shortLabel}</div>
                              <div
                                className={`text-[10px] truncate leading-tight ${
                                  isActive ? 'text-slate-900/80' : 'text-slate-500'
                                }`}
                              >
                                {tool.description}
                              </div>
                            </div>
                          </div>

                          {tool.badge !== undefined && (
                            <span
                              className={`shrink-0 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                isActive
                                  ? 'bg-slate-950 text-amber-400'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              }`}
                            >
                              {tool.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ÁREA PRINCIPAL DE CONTENIDO MODULAR */}
        <main className="flex-1 min-w-0 w-full space-y-4">
          {/* Banner de Identificación del Módulo Activo */}
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <currentTool.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
                    {currentTool.categoryLabel}
                  </span>
                  {currentTool.badge !== undefined && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {currentTool.badge} pendientes
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-black text-slate-100 truncate">
                  {currentTool.label}
                </h2>
                <p className="text-xs text-slate-400 truncate hidden sm:block">
                  {currentTool.description}
                </p>
              </div>
            </div>

            {/* Botón de acceso rápido al Dashboard */}
            {activeTab !== 'dashboard' && (
              <button
                type="button"
                onClick={() => handleSelectTool('dashboard')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 hover:text-amber-300 hover:border-amber-500/40 transition-all shrink-0 cursor-pointer"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            )}
          </div>

          {/* Renderizado Dinámico de los 24 Módulos */}
          <div className="w-full">
            {activeTab === 'dashboard' && (
              <AdminDashboardTab metrics={metrics} onNavigateTab={handleSelectTool} />
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

            {activeTab === 'kyc' && <AdminKYCTab />}

            {activeTab === 'polla' && <AdminPollaTab />}

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

            {activeTab === 'entry-fees' && <AdminEntryFeesTab />}

            {activeTab === 'wallets' && (
              <AdminWalletsTab wallets={walletsList} onRefresh={loadAllAdminData} />
            )}

            {activeTab === 'accounting' && <AdminAccountingTab />}

            {activeTab === 'tables' && (
              <AdminTablesTab
                tables={tablesList}
                currentUserRole={(role as UserRole) || 'ADMIN'}
                onCancelTable={handleCancelTable}
                onTerminateTable={handleTerminateTable}
                onDisconnectPlayer={handleDisconnectPlayer}
                onCleanupTable={handleCleanupTable}
                onCleanupAllEmptyTables={handleCleanupAllEmptyTables}
                onAutoCleanTables={handleAutoCleanTables}
                onRefresh={loadAllAdminData}
              />
            )}

            {activeTab === 'matches' && (
              <AdminMatchesTab matches={matchesList} onRefresh={loadAllAdminData} />
            )}

            {activeTab === 'games' && (
              <AdminGamesTab games={gamesList} onRefresh={loadAllAdminData} />
            )}

            {activeTab === 'manuals' && <AdminGameManualsTab />}

            {activeTab === 'activity' && <AdminActivityTab />}

            {activeTab === 'announcements' && <AdminAnnouncementsTab />}

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
              <AdminAuditTab logs={auditLogsList} tables={tablesList} onRefresh={loadAllAdminData} />
            )}

            {activeTab === 'system-test' && (
              <AdminSystemTestTab
                userEmail={userEmail}
                userRole={role || 'ADMIN'}
                isSuperAdmin={isSuperAdmin}
              />
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

            {activeTab === 'maintenance' && <AdminMaintenanceTab />}

            {activeTab === 'reports' && <AdminReportsTab metrics={metrics} />}

            {activeTab === 'lobby-content' && <AdminLobbyContentTab />}
          </div>
        </main>
      </div>

      {/* 4. DRAWER / MODAL MÓVIL COMPLETO DE HERRAMIENTAS ADMINISTRATIVAS */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full sm:max-w-2xl bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-6 duration-300"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Header del Drawer */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Centro de Herramientas Administrativas
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    24 Módulos Operativos • {filteredTools.length} disponibles
                  </p>
                </div>
              </div>

              <button
                id="btn-close-tools-drawer"
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-all"
                title="Cerrar menú de herramientas"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Búsqueda dentro del Drawer */}
            <div className="p-3 border-b border-slate-800 bg-slate-950/40">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar módulo o función administrativa..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Lista Desplazable de las 24 Herramientas */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
              {['general', 'users', 'finances', 'games', 'system'].map((catKey) => {
                const catTools = filteredTools.filter((t) => t.category === catKey);
                if (catTools.length === 0) return null;

                const categoryTitles: Record<string, string> = {
                  general: 'General & Analítica',
                  users: 'Usuarios & Cumplimiento',
                  finances: 'Finanzas & Billetera',
                  games: 'Mesas, Juegos & Lobby',
                  system: 'Seguridad & Sistema',
                };

                return (
                  <div key={catKey} className="space-y-1.5">
                    <div className="text-xs font-bold text-amber-400 px-2 flex items-center justify-between">
                      <span>{categoryTitles[catKey]}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({catTools.length})</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {catTools.map((tool) => {
                        const Icon = tool.icon;
                        const isActive = activeTab === tool.id;

                        return (
                          <button
                            key={tool.id}
                            id={`drawer-tool-btn-${tool.id}`}
                            type="button"
                            onClick={() => handleSelectTool(tool.id)}
                            className={`min-h-[48px] flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              isActive
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-md'
                                : 'bg-slate-950/60 border-slate-800/80 text-slate-200 hover:bg-slate-800/60 hover:border-amber-500/30'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`p-2 rounded-lg ${
                                  isActive ? 'bg-slate-950 text-amber-400' : 'bg-slate-900 text-amber-400 border border-slate-800'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate">{tool.label}</div>
                                <div
                                  className={`text-[10px] truncate ${
                                    isActive ? 'text-slate-900/80 font-normal' : 'text-slate-400'
                                  }`}
                                >
                                  {tool.description}
                                </div>
                              </div>
                            </div>

                            {tool.badge !== undefined && (
                              <span
                                className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                  isActive
                                    ? 'bg-slate-950 text-amber-400'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {tool.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer del Drawer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
              <span>Raspando La Olla — Control Panel</span>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 text-slate-200 font-bold hover:bg-slate-700 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
