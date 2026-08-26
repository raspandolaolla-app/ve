// ==============================================================================
// RASPANDO LA OLLA — TAB 3: RECARGAS Y DEPÓSITOS (RPC IDEMPOTENTE)
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { formatBolivares } from '../../../utils/formatters';
import type { AdminDepositItem } from '../../../types/admin';
import {
  ArrowDownLeft,
  Check,
  X,
  Search,
  Eye,
  ShieldCheck,
  AlertCircle,
  FileText,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface AdminDepositsTabProps {
  deposits: AdminDepositItem[];
  onApproveDeposit: (depositId: string) => Promise<{ success: boolean; error?: string }>;
  onRejectDeposit: (depositId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onRefresh: () => void;
}

export function AdminDepositsTab({
  deposits,
  onApproveDeposit,
  onRejectDeposit,
  onRefresh,
}: AdminDepositsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedDeposit, setSelectedDeposit] = useState<AdminDepositItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);

  const filteredDeposits = deposits.filter((d) => {
    const matchesSearch =
      d.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.originPhone.includes(searchTerm);

    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleApprove = async (depositId: string) => {
    if (!window.confirm('¿Confirmar la aprobación y acreditación de fondos en la billetera del usuario?')) {
      return;
    }
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await onApproveDeposit(depositId);
      if (res.success) {
        setActionResult({
          success: true,
          message: 'Recarga aprobada exitosamente. Fondos acreditados en la cuenta del usuario.',
        });
        setSelectedDeposit(null);
        onRefresh();
      } else {
        setActionResult({ success: false, message: res.error || 'Error al aprobar recarga.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (depositId: string) => {
    const reason = rejectReason.trim() || 'Referencia bancaria no localizada o comprobante inválido';
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await onRejectDeposit(depositId, reason);
      if (res.success) {
        setActionResult({ success: true, message: 'Recarga rechazada y registrada en auditoría.' });
        setSelectedDeposit(null);
        setRejectReason('');
        onRefresh();
      } else {
        setActionResult({ success: false, message: res.error || 'Error al rechazar recarga.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-deposits">
      {/* Banner de Feedback */}
      {actionResult && (
        <div
          id="alert-deposit-feedback"
          className={`p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
            actionResult.success
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-red-950/40 border-red-800 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionResult.success ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
            <span>{actionResult.message}</span>
          </div>
          <button type="button" onClick={() => setActionResult(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Barra de Filtros */}
      <Card id="card-deposits-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-deposits"
              type="text"
              placeholder="Buscar por referencia, usuario, teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => (
              <button
                key={st}
                id={`btn-filter-deposit-${st}`}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'PENDING' ? 'Pendientes' : st === 'APPROVED' ? 'Aprobadas' : st === 'REJECTED' ? 'Rechazadas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Tabla de Recargas */}
      <Card
        id="card-deposits-table"
        className="bg-slate-900/90 border-slate-800 overflow-hidden"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
              <span>Solicitudes de Recarga ({filteredDeposits.length})</span>
            </div>
            <span className="text-xs text-slate-500">Acreditación Directa en Ledger</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3">Usuario</th>
                <th className="py-2.5 px-3">Monto</th>
                <th className="py-2.5 px-3">Banco / Teléfono</th>
                <th className="py-2.5 px-3">Referencia</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredDeposits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No hay solicitudes de recarga que coincidan con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filteredDeposits.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString('es-VE') : d.paymentDate}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-200">{d.userName}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                      {formatBolivares(d.amount)}
                    </td>

                    <td className="py-3 px-3 text-slate-300">
                      <div>Banco: <span className="font-mono">{d.originBankCode}</span></div>
                      <div className="text-[11px] text-slate-400 font-mono">{d.originPhone}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-semibold text-amber-300">
                      {d.referenceNumber}
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          d.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : d.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {d.status === 'APPROVED' ? 'APROBADA' : d.status === 'PENDING' ? 'PENDIENTE' : 'RECHAZADA'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          id={`btn-view-deposit-${d.id}`}
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 px-2"
                          onClick={() => setSelectedDeposit(d)}
                          leftIcon={<Eye className="w-3 h-3" />}
                        >
                          Ver
                        </Button>

                        {d.status === 'PENDING' && (
                          <Button
                            id={`btn-approve-deposit-${d.id}`}
                            variant="primary"
                            size="sm"
                            className="text-xs h-7 px-2.5"
                            isLoading={actionLoading}
                            onClick={() => handleApprove(d.id)}
                            leftIcon={<Check className="w-3 h-3" />}
                          >
                            Aprobar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Detalle y Aprobación/Rechazo */}
      {selectedDeposit && (
        <div
          id="modal-deposit-details"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">Detalle de Recarga</h3>
              </div>
              <button
                id="btn-close-deposit-modal"
                type="button"
                onClick={() => setSelectedDeposit(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Usuario</span>
                <span className="font-semibold text-slate-200">{selectedDeposit.userName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Monto Solicitado</span>
                <span className="font-bold font-mono text-emerald-400 text-sm">
                  {formatBolivares(selectedDeposit.amount)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Referencia Bancaria</span>
                <span className="font-mono font-semibold text-amber-300">
                  {selectedDeposit.referenceNumber}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Banco de Origen</span>
                <span className="font-mono text-slate-300">{selectedDeposit.originBankCode}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Teléfono Emisor</span>
                <span className="font-mono text-slate-300">{selectedDeposit.originPhone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Estado Actual</span>
                <span className="font-semibold text-slate-200">{selectedDeposit.status}</span>
              </div>

              {selectedDeposit.receiptUrl && (
                <div className="pt-2">
                  <span className="text-slate-400 block mb-1">Comprobante Adjunto</span>
                  <a
                    href={selectedDeposit.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Ver Imagen / Comprobante</span>
                  </a>
                </div>
              )}
            </div>

            {selectedDeposit.status === 'PENDING' && (
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <input
                  id="input-reject-reason"
                  type="text"
                  placeholder="Motivo de rechazo si no procede..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />

                <div className="flex gap-2">
                  <Button
                    id="btn-modal-reject-deposit"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                    isLoading={actionLoading}
                    onClick={() => handleReject(selectedDeposit.id)}
                    leftIcon={<X className="w-3.5 h-3.5" />}
                  >
                    Rechazar
                  </Button>
                  <Button
                    id="btn-modal-approve-deposit"
                    variant="primary"
                    size="sm"
                    className="flex-1 text-xs"
                    isLoading={actionLoading}
                    onClick={() => handleApprove(selectedDeposit.id)}
                    leftIcon={<Check className="w-3.5 h-3.5" />}
                  >
                    Aprobar y Acreditar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
