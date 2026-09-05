/**
 * ==============================================================================
 * RASPANDO LA OLLA — REPOSITORIO DE SOPORTE Y NOTIFICACIONES ADMINISTRATIVAS
 * ==============================================================================
 * Extraído de AdminRepository.ts para modularización de Fase 3.
 * Atención al usuario, tickets de soporte y notificaciones del sistema.
 * ==============================================================================
 */

import { getSupabaseClient } from '../../../lib/supabase/client';
import { logger } from '../../../utils/logger';
import { AdminAuditRepository } from './AdminAuditRepository';
import type {
  AdminSupportTicketItem,
  AdminNotificationItem,
} from '../../../types/admin';

export class AdminSupportRepository {
  /**
   * Centro de atención y soporte al usuario.
   */
  public static async getSupportTickets(filters?: {
    status?: string;
    search?: string;
  }): Promise<AdminSupportTicketItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      let query = supabase
        .from('support_tickets')
        .select(`
          *,
          profiles:user_id(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('[AdminSupportRepository] Error obteniendo tickets de soporte:', error.message);
        return [];
      }

      let items: AdminSupportTicketItem[] = (data || []).map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Usuario';

        return {
          id: row.id,
          userId: row.user_id,
          userEmail: `${name.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
          userName: name,
          category: row.category as any,
          subject: row.subject,
          description: row.description,
          relatedTableId: row.related_table_id,
          status: row.status as any,
          assignedOperatorId: row.assigned_operator_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          responses: [
            {
              id: `resp-${row.id}-1`,
              authorName: name,
              authorRole: 'PLAYER',
              message: row.description,
              createdAt: row.created_at,
            },
          ],
        };
      });

      if (filters?.search) {
        const s = filters.search.toLowerCase();
        items = items.filter(
          (t) =>
            t.subject.toLowerCase().includes(s) ||
            t.userName.toLowerCase().includes(s) ||
            t.description.toLowerCase().includes(s)
        );
      }

      return items;
    } catch (err: unknown) {
      logger.error('[AdminSupportRepository] Excepción obteniendo tickets:', err);
      return [];
    }
  }

  /**
   * Responde o actualiza el estado de un ticket de soporte.
   */
  public static async updateTicketStatus(
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED'
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status })
        .eq('id', ticketId);

      if (error) return { success: false, error: error.message };

      await AdminAuditRepository.recordAdminAudit({
        action: 'UPDATE_SUPPORT_TICKET_STATUS',
        resourceType: 'SUPPORT_TICKET',
        resourceId: ticketId,
        metadata: { ticket_id: ticketId, new_status: status },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Centro de notificaciones y alertas operativas para administradores.
   */
  public static async getAdminNotifications(): Promise<AdminNotificationItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) return [];

      return (data || []).map((row: any) => ({
        id: row.id,
        type: row.type || 'SYSTEM',
        title: row.title,
        message: row.message,
        severity: row.type === 'SECURITY' ? 'CRITICAL' : 'INFO',
        isRead: Boolean(row.is_read),
        createdAt: row.created_at,
        data: row.data,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Marca una notificación como leída.
   */
  public static async markNotificationAsRead(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    } catch (err: unknown) {
      logger.warn('[AdminSupportRepository] Error marcando notificación:', err);
    }
  }
}
