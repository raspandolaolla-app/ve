// ==============================================================================
// RASPANDO LA OLLA — TAB 11: REGISTRO DE AUDITORÍA FORENSE INMUTABLE
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import type { AdminAuditLogItem } from '../../../types/admin';
import {
  ShieldAlert,
  Search,
  Lock,
  Eye,
  RefreshCw,
  Code,
  X,
  FileCheck2,
} from 'lucide-react';

interface AdminAuditTabProps {
  logs: AdminAuditLogItem[];
  onRefresh: () => void;
}

export function AdminAuditTab({ logs, onRefresh }: AdminAuditTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogItem | null>(null);

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.resourceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.resourceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.actorEmail && l.actorEmail.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesAction = actionFilter === 'ALL' || l.action.includes(actionFilter);
    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-6" id="tab-admin-audit">
      {/* Banner de Inmutabilidad Criptográfica */}
      <div
        id="banner-audit-immutability"
        className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs"
      >
        <div className="flex items-center gap-2 text-amber-300">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Registro Forense Protegido:</strong> Las entradas de auditoría están protegidas por triggers inmutables en PostgreSQL (UPDATE/DELETE prohibidos a nivel de base de datos).
          </span>
        </div>
        <Button
          id="btn-refresh-audit-logs"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="text-xs h-7 px-2.5 text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
          leftIcon={<RefreshCw className="w-3 h-3" />}
        >
          Actualizar
        </Button>
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

          <div className="flex items-center gap-2 w-full md:w-auto">
            {(['ALL', 'DEPOSIT', 'WITHDRAWAL', 'USER', 'ROLE', 'TABLE', 'SETTING'] as const).map((af) => (
              <button
                key={af}
                id={`btn-filter-audit-${af}`}
                type="button"
                onClick={() => setActionFilter(af)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-200">{l.actorRole}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{l.actorEmail}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-semibold text-slate-200">
                      {l.action}
                    </td>

                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {l.resourceType}:{l.resourceId.slice(0, 8)}
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          l.severity === 'CRITICAL' || l.severity === 'SECURITY_ALERT'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                            : l.severity === 'WARNING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {l.severity}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <Button
                        id={`btn-view-audit-${l.id}`}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => setSelectedLog(l)}
                        leftIcon={<Code className="w-3 h-3 text-amber-400" />}
                      >
                        JSON
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Metadatos JSON */}
      {selectedLog && (
        <div
          id="modal-audit-payload"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-sm">Metadatos del Evento</h3>
              </div>
              <button
                id="btn-close-audit-modal"
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <pre className="bg-slate-950 p-4 rounded-xl text-[11px] font-mono text-emerald-400 overflow-x-auto border border-slate-850 max-h-72">
              {JSON.stringify(selectedLog, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
