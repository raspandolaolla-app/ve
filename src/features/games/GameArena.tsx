// ==============================================================================
// RASPANDO LA OLLA — CONTENEDOR MAESTRO DE PARTIDA ACTIVA
// Con: Fullscreen automático, ocultado UI y modal genérico de fin de partida
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { useGameMode } from '../../hooks/useGameMode';
import { useProtectedGameplay } from '../../context/ProtectedGameplayContext';
import { GameEndModal } from '../../components/common/GameEndModal';
import { useAuth } from '../../hooks/useAuth';

// ==============================================================================
// HOOK: FULLSCREEN AUTOMÁTICO (con fallback para iOS)
// ==============================================================================
const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const requestFullscreen = useCallback(async () => {
    try {
      const elem = containerRef.current || document.documentElement;
      
      // Standard Fullscreen API
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      } else if ((document.documentElement as any).webkitEnterFullscreen) {
        // iOS Safari fallback
        (document.documentElement as any).webkitEnterFullscreen();
      }
      setIsFullscreen(true);
      document.body.classList.add('fullscreen-active');
    } catch (err) {
      console.warn('[Fullscreen] No se pudo activar:', err);
      // Fallback: solo agregar clase CSS para "fake fullscreen"
      document.body.classList.add('fake-fullscreen');
      setIsFullscreen(true);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (err) {
      console.warn('[Fullscreen] Error al salir:', err);
    } finally {
      document.body.classList.remove('fullscreen-active');
      document.body.classList.remove('fake-fullscreen');
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement || !!(document as any).webkitFullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, []);

  return { isFullscreen, requestFullscreen, exitFullscreen, containerRef };
};

// ==============================================================================
// COMPONENTE PRINCIPAL: GameArena
// ==============================================================================

interface GameArenaProps {
  children: React.ReactNode;
  gameType: string;
  tableId: string;
  gameName: string;
  onLeave: () => void;
  // Props para el modal de fin de partida
  isGameOver?: boolean;
  isWinner?: boolean;
  isTie?: boolean;
  winnerName?: string;
  prizeAmount?: number;
  onPlayAgain?: () => void;
}

export const GameArena: React.FC<GameArenaProps> = ({
  children,
  gameType,
  tableId,
  gameName,
  onLeave,
  isGameOver = false,
  isWinner = false,
  isTie = false,
  winnerName = '',
  prizeAmount = 0,
  onPlayAgain,
}) => {
  const { user } = useAuth();
  const { enterGameMode, exitGameMode } = useGameMode();
  const { protectGameplay } = useProtectedGameplay();
  const { isFullscreen, requestFullscreen, exitFullscreen, containerRef } = useFullscreen();
  const [showEndModal, setShowEndModal] = useState(false);
  const [viewingLastMove, setViewingLastMove] = useState(false);
  const hasEnteredGameMode = useRef(false);

  // ============================================================================
  // EFECTO: Entrar a modo juego + fullscreen automático + protección anti-pull-to-refresh
  // ============================================================================
  useEffect(() => {
    if (!hasEnteredGameMode.current) {
      enterGameMode(gameType, tableId);
      protectGameplay(true, { gameType, tableId, tableName: gameName });
      hasEnteredGameMode.current = true;
      
      // Delay pequeño para asegurar que el DOM está listo
      const timer = setTimeout(() => {
        requestFullscreen().catch(() => {});
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [gameType, tableId, gameName, enterGameMode, protectGameplay, requestFullscreen]);

  // ============================================================================
  // EFECTO: Detectar fin de partida y mostrar modal
  // ============================================================================
  useEffect(() => {
    if (isGameOver && !viewingLastMove) {
      const timer = setTimeout(() => {
        setShowEndModal(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isGameOver, viewingLastMove]);

  // ============================================================================
  // EFECTO: Cleanup al desmontar
  // ============================================================================
  useEffect(() => {
    return () => {
      protectGameplay(false);
      exitGameMode();
      exitFullscreen().catch(() => {});
    };
  }, [protectGameplay, exitGameMode, exitFullscreen]);

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleGoToLobby = () => {
    setShowEndModal(false);
    protectGameplay(false);
    exitFullscreen();
    exitGameMode();
    onLeave();
  };

  const handlePlayAgain = () => {
    setShowEndModal(false);
    if (onPlayAgain) {
      onPlayAgain();
    } else {
      handleGoToLobby();
    }
  };

  const handleViewLastMove = () => {
    setShowEndModal(false);
    setViewingLastMove(true);
    // El tablero se mantiene visible en modo solo-lectura
  };

  const handleExitViewMode = () => {
    setViewingLastMove(false);
    setShowEndModal(true);
  };

  const handleManualExit = () => {
    if (confirm('¿Seguro que quieres salir de la partida?')) {
      handleGoToLobby();
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <>
      <div
        ref={containerRef}
        className={`fixed inset-0 z-[90] bg-[#080B12] overflow-auto game-arena-container gameplay-protected-container overscroll-none select-none ${
          isFullscreen ? 'fullscreen-container' : ''
        }`}
      >
        {/* Barra superior mínima durante juego */}
        <div className="sticky top-0 z-10 bg-[#080B12]/95 backdrop-blur-md border-b border-[#1E2938] px-3 py-2 flex items-center justify-between safe-area-top">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-xs font-bold text-[#F8FAFC] truncate">
              {gameName}
            </span>
            <span className="text-[10px] text-[#94A3B8] hidden sm:inline">·</span>
            <span className="text-[10px] text-[#94A3B8] hidden sm:inline font-mono">
              #{tableId.substring(0, 8)}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Botón Fullscreen Toggle */}
            <button
              onClick={isFullscreen ? exitFullscreen : requestFullscreen}
              className="p-2 rounded-lg hover:bg-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] transition"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            {/* Botón Salir */}
            {!viewingLastMove && (
              <button
                onClick={handleManualExit}
                className="p-2 rounded-lg hover:bg-red-500/20 text-[#94A3B8] hover:text-red-400 transition"
                title="Salir de la partida"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Banner de Modo Lectura (cuando ve última jugada) */}
        {viewingLastMove && (
          <div className="sticky top-[45px] z-10 bg-amber-500/20 border-b border-amber-500/40 px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-300 text-xs font-bold">👁️ MODO LECTURA · Última jugada</span>
            </div>
            <button
              onClick={handleExitViewMode}
              className="px-3 py-1 rounded-lg bg-[#171E2A] hover:bg-[#1E2938] text-[#F8FAFC] text-xs font-bold transition"
            >
              Volver al menú
            </button>
          </div>
        )}

        {/* Contenido del juego (tablero específico) */}
        <div className="game-content-area p-2 sm:p-4 min-h-[calc(100vh-50px)] flex items-center justify-center">
          {children}
        </div>
      </div>

      {/* Modal de Fin de Partida */}
      <GameEndModal
        isOpen={showEndModal && !viewingLastMove}
        isWinner={isWinner}
        isTie={isTie}
        winnerName={winnerName}
        prizeAmount={prizeAmount}
        gameName={gameName}
        onGoToLobby={handleGoToLobby}
        onPlayAgain={handlePlayAgain}
        onViewLastMove={handleViewLastMove}
        onClose={() => setShowEndModal(false)}
      />
    </>
  );
};
