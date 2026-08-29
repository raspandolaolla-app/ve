// ==============================================================================
// RASPANDO LA OLLA — TAB 11: REGISTRO DE AUDITORÍA FORENSE Y MESAS BLOQUEADAS
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import type { AdminAuditLogItem, AdminTableItem } from '../../../types/admin';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import {
  ShieldAlert,
  Search,
  Lock,
  Eye,
  RefreshCw,
  FileCheck2,
  Table,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  X,
  Info,
  ShieldCheck,
} from 'lucide-react';

interface AdminAuditTabProps {
  logs: AdminAuditLogItem[];
  tables?: AdminTableItem[];
  onRefresh: () => void;
}

export function AdminAuditTab({ logs, tables = [], onRefresh }: AdminAuditTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'LOGS' | 'BLOCKED_TABLES'>('LOGS');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogItem | null>(null);

  // Estados Limpieza de Mesa Individual
  const [selectedCleanupTable, setSelectedCleanupTable] = useState<AdminTableItem | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResultMsg, setCleanupResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtrado de Logs
  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.resourceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.resourceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.actorEmail && l.actorEmail.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesAction = actionFilter === 'ALL' || l.action.includes(actionFilter);
    return matchesSearch && matchesAction;
  });

  // Mesas problemáticas detectadas automáticamente
  const problematicTables = tables.filter((t) => Boolean(t.isProblematic) || t.currentPlayers === 0);
  const strictBlockedTables = tables.filter((t) => Boolean(t.isProblematic));

  // Ejecutar Limpieza Masiva de Mesas
  const handleExecuteCleanupAllTables = async () => {
    setIsCleaning(true);
    setCleanupResultMsg(null);
    try {
      const res = await AdminRepository.cleanupAllInvalidTables();
      if (res.success) {
        setCleanupResultMsg({
          type: 'success',
          text: `Limpieza masiva ejecutada exitosamente. ${res.cleanedCount || 0} mesas con inconsistencias fueron cerradas y saneadas.`,
        });
        onRefresh();
      } else {
        setCleanupResultMsg({
          type: 'error',
          text: res.error || 'Error al ejecutar la limpieza masiva de mesas.',
        });
      }
    } catch (err: any) {
      setCleanupResultMsg({
        type: 'error',
        text: err?.message || 'Error durante la limpieza masiva.',
      });
    } finally {
      setIsCleaning(false);
    }
  };

  // Ejecutar Limpieza de Mesa Individual
  const handleExecuteSingleTableCleanup = async (table: AdminTableItem) => {
    setIsCleaning(true);
    setCleanupResultMsg(null);
    try {
      const res = await AdminRepository.cleanupTable(table.id);
      if (res.success) {
        setCleanupResultMsg({
          type: 'success',
          text: `Mesa #${table.trackingCode} limpiada exitosamente. Asientos liberados, estado actualizado y balances reajustados.`,
        });
        setSelectedCleanupTable(null);
        onRefresh();
      } else {
        setCleanupResultMsg({
          type: 'error',
          text: res.error || 'Error al ejecutar la limpieza de la mesa.',
        });
      }
    } catch (err: any) {
      setCleanupResultMsg({
        type: 'error',
        text: err?.message || 'Error durante la operación de limpieza.',
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-audit">
      {/* Navegación Superior de Auditoría */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            id="btn-subtab-logs"
            type="button"
            onClick={() => setActiveSubTab('LOGS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'LOGS'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Eventos de Auditoría ({logs.length})</span>
          </button>

          <button
            id="btn-subtab-blocked-tables"
            type="button"
            onClick={() => setActiveSubTab('BLOCKED_TABLES')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'BLOCKED_TABLES'
                ? 'bg-red-500 text-white shadow-md'
                : strictBlockedTables.length > 0
                ? 'bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/60'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <ShieldAlert className={`w-4 h-4 ${strictBlockedTables.length > 0 ? 'animate-pulse text-red-300' : ''}`} />
            <span>Mesas Bloqueadas ({strictBlockedTables.length})</span>
          </button>
        </div>

        <Button
          id="btn-refresh-audit-main"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="text-xs h-8 px-3 text-slate-300 border-slate-700 hover:bg-slate-800"
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Actualizar Datos
        </Button>
      </div>

      {/* Feedback Alert */}
      {cleanupResultMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            cleanupResultMsg.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/40 border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {cleanupResultMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{cleanupResultMsg.text}</span>
          </div>
          <button type="button" onClick={() => setCleanupResultMsg(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VISTA 1: REGISTRO DE LOGS DE AUDITORÍA */}
      {activeSubTab === 'LOGS' && (
        <div className="space-y-6">
          {/* Banner de Inmutabilidad Criptográfica */}
          <div
            id="banner-audit-immutability"
            className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2 text-amber-300">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Registro Forense Protegido:</strong> Las entradas de auditoría son inmutables (modificación y eliminación prohibidas a nivel de sistema).
              </span>
            </div>
          </div>

          {/* Filtros */}
          <Card id="card-audit-filter" className="bg-slate-900/90 border-slate-800">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="input-search-audit"
                  type="text"
                  placeholder="Buscar por acción, actor o recurso..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                {(['ALL', 'DEPOSIT', 'WITHDRAWAL', 'USER', 'ROLE', 'TABLE', 'SETTING'] as const).map((af) => (
                  <button
                    key={af}
                    id={`btn-filter-audit-${af}`}
                    type="button"
                    onClick={() => setActionFilter(af)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                      actionFilter === af
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {af === 'ALL'
                      ? 'Todas'
                      : af === 'DEPOSIT'
                      ? 'Recargas'
                      : af === 'WITHDRAWAL'
                      ? 'Retiros'
                      : af === 'USER'
                      ? 'Usuarios'
                      : af === 'ROLE'
                      ? 'Roles'
                      : af === 'TABLE'
                      ? 'Mesas'
                      : 'Ajustes'}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Tabla de Logs */}
          <Card
            id="card-audit-table"
            className="bg-slate-900/90 border-slate-800 overflow-hidden"
            header={
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                  <FileCheck2 className="w-4 h-4 text-emerald-400" />
                  <span>Eventos Registrados ({filteredLogs.length})</span>
                </div>
                <span className="text-xs text-slate-500">Trazabilidad Total</span>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Fecha y Hora</th>
                    <th className="py-2.5 px-3">Actor</th>
                    <th className="py-2.5 px-3">Acción</th>
                    <th className="py-2.5 px-3">Recurso</th>
                    <th className="py-2.5 px-3">Severidad</th>
                    <th className="py-2.5 px-3 text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No hay eventos de auditoría que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                          {new Date(l.createdAt).toLocaleString('es-VE')}
                        </td>
                        <td className="py-3 px-3 text-slate-300 font-medium">
                          {l.actorEmail || l.actorId.substring(0, 8)}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono text-amber-400 font-semibold">{l.action}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                          {l.resourceType} ({l.resourceId.substring(0, 8)})
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              l.severity === 'CRITICAL'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                : l.severity === 'WARNING'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            }`}
                          >
                            {l.severity || 'INFO'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedLog(l)}
                            className="text-[11px] h-6 px-2 text-slate-400 hover:text-white border-slate-700"
                            leftIcon={<Eye className="w-3 h-3" />}
                          >
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* VISTA 2: AUDITORÍA DE MESAS BLOQUEADAS */}
      {activeSubTab === 'BLOCKED_TABLES' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3 text-red-300">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <strong className="block text-slate-100 text-sm">Detección Automática de Mesas Bloqueadas & Inconsistencias</strong>
                <span className="text-slate-400">
                  Escanea activamente jugadores duplicados, discrepancias de contadores y mesas fantasmas abandonadas.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                id="btn-cleanup-all-invalid-tables"
                variant="outline"
                size="sm"
                disabled={isCleaning}
                onClick={handleExecuteCleanupAllTables}
                className="bg-red-950/40 border-red-500/50 text-red-300 hover:bg-red-900/60 text-xs h-8 px-3"
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                {isCleaning ? 'Limpiando...' : 'Limpiar Mesas Inválidas'}
              </Button>
              <span className="px-3 py-1.5 bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg text-xs font-mono font-bold">
                {strictBlockedTables.length} Bloqueadas
              </span>
            </div>
          </div>

          <Card className="bg-slate-900/90 border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3">Mesa / Código</th>
                    <th className="py-2.5 px-3">Juego</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-3">Jugadores Activos</th>
                    <th className="py-2.5 px-3">Diagnóstico de Problema</th>
                    <th className="py-2.5 px-3 text-right">Acción de Limpieza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {problematicTables.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ShieldCheck className="w-8 h-8 text-emerald-400" />
                          <span className="font-bold text-slate-200">¡Sistema 100% Limpio!</span>
                          <span className="text-slate-500 text-[11px]">
                            No hay mesas bloqueadas, jugadores duplicados ni incoherencias detectadas.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    problematicTables.map((t) => (
                      <tr
                        key={t.id}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          t.isProblematic ? 'bg-red-950/20 border-l-2 border-l-red-500' : ''
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="font-mono text-slate-200 font-bold">#{t.trackingCode}</div>
                          <div className="text-[10px] text-slate-500 font-mono">ID: {t.id.substring(0, 8)}...</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-200">{t.gameName}</span>
                          <div className="text-[10px] text-slate-500">Entrada: {t.entryFee} VES</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.status === 'IN_GAME'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono text-slate-200 font-bold">
                            {t.currentPlayers} / {t.maxPlayers}
                          </span>
                          {t.duplicatePlayers && t.duplicatePlayers.length > 0 && (
                            <div className="text-[10px] text-red-400 font-bold">
                              ⚠️ Duplicados: {t.duplicatePlayers.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {t.problemReasons && t.problemReasons.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-300 font-mono">
                              {t.problemReasons.map((r, idx) => (
                                <li key={idx}>{r}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-[11px] text-slate-400">Mesa vacía sin jugadores activos</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            id={`btn-audit-clean-table-${t.id}`}
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCleanupTable(t)}
                            className="text-xs h-7 px-2.5 border-red-500/50 bg-red-500/10 text-red-300 hover:bg-red-500/20 font-bold"
                            leftIcon={<Trash2 className="w-3.5 h-3.5 text-red-400" />}
                          >
                            LIMPIAR MESA
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL DE INSPECCIÓN Y CONFIRMACIÓN PRE-LIMPIEZA DE MESA */}
      {selectedCleanupTable && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-red-400">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Limpieza de Mesa Individual #{selectedCleanupTable.trackingCode}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCleanupTable(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inspección detallada */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs space-y-2">
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[10px]">Juego:</span>
                  <strong className="text-slate-100">{selectedCleanupTable.gameName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Estado Actual:</span>
                  <strong className="text-slate-100">{selectedCleanupTable.status}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Jugadores Activos:</span>
                  <strong className="text-slate-100">
                    {selectedCleanupTable.currentPlayers} / {selectedCleanupTable.maxPlayers}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Costo de Entrada:</span>
                  <strong className="text-slate-100">{selectedCleanupTable.entryFee} VES</strong>
                </div>
              </div>

              {selectedCleanupTable.problemReasons && selectedCleanupTable.problemReasons.length > 0 && (
                <div className="border-t border-slate-800 pt-2 text-red-300 space-y-1 text-[11px]">
                  <strong className="text-red-400 block font-mono">Alertas Detectadas:</strong>
                  <ul className="list-disc list-inside space-y-0.5">
                    {selectedCleanupTable.problemReasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Garantía de Seguridad de Datos */}
            <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-[11px] text-amber-200 space-y-1">
              <strong className="flex items-center gap-1.5 text-amber-300">
                <Info className="w-3.5 h-3.5" />
                Garantías Estrictas de Limpieza:
              </strong>
              <ul className="list-disc list-inside space-y-0.5 text-[10px] text-amber-300/80">
                <li>NO se borrarán usuarios ni perfiles de la plataforma.</li>
                <li>NO se alterarán ni descontarán saldos reales de billetera.</li>
                <li>NO se borrará el libro mayor (ledger) ni historial de transacciones.</li>
                <li>NO se afectará ninguna otra mesa ni partida activa legítima.</li>
                <li>Libera únicamente los asientos retenidos de esta mesa y la marca TERMINATED.</li>
              </ul>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-slate-300 border-slate-700"
                onClick={() => setSelectedCleanupTable(null)}
                disabled={isCleaning}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1 font-bold bg-red-600 hover:bg-red-500 text-white"
                onClick={() => handleExecuteSingleTableCleanup(selectedCleanupTable)}
                disabled={isCleaning}
                leftIcon={isCleaning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              >
                {isCleaning ? 'Limpiando Mesa...' : 'Confirmar Limpieza'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle de Log */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm">Detalle de Evento de Auditoría</h3>
              <button type="button" onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-850">
              <div><span className="text-slate-500">ID Evento:</span> {selectedLog.id}</div>
              <div><span className="text-slate-500">Fecha/Hora:</span> {new Date(selectedLog.createdAt).toLocaleString('es-VE')}</div>
              <div><span className="text-slate-500">Actor ID:</span> {selectedLog.actorId}</div>
              <div><span className="text-slate-500">Actor Email:</span> {selectedLog.actorEmail || 'N/A'}</div>
              <div><span className="text-slate-500">Acción:</span> {selectedLog.action}</div>
              <div><span className="text-slate-500">Recurso:</span> {selectedLog.resourceType} ({selectedLog.resourceId})</div>
            </div>

            {selectedLog.metadata && (
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">Metadatos de Contexto:</span>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-[11px] text-amber-300 font-mono overflow-x-auto max-h-40">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            )}

            <div className="pt-2 text-right">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="text-xs border-slate-700 text-slate-300"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
