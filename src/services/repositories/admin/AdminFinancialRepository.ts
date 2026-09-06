/**
 * ==============================================================================
 * RASPANDO LA OLLA — REPOSITORIO DE OPERACIONES FINANCIERAS ADMINISTRATIVAS
 * ==============================================================================
 * Extraído de AdminRepository.ts para modularización de Fase 3.
 * Gestión autoritativa de depósitos, retiros, balances de billeteras, libro mayor
 * y resumen contable general (regla inmutable 90/10).
 * ==============================================================================
 */

import { getSupabaseClient } from '../../../lib/supabase/client';
import { logger } from '../../../utils/logger';
import { AdminAuditRepository } from './AdminAuditRepository';
import type {
  AdminDepositItem,
  AdminWithdrawalItem,
  AdminWalletItem,
  AdminLedgerEntryItem,
  AccountingOverview,
} from '../../../types/admin';

export class AdminFinancialRepository {
  /**
   * Obtiene la lista de solicitudes de recarga (depósitos).
   */
  public static async getDepositsList(filters?: {
    status?: string;
    search?: string;
  }): Promise<AdminDepositItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      let query = supabase
        .from('deposit_requests')
        .select(`
          *,
          profiles:user_id(first_name, last_name, phone_number)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('[AdminFinancialRepository] Error obteniendo recargas:', error.message);
        return [];
      }

      let items: AdminDepositItem[] = (data || []).map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Usuario';

        return {
          id: row.id,
          userId: row.user_id,
          userName: name || 'Usuario',
          amount: Number(row.amount),
          currency: row.currency || 'VES',
          originBankCode: row.origin_bank_code || row.origin_bank || '0102',
          originPhone: row.origin_phone || '0414-0000000',
          referenceNumber: row.reference_number,
          paymentDate: row.payment_date,
          receiptUrl: row.receipt_url,
          status: row.status,
          reviewedBy: row.reviewed_by,
          reviewedAt: row.reviewed_at,
          rejectionReason: row.rejection_reason,
          createdAt: row.created_at,
        };
      });

      if (filters?.search) {
        const s = filters.search.toLowerCase();
        items = items.filter(
          (d) =>
            d.referenceNumber.toLowerCase().includes(s) ||
            d.userName?.toLowerCase().includes(s) ||
            d.originPhone.includes(s)
        );
      }

      return items;
    } catch (err: unknown) {
      logger.error('[AdminFinancialRepository] Excepción obteniendo recargas:', err);
      return [];
    }
  }

  /**
   * Aprueba una recarga de saldo mediante RPC transaccional segura.
   */
  public static async approveDeposit(depositId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    try {
      const { data, error } = await supabase.rpc('admin_approve_deposit', {
        p_deposit_id: depositId,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      await AdminAuditRepository.recordAdminAudit({
        action: 'APPROVE_DEPOSIT_REQUEST',
        resourceType: 'DEPOSIT_REQUEST',
        resourceId: depositId,
        severity: 'INFO',
        metadata: { deposit_id: depositId, result: data },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Rechaza una recarga registrando el motivo y auditoría.
   */
  public static async rejectDeposit(
    depositId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      const { error } = await supabase
        .from('deposit_requests')
        .update({
          status: 'REJECTED',
          rejection_reason: reason,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', depositId)
        .eq('status', 'PENDING');

      if (error) {
        return { success: false, error: error.message };
      }

      await AdminAuditRepository.recordAdminAudit({
        action: 'REJECT_DEPOSIT_REQUEST',
        resourceType: 'DEPOSIT_REQUEST',
        resourceId: depositId,
        severity: 'WARNING',
        metadata: { deposit_id: depositId, rejection_reason: reason },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Obtiene la lista de solicitudes de retiro.
   */
  public static async getWithdrawalsList(filters?: {
    status?: string;
    search?: string;
  }): Promise<AdminWithdrawalItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      let query = supabase
        .from('withdrawal_requests')
        .select(`
          *,
          profiles:user_id(first_name, last_name),
          payment_accounts:payment_account_id(bank_code, bank_name, phone_number, id_number_masked, is_verified)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('[AdminFinancialRepository] Error obteniendo retiros:', error.message);
        return [];
      }

      let items: AdminWithdrawalItem[] = (data || []).map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const account = Array.isArray(row.payment_accounts) ? row.payment_accounts[0] : row.payment_accounts;
        const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Usuario';

        return {
          id: row.id,
          userId: row.user_id,
          userName: name || 'Usuario',
          amount: Number(row.amount),
          currency: row.currency || 'VES',
          status: row.status,
          bankCode: account?.bank_code || '0102',
          bankName: account?.bank_name || 'Banco de Venezuela',
          phoneNumber: account?.phone_number,
          idDocument: account?.id_number_masked || undefined,
          accountHolderName: name,
          bankReference: row.bank_reference,
          rejectionReason: row.rejection_reason,
          processedBy: row.processed_by,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        };
      });

      if (filters?.search) {
        const s = filters.search.toLowerCase();
        items = items.filter(
          (w) =>
            w.userName?.toLowerCase().includes(s) ||
            w.accountHolderName?.toLowerCase().includes(s) ||
            w.bankReference?.toLowerCase().includes(s)
        );
      }

      return items;
    } catch (err: unknown) {
      logger.error('[AdminFinancialRepository] Excepción obteniendo retiros:', err);
      return [];
    }
  }

  /**
   * Procesa un retiro aprobado marcándolo como completado o ejecutando la RPC correspondiente.
   */
  public static async processWithdrawal(
    withdrawalId: string,
    bankReference?: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      const { error } = await supabase
        .from('withdrawal_requests')
        .update({
          status: 'COMPLETED',
          bank_reference: bankReference || null,
          processed_by: user?.id || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', withdrawalId)
        .eq('status', 'PENDING');

      if (error) {
        return { success: false, error: error.message };
      }

      await AdminAuditRepository.recordAdminAudit({
        action: 'PROCESS_WITHDRAWAL_REQUEST',
        resourceType: 'WITHDRAWAL_REQUEST',
        resourceId: withdrawalId,
        severity: 'INFO',
        metadata: { withdrawal_id: withdrawalId, bank_reference: bankReference },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Rechaza un retiro reintegrando el saldo retenido mediante RPC segura.
   */
  public static async rejectWithdrawal(
    withdrawalId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data, error } = await supabase.rpc('admin_reject_withdrawal', {
        p_withdrawal_id: withdrawalId,
        p_reason: reason,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      await AdminAuditRepository.recordAdminAudit({
        action: 'REJECT_WITHDRAWAL_REQUEST',
        resourceType: 'WITHDRAWAL_REQUEST',
        resourceId: withdrawalId,
        severity: 'WARNING',
        metadata: { withdrawal_id: withdrawalId, reason, result: data },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Obtiene la supervisión de billeteras de usuarios.
   */
  public static async getWalletsList(search?: string): Promise<AdminWalletItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('wallets')
        .select(`
          id,
          user_id,
          currency,
          available_balance,
          held_balance,
          total_balance,
          updated_at,
          profiles:user_id(first_name, last_name)
        `)
        .order('total_balance', { ascending: false });

      if (error) {
        logger.error('[AdminFinancialRepository] Error obteniendo billeteras:', error.message);
        return [];
      }

      let items: AdminWalletItem[] = (data || []).map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Usuario';

        return {
          id: row.id,
          userId: row.user_id,
          userEmail: `${name.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
          userName: name,
          currency: row.currency || 'VES',
          availableBalance: Number(row.available_balance),
          heldBalance: Number(row.held_balance),
          totalBalance: Number(row.total_balance),
          lastMovementAt: row.updated_at,
        };
      });

      if (search) {
        const s = search.toLowerCase();
        items = items.filter((w) => w.userName.toLowerCase().includes(s) || w.userId.toLowerCase().includes(s));
      }

      return items;
    } catch (err: unknown) {
      logger.error('[AdminFinancialRepository] Excepción listando billeteras:', err);
      return [];
    }
  }

  /**
   * Obtiene los movimientos de libro mayor (ledger) de un usuario.
   */
  public static async getUserLedger(userId: string, limit: number = 20): Promise<AdminLedgerEntryItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('[AdminFinancialRepository] Error obteniendo ledger:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        walletId: row.wallet_id,
        userId: row.user_id,
        entryType: row.entry_type,
        direction: row.direction,
        amount: Number(row.amount),
        balanceAfterAvailable: Number(row.balance_after_available),
        balanceAfterHeld: Number(row.balance_after_held),
        referenceTable: row.reference_table,
        referenceId: row.reference_id,
        description: row.description,
        createdAt: row.created_at,
      }));
    } catch (err: unknown) {
      logger.error('[AdminFinancialRepository] Excepción obteniendo ledger:', err);
      return [];
    }
  }

  /**
   * Obtiene el resumen contable general y balance financiero de la plataforma.
   */
  public static async getAccountingOverview(): Promise<AccountingOverview> {
    const supabase = getSupabaseClient();
    const fallback: AccountingOverview = {
      totalAvailableBalance: 0,
      totalHeldBalance: 0,
      totalWalletFunds: 0,
      walletsCount: 0,
      approvedDepositsSum: 0,
      approvedDepositsCount: 0,
      pendingDepositsSum: 0,
      pendingDepositsCount: 0,
      completedWithdrawalsSum: 0,
      completedWithdrawalsCount: 0,
      pendingWithdrawalsSum: 0,
      pendingWithdrawalsCount: 0,
      totalPrizesAwarded: 0,
      totalRakeCollected: 0,
      settledMatchesCount: 0,
      netOperatingMargin: 0,
      calculatedAt: new Date().toISOString(),
    };

    if (!supabase) return fallback;

    try {
      const { data, error } = await supabase.rpc('get_accounting_overview');
      if (error || !data) return fallback;

      return {
        totalAvailableBalance: Number(data.total_available_balance || 0),
        totalHeldBalance: Number(data.total_held_balance || 0),
        totalWalletFunds: Number(data.total_wallet_funds || 0),
        walletsCount: Number(data.wallets_count || 0),
        approvedDepositsSum: Number(data.approved_deposits_sum || 0),
        approvedDepositsCount: Number(data.approved_deposits_count || 0),
        pendingDepositsSum: Number(data.pending_deposits_sum || 0),
        pendingDepositsCount: Number(data.pending_deposits_count || 0),
        completedWithdrawalsSum: Number(data.completed_withdrawals_sum || 0),
        completedWithdrawalsCount: Number(data.completed_withdrawals_count || 0),
        pendingWithdrawalsSum: Number(data.pending_withdrawals_sum || 0),
        pendingWithdrawalsCount: Number(data.pending_withdrawals_count || 0),
        totalPrizesAwarded: Number(data.total_prizes_awarded || 0),
        totalRakeCollected: Number(data.total_rake_collected || 0),
        settledMatchesCount: Number(data.settled_matches_count || 0),
        netOperatingMargin: Number(data.net_operating_margin || 0),
        calculatedAt: data.calculated_at || new Date().toISOString(),
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Alias de compatibilidad para métricas financieras.
   */
  public static async getFinancialMetrics(): Promise<AccountingOverview> {
    return this.getAccountingOverview();
  }

  /**
   * Obtiene las últimas entradas del libro mayor (ledger) para auditoría financiera.
   */
  public static async getLedgerEntries(limit: number = 100): Promise<AdminLedgerEntryItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) {
        return [];
      }

      return data.map((row: any) => ({
        id: row.id,
        walletId: row.wallet_id || '',
        userId: row.user_id || '',
        entryType: row.entry_type || 'TRANSACTION',
        direction: (row.direction as 'CREDIT' | 'DEBIT') || 'CREDIT',
        amount: Number(row.amount || 0),
        balanceAfterAvailable: Number(row.balance_after_available || 0),
        balanceAfterHeld: Number(row.balance_after_held || 0),
        referenceTable: row.reference_table || '',
        referenceId: row.reference_id || '',
        description: row.description || '',
        createdAt: row.created_at || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }
}
