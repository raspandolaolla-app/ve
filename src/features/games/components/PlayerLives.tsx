// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE DE VIDAS DE JUGADOR (3 VIDAS PER MANO/PARTIDA)
// ==============================================================================

import React from 'react';
import { motion } from 'motion/react';
import { Heart, HeartOff } from 'lucide-react';

interface PlayerLivesProps {
  lives: number; // 0..3
  maxLives?: number; // 3 por defecto
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PlayerLives: React.FC<PlayerLivesProps> = ({
  lives,
  maxLives = 3,
  showText = true,
  size = 'md',
  className = '',
}) => {
  const currentLives = Math.max(0, Math.min(maxLives, lives));

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4 sm:w-4.5 sm:h-4.5',
    lg: 'w-5 h-5 sm:w-6 sm:h-6',
  };

  const textSizes = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-sm',
  };

  return (
    <div className={`flex items-center space-x-1.5 ${className}`}>
      {showText && (
        <span className={`font-mono font-semibold text-neutral-400 ${textSizes[size]}`}>
          Vidas:
        </span>
      )}

      <div className="flex items-center space-x-1">
        {Array.from({ length: maxLives }).map((_, idx) => {
          const isAlive = idx < currentLives;

          return (
            <motion.div
              key={idx}
              initial={{ scale: 0.8 }}
              animate={isAlive ? { scale: [1, 1.15, 1] } : { scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="relative flex items-center justify-center"
            >
              {isAlive ? (
                <Heart
                  className={`${iconSizes[size]} fill-red-500 text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.6)]`}
                />
              ) : (
                <HeartOff className={`${iconSizes[size]} text-neutral-600 opacity-40`} />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
