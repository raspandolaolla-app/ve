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
        }
      });

    // Registrar actualización en la tabla profiles
    await this.updateProfileOnlineStatus(userId, true);

    // Heartbeat cada 60 segundos
    this.heartbeatInterval = setInterval(() => {
      if (this.currentUserId) {
        this.updateProfileOnlineStatus(this.currentUserId, true);
      }
    }, 60000);

    // Cleanup en cierre de ventana
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  /**
   * Actualiza el estado en la tabla `profiles` si existe la columna `is_online`
   */
  private async updateProfileOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return;

    try {
      await supabase
        .from('profiles')
        .update({
          is_online: isOnline,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } catch {
      // Ignorar si la columna no existe o falla la actualización
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
