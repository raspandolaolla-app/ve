// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE ADMINISTRACIÓN (RBAC PROTEGIDO)
// ==============================================================================
// Todas las consultas en este repositorio están estrictamente protegidas
// por RLS en base de datos para roles ADMIN y SUPER_ADMIN.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { UserRole, SystemSettings, AdminDashboardMetrics } from '../../types/admin';

export class AdminRepository {
  /**
   * Obtiene el rol verificado del usuario desde Supabase (NO desde localStorage).
   */
  public static async getUserRole(userId: string): Promise<UserRole> {
    const supabase = getSupabaseClient();
    if (!supabase) return 'PLAYER';

    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return 'PLAYER';
    }

    return (data.role as UserRole) || 'PLAYER';
  }

  /**
   * Obtiene la configuración general del sistema.
   */
  public static async getSystemSettings(): Promise<SystemSettings | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('system_settings')
      .select('*');

    if (error || !data || data.length === 0) {
      // Default safe parameters defined by Venezuelan financial rules
      return {
        serviceFeePercent: 10,
        winnerPercent: 90,
        minimumAge: 18,
        minDepositAmount: 50,
        maxDepositAmount: 50000,
        minWithdrawalAmount: 100,
        maxWithdrawalAmount: 20000,
        maintenanceMode: false,
        mfaRequiredForWithdrawal: true,
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
      mfaRequiredForWithdrawal: Boolean(settingsMap['SECURITY_POLICIES']?.mfa_required ?? settingsMap['mfa_required_for_withdrawal'] ?? true),
      kycRequiredForRealMoney: Boolean(settingsMap['SECURITY_POLICIES']?.kyc_required ?? settingsMap['kyc_required_for_real_money'] ?? true),
    };
  }

  /**
   * Obtiene métricas reales para el dashboard administrativo.
   */
  public static async getMetrics(): Promise<AdminDashboardMetrics | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase.rpc('get_admin_dashboard_metrics');
    if (error || !data) return null;

    return data as AdminDashboardMetrics;
  }

  /**
   * Lista recargas pendientes de verificación por el operador.
   */
  public static async getPendingDeposits(): Promise<any[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('deposit_requests')
      .select('*, profiles:user_id(email, first_name, last_name)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AdminRepository] Error obteniendo recargas pendientes:', error.message);
      return [];
    }

    return data || [];
  }

  /**
   * Lista retiros pendientes de liquidación y transferencia.
   */
  public static async getPendingWithdrawals(): Promise<any[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*, profiles:user_id(email, first_name, last_name), payment_accounts:payment_account_id(*)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AdminRepository] Error obteniendo retiros pendientes:', error.message);
      return [];
    }

    return data || [];
  }

  /**
   * Obtiene los registros recientes de auditoría global del sistema.
   */
  public static async getAuditLogs(limit: number = 30): Promise<any[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AdminRepository] Error obteniendo logs:', error.message);
      return [];
    }

    return data || [];
  }
}
