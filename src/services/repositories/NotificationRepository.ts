// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE NOTIFICACIONES
// Principio: Solo eventos reales del sistema. Supabase = Fuente de verdad.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { AppNotification } from '../../types/notifications';
import { logger } from '../../utils/logger';

export class NotificationRepository {
  /**
   * Obtiene las notificaciones activas del usuario desde Supabase.
   */
  public static async getUserNotifications(
    userId: string,
    limit: number = 30
  ): Promise<AppNotification[]> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return [];

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('[NotificationRepository] Error obteniendo notificaciones:', error.message);
        return [];
      }

      return (data || []).map((row: any): AppNotification => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        title: row.title,
        message: row.message,
        data: row.data || {},
        isRead: Boolean(row.is_read),
        createdAt: row.created_at,
        sourceType: row.source_type,
        sourceId: row.source_id,
        readAt: row.read_at,
        expiresAt: row.expires_at,
        archivedAt: row.archived_at,
      }));
    } catch (err: unknown) {
      logger.error('[NotificationRepository] Excepción obteniendo notificaciones:', err);
      return [];
    }
  }

  /**
   * Obtiene el conteo exacto de notificaciones no leídas activas del usuario.
   */
  public static async getUnreadCount(userId: string): Promise<number> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return 0;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .is('archived_at', null);

      if (error) {
        logger.warn('[NotificationRepository] Error obteniendo conteo no leídas:', error.message);
        return 0;
      }

      return count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Marca una notificación específica como leída.
   */
  public static async markAsRead(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase || !id) return false;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        logger.warn('[NotificationRepository] Error marcando como leída:', error.message);
        return false;
      }

      return true;
    } catch (err: unknown) {
      logger.error('[NotificationRepository] Excepción en markAsRead:', err);
      return false;
    }
  }

  /**
   * Marca todas las notificaciones pendientes de un usuario como leídas.
   */
  public static async markAllAsRead(userId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return false;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        logger.warn('[NotificationRepository] Error marcando todas como leídas:', error.message);
        return false;
      }

      return true;
    } catch (err: unknown) {
      logger.error('[NotificationRepository] Excepción en markAllAsRead:', err);
      return false;
    }
  }

  /**
   * Elimina una notificación del usuario.
   */
  public static async deleteNotification(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase || !id) return false;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) {
        logger.warn('[NotificationRepository] Error eliminando notificación:', error.message);
        return false;
      }

      return true;
    } catch (err: unknown) {
      logger.error('[NotificationRepository] Excepción eliminando notificación:', err);
      return false;
    }
  }

  /**
   * Archiva o limpia todas las notificaciones leídas del usuario.
   */
  public static async clearAllRead(userId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return false;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({
          archived_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_read', true);

      if (error) {
        logger.warn('[NotificationRepository] Error archivando leídas:', error.message);
        return false;
      }

      return true;
    } catch (err: unknown) {
      logger.error('[NotificationRepository] Excepción archivando leídas:', err);
      return false;
    }
  }

  /**
   * Envía un comunicado oficial / broadcast administrativo real vía RPC segura.
   */
  public static async sendAdminBroadcast(params: {
    title: string;
    message: string;
    type?: string;
    targetUserId?: string;
    expiresInDays?: number;
  }): Promise<{ success: boolean; error?: string; recipientsCount?: number; broadcastId?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio de base de datos no disponible' };

    try {
      const { data, error } = await supabase.rpc('admin_send_broadcast', {
        p_title: params.title,
        p_message: params.message,
        p_type: params.type || 'ADMIN_BROADCAST',
        p_target_user_id: params.targetUserId || null,
        p_expires_in_days: params.expiresInDays ?? 7,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        recipientsCount: data?.recipients_count,
        broadcastId: data?.broadcast_id,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Ejecuta la limpieza de notificaciones expiradas mediante RPC en Supabase.
   */
  public static async cleanExpiredNotifications(): Promise<number> {
    const supabase = getSupabaseClient();
    if (!supabase) return 0;

    try {
      const { data, error } = await supabase.rpc('clean_expired_notifications');
      if (error) {
        logger.warn('[NotificationRepository] Error en cleanExpiredNotifications:', error.message);
        return 0;
      }
      return Number(data || 0);
    } catch {
      return 0;
    }
  }
}
