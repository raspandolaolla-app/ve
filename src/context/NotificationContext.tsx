// ==============================================================================
// RASPANDO LA OLLA — CONTEXTO GLOBAL DE NOTIFICACIONES (EVENT-DRIVEN)
// Principio: Supabase es la fuente de verdad. Solo eventos reales del sistema.
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { NotificationRepository } from '../services/repositories/NotificationRepository';
import { RealtimeManager } from '../services/realtime/RealtimeManager';
import { useAudio } from '../hooks/useAudio';
import type { AppNotification } from '../types/notifications';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  clearAllRead: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  refreshNotifications: async () => {},
  markAsRead: async () => false,
  markAllAsRead: async () => false,
  deleteNotification: async () => false,
  clearAllRead: async () => false,
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, state } = useAuth();
  const { playSound } = useAudio();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isAuthenticated = state === 'authenticated' && Boolean(user?.id);

  // Carga inicial y refresco de notificaciones desde Supabase
  const refreshNotifications = useCallback(async () => {
    if (!user?.id || state !== 'authenticated') {
      setNotifications([]);
      return;
    }

    setIsLoading(true);
    try {
      const items = await NotificationRepository.getUserNotifications(user.id);
      setNotifications(items);
    } catch (err) {
      console.warn('[NotificationContext] Error cargando notificaciones:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, state]);

  // Manejador de eventos en tiempo real (INSERT, UPDATE, DELETE)
  const handleRealtimePayload = useCallback((payload: any) => {
    if (!payload) return;

    const eventType = payload.eventType;

    if (eventType === 'INSERT' && payload.new) {
      const newRow = payload.new;
      const newNotif: AppNotification = {
        id: newRow.id,
        userId: newRow.user_id,
        type: newRow.type,
        title: newRow.title,
        message: newRow.message,
        data: newRow.data || {},
        isRead: Boolean(newRow.is_read),
        createdAt: newRow.created_at,
        sourceType: newRow.source_type,
        sourceId: newRow.source_id,
        readAt: newRow.read_at,
        expiresAt: newRow.expires_at,
        archivedAt: newRow.archived_at,
      };

      setNotifications((prev) => {
        // Deduplicación en memoria por ID
        if (prev.some((n) => n.id === newNotif.id)) {
          return prev;
        }
        return [newNotif, ...prev];
      });

      // Feedback auditivo sutil
      try {
        playSound('click');
      } catch {
        // Ignorar si el audio no está disponible o bloqueado por el navegador
      }
    } else if (eventType === 'UPDATE' && payload.new) {
      const updatedRow = payload.new;
      setNotifications((prev) =>
        prev
          .map((n) =>
            n.id === updatedRow.id
              ? {
                  ...n,
                  isRead: Boolean(updatedRow.is_read),
                  readAt: updatedRow.read_at,
                  archivedAt: updatedRow.archived_at,
                  title: updatedRow.title || n.title,
                  message: updatedRow.message || n.message,
                  data: updatedRow.data || n.data,
                }
              : n
          )
          // Si fue archivada, remover de la lista activa
          .filter((n) => !n.archivedAt)
      );
    } else if (eventType === 'DELETE' && payload.old) {
      const deletedId = payload.old.id;
      setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
    }
  }, [playSound]);

  // Suscripción Realtime mientras el usuario esté autenticado
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setNotifications([]);
      return;
    }

    refreshNotifications();

    const unsubscribe = RealtimeManager.subscribeToUserEvents(
      user.id,
      () => {}, // balance handler (manejado por WalletContext)
      handleRealtimePayload
    );

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, user?.id, refreshNotifications, handleRealtimePayload]);

  // Marcar una notificación como leída
  const markAsRead = useCallback(async (id: string): Promise<boolean> => {
    // Actualización optimista
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
    );

    const success = await NotificationRepository.markAsRead(id);
    if (!success) {
      // Revertir si falló la llamada al servidor
      refreshNotifications();
    }
    return success;
  }, [refreshNotifications]);

  // Marcar todas como leídas
  const markAllAsRead = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
    );

    const success = await NotificationRepository.markAllAsRead(user.id);
    if (!success) {
      refreshNotifications();
    }
    return success;
  }, [user?.id, refreshNotifications]);

  // Eliminar una notificación
  const deleteNotification = useCallback(async (id: string): Promise<boolean> => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const success = await NotificationRepository.deleteNotification(id);
    if (!success) {
      refreshNotifications();
    }
    return success;
  }, [refreshNotifications]);

  // Limpiar/archivar todas las notificaciones leídas
  const clearAllRead = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;

    setNotifications((prev) => prev.filter((n) => !n.isRead));
    const success = await NotificationRepository.clearAllRead(user.id);
    if (!success) {
      refreshNotifications();
    }
    return success;
  }, [user?.id, refreshNotifications]);

  // Cálculo de notificaciones no leídas
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead && !n.archivedAt).length;
  }, [notifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications debe ser usado dentro de un NotificationProvider');
  }
  return context;
};
