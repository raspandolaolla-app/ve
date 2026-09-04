import React, { useState } from 'react';
import { Wrench, ShieldAlert, CheckCircle2, AlertTriangle, Play, RefreshCw, Trash2, Clock, FileCheck } from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { MaintenanceDryRunResult } from '../../../types/admin';
import { AdminTestCleanupSection } from './AdminTestCleanupSection';

export function AdminMaintenanceTab() {
  const [dryRunResult, setDryRunResult] = useState<MaintenanceDryRunResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [executionResult, setExecutionResult] = useState<{ success: boolean; totalCleaned?: number; error?: string } | null>(null);

  const handleRunDryRun = async () => {
    setEvaluating(true);
    setExecutionResult(null);
    try {
      const result = await AdminRepository.runMaintenanceDryRun();
      setDryRunResult(result);
    } catch (err: any) {
      console.error('[AdminMaintenanceTab] Error en dry run:', err);
    } finally {
      setEvaluating(false);
    }
  };

  const handleExecuteCleanup = async () => {
    if (confirmationPhrase !== 'LIMPIAR_SISTEMA') return;

    setExecuting(true);
    try {
      const result = await AdminRepository.executeMaintenanceCleanup(true);
      setExecutionResult(result);
      if (result.success) {
        setDryRunResult(null);
        setConfirmationPhrase('');
      }
    } catch (err: any) {
      setExecutionResult({ success: false, error: err.message || 'Error en ejecución' });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div id="admin-maintenance-tab" className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-400" />
            Mantenimiento y Depuración Segura del Sistema
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Rutinas de optimización server-side con protección de datos inmutables y ejecución en dos pasos (Dry Run + Confirmación).
          </p>
        </div>
      </div>

      {/* Reglas de Seguridad Inmutables */}
      <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20">
        <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          Garantías de Integridad y Protección de Datos
        </h3>
        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
          Las rutinas de mantenimiento <strong>NUNCA</strong> eliminan ni modifican:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 mt-3 text-xs">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Billeteras y Saldos
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Libro Mayor (Ledger)
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Recargas y Retiros
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Expedientes KYC
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Partidas y Liquidaciones
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Usuarios y Perfiles
          </div>
        </div>
      </div>

      {/* Panel de Evaluación Preliminar (Dry Run) */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-sky-400" />
              Paso 1: Diagnóstico Preliminar (Dry Run)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Calcula registros transitorios antiguos elegibles para limpieza sin realizar modificaciones en la base de datos.
            </p>
          </div>

          <button
            onClick={handleRunDryRun}
            disabled={evaluating}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
            {evaluating ? 'Evaluando...' : 'Ejecutar Dry Run'}
          </button>
        </div>

        {dryRunResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">Resumen del Diagnóstico Server-Side</span>
              <span className="text-[10px] font-mono text-slate-500">
                {new Date(dryRunResult.evaluatedAt).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[11px] text-slate-400">Sesiones Expiradas (&gt;30d)</span>
                <p className="text-xl font-black font-mono text-amber-400 mt-1">
                  {dryRunResult.expiredSessionsCount}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[11px] text-slate-400">Notif. Leídas Antiguas (&gt;60d)</span>
                <p className="text-xl font-black font-mono text-sky-400 mt-1">
                  {dryRunResult.oldNotificationsCount}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[11px] text-slate-400">Logs Técnicos Temp. (&gt;90d)</span>
                <p className="text-xl font-black font-mono text-slate-300 mt-1">
                  {dryRunResult.oldAuditLogsCount}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
              <span className="font-semibold text-slate-300">Total de registros transitorios:</span>
              <span className="font-black font-mono text-emerald-400">{dryRunResult.totalEligibleRecords} registros</span>
            </div>
          </div>
        )}
      </div>

      {/* Paso 2: Ejecución Controlada con Confirmación */}
      {dryRunResult && dryRunResult.totalEligibleRecords > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-red-500/30 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Paso 2: Confirmación y Ejecución de Limpieza
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Para proceder con la purga de los <strong>{dryRunResult.totalEligibleRecords}</strong> registros transitorios evaluados, escribe la palabra de confirmación exacta:
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="text"
              placeholder="Escribe: LIMPIAR_SISTEMA"
              value={confirmationPhrase}
              onChange={(e) => setConfirmationPhrase(e.target.value)}
              className="w-full sm:w-80 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-red-500"
            />

            <button
              onClick={handleExecuteCleanup}
              disabled={executing || confirmationPhrase !== 'LIMPIAR_SISTEMA'}
              className="w-full sm:w-auto px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shrink-0"
            >
              <Trash2 className={`w-3.5 h-3.5 ${executing ? 'animate-spin' : ''}`} />
              {executing ? 'Limpiando...' : 'Confirmar y Ejecutar Limpieza'}
            </button>
          </div>
        </div>
      )}

      {/* Resultado de la Ejecución */}
      {executionResult && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            executionResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {executionResult.success ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <div className="text-xs">
            {executionResult.success ? (
              <p>
                <strong>Limpieza completada exitosamente:</strong> Se purgaron {executionResult.totalCleaned} registros transitorios antiguos. La operación fue registrada en los logs de auditoría inmutables.
              </p>
            ) : (
              <p>
                <strong>Error en la operación:</strong> {executionResult.error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sección Quirúrgica de Purga de Datos de Prueba (5000 Bs) */}
      <AdminTestCleanupSection onPurgeComplete={handleRunDryRun} />
    </div>
  );
}
