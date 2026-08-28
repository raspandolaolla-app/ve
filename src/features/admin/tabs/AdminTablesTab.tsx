// ==============================================================================
// RASPANDO LA OLLA — TAB DE ADMINISTRACIÓN Y LIMPIEZA DE MESAS ACTIVAS
// ==============================================================================
// Herramienta profesional para supervisar, terminar, cerrar y limpiar salas/mesas.
// Cumple con reglas inmutables de seguridad:
// - NO borra registros financieros, transacciones, ledger ni audit_logs.
// - Aplica transiciones controladas de estado (WAITING/ACTIVE -> TERMINATED/CLOSED/EXPIRED).
// - Ejecuta limpieza únicamente sobre datos temporales (presencia, sesiones efímeras).
// - Excluye Bingo y Polla Venezolana cuando funcionan como sorteos globales.
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { formatBolivares } from '../../../utils/formatters';
import { sanitizeUserErrorMessage } from '../../../utils/errorSanitizer';
import type { AdminTableItem, UserRole } from '../../../types/admin';
import {
  Table as TableIcon,
  Search,
  Users,
  Lock,
  Globe,
  AlertTriangle,
  XCircle,
  Eye,
  RefreshCw,
  X,
  Trash2,
  Clock,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  DollarSign,
  Activity,
  UserCheck,
  UserX,
  HelpCircle,
  Play,
  Ban,
  Filter,
} from 'lucide-react';

interface AdminTablesTabProps {
  tables: AdminTableItem[];
  currentUserRole?: UserRole;
  onCancelTable?: (tableId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onTerminateTable: (
    tableId: string,
    reason: string,
    refundPlayers: boolean
  ) => Promise<{ success: boolean; error?: string; refundedCount?: number }>;
  onDisconnectPlayer?: (
    tableId: string,
    userId: string,
    reason?: string
  ) => Promise<{ success: boolean; refunded?: boolean; error?: string }>;
  onCleanupTable: (tableId: string) => Promise<{ success: boolean; cleanedItemsCount?: number; error?: string }>;
  onAutoCleanTables: (inactiveMinutes?: number) => Promise<{ success: boolean; expiredTablesCount?: number; error?: string }>;
  onRefresh: () => void;
}

export function AdminTablesTab({
  tables,
  currentUserRole = 'ADMIN',
  onCancelTable,
  onTerminateTable,
  onDisconnectPlayer,
  onCleanupTable,
  onAutoCleanTables,
  onRefresh,
}: AdminTablesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modales de Acción
  const [selectedTable, setSelectedTable] = useState<AdminTableItem | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<AdminTableItem | null>(null);
  const [cleanupTarget, setCleanupTarget] = useState<AdminTableItem | null>(null);
  const [showAutoCleanModal, setShowAutoCleanModal] = useState(false);

  // Formularios y Feedback
  const [terminateReason, setTerminateReason] = useState('');
  const [refundPlayers, setRefundPlayers] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [autoCleanInactiveMinutes, setAutoCleanInactiveMinutes] = useState(15);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtrado de Mesas Activas y Registradas
  const filteredTables = tables.filter((t) => {
    const matchesSearch =
      t.trackingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.gameName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.creatorName && t.creatorName.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return t.status === 'IN_GAME' || t.status === 'FULL';
    if (statusFilter === 'WAITING') return t.status === 'WAITING_PLAYERS' || t.status === 'OPEN';
    if (statusFilter === 'EMPTY') return t.currentPlayers === 0 && t.status !== 'CLOSED' && t.status !== 'TERMINATED';
    if (statusFilter === 'EXPIRED') return t.status === 'EXPIRED';
    if (statusFilter === 'TERMINATED') return t.status === 'TERMINATED' || t.status === 'CANCELLED';
    if (statusFilter === 'CLOSED') return t.status === 'CLOSED' || t.status === 'FINISHED';

    return t.status === statusFilter;
  });

  // Cálculo de Métricas Clave de Mesas
  const totalTables = tables.length;
  const activeGameTables = tables.filter((t) => t.status === 'IN_GAME' || t.status === 'FULL').length;
  const waitingTables = tables.filter((t) => t.status === 'WAITING_PLAYERS' || t.status === 'OPEN').length;
  const emptyTables = tables.filter((t) => t.currentPlayers === 0 && t.status !== 'CLOSED' && t.status !== 'TERMINATED').length;
  const totalPotAccumulated = tables.reduce((acc, t) => acc + (t.currentPot || 0), 0);

  // Ejecutar Terminación de Mesa
  const handleConfirmTerminate = async () => {
    if (!terminateTarget) return;

    const reason = terminateReason.trim() || 'Terminación administrativa por operador/supervisión';
    setActionLoading(true);
    setFeedbackMessage(null);

    try {
      const handler = onTerminateTable || onCancelTable;
      const res = (await handler(terminateTarget.id, reason, refundPlayers)) as {
        success: boolean;
        error?: string;
        refundedCount?: number;
      };
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Mesa ${terminateTarget.trackingCode} terminada exitosamente.${
            res.refundedCount ? ` Se reembolsaron ${res.refundedCount} jugadores.` : ''
          }`,
        });
        setTerminateTarget(null);
        setSelectedTable(null);
        setTerminateReason('');
        onRefresh();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: sanitizeUserErrorMessage(res.error, 'No fue posible terminar la mesa.'),
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Error inesperado al terminar la mesa.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Ejecutar Limpieza de Datos Temporales
  const handleConfirmCleanup = async () => {
    if (!cleanupTarget) return;

    setActionLoading(true);
    setFeedbackMessage(null);

    try {
      const res = await onCleanupTable(cleanupTarget.id);
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Limpieza ejecutada en mesa ${cleanupTarget.trackingCode}. Se depuraron ${res.cleanedItemsCount || 0} registros temporales sin alterar la contabilidad.`,
        });
        setCleanupTarget(null);
        setSelectedTable(null);
        onRefresh();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: sanitizeUserErrorMessage(res.error, 'No se pudo limpiar la mesa.'),
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Error durante la limpieza de la mesa.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Ejecutar Limpieza Automática Masiva de Mesas Inactivas
  const handleConfirmAutoClean = async () => {
    setActionLoading(true);
    setFeedbackMessage(null);

    try {
      const res = await onAutoCleanTables(autoCleanInactiveMinutes);
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Limpieza automática ejecutada: ${res.expiredTablesCount || 0} mesas inactivas pasaron a estado EXPIRADA / CERRADA.`,
        });
        setShowAutoCleanModal(false);
        onRefresh();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: sanitizeUserErrorMessage(res.error, 'Error durante la limpieza automática.'),
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'Error ejecutando la política de limpieza automática.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Renderizador de Badges de Estado Visual
  const renderStatusBadge = (status: AdminTableItem['status'], playersCount: number) => {
    if (status === 'IN_GAME' || status === 'FULL') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          🟢 ACTIVA
        </span>
      );
    }
    if (status === 'WAITING_PLAYERS' || status === 'OPEN') {
      if (playersCount === 0) {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800/80 text-slate-300 border border-slate-700">
            ⚪ SIN JUGADORES
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          🟡 ESPERANDO
        </span>
      );
    }
    if (status === 'PAUSED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          🔵 PAUSADA
        </span>
      );
    }
    if (status === 'EXPIRED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
          🟠 EXPIRADA
        </span>
      );
    }
    if (status === 'TERMINATED' || status === 'CANCELLED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
          🔴 TERMINADA
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-slate-400 border border-slate-800">
        ⚫ CERRADA
      </span>
    );
  };

  return (
    <div className="space-y-6" id="tab-admin-tables-active">
      {/* Banner de Feedback Operativo */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between shadow-lg animate-in fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/80 border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span className="font-medium">{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-white cursor-pointer ml-4"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards — Resumen Métrico de Mesas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-slate-900/90 border-slate-800 p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Mesas Totales</span>
            <TableIcon className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-black text-slate-100 mt-1">{totalTables}</div>
          <span className="text-[10px] text-slate-500 font-mono">En catálogo activo</span>
        </Card>

        <Card className="bg-slate-900/90 border-slate-800 p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Partidas Activas</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-emerald-400 mt-1">{activeGameTables}</div>
          <span className="text-[10px] text-emerald-500/80 font-mono">En juego simultáneo</span>
        </Card>

        <Card className="bg-slate-900/90 border-slate-800 p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>En Espera</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-black text-amber-400 mt-1">{waitingTables}</div>
          <span className="text-[10px] text-amber-500/80 font-mono">Aguardando jugadores</span>
        </Card>

        <Card className="bg-slate-900/90 border-slate-800 p-3.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Sin Jugadores</span>
            <UserX className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-xl font-black text-slate-300 mt-1">{emptyTables}</div>
          <span className="text-[10px] text-slate-500 font-mono">Candidatas a cierre</span>
        </Card>

        <Card className="bg-slate-900/90 border-slate-800 p-3.5 col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pozo Acumulado</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-black text-amber-300 font-mono mt-1">
            {formatBolivares(totalPotAccumulated)}
          </div>
          <span className="text-[10px] text-slate-500 font-mono">En fondos retenidos</span>
        </Card>
      </div>

      {/* Barra de Herramientas y Filtros */}
      <Card id="card-tables-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-tables"
              type="text"
              placeholder="Buscar por código #TRK, juego o creador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            {[
              { id: 'ALL', label: 'Todas' },
              { id: 'ACTIVE', label: '🟢 Activas' },
              { id: 'WAITING', label: '🟡 Esperando' },
              { id: 'EMPTY', label: '⚪ Sin Jugadores' },
              { id: 'EXPIRED', label: '🟠 Expiradas' },
              { id: 'TERMINATED', label: '🔴 Terminadas' },
              { id: 'CLOSED', label: '⚫ Cerradas' },
            ].map((st) => (
              <button
                key={st.id}
                id={`btn-filter-table-${st.id}`}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.label}
              </button>
            ))}

            <Button
              id="btn-trigger-autoclean"
              variant="outline"
              size="sm"
              className="text-xs h-7 ml-auto border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
              onClick={() => setShowAutoCleanModal(true)}
              leftIcon={<Sparkles className="w-3.5 h-3.5" />}
            >
              Limpieza Auto
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabla Principal de Mesas Registradas */}
      <Card
        id="card-tables-table"
        className="bg-slate-900/90 border-slate-800 overflow-hidden"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <TableIcon className="w-4 h-4 text-indigo-400" />
              <span>Monitoreo de Mesas Activas ({filteredTables.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono">Actualización en directo</span>
              <button
                type="button"
                onClick={onRefresh}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Refrescar lista"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Juego</th>
                <th className="py-2.5 px-3">Código Mesa</th>
                <th className="py-2.5 px-3">Jugadores</th>
                <th className="py-2.5 px-3">Entrada / Pozo</th>
                <th className="py-2.5 px-3">Inactividad</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <TableIcon className="w-8 h-8 text-slate-700" />
                      <span>No hay mesas registradas con los filtros seleccionados.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTables.map((t) => {
                  const isClosedOrTerminated = t.status === 'CLOSED' || t.status === 'TERMINATED' || t.status === 'FINISHED' || t.status === 'CANCELLED';

                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Juego */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-100">{t.gameName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {new Date(t.createdAt).toLocaleTimeString('es-VE')}
                        </div>
                      </td>

                      {/* Código de Mesa */}
                      <td className="py-3 px-3">
                        <div className="font-mono font-bold text-amber-300">{t.trackingCode}</div>
                        <div>
                          {t.isPrivate ? (
                            <span className="inline-flex items-center gap-0.5 text-amber-400 text-[10px]">
                              <Lock className="w-2.5 h-2.5" /> Privada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-slate-400 text-[10px]">
                              <Globe className="w-2.5 h-2.5" /> Pública
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Jugadores */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 font-medium text-slate-200">
                          <Users className="w-3.5 h-3.5 text-indigo-400" />
                          <span>
                            {t.currentPlayers} / {t.maxPlayers}
                          </span>
                        </div>
                        {t.playersList && t.playersList.length > 0 && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                            {t.playersList.map((p) => p.userName).join(', ')}
                          </div>
                        )}
                      </td>

                      {/* Entrada / Pozo */}
                      <td className="py-3 px-3">
                        <div className="font-mono text-slate-300 text-[11px]">
                          E: {formatBolivares(t.entryFee)}
                        </div>
                        <div className="font-mono font-bold text-emerald-400">
                          Pozo: {formatBolivares(t.currentPot)}
                        </div>
                      </td>

                      {/* Inactividad */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>
                            {t.inactivityMinutes === 0
                              ? 'Activa ahora'
                              : `${t.inactivityMinutes} min inactiva`}
                          </span>
                        </div>
                      </td>

                      {/* Estado Visual */}
                      <td className="py-3 px-3">{renderStatusBadge(t.status, t.currentPlayers)}</td>

                      {/* Acciones */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botón VER */}
                          <Button
                            id={`btn-view-table-${t.id}`}
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2 border-slate-700 hover:border-slate-600 text-slate-300"
                            onClick={() => setSelectedTable(t)}
                            leftIcon={<Eye className="w-3 h-3" />}
                          >
                            Ver
                          </Button>

                          {/* Botón TERMINAR (Si no está cerrada) */}
                          {!isClosedOrTerminated && (
                            <Button
                              id={`btn-terminate-table-${t.id}`}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 px-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                              onClick={() => {
                                setTerminateTarget(t);
                                setTerminateReason('');
                                setRefundPlayers(t.currentPlayers > 0 && t.entryFee > 0);
                              }}
                              leftIcon={<Ban className="w-3 h-3" />}
                            >
                              Terminar
                            </Button>
                          )}

                          {/* Botón LIMPIAR */}
                          <Button
                            id={`btn-cleanup-table-${t.id}`}
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                            onClick={() => setCleanupTarget(t)}
                            leftIcon={<Trash2 className="w-3 h-3" />}
                          >
                            Limpiar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* MODAL 1: INSPECTOR DETALLADO DE MESA (VER) */}
      {selectedTable && (
        <div
          id="modal-table-inspector"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <TableIcon className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Supervisión de Mesa: <span className="text-amber-300 font-mono">{selectedTable.trackingCode}</span>
                </h3>
              </div>
              <button
                id="btn-close-table-modal"
                type="button"
                onClick={() => setSelectedTable(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block">Juego:</span>
                <span className="font-semibold text-slate-200">{selectedTable.gameName}</span>
              </div>

              <div>
                <span className="text-slate-500 block">Estado:</span>
                <div className="mt-0.5">{renderStatusBadge(selectedTable.status, selectedTable.currentPlayers)}</div>
              </div>

              <div>
                <span className="text-slate-500 block">Entrada Individual:</span>
                <span className="font-mono text-slate-200">{formatBolivares(selectedTable.entryFee)}</span>
              </div>

              <div>
                <span className="text-slate-500 block">Pozo Retenido:</span>
                <span className="font-bold font-mono text-emerald-400">{formatBolivares(selectedTable.currentPot)}</span>
              </div>

              <div>
                <span className="text-slate-500 block">Fecha Creación:</span>
                <span className="text-slate-300 font-mono">
                  {new Date(selectedTable.createdAt).toLocaleString('es-VE')}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Inactividad:</span>
                <span className="text-amber-400 font-mono">
                  {selectedTable.inactivityMinutes === 0
                    ? 'Activa'
                    : `${selectedTable.inactivityMinutes} minutos`}
                </span>
              </div>

              {selectedTable.spectatorsCount !== undefined && (
                <div>
                  <span className="text-slate-500 block">Espectadores:</span>
                  <span className="text-slate-300">{selectedTable.spectatorsCount}</span>
                </div>
              )}

              {selectedTable.currentTurn && (
                <div>
                  <span className="text-slate-500 block">Turno Actual:</span>
                  <span className="text-indigo-400 font-mono">{selectedTable.currentTurn}</span>
                </div>
              )}
            </div>

            {/* Lista de Jugadores Conectados */}
            <div className="space-y-2">
              <span className="text-xs text-slate-300 font-semibold block">
                Jugadores Registrados ({selectedTable.currentPlayers} / {selectedTable.maxPlayers}):
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {selectedTable.playersList && selectedTable.playersList.length > 0 ? (
                  selectedTable.playersList.map((p, idx) => (
                    <div
                      key={p.userId || idx}
                      className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-850 flex justify-between items-center text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            p.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                          }`}
                          title={p.isOnline ? 'Conectado' : 'Desconectado'}
                        />
                        <span className="text-slate-200 font-medium">
                          Asiento {p.seatNumber}: <span className="font-bold">{p.userName}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            p.isReady
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {p.isReady ? 'Listo / Jugando' : 'En espera'}
                        </span>
                        {onDisconnectPlayer && selectedTable.status !== 'CLOSED' && selectedTable.status !== 'TERMINATED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] text-amber-400 border-amber-500/30 hover:bg-amber-500/10 px-2 py-0.5 h-6"
                            onClick={async () => {
                              if (confirm(`¿Desconectar al jugador ${p.userName} de la mesa?`)) {
                                const res = await onDisconnectPlayer(selectedTable.id, p.userId, 'Desconexión por la administración');
                                if (res.success) {
                                  setFeedbackMessage({
                                    type: 'success',
                                    text: `Jugador ${p.userName} desconectado.${res.refunded ? ' Se procesó reembolso de cuota.' : ''}`
                                  });
                                  onRefresh();
                                } else {
                                  setFeedbackMessage({
                                    type: 'error',
                                    text: res.error || 'No se pudo desconectar al jugador'
                                  });
                                }
                              }
                            }}
                          >
                            Desconectar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-xs py-3 text-center bg-slate-950/40 rounded-xl border border-slate-850">
                    Mesa sin jugadores activos.
                  </div>
                )}
              </div>
            </div>

            {/* Acciones Rápidas en Modal */}
            <div className="flex gap-2 pt-3 border-t border-slate-800">
              {selectedTable.status !== 'CLOSED' && selectedTable.status !== 'TERMINATED' && (
                <Button
                  id="btn-inspector-terminate"
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => {
                    setTerminateTarget(selectedTable);
                    setTerminateReason('');
                    setRefundPlayers(selectedTable.currentPlayers > 0 && selectedTable.entryFee > 0);
                  }}
                  leftIcon={<Ban className="w-3.5 h-3.5" />}
                >
                  Terminar Mesa
                </Button>
              )}

              <Button
                id="btn-inspector-cleanup"
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                onClick={() => setCleanupTarget(selectedTable)}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Limpiar Datos Temporales
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMACIÓN DE TERMINAR MESA */}
      {terminateTarget && (
        <div
          id="modal-table-terminate-confirm"
          className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3 text-red-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-slate-100 text-sm">
                  Terminar Mesa #{terminateTarget.trackingCode}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">Control Administrativo Server-Side</p>
              </div>
            </div>

            {/* Advertencias según jugadores */}
            {terminateTarget.currentPlayers > 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>MESA CON JUGADORES ACTIVOS ({terminateTarget.currentPlayers})</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Esta mesa tiene jugadores en sala o partida. Terminarla interrumpirá la sesión.
                  Se requiere autorización explicita y motivo administrativo para proceder.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300">
                Esta mesa no tiene jugadores activos. Se marcará como{' '}
                <strong className="text-slate-100">CERRADA / TERMINADA</strong> y no aceptará nuevas
                uniones ni movimientos.
              </div>
            )}

            {/* Motivo de terminación (obligatorio) */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-semibold block">
                Motivo de Terminación <span className="text-red-400">*</span>:
              </label>
              <input
                id="input-terminate-reason"
                type="text"
                placeholder="Ej. Inactividad prolongada, mantenimiento o soporte técnico..."
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Reembolso opcional si aplica */}
            {terminateTarget.currentPlayers > 0 && terminateTarget.entryFee > 0 && (
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={refundPlayers}
                  onChange={(e) => setRefundPlayers(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>Reembolsar cuota de entrada ({formatBolivares(terminateTarget.entryFee)}) a los jugadores</span>
              </label>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                id="btn-cancel-terminate"
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-slate-800 text-slate-400"
                onClick={() => setTerminateTarget(null)}
                disabled={actionLoading}
              >
                Cancelar
              </Button>

              <Button
                id="btn-confirm-terminate"
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-red-400 border-red-500/40 hover:bg-red-500/10 font-bold"
                isLoading={actionLoading}
                onClick={handleConfirmTerminate}
                leftIcon={<Ban className="w-3.5 h-3.5" />}
              >
                Terminar Mesa
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIRMACIÓN DE LIMPIEZA DE DATOS TEMPORALES */}
      {cleanupTarget && (
        <div
          id="modal-table-cleanup-confirm"
          className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3 text-amber-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-slate-100 text-sm">
                  Limpiar Mesa #{cleanupTarget.trackingCode}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">Depuración de Datos Efímeros</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                Esta acción depurará únicamente <strong className="text-amber-300">datos temporales</strong>{' '}
                asociados a la mesa (presencia efímera, sesiones desconectadas y bloqueos temporales).
              </p>
              <div className="text-[11px] text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                ✓ El historial financiero, el saldo de los monederos, el ledger y la auditoría permanecerán inalterados.
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                id="btn-cancel-cleanup"
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-slate-800 text-slate-400"
                onClick={() => setCleanupTarget(null)}
                disabled={actionLoading}
              >
                Cancelar
              </Button>

              <Button
                id="btn-confirm-cleanup"
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-amber-400 border-amber-500/40 hover:bg-amber-500/10 font-bold"
                isLoading={actionLoading}
                onClick={handleConfirmCleanup}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Ejecutar Limpieza
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: LIMPIEZA AUTOMÁTICA MASIVA */}
      {showAutoCleanModal && (
        <div
          id="modal-autoclean-policy"
          className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3 text-amber-400">
              <Sparkles className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-slate-100 text-sm">
                  Política de Limpieza Automática de Mesas
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">Depuración de salas inactivas o abandonadas</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p className="leading-relaxed">
                El sistema identificará mesas en estado <strong className="text-amber-300">ESPERANDO / ABIERTA</strong>{' '}
                que no posean jugadores activos y cuya inactividad supere el umbral configurado.
              </p>

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-slate-200 block">
                  Umbral de Inactividad (Minutos):
                </label>
                <select
                  value={autoCleanInactiveMinutes}
                  onChange={(e) => setAutoCleanInactiveMinutes(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value={5}>5 Minutos (Agresivo)</option>
                  <option value={15}>15 Minutos (Recomendado)</option>
                  <option value={30}>30 Minutos</option>
                  <option value={60}>60 Minutos (Conservador)</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                id="btn-cancel-autoclean-modal"
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-slate-800 text-slate-400"
                onClick={() => setShowAutoCleanModal(false)}
                disabled={actionLoading}
              >
                Cancelar
              </Button>

              <Button
                id="btn-confirm-autoclean-modal"
                variant="outline"
                size="sm"
                className="flex-1 text-xs text-amber-400 border-amber-500/40 hover:bg-amber-500/10 font-bold"
                isLoading={actionLoading}
                onClick={handleConfirmAutoClean}
                leftIcon={<Sparkles className="w-3.5 h-3.5" />}
              >
                Ejecutar Política
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
