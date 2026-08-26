// ==============================================================================
// RASPANDO LA OLLA — VISTA ADMINISTRATIVA (INTEGRACIÓN COMPLETA FASE 4)
// ==============================================================================
// Interfaz interactiva protegida por RBAC (ADMIN / SUPER_ADMIN) y RLS:
// - Gestión de recargas pendientes (Aprobación vía RPC approve_deposit_request)
// - Gestión de retiros pendientes (Liquidación vía RPC complete_withdrawal_request)
// - Registro de auditoría del sistema (audit_logs)
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AdminRepository } from '../../services/repositories/AdminRepository';
import { PaymentRepository } from '../../services/repositories/PaymentRepository';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { formatBolivares, maskPhone, maskCedula } from '../../utils/formatters';
import { FINANCIAL_RULES } from '../../utils/constants';
import {
  Shield,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  AlertOctagon,
  Check,
  X,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export function AdminView() {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<'deposits' | 'withdrawals' | 'audit'>('deposits');
  const [pendingDeposits, setPendingDeposits] = useState<any[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const isAuthorized = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const loadAdminData = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    try {
      const [deps, withs, logs] = await Promise.all([
        AdminRepository.getPendingDeposits(),
        AdminRepository.getPendingWithdrawals(),
        AdminRepository.getAuditLogs(30),
      ]);
      setPendingDeposits(deps);
      setPendingWithdrawals(withs);
      setAuditLogs(logs);
    } catch (err) {
      console.error('Error cargando datos de admin:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Aprobar recarga mediante RPC `approve_deposit_request`
  const handleApproveDeposit = async (depositId: string) => {
    setProcessingId(depositId);
    setActionFeedback(null);

    try {
      const res = await PaymentRepository.approveDeposit(depositId);
      if (res.success) {
        setActionFeedback({
          success: true,
          message: `Recarga aprobada. Saldo acreditado en billetera y ledger.`,
        });
        loadAdminData();
      } else {
        setActionFeedback({
          success: false,
          message: res.error || 'Error al aprobar recarga.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        success: false,
        message: err.message || 'Error inesperado.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Completar retiro mediante RPC `complete_withdrawal_request`
  const handleCompleteWithdrawal = async (withdrawalId: string) => {
    const bankRef = window.prompt('Ingrese la referencia bancaria de la transferencia Pago Móvil realizada:') || `PM-${Date.now()}`;
    setProcessingId(withdrawalId);
    setActionFeedback(null);

    try {
      const res = await PaymentRepository.completeWithdrawal(withdrawalId, bankRef);
      if (res.success) {
        setActionFeedback({
          success: true,
          message: `Retiro completado exitosamente. Saldo retenido deducido del ledger.`,
        });
        loadAdminData();
      } else {
        setActionFeedback({
          success: false,
          message: res.error || 'Error al completar retiro.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        success: false,
        message: err.message || 'Error inesperado.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Rechazar retiro mediante RPC `reject_withdrawal_request`
  const handleRejectWithdrawal = async (withdrawalId: string) => {
    const reason = window.prompt('Indique el motivo del rechazo del retiro:') || 'Datos bancarios erróneos';
    setProcessingId(withdrawalId);
    setActionFeedback(null);

    try {
      const res = await PaymentRepository.rejectWithdrawal(withdrawalId, reason);
      if (res.success) {
        setActionFeedback({
          success: true,
          message: `Retiro rechazado. Saldo retenido reintegrado a saldo disponible.`,
        });
        loadAdminData();
      } else {
        setActionFeedback({
          success: false,
          message: res.error || 'Error al rechazar retiro.',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        success: false,
        message: err.message || 'Error inesperado.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (!isAuthorized) {
    return (
      <div id="admin-unauthorized" className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-950/40 border border-red-800/60 flex items-center justify-center mx-auto text-red-400">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">Acceso Restringido</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Esta sección está reservada exclusivamente para el equipo de administración y soporte oficial.
        </p>
      </div>
    );
  }

  return (
    <div id="admin-view" className="space-y-8 max-w-5xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-700/60 flex items-center justify-center text-red-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-100">Panel de Control Administrativo</h1>
            <p className="text-xs text-slate-400">Rol activo: {role} (Acceso Autorizado)</p>
          </div>
        </div>

        <button
          onClick={loadAdminData}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Reglas y Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card id="card-admin-stat-1">
          <span className="text-xs font-semibold text-slate-400 uppercase">Comisión Plataforma</span>
          <div className="text-2xl font-black text-amber-400 font-mono mt-1">
            {FINANCIAL_RULES.SERVICE_FEE_PERCENT}%
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Regla 90/10 Inmutable</span>
        </Card>

        <Card id="card-admin-stat-2">
          <span className="text-xs font-semibold text-slate-400 uppercase">Recargas Pendientes</span>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
            {pendingDeposits.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Por validar comprobante</span>
        </Card>

        <Card id="card-admin-stat-3">
          <span className="text-xs font-semibold text-slate-400 uppercase">Retiros Pendientes</span>
          <div className="text-2xl font-black text-blue-400 font-mono mt-1">
            {pendingWithdrawals.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Por transferir Pago Móvil</span>
        </Card>
      </div>

      {actionFeedback && (
        <div
          className={`p-3 rounded-2xl border text-xs flex items-start gap-2 ${
            actionFeedback.success
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : 'bg-red-950/40 border-red-800/60 text-red-300'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* Pestañas de Navegación de Admin */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-medium">
        <button
          onClick={() => setActiveTab('deposits')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'deposits'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
          <span>Recargas Pendientes ({pendingDeposits.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'withdrawals'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-amber-400" />
          <span>Retiros Pendientes ({pendingWithdrawals.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
          <span>Auditoría y Logs ({auditLogs.length})</span>
        </button>
      </div>

      {/* Contenido de la Pestaña Activa */}
      {activeTab === 'deposits' && (
        <Card
          id="card-admin-deposits"
          header={<span className="font-semibold text-sm text-slate-200">Solicitudes de Recarga Pendientes</span>}
        >
          {pendingDeposits.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No hay solicitudes de recarga pendientes de validación.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {pendingDeposits.map((dep) => (
                <div key={dep.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-200 flex items-center gap-2">
                      <span>{dep.bank_origin || 'Pago Móvil'}</span>
                      <span className="text-amber-400 font-mono font-bold">{formatBolivares(dep.amount)}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Ref: <strong>{dep.reference_number}</strong> • Usuario: {dep.profiles?.email || dep.user_id}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Fecha: {new Date(dep.created_at).toLocaleString('es-VE')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="bg-emerald-600 hover:bg-emerald-500 text-xs px-3"
                      disabled={processingId === dep.id}
                      onClick={() => handleApproveDeposit(dep.id)}
                      leftIcon={<Check className="w-3.5 h-3.5" />}
                    >
                      {processingId === dep.id ? 'Aprobando...' : 'Aprobar Recarga'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'withdrawals' && (
        <Card
          id="card-admin-withdrawals"
          header={<span className="font-semibold text-sm text-slate-200">Solicitudes de Retiro Pendientes</span>}
        >
          {pendingWithdrawals.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No hay solicitudes de retiro pendientes de transferencia.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {pendingWithdrawals.map((wth) => (
                <div key={wth.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-200 flex items-center gap-2">
                      <span>{wth.payment_accounts?.bank_name || 'Pago Móvil'}</span>
                      <span className="text-amber-400 font-mono font-bold">{formatBolivares(wth.amount)}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Titular: {wth.payment_accounts?.account_holder_name} | Tel: {maskPhone(wth.payment_accounts?.phone_number || '')} | CI: {maskCedula(wth.payment_accounts?.id_document || '')}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Solicitado: {new Date(wth.created_at).toLocaleString('es-VE')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="bg-emerald-600 hover:bg-emerald-500 text-xs px-3"
                      disabled={processingId === wth.id}
                      onClick={() => handleCompleteWithdrawal(wth.id)}
                      leftIcon={<Check className="w-3.5 h-3.5" />}
                    >
                      {processingId === wth.id ? 'Completando...' : 'Completar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-red-400 hover:bg-red-950/40 text-xs px-3"
                      disabled={processingId === wth.id}
                      onClick={() => handleRejectWithdrawal(wth.id)}
                      leftIcon={<X className="w-3.5 h-3.5" />}
                    >
                      Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'audit' && (
        <Card
          id="card-admin-audit"
          header={<span className="font-semibold text-sm text-slate-200">Registros de Auditoría del Sistema</span>}
        >
          {auditLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No hay registros de auditoría recientes.
            </div>
          ) : (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-amber-300 uppercase">{log.action}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(log.created_at).toLocaleString('es-VE')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Tabla: <strong>{log.target_table}</strong> • ID: {log.target_id} • Actor: {log.actor_id || 'SYSTEM'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
