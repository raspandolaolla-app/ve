import React from 'react';
import { LogOut } from 'lucide-react';
import { useGameAbandonment } from '../../hooks/useGameAbandonment';

export interface GameAbandonButtonProps {
  sessionId?: string | null;
  tableId?: string | null;
  isOnline?: boolean;
  onAbandonSuccess?: () => void;
  className?: string;
  label?: string;
  compact?: boolean;
}

/**
 * Botón Universal de Abandono de Partida (1vs1 y multijugador)
 * Integra useGameAbandonment para ejecutar abandon_game_secure de manera universal.
 */
export const GameAbandonButton: React.FC<GameAbandonButtonProps> = ({
  sessionId,
  tableId,
  isOnline = true,
  onAbandonSuccess,
  className = '',
  label = 'Abandonar',
  compact = false,
}) => {
  const { abandonGame, isAbandoning } = useGameAbandonment(sessionId || null, {
    tableId: tableId || null,
    onAbandonSuccess,
  });

  // No mostrar el botón si no es una partida online/competitiva
  if (!isOnline && !sessionId) return null;

  return (
    <button
      id="universal-game-abandon-btn"
      type="button"
      onClick={abandonGame}
      disabled={isAbandoning}
      title="Abandonar la partida (otorga la victoria al oponente)"
      className={`flex items-center gap-1.5 sm:gap-2 bg-red-600/90 hover:bg-red-700 active:scale-95 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-red-950/40 transition-all backdrop-blur-sm cursor-pointer touch-manipulation border border-red-500/40 ${
        compact
          ? 'px-2.5 py-1.5 text-xs'
          : 'px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm'
      } ${className}`}
    >
      <LogOut className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      <span>{isAbandoning ? 'Saliendo...' : label}</span>
    </button>
  );
};

export default GameAbandonButton;
