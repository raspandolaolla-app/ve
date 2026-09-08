/**
 * ==============================================================================
 * RASPANDO LA OLLA — REPOSITORIO DE AUDITORÍA Y MANTENIMIENTO TÉCNICO
 * ==============================================================================
 * Extraído de AdminRepository.ts para modularización de Fase 3.
 * Registro inmutable en audit_logs, configuraciones del sistema, dry-run
 * de mantenimiento, purga de datos de prueba y bitácoras forenses.
 * ==============================================================================
 */

import { getSupabaseClient } from '../../../lib/supabase/client';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../../utils/constants';
import { logger } from '../../../utils/logger';
import type {
  SystemSettings,
  AdminAuditLogItem,
  MaintenanceDryRunResult,
} from '../../../types/admin';

export class AdminAuditRepository {
  /**
   * Registra una acción administrativa en audit_logs de forma estructurada.
   */
  public static async recordAdminAudit(params: {
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, any>;
    severity?: 'INFO' | 'WARNING' | 'CRITICAL' | 'SECURITY_ALERT';
  }): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      await supabase.from('audit_logs').insert({
        actor_id: user?.id || null,
        actor_role: user?.email && AUTHORIZED_SUPER_ADMIN_EMAILS.includes(user.email) ? 'SUPER_ADMIN' : 'ADMIN',
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        severity: params.severity || 'INFO',
        metadata: {
          ...params.metadata,
          actor_email: user?.email || 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err: unknown) {
      logger.warn('[AdminAuditRepository] Advertencia al escribir audit_log:', err);
    }
  }

  /**
   * Obtiene los registros forenses de auditoría inmutable.
   */
  public static async getAuditLogs(limit: number = 50, actionFilter?: string): Promise<AdminAuditLogItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (actionFilter && actionFilter !== 'ALL') {
        query = query.ilike('action', `%${actionFilter}%`);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('[AdminAuditRepository] Error obteniendo audit_logs:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        actorId: row.actor_id,
        actorEmail: row.metadata?.actor_email || 'admin@raspando.com',
        actorRole: row.actor_role || 'ADMIN',
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        severity: row.severity,
        ipAddress: row.ip_address,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      }));
    } catch (err: unknown) {
      logger.error('[AdminAuditRepository] Excepción obteniendo logs:', err);
      return [];
    }
  }

  /**
   * Obtiene logs específicos de seguridad y alertas críticas.
   */
  public static async getSecurityLogs(limit: number = 50): Promise<AdminAuditLogItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .in('severity', ['WARNING', 'CRITICAL', 'SECURITY_ALERT'])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('[AdminAuditRepository] Error obteniendo logs de seguridad:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        actorId: row.actor_id,
        actorEmail: row.metadata?.actor_email || 'admin@raspando.com',
        actorRole: row.actor_role || 'ADMIN',
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        severity: row.severity,
        ipAddress: row.ip_address,
        metadata: row.metadata || {},
        createdAt: row.created_at,
      }));
    } catch (err: unknown) {
      logger.error('[AdminAuditRepository] Excepción obteniendo logs de seguridad:', err);
      return [];
    }
  }

  /**
   * Obtiene la configuración general del sistema.
   */
  public static async getSystemSettings(): Promise<SystemSettings> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        serviceFeePercent: 10,
        winnerPercent: 90,
        minimumAge: 18,
        minDepositAmount: 50,
        maxDepositAmount: 50000,
        minWithdrawalAmount: 100,
        maxWithdrawalAmount: 20000,
        maintenanceMode: false,
        kycRequiredForRealMoney: true,
      };
    }

    try {
      const { data, error } = await supabase.from('system_settings').select('*');

      if (error || !data || data.length === 0) {
        return {
          serviceFeePercent: 10,
          winnerPercent: 90,
          minimumAge: 18,
          minDepositAmount: 50,
          maxDepositAmount: 50000,
          minWithdrawalAmount: 100,
          maxWithdrawalAmount: 20000,
          maintenanceMode: false,
          kycRequiredForRealMoney: true,
        };
      }

      const settingsMap: Record<string, any> = {};
      for (const row of data) {
        if (row.key && row.value !== undefined) {
          settingsMap[row.key] = row.value;
        }
      }

      return {
        serviceFeePercent: Number(settingsMap['SERVICE_FEE_PERCENT']?.percent ?? settingsMap['service_fee_percent'] ?? 10),
        winnerPercent: Number(settingsMap['WINNER_PERCENT']?.percent ?? settingsMap['winner_percent'] ?? 90),
        minimumAge: Number(settingsMap['MINIMUM_AGE']?.age ?? settingsMap['minimum_age'] ?? 18),
        minDepositAmount: Number(settingsMap['DEPOSIT_LIMITS']?.min ?? settingsMap['min_deposit_amount'] ?? 50),
        maxDepositAmount: Number(settingsMap['DEPOSIT_LIMITS']?.max ?? settingsMap['max_deposit_amount'] ?? 50000),
        minWithdrawalAmount: Number(settingsMap['WITHDRAWAL_LIMITS']?.min ?? settingsMap['min_withdrawal_amount'] ?? 100),
        maxWithdrawalAmount: Number(settingsMap['WITHDRAWAL_LIMITS']?.max ?? settingsMap['max_withdrawal_amount'] ?? 20000),
        maintenanceMode: Boolean(settingsMap['MAINTENANCE_MODE']?.enabled ?? settingsMap['maintenance_mode'] ?? false),
        kycRequiredForRealMoney: Boolean(settingsMap['SECURITY_POLICIES']?.kyc_required ?? settingsMap['kyc_required_for_real_money'] ?? true),
      };
    } catch {
      return {
        serviceFeePercent: 10,
        winnerPercent: 90,
        minimumAge: 18,
        minDepositAmount: 50,
        maxDepositAmount: 50000,
        minWithdrawalAmount: 100,
        maxWithdrawalAmount: 20000,
        maintenanceMode: false,
        kycRequiredForRealMoney: true,
      };
    }
  }

  /**
   * Actualiza un parámetro de system_settings con registro de auditoría.
   */
  public static async updateSystemSetting(
    key: string,
    value: any
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key,
          value,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString(),
        });

      if (error) return { success: false, error: error.message };

      await this.recordAdminAudit({
        action: 'UPDATE_SYSTEM_SETTING',
        resourceType: 'SYSTEM_SETTINGS',
        resourceId: key,
        severity: 'CRITICAL',
        metadata: { setting_key: key, new_value: value },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Ejecuta una evaluación preliminar (Dry-Run) de mantenimiento y limpieza técnica.
   */
  public static async runMaintenanceDryRun(): Promise<MaintenanceDryRunResult> {
    const supabase = getSupabaseClient();
    const fallback: MaintenanceDryRunResult = {
      expiredSessionsCount: 0,
      oldNotificationsCount: 0,
      oldAuditLogsCount: 0,
      totalEligibleRecords: 0,
      evaluatedAt: new Date().toISOString(),
      canProceed: false,
    };

    if (!supabase) return fallback;

    try {
      const { data, error } = await supabase.rpc('admin_cleanup_dry_run');
      if (error || !data) return fallback;

      return {
        expiredSessionsCount: Number(data.expired_sessions_count || 0),
        oldNotificationsCount: Number(data.old_notifications_count || 0),
        oldAuditLogsCount: Number(data.old_audit_logs_count || 0),
        totalEligibleRecords: Number(data.total_eligible_records || 0),
        evaluatedAt: data.evaluated_at || new Date().toISOString(),
        canProceed: Boolean(data.can_proceed),
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Ejecuta la limpieza de mantenimiento controlada en Supabase previa confirmación.
   */
  public static async executeMaintenanceCleanup(confirm: boolean = true): Promise<{ success: boolean; totalCleaned?: number; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data, error } = await supabase.rpc('admin_cleanup_execute', {
        p_confirm: confirm,
      });

      if (error || !data) return { success: false, error: error?.message || 'Error en ejecución' };

      return {
        success: Boolean(data.success),
        totalCleaned: Number(data.total_cleaned || 0),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Ejecuta la purga administrativa segura de datos y saldos de prueba (5000 Bs).
   * Respeta íntegramente cualquier fondo real depositado.
   */
  public static async adminPurgeTestData(): Promise<{
    success: boolean;
    message: string;
    affectedUsers?: number;
    error?: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, message: '', error: 'El servicio de base de datos no está disponible' };

    try {
      const { data, error } = await supabase.rpc('admin_purge_test_data');
      if (error) {
        return { success: false, message: '', error: error.message || 'Error al ejecutar purga de datos de prueba' };
      }
      return {
        success: Boolean(data?.success),
        message: data?.message || 'Limpieza completada exitosamente.',
        affectedUsers: Number(data?.affected_users || 0),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: '', error: message || 'Error inesperado en la purga' };
    }
  }
}
