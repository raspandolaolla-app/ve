// ==============================================================================
// RASPANDO LA OLLA — CENTRO DE MIGRACIÓN DE SUPABASE
// ==============================================================================
// Panel profesional de orquestación, validación, respaldo, migración controlada
// y cambio de infraestructura Supabase. Exclusivo para SUPER_ADMIN.
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Download,
  Play,
  ArrowRight,
  Lock,
  Eye,
  EyeOff,
  Server,
  Layers,
  FileText,
  Activity,
  Archive,
  History,
  Terminal,
  Zap,
} from 'lucide-react';
import { AdminSupabaseMigrationRepository } from '../../../services/repositories/admin/AdminSupabaseMigrationRepository';
import type {
  MigrationFullStatusResponse,
  TargetCredentialsInput,
  TargetValidationResult,
  DryRunPlan,
  BackupManifest,
  SmokeTestReport,
} from '../../../types/supabaseMigration';

interface AdminMigrationTabProps {
  isSuperAdmin: boolean;
  currentUserEmail?: string;
}

export const AdminMigrationTab: React.FC<AdminMigrationTabProps> = ({
  isSuperAdmin,
  currentUserEmail,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [operating, setOperating] = useState<boolean>(false);
  const [operationTitle, setOperationTitle] = useState<string>('');
  const [statusData, setStatusData] = useState<MigrationFullStatusResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulario destino
  const [targetUrl, setTargetUrl] = useState<string>('');
  const [targetAnonKey, setTargetAnonKey] = useState<string>('');
  const [targetServiceRoleKey, setTargetServiceRoleKey] = useState<string>('');
  const [targetDbUrl, setTargetDbUrl] = useState<string>('');
  const [showServiceKey, setShowServiceKey] = useState<boolean>(false);

  // Resultados de pasos
  const [validationResult, setValidationResult] = useState<TargetValidationResult | null>(null);
  const [dryRunPlan, setDryRunPlan] = useState<DryRunPlan | null>(null);
  const [backupManifest, setBackupManifest] = useState<BackupManifest | null>(null);
  const [smokeReport, setSmokeReport] = useState<SmokeTestReport | null>(null);

  // Conmutación a producción
  const [confirmationCode, setConfirmationCode] = useState<string>('');
  const [showSwitchModal, setShowSwitchModal] = useState<boolean>(false);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await AdminSupabaseMigrationRepository.getStatus();
      setStatusData(data);
      if (data.dryRunPlan) setDryRunPlan(data.dryRunPlan);
      if (data.backup) setBackupManifest(data.backup);
      if (data.smokeTestReport) setSmokeReport(data.smokeTestReport);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar estado del centro de migración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const getTargetCreds = (): TargetCredentialsInput => ({
    targetUrl: targetUrl.trim(),
    targetAnonKey: targetAnonKey.trim(),
    targetServiceRoleKey: targetServiceRoleKey.trim(),
    targetDbUrl: targetDbUrl.trim() ? targetDbUrl.trim() : undefined,
  });

  // 1. Validar destino
  const handleValidateTarget = async () => {
    if (!targetUrl || !targetAnonKey || !targetServiceRoleKey) {
      setErrorMsg('Por favor complete la URL, Anon Key y Service Role Key del Supabase destino.');
      return;
    }
    try {
      setOperating(true);
      setOperationTitle('Validando conectividad con Supabase destino...');
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await AdminSupabaseMigrationRepository.validateTarget(getTargetCreds());
      setValidationResult(res);
      if (res.valid) {
        setSuccessMsg(`Destino validado correctamente en ${res.latencyMs}ms. Se detectaron ${res.existingTablesCount} tablas.`);
      } else {
        setErrorMsg(res.message || 'El proyecto destino no superó la validación.');
      }
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error validando destino');
    } finally {
      setOperating(false);
    }
  };

  // 2. Ejecutar Dry-Run
  const handleRunDryRun = async () => {
    try {
      setOperating(true);
      setOperationTitle('Calculando plan de migración y matriz de compatibilidad (Dry-Run)...');
      setErrorMsg(null);
      setSuccessMsg(null);
      const plan = await AdminSupabaseMigrationRepository.runDryRun(getTargetCreds());
      setDryRunPlan(plan);
      setSuccessMsg(`Dry-Run completado: ${plan.willCreate.tables.length} tablas a crear, ${plan.willMigrateData.admins.length} administradores en allowlist.`);
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error ejecutando Dry-Run');
    } finally {
      setOperating(false);
    }
  };

  // 3. Crear Respaldo
  const handleCreateBackup = async () => {
    try {
      setOperating(true);
      setOperationTitle('Generando snapshot criptográfico de configuraciones y perfiles...');
      setErrorMsg(null);
      setSuccessMsg(null);
      const bk = await AdminSupabaseMigrationRepository.createBackup();
      setBackupManifest(bk);
      setSuccessMsg(`Respaldo ${bk.id} generado exitosamente (SHA-256: ${bk.sha256Hash.slice(0, 16)}...).`);
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error generando respaldo');
    } finally {
      setOperating(false);
    }
  };

  // 4. Migrar Esquema
  const handleMigrateSchema = async () => {
    try {
      setOperating(true);
      setOperationTitle('Aplicando las 156 migraciones oficiales de esquema en destino...');
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await AdminSupabaseMigrationRepository.executeSchemaMigration(getTargetCreds());
      if (res.success) {
        setSuccessMsg(`Esquema instalado con éxito (${res.appliedCount} migraciones aplicadas).`);
      } else {
        setErrorMsg(res.message || 'Fallo al migrar esquema');
      }
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al ejecutar migración de esquema');
    } finally {
      setOperating(false);
    }
  };

  // 5. Migrar Datos Allowlist
  const handleMigrateData = async () => {
    try {
      setOperating(true);
      setOperationTitle('Migrando administradores y configuraciones del sistema...');
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await AdminSupabaseMigrationRepository.executeDataMigration(getTargetCreds());
      if (res.success) {
        setSuccessMsg(`Datos migrados: ${res.adminsMigrated} administradores y ${res.configsMigrated} configuraciones activadas.`);
      } else {
        setErrorMsg(res.message || 'Fallo al migrar datos');
      }
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al migrar datos');
    } finally {
      setOperating(false);
    }
  };

  // 6. Smoke Tests
  const handleRunSmokeTests = async () => {
    try {
      setOperating(true);
      setOperationTitle('Ejecutando Smoke Tests funcionales (DB, RPCs, RLS, RPS 3->2->1->0, Abandono)...');
      setErrorMsg(null);
      setSuccessMsg(null);
      const rep = await AdminSupabaseMigrationRepository.runSmokeTests(getTargetCreds());
      setSmokeReport(rep);
      if (rep.allPassed) {
        setSuccessMsg(`Smoke Tests 100% aprobados (${rep.passedCount} pruebas). El entorno destino está listo para conmutar a producción.`);
      } else {
        setErrorMsg(`Fallaron ${rep.failedCount} pruebas en el Smoke Test. Revise la lista de verificación.`);
      }
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error ejecutando Smoke Tests');
    } finally {
      setOperating(false);
    }
  };

  // 7. Conmutar a Producción
  const handleSwitchProduction = async () => {
    if (confirmationCode.trim() !== 'CONFIRMAR_CAMBIO_SUPABASE') {
      setErrorMsg('Debe escribir exactamente: CONFIRMAR_CAMBIO_SUPABASE');
      return;
    }
    try {
      setOperating(true);
      setOperationTitle('Conmutando producción hacia la nueva instancia Supabase...');
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await AdminSupabaseMigrationRepository.switchProduction(getTargetCreds(), confirmationCode.trim());
      setShowSwitchModal(false);
      setConfirmationCode('');
      setSuccessMsg(`¡PRODUCCIÓN ACTIVADA! La plataforma ahora opera con ${res.activeProjectRef}.`);
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al conmutar a producción');
    } finally {
      setOperating(false);
    }
  };

  // 8. Rollback
  const handleRollback = async () => {
    if (!window.confirm('¿Está seguro de realizar un Rollback inmediato a la conexión previa de Supabase?')) {
      return;
    }
    try {
      setOperating(true);
      setOperationTitle('Restaurando configuración de conexión previa...');
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await AdminSupabaseMigrationRepository.rollbackProduction();
      setSuccessMsg(res.message);
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al ejecutar Rollback');
    } finally {
      setOperating(false);
    }
  };

  // Descargar bundle SQL
  const handleDownloadBundle = async () => {
    try {
      await AdminSupabaseMigrationRepository.downloadSqlBundle();
      setSuccessMsg('Descarga iniciada: supabase_consolidated_migrations.sql con las 156 migraciones oficiales.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error descargando archivo SQL');
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center bg-zinc-900 border border-red-500/30 rounded-2xl max-w-2xl mx-auto my-12 text-zinc-300">
        <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Acceso Restringido a SUPER_ADMIN</h2>
        <p className="text-sm text-zinc-400 mb-4">
          El Centro de Migración y Cambio Controlado de Supabase requiere credenciales de nivel SUPER_ADMIN.
          Su usuario ({currentUserEmail || 'actual'}) no posee las autorizaciones requeridas.
        </p>
      </div>
    );
  }

  const stage = statusData?.stage || 'IDLE';
  const source = statusData?.source;

  return (
    <div className="space-y-8 pb-16">
      {/* HEADER PRINCIPAL */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-amber-950/40 border border-amber-500/20 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-white">
                    Centro de Migración de Supabase
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    SUPER_ADMIN
                  </span>
                  {statusData?.backendAvailable ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" title="Servidor backend Node.js enlazado y activo">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Backend Conectado
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30" title="Hosting estático o VITE_BACKEND_URL no configurada">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      Backend No Configurado
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-400">
                  Transición segura, determinista y auditable hacia un nuevo proyecto Supabase con política Allowlist.
                </p>
              </div>
            </div>
          </div>

          {/* ESTADO DE CONMUTACIÓN / ROLLBACK */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadStatus}
              disabled={loading || operating}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-2 border border-zinc-700 transition"
              title="Recargar estado actual"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>

            <button
              onClick={handleDownloadBundle}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 hover:text-amber-200 text-xs font-semibold flex items-center gap-2 border border-amber-500/30 transition shadow-sm"
              title="Descargar script SQL consolidado con todas las migraciones"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              Descargar SQL Completo ({statusData?.source?.totalMigrationsCount || 166})
            </button>

            {statusData?.isSwitched && (
              <button
                onClick={handleRollback}
                disabled={operating}
                className="px-4 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-200 text-xs font-bold flex items-center gap-2 border border-red-500/40 transition shadow-lg animate-pulse"
                title="Revertir de emergencia a la conexión anterior"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                Rollback de Emergencia
              </button>
            )}
          </div>
        </div>

        {/* TRACKER DE ETAPAS */}
        <div className="mt-8 pt-6 border-t border-zinc-800/80">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center justify-between">
            <span>Flujo Canónico de Migración</span>
            <span className="text-amber-400 font-mono">Etapa Activa: {stage}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
            {[
              { id: '1', name: 'Validar Destino', active: stage === 'VALIDATING_TARGET' },
              { id: '2', name: 'Dry-Run', active: stage === 'DRY_RUN' },
              { id: '3', name: 'Respaldo Previo', active: stage === 'BACKUP_READY' },
              { id: '4', name: 'Esquema SQL (156)', active: stage === 'SCHEMA_MIGRATION' },
              { id: '5', name: 'Migrar Datos (Allowlist)', active: stage === 'DATA_MIGRATION' },
              { id: '6', name: 'Smoke Tests', active: stage === 'FUNCTIONAL_VALIDATION' || stage === 'READY_TO_SWITCH' },
              { id: '7', name: 'Cambio Producción', active: stage === 'COMPLETED' },
            ].map((step, idx) => (
              <div
                key={step.id}
                className={`p-2.5 rounded-xl border flex flex-col justify-between gap-1 transition ${
                  step.active
                    ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm'
                    : 'bg-zinc-800/40 border-zinc-800 text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-between font-mono font-bold text-[10px]">
                  <span>PASO {idx + 1}</span>
                  {step.active && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
                </div>
                <span className="font-semibold truncate">{step.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AVISO DE ENTORNO Y CAPACIDAD REAL (GITHUB PAGES / BACKEND) */}
      {statusData && statusData.backendAvailable === false && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3 shadow-md">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-300">Entorno Estático Detectado / Servidor Backend No Conectado</p>
            <p className="text-zinc-300 leading-relaxed">
              GitHub Pages es un hosting estático que no puede ejecutar procesos Node.js, Express ni gestionar credenciales privilegiadas (service_role).
              Para orquestar migraciones automáticas en vivo, configure la variable de entorno <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-300 font-mono">VITE_BACKEND_URL</code> apuntando a su backend autorizado o ejecute el servidor de desarrollo local con <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-amber-300 font-mono">npm run dev</code>.
            </p>
          </div>
        </div>
      )}

      {/* MENSAJES DE ALERTA O ÉXITO */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm flex items-start gap-3 shadow-md">
          <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-red-300">Incidencia detectada</p>
            <p className="text-xs text-red-200/90 mt-0.5">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200 text-xs">
            Cerrar
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-sm flex items-start gap-3 shadow-md">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-emerald-300">Operación exitosa</p>
            <p className="text-xs text-emerald-200/90 mt-0.5">{successMsg}</p>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 text-xs">
            Cerrar
          </button>
        </div>
      )}

      {/* OVERLAY DE OPERACIÓN EN CURSO */}
      {operating && (
        <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-sm flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
          <div>
            <p className="font-bold">Ejecutando proceso backend seguro...</p>
            <p className="text-xs text-amber-300/80">{operationTitle}</p>
          </div>
        </div>
      )}

      {/* SECCIÓN 1: ESTADO DEL ORIGEN (PRODUCCIÓN ACTUAL) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-md">
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-zinc-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Instancia Supabase Origen (Producción)</h2>
              <p className="text-xs text-zinc-400">
                La fuente de verdad actual. Se mantendrá 100% intacta durante todo el proceso.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                source?.connected
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-red-500/10 text-red-400 border border-red-500/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${source?.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {source?.connected ? 'Conectado y Operativo' : 'Desconectado'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Project Ref</div>
            <div className="text-base font-mono font-bold text-white mt-1">{source?.projectRef || 'N/A'}</div>
            <div className="text-[11px] text-zinc-500 truncate mt-1">{source?.url}</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Migraciones Registradas</div>
            <div className="text-base font-bold text-amber-400 mt-1">{source?.totalMigrationsCount || 0} Archivos</div>
            <div className="text-[11px] text-zinc-400 truncate mt-1">Última: {source?.schemaVersion}</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Esquema y Funciones</div>
            <div className="text-base font-bold text-zinc-200 mt-1">{source?.totalTablesCount || 0} Tablas</div>
            <div className="text-[11px] text-zinc-400 mt-1">{source?.functionsCount || 0} Procedimientos / RPC</div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Administradores en Allowlist</div>
            <div className="text-base font-bold text-emerald-400 mt-1">{source?.superAdminsCount || 0} Super Admins</div>
            <div className="text-[11px] text-zinc-400 mt-1">Roles y accesos preservados</div>
          </div>
        </div>

        {/* Resumen de configuraciones listas para migrar */}
        <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-800 text-xs">
          <span className="font-bold text-zinc-300 uppercase tracking-wider block mb-2">
            Inventario de Parámetros de Plataforma a Conservar:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-zinc-400">
            <div>
              <span className="text-white font-mono font-bold block">
                {source?.configSummary?.systemSettingsCount || 0}
              </span>
              Parámetros Generales
            </div>
            <div>
              <span className="text-white font-mono font-bold block">
                {source?.configSummary?.gameConfigsCount || 0}
              </span>
              Configuraciones Juegos
            </div>
            <div>
              <span className="text-white font-mono font-bold block">
                {source?.configSummary?.entryFeesCount || 0}
              </span>
              Montos de Entrada
            </div>
            <div>
              <span className="text-white font-mono font-bold block">
                {source?.configSummary?.systemAnnouncementsCount || 0}
              </span>
              Comunicados Oficiales
            </div>
            <div>
              <span className="text-white font-mono font-bold block">
                {source?.configSummary?.advertisingAssetsCount || 0}
              </span>
              Banners y Campañas
            </div>
            <div>
              <span className="text-white font-mono font-bold block">
                {source?.configSummary?.manualsCount || 0}
              </span>
              Manuales de Reglas
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: FORMULARIO DE INSTANCIA DESTINO */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-md">
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Configuración del Nuevo Supabase (Destino)</h2>
              <p className="text-xs text-zinc-400">
                Ingrese las credenciales del nuevo proyecto aprovisionado en Supabase.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-amber-400/90 font-mono">
            <Lock className="w-3.5 h-3.5" />
            Cifrado en tránsito y backend
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                URL del Proyecto Supabase Destino <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://[project-id].supabase.co"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Clave Pública (Anon Key) <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={targetAnonKey}
                onChange={(e) => setTargetAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Clave Privilegiada (Service Role Key) <span className="text-red-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowServiceKey(!showServiceKey)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                >
                  {showServiceKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showServiceKey ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <input
                type={showServiceKey ? 'text' : 'password'}
                value={targetServiceRoleKey}
                onChange={(e) => setTargetServiceRoleKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Utilizada exclusivamente por el backend para instalar esquemas y RLS. Nunca se guarda en el navegador.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Cadena de Conexión Directa PostgreSQL <span className="text-zinc-500">(Opcional para Migraciones Directas)</span>
              </label>
              <input
                type="password"
                value={targetDbUrl}
                onChange={(e) => setTargetDbUrl(e.target.value)}
                placeholder="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-amber-500 font-mono"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Permite la ejecución automática de las 156 migraciones SQL directamente desde el servidor.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={handleValidateTarget}
              disabled={operating || !targetUrl || !statusData?.backendAvailable}
              title={!statusData?.backendAvailable ? 'Requiere servidor backend Node.js activo (VITE_BACKEND_URL)' : undefined}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm flex items-center gap-2 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              Paso 1: Validar Conectividad Destino
            </button>

            {validationResult && (
              <div
                className={`text-xs px-3 py-2 rounded-xl flex items-center gap-2 border ${
                  validationResult.valid
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/60 border-red-500/40 text-red-300'
                }`}
              >
                {validationResult.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span>
                  {validationResult.valid ? `Conexión exitosa (${validationResult.latencyMs}ms)` : validationResult.message}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: DRY-RUN Y PLAN DE MIGRACIÓN */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 mb-5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Paso 2: Análisis Dry-Run y Política Allowlist</h2>
              <p className="text-xs text-zinc-400">
                Audita y proyecta la migración sin alterar datos en ninguna de las dos instancias.
              </p>
            </div>
          </div>
          <button
            onClick={handleRunDryRun}
            disabled={operating || !targetUrl || !statusData?.backendAvailable}
            title={!statusData?.backendAvailable ? 'Requiere servidor backend Node.js activo (VITE_BACKEND_URL)' : undefined}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-bold flex items-center gap-2 border border-amber-500/30 transition self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Activity className="w-4 h-4 text-amber-400" />
            Ejecutar Dry-Run
          </button>
        </div>

        {dryRunPlan ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Bloque 1: Creación de Esquema */}
              <div className="p-4 rounded-xl bg-zinc-800/40 border border-zinc-800 space-y-2">
                <div className="font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-400" />
                  Estructura a Instalar
                </div>
                <ul className="text-zinc-300 space-y-1">
                  <li>• {dryRunPlan.willCreate.tables.length} Tablas oficiales</li>
                  <li>• {dryRunPlan.willCreate.extensions.length} Extensiones (uuid-ossp, pgcrypto)</li>
                  <li>• {dryRunPlan.willCreate.functions.length} Procedimientos RPC autorizados</li>
                  <li>• {dryRunPlan.willCreate.storageBuckets.length} Buckets de almacenamiento</li>
                  <li>• {dryRunPlan.willCreate.rlsPoliciesCount}+ Políticas de seguridad RLS</li>
                </ul>
              </div>

              {/* Bloque 2: Datos Permitidos (Allowlist) */}
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                <div className="font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Datos Permitidos (Allowlist)
                </div>
                <p className="text-zinc-300 text-[11px] leading-relaxed">
                  Solo se transfieren perfiles de <strong>SUPER_ADMIN</strong> y las configuraciones de la plataforma.
                </p>
                <div className="text-emerald-400/90 font-mono text-[11px]">
                  ✓ {dryRunPlan.willMigrateData.admins.length} Administradores
                  <br />✓ {dryRunPlan.willMigrateData.configurations.length} Categorías de configuración
                </div>
              </div>

              {/* Bloque 3: Datos Excluidos por Política */}
              <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/30 space-y-2">
                <div className="font-bold text-red-300 uppercase tracking-wider flex items-center gap-2">
                  <Lock className="w-4 h-4 text-red-400" />
                  Datos Excluidos (Salvaguarda)
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Usuarios clientes, saldos de wallets, ledger financiero y partidas históricas quedan aisladas para auditoría.
                </p>
                <div className="text-red-400/90 font-mono text-[11px]">
                  ✗ Cuentas y Balances Financieros
                  <br />✗ Partidas y Sesiones Históricas
                </div>
              </div>
            </div>

            {/* Garantía de Origen */}
            <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700 text-xs text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <strong>Garantía Cero Mutación:</strong> Origen intacto, 0 operaciones DROP ni DELETE sobre la producción actual.
              </span>
              <span className="font-mono text-zinc-400 text-[11px]">ID: {dryRunPlan.id.slice(0, 8)}</span>
            </div>

            {/* Matriz Detallada de Comparación Objeto por Objeto */}
            {dryRunPlan.comparisons && dryRunPlan.comparisons.length > 0 && (
              <div className="border border-zinc-800 rounded-xl overflow-hidden text-xs">
                <div className="p-3 bg-zinc-800/50 font-bold text-zinc-200 border-b border-zinc-800 flex items-center justify-between">
                  <span>Matriz de Inspección Real de Objetos ({dryRunPlan.comparisons.length} evaluados)</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Origen vs Destino</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
                  {dryRunPlan.comparisons.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between gap-4 hover:bg-zinc-800/30">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white truncate">{item.name}</span>
                          <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-mono">
                            {item.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate">{item.notes}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            item.classification === 'MATCH'
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                              : item.classification === 'CREATE'
                              ? 'bg-blue-950/60 text-blue-400 border border-blue-500/30'
                              : item.classification === 'UPDATE_REQUIRED'
                              ? 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
                              : item.classification === 'BLOCKED'
                              ? 'bg-purple-950/60 text-purple-400 border border-purple-500/30'
                              : 'bg-red-950/60 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {item.classification}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
            Pulse &quot;Ejecutar Dry-Run&quot; para auditar la compatibilidad entre el esquema actual de 156 migraciones y el destino.
          </div>
        )}
      </div>

      {/* SECCIÓN 4: ORQUESTACIÓN Y EJECUCIÓN PASO A PASO */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-md">
        <div className="pb-4 mb-6 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Terminal className="w-5 h-5 text-amber-400" />
            Pasos de Ejecución y Migración en Destino
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Ejecute los pasos en secuencia estricta. Cada paso verifica sus precondiciones automáticamente.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* PASO 3: RESPALDO PREVIO */}
          <div className="p-5 rounded-xl bg-zinc-800/40 border border-zinc-800 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Paso 3</span>
                {backupManifest && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
              <h3 className="font-bold text-white text-sm">Respaldo Criptográfico</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Genera un snapshot inmutable de configuraciones y perfiles de administración con firma SHA-256.
              </p>
              {backupManifest && (
                <div className="mt-3 p-2 bg-zinc-900/80 rounded-lg text-[10px] font-mono text-emerald-300 border border-emerald-500/20">
                  ✓ Snapshot {backupManifest.id}
                  <br />Hash: {backupManifest.sha256Hash.slice(0, 16)}...
                </div>
              )}
            </div>
            <button
              onClick={handleCreateBackup}
              disabled={operating || !statusData?.backendAvailable}
              title={!statusData?.backendAvailable ? 'Requiere servidor backend Node.js activo (VITE_BACKEND_URL)' : undefined}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 border border-zinc-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Archive className="w-4 h-4 text-amber-400" />
              Generar Respaldo
            </button>
          </div>

          {/* PASO 4: ESQUEMA */}
          <div className="p-5 rounded-xl bg-zinc-800/40 border border-zinc-800 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Paso 4</span>
                <span className="text-[11px] font-mono text-zinc-500">166 Migraciones</span>
              </div>
              <h3 className="font-bold text-white text-sm">Migración de Esquema SQL</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Aplica en el destino todas las tablas, vistas, triggers, funciones y políticas RLS del repositorio.
              </p>
            </div>
            <button
              onClick={handleMigrateSchema}
              disabled={operating || !targetUrl || !statusData?.backendAvailable}
              title={!statusData?.backendAvailable ? 'Requiere servidor backend Node.js activo (VITE_BACKEND_URL)' : undefined}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 border border-zinc-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Database className="w-4 h-4 text-amber-400" />
              Instalar Esquema en Destino
            </button>
          </div>

          {/* PASO 5: DATOS ALLOWLIST */}
          <div className="p-5 rounded-xl bg-zinc-800/40 border border-zinc-800 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Paso 5</span>
                <span className="text-[11px] font-mono text-emerald-400">Allowlist Estricto</span>
              </div>
              <h3 className="font-bold text-white text-sm">Migración de Datos</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Copia exclusivamente los perfiles de administradores y los catálogos y reglas de configuración.
              </p>
            </div>
            <button
              onClick={handleMigrateData}
              disabled={operating || !targetUrl || !statusData?.backendAvailable}
              title={!statusData?.backendAvailable ? 'Requiere servidor backend Node.js activo (VITE_BACKEND_URL)' : undefined}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 border border-zinc-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Shield className="w-4 h-4 text-emerald-400" />
              Migrar Datos Permitidos
            </button>
          </div>
        </div>
      </div>

      {/* SECCIÓN 5: SMOKE TESTS FUNCIONALES (RPS 3->2->1->0, ABANDONO UNIVERSAL, RPC, RLS) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 mb-5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-lg font-bold text-white">Paso 6: Smoke Tests y Validación Funcional</h2>
              <p className="text-xs text-zinc-400">
                Auditoría integral obligatoria antes de habilitar el botón de cambio a producción.
              </p>
            </div>
          </div>
          <button
            onClick={handleRunSmokeTests}
            disabled={operating || !targetUrl || !statusData?.backendAvailable}
            title={!statusData?.backendAvailable ? 'Requiere servidor backend Node.js activo (VITE_BACKEND_URL)' : undefined}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-md transition self-start sm:self-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Ejecutar Matriz de Smoke Tests
          </button>
        </div>

        {smokeReport ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-zinc-800/60 border border-zinc-700">
              <span className="font-semibold text-zinc-300">
                Resultado General: {smokeReport.allPassed ? '✓ APROBADO PARA PRODUCCIÓN' : '✗ NO APROBADO (REVISAR FALLOS)'}
              </span>
              <span className="font-mono text-zinc-400">
                {smokeReport.passedCount} Pasadas / {smokeReport.warnCount} Avisos / {smokeReport.failedCount} Fallos
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {smokeReport.checks.map((c) => (
                <div
                  key={c.id}
                  className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 ${
                    c.status === 'PASS'
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                      : c.status === 'WARN'
                      ? 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                      : 'bg-red-950/20 border-red-500/30 text-red-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="font-bold flex items-center gap-1.5">
                        {c.status === 'PASS' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                        {c.status === 'WARN' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                        {c.status === 'FAIL' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                        <span>{c.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500 shrink-0">{c.durationMs}ms</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">{c.details}</p>
                  </div>

                  {/* Evidencia Estructurada Real */}
                  {c.evidence && (
                    <div className="p-2 rounded bg-zinc-900/90 border border-zinc-800 text-[10px] font-mono space-y-0.5 text-zinc-300">
                      <div><strong className="text-zinc-500">CHECK:</strong> {c.evidence.check}</div>
                      <div><strong className="text-zinc-500">EXPECTED:</strong> {c.evidence.expected}</div>
                      <div className="text-zinc-300 truncate"><strong className="text-zinc-500">OBSERVED:</strong> {c.evidence.observed}</div>
                      <div>
                        <strong className="text-zinc-500">RESULT:</strong>{' '}
                        <span className={c.evidence.result === 'PASS' ? 'text-emerald-400 font-bold' : c.evidence.result === 'WARN' ? 'text-amber-400 font-bold' : 'text-red-400 font-bold'}>
                          {c.evidence.result}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
            Ejecute los Smoke Tests para verificar la integridad de PostgREST, RLS, Auth, procedmientos RPC, motor RPS (3→2→1→0) y motor universal de abandono.
          </div>
        )}
      </div>

      {/* SECCIÓN 6: CONMUTACIÓN Y CAMBIO A PRODUCCIÓN */}
      <div
        className={`rounded-2xl p-6 border shadow-xl transition ${
          statusData?.canSwitch
            ? 'bg-gradient-to-r from-zinc-900 via-amber-950/30 to-zinc-900 border-amber-500/50'
            : 'bg-zinc-900/60 border-zinc-800 opacity-80'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-amber-400">
              <Zap className="w-5 h-5" />
              <h2 className="text-lg font-black tracking-tight text-white">Paso 7: Conmutación Controlada a Producción</h2>
            </div>
            <p className="text-xs text-zinc-300 max-w-2xl leading-relaxed">
              Al confirmar, el servidor enrutará inmediatamente el tráfico hacia el nuevo Supabase.
              El Supabase original permanecerá intacto y disponible para un Rollback instantáneo de emergencia si fuese necesario.
            </p>
          </div>

          <button
            onClick={() => setShowSwitchModal(true)}
            disabled={operating || !statusData?.canSwitch}
            className={`px-6 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition ${
              statusData?.canSwitch
                ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-amber-500/20 hover:scale-[1.02]'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            Activar Nuevo Supabase en Producción
          </button>
        </div>

        {!statusData?.canSwitch && (
          <div className="mt-4 text-[11px] text-zinc-400 flex items-center gap-2 border-t border-zinc-800/80 pt-3">
            <Lock className="w-3.5 h-3.5 text-amber-500/80" />
            El botón de activación se desbloqueará una vez que se completen exitosamente los Smoke Tests y la validación de integridad.
          </div>
        )}

        {statusData?.isSwitched && statusData.infrastructureSwitchStatus === 'BLOCKED_REQUIRES_MANUAL_SECRETS_UPDATE' && (
          <div className="mt-5 p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 space-y-2">
            <div className="font-bold flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Acción de Infraestructura Requerida (GitHub Secrets / CI/CD)
            </div>
            <p className="text-zinc-300 leading-relaxed">
              El proceso backend Node.js en caliente ha sido conmutado exitosamente a la nueva base de datos.
              Para que la WebApp servida estáticamente en GitHub Pages y los nuevos builds apunten permanentemente al nuevo proyecto,
              un Super Admin o DevOps debe actualizar los siguientes secretos en el repositorio <strong className="text-white">raspandolaolla-app/ve</strong>:
            </p>
            <div className="p-2.5 bg-zinc-900 rounded-lg font-mono text-[11px] text-amber-300/90 space-y-1 border border-zinc-800">
              <div>1. Ir a GitHub → Settings → Secrets and variables → Actions</div>
              <div>2. Actualizar <span className="text-white font-bold">VITE_SUPABASE_URL</span> con la URL del nuevo proyecto</div>
              <div>3. Actualizar <span className="text-white font-bold">VITE_SUPABASE_ANON_KEY</span> con la anon key del nuevo proyecto</div>
              <div>4. Re-ejecutar el workflow de despliegue en GitHub Actions</div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMACIÓN DE CONMUTACIÓN */}
      {showSwitchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-amber-500/40 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-7 h-7" />
              <h3 className="text-xl font-black text-white">Confirmar Cambio a Producción</h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Está a punto de conmutar la infraestructura de <strong>RASPANDO LA OLLA</strong> hacia la nueva instancia de Supabase:
              <br />
              <strong className="text-amber-300 font-mono block mt-1">{statusData?.activeTargetRefMasked || targetUrl}</strong>
            </p>

            <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-200">
              <strong>Procedimiento de Seguridad:</strong> Escriba exactamente{' '}
              <span className="font-mono font-bold text-red-300">CONFIRMAR_CAMBIO_SUPABASE</span> para habilitar la activación.
            </div>

            <input
              type="text"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              placeholder="CONFIRMAR_CAMBIO_SUPABASE"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-amber-500 font-mono"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowSwitchModal(false);
                  setConfirmationCode('');
                }}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSwitchProduction}
                disabled={confirmationCode !== 'CONFIRMAR_CAMBIO_SUPABASE' || operating}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg disabled:opacity-40 transition"
              >
                <Zap className="w-4 h-4" />
                Ejecutar Cambio a Producción
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECCIÓN 7: CONSOLA DE LOGS EN VIVO Y AUDITORÍA FORENSE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LOGS EN VIVO */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col h-80">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800 text-xs">
            <span className="font-bold text-zinc-200 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-400" />
              Consola de Operaciones en Vivo
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">{statusData?.logs?.length || 0} registros</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-2">
            {statusData?.logs && statusData.logs.length > 0 ? (
              statusData.logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`p-1.5 rounded ${
                    log.level === 'error'
                      ? 'bg-red-950/40 text-red-300'
                      : log.level === 'warn'
                      ? 'bg-amber-950/40 text-amber-300'
                      : log.level === 'success'
                      ? 'bg-emerald-950/30 text-emerald-300'
                      : 'text-zinc-400'
                  }`}
                >
                  <span className="text-zinc-600 mr-2">[{log.timestamp.slice(11, 19)}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            ) : (
              <div className="text-zinc-600 italic">Esperando eventos de migración...</div>
            )}
          </div>
        </div>

        {/* AUDITORÍA FORENSE */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md flex flex-col h-80">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800 text-xs">
            <span className="font-bold text-zinc-200 flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              Registro Forense de Auditoría
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Trazabilidad Inmutable</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 text-xs pr-2">
            {statusData?.auditHistory && statusData.auditHistory.length > 0 ? (
              statusData.auditHistory.map((rec) => (
                <div key={rec.id} className="p-2.5 rounded-xl bg-zinc-800/40 border border-zinc-800/80 text-[11px]">
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="font-mono text-amber-400 font-bold">{rec.action}</span>
                    <span className="font-mono text-zinc-500">{rec.timestamp.slice(11, 19)}</span>
                  </div>
                  <div className="text-zinc-300 truncate">Operador: {rec.actorEmail}</div>
                  <div className="text-zinc-500 font-mono text-[10px] mt-0.5">
                    Destino: {rec.targetRefMasked} | Duración: {rec.durationMs}ms | Estado: {rec.result}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-zinc-600 italic text-xs">No hay eventos de auditoría previos en esta sesión.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
