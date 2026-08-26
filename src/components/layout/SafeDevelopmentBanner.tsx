// ==============================================================================
// RASPANDO LA OLLA — REORGANIZACIÓN & PREPARACIÓN DE REPOSITORIO (FASE 14)
// ==============================================================================

import { ShieldCheck, GitBranch } from 'lucide-react';

export function SafeDevelopmentBanner() {
  return (
    <div
      id="safe-development-banner"
      className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2 text-xs text-amber-200/90"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-semibold text-amber-300">FASE 14: PREPARACIÓN DE REPOSITORIO GITHUB</span>
          <span className="hidden sm:inline text-amber-200/70">—</span>
          <span className="text-amber-200/80">
            Frontend funcional localmente. 17 migraciones SQL preparadas. Repositorio: raspandolaolla-app/ve
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-400/90 font-mono text-[11px]">
          <GitBranch className="w-3.5 h-3.5 text-amber-400" />
          <span>github.com/raspandolaolla-app/ve</span>
        </div>
      </div>
    </div>
  );
}

