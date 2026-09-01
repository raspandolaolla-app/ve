// ==============================================================================
// RASPANDO LA OLLA — TARJETA DE JUEGO MEJORADA CON ANIMACIONES
// ==============================================================================

import React from 'react';
import { motion } from 'motion/react';
import { Users, Zap, Trophy, Play } from 'lucide-react';
import type { GameMetadata } from '../../types/games';
import { useAudio } from '../../hooks/useAudio';

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
  const { playSound } = useAudio();

  const handleClick = () => {
    playSound('click');
    onSelectGame(game);
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -5 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={handleClick}
      className="relative group cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-[#171E2A] to-[#111722] border border-[#1E2938] hover:border-[#FF8A00]/50 transition-all duration-300 shadow-lg hover:shadow-2xl hover:shadow-[#FF8A00]/20"
    >
      {/* Fondo decorativo con gradiente */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF8A00]/5 via-transparent to-[#F5B942]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Badge de popularidad */}
      {onlinePlayersCount > 10 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-[#080B12] text-[10px] font-black flex items-center gap-1 shadow-lg"
        >
          <Zap className="w-3 h-3" />
          <span>HOT</span>
        </motion.div>
      )}

      {/* Icono del juego con animación */}
      <div className="relative p-4 pb-2">
        <motion.div
          whileHover={{ rotate: [0, -5, 5, 0], scale: 1.1 }}
          transition={{ duration: 0.3 }}
          className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#FF8A00]/20 to-[#F5B942]/20 border border-[#FF8A00]/30 flex items-center justify-center text-4xl mb-3 shadow-inner"
        >
          {game.emoji}
        </motion.div>
      </div>

      {/* Contenido */}
      <div className="relative px-4 pb-4 space-y-2">
        <h3 className="text-base font-black text-[#F8FAFC] tracking-tight text-center leading-tight">
          {game.name}
        </h3>

        <p className="text-[11px] text-[#94A3B8] text-center leading-relaxed line-clamp-2">
          {game.description}
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

        {/* Botón Jugar */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-full mt-3 py-2.5 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-[#080B12] font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-[#FF8A00]/20 hover:shadow-lg hover:shadow-[#FF8A00]/30 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Jugar Ahora</span>
        </motion.button>
      </div>

      {/* Efecto de brillo al hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        initial={{ x: '-100%' }}
        whileHover={{ x: '100%' }}
        transition={{ duration: 0.6 }}
      />
    </motion.div>
  );
};
