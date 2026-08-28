// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE SEGURIDAD Y AUDITORÍA
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

  /**
   * Genera el secreto 2FA TOTP y la URI para el código QR.
   */
  public static async generateTotpSecret(): Promise<{ secret: string; qrUri: string; email: string } | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase.rpc('generate_totp_secret');
      if (error || !data) {
        console.error('[SecurityRepository] Error generando secreto 2FA:', error?.message);
        return null;
      }
      return {
        secret: data.secret,
        qrUri: data.qr_uri,
        email: data.email,
      };
    } catch (err) {
      console.error('[SecurityRepository] Excepción generando secreto 2FA:', err);
      return null;
    }
  }

  /**
   * Verifica un código TOTP de 6 dígitos.
   */
  public static async verifyTotpCode(code: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    try {
      const { data, error } = await supabase.rpc('verify_totp_code', { p_code: code });
      if (error) return false;
      return Boolean(data);
    } catch {
      return false;
    }
  }

  /**
   * Activa el 2FA tras validar el código TOTP.
   */
  public static async enable2FA(code: string): Promise<{ success: boolean; message: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, message: 'Servicio no disponible' };

    try {
      const { data, error } = await supabase.rpc('enable_2fa', { p_code: code });
      if (error) {
        return { success: false, message: error.message || 'Error al activar 2FA' };
      }
      return {
        success: Boolean(data?.success),
        message: data?.message || '2FA activado con éxito',
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error al activar 2FA' };
    }
  }

  /**
   * Desactiva el 2FA tras validar el código TOTP.
   */
  public static async disable2FA(code: string): Promise<{ success: boolean; message: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, message: 'Servicio no disponible' };

    try {
      const { data, error } = await supabase.rpc('disable_2fa', { p_code: code });
      if (error) {
        return { success: false, message: error.message || 'Error al desactivar 2FA' };
      }
      return {
        success: Boolean(data?.success),
        message: data?.message || '2FA desactivado correctamente',
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error al desactivar 2FA' };
    }
  }
}
