import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  BarChart3,
  Wallet,
  FileText,
  CheckCircle2,
  TrendingUp,
  ShieldAlert,
  Play,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { AccountingOverview, AdminLedgerEntryItem } from '../../../types/admin';

export function AdminAccountingTab() {
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<AdminLedgerEntryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');

  // Estados de Reconciliación Forense
  const [reconciliationRunning, setReconciliationRunning] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState<any | null>(null);
  const [reconciliationType, setReconciliationType] = useState<'SESSIONS' | 'HOLDS' | null>(null);

  const loadAccountingData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedOverview, fetchedLedger] = await Promise.all([
        AdminRepository.getAccountingOverview(),
        AdminRepository.getLedgerEntries(100),
      ]);
      setOverview(fetchedOverview);
      setLedgerEntries(fetchedLedger);
    } catch (err) {
      console.error('[AdminAccountingTab] Error cargando contabilidad:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccountingData();
  }, [loadAccountingData]);

  const handleRunReconciliation = async (type: 'SESSIONS' | 'HOLDS', dryRun: boolean) => {
    setReconciliationRunning(true);
    setReconciliationType(type);
    setReconciliationResult(null);

    try {
      let res;
      if (type === 'SESSIONS') {
        res = await AdminRepository.auditAndReconcileUnsettledSessions(dryRun);
      } else {
        res = await AdminRepository.auditAndReconcileOrphanTableHolds(dryRun);
      }

      if (res.success) {
        setReconciliationResult({
          type,
          dryRun,
          success: true,
          data: res.data,
        });
        if (!dryRun) {
          // Recargar contabilidad tras aplicar correcciones
          loadAccountingData();
        }
      } else {
        setReconciliationResult({
          type,
          dryRun,
          success: false,
          error: res.error || 'Error desconocido al ejecutar la reconciliación',
        });
      }
    } catch (err: unknown) {
      setReconciliationResult({
        type,
        dryRun,
        success: false,
        error: (err as any)?.message || 'Excepción ejecutando auditoría',
      });
    } finally {
      setReconciliationRunning(false);
    }
  };

  const filteredLedger = ledgerEntries.filter((entry) => {
    if (filterType === 'ALL') return true;
    return entry.entryType.toLowerCase().includes(filterType.toLowerCase());
  });

  return (
    <div id="admin-accounting-tab" className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-amber-400" />
            Contabilidad Central y Libro Mayor (Ledger)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Auditoría financiera inmutable, comisiones recaudadas (10%) y balances de usuarios sincronizados en Supabase.
          </p>
        </div>

        <button
          onClick={loadAccountingData}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2 transition shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar Balances
        </button>
      </div>

      {/* Tarjetas de Resumen Financiero */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Fondos Totales de Usuarios</span>
              <Wallet className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-100 mt-2">
              {overview.totalWalletFunds.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
            </p>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
              <span>Disponible: {overview.totalAvailableBalance.toFixed(2)} Bs.</span>
              <span className="text-amber-400">Retenido: {overview.totalHeldBalance.toFixed(2)} Bs.</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Recargas Aprobadas</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black font-mono text-emerald-400 mt-2">
              {overview.approvedDepositsSum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
            </p>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
              <span>{overview.approvedDepositsCount} operaciones</span>
              <span className="text-amber-400">Pendientes: {overview.pendingDepositsSum.toFixed(2)} Bs.</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-red-500/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Retiros Completados</span>
              <ArrowUpRight className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-2xl font-black font-mono text-red-400 mt-2">
              {overview.completedWithdrawalsSum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
            </p>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
              <span>{overview.completedWithdrawalsCount} procesados</span>
              <span className="text-amber-400">En espera: {overview.pendingWithdrawalsSum.toFixed(2)} Bs.</span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900/80 to-slate-900/80 border border-amber-500/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300">Comisión Plataforma (10% Rake)</span>
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-black font-mono text-amber-400 mt-2">
              {overview.totalRakeCollected.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
            </p>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
              <span>Premios: {overview.totalPrizesAwarded.toFixed(2)} Bs.</span>
              <span className="text-slate-300">{overview.settledMatchesCount} partidas</span>
            </div>
          </div>
        </div>
      )}

      {/* Herramientas de Auditoría y Reconciliación Forense */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-amber-500/30 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Motor de Reconciliación Forense y Liberación de Retenciones
              </h3>
              <p className="text-xs text-slate-400">
                Resuelve fondos atrapados, reconcilia partidas concluidas no liquidadas y libera retenciones huérfanas con registro en Ledger.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {/* Card 1: Reconciliar Partidas Concluidas */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                  1. Partidas Concluidas sin Liquidar
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Detecta sesiones con ganador en estado <span className="font-mono text-amber-400">FINISHED</span> que no recibieron asiento en <span className="font-mono text-slate-300">game_settlements</span> y ejecuta la liquidación 90/10 universal.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleRunReconciliation('SESSIONS', true)}
                disabled={reconciliationRunning}
                className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-blue-400" />
                <span>Simulación (Dry Run)</span>
              </button>
              <button
                onClick={() => handleRunReconciliation('SESSIONS', false)}
                disabled={reconciliationRunning}
                className="flex-1 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                <span>Ejecutar Liquidación</span>
              </button>
            </div>
          </div>

          {/* Card 2: Liberar Retenciones Huérfanas */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                  2. Retenciones Huérfanas de Mesas
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Identifica saldos en <span className="font-mono text-amber-400">held_balance</span> que exceden las mesas activas del usuario, devolviendo el excedente a <span className="font-mono text-emerald-400">available_balance</span> vía <span className="font-mono text-slate-300">TABLE_ENTRY_REFUND</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => handleRunReconciliation('HOLDS', true)}
                disabled={reconciliationRunning}
                className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simulación (Dry Run)</span>
              </button>
              <button
                onClick={() => handleRunReconciliation('HOLDS', false)}
                disabled={reconciliationRunning}
                className="flex-1 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                <span>Liberar Retenciones</span>
              </button>
            </div>
          </div>
        </div>

        {/* Panel de Resultados de Reconciliación */}
        {reconciliationRunning && (
          <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/40 flex items-center gap-3 text-amber-300 text-xs font-mono">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
            <span>Ejecutando proceso de reconciliación forense en base de datos central...</span>
          </div>
        )}

        {reconciliationResult && (
          <div className={`p-4 rounded-xl border ${
            reconciliationResult.success
              ? 'bg-slate-950 border-emerald-500/40 text-slate-200'
              : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                {reconciliationResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
                Resultado de Reconciliación ({reconciliationResult.dryRun ? 'Modo Simulación' : 'Ejecución Real en Base de Datos'}):
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                {reconciliationResult.type}
              </span>
            </div>
            <pre className="text-[11px] font-mono p-3 rounded-lg bg-slate-900/90 overflow-x-auto max-h-48 border border-slate-800 text-slate-300">
              {JSON.stringify(reconciliationResult.data || reconciliationResult.error, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Filtros del Libro Mayor */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          Movimientos Inmutables del Libro Mayor (Ledger)
        </span>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {['ALL', 'DEPOSIT', 'WITHDRAWAL', 'HOLD', 'SETTLEMENT'].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                filterType === t
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t === 'ALL' ? 'Todos' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla del Libro Mayor */}
      <div className="overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Fecha y Hora</th>
                <th className="py-3 px-4">Tipo de Asiento</th>
                <th className="py-3 px-4">Monto</th>
                <th className="py-3 px-4">Balance Posterior</th>
                <th className="py-3 px-4">Referencia</th>
                <th className="py-3 px-4">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No se registran movimientos en el libro mayor con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {new Date(entry.createdAt).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {entry.entryType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      <span className={entry.direction === 'CREDIT' ? 'text-emerald-400' : 'text-red-400'}>
                        {entry.direction === 'CREDIT' ? '+' : '-'}
                        {entry.amount.toFixed(2)} Bs.
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      <div>Disp: {entry.balanceAfterAvailable.toFixed(2)} Bs.</div>
                      <div className="text-[10px] text-amber-400">Ret: {entry.balanceAfterHeld.toFixed(2)} Bs.</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {entry.referenceTable}:{entry.referenceId ? entry.referenceId.slice(0, 8) : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-xs truncate">{entry.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
