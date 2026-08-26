// ==============================================================================
// RASPANDO LA OLLA — TAB 13: ARQUITECTURA DE SEGURIDAD Y CONTROL EXCLUSIVO
// ==============================================================================

import { Card } from '../../../components/common/Card';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../../utils/constants';
import type { UserRole } from '../../../types/admin';
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
} from 'lucide-react';

interface AdminSecurityTabProps {
  currentUserRole: UserRole;
  currentUserEmail: string | null;
}

export function AdminSecurityTab({ currentUserRole, currentUserEmail }: AdminSecurityTabProps) {
  return (
    <div className="space-y-6" id="tab-admin-security">
      {/* Resumen de Blindaje de Seguridad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card id="card-sec-superadmin" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-xs text-purple-400 mb-2">
            <Key className="w-4 h-4" />
            <span>Super Admins Exclusivos</span>
          </div>
          <div className="text-xl font-bold text-slate-100 font-mono">2 Autorizados</div>
          <p className="text-[11px] text-slate-400 mt-1">
            Lista blanca estricta con verificación en PostgreSQL y frontend.
          </p>
        </Card>

        <Card id="card-sec-rbac" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-xs text-emerald-400 mb-2">
            <Server className="w-4 h-4" />
            <span>Protección RLS + RBAC</span>
          </div>
          <div className="text-xl font-bold text-emerald-400 font-mono">100% Servidor</div>
          <p className="text-[11px] text-slate-400 mt-1">
            Ninguna acción financiera depende únicamente de la vista de React.
          </p>
        </Card>

        <Card id="card-sec-audit" className="bg-slate-900/90 border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-xs text-amber-400 mb-2">
            <Lock className="w-4 h-4" />
            <span>Auditoría Inmutable</span>
          </div>
          <div className="text-xl font-bold text-amber-300 font-mono">Triggers SQL</div>
          <p className="text-[11px] text-slate-400 mt-1">
            Bloqueo inmutable contra modificación o borrado de eventos.
          </p>
        </Card>
      </div>

      {/* Control Exclusivo de Super Admins */}
      <Card
        id="card-superadmin-whitelist"
        className="bg-slate-900/90 border-slate-800"
        header={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Lista Blanca Exclusiva de Super Administradores</span>
            </div>
            <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-bold">
              ESTRICTO
            </span>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-300">
            Únicamente los siguientes dos correos electrónicos son reconocidos como administradores principales con acceso a control de roles y configuraciones críticas:
          </p>

          <div className="space-y-2">
            {AUTHORIZED_SUPER_ADMIN_EMAILS.map((email, idx) => {
              const isCurrent = currentUserEmail?.toLowerCase() === email.toLowerCase();
              return (
                <div
                  key={email}
                  className={`p-3 rounded-xl border flex items-center justify-between font-mono ${
                    isCurrent
                      ? 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                      : 'bg-slate-950/60 border-slate-850 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-purple-400" />
                    <span>{email}</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                    SUPER_ADMIN {isCurrent ? '(Sesión Actual)' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Directivas de Seguridad Operativa */}
      <Card
        id="card-security-policies-checklist"
        className="bg-slate-900/90 border-slate-800"
        header={
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span>Matriz de Seguridad y Políticas Activas</span>
          </div>
        }
      >
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Idempotencia en RPCs:</strong> Las funciones `process_deposit_approval` y `process_withdrawal_completion` validan el estado PENDING de forma atómica para evitar acreditaciones o retiros duplicados.
            </span>
          </div>

          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Validación en Doble Capa:</strong> La verificación de SUPER_ADMIN combina la verificación del UUID en `user_roles` con la autenticación del correo en base de datos.
            </span>
          </div>

          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-slate-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Sin Exposición de Secretos:</strong> Tokens de servicio, URLs internas y cadenas de conexión no se muestran en ninguna pantalla del frontend.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
