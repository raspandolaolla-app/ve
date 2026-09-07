// ==============================================================================
// RASPANDO LA OLLA — GESTOR DE TIEMPO REAL (SUPABASE REALTIME)
// ==============================================================================
// Canales de suscripción para mesas, jugadores, sesiones de juego y notificaciones.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UserEventsChannelEntry {
  channel: RealtimeChannel;
  balanceListeners: Map<string, (payload: any) => void>;
  notificationListeners: Map<string, (payload: any) => void>;
  status: string;
}

function isEffectiveListener(fn: unknown): fn is (payload: any) => void {
  if (typeof fn !== 'function') return false;
  const str = fn.toString().replace(/\s+/g, '');
  if (
    str === '()=>{}' ||
    str === 'function(){}' ||
    str === '()=>void0' ||
    str === '()=>{return;}' ||
    str === 'function(){return;}'
  ) {
    return false;
  }
  return true;
}

let userSubCounter = 0;

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

    const channelName = 'public-game-tables-lobby';
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
   * Suscribe exclusivamente al saldo del usuario (propietario: WalletContext).
   * Es completamente idempotente: llamadas repetidas actualizan el listener sin acumulación.
   */
  public static subscribeToUserBalance(
    userId: string,
    onBalanceChange: (payload: any) => void,
    subscriberKey: string = 'wallet_context'
  ): () => void {
    return this.subscribeToUserEvents(userId, onBalanceChange, undefined, subscriberKey);
  }

  /**
   * Suscribe exclusivamente a las notificaciones del usuario (propietario: NotificationContext).
   * Es completamente idempotente: llamadas repetidas actualizan el listener sin acumulación.
   */
  public static subscribeToUserNotifications(
    userId: string,
    onNotification: (payload: any) => void,
    subscriberKey: string = 'notification_context'
  ): () => void {
    return this.subscribeToUserEvents(userId, undefined, onNotification, subscriberKey);
  }

  /**
   * Se suscribe a las notificaciones y/o saldo personal del usuario de forma idempotente y segura.
   * Garantiza que exista como máximo UN canal Realtime por userId y como máximo UN listener efectivo
   * por rol/suscriptor, registrando TODOS los listeners postgres_changes ANTES de llamar a subscribe().
   */
  public static subscribeToUserEvents(
    userId: string,
    onBalanceChange?: (payload: any) => void,
    onNotification?: (payload: any) => void,
    subscriberKey?: string
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

    const hasEffectiveBalance = isEffectiveListener(onBalanceChange);
    const hasEffectiveNotification = isEffectiveListener(onNotification);

    // Si ambos son no-op, null o undefined, no registrar listeners vacíos
    if (!hasEffectiveBalance && !hasEffectiveNotification) {
      console.log(`[WALLET_REALTIME] No effective listeners provided for ${channelName}, skipping`);
      return () => {};
    }

    // Clave de suscriptor para idempotencia
    let subKey = subscriberKey;
    if (!subKey) {
      // Si no se proporcionó clave explícita, comprobar si el mismo callback ya está registrado
      const existingEntry = this.userChannels.get(cleanUserId);
      if (existingEntry) {
        if (hasEffectiveBalance && onBalanceChange) {
          for (const [k, cb] of existingEntry.balanceListeners) {
            if (cb === onBalanceChange) {
              subKey = k;
              break;
            }
          }
        }
        if (!subKey && hasEffectiveNotification && onNotification) {
          for (const [k, cb] of existingEntry.notificationListeners) {
            if (cb === onNotification) {
              subKey = k;
              break;
            }
          }
        }
      }
      if (!subKey) {
        subKey = `sub_${++userSubCounter}`;
      }
    }

    let entry = this.userChannels.get(cleanUserId);

    if (entry) {
      console.log(`[WALLET_REALTIME] REUSED CHANNEL: ${channelName}`);

      if (hasEffectiveBalance && onBalanceChange) {
        if (entry.balanceListeners.has(subKey)) {
          console.log(`[WALLET_REALTIME] EXISTING LISTENER updated for balance [${subKey}] on ${channelName}`);
        } else {
          console.log(`[WALLET_REALTIME] NEW LISTENER registered for balance [${subKey}] on ${channelName}`);
        }
        entry.balanceListeners.set(subKey, onBalanceChange);
      }

      if (hasEffectiveNotification && onNotification) {
        if (entry.notificationListeners.has(subKey)) {
          console.log(`[WALLET_REALTIME] EXISTING LISTENER updated for notifications [${subKey}] on ${channelName}`);
        } else {
          console.log(`[WALLET_REALTIME] NEW LISTENER registered for notifications [${subKey}] on ${channelName}`);
        }
        entry.notificationListeners.set(subKey, onNotification);
      }

      console.log(
        `[WALLET_REALTIME] Active listeners for ${channelName} (balance: ${entry.balanceListeners.size}, notifications: ${entry.notificationListeners.size})`
      );
    } else {
      console.log(`[WALLET_REALTIME] NEW CHANNEL: ${channelName}`);

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

      const balanceListeners = new Map<string, (payload: any) => void>();
      const notificationListeners = new Map<string, (payload: any) => void>();

      if (hasEffectiveBalance && onBalanceChange) {
        console.log(`[WALLET_REALTIME] NEW LISTENER registered for balance [${subKey}] on ${channelName}`);
        balanceListeners.set(subKey, onBalanceChange);
      }
      if (hasEffectiveNotification && onNotification) {
        console.log(`[WALLET_REALTIME] NEW LISTENER registered for notifications [${subKey}] on ${channelName}`);
        notificationListeners.set(subKey, onNotification);
      }

      const channel = supabase.channel(channelName);

      // Registrar listeners postgres_changes ANTES de subscribe()
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

      channel.on(
        'postgres_changes',
        {
          event: '*',
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

    // Retornar función de limpieza idempotente y selectiva
    return () => {
      const currentEntry = RealtimeManager.userChannels.get(cleanUserId);
      if (!currentEntry) return;

      if (hasEffectiveBalance) {
        currentEntry.balanceListeners.delete(subKey);
      }
      if (hasEffectiveNotification) {
        currentEntry.notificationListeners.delete(subKey);
      }

      console.log(
        `[WALLET_REALTIME] UNSUBSCRIBE: [${subKey}] from ${channelName} (remaining balance: ${currentEntry.balanceListeners.size}, notifications: ${currentEntry.notificationListeners.size})`
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
   * Retorna el número de listeners activos para balance y notificaciones de un usuario (para diagnóstico y auditoría).
   */
  public static getUserChannelListenerCounts(userId: string): { balance: number; notifications: number } | null {
    const entry = this.userChannels.get(userId.trim());
    if (!entry) return null;
    return {
      balance: entry.balanceListeners.size,
      notifications: entry.notificationListeners.size,
    };
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

