// ==============================================================================
// RASPANDO LA OLLA — BOTONES PRINCIPALES DE ACCIÓN RÁPIDA (MESA / POLLA)
// ==============================================================================
// Ubicación: Zona Superior de la WebApp, inmediatamente encima del video publicitario.
// Componente prioritario de navegación táctil para PC, Tablet, Móvil y PWA.
// ==============================================================================

import React from 'react';
import { Gamepad2, Trophy, Sparkles, ArrowRight, Flame } from 'lucide-react';
import { useGameAvailability } from '../../context/GameAvailabilityContext';

interface LobbyMainActionButtonsProps {
  onNavigateTab: (tab: string) => void;
  className?: string;
}

export const LobbyMainActionButtons: React.FC<LobbyMainActionButtonsProps> = ({
  onNavigateTab,
  className = '',
}) => {
  const { isGameEnabled } = useGameAvailability();
  const isPollaActive = isGameEnabled('polla_venezolana');

  return (
    <div
      id="lobby-main-action-buttons"
      role="navigation"
      aria-label="Accesos principales a Mesas y Polla"
      className={`w-full max-w-5xl mx-auto ${className}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* BOTÓN PRINCIPAL 1: MESAS & SALAS */}
        <button
          id="main-btn-tables"
          type="button"
          onClick={() => onNavigateTab('tables')}
          className="group relative overflow-hidden rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 bg-gradient-to-br from-[#131B2E] via-[#0E1526] to-[#0A0E1A] border-2 border-amber-500/40 hover:border-amber-400 active:border-amber-300 shadow-xl shadow-amber-500/10 hover:shadow-amber-500/25 transition-all duration-300 active:scale-[0.98] text-left cursor-pointer flex items-center justify-between gap-3 select-none"
        >
          {/* Resplandor ambiental de fondo */}
          <div className="absolute -right-8 -top-8 w-28 h-28 bg-amber-500/15 rounded-full blur-2xl group-hover:bg-amber-500/25 transition-colors pointer-events-none" />

          <div className="relative z-10 flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Contenedor de Icono */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 p-0.5 shadow-lg shadow-amber-500/30 shrink-0 group-hover:scale-105 transition-transform duration-300">
              <div className="w-full h-full bg-[#090D16] rounded-[14px] flex items-center justify-center">
                <Gamepad2 className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400 group-hover:text-amber-300 transition-colors" />
              </div>
            </div>

            {/* Textos y Etiquetas */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] sm:text-xs font-black uppercase tracking-wider border border-amber-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Mesas en Vivo</span>
                </span>
              </div>
              <h2 className="text-base sm:text-lg md:text-xl font-black text-white tracking-wide uppercase leading-tight group-hover:text-amber-300 transition-colors truncate">
                Mesas & Salas
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-1 mt-0.5 font-medium">
                Dominó, Truco, Atrapaíto, Damas y más
              </p>
            </div>
          </div>

          {/* Flecha de Acción */}
          <div className="relative z-10 shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 text-amber-400 transition-all duration-200 shadow-md">
            <ArrowRight className="w-4 h-4 sm:w-4.5 sm:h-4.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* BOTÓN PRINCIPAL 2: POLLA VENEZOLANA */}
        <button
          id="main-btn-polla"
          type="button"
          onClick={() => onNavigateTab('polla')}
          disabled={!isPollaActive}
          className={`group relative overflow-hidden rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 text-left transition-all duration-300 select-none flex items-center justify-between gap-3 ${
            isPollaActive
              ? 'bg-gradient-to-br from-[#241306] via-[#1A0E05] to-[#0D0703] border-2 border-[#FF8A00]/50 hover:border-[#FF8A00] active:border-amber-300 shadow-xl shadow-orange-500/15 hover:shadow-orange-500/30 active:scale-[0.98] cursor-pointer'
              : 'bg-slate-900/60 border-2 border-slate-800 opacity-60 cursor-not-allowed'
          }`}
        >
          {/* Resplandor ambiental de fondo */}
          {isPollaActive && (
            <div className="absolute -right-8 -top-8 w-28 h-28 bg-[#FF8A00]/20 rounded-full blur-2xl group-hover:bg-[#FF8A00]/30 transition-colors pointer-events-none" />
          )}

          <div className="relative z-10 flex items-center gap-3 sm:gap-4 min-w-0">
            {/* Contenedor de Icono */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-[#FF8A00] via-[#F5B942] to-amber-300 p-0.5 shadow-lg shadow-[#FF8A00]/30 shrink-0 group-hover:scale-105 transition-transform duration-300">
              <div className="w-full h-full bg-[#0C0703] rounded-[14px] flex items-center justify-center text-xl sm:text-2xl select-none">
                🐾
              </div>
            </div>

            {/* Textos y Etiquetas */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FF8A00]/25 text-amber-200 text-[10px] sm:text-xs font-black uppercase tracking-wider border border-[#FF8A00]/40">
                  <Flame className="w-3 h-3 text-[#FF8A00] fill-[#FF8A00]" />
                  <span>Gran Pozo Acumulado</span>
                </span>
              </div>
              <h2 className="text-base sm:text-lg md:text-xl font-black text-white tracking-wide uppercase leading-tight group-hover:text-[#F5B942] transition-colors truncate">
                Polla Venezolana
              </h2>
              <p className="text-[11px] sm:text-xs text-amber-200/80 line-clamp-1 mt-0.5 font-medium">
                Pronósticos deportivos y sorteos garantizados
              </p>
            </div>
          </div>

          {/* Flecha de Acción */}
          <div className="relative z-10 shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#FF8A00]/15 border border-[#FF8A00]/40 flex items-center justify-center group-hover:bg-gradient-to-r group-hover:from-[#FF8A00] group-hover:to-[#F5B942] group-hover:text-slate-950 text-[#FF8A00] transition-all duration-200 shadow-md">
            <ArrowRight className="w-4 h-4 sm:w-4.5 sm:h-4.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      </div>
    </div>
  );
};
