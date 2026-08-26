// ==============================================================================
// RASPANDO LA OLLA — PREPARACIÓN & CONEXIÓN DE SUPABASE (FASE 16)
// ==============================================================================

import { ShieldCheck, Database } from 'lucide-react';

export function SafeDevelopmentBanner() {
  return (
    <div
      id="safe-development-banner"
      className="bg-emerald-950/40 border-b border-emerald-800/40 px-4 py-2 text-xs text-emerald-200/90"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-emerald-300">FASE 16: SUPABASE CONECTADO</span>
          <span className="hidden sm:inline text-emerald-200/70">—</span>
          <span className="text-emerald-200/80">
            Instancia vinculada (tncxgwycinbnkjbfwojt.supabase.co). 17 migraciones SQL preparadas para ejecución en Supabase.
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400/90 font-mono text-[11px]">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>tncxgwycinbnkjbfwojt</span>
        </div>
      </div>
    </div>
  );
}

