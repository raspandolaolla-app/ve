// ==============================================================================
// RASPANDO LA OLLA — GESTOR DE TIEMPO REAL (SUPABASE REALTIME)
// ==============================================================================
// Canales de suscripción para mesas, jugadores, sesiones de juego y notificaciones.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export class RealtimeManager {
  /**
   * Se suscribe a los cambios de una mesa específica y sus jugadores en tiempo real.
   */
  public static subscribeToTable(
    tableId: string,
    onTableChange: (payload: any) => void,
    onPlayerChange: (payload: any) => void
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Se suscribe a la lista pública de mesas en el Lobby.
   */
  public static subscribeToLobby(onLobbyChange: (payload: any) => void): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => {};

    const channelName = 'lobby_public_tables';
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
          onLobbyChange(payload);
        }
      )
      .subscribe();

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
   * Se suscribe a las notificaciones y saldo personal del usuario.
   */
  public static subscribeToUserEvents(
    userId: string,
    onBalanceChange: (payload: any) => void,
    onNotification: (payload: any) => void
  ): () => void {
    const supabase = getSupabaseClient();
    if (!supabase) return () => {};

    const channelName = `user_${userId}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onBalanceChange(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onNotification(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}
