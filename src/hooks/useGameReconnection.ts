// ==============================================================================
// RASPANDO LA OLLA — HOOK DE RECONEXIÓN Y SINCRONIZACIÓN DE JUEGOS
// ==============================================================================
// Sincroniza el estado del juego al recuperar conexión, reenfocar la pestaña
// o ante reconexiones de Realtime WebSocket.
// ==============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase/client';
import { RealtimeManager } from '../services/realtime/RealtimeManager';

export interface GameReconnectionPayload {
  session: any;
  players: any[];
  recentActions: any[];
  syncedAt: string;
}

/**
 * Hook para manejar reconexión y sincronización periódica y reactiva en juegos
 */
export const useGameReconnection = (
  sessionId: string | null,
  gameType?: string,
  onStateSync?: (state: GameReconnectionPayload) => void
) => {
  const lastSyncRef = useRef<number>(Date.now());
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Sincronizar estado actual del juego desde el backend Supabase
   */
  const syncGameState = useCallback(async () => {
    if (!sessionId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      // 1. Obtener sesión de juego
      const { data: session, error: sessionError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return;
      }

      // 2. Obtener jugadores activos de la mesa
      const { data: players } = await supabase
        .from('game_table_players')
        .select(`
          user_id,
          seat_number,
          status,
          profiles:user_id (
            display_name,
            first_name,
            last_name,
            avatar_url
          )
        `)
        .eq('table_id', session.table_id)
        .neq('status', 'LEFT');

      // 3. Obtener acciones recientes
      const { data: recentActions } = await supabase
        .from('game_actions')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(30);

      const fullState: GameReconnectionPayload = {
        session,
        players: players || [],
        recentActions: recentActions || [],
        syncedAt: new Date().toISOString(),
      };

      if (onStateSync) {
        onStateSync(fullState);
      }

      lastSyncRef.current = Date.now();
    } catch (error) {
      console.warn('[useGameReconnection] Advertencia sincronizando estado:', error);
    }
  }, [sessionId, onStateSync]);

  // Sincronización periódica de respaldo cada 30 segundos
  useEffect(() => {
    if (!sessionId) return;

    syncIntervalRef.current = setInterval(() => {
      syncGameState();
    }, 30000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [sessionId, syncGameState]);

  // Detectar cambio de visibilidad de la pestaña (cuando el usuario vuelve)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncGameState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncGameState]);

  // Detectar recuperación de conexión de red
  useEffect(() => {
    const handleOnline = () => {
      syncGameState();
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [syncGameState]);

  // Suscribirse a cambios en la sesión para sincronización instantánea
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = RealtimeManager.subscribeToGameSession(
      sessionId,
      (payload) => {
        if (payload?.new) {
          const updated = payload.new;
          if (
            updated.current_turn_user_id !== undefined ||
            updated.turn_deadline_at !== undefined ||
            updated.status === 'SETTLED'
          ) {
            syncGameState();
          }
        }
      },
      () => {}
    );

    return () => {
      unsubscribe();
    };
  }, [sessionId, syncGameState]);

  return {
    syncGameState,
    lastSyncTime: lastSyncRef.current,
  };
};
