// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE DE INFORMACIÓN DE SEGURIDAD Y AUTH
// ==============================================================================
import React from 'react';
import { ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';

interface TwoFactorSetupProps {
  isMfaEnabled?: boolean;
  onStatusChange?: () => void;
}

export function TwoFactorSetup({ isMfaEnabled = true }: TwoFactorSetupProps) {
  return (
    <div className="space-y-4">
      {/* Estado Actual */}
      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h4 className="text-xs font-semibold text-slate-200">
                Autenticación Segura de Cuenta
              </h4>
              <p className="text-[11px] text-slate-400">
                Protección mediante Google OAuth 2.0 y token de sesión verificado.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-950/60 text-emerald-400 border-emerald-800/50">
            {isMfaEnabled ? 'Protegido' : 'Activo'}
          </span>
        </div>

        <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Seguridad gestionada por proveedor de identidad</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Tu cuenta se encuentra protegida con verificación OAuth 2.0. Las operaciones financieras críticas (recargas, retiros, apuestas) están blindadas mediante firmas criptográficas y controles de autorización en el servidor.
          </p>
        </div>
      </div>
    </div>
  );
}

