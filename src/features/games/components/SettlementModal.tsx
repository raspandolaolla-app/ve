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
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl overflow-hidden relative"
      >
        {/* Encabezado */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-xl ${
              isDraw
                ? 'bg-neutral-800 text-blue-400 border border-neutral-700'
                : isWinner
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-neutral-950 ring-4 ring-amber-400/30 animate-bounce'
                : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
            }`}
          >
            <Trophy className="w-8 h-8" />
          </div>

          <h3 className="text-2xl font-black text-white">
            {isDraw ? '¡Empate Técnico!' : isWinner ? '¡Victoria Confirmada!' : 'Fin de la Partida'}
          </h3>
          <p className="text-sm text-neutral-400 mt-1">
            {isDraw ? (
              <span className="text-blue-400">Reembolso íntegro del 100% a todos los jugadores</span>
            ) : (
              <>
                Ganador: <strong className="text-amber-400">{winnerName}</strong>
              </>
            )}
          </p>
        </div>

        {/* Desglose Financiero */}
        <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-2xl p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
            <span>Pozo Bruto de la Mesa:</span>
            <span className="font-semibold text-white">{formatBolivares(grossPool)}</span>
          </div>

          <div className="h-px bg-neutral-800" />

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

          <div className="mt-2 pt-2 border-t border-neutral-800/60 flex items-center space-x-1.5 text-[11px] text-neutral-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              {isDraw
                ? 'Reembolso íntegro acreditado inmediatamente en tu billetera.'
                : 'Premio acreditado inmediatamente con garantía de transparencia 90/10.'}
            </span>
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="flex flex-col gap-2.5">
          {onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-lg transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Jugar Otra Partida</span>
            </button>
          )}

          <button
            onClick={onReturnToLobby}
            className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-sm flex items-center justify-center space-x-2 border border-neutral-700 transition-all"
          >
            <span>Volver a las Mesas</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
