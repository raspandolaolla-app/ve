// ==============================================================================
// RASPANDO LA OLLA — TAB 6: SUPERVISIÓN DE MESAS MULTIJUGADOR
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { formatBolivares } from '../../../utils/formatters';
import type { AdminTableItem } from '../../../types/admin';
import {
  Table,
  Search,
  Users,
  Lock,
  Globe,
  AlertTriangle,
  XCircle,
  Eye,
  RefreshCw,
  X,
} from 'lucide-react';

interface AdminTablesTabProps {
  tables: AdminTableItem[];
  onCancelTable: (tableId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onRefresh: () => void;
}

export function AdminTablesTab({ tables, onCancelTable, onRefresh }: AdminTablesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTable, setSelectedTable] = useState<AdminTableItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const filteredTables = tables.filter((t) => {
    const matchesSearch =
      t.trackingCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.gameName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCancelTable = async (tableId: string) => {
    const reason = cancelReason.trim() || 'Cancelación administrativa por mantenimiento o solicitud de soporte';
    if (!window.confirm('¿Seguro que desea cancelar esta mesa y reembolsar a los jugadores inscritos?')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await onCancelTable(tableId, reason);
      if (res.success) {
        setSelectedTable(null);
        setCancelReason('');
        onRefresh();
      } else {
        alert(res.error || 'Error al cancelar la mesa.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-tables">
      {/* Filtros */}
      <Card id="card-tables-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-tables"
              type="text"
              placeholder="Buscar por TRK, juego o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {(['ALL', 'WAITING_PLAYERS', 'IN_GAME', 'FINISHED', 'CANCELLED'] as const).map((st) => (
              <button
                key={st}
                id={`btn-filter-table-${st}`}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'ALL'
                  ? 'Todas'
                  : st === 'WAITING_PLAYERS'
                  ? 'Esperando'
                  : st === 'IN_GAME'
                  ? 'En Juego'
                  : st === 'FINISHED'
                  ? 'Finalizadas'
                  : 'Canceladas'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Tabla de Mesas */}
      <Card
        id="card-tables-table"
        className="bg-slate-900/90 border-slate-800 overflow-hidden"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <Table className="w-4 h-4 text-indigo-400" />
              <span>Mesas Registradas ({filteredTables.length})</span>
            </div>
            <span className="text-xs text-slate-500">Supervisión de Salas en Directo</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Código TRK</th>
                <th className="py-2.5 px-3">Juego</th>
                <th className="py-2.5 px-3">Entrada</th>
                <th className="py-2.5 px-3">Pozo Acumulado</th>
                <th className="py-2.5 px-3">Jugadores</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredTables.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No hay mesas con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredTables.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-amber-300">
                      {t.trackingCode}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-200">{t.gameName}</div>
                      <div className="text-[10px] text-slate-500">{new Date(t.createdAt).toLocaleTimeString('es-VE')}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-semibold text-slate-300">
                      {formatBolivares(t.entryFee)}
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                      {formatBolivares(t.currentPot)}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        <span>
                          {t.currentPlayers} / {t.maxPlayers}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {t.isPrivate ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 text-[10px]">
                          <Lock className="w-3 h-3" /> Privada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 text-[10px]">
                          <Globe className="w-3 h-3" /> Pública
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.status === 'IN_GAME'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                            : t.status === 'WAITING_PLAYERS'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : t.status === 'FINISHED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {t.status === 'IN_GAME'
                          ? 'EN JUEGO'
                          : t.status === 'WAITING_PLAYERS'
                          ? 'ESPERANDO'
                          : t.status === 'FINISHED'
                          ? 'FINALIZADA'
                          : 'CANCELADA'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <Button
                        id={`btn-view-table-${t.id}`}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => setSelectedTable(t)}
                        leftIcon={<Eye className="w-3 h-3" />}
                      >
                        Supervisar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Supervisión de Mesa */}
      {selectedTable && (
        <div
          id="modal-table-inspector"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Table className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  Supervisión de Mesa: {selectedTable.trackingCode}
                </h3>
              </div>
              <button
                id="btn-close-table-modal"
                type="button"
                onClick={() => setSelectedTable(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Juego</span>
                <span className="font-semibold text-slate-200">{selectedTable.gameName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Entrada</span>
                <span className="font-mono text-slate-200">{formatBolivares(selectedTable.entryFee)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Pozo Total</span>
                <span className="font-bold font-mono text-emerald-400">{formatBolivares(selectedTable.currentPot)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Estado</span>
                <span className="font-semibold text-slate-200">{selectedTable.status}</span>
              </div>

              {/* Jugadores Sentados */}
              <div className="pt-2">
                <span className="text-slate-400 block mb-1.5 font-semibold">Jugadores Conectados:</span>
                <div className="space-y-1">
                  {selectedTable.playersList && selectedTable.playersList.length > 0 ? (
                    selectedTable.playersList.map((p, idx) => (
                      <div
                        key={p.userId || idx}
                        className="bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-850 flex justify-between items-center"
                      >
                        <span className="text-slate-200 font-medium">
                          Asiento {p.seatNumber}: {p.userName}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold">
                          {p.isReady ? 'Listo' : 'En espera'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="text-slate-500 text-xs">Sin jugadores registrados aún.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Cancelación Administrativa */}
            {(selectedTable.status === 'WAITING_PLAYERS' || selectedTable.status === 'IN_GAME') && (
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <input
                  id="input-cancel-table-reason"
                  type="text"
                  placeholder="Motivo de cancelación de la mesa..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />

                <Button
                  id="btn-confirm-cancel-table"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                  isLoading={actionLoading}
                  onClick={() => handleCancelTable(selectedTable.id)}
                  leftIcon={<XCircle className="w-3.5 h-3.5" />}
                >
                  Cancelar Mesa y Reembolsar
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
