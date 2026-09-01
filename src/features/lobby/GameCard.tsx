// ==============================================================================
// RASPANDO LA OLLA — TARJETA PREMIUM DE JUEGO (RESPONSIVE)
// ==============================================================================

import React from 'react';
import { Users, Coins, ArrowRight, Sparkles, Play } from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface GameCardProps {
  game: GameMetadata;
  onlinePlayersCount?: number;
  onSelectGame: (game: GameMetadata) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onlinePlayersCount = 12,
  onSelectGame,
}) => {
  const getGameEmoji = (id: string) => {
    switch (id) {
      case 'domino_venezolano':
        return '🎲';
      case 'truco_venezolano':
        return '🃏';
      case 'bingo':
        return '🎱';
      case 'polla_venezolana':
        return '🐾';
      case 'atrapaito':
        return '🎯';
      case 'checkers':
        return '♟';
      case 'rock_paper_scissors':
        return '✊';
      case 'tic_tac_toe':
        return '⭕';
      case 'chess':
        return '♟️';
      case 'una_olla':
        return '🎴';
      default:
        return '🎮';
    }
  };

  const getGameAccentColor = (id: string) => {
    switch (id) {
      case 'domino_venezolano':
        return 'from-[#FF8A00]/20 to-transparent';
      case 'truco_venezolano':
        return 'from-[#F5B942]/20 to-transparent';
      case 'bingo':
        return 'from-[#2496FF]/20 to-transparent';
      case 'polla_venezolana':
        return 'from-[#22C55E]/20 to-transparent';
      default:
        return 'from-[#FF8A00]/15 to-transparent';
    }
  };

  return (
    <div
      id={`game-card-${game.id}`}
      className="group relative rounded-2xl bg-[#171E2A] hover:bg-[#1E2938] border border-[#1E2938] hover:border-[#FF8A00]/60 transition-all duration-200 flex flex-col justify-between p-4 shadow-lg hover:shadow-xl hover:shadow-[#FF8A00]/5 overflow-hidden"
    >
      {/* Resplandor superior según juego */}
      <div
        className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${getGameAccentColor(
          game.id
        )} rounded-bl-full pointer-events-none transition-opacity group-hover:opacity-100 opacity-60`}
      />

      <div className="space-y-3 relative z-10">
        {/* Cabecera: Icono, Estado Online y Modos */}
        <div className="flex items-start justify-between gap-2">
          <div className="w-12 h-12 rounded-2xl bg-[#111722] border border-[#1E2938] group-hover:border-[#FF8A00]/50 flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform">
            {getGameEmoji(game.id)}
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              <span>{onlinePlayersCount} jug.</span>
            </span>

            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#111722] text-[#94A3B8] border border-[#1E2938]">
              {game.allowedModes.join(', ')}
            </span>
          </div>
        </div>

        {/* Título y Descripción */}
        <div>
          <h3 className="font-black text-[#F8FAFC] text-sm sm:text-base group-hover:text-[#FF8A00] transition-colors leading-snug">
            {game.name}
          </h3>
          <p className="text-[11px] sm:text-xs text-[#94A3B8] leading-relaxed mt-1 line-clamp-2 min-h-[32px]">
            {game.shortDescription}
          </p>
        </div>

        {/* Datos de Jugadores y Entrada */}
        <div className="pt-2 border-t border-[#1E2938] flex items-center justify-between text-[11px] text-[#94A3B8]">
          <div className="flex items-center gap-1.5" title="Capacidad de mesa">
            <Users className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span>
              {game.minPlayers === game.maxPlayers
                ? `${game.minPlayers} jug.`
                : `${game.minPlayers}-${game.maxPlayers} jug.`}
            </span>
          </div>

          <div className="flex items-center gap-1" title="Entrada en Bolívares">
            <Coins className="w-3.5 h-3.5 text-[#F5B942]" />
            <span className="font-mono font-bold text-[#F5B942]">
              {game.minEntryFee} - {game.maxEntryFee} Bs
            </span>
          </div>
        </div>
      </div>

      {/* Botón de Acción */}
      <div className="pt-3 mt-2 relative z-10">
        <button
          id={`btn-open-game-${game.id}`}
          onClick={() => onSelectGame(game)}
          className="w-full py-2 px-3 rounded-xl bg-[#111722] group-hover:bg-[#FF8A00] text-[#F8FAFC] group-hover:text-[#080B12] border border-[#1E2938] group-hover:border-[#FF8A00] font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Jugar ahora</span>
        </button>
      </div>
    </div>
  );
};
