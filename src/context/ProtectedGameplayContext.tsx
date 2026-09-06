// ==============================================================================
// RASPANDO LA OLLA / PulsoPLAY — CONTEXTO CENTRALIZADO DE PROTECCIÓN DE JUEGO ACTIVO
// ==============================================================================
// Protege partidas activas contra:
// 1. Pull-to-refresh accidental en dispositivos móviles (CSS overscroll + Touch Guard)
// 2. Recargas accidentales de navegador / cierre de pestaña (BeforeUnload Guard)
// 3. Pérdida de estado visual o desconexión aparente de la mesa
// 4. Salidas involuntarias o duplicación de sesiones
// Permite el scroll interno natural en componentes scrollables (chat, reglas, cartas).
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface ActiveGameSessionGuardInfo {
  gameType?: string;
  tableId?: string;
  sessionId?: string;
  tableName?: string;
  timestamp?: number;
}

export interface ProtectedGameplayContextType {
  isGameplayProtected: boolean;
  activeGameInfo: ActiveGameSessionGuardInfo | null;
  protectGameplay: (isProtected: boolean, metadata?: ActiveGameSessionGuardInfo | null) => void;
  clearProtectedGameplay: () => void;
  getPersistedActiveGame: () => ActiveGameSessionGuardInfo | null;
}

const ProtectedGameplayContext = createContext<ProtectedGameplayContextType | undefined>(undefined);

const STORAGE_KEY = 'rlo_active_game_session';
const MAX_SESSION_AGE_MS = 45 * 60 * 1000; // 45 minutos de vigencia para sesión activa

export const ProtectedGameplayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isGameplayProtected, setIsGameplayProtected] = useState<boolean>(false);
  const [activeGameInfo, setActiveGameInfo] = useState<ActiveGameSessionGuardInfo | null>(null);

  // Referencia mutable para callbacks y listeners de eventos táctiles
  const isProtectedRef = useRef<boolean>(false);
  isProtectedRef.current = isGameplayProtected;

  /**
   * Obtiene la sesión activa persistida en sessionStorage si aún es válida.
   */
  const getPersistedActiveGame = useCallback((): ActiveGameSessionGuardInfo | null => {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as ActiveGameSessionGuardInfo;
      if (data && data.timestamp && Date.now() - data.timestamp < MAX_SESSION_AGE_MS) {
        return data;
      }
      // Sesión expirada
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Activa o desactiva la protección transversal de partida activa.
   */
  const protectGameplay = useCallback(
    (isProtected: boolean, metadata?: ActiveGameSessionGuardInfo | null) => {
      setIsGameplayProtected(isProtected);
      if (isProtected) {
        const info: ActiveGameSessionGuardInfo = {
          gameType: metadata?.gameType,
          tableId: metadata?.tableId,
          sessionId: metadata?.sessionId,
          tableName: metadata?.tableName,
          timestamp: Date.now(),
        };
        setActiveGameInfo(info);
        try {
          if (typeof window !== 'undefined' && window.sessionStorage && info.tableId) {
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info));
          }
        } catch {
          // sessionStorage restringido o lleno
        }

        // Aplicar clases protectoras al DOM raíz
        if (typeof document !== 'undefined') {
          document.documentElement.classList.add('gameplay-protected');
          document.body.classList.add('gameplay-protected', 'game-mode-active');
        }
      } else {
        setActiveGameInfo(null);
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.removeItem(STORAGE_KEY);
          }
        } catch {
          // Silencioso
        }

        if (typeof document !== 'undefined') {
          document.documentElement.classList.remove('gameplay-protected');
          document.body.classList.remove('gameplay-protected', 'game-mode-active');
        }
      }

      // Notificar a observadores desacoplados
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('protected-gameplay-change', {
            detail: { isProtected, metadata },
          })
        );
      }
    },
    []
  );

  /**
   * Limpia inmediatamente el estado protegido
   */
  const clearProtectedGameplay = useCallback(() => {
    protectGameplay(false);
  }, [protectGameplay]);

  // Sincronizar clases DOM cuando cambia el estado
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isGameplayProtected) {
      document.documentElement.classList.add('gameplay-protected');
      document.body.classList.add('gameplay-protected', 'game-mode-active');
    } else {
      document.documentElement.classList.remove('gameplay-protected');
      document.body.classList.remove('gameplay-protected', 'game-mode-active');
    }
  }, [isGameplayProtected]);

  // Escuchar eventos globales de compatibilidad existentes (game-mode-enter / game-mode-exit)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleGameModeEnter = (e: any) => {
      const detail = e.detail || {};
      protectGameplay(true, {
        gameType: detail.gameType,
        tableId: detail.tableId,
      });
    };

    const handleGameModeExit = () => {
      protectGameplay(false);
    };

    window.addEventListener('game-mode-enter' as any, handleGameModeEnter);
    window.addEventListener('game-mode-exit' as any, handleGameModeExit);

    return () => {
      window.removeEventListener('game-mode-enter' as any, handleGameModeEnter);
      window.removeEventListener('game-mode-exit' as any, handleGameModeExit);
    };
  }, [protectGameplay]);

  // ==============================================================================
  // BLINDAJE CONTRA PULL-TO-REFRESH EN DISPOSITIVOS MÓVILES (TOUCH MOVE INTERCEPTOR)
  // ==============================================================================
  // Detecta el gesto de arrastre desde el límite superior (scrollTop <= 0)
  // e impide que el navegador active pull-to-refresh, pero PERMITE el scroll normal
  // dentro de elementos con desbordamiento legítimo (chat, listas, historiales).
  // ==============================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let touchStartY = 0;
    let touchStartX = 0;
    let isTrackingTouch = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (!isProtectedRef.current) return;
      if (e.touches.length !== 1) return;
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      isTrackingTouch = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isProtectedRef.current || !isTrackingTouch || e.touches.length !== 1) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - touchStartY;
      const deltaX = currentX - touchStartX;

      // Evaluar únicamente si el movimiento es predominantemente vertical
      if (Math.abs(deltaY) <= Math.abs(deltaX)) {
        return;
      }

      // Buscar si el objetivo táctil está dentro de un contenedor scrollable con overflow-y
      let target = e.target as HTMLElement | null;
      let isInsideScrollable = false;
      let isAtTopBoundary = true;

      while (target && target !== document.body && target !== document.documentElement) {
        // Ignorar modales o overlays fijos a menos que tengan scroll
        const style = window.getComputedStyle(target);
        const overflowY = style.overflowY;
        const canScroll = (overflowY === 'auto' || overflowY === 'scroll') && target.scrollHeight > target.clientHeight;

        if (canScroll) {
          isInsideScrollable = true;
          isAtTopBoundary = target.scrollTop <= 0;
          break;
        }
        target = target.parentElement;
      }

      // Gesto de tirar hacia abajo (PULL-DOWN)
      if (deltaY > 0) {
        // Si no hay contenedor scrollable O si el contenedor scrollable ya está en el límite superior (scrollTop <= 0):
        // Este gesto dispararía el Pull-To-Refresh nativo del navegador. LO CANCELAMOS.
        if (!isInsideScrollable || isAtTopBoundary) {
          if (e.cancelable) {
            e.preventDefault();
          }
        }
      }
    };

    const handleTouchEnd = () => {
      isTrackingTouch = false;
    };

    // Añadir listeners con passive: false para poder invocar preventDefault() cuando sea necesario
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  // ==============================================================================
  // BLINDAJE CONTRA CIERRE / RECARGA ACCIDENTAL DE VENTANA (BEFOREUNLOAD GUARD)
  // ==============================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProtectedRef.current) {
        const message = 'Tienes una partida activa en progreso. Si recargas o sales, podrías perder tu puesto o tu entrada.';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return (
    <ProtectedGameplayContext.Provider
      value={{
        isGameplayProtected,
        activeGameInfo,
        protectGameplay,
        clearProtectedGameplay,
        getPersistedActiveGame,
      }}
    >
      {children}
    </ProtectedGameplayContext.Provider>
  );
};

export const useProtectedGameplay = (): ProtectedGameplayContextType => {
  const context = useContext(ProtectedGameplayContext);
  if (!context) {
    throw new Error('useProtectedGameplay must be used within a ProtectedGameplayProvider');
  }
  return context;
};
