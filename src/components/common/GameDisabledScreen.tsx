// ==============================================================================
// RASPANDO LA OLLA — PANTALLA DE JUEGO TEMPORALMENTE NO DISPONIBLE
// ==============================================================================

import React from 'react';
import { ShieldAlert, ArrowLeft, Wrench, Clock } from 'lucide-react';
import { Button } from './Button';

interface GameDisabledScreenProps {
  gameName?: string;
  reason?: string | null;
  onBack: () => void;
}

export const GameDisabledScreen: React.FC<GameDisabledScreenProps> = ({
  gameName = 'Este juego',
  reason,
  onBack,
}) => {
  return (
    <div
      id="game-disabled-screen"
      className="min-h-[50vh] flex items-center justify-center p-4 sm:p-6"
    >
      <div className="max-w-md w-full bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden backdrop-blur-md">
        {/* Glow decorativo sutil */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center mb-5 shadow-inner">
          <Wrench className="w-8 h-8 animate-pulse" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-wider mb-3">
          <Clock className="w-3.5 h-3.5" />
          Mantenimiento Temporal
        </span>

        <h2 className="text-xl sm:text-2xl font-black text-slate-100 mb-2">
          {gameName} no disponible
        </h2>

        <p className="text-xs sm:text-sm text-slate-300 mb-5 leading-relaxed">
          Este juego ha sido deshabilitado temporalmente por el administrador para optimizaciones técnicas o mantenimiento preventivo.
        </p>

        {reason && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 mb-6 text-left">
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wide mb-1 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Motivo oficial:
            </div>
            <p className="text-xs text-slate-300 italic">{reason}</p>
          </div>
        )}

        <Button
          id="btn-back-from-disabled-game"
          variant="primary"
          onClick={onBack}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Lobby de Juegos</span>
        </Button>
      </div>
    </div>
  );
};
