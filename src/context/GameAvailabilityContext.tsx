// ==============================================================================
// RASPANDO LA OLLA — CONTEXTO GLOBAL DE DISPONIBILIDAD Y CONTROL CENTRAL DE JUEGOS
// ==============================================================================
// Fuente de verdad: public.game_configurations (Supabase PostgreSQL + Realtime)
// Oculta juegos deshabilitados de la UI y bloquea accesos en tiempo real
// ==============================================================================

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase/client';
import { SUPPORTED_GAMES_METADATA } from '../utils/constants';
import { AdminGameConfigRepository } from '../services/repositories/admin/AdminGameConfigRepository';
import { logger } from '../utils/logger';
import type { GameMetadata } from '../types/games';
import type { GameConfigItem } from '../types/admin';

export interface GameAvailabilityState {
  gameId: string;
  name: string;
  enabled: boolean;
  isActive: boolean;
  disabledReason: string | null;
  disabledAt: string | null;
  disabledBy: string | null;
  updatedAt: string;
}

interface GameAvailabilityContextType {
  isGameEnabled: (gameId: string) => boolean;
  getGameDisabledReason: (gameId: string) => string | null;
  getDisabledReason: (gameId: string) => string | null;
  getGameState: (gameId: string) => GameAvailabilityState | undefined;
  availableGames: GameMetadata[];
  allGameStates: Record<string, GameAvailabilityState>;
  loading: boolean;
  setGameEnabled: (
    gameId: string,
    enabled: boolean,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  refreshAvailability: () => Promise<void>;
}

const GameAvailabilityContext = createContext<GameAvailabilityContextType | null>(null);

/**
 * Normaliza variantes o aliases de nombres de juegos a su game_id canónico.
 */
export function normalizeCanonicalGameId(rawId: string): string {
  if (!rawId) return '';
  const normalized = rawId.toLowerCase().trim();

  switch (normalized) {
    case 'domino':
    case 'domino_venezolano':
      return 'domino_venezolano';
    case 'truco':
    case 'truco_venezolano':
      return 'truco_venezolano';
    case 'bingo':
    case 'bingo_75':
    case 'bingo_80':
    case 'bingo_90':
    case 'bingo_game':
      return 'bingo';
    case 'polla':
    case 'polla_venezolana':
    case 'polla_encuestadora':
      return 'polla_venezolana';
    case 'atrapaito':
    case 'atrapaito_criollo':
      return 'atrapaito';
    case 'una_olla':
    case 'unaolla':
      return 'una_olla';
    case 'checkers':
    case 'damas':
    case 'damas_criollas':
    case 'damas_venezolanas':
      return 'checkers';
    case 'chess':
    case 'ajedrez':
      return 'chess';
    case 'tic_tac_toe':
    case 'tictactoe':
    case 'tres_en_raya':
    case 'la_vieja':
      return 'tic_tac_toe';
    case 'rock_paper_scissors':
    case 'rps':
    case 'piedra_papel_tijera':
      return 'rock_paper_scissors';
    default:
      return normalized;
  }
}

export const GameAvailabilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gameStates, setGameStates] = useState<Record<string, GameAvailabilityState>>(() => {
    // Inicialización por defecto desde SUPPORTED_GAMES_METADATA
    const initial: Record<string, GameAvailabilityState> = {};
    SUPPORTED_GAMES_METADATA.forEach((g) => {
      initial[g.id] = {
        gameId: g.id,
        name: g.name,
        enabled: g.isActive,
        isActive: g.isActive,
        disabledReason: null,
        disabledAt: null,
        disabledBy: null,
        updatedAt: new Date().toISOString(),
      };
    });
    return initial;
  });

  const [loading, setLoading] = useState<boolean>(true);

  // Carga inicial y refresco desde Supabase
  const refreshAvailability = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('game_configurations')
        .select('*');

      if (!error && data && data.length > 0) {
        setGameStates((prev) => {
          const updated = { ...prev };
          data.forEach((row: any) => {
            const canonicalId = normalizeCanonicalGameId(row.game_id);
            const isEnabled = row.enabled !== false && row.is_active !== false;
            updated[canonicalId] = {
              gameId: canonicalId,
              name: row.name || prev[canonicalId]?.name || canonicalId,
              enabled: isEnabled,
              isActive: isEnabled,
              disabledReason: row.disabled_reason || null,
              disabledAt: row.disabled_at || null,
              disabledBy: row.disabled_by || null,
              updatedAt: row.updated_at || new Date().toISOString(),
            };
          });
          return updated;
        });
      }
    } catch (err) {
      logger.error('[GameAvailabilityContext] Error refrescando disponibilidad:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Suscripción a Realtime sobre la tabla game_configurations
  useEffect(() => {
    refreshAvailability();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('game_configurations_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_configurations' },
        (payload) => {
          const row: any = payload.new || payload.old;
          if (!row || !row.game_id) return;

          const canonicalId = normalizeCanonicalGameId(row.game_id);
          const isEnabled = payload.eventType === 'DELETE'
            ? false
            : row.enabled !== false && row.is_active !== false;

          logger.info(`[GameAvailabilityContext] Realtime update para "${canonicalId}": enabled=${isEnabled}`);

          setGameStates((prev) => ({
            ...prev,
            [canonicalId]: {
              gameId: canonicalId,
              name: row.name || prev[canonicalId]?.name || canonicalId,
              enabled: isEnabled,
              isActive: isEnabled,
              disabledReason: row.disabled_reason || null,
              disabledAt: row.disabled_at || null,
              disabledBy: row.disabled_by || null,
              updatedAt: row.updated_at || new Date().toISOString(),
            },
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshAvailability]);

  /**
   * Verifica si un juego está habilitado para ser visualizado y jugado.
   */
  const isGameEnabled = useCallback(
    (gameId: string): boolean => {
      const canonicalId = normalizeCanonicalGameId(gameId);
      const state = gameStates[canonicalId];
      if (!state) return true; // Por defecto permitido si no hay registro restrictivo
      return state.enabled && state.isActive;
    },
    [gameStates]
  );

  /**
   * Obtiene el motivo por el cual un juego fue deshabilitado.
   */
  const getGameDisabledReason = useCallback(
    (gameId: string): string | null => {
      const canonicalId = normalizeCanonicalGameId(gameId);
      return gameStates[canonicalId]?.disabledReason || null;
    },
    [gameStates]
  );

  /**
   * Obtiene el estado completo de un juego.
   */
  const getGameState = useCallback(
    (gameId: string): GameAvailabilityState | undefined => {
      const canonicalId = normalizeCanonicalGameId(gameId);
      return gameStates[canonicalId];
    },
    [gameStates]
  );

  /**
   * Lista de metadatos de juegos exclusivamente habilitados para la UI pública.
   */
  const availableGames = useMemo(() => {
    return SUPPORTED_GAMES_METADATA.filter((g) => isGameEnabled(g.id));
  }, [isGameEnabled]);

  /**
   * Acción administrativa para habilitar/deshabilitar juego con RPC y actualización optimista.
   */
  const setGameEnabled = useCallback(
    async (
      gameId: string,
      enabled: boolean,
      reason?: string
    ): Promise<{ success: boolean; error?: string }> => {
      const canonicalId = normalizeCanonicalGameId(gameId);

      const result = await AdminGameConfigRepository.setGameEnabled(
        canonicalId,
        enabled,
        reason
      );

      if (result.success) {
        setGameStates((prev) => ({
          ...prev,
          [canonicalId]: {
            ...prev[canonicalId],
            enabled,
            isActive: enabled,
            disabledReason: enabled ? null : (reason?.trim() || null),
            disabledAt: enabled ? null : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }));
      }

      return result;
    },
    []
  );

  const value = useMemo(
    () => ({
      isGameEnabled,
      getGameDisabledReason,
      getDisabledReason: getGameDisabledReason,
      getGameState,
      availableGames,
      allGameStates: gameStates,
      loading,
      setGameEnabled,
      refreshAvailability,
    }),
    [
      isGameEnabled,
      getGameDisabledReason,
      getGameState,
      availableGames,
      gameStates,
      loading,
      setGameEnabled,
      refreshAvailability,
    ]
  );

  return (
    <GameAvailabilityContext.Provider value={value}>
      {children}
    </GameAvailabilityContext.Provider>
  );
};

const fallbackAvailability: GameAvailabilityContextType = {
  isGameEnabled: (id: string) => {
    const meta = SUPPORTED_GAMES_METADATA.find((g) => g.id === normalizeCanonicalGameId(id));
    return meta ? meta.isActive : true;
  },
  getGameDisabledReason: () => null,
  getDisabledReason: () => null,
  getGameState: () => undefined,
  availableGames: SUPPORTED_GAMES_METADATA.filter((g) => g.isActive),
  allGameStates: {},
  loading: false,
  setGameEnabled: async () => ({ success: false, error: 'Provider no inicializado' }),
  refreshAvailability: async () => {},
};

export const useGameAvailability = (): GameAvailabilityContextType => {
  const context = useContext(GameAvailabilityContext);
  if (!context) {
    logger.warn('useGameAvailability fue invocado fuera de GameAvailabilityProvider. Usando fallback seguro.');
    return fallbackAvailability;
  }
  return context;
};
