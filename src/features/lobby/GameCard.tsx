// ==============================================================================
// RASPANDO LA OLLA — TARJETA DE JUEGO (VERSIÓN CORREGIDA)
// ==============================================================================

import React from 'react';
import { Users, Zap, Trophy, Play } from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface GameCardProps {
  game: GameMetadata;
  onlinePlayersCount?: number;
  onSelectGame: (game: GameMetadata) => void;
}

// Mapa de emojis por tipo de juego
const GAME_EMOJI_MAP: Record<string, string> = {
  'tic_tac_toe': '❌⭕',
  'rock_paper_scissors': '✊✋✌️',
  'checkers': '♟️',
  'domino_venezolano': '🁣',
  'truco_venezolano': '🃏',
  'bingo': '🎱',
  'polla_venezolana': '🐾',
  'atrapaito': '🎲',
  'una_olla': '🃏',
  'chess': '♟️'
};

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onlinePlayersCount = 12,
  onSelectGame,
}) => {
  const handleClick = () => {
    onSelectGame(game);
  };

  const emoji = GAME_EMOJI_MAP[game.id] || '🎮';

  return (
    <div
      onClick={handleClick}
      className="relative group cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-[#171E2A] to-[#111722] border border-[#1E2938] hover:border-[#FF8A00]/50 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-[#FF8A00]/20 hover:-translate-y-1"
    >
      {/* Fondo decorativo */}
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
          {emoji}
        </div>
      </div>

      {/* Contenido */}
      <div className="relative px-4 pb-4 space-y-2">
        <h3 className="text-base font-black text-[#F8FAFC] tracking-tight text-center leading-tight">
          {game.name}
        </h3>

        <p className="text-[11px] text-[#94A3B8] text-center leading-relaxed line-clamp-2">
          {game.shortDescription}
        </p>

        {/* Estadísticas */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <div className="flex items-center gap-1.5 text-[10px] text-[#94A3B8]">
            <Users className="w-3 h-3 text-[#22C55E]" />
            <span className="font-bold">{onlinePlayersCount}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#94A3B8]">
            <Trophy className="w-3 h-3 text-[#F5B942]" />
            <span className="font-bold">{game.minPlayers}-{game.maxPlayers}</span>
          </div>
        </div>

        {/* Estado */}
        {!game.isActive && (
          <div className="text-[10px] text-[#F59E0B] font-bold text-center uppercase tracking-wider">
            ⚠️ Próximamente
          </div>
        )}

        {/* Botón Jugar */}
        <button
          disabled={!game.isActive}
          className={`w-full mt-3 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 ${
            game.isActive
              ? 'bg-gradient-to-r from-[#FF8A00] to-[#F5B942] hover:brightness-110 text-[#080B12] shadow-[#FF8A00]/20'
              : 'bg-[#1E2938] text-[#64748B] cursor-not-allowed'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (game.isActive) handleClick();
          }}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{game.isActive ? 'Jugar Ahora' : 'No Disponible'}</span>
        </button>
      </div>

      {/* Efecto de brillo al hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
    </div>
  );
};
