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
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      serviceFeePercent: Number(data.service_fee_percent || 10),
      winnerPercent: Number(data.winner_percent || 90),
      minimumAge: Number(data.minimum_age || 18),
      minDepositAmount: Number(data.min_deposit_amount || 10),
      maxDepositAmount: Number(data.max_deposit_amount || 50000),
      minWithdrawalAmount: Number(data.min_withdrawal_amount || 20),
      maxWithdrawalAmount: Number(data.max_withdrawal_amount || 20000),
      maintenanceMode: Boolean(data.maintenance_mode),
      mfaRequiredForWithdrawal: Boolean(data.mfa_required_for_withdrawal),
      kycRequiredForRealMoney: Boolean(data.kyc_required_for_real_money),
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
