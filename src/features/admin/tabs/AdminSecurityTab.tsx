// ==============================================================================
// RASPANDO LA OLLA — TAB 13: ARQUITECTURA DE SEGURIDAD Y ADMINISTRADORES PROTEGIDOS
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../../utils/constants';
import { sanitizeUserErrorMessage } from '../../../utils/errorSanitizer';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { UserRole, ProtectedAdminStatus } from '../../../types/admin';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Server,
  UserCheck,
  RefreshCw,
  UserX,
  HelpCircle,
} from 'lucide-react';

interface AdminSecurityTabProps {
  currentUserRole: UserRole;
  currentUserEmail: string | null;
}

export function AdminSecurityTab({ currentUserRole, currentUserEmail }: AdminSecurityTabProps) {
  const [protectedAdmins, setProtectedAdmins] = useState<ProtectedAdminStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [recoveryLoading, setRecoveryLoading] = useState<string | null>(null);
  const [recoveryReason, setRecoveryReason] = useState<string>('');
  const [selectedTargetRecovery, setSelectedTargetRecovery] = useState<string | null>(null);
  const [recoveryFeedback, setRecoveryFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isCurrentSuperAdmin =
    currentUserRole === 'SUPER_ADMIN' &&
    currentUserEmail !== null &&
    AUTHORIZED_SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === currentUserEmail.toLowerCase());

  const fetchAdminsStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data = await AdminRepository.getProtectedAdminsStatus();
      setProtectedAdmins(data);
    } catch (err) {
      console.error('[AdminSecurityTab] Error consultando estado de administradores protegidos:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminsStatus();
  }, [fetchAdminsStatus]);

  const handlePeerRecovery = async (targetEmail: string) => {
    if (!recoveryReason.trim()) {
      alert('Por favor ingrese el motivo justificado para la recuperación mutua.');
      return;
    }

    setRecoveryLoading(targetEmail);
    setRecoveryFeedback(null);
    try {
      const res = await AdminRepository.initiatePeerRecovery(targetEmail, recoveryReason.trim());
      if (res.success) {
        setRecoveryFeedback({
          type: 'success',
          message: res.message || 'Recuperación mutua completada y auditada con éxito.',
        });
        setSelectedTargetRecovery(null);
        setRecoveryReason('');
        await fetchAdminsStatus();
      } else {
        setRecoveryFeedback({
          type: 'error',
          message: sanitizeUserErrorMessage(res.error, res.message || 'No se pudo completar la recuperación mutua.'),
        });
      }
    } finally {
      setRecoveryLoading(null);
    }
  };

  return (
    <div className="space-y-6" id="tab-admin-security">
      {/* Resumen de Blindaje de Seguridad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card id="card-sec-superadmin" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-xs text-purple-400 mb-2">
            <Key className="w-4 h-4" />
            <span>Super Admins Protegidos</span>
          </div>
          <div className="text-xl font-bold text-slate-100 font-mono">2 Blindados</div>
          <p className="text-[11px] text-slate-400 mt-1">
            Protegidos a nivel de base de datos con recuperación mutua y RLS forzado.
          </p>
        </Card>

        <Card id="card-sec-rbac" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-xs text-emerald-400 mb-2">
            <Server className="w-4 h-4" />
            <span>Control Transaccional</span>
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono">100% Servidor</div>
          <p className="text-[11px] text-slate-400 mt-1">
            Imposible degradar o bloquear a los administradores principales.
          </p>
        </Card>

        <Card id="card-sec-audit" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-xs text-amber-400 mb-2">
            <Lock className="w-4 h-4" />
            <span>Auditoría Inmutable</span>
          </div>
          <div className="text-xl font-bold text-amber-300 font-mono">Activa</div>
          <p className="text-[11px] text-slate-400 mt-1">
            Toda modificación de roles y recuperaciones queda sellada en el registro forense.
          </p>
        </Card>
      </div>

      {/* Control Exclusivo y Diagnóstico de Super Admins */}
      <Card
        id="card-superadmin-whitelist"
        className="bg-slate-900/90 border-slate-800"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Administradores Principales Protegidos (Control y Estado Real)</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                id="btn-refresh-protected-admins"
                variant="outline"
                size="sm"
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={fetchAdminsStatus}
                isLoading={loadingStatus}
                leftIcon={<RefreshCw className="w-3 h-3" />}
              >
                Actualizar Estado
              </Button>
              <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-bold">
                BLINDADO
              </span>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-300">
            Los dos administradores principales cuentan con protección criptográfica y transaccional contra eliminación, bloqueo o pérdida de privilegios:
          </p>

          {recoveryFeedback && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                recoveryFeedback.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-red-950/40 border-red-500/40 text-red-300'
              }`}
            >
              {recoveryFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{recoveryFeedback.message}</span>
            </div>
          )}

          <div className="space-y-3">
            {protectedAdmins.map((admin, idx) => {
              const isCurrent = currentUserEmail?.toLowerCase() === admin.email.toLowerCase();
              const canInitiateRecovery = isCurrentSuperAdmin && !isCurrent;

              return (
                <div
                  key={admin.email}
                  className={`p-4 rounded-xl border space-y-3 ${
                    isCurrent
                      ? 'bg-purple-950/30 border-purple-500/40'
                      : 'bg-slate-950/60 border-slate-850'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200 font-mono text-sm">{admin.email}</span>
                          {isCurrent && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              TU SESIÓN
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{admin.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-purple-950 border border-purple-500/40 text-purple-300">
                        <ShieldCheck className="w-3 h-3" />
                        SUPER_ADMIN
                      </span>

                      {admin.registeredInAuth ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Activo en Supabase Auth
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          <AlertTriangle className="w-3 h-3" />
                          REQUIERE CREACIÓN MANUAL DEL USUARIO EN SUPABASE AUTH
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Estado de Seguridad del Administrador */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Estado Cuenta</span>
                      <span className="font-semibold text-emerald-400">{admin.accountStatus}</span>
                    </div>

                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Protección Base de Datos</span>
                      <span className="font-semibold text-purple-400">INMUTABLE</span>
                    </div>

                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Autenticación Doble Factor</span>
                      <span className={`font-semibold ${admin.isMfaEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {admin.isMfaEnabled ? 'MFA Habilitado' : 'MFA Pendiente'}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Recuperación Mutua</span>
                      <span className="font-semibold text-blue-400">Habilitada</span>
                    </div>
                  </div>

                  {/* Acción de Recuperación Mutua si aplica */}
                  {canInitiateRecovery && (
                    <div className="pt-2">
                      {selectedTargetRecovery === admin.email ? (
                        <div className="p-3 bg-slate-900/90 border border-purple-500/40 rounded-xl space-y-2">
                          <div className="font-semibold text-purple-300 text-xs">
                            Confirmar Procedimiento de Recuperación Mutua para: {admin.email}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Esta acción asegurará el rol SUPER_ADMIN y el estado ACTIVE en la base de datos, emitiendo un registro inmutable de auditoría.
                          </p>
                          <input
                            type="text"
                            placeholder="Motivo justificado de la recuperación..."
                            value={recoveryReason}
                            onChange={(e) => setRecoveryReason(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
                          />
                          <div className="flex gap-2">
                            <Button
                              id={`btn-confirm-peer-recovery-${idx}`}
                              variant="primary"
                              size="sm"
                              className="text-xs bg-purple-600 hover:bg-purple-500"
                              isLoading={recoveryLoading === admin.email}
                              onClick={() => handlePeerRecovery(admin.email)}
                            >
                              Ejecutar Recuperación Mutua
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs text-slate-400"
                              onClick={() => {
                                setSelectedTargetRecovery(null);
                                setRecoveryReason('');
                              }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          id={`btn-init-peer-recovery-${idx}`}
                          variant="outline"
                          size="sm"
                          className="text-xs text-purple-300 border-purple-500/30 hover:bg-purple-500/10"
                          onClick={() => setSelectedTargetRecovery(admin.email)}
                        >
                          Iniciar Verificación / Recuperación Mutua de Par
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Protocolo de Emergencia Oficial */}
      <Card
        id="card-emergency-protocol"
        className="bg-slate-900/90 border-slate-800"
        header={
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span>Protocolo de Seguridad y Recuperación de Emergencia</span>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <p>
            El sistema <strong>NO contiene puertas traseras, contraseñas maestras, ni cuentas ocultas</strong>. La seguridad y recuperación se sustentan en las siguientes garantías:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-850 space-y-1">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                1. Recuperación Mutua entre Administradores
              </span>
              <p className="text-[11px] text-slate-400">
                Si uno de los dos administradores sufre una desincronización de credenciales o perfil, el segundo administrador protegido puede validar y reactivar su rol y estado desde el panel.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-850 space-y-1">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                2. Autenticación y Restablecimiento por Supabase
              </span>
              <p className="text-[11px] text-slate-400">
                El restablecimiento de contraseñas y tokens MFA se gestiona a través del canal oficial de Supabase Auth mediante correos verificados enviados exclusivamente a la bandeja del titular.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

