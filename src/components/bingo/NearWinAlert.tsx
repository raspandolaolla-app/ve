import React from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import type { CardProgress } from '../../hooks/useBingoProgress';

export interface NearWinAlertProps {
  progress: CardProgress[];
}

export const NearWinAlert: React.FC<NearWinAlertProps> = ({ progress }) => {
  // Filtrar solo los que están cerca de ganar (3 balotas o menos) y que no hayan ganado aún
  const closeCards = progress.filter(p => !p.isWinner && (p.isVeryCloseToWin || p.isCloseToWin));
  
  if (closeCards.length === 0) return null;

  return (
    <div
      id="bingo-near-win-alert"
      className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 space-y-2 w-full max-w-md px-4 pointer-events-none"
    >
      {closeCards.slice(0, 3).map((card, index) => (
        <div
          key={card.cardId || index}
          id={`near-win-card-${card.cardId}`}
          className={`
            animate-bounce-in rounded-2xl shadow-2xl p-4 flex items-center gap-4 transition-all
            ${card.isVeryCloseToWin 
              ? 'bg-gradient-to-r from-red-600 via-red-500 to-orange-500 animate-pulse-fast' 
              : 'bg-gradient-to-r from-yellow-500 via-amber-400 to-orange-400'
            }
            text-white border-4 ${card.isVeryCloseToWin ? 'border-red-300' : 'border-yellow-300'}
          `}
          style={{
            animationDelay: `${index * 100}ms`,
            pointerEvents: 'auto',
          }}
        >
          {/* Icono según nivel */}
          <div className={`
            p-3 rounded-full bg-white/20
            ${card.isVeryCloseToWin ? 'animate-spin-slow' : ''}
          `}>
            {card.isVeryCloseToWin ? (
              <Zap className="w-8 h-8 text-white" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-white" />
            )}
          </div>

          {/* Información */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black uppercase tracking-wider opacity-90 flex items-center gap-1">
              {card.isVeryCloseToWin ? '🔥 ¡A UNO DE GANAR! ⚠️ A 1 BALOTA' : '⚠️ ¡CERCA DE GANAR!'}
            </p>
            <p className="text-lg font-black truncate">
              {card.userName}
            </p>
            <p className="text-sm font-semibold opacity-90">
              {card.isVeryCloseToWin 
                ? '¡Solo le falta 1 balota para cantar BINGO!' 
                : `Le faltan ${card.numbersNeeded} balotas para cantar BINGO`
              }
            </p>
          </div>

          {/* Porcentaje */}
          <div className="text-right shrink-0">
            <p className="text-3xl font-black font-mono">{card.percentage.toFixed(0)}%</p>
            <div className="w-16 h-2 bg-white/30 rounded-full mt-1 overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, card.percentage))}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
