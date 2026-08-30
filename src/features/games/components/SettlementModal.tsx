// ==============================================================================
// RASPANDO LA OLLA — MODAL DE LIQUIDACIÓN FINANCIERA (SETTLEMENT 90/10)
// ==============================================================================

import React from 'react';
import { motion } from 'motion/react';
import { Trophy, ShieldCheck, ArrowRight, RotateCcw } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';

interface SettlementModalProps {
  isOpen: boolean;
  winnerName: string;
  isWinner: boolean;
  isDraw?: boolean;
  grossPool: number;
  prizePool: number;
  platformFee: number;
  onReturnToLobby: () => void;
  onPlayAgain?: () => void;
  onBackToTable?: () => void;
  gameType?: string;
  scoreSummary?: string;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  isOpen,
  winnerName,
  isWinner,
  isDraw = false,
  grossPool,
  prizePool,
  platformFee,
  onReturnToLobby,
  onPlayAgain,
  onBackToTable,
  gameType,
  scoreSummary,
}) => {
  if (!isOpen) return null;

  // Determinar los mensajes según el resultado (Victoria, Derrota, Empate)
  const titleText = isDraw 
    ? '🤝 ¡Empate!' 
    : isWinner 
    ? '🏆 ¡Victoria!' 
    : 'Partida Finalizada';

  const subtitleText = isDraw
    ? 'Ningún jugador logró la victoria de la mesa. Reembolso del pozo completo.'
    : isWinner
    ? '🎉 ¡Ganaste! Has superado al oponente y asegurado el pozo de la mesa.'
    : '¡Mejor suerte en la próxima! Sigue practicando para adueñarte de la olla.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/85 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-md bg-neutral-900 border border-neutral-850 rounded-3xl p-6 shadow-2xl overflow-hidden relative"
      >
        {/* Encabezado con estado del juego */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-xl border ${
              isDraw
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : isWinner
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-neutral-950 border-amber-400 ring-4 ring-amber-400/20 animate-bounce'
                : 'bg-red-500/10 text-red-400 border-red-500/30'
            }`}
          >
            <Trophy className="w-8 h-8" />
          </div>

          <h3 className="text-2xl font-black text-white tracking-tight uppercase">
            {titleText}
          </h3>
          <p className="text-xs text-neutral-400 max-w-xs mt-1.5 leading-relaxed">
            {subtitleText}
          </p>
        </div>

        {/* Resumen del Marcador / Rondas (Opcional) */}
        {scoreSummary && (
          <div className="mb-4 text-center">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
              <span>{scoreSummary}</span>
            </span>
          </div>
        )}

        {/* Ganador */}
        {!isDraw && (
          <div className="mb-5 p-3 rounded-xl bg-neutral-950/60 border border-neutral-850 flex items-center justify-center gap-2">
            <span className="text-[10px] text-neutral-500 font-mono font-semibold uppercase tracking-wider">
              Campeón de la Mesa:
            </span>
            <strong className="text-xs text-amber-400 uppercase font-black tracking-wider">
              {winnerName}
            </strong>
          </div>
        )}

        {/* Desglose Financiero */}
        <div className="bg-neutral-950/80 border border-neutral-850 rounded-2xl p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
            <span>Pozo Bruto de la Mesa:</span>
            <span className="font-semibold text-white">{formatBolivares(grossPool)}</span>
          </div>

          <div className="h-px bg-neutral-800/60" />

          {isDraw ? (
            <div className="flex items-center justify-between text-sm font-bold text-blue-400">
              <span>Monto Reembolsado (100%):</span>
              <span className="font-mono">{formatBolivares(grossPool)}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm font-bold text-emerald-400">
              <span>Premio Ganador (90%):</span>
              <span className="font-mono">{formatBolivares(prizePool)}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-neutral-500 font-mono">
            <span>Comisión de Servicio ({isDraw ? '0%' : '10%'}):</span>
            <span>{formatBolivares(isDraw ? 0 : platformFee)}</span>
          </div>

          <div className="mt-2.5 pt-2 border-t border-neutral-800/40 flex items-start space-x-2 text-[10px] text-neutral-400 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              {isDraw
                ? 'Reembolso íntegro acreditado inmediatamente en tu billetera.'
                : 'Premio de victoria acreditado inmediatamente bajo la gobernanza de contratos 90/10 de Supabase.'}
            </span>
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="flex flex-col gap-2">
          {onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-lg shadow-amber-500/10 transition-all uppercase tracking-wider"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Jugar de Nuevo</span>
            </button>
          )}

          {onBackToTable && (
            <button
              onClick={onBackToTable}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs flex items-center justify-center space-x-1.5 border border-neutral-750 transition-all uppercase tracking-wider"
            >
              <span>Inspeccionar Mesa / Ver Tablero</span>
            </button>
          )}

          <button
            onClick={onReturnToLobby}
            className="w-full py-2.5 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white font-bold text-xs flex items-center justify-center space-x-1.5 border border-neutral-800 transition-all uppercase tracking-wider"
          >
            <span>Volver al Lobby de Mesas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
