// ==============================================================================
// RASPANDO LA OLLA — MODAL DE RESULTADOS Y LIQUIDACIÓN FINANCIERA (90/10)
// ==============================================================================

import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Trophy, XCircle, ShieldCheck, RotateCcw, Eye, Home, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { AdPlacementContainer } from '../../../components/advertising/AdPlacementContainer';

interface SettlementModalProps {
  isOpen: boolean;
  winnerName: string;
  isWinner: boolean;
  isDraw?: boolean;
  isSuccess?: boolean;
  settlementError?: string | null;
  isSettling?: boolean;
  onRetry?: () => void;
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
  isSuccess,
  settlementError,
  isSettling = false,
  onRetry,
  grossPool,
  prizePool,
  platformFee,
  onReturnToLobby,
  onPlayAgain,
  onBackToTable,
  gameType,
  scoreSummary,
}) => {
  useEffect(() => {
    if (isOpen) {
      console.log('[UI_RESULT_RENDERED]', {
        gameType,
        winnerName,
        isWinner,
        isDraw,
        isSuccess,
        grossPool,
        prizePool,
        scoreSummary,
      });
    }
  }, [isOpen, gameType, winnerName, isWinner, isDraw, isSuccess, grossPool, prizePool, scoreSummary]);

  if (!isOpen) return null;

  const isFailedSettlement = isSuccess === false;

  // Determinar los textos e indicadores canónicos sin inventar estados
  const titleText = isFailedSettlement
    ? isDraw
      ? '🤝 ¡Partida Empatada!'
      : isWinner
      ? '🏆 ¡Victoria en el Tablero!'
      : '❌ Partida Finalizada'
    : isDraw 
    ? '🤝 ¡Empate!' 
    : isWinner 
    ? '🏆 ¡Ganador!' 
    : '❌ Perdiste';

  const subtitleText = isFailedSettlement
    ? (settlementError || 'No fue posible completar la liquidación de inmediato. Tu saldo permanece protegido por el sistema.')
    : isDraw
    ? 'Ningún jugador logró la victoria de la mesa. Reembolso del pozo completo acreditado.'
    : isWinner
    ? '🎉 ¡Felicitaciones! Has superado al oponente y asegurado el pozo de la mesa.'
    : `El ganador de la mesa fue ${winnerName || 'el rival'}. ¡Mejor suerte en la próxima partida!`;

  return (
    <div 
      id="settlement-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-950/85 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-2xl overflow-hidden relative my-auto"
      >
        {/* Encabezado con estado del juego */}
        <div className="flex flex-col items-center text-center mb-5">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3.5 shadow-xl border ${
              isFailedSettlement
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 ring-2 ring-amber-500/20'
                : isDraw
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : isWinner
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-neutral-950 border-amber-400 ring-4 ring-amber-400/20 animate-bounce'
                : 'bg-red-500/10 text-red-400 border-red-500/30 ring-2 ring-red-500/20'
            }`}
          >
            {isFailedSettlement ? (
              <AlertTriangle className="w-8 h-8" />
            ) : isDraw ? (
              <ShieldCheck className="w-8 h-8" />
            ) : isWinner ? (
              <Trophy className="w-8 h-8" />
            ) : (
              <XCircle className="w-8 h-8" />
            )}
          </div>

          <h3 
            id="settlement-modal-title"
            className={`text-2xl sm:text-3xl font-black tracking-tight uppercase ${
              isFailedSettlement
                ? 'text-amber-400'
                : isDraw 
                ? 'text-blue-400' 
                : isWinner 
                ? 'text-amber-400' 
                : 'text-red-400'
            }`}
          >
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

        {/* Ganador de la Mesa */}
        {!isDraw && (
          <div 
            id="settlement-winner-badge"
            className="mb-4 p-3.5 rounded-2xl bg-neutral-950/80 border border-neutral-800 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2 truncate">
              <span className="text-base shrink-0">🏆</span>
              <span className="text-[11px] sm:text-xs text-neutral-400 font-semibold uppercase tracking-wider">
                Ganador:
              </span>
            </div>
            <strong className="text-xs sm:text-sm text-amber-400 uppercase font-black tracking-wider truncate max-w-[180px] text-right">
              {winnerName}
            </strong>
          </div>
        )}

        {/* Desglose Financiero */}
        <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-2xl p-4 mb-5 space-y-2.5">
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

          <div className="mt-2 pt-2 border-t border-neutral-800/40 flex items-start space-x-2 text-[10px] text-neutral-400 leading-relaxed">
            {isFailedSettlement ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-amber-300 font-medium">
                  {settlementError || 'Liquidación financiera en proceso de verificación. Tu saldo retenido está protegido.'}
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {isDraw
                    ? 'Reembolso íntegro acreditado inmediatamente en tu billetera.'
                    : isWinner
                    ? 'Premio de victoria acreditado en tu disponible bajo contrato 90/10.'
                    : 'Liquidación oficial autoritativa completada por el sistema.'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Publicidad de Fin de Partida */}
        <AdPlacementContainer
          placement="GAME_RESULT"
          gameType={gameType}
          showBadge={true}
          className="mb-4"
        />

        {/* Botones de Acción Canónicos */}
        <div className="flex flex-col gap-2">
          {isFailedSettlement && onRetry && (
            <button
              id="settlement-btn-retry"
              onClick={onRetry}
              disabled={isSettling}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-xs flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 transition-all uppercase tracking-wider cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${isSettling ? 'animate-spin' : ''}`} />
              <span>{isSettling ? 'Sincronizando billetera...' : '🔄 Reintentar liquidación'}</span>
            </button>
          )}

          {onPlayAgain && (
            <button
              id="settlement-btn-play-again"
              onClick={onPlayAgain}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-neutral-950 font-black text-xs flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20 transition-all uppercase tracking-wider cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>🔄 Jugar de nuevo</span>
            </button>
          )}

          {onBackToTable && (
            <button
              id="settlement-btn-inspect-board"
              onClick={onBackToTable}
              className="w-full py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-200 font-bold text-xs flex items-center justify-center space-x-2 border border-neutral-700 transition-all uppercase tracking-wider cursor-pointer active:scale-95"
            >
              <Eye className="w-4 h-4 text-neutral-400 shrink-0" />
              <span>👁️ Ver tablero final</span>
            </button>
          )}

          <button
            id="settlement-btn-return-lobby"
            onClick={onReturnToLobby}
            className="w-full py-2.5 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-white font-bold text-xs flex items-center justify-center space-x-2 border border-neutral-800 transition-all uppercase tracking-wider cursor-pointer active:scale-95"
          >
            <Home className="w-3.5 h-3.5 shrink-0" />
            <span>🏠 Regresar al lobby</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
