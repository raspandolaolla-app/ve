// ==============================================================================
// RASPANDO LA OLLA — SERVICIO DE PRESENCIA EN TIEMPO REAL (REALTIME PRESENCE)
// ==============================================================================
// Controla el estado online/offline de usuarios en toda la plataforma
// ==============================================================================

import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase/client';

export interface UserPresenceState {
  userId: string;
  onlineAt: string;
  displayName?: string;
  avatarUrl?: string;
}

type PresenceChangeListener = (onlineUserIds: string[]) => void;

class PresenceServiceManager {
  private channel: RealtimeChannel | null = null;
  private onlineUsers: Set<string> = new Set();
  private listeners: Set<PresenceChangeListener> = new Set();
  private currentUserId: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Inicia la suscripción al canal global de presencia
   */
  public async initGlobalPresence(
    userId: string,
    metadata?: { displayName?: string; avatarUrl?: string }
  ): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;

    if (this.currentUserId === userId && this.channel) {
      return; // Ya inicializado para este usuario
    }

    // Si había un canal anterior, desuscribirlo
    await this.cleanup();

    this.currentUserId = userId;

    this.channel = supabase.channel('global_presence', {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        if (!this.channel) return;
        const state = this.channel.presenceState<UserPresenceState>();
        const activeIds = new Set<string>();
        Object.keys(state).forEach((key) => {
          activeIds.add(key);
        });
        this.onlineUsers = activeIds;
        this.notifyListeners();
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        this.onlineUsers.add(key);
        this.notifyListeners();
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        this.onlineUsers.delete(key);
        this.notifyListeners();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && this.channel) {
          await this.channel.track({
            userId,
            onlineAt: new Date().toISOString(),
            displayName: metadata?.displayName || 'Usuario',
            avatarUrl: metadata?.avatarUrl || '',
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          console.warn(`[PresenceService] Canal de presencia en estado ${status}. Reintentando suscripción...`);
          // La desconexión de Realtime NO destruye la sesión Auth. Reintentar reconexión en 3s:
          setTimeout(() => {
            if (this.currentUserId === userId) {
              this.initGlobalPresence(userId, metadata);
            }
          }, 3000);
        }
      });

    // Registrar actualización en la tabla profiles
    await this.updateProfileOnlineStatus(userId, true);

    // Heartbeat cada 60 segundos
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.currentUserId) {
        this.updateProfileOnlineStatus(this.currentUserId, true);
      }
    }, 60000);

    // Cleanup en cierre de ventana
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
      window.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  /**
   * Actualiza el estado en la tabla `profiles` usando la función RPC segura update_user_presence y fallback a update
   */
  private async updateProfileOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;

    try {
      // 1. Intentar RPC segura
      const { error: rpcErr } = await supabase.rpc('update_user_presence', { p_is_online: isOnline });
      if (!rpcErr) return;

      // 2. Fallback a UPDATE directo con filtro correcto user_id
      await supabase
        .from('profiles')
        .update({
          is_online: isOnline,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    } catch {
      // Ignorar si falla la actualización silenciosa
    }
  }

  private handleBeforeUnload = () => {
    if (this.currentUserId) {
      this.updateProfileOnlineStatus(this.currentUserId, false);
    }
    this.cleanup();
  };

  /**
   * Añade un listener para cambios en la lista de usuarios online
   */
  public subscribeToOnlineUsers(listener: PresenceChangeListener): () => void {
    this.listeners.add(listener);
    // Disparar inmediatamente con el estado actual
    listener(Array.from(this.onlineUsers));

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Comprueba si un usuario específico está online
   */
  public isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  /**
   * Obtiene la lista actual de IDs online
   */
  public getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers);
  }

  private notifyListeners(): void {
    const onlineList = Array.from(this.onlineUsers);
    this.listeners.forEach((fn) => fn(onlineList));
  }

  /**
   * Limpia y cierra la presencia
   */
  public async cleanup(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
    }

    if (this.currentUserId) {
      await this.updateProfileOnlineStatus(this.currentUserId, false);
    }

    if (this.channel) {
      await this.channel.untrack();
      await this.channel.unsubscribe();
      this.channel = null;
    }

    this.currentUserId = null;
    this.onlineUsers.clear();
  }
}

export const PresenceService = new PresenceServiceManager();
