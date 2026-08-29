// ==============================================================================
// RASPANDO LA OLLA — MÓDULO ADMINISTRATIVO: AUDITORÍA Y TEST DEL SISTEMA (FASE 25)
// ==============================================================================
// Panel de control para ejecución de pruebas REALES contra Supabase y motores de juego.
// Aisla registros con AUDIT_TEST y permite descarga de informes TXT y limpieza segura.
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { SystemAuditRunner } from '../../../services/audit/SystemAuditRunner';
import { AuditTestRepository } from '../../../services/repositories/AuditTestRepository';
import type {
  AuditTestRun,
  AuditLogEntry,
  AuditCategory,
  AuditTestStatus,
  AuditCleanupSummary,
} from '../../../types/auditTest';
import {
  FlaskConical,
  Play,
  FileText,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Shield,
  ShieldAlert,
  Gamepad2,
  RefreshCw,
  Search,
  History,
  Info,
} from 'lucide-react';

interface AdminSystemTestTabProps {
  userEmail: string | null;
  userRole: string;
  isSuperAdmin: boolean;
}

const HISTORY_STORAGE_KEY = 'raspando_olla_system_audit_history_v1';

export function AdminSystemTestTab({
  userEmail,
  userRole,
  isSuperAdmin,
}: AdminSystemTestTabProps) {
  const [currentRun, setCurrentRun] = useState<AuditTestRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [liveLogs, setLiveLogs] = useState<AuditLogEntry[]>([]);
  const [history, setHistory] = useState<AuditTestRun[]>([]);
  
  // Filtros de búsqueda
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Estados Modal Limpieza
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [testDataStats, setTestDataStats] = useState<{
    testTablesCount: number;
    testActionsCount: number;
    testTicketsCount: number;
    testLogsCount: number;
    realTablesCount: number;
    realWalletsCount: number;
  } | null>(null);

  const [cleanupSummaryReport, setCleanupSummaryReport] = useState<AuditCleanupSummary | null>(null);
  const [cleanupConfirmed, setCleanupConfirmed] = useState(false);

  // Cargar historial al montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed: AuditTestRun[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHistory(parsed);
          setCurrentRun(parsed[0]);
          setLiveLogs(parsed[0].logs);
        }
      }
    } catch {
      // Ignorar error de deserialización
    }
  }, []);

  // Guardar historial
  const saveRunToHistory = useCallback((newRun: AuditTestRun) => {
    setHistory((prev) => {
      const updated = [newRun, ...prev.filter((r) => r.id !== newRun.id)].slice(0, 15);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignorar
      }
      return updated;
    });
  }, []);

  // Ejecutar Auditoría Real Completa
  const handleRunFullAudit = async () => {
    setIsRunning(true);
    setLiveLogs([]);

    try {
      const resultRun = await SystemAuditRunner.runFullAudit(
        userEmail || 'admin@pulsoplay.com',
        userRole,
        (newLog) => {
          setLiveLogs((prev) => [...prev, newLog]);
        }
      );

      setCurrentRun(resultRun);
      saveRunToHistory(resultRun);
    } catch (err) {
      console.error('[AdminSystemTestTab] Error ejecutando auditoría:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // Generar y Descargar Informe TXT
  const handleDownloadTxt = (targetRun?: AuditTestRun) => {
    const runToExport = targetRun || currentRun;
    if (!runToExport) return;

    const txtContent = SystemAuditRunner.generateTxtReport(runToExport);
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const dateFormatted = new Date(runToExport.timestamp)
      .toISOString()
      .substring(0, 19)
      .replace('T', '_')
      .replace(/:/g, '-');

    link.href = url;
    link.download = `AUDITORIA_COMPLETA_${dateFormatted}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Abrir Modal de Limpieza
  const handleOpenCleanupModal = async () => {
    setCleanupSummaryReport(null);
    setCleanupConfirmed(false);
    setShowCleanupModal(true);

    const stats = await AuditTestRepository.getAuditTestSummary('AUDIT_TEST');
    setTestDataStats(stats);
  };

  // Ejecutar Limpieza Segura
  const handleExecuteCleanup = async () => {
    if (!cleanupConfirmed) return;
    setIsCleaning(true);

    try {
      const res = await AuditTestRepository.cleanupAuditTestData('AUDIT_TEST');
      if (res.success && res.summary) {
        setCleanupSummaryReport(res.summary);
        // Actualizar estadísticas tras la limpieza
        const updatedStats = await AuditTestRepository.getAuditTestSummary('AUDIT_TEST');
        setTestDataStats(updatedStats);
      } else {
        alert(res.error || 'Error al ejecutar limpieza de auditoría.');
      }
    } catch (err: any) {
      alert(`Error en limpieza: ${err?.message}`);
    } finally {
      setIsCleaning(false);
    }
  };

  // Filtro de Logs
  const filteredLogs = liveLogs.filter((log) => {
    if (filterCategory !== 'ALL' && log.category !== filterCategory) return false;
    if (filterStatus !== 'ALL' && log.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.name.toLowerCase().includes(q) ||
        log.target.toLowerCase().includes(q) ||
        log.actual.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div id="admin-system-test-tab" className="space-y-6">
      {/* Barra de Encabezado Módulo Auditoría */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-100 tracking-tight">
                  AUDITORÍA Y TEST DEL SISTEMA
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  REAL INFRASTRUCTURE TEST
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluación REAL en vivo de funciones, RPCs, motores de juego y WebSockets de Supabase sin datos inventados.
              </p>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="btn-run-audit"
              onClick={handleRunFullAudit}
              disabled={isRunning}
              className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all shadow-lg ${
                isRunning
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 active:scale-95'
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  EJECUTANDO AUDITORÍA...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  EJECUTAR AUDITORÍA REAL
                </>
              )}
            </button>

            <button
              id="btn-download-txt"
              onClick={() => handleDownloadTxt()}
              disabled={!currentRun || isRunning}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              GENERAR INFORME TXT
            </button>

            {/* Botón de Limpieza (SUPER_ADMIN o ADMIN) */}
            <button
              id="btn-open-cleanup-modal"
              onClick={handleOpenCleanupModal}
              disabled={isRunning}
              title={
                isSuperAdmin
                  ? 'Limpieza de datos de prueba exclusiva para Super Admin'
                  : 'Requiere permisos de Super Admin'
              }
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                isSuperAdmin
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30'
                  : 'bg-slate-800/60 text-slate-400 border-slate-800 cursor-not-allowed opacity-70'
              }`}
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              🧹 LIMPIAR DATOS AUDITORÍA
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas de Auditoría Activa */}
        {currentRun && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-slate-800/80">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Pruebas Totales</span>
              <span className="text-lg font-black text-slate-100">{currentRun.totalTests}</span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">PASS (Exitosas)</span>
              <span className="text-lg font-black text-emerald-300">{currentRun.passCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-red-950/30 border border-red-800/40">
              <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider block">FAIL (Fallos)</span>
              <span className="text-lg font-black text-red-300">{currentRun.failCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40">
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider block">WARNINGS</span>
              <span className="text-lg font-black text-amber-300">{currentRun.warningCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Duración</span>
              <span className="text-lg font-black text-slate-200">{(currentRun.durationMs / 1000).toFixed(2)}s</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Salud Sistema</span>
              <span
                className={`text-xs font-extrabold uppercase inline-block px-2 py-0.5 mt-1 rounded ${
                  currentRun.healthStatus === 'EXCELLENT'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : currentRun.healthStatus === 'GOOD'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}
              >
                {currentRun.healthStatus}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Grid de Estado de Motores de Juego (Los 8 Juegos Venezolanos) */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-100 font-black text-sm uppercase tracking-wide">
            <Gamepad2 className="w-4 h-4 text-amber-400" />
            <span>Verificación Real de los 8 Motores de Juego</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {currentRun ? `${currentRun.gameReports.filter((g) => g.pass).length} / 8 Operativos` : '0 / 8 Probados'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(currentRun?.gameReports || [
            { displayName: 'Dominó Venezolano', gameKey: 'domino_venezolano' },
            { displayName: 'Truco Venezolano', gameKey: 'truco_venezolano' },
            { displayName: 'Bingo Online', gameKey: 'bingo' },
            { displayName: 'Polla Venezolana', gameKey: 'polla_venezolana' },
            { displayName: 'Atrapaíto / Parchís', gameKey: 'atrapaito' },
            { displayName: 'Damas Venezolanas', gameKey: 'checkers' },
            { displayName: 'Piedra, Papel o Tijera', gameKey: 'rock_paper_scissors' },
            { displayName: 'La Vieja (3 en Raya)', gameKey: 'tic_tac_toe' },
          ]).map((game: any) => {
            const isTested = Boolean(game.tested);
            const isPass = game.pass;
            return (
              <div
                key={game.gameKey}
                className={`p-3.5 rounded-xl border transition-all ${
                  !isTested
                    ? 'bg-slate-950/40 border-slate-800/80 text-slate-400'
                    : isPass
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                    : 'bg-red-950/20 border-red-800/40 text-red-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-bold text-slate-100">{game.displayName}</span>
                  {isTested ? (
                    isPass ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )
                  ) : (
                    <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-2">
                  {game.message || 'Pendiente por auditoría.'}
                </p>

                {game.rulesVerified && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {game.rulesVerified.map((r: string, idx: number) => (
                      <span
                        key={idx}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla de Logs de Auditoría Real Stream */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-100 uppercase tracking-wide">
              Stream de Registro de Pruebas Reales ({filteredLogs.length})
            </span>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar operación..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
            >
              <option value="ALL">Todas las Categorías</option>
              <option value="AUTH">AUTH (Sesión & Roles)</option>
              <option value="WALLET">WALLET (Finanzas)</option>
              <option value="SYSTEM">SYSTEM (Realtime & Presencia)</option>
              <option value="MULTIPLAYER">MULTIPLAYER (Mesas)</option>
              <option value="GAMES">GAMES (8 Motores)</option>
              <option value="CONCURRENCY">CONCURRENCY (Locks)</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
              <option value="WARNING">WARNING</option>
            </select>
          </div>
        </div>

        {/* Tabla Lista de Pruebas */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-mono text-[11px] uppercase">
                <th className="p-3">Estado</th>
                <th className="p-3">Categoría</th>
                <th className="p-3">Prueba / Operación</th>
                <th className="p-3">Destino / RPC</th>
                <th className="p-3 text-right">Latencia</th>
                <th className="p-3">Resultado Obtenido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-sans text-xs">
                    {isRunning
                      ? 'Ejecutando pruebas reales en vivo...'
                      : 'Presione "EJECUTAR AUDITORÍA REAL" para iniciar el escaneo completo.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black ${
                          log.status === 'PASS'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : log.status === 'FAIL'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {log.status === 'PASS' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                        {log.status === 'FAIL' && <XCircle className="w-3 h-3 text-red-400" />}
                        {log.status === 'WARNING' && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-slate-300">{log.category}</td>
                    <td className="p-3 font-sans font-medium text-slate-100">{log.name}</td>
                    <td className="p-3 text-slate-400 text-[11px]">{log.target}</td>
                    <td className="p-3 text-right font-bold text-amber-300 whitespace-nowrap">
                      {log.latencyMs} ms
                    </td>
                    <td className="p-3 font-sans text-slate-300 max-w-md truncate">
                      {log.actual}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial de Auditorías */}
      {history.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
            <History className="w-4 h-4 text-amber-400" />
            <span>Historial de Auditorías Recientes ({history.length})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {history.map((h) => (
              <div
                key={h.id}
                onClick={() => {
                  setCurrentRun(h);
                  setLiveLogs(h.logs);
                }}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  currentRun?.id === h.id
                    ? 'bg-amber-500/10 border-amber-500/50 text-slate-100'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-mono font-bold">{h.id}</span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px]">{h.passCount} PASS / {h.failCount} FAIL</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadTxt(h);
                    }}
                    className="p-1 rounded hover:bg-slate-800 text-emerald-400"
                    title="Descargar Informe TXT"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DE LIMPIEZA DATOS AUDITORÍA (EXCLUSIVO SUPER_ADMIN / ADMIN) */}
      {showCleanupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-100">
                  LIMPIAR DATOS DE AUDITORÍA
                </h3>
                <p className="text-xs text-slate-400">
                  Operación segura reservada para Administradores.
                </p>
              </div>
            </div>

            {/* Resumen previo de elementos a eliminar */}
            {testDataStats && !cleanupSummaryReport && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <span className="font-extrabold text-slate-200 block">
                  Registros Etiquetados con AUDIT_TEST a Eliminar:
                </span>
                <div className="grid grid-cols-2 gap-2 text-slate-300 font-mono text-[11px]">
                  <div>Mesas de Prueba: <strong className="text-amber-400">{testDataStats.testTablesCount}</strong></div>
                  <div>Tickets de Prueba: <strong className="text-amber-400">{testDataStats.testTicketsCount}</strong></div>
                  <div>Registros Reales Preservados: <strong className="text-emerald-400">{testDataStats.realTablesCount} mesas</strong></div>
                  <div>Billeteras Reales Preservadas: <strong className="text-emerald-400">{testDataStats.realWalletsCount} wallets</strong></div>
                </div>
              </div>
            )}

            {/* Confirmación explícita de seguridad */}
            {!cleanupSummaryReport ? (
              <>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200 leading-relaxed">
                    Esta acción eliminará únicamente las mesas, asientos y tickets que contengan la etiqueta <strong>AUDIT_TEST</strong>. Todos los usuarios reales, saldos y partidas continuarán intactos.
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-medium">
                  <input
                    type="checkbox"
                    checked={cleanupConfirmed}
                    onChange={(e) => setCleanupConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                  />
                  <span>Confirmo ejecutar la limpieza de datos de prueba</span>
                </label>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowCleanupModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={handleExecuteCleanup}
                    disabled={!cleanupConfirmed || isCleaning}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                    {isCleaning ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    EJECUTAR LIMPIEZA
                  </button>
                </div>
              </>
            ) : (
              /* Reporte posterior a la limpieza */
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-300 font-extrabold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Limpieza Ejecutada Exitosamente</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {cleanupSummaryReport.message}
                  </p>
                  <div className="pt-2 border-t border-emerald-500/20 text-[11px] text-slate-400 font-mono">
                    <div>Mesas Eliminadas: {cleanupSummaryReport.deletedTables}</div>
                    <div>Mesas Reales Preservadas: {cleanupSummaryReport.remainingRealTables}</div>
                    <div>Wallets Reales Preservadas: {cleanupSummaryReport.remainingRealWallets}</div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowCleanupModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
