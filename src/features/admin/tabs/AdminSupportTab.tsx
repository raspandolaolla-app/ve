// ==============================================================================
// RASPANDO LA OLLA — TAB 9: CENTRO DE ATENCIÓN Y TICKETS DE SOPORTE
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { sanitizeUserErrorMessage } from '../../../utils/errorSanitizer';
import type { AdminSupportTicketItem } from '../../../types/admin';
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Send,
  X,
} from 'lucide-react';

interface AdminSupportTabProps {
  tickets: AdminSupportTicketItem[];
  onUpdateStatus: (ticketId: string, status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED') => Promise<{ success: boolean; error?: string }>;
  onRefresh: () => void;
}

export function AdminSupportTab({ tickets, onUpdateStatus, onRefresh }: AdminSupportTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<AdminSupportTicketItem | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = async (newStatus: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED') => {
    if (!selectedTicket) return;
    setActionLoading(true);
    try {
      const res = await onUpdateStatus(selectedTicket.id, newStatus);
      if (res.success) {
        setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null));
        onRefresh();
      } else {
        alert(sanitizeUserErrorMessage(res.error, 'No fue posible actualizar el estado del ticket.'));
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-support">
      {/* Filtros */}
      <Card id="card-support-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-support"
              type="text"
              placeholder="Buscar por usuario o asunto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((st) => (
              <button
                key={st}
                id={`btn-filter-ticket-${st}`}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'ALL' ? 'Todos' : st === 'OPEN' ? 'Abiertos' : st === 'IN_PROGRESS' ? 'En Atención' : st === 'RESOLVED' ? 'Resueltos' : 'Cerrados'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Tabla de Tickets */}
      <Card
        id="card-support-table"
        className="bg-slate-900/90 border-slate-800 overflow-hidden"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <MessageSquare className="w-4 h-4 text-pink-400" />
              <span>Tickets de Soporte ({filteredTickets.length})</span>
            </div>
            <span className="text-xs text-slate-500">Atención al Jugador</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3">Usuario</th>
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3">Asunto</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No hay tickets con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {new Date(t.createdAt).toLocaleDateString('es-VE')}
                    </td>

                    <td className="py-3 px-3 font-semibold text-slate-200">{t.userName}</td>

                    <td className="py-3 px-3">
                      <span className="bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                        {t.category}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-300 max-w-xs truncate">{t.subject}</td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.status === 'OPEN'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : t.status === 'IN_PROGRESS'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                            : t.status === 'RESOLVED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <Button
                        id={`btn-view-ticket-${t.id}`}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => setSelectedTicket(t)}
                        leftIcon={<Eye className="w-3 h-3" />}
                      >
                        Atender
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Atención de Ticket */}
      {selectedTicket && (
        <div
          id="modal-support-ticket"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">{selectedTicket.subject}</h3>
                <span className="text-xs text-slate-400">Usuario: {selectedTicket.userName}</span>
              </div>
              <button
                id="btn-close-ticket-modal"
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-850 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Categoría: <strong className="text-slate-200">{selectedTicket.category}</strong></span>
                <span>{new Date(selectedTicket.createdAt).toLocaleString('es-VE')}</span>
              </div>
              <p className="text-slate-200 leading-relaxed">{selectedTicket.description}</p>
            </div>

            {/* Cambiar Estado */}
            <div className="pt-2 space-y-2 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-300 block">Actualizar Estado:</span>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  id="btn-ticket-in-progress"
                  variant="outline"
                  size="sm"
                  className="text-xs text-blue-400 border-blue-500/30"
                  isLoading={actionLoading}
                  onClick={() => handleStatusChange('IN_PROGRESS')}
                >
                  En Atención
                </Button>
                <Button
                  id="btn-ticket-resolve"
                  variant="outline"
                  size="sm"
                  className="text-xs text-emerald-400 border-emerald-500/30"
                  isLoading={actionLoading}
                  onClick={() => handleStatusChange('RESOLVED')}
                >
                  Resolver
                </Button>
                <Button
                  id="btn-ticket-close"
                  variant="outline"
                  size="sm"
                  className="text-xs text-slate-400 border-slate-700"
                  isLoading={actionLoading}
                  onClick={() => handleStatusChange('CLOSED')}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
