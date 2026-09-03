// ==============================================================================
// RASPANDO LA OLLA — TARJETA DE JUEGO (REDISEÑO EXACTO A CAPTURA 1)
// Íconos Neón Distintivos, Badge HOT, Estadísticas y Botón Jugar Ahora
// ==============================================================================

import React from 'react';
import { Users, Zap, Trophy, Play } from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface GameCardProps {
  game: GameMetadata;
  onlinePlayersCount?: number;
  onSelectGame: (game: GameMetadata) => void;
}

// Componente para renderizar el ícono visual idéntico a la Captura 1
const GameVisualGraphic: React.FC<{ gameId: string }> = ({ gameId }) => {
  switch (gameId) {
    case 'tic_tac_toe':
      return (
        <div className="flex items-center justify-center font-black text-3xl sm:text-4xl tracking-tighter text-rose-500 drop-shadow-[0_0_12px_rgba(244,63,94,0.6)]">
          <span>X</span>
          <span className="text-amber-400 ml-1">O</span>
        </div>
      );
    case 'rock_paper_scissors':
      return (
        <div className="flex items-center justify-center text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]">
          <svg className="w-10 h-10 sm:w-12 sm:h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
        </div>
      );
    case 'checkers':
      return (
        <div className="flex items-center justify-center text-slate-200 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]">
          <svg className="w-10 h-10 sm:w-12 sm:h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 14 1.5 6h-7L10 14" />
            <path d="M8 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
            <path d="m9 14 3-5 3 5" />
            <path d="M6 20h12" />
          </svg>
        </div>
      );
    case 'domino_venezolano':
      return (
        <div className="w-9 h-14 sm:w-10 sm:h-14 rounded-lg border-2 border-amber-400/80 bg-[#0B0F17] flex flex-col items-center justify-between p-1.5 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <div className="w-full h-0.5 bg-amber-400/50" />
          <div className="w-2 h-2 rounded-full bg-amber-400" />
        </div>
      );
    case 'truco_venezolano':
      return (
        <div className="w-10 h-14 sm:w-11 sm:h-14 rounded-lg border-2 border-purple-400/80 bg-[#0B0F17] flex items-center justify-center text-purple-400 font-black text-xl shadow-[0_0_15px_rgba(168,85,247,0.3)]">
          <span>♠️</span>
        </div>
      );
    case 'bingo':
      return (
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-cyan-400 bg-gradient-to-tr from-[#0B0F17] to-cyan-950 flex items-center justify-center text-cyan-300 font-black text-lg sm:text-xl shadow-[0_0_15px_rgba(34,211,238,0.4)]">
          <span>B</span>
        </div>
      );
    default:
      return <span className="text-4xl select-none">🎮</span>;
  }
};

export const GameCard: React.FC<GameCardProps> = ({
  game,
  onlinePlayersCount = 12,
  onSelectGame,
}) => {
  const handleClick = () => {
    onSelectGame(game);
  };

  return (
    <div
      id={`lobby-game-card-${game.id}`}
      onClick={handleClick}
      className="group bg-[#131926] hover:bg-[#1A2235] border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 sm:p-5 flex flex-col justify-between relative transition-all duration-300 shadow-lg hover:shadow-[0_0_20px_rgba(0,0,0,0.5)] cursor-pointer select-none"
    >
      {/* Badge HOT */}
      <span className="absolute top-3 right-3 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-md z-10 flex items-center gap-0.5">
        <Zap className="w-3 h-3 fill-slate-950" />
        HOT
      </span>

      {/* Icono Central Visual */}
      <div className="h-16 sm:h-20 flex items-center justify-center my-2 group-hover:scale-110 transition-transform duration-300">
        <GameVisualGraphic gameId={game.id} />
      </div>

      {/* Textos */}
      <div className="text-center my-1">
        <h3 className="text-white font-black text-sm sm:text-base tracking-wide truncate group-hover:text-amber-400 transition-colors">
          {game.name}
        </h3>
        <p className="text-slate-400 text-[11px] sm:text-xs mt-1 line-clamp-2 leading-relaxed min-h-[32px]">
          {game.shortDescription}
        </p>
      </div>

      {/* Estadísticas de Jugadores y Modalidad */}
      <div className="flex items-center justify-center gap-3 py-2 border-t border-slate-800/80 my-2 text-[11px] text-slate-400">
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

      {/* Botón Jugar Ahora */}
      <button
        disabled={!game.isActive}
        className={`w-full py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.25)] ${
          game.isActive
            ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 uppercase tracking-wider active:scale-95 cursor-pointer'
            : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/50'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (game.isActive) handleClick();
        }}
      >
        <Play className="w-3.5 h-3.5 fill-current" />
        <span>{game.isActive ? 'Jugar Ahora' : 'Próximamente'}</span>
      </button>
    </div>
  );
};
