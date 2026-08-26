// ==============================================================================
// RASPANDO LA OLLA — TAB 4: RETIROS Y LIQUIDACIÓN BANCARIA (RPC PROTEGIDO)
// ==============================================================================

import { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { formatBolivares } from '../../../utils/formatters';
import type { AdminWithdrawalItem } from '../../../types/admin';
import {
  ArrowUpRight,
  Check,
  X,
  Search,
  Eye,
  AlertCircle,
  Building,
  CreditCard,
  Phone,
  User,
} from 'lucide-react';

interface AdminWithdrawalsTabProps {
  withdrawals: AdminWithdrawalItem[];
  onCompleteWithdrawal: (withdrawalId: string, bankReference: string) => Promise<{ success: boolean; error?: string }>;
  onRejectWithdrawal: (withdrawalId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  onRefresh: () => void;
}

export function AdminWithdrawalsTab({
  withdrawals,
  onCompleteWithdrawal,
  onRejectWithdrawal,
  onRefresh,
}: AdminWithdrawalsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<AdminWithdrawalItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [bankReference, setBankReference] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);

  const filteredWithdrawals = withdrawals.filter((w) => {
    const matchesSearch =
      w.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.accountHolderName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.bankReference && w.bankReference.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (w.phoneNumber && w.phoneNumber.includes(searchTerm));

    const matchesStatus = statusFilter === 'ALL' || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleComplete = async (withdrawalId: string) => {
    if (!bankReference.trim()) {
      alert('Debe ingresar el número de referencia bancaria de la transferencia / Pago Móvil.');
      return;
    }
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await onCompleteWithdrawal(withdrawalId, bankReference.trim());
      if (res.success) {
        setActionResult({
          success: true,
          message: 'Retiro liquidado exitosamente. Saldo retenido debitado y registrado en el ledger.',
        });
        setSelectedWithdrawal(null);
        setBankReference('');
        onRefresh();
      } else {
        setActionResult({ success: false, message: res.error || 'Error al completar el retiro.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (withdrawalId: string) => {
    const reason = rejectReason.trim() || 'Datos de cuenta bancaria o Pago Móvil inválidos';
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await onRejectWithdrawal(withdrawalId, reason);
      if (res.success) {
        setActionResult({
          success: true,
          message: 'Retiro rechazado. El saldo retenido ha sido liberado automáticamente a la billetera del usuario.',
        });
        setSelectedWithdrawal(null);
        setRejectReason('');
        onRefresh();
      } else {
        setActionResult({ success: false, message: res.error || 'Error al rechazar el retiro.' });
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-withdrawals">
      {/* Feedback Banner */}
      {actionResult && (
        <div
          id="alert-withdrawal-feedback"
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

      {/* Filtros */}
      <Card id="card-withdrawals-filter" className="bg-slate-900/90 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-withdrawals"
              type="text"
              placeholder="Buscar por usuario, titular, referencia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {(['PENDING', 'IN_REVIEW', 'COMPLETED', 'REJECTED', 'ALL'] as const).map((st) => (
              <button
                key={st}
                id={`btn-filter-withdrawal-${st}`}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'PENDING'
                  ? 'Pendientes'
                  : st === 'IN_REVIEW'
                  ? 'En Revisión'
                  : st === 'COMPLETED'
                  ? 'Liquidados'
                  : st === 'REJECTED'
                  ? 'Rechazados'
                  : 'Todos'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Tabla de Retiros */}
      <Card
        id="card-withdrawals-table"
        className="bg-slate-900/90 border-slate-800 overflow-hidden"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <ArrowUpRight className="w-4 h-4 text-amber-400" />
              <span>Solicitudes de Retiro ({filteredWithdrawals.length})</span>
            </div>
            <span className="text-xs text-slate-500">Liquidación Bancaria y Pago Móvil</span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3">Usuario / Titular</th>
                <th className="py-2.5 px-3">Monto</th>
                <th className="py-2.5 px-3">Banco / Pago Móvil</th>
                <th className="py-2.5 px-3">Ref. Pago</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No hay solicitudes de retiro bajo los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredWithdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                      {w.createdAt ? new Date(w.createdAt).toLocaleDateString('es-VE') : 'Reciente'}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-200">{w.userName}</div>
                      <div className="text-[11px] text-slate-400">{w.accountHolderName}</div>
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-amber-300">
                      {formatBolivares(w.amount)}
                    </td>

                    <td className="py-3 px-3 text-slate-300">
                      <div className="font-semibold">{w.bankName || w.bankCode}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {w.phoneNumber || 'Pago Móvil'} {w.idDocument ? `(${w.idDocument})` : ''}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-300">
                      {w.bankReference || '—'}
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          w.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : w.status === 'PENDING' || w.status === 'IN_REVIEW'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {w.status === 'COMPLETED'
                          ? 'LIQUIDADO'
                          : w.status === 'IN_REVIEW'
                          ? 'EN REVISIÓN'
                          : w.status === 'PENDING'
                          ? 'PENDIENTE'
                          : 'RECHAZADO'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <Button
                        id={`btn-view-withdrawal-${w.id}`}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2.5"
                        onClick={() => setSelectedWithdrawal(w)}
                        leftIcon={<Eye className="w-3 h-3" />}
                      >
                        {w.status === 'PENDING' ? 'Liquidar' : 'Ver'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de Liquidación */}
      {selectedWithdrawal && (
        <div
          id="modal-withdrawal-details"
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-sm">Liquidación de Retiro</h3>
              </div>
              <button
                id="btn-close-withdrawal-modal"
                type="button"
                onClick={() => setSelectedWithdrawal(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Usuario</span>
                <span className="font-semibold text-slate-200">{selectedWithdrawal.userName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Titular Cuenta</span>
                <span className="font-semibold text-slate-200">{selectedWithdrawal.accountHolderName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Monto a Transferir</span>
                <span className="font-bold font-mono text-amber-300 text-sm">
                  {formatBolivares(selectedWithdrawal.amount)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Banco Receptor</span>
                <span className="font-mono text-slate-300">{selectedWithdrawal.bankName || selectedWithdrawal.bankCode}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Teléfono Pago Móvil</span>
                <span className="font-mono text-slate-300">{selectedWithdrawal.phoneNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-850">
                <span className="text-slate-400">Cédula Titular</span>
                <span className="font-mono text-slate-300">{selectedWithdrawal.idDocument}</span>
              </div>
            </div>

            {selectedWithdrawal.status === 'PENDING' && (
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Número de Referencia de la Transferencia Bancaria
                  </label>
                  <input
                    id="input-bank-reference"
                    type="text"
                    placeholder="Ej. 004829104"
                    value={bankReference}
                    onChange={(e) => setBankReference(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 font-mono"
                  />
                </div>

                <div className="pt-1">
                  <input
                    id="input-reject-withdrawal-reason"
                    type="text"
                    placeholder="Motivo de rechazo (si aplica)..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    id="btn-modal-reject-withdrawal"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                    isLoading={actionLoading}
                    onClick={() => handleReject(selectedWithdrawal.id)}
                    leftIcon={<X className="w-3.5 h-3.5" />}
                  >
                    Rechazar y Liberar Saldo
                  </Button>
                  <Button
                    id="btn-modal-complete-withdrawal"
                    variant="primary"
                    size="sm"
                    className="flex-1 text-xs"
                    isLoading={actionLoading}
                    onClick={() => handleComplete(selectedWithdrawal.id)}
                    leftIcon={<Check className="w-3.5 h-3.5" />}
                  >
                    Confirmar Pago Transferido
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
