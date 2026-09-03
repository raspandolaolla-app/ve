import React from 'react';
import { Trophy, Flame, User } from 'lucide-react';
import type { CardProgress } from '../../hooks/useBingoProgress';

export interface LeaderboardProps {
  progress: CardProgress[];
  maxDisplay?: number;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ 
  progress, 
  maxDisplay = 5 
}) => {
  const topPlayers = progress.slice(0, maxDisplay);

  if (topPlayers.length === 0) return null;

  return (
    <div id="bingo-leaderboard" className="bg-slate-900/95 backdrop-blur-md rounded-2xl p-4 shadow-xl border border-slate-800 text-white w-full">
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2.5">
        <h3 className="font-black text-sm uppercase tracking-wider flex items-center gap-2 text-amber-400">
          <Trophy className="w-4 h-4 text-yellow-400 fill-yellow-400" />
          <span>Tabla de Posiciones en Vivo</span>
        </h3>
        <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
          {progress.length} Cartones en Juego
        </span>
      </div>

      <div className="space-y-2">
        {topPlayers.map((player, index) => {
          const isLeader = index === 0;
          const isVeryClose = player.isVeryCloseToWin;
          const isClose = player.isCloseToWin;

          return (
            <div
              key={player.cardId || index}
              id={`leaderboard-item-${index}`}
              className={`
                p-2.5 rounded-xl transition-all border flex flex-col gap-1.5
                ${isVeryClose 
                  ? 'bg-red-500/15 border-red-500/40 text-red-100 shadow-lg shadow-red-950/20' 
                  : isClose
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-100'
                  : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-800'
                }
              `}
            >
              <div className="flex items-center justify-between gap-2">
                {/* Posición y Nombre */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`
                    w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0
                    ${isLeader ? 'bg-amber-400 text-slate-950 font-mono shadow-sm' : 'bg-slate-700 text-slate-300'}
                  `}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                  </span>
                  
                  <span className="font-bold text-xs truncate flex items-center gap-1.5 text-slate-200">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{player.userName}</span>
                  </span>

                  {/* Insignia de proximidad */}
                  {isVeryClose && (
                    <span className="shrink-0 text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1 uppercase">
                      <Flame className="w-3 h-3 fill-current" />
                      <span>A 1 BALOTA</span>
                    </span>
                  )}
                  {isClose && !isVeryClose && (
                    <span className="shrink-0 text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-full uppercase">
                      Faltan {player.numbersNeeded}
                    </span>
                  )}
                </div>

                {/* Números y Porcentaje */}
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    <strong className="text-white font-bold">{player.matchedNumbers}</strong>/{player.totalNumbers}
                  </span>
                  <span className="text-xs font-black font-mono text-amber-400 min-w-[36px] text-right">
                    {player.percentage.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="w-full h-1.5 bg-slate-950/80 rounded-full overflow-hidden border border-slate-700/40">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isVeryClose ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-amber-500 to-yellow-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, player.percentage))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
