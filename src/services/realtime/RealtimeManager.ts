// ==============================================================================
// RASPANDO LA OLLA — GESTOR DE TIEMPO REAL (SUPABASE REALTIME)
// ==============================================================================
// Canales de suscripción para mesas, jugadores, sesiones de juego y notificaciones.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UserEventsChannelEntry {
  channel: RealtimeChannel;
  balanceListeners: Set<(payload: any) => void>;
  notificationListeners: Set<(payload: any) => void>;
  status: string;
}

export class RealtimeManager {
  private static userChannels: Map<string, UserEventsChannelEntry> = new Map();

  /**
   * Se suscribe a los cambios de una mesa específica, sus sesiones de juego y sus jugadores en tiempo real.
   */
  public static subscribeToTable(
    tableId: string,
    onTableChange: (payload: any) => void,
    onPlayerChange: (payload: any) => void,
    onSessionChange?: (payload: any) => void
  ): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => {};

    const channelName = `table_${tableId}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_tables',
          filter: `id=eq.${tableId}`,
        },
        (payload) => {
          onTableChange(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_table_players',
          filter: `table_id=eq.${tableId}`,
        },
        (payload) => {
          onPlayerChange(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `table_id=eq.${tableId}`,
        },
        (payload) => {
          if (onSessionChange) {
            onSessionChange(payload);
          } else {
            // Si no se proporcionó callback dedicado, notificar a onTableChange
            onTableChange(payload);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Se suscribe a la lista pública de mesas en el Lobby (cambios en mesas, sesiones y jugadores).
   */
  public static subscribeToLobby(
    onLobbyChange: (payload: any) => void,
    onStatusChange?: (status: string) => void
  ): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => {};

    const channelName = `public-game-tables-lobby-${Date.now()}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_tables',
        },
        (payload) => {
          onLobbyChange({ ...payload, sourceTable: 'game_tables' });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
        },
        (payload) => {
          onLobbyChange({ ...payload, sourceTable: 'game_sessions' });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_table_players',
        },
        (payload) => {
          onLobbyChange({ ...payload, sourceTable: 'game_table_players' });
        }
      )
      .subscribe((status) => {
        if (onStatusChange) {
          onStatusChange(status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Se suscribe a una sesión de juego activa y al flujo de acciones.
   */
  public static subscribeToGameSession(
    sessionId: string,
    onSessionChange: (payload: any) => void,
    onActionReceived: (payload: any) => void
  ): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => {};

    const channelName = `session_${sessionId}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          onSessionChange(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_actions',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          onActionReceived(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Se suscribe a las notificaciones y saldo personal del usuario de forma idempotente y segura.
   * Garantiza que exista como máximo UN canal Realtime por userId y que TODOS los listeners
   * postgres_changes se registren ANTES de llamar a subscribe().
   */
  public static subscribeToUserEvents(
    userId: string,
    onBalanceChange: (payload: any) => void,
    onNotification: (payload: any) => void
  ): () => void {
    if (!userId || typeof userId !== 'string' || !userId.trim() || userId === 'null' || userId === 'undefined') {
      console.warn('[WALLET_REALTIME] Invalid userId provided, skipping subscription:', userId);
      return () => {};
    }

    const cleanUserId = userId.trim();
    const channelName = `user_${cleanUserId}`;

    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('[WALLET_REALTIME] Supabase client not available, skipping realtime subscription');
      return () => {};
    }

    let entry = this.userChannels.get(cleanUserId);

    if (entry) {
      // Canal ya existente: registrar listeners en el registro multiplexado
      if (onBalanceChange) entry.balanceListeners.add(onBalanceChange);
      if (onNotification) entry.notificationListeners.add(onNotification);
      console.log(
        `[WALLET_REALTIME] Reusing active channel ${channelName}. Listeners registered (balance: ${entry.balanceListeners.size}, notifications: ${entry.notificationListeners.size})`
      );
    } else {
      console.log(`[WALLET_REALTIME] Creating channel ${channelName}`);

      // Remover canal previo huérfano en el cliente de Supabase si existiese
      try {
        const existingSupabaseChannels = supabase.getChannels();
        for (const ch of existingSupabaseChannels) {
          if (ch.topic === `realtime:${channelName}` || ch.topic === channelName) {
            console.log(`[WALLET_REALTIME] Removing stale Supabase channel before creation: ${channelName}`);
            supabase.removeChannel(ch);
          }
        }
      } catch (err) {
        console.warn('[WALLET_REALTIME] Error checking stale channels:', err);
      }

      const balanceListeners = new Set<(payload: any) => void>();
      const notificationListeners = new Set<(payload: any) => void>();

      if (onBalanceChange) balanceListeners.add(onBalanceChange);
      if (onNotification) notificationListeners.add(onNotification);

      const channel = supabase.channel(channelName);

      // PASO 2: Registrar TODOS los listeners postgres_changes ANTES de subscribe()
      console.log(`[WALLET_REALTIME] Registering wallet listener for ${channelName}`);
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${cleanUserId}`,
        },
        (payload) => {
          const currentEntry = RealtimeManager.userChannels.get(cleanUserId);
          if (currentEntry) {
            currentEntry.balanceListeners.forEach((listener) => {
              try {
                listener(payload);
              } catch (e) {
                console.error('[WALLET_REALTIME] Error in balance listener:', e);
              }
            });
          }
        }
      );

      console.log(`[WALLET_REALTIME] Registering notifications listener for ${channelName}`);
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${cleanUserId}`,
        },
        (payload) => {
          const currentEntry = RealtimeManager.userChannels.get(cleanUserId);
          if (currentEntry) {
            currentEntry.notificationListeners.forEach((listener) => {
              try {
                listener(payload);
              } catch (e) {
                console.error('[WALLET_REALTIME] Error in notification listener:', e);
              }
            });
          }
        }
      );

      console.log(`[WALLET_REALTIME] All listeners registered for ${channelName}`);
      console.log(`[WALLET_REALTIME] Calling subscribe() for ${channelName}`);

      entry = {
        channel,
        balanceListeners,
        notificationListeners,
        status: 'SUBSCRIBING',
      };
      this.userChannels.set(cleanUserId, entry);

      // PASO 4: Ejecutar subscribe()
      channel.subscribe((status, err) => {
        if (!entry) return;
        entry.status = status;
        if (status === 'SUBSCRIBED') {
          console.log(`[WALLET_REALTIME] SUBSCRIBED: channel ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`[WALLET_REALTIME] CHANNEL_ERROR on channel ${channelName}:`, err);
        } else if (status === 'TIMED_OUT') {
          console.warn(`[WALLET_REALTIME] CHANNEL_TIMEOUT on channel ${channelName}`);
        } else if (status === 'CLOSED') {
          console.log(`[WALLET_REALTIME] CHANNEL_CLOSED on channel ${channelName}`);
        }
      });
    }

    // Retornar función de limpieza idempotente
    return () => {
      const currentEntry = RealtimeManager.userChannels.get(cleanUserId);
      if (!currentEntry) return;

      if (onBalanceChange) currentEntry.balanceListeners.delete(onBalanceChange);
      if (onNotification) currentEntry.notificationListeners.delete(onNotification);

      console.log(
        `[WALLET_REALTIME] Listener unsubscribed for ${channelName} (remaining balance: ${currentEntry.balanceListeners.size}, notifications: ${currentEntry.notificationListeners.size})`
      );

      if (currentEntry.balanceListeners.size === 0 && currentEntry.notificationListeners.size === 0) {
        console.log(`[WALLET_REALTIME] CLEANUP: No remaining listeners, removing channel ${channelName}`);
        RealtimeManager.userChannels.delete(cleanUserId);
        try {
          supabase.removeChannel(currentEntry.channel);
        } catch (err) {
          console.warn(`[WALLET_REALTIME] Error removing channel ${channelName}:`, err);
        }
      }
    };
  }

  /**
   * Limpieza explícita de canales de usuario (al cerrar sesión o desmontar app).
   */
  public static cleanupUserEvents(userId?: string): void {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    if (userId) {
      const cleanUserId = userId.trim();
      const entry = this.userChannels.get(cleanUserId);
      if (entry) {
        console.log(`[WALLET_REALTIME] CLEANUP: Explicit cleanup for user_${cleanUserId}`);
        this.userChannels.delete(cleanUserId);
        try {
          supabase.removeChannel(entry.channel);
        } catch (err) {
          console.warn(`[WALLET_REALTIME] Error removing channel user_${cleanUserId}:`, err);
        }
      }
    } else {
      console.log('[WALLET_REALTIME] CLEANUP: Explicit cleanup for all user channels');
      for (const [uid, entry] of this.userChannels.entries()) {
        try {
          supabase.removeChannel(entry.channel);
        } catch (err) {
          console.warn(`[WALLET_REALTIME] Error removing channel user_${uid}:`, err);
        }
      }
      this.userChannels.clear();
    }
  }

  /**
   * Suscribirse a resultados de sorteos en tiempo real (Bingo y Polla)
   */
  public static subscribeToDrawResults(
    onNewResult: (payload: any) => void
  ): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => {};

    const channel = supabase
      .channel('draw-results-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'draw_audit_trail',
        },
        (payload) => {
          console.log('[RealtimeManager] Nuevo resultado de sorteo:', payload);
          onNewResult(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Suscribirse a cambios de estado de sesiones de Bingo en tiempo real
   */
  public static subscribeToBingoSession(
    sessionId: string,
    onStateChange: (payload: any) => void
  ): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => {};

    const channel = supabase
      .channel(`bingo-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('[RealtimeManager] Cambio en sesión de Bingo:', payload);
          onStateChange(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Obtiene el estado general de conexión a los canales Realtime de Supabase
   */
  public static getConnectionStatus(): { connected: boolean; userChannels: number } {
    const supabase = getSupabaseClient();
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return {
      connected: isOnline && Boolean(supabase),
      userChannels: this.userChannels.size,
    };
  }
}

// Exportar instancia singleton para compatibilidad
export const realtimeManager = RealtimeManager;

