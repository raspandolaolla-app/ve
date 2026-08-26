// ==============================================================================
// RASPANDO LA OLLA — PIE DE PÁGINA
// ==============================================================================

import { FINANCIAL_RULES } from '../../utils/constants';
import { ShieldCheck, Scale, Lock } from 'lucide-react';

export function Footer() {
  return (
    <footer id="app-footer" className="bg-slate-950 border-t border-slate-850 py-8 text-xs text-slate-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-slate-800/80">
          <div>
            <span className="font-bold text-slate-200 tracking-wide text-sm block mb-1">
              RASPANDO LA OLLA
            </span>
            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              Plataforma multijugador online en tiempo real con juegos tradicionales venezolanos,
              juego responsable y sistema de liquidación transparente.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-semibold text-slate-300">Garantías de Plataforma</span>
            <div className="flex items-center gap-2 text-slate-400">
              <Scale className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Regla {FINANCIAL_RULES.WINNER_PERCENT}/{FINANCIAL_RULES.SERVICE_FEE_PERCENT} (90% Ganador / 10% Comisión)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Mayores de {FINANCIAL_RULES.MINIMUM_LEGAL_AGE} años & KYC Verificado</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Lock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Protección de Cuentas & Verificación en Dos Pasos</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 md:items-end">
            <span className="font-semibold text-slate-300">Seguridad Financiera</span>
            <span className="text-slate-400">Conexión Cifrada SSL de Alta Seguridad</span>
            <span className="text-slate-400">Libro Contable Auditado & Fondos Segregados</span>
            <span className="text-amber-400/90 font-mono text-[11px]">Moneda Oficial: Bolívares (Bs.)</span>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-400 text-[11px]">
          <span>© {new Date().getFullYear()} Raspando La Olla. Todos los derechos reservados.</span>
          <span className="text-slate-400">
            Juego Responsable (+18). No se admiten apuestas en jurisdicciones no autorizadas.
          </span>
        </div>
      </div>
    </footer>
  );
}
