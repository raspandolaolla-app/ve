// ==============================================================================
// RASPANDO LA OLLA — HOOK GLOBAL PARA MODO JUEGO ACTIVO
// ==============================================================================

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface GameModeContextType {
  isGameActive: boolean;
  activeGameType: string | null;
  activeTableId: string | null;
  enterGameMode: (gameType: string, tableId: string) => void;
  exitGameMode: () => void;
}

const GameModeContext = createContext<GameModeContextType | undefined>(undefined);

export const GameModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isGameActive, setIsGameActive] = useState(false);
  const [activeGameType, setActiveGameType] = useState<string | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);

  const enterGameMode = useCallback((gameType: string, tableId: string) => {
    setIsGameActive(true);
    setActiveGameType(gameType);
    setActiveTableId(tableId);
    
    // Dispatch event global para que App.tsx oculte UI
    window.dispatchEvent(new CustomEvent('game-mode-enter', {
      detail: { gameType, tableId }
    }));
    
    // Agregar clase al body para CSS global
    document.body.classList.add('game-mode-active');
  }, []);

  const exitGameMode = useCallback(() => {
    setIsGameActive(false);
    setActiveGameType(null);
    setActiveTableId(null);
    
    window.dispatchEvent(new CustomEvent('game-mode-exit'));
    document.body.classList.remove('game-mode-active');
  }, []);

  useEffect(() => {
    // Listener para salir con tecla ESC
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isGameActive) {
        exitGameMode();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isGameActive, exitGameMode]);

  return (
    <GameModeContext.Provider
      value={{
        isGameActive,
        activeGameType,
        activeTableId,
        enterGameMode,
        exitGameMode,
      }}
    >
      {children}
    </GameModeContext.Provider>
  );
};

export const useGameMode = () => {
  const context = useContext(GameModeContext);
  if (!context) {
    throw new Error('useGameMode must be used within GameModeProvider');
  }
  return context;
};
