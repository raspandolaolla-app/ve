// ==============================================================================
// RASPANDO LA OLLA — TARJETA DE JUEGO MEJORADA (VERSIÓN SEGURA)
// ==============================================================================

import React from 'react';
import { Users, Zap, Trophy, Play } from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface GameCardProps {
  game: GameMetadata;
  onlinePlayersCount: number;
  onSelectGame: (game: GameMetadata) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onlinePlayersCount,
  onSelectGame,
}) => {
  const handleClick = () => {
    onSelectGame(game);
  };

  return (
    <div
      onClick={handleClick}
      className="relative group cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-[#171E2A] to-[#111722] border border-[#1E2938] hover:border-[#FF8A00]/50 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-[#FF8A00]/20 hover:-translate-y-1"
    >
      {/* Fondo decorativo con gradiente */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF8A00]/5 via-transparent to-[#F5B942]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Badge de popularidad */}
      {onlinePlayersCount > 10 && (
        <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-[#080B12] text-[10px] font-black flex items-center gap-1 shadow-lg animate-pulse">
          <Zap className="w-3 h-3" />
          <span>HOT</span>
        </div>
      )}

      {/* Icono del juego */}
      <div className="relative p-4 pb-2">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#FF8A00]/20 to-[#F5B942]/20 border border-[#FF8A00]/30 flex items-center justify-center text-4xl mb-3 shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
          {(game as any).emoji || (game as any).icon || '🎮'}
        </div>
      </div>

      {/* Contenido */}
      <div className="relative px-4 pb-4 space-y-2">
        <h3 className="text-base font-black text-[#F8FAFC] tracking-tight text-center leading-tight">
          {(game as any).name || (game as any).title || 'Juego'}
        </h3>

        <p className="text-[11px] text-[#94A3B8] text-center leading-relaxed line-clamp-2">
          {(game as any).description || (game as any).tagline || 'Juego multijugador en tiempo real'}
        </p>

        {/* Estadísticas */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <div className="flex items-center gap-1.5 text-[10px] text-[#94A3B8]">
            <Users className="w-3 h-3 text-[#22C55E]" />
            <span className="font-bold">{onlinePlayersCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#94A3B8]">
            <Trophy className="w-3 h-3 text-[#F5B942]" />
            <span className="font-bold">{(game as any).minPlayers || 2}-{(game as any).maxPlayers || 4}</span>
          </div>
        </div>

        {/* Botón Jugar */}
        <button
          className="w-full mt-3 py-2.5 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#F5B942] hover:brightness-110 text-[#080B12] font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-[#FF8A00]/20 hover:shadow-lg hover:shadow-[#FF8A00]/30 transition-all active:scale-95"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Jugar Ahora</span>
        </button>
      </div>

      {/* Efecto de brillo al hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
    </div>
  );
};
