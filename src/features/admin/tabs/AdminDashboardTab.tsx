// ==============================================================================
// RASPANDO LA OLLA — TAB 1: DASHBOARD ADMINISTRATIVO Y MÉTRICAS
// ==============================================================================

import { Card } from '../../../components/common/Card';
import { formatBolivares } from '../../../utils/formatters';
import type { AdminDashboardMetrics, AdminTabId } from '../../../types/admin';
import {
  Users,
  UserCheck,
  TrendingUp,
  Award,
  CircleDollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  Gamepad2,
  Table,
  MessageSquare,
  ShieldAlert,
  Activity,
  ArrowRight,
  Zap,
  Ticket,
  FileCheck,
  Coins,
  Wallet,
  DollarSign,
  Dices,
  BookOpen,
  Megaphone,
  Bell,
  FileCheck2,
  FlaskConical,
  Settings,
  ShieldCheck,
  Wrench,
  BarChart3,
  Image as ImageIcon,
  Layers,
} from 'lucide-react';

interface AdminDashboardTabProps {
  metrics: AdminDashboardMetrics;
  onNavigateTab: (tab: AdminTabId) => void;
}

export function AdminDashboardTab({ metrics, onNavigateTab }: AdminDashboardTabProps) {
  // Directorio completo de las 24 herramientas organizado por categorías
  const toolDirectory: Array<{
    category: string;
    items: Array<{
      id: AdminTabId;
      label: string;
      desc: string;
      icon: any;
      badge?: number | string;
      color: string;
    }>;
  }> = [
    {
      category: 'General & Analítica',
      items: [
        { id: 'dashboard', label: 'Dashboard', desc: 'KPIs y métricas en vivo', icon: Zap, color: 'text-amber-400' },
        { id: 'reports', label: 'Reportes', desc: 'Rendimiento y balances', icon: BarChart3, color: 'text-emerald-400' },
        { id: 'activity', label: 'Actividad', desc: 'Sesiones y presencia en vivo', icon: Activity, color: 'text-cyan-400' },
      ],
    },
    {
      category: 'Usuarios & Cumplimiento',
      items: [
        { id: 'users', label: 'Usuarios', desc: 'Cuentas, estados y roles', icon: Users, color: 'text-blue-400' },
        { id: 'kyc', label: 'Expedientes KYC', desc: 'Verificación de identidad', icon: FileCheck, color: 'text-indigo-400' },
        {
          id: 'support',
          label: 'Soporte',
          desc: 'Tickets y reclamos',
          icon: MessageSquare,
          badge: metrics.pendingTicketsCount > 0 ? `${metrics.pendingTicketsCount} pendientes` : undefined,
          color: 'text-pink-400',
        },
        {
          id: 'notifications',
          label: 'Alertas',
          desc: 'Centro de notificaciones',
          icon: Bell,
          color: 'text-amber-400',
        },
      ],
    },
    {
      category: 'Finanzas & Billetera',
      items: [
        {
          id: 'deposits',
          label: 'Recargas',
          desc: 'Validación de pagos móviles',
          icon: ArrowDownLeft,
          badge: metrics.pendingDepositsCount > 0 ? `${metrics.pendingDepositsCount} pendientes` : undefined,
          color: 'text-emerald-400',
        },
        {
          id: 'withdrawals',
          label: 'Retiros',
          desc: 'Liquidaciones bancarias',
          icon: ArrowUpRight,
          badge: metrics.pendingWithdrawalsCount > 0 ? `${metrics.pendingWithdrawalsCount} pendientes` : undefined,
          color: 'text-amber-400',
        },
        { id: 'wallets', label: 'Billeteras', desc: 'Fondos y saldos de jugadores', icon: Wallet, color: 'text-purple-400' },
        { id: 'accounting', label: 'Libro Mayor', desc: 'Contabilidad y ledger', icon: DollarSign, color: 'text-emerald-400' },
        { id: 'entry-fees', label: 'Montos de Entrada', desc: 'Límites de apuestas y cuotas', icon: Coins, color: 'text-amber-300' },
      ],
    },
    {
      category: 'Mesas, Juegos & Contenido',
      items: [
        { id: 'tables', label: 'Mesas', desc: 'Supervisión y cierre de salas', icon: Table, color: 'text-indigo-400' },
        { id: 'matches', label: 'Partidas', desc: 'Historial y desenlaces', icon: Gamepad2, color: 'text-sky-400' },
        { id: 'games', label: 'Juegos', desc: 'Configuración de catálogo', icon: Dices, color: 'text-orange-400' },
        { id: 'polla', label: 'Polla Venezolana', desc: 'Animalitos y sorteos', icon: Ticket, color: 'text-emerald-400' },
        { id: 'manuals', label: 'Reglas y Manuales', desc: 'Reglamentos oficiales', icon: BookOpen, color: 'text-slate-300' },
        { id: 'announcements', label: 'Anuncios', desc: 'Avisos y banners del sistema', icon: Megaphone, color: 'text-amber-400' },
        { id: 'lobby-content', label: 'Contenido Lobby', desc: 'Banners y multimedia', icon: ImageIcon, color: 'text-pink-400' },
      ],
    },
    {
      category: 'Seguridad & Sistema',
      items: [
        { id: 'audit', label: 'Auditoría', desc: 'Trazabilidad inmutable', icon: FileCheck2, color: 'text-amber-400' },
        { id: 'system-test', label: 'Auditoría & Test', desc: 'Pruebas automatizadas', icon: FlaskConical, color: 'text-cyan-400' },
        { id: 'settings', label: 'Ajustes', desc: 'Parámetros del sistema', icon: Settings, color: 'text-slate-300' },
        { id: 'security', label: 'Seguridad', desc: '2FA y blindaje Super Admin', icon: ShieldCheck, color: 'text-purple-400' },
        { id: 'maintenance', label: 'Mantenimiento', desc: 'Control de parada operativa', icon: Wrench, color: 'text-rose-400' },
      ],
    },
  ];

  return (
    <div className="space-y-6" id="tab-admin-dashboard">
      {/* Resumen Principal de Métricas (KPI Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card id="metric-registered-users" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Usuarios Registrados</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-100 font-mono">
              {metrics.registeredUsersCount.toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400">
              <Activity className="w-3 h-3 animate-pulse" />
              <span>{metrics.activeUsersCount} activos hoy ({metrics.connectedUsersCount} online)</span>
            </div>
          </div>
        </Card>

        <Card id="metric-active-tables" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Mesas y Partidas</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Table className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-100 font-mono">
              {metrics.activeTablesCount}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-indigo-300">
              <Gamepad2 className="w-3 h-3" />
              <span>{metrics.finishedMatchesCount} partidas finalizadas</span>
            </div>
          </div>
        </Card>

        <Card id="metric-pending-deposits" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Recargas Pendientes</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-300 font-mono">
              {metrics.pendingDepositsCount}
            </div>
            <button
              id="btn-goto-pending-deposits"
              type="button"
              onClick={() => onNavigateTab('deposits')}
              className="flex items-center gap-1 mt-1 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer font-semibold"
            >
              <span>Revisar solicitudes</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Card>

        <Card id="metric-pending-withdrawals" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Retiros Pendientes</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-300 font-mono">
              {metrics.pendingWithdrawalsCount}
            </div>
            <button
              id="btn-goto-pending-withdrawals"
              type="button"
              onClick={() => onNavigateTab('withdrawals')}
              className="flex items-center gap-1 mt-1 text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer font-semibold"
            >
              <span>Liquidación bancaria</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Card>
      </div>

      {/* Métricas Financieras y de Actividad Global */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          id="card-financial-volume"
          className="bg-slate-900/90 border-slate-800"
          header={
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Volumen Jugado en Mesas</span>
            </div>
          }
        >
          <div className="space-y-2">
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {formatBolivares(metrics.totalVolumePlayed)}
            </div>
            <p className="text-xs text-slate-400">
              Total acumulado en partidas tradicionales verificadas en el sistema contable.
            </p>
          </div>
        </Card>

        <Card
          id="card-prizes-awarded"
          className="bg-slate-900/90 border-slate-800"
          header={
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Premios Distribuidos (90%)</span>
            </div>
          }
        >
          <div className="space-y-2">
            <div className="text-2xl font-black text-amber-300 font-mono">
              {formatBolivares(metrics.totalPrizesAwarded)}
            </div>
            <p className="text-xs text-slate-400">
              Monto neto transferido directamente a las billeteras de los ganadores de mesas.
            </p>
          </div>
        </Card>

        <Card
          id="card-service-fee"
          className="bg-slate-900/90 border-slate-800"
          header={
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <CircleDollarSign className="w-4 h-4 text-blue-400" />
              <span>Comisión de Servicio (10%)</span>
            </div>
          }
        >
          <div className="space-y-2">
            <div className="text-2xl font-black text-blue-400 font-mono">
              {formatBolivares(metrics.totalServiceFeesCollected)}
            </div>
            <p className="text-xs text-slate-400">
              Tarifa operativa de plataforma retenida de forma transparente según las reglas financieras.
            </p>
          </div>
        </Card>
      </div>

      {/* Accesos Rápidos de Control Operativo */}
      <Card
        id="card-admin-shortcuts"
        className="bg-slate-900/90 border-slate-800"
        header={
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Accesos Directos del Centro de Control</span>
          </div>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            id="shortcut-users"
            type="button"
            onClick={() => onNavigateTab('users')}
            className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            <UserCheck className="w-5 h-5 text-blue-400 mb-1.5" />
            <span className="text-xs font-semibold">Usuarios</span>
            <span className="text-[10px] text-slate-500">KYC y Estados</span>
          </button>

          <button
            id="shortcut-deposits"
            type="button"
            onClick={() => onNavigateTab('deposits')}
            className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            <ArrowDownLeft className="w-5 h-5 text-emerald-400 mb-1.5" />
            <span className="text-xs font-semibold">Recargas</span>
            <span className="text-[10px] text-amber-400 font-bold">{metrics.pendingDepositsCount} pendientes</span>
          </button>

          <button
            id="shortcut-withdrawals"
            type="button"
            onClick={() => onNavigateTab('withdrawals')}
            className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            <ArrowUpRight className="w-5 h-5 text-amber-400 mb-1.5" />
            <span className="text-xs font-semibold">Retiros</span>
            <span className="text-[10px] text-amber-400 font-bold">{metrics.pendingWithdrawalsCount} pendientes</span>
          </button>

          <button
            id="shortcut-tables"
            type="button"
            onClick={() => onNavigateTab('tables')}
            className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            <Table className="w-5 h-5 text-indigo-400 mb-1.5" />
            <span className="text-xs font-semibold">Mesas</span>
            <span className="text-[10px] text-slate-500">Supervisión</span>
          </button>

          <button
            id="shortcut-support"
            type="button"
            onClick={() => onNavigateTab('support')}
            className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            <MessageSquare className="w-5 h-5 text-pink-400 mb-1.5" />
            <span className="text-xs font-semibold">Soporte</span>
            <span className="text-[10px] text-slate-500">{metrics.pendingTicketsCount} tickets</span>
          </button>

          <button
            id="shortcut-audit"
            type="button"
            onClick={() => onNavigateTab('audit')}
            className="flex flex-col items-center justify-center p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300 hover:text-white transition-all cursor-pointer text-center"
          >
            <ShieldAlert className="w-5 h-5 text-amber-400 mb-1.5" />
            <span className="text-xs font-semibold">Auditoría</span>
            <span className="text-[10px] text-slate-500">Inmutable</span>
          </button>
        </div>
      </Card>

      {/* Directorio Completo de Módulos y Herramientas Administrativas */}
      <Card
        id="card-admin-full-directory"
        className="bg-slate-900/90 border-slate-800"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>Directorio Completo de Herramientas Administrativas (24 Módulos)</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">Acceso 100% Directo</span>
          </div>
        }
      >
        <div className="space-y-6">
          {toolDirectory.map((cat) => (
            <div key={cat.category} className="space-y-2.5">
              <h3 className="text-xs font-bold text-amber-400/90 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {cat.category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {cat.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      id={`directory-btn-${item.id}`}
                      type="button"
                      onClick={() => onNavigateTab(item.id)}
                      className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-amber-500/40 hover:bg-slate-800/60 text-left transition-all group cursor-pointer"
                    >
                      <div className={`p-2 rounded-lg bg-slate-900 border border-slate-800 group-hover:border-amber-500/30 shrink-0 ${item.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-200 group-hover:text-amber-300 transition-colors truncate">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">
                          {item.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

