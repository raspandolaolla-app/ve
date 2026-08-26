// ==============================================================================
// RASPANDO LA OLLA — BARRA DE CONFIANZA Y SEGURIDAD (FASE 21)
// ==============================================================================

import { ShieldCheck, CheckCircle2 } from 'lucide-react';

export function SafeDevelopmentBanner() {
  return (
    <div
      id="safe-development-banner"
      className="bg-emerald-950/30 border-b border-emerald-800/30 px-4 py-1.5 text-xs text-emerald-200/90"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-emerald-300">PLATAFORMA OFICIAL</span>
          <span className="hidden sm:inline text-emerald-200/50">•</span>
          <span className="text-emerald-200/80 text-[11px]">
            Protección de fondos en garantía con regla 90/10 y liquidación transparente.
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400/90 text-[11px]">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Juego Responsable (+18)</span>
        </div>
      </div>
    </div>
  );
}


