// ==============================================================================
// RASPANDO LA OLLA — MODAL GENÉRICO DE FIN DE PARTIDA (3 OPCIONES)
// ==============================================================================

import React from 'react';
import { Trophy, Home, RotateCw, Eye, X, Sparkles, DollarSign } from 'lucide-react';
import { formatBolivares } from '../../utils/formatters';

interface GameEndModalProps {
  isOpen: boolean;
  isWinner: boolean;
  isTie: boolean;
  winnerName?: string;
  prizeAmount?: number;
  gameName: string;
  onGoToLobby: () => void;
  onPlayAgain: () => void;
  onViewLastMove: () => void;
  onClose?: () => void;
}

export const GameEndModal: React.FC<GameEndModalProps> = ({
  isOpen,
  isWinner,
  isTie,
  winnerName = 'Jugador',
  prizeAmount = 0,
  gameName,
  onGoToLobby,
  onPlayAgain,
  onViewLastMove,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-[#080B12]/95 backdrop-blur-md" />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-gradient-to-br from-[#111722] to-[#080B12] border border-[#FF8A00]/30 rounded-3xl shadow-2xl shadow-[#FF8A00]/30 overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-xl hover:bg-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header con resultado */}
        <div className={`relative px-6 py-8 text-center ${
          isWinner
            ? 'bg-gradient-to-br from-emerald-500/20 via-amber-500/20 to-emerald-500/20'
            : isTie
            ? 'bg-gradient-to-br from-slate-600/20 via-slate-500/20 to-slate-600/20'
            : 'bg-gradient-to-br from-red-500/10 via-slate-600/10 to-red-500/10'
        }`}>
          {/* Icono principal */}
          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 ${
            isWinner
              ? 'bg-gradient-to-br from-amber-400 to-yellow-500 shadow-2xl shadow-amber-500/50'
              : isTie
              ? 'bg-gradient-to-br from-slate-500 to-slate-600'
              : 'bg-gradient-to-br from-slate-700 to-slate-800'
          }`}>
            {isWinner ? (
              <Trophy className="w-14 h-14 text-white" strokeWidth={2.5} />
            ) : isTie ? (
              <span className="text-5xl">🤝</span>
            ) : (
              <span className="text-5xl">😔</span>
            )}
          </div>

          {/* Título resultado */}
          <h2 className={`text-3xl sm:text-4xl font-black mb-2 tracking-tight ${
            isWinner ? 'text-amber-400' : isTie ? 'text-slate-200' : 'text-slate-300'
          }`}>
            {isWinner ? '¡VICTORIA!' : isTie ? '¡EMPATE!' : 'PARTIDA FINALIZADA'}
          </h2>

          {/* Subtítulo */}
          <p className="text-sm text-[#94A3B8] font-semibold">
            {isWinner ? (
              <>¡Felicidades, ganaste en <span className="text-[#F5B942]">{gameName}</span>!</>
            ) : isTie ? (
              <>Empate técnico en <span className="text-[#F5B942]">{gameName}</span></>
            ) : (
              <><span className="text-[#F5B942] font-bold">{winnerName}</span> ganó la partida</>
            )}
          </p>

          {/* Premio si ganó */}
          {isWinner && prizeAmount > 0 && (
            <div className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-500/40">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <span className="text-xl font-black text-emerald-300 font-mono">
                +{formatBolivares(prizeAmount)}
              </span>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="p-6 space-y-3">
          {/* Opción 1: Jugar de Nuevo (Destacado) */}
          <button
            onClick={onPlayAgain}
            className="w-full group relative overflow-hidden py-4 rounded-2xl bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-[#080B12] font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-[#FF8A00]/30 hover:brightness-110 active:scale-95 transition-all"
          >
            <RotateCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            <span>JUGAR DE NUEVO</span>
          </button>

          {/* Opción 2: Ver Última Jugada */}
          <button
            onClick={onViewLastMove}
            className="w-full py-3.5 rounded-2xl bg-[#171E2A] hover:bg-[#1E2938] border border-[#1E2938] hover:border-[#FF8A00]/50 text-[#F8FAFC] font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Eye className="w-4 h-4 text-[#F5B942]" />
            <span>Ver Última Jugada</span>
          </button>

          {/* Opción 3: Regresar al Lobby */}
          <button
            onClick={onGoToLobby}
            className="w-full py-3.5 rounded-2xl bg-transparent hover:bg-[#171E2A] border border-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <Home className="w-4 h-4" />
            <span>Regresar al Lobby</span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 pb-4 pt-1 text-center">
          <p className="text-[10px] text-[#94A3B8] flex items-center justify-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#F5B942]" />
            <span>Partida liquidada automáticamente · 90% ganador · 10% plataforma</span>
          </p>
        </div>
      </div>
    </div>
  );
};
