import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, ArrowDownLeft, ArrowUpRight, ShieldCheck, RefreshCw, BarChart3, Wallet, FileText, CheckCircle2, TrendingUp } from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { AccountingOverview, AdminLedgerEntryItem } from '../../../types/admin';

export function AdminAccountingTab() {
  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<AdminLedgerEntryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');

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
