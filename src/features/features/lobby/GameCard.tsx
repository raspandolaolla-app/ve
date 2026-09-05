// ==============================================================================
// RASPANDO LA OLLA — TARJETA DE JUEGO (REDISEÑO EXACTO A CAPTURA 1)
// Íconos Neón Distintivos, Badge HOT, Estadísticas y Botón Jugar Ahora
// ==============================================================================

import React from 'react';
import { Users, Zap, Trophy, Play, HelpCircle } from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface GameCardProps {
  game: GameMetadata;
  onlinePlayersCount?: number;
  onSelectGame: (game: GameMetadata) => void;
  onOpenRules?: (gameId: string) => void;
}

// Componente para renderizar el ícono visual idéntico a la Captura 1 pero compactado
const GameVisualGraphic: React.FC<{ gameId: string }> = ({ gameId }) => {
  switch (gameId) {
    case 'tic_tac_toe':
      return (
        <div className="flex items-center justify-center font-black text-2xl sm:text-3xl tracking-tighter text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.6)]">
          <span>X</span>
          <span className="text-amber-400 ml-0.5">O</span>
        </div>
      );
    case 'rock_paper_scissors':
      return (
        <div className="flex items-center justify-center text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.6)]">
          <svg className="w-8 h-8 sm:w-9 sm:h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
        </div>
      );
    case 'checkers':
      return (
        <div className="flex items-center justify-center text-slate-200 drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
          <svg className="w-8 h-8 sm:w-9 sm:h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 14 1.5 6h-7L10 14" />
            <path d="M8 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
            <path d="m9 14 3-5 3 5" />
            <path d="M6 20h12" />
          </svg>
        </div>
      );
    case 'domino_venezolano':
      return (
        <div className="w-7 h-11 sm:w-8 sm:h-12 rounded-md border-2 border-amber-400/80 bg-[#0B0F17] flex flex-col items-center justify-between p-1 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <div className="w-full h-0.5 bg-amber-400/50" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        </div>
      );
    case 'truco_venezolano':
      return (
        <div className="w-8 h-11 sm:w-9 sm:h-12 rounded-md border-2 border-purple-400/80 bg-[#0B0F17] flex items-center justify-center text-purple-400 font-black text-lg shadow-[0_0_12px_rgba(168,85,247,0.3)]">
          <span>♠️</span>
        </div>
      );
    case 'bingo':
      return (
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 border-cyan-400 bg-gradient-to-tr from-[#0B0F17] to-cyan-950 flex items-center justify-center text-cyan-300 font-black text-sm sm:text-base shadow-[0_0_12px_rgba(34,211,238,0.4)]">
          <span>B</span>
        </div>
      );
    case 'atrapaito':
      return (
        <div className="flex items-center justify-center gap-1.5 drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]">
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-700 to-sky-400 border border-white/60 shadow-md flex items-center justify-center text-[10px] font-black text-white">
            1
          </div>
          <span className="text-amber-400 font-black text-sm animate-pulse">⚔️</span>
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-rose-700 to-red-400 border border-white/60 shadow-md flex items-center justify-center text-[10px] font-black text-white">
            2
          </div>
        </div>
      );
    default:
      return <span className="text-3xl select-none">🎮</span>;
  }
};

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onlinePlayersCount = 12,
  onSelectGame,
  onOpenRules,
}) => {
  const handleClick = () => {
    onSelectGame(game);
  };

  return (
    <div
      id={`lobby-game-card-${game.id}`}
      onClick={handleClick}
      className="group bg-[#131926] hover:bg-[#1A2235] border border-slate-800 hover:border-amber-500/50 rounded-xl p-3 sm:p-3.5 flex flex-col justify-between relative transition-all duration-300 shadow-md hover:shadow-[0_0_15px_rgba(0,0,0,0.5)] cursor-pointer select-none"
    >
      {/* Botón de Ayuda / Reglas */}
      {onOpenRules && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenRules(game.id);
          }}
          className="absolute top-2.5 left-2.5 p-1 rounded-md bg-slate-900/80 hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 border border-slate-800 hover:border-amber-500/40 transition-colors z-10 cursor-pointer"
          title={`Ver manual y reglas oficiales de ${game.name}`}
        >
          <HelpCircle className="w-3 h-3" />
        </button>
      )}

      {/* Badge HOT */}
      <span className="absolute top-2.5 right-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm z-10 flex items-center gap-0.5">
        <Zap className="w-2.5 h-2.5 fill-slate-950" />
        HOT
      </span>

      {/* Icono Central Visual Compacto */}
      <div className="h-12 sm:h-14 flex items-center justify-center my-1 group-hover:scale-105 transition-transform duration-300">
        <GameVisualGraphic gameId={game.id} />
      </div>

      {/* Textos */}
      <div className="text-center my-0.5">
        <h3 className="text-white font-bold text-xs sm:text-sm tracking-wide truncate group-hover:text-amber-400 transition-colors">
          {game.name}
        </h3>
        <p className="text-slate-400 text-[10px] sm:text-[11px] mt-0.5 line-clamp-2 leading-relaxed min-h-[28px]">
          {game.shortDescription}
        </p>
      </div>

      {/* Estadísticas de Jugadores y Modalidad */}
      <div className="flex items-center justify-center gap-2.5 py-1 border-t border-slate-800/80 my-1.5 text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3 text-emerald-400" />
          <span className="font-bold text-slate-300">{onlinePlayersCount}</span>
        </div>
        <div className="flex items-center gap-1">
          <Trophy className="w-3 h-3 text-amber-400" />
          <span className="font-bold text-slate-300">
            {game.minPlayers === game.maxPlayers ? `${game.minPlayers}v${game.maxPlayers}` : `${game.minPlayers}-${game.maxPlayers}`}
          </span>
        </div>
      </div>

      {/* Botón Jugar Ahora Compacto */}
      <button
        disabled={!game.isActive}
        className={`w-full py-1.5 sm:py-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(245,158,11,0.2)] ${
          game.isActive
            ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 uppercase tracking-wider active:scale-95 cursor-pointer'
            : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/50'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (game.isActive) handleClick();
        }}
      >
        <Play className="w-3 h-3 fill-current" />
        <span>{game.isActive ? 'Jugar Ahora' : 'Próximamente'}</span>
      </button>
    </div>
  );
};
