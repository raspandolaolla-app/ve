// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE SEGURIDAD Y AUDITORÍA
// ==============================================================================
// Gestiona registros de auditoría y eventos de seguridad del sistema.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { AuditLogEntry, SecurityEvent } from '../../types/security';

export class SecurityRepository {
  /**
   * Obtiene eventos de auditoría del usuario actual.
   */
  public static async getUserAuditLogs(userId: string, limit: number = 20): Promise<AuditLogEntry[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('actor_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[SecurityRepository] Error obteniendo auditoría:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      actorUserId: row.actor_id,
      action: row.action,
      entity: row.target_table,
      entityId: row.target_id,
      timestamp: row.created_at,
      ipAddressMasked: row.ip_address,
      userAgentSnippet: row.user_agent,
      metadata: row.new_data || row.old_data || {},
      status: 'success',
    }));
  }

  /**
   * Reporta un evento de seguridad o sospecha de fraude/anomalía.
   */
  public static async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase.from('security_events').insert({
      user_id: event.userId,
      event_type: event.eventType,
      severity: event.severity,
      details: event.details,
    });
  }
}
