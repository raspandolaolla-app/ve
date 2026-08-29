// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE BILLETERA Y LEDGER
// ==============================================================================
// Capa de abstracción para saldos y movimientos.
// Fuente de verdad: Supabase Ledger (No simulado).
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import type { WalletBalance, WalletTransaction, WithdrawalRequestResult } from '../../types/wallet';

export class WalletRepository {
  /**
   * Consulta el saldo verificado del usuario desde Supabase.
   */
  public static async getBalance(userId: string): Promise<WalletBalance | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[WalletRepository] Error consultando saldo:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      userId: data.user_id,
      currency: data.currency,
      availableBalance: Number(data.available_balance || 0),
      heldBalance: Number(data.held_balance || 0),
      totalBalance: Number(data.available_balance || 0) + Number(data.held_balance || 0),
      isLocked: Boolean(data.is_locked),
      updatedAt: data.updated_at,
    };
  }

  /**
   * Obtiene el historial de movimientos del Ledger contable del usuario.
   */
  public static async getTransactions(userId: string, limit: number = 20): Promise<WalletTransaction[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[WalletRepository] Error listando entradas de ledger:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      amount: Number(row.amount),
      currency: 'VES',
      type: row.entry_type,
      direction: row.direction,
      status: 'completed',
      reference: row.idempotency_key || row.id.substring(0, 8),
      idempotencyKey: row.idempotency_key,
      balanceAfterAvailable: Number(row.balance_after_available),
      balanceAfterHeld: Number(row.balance_after_held),
      description: row.description,
      createdAt: row.created_at,
      createdBy: row.actor_id,
    }));
  }

  /**
   * Solicita un retiro con bloqueo pesimista en servidor.
   */
  public static async requestWithdrawal(
    paymentAccountId: string,
    amount: number,
    idempotencyKey: string
  ): Promise<WithdrawalRequestResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'El servicio no está disponible temporalmente' };
    }

    const { data, error } = await supabase.rpc('request_withdrawal_locked', {
      p_payment_account_id: paymentAccountId,
      p_amount: amount,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('[WalletRepository] Error solicitando retiro:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al solicitar retiro.') };
    }

    return {
      success: true,
      withdrawalId: data?.withdrawal_id,
      heldAmount: Number(data?.held_amount || amount),
      remainingAvailable: Number(data?.remaining_available || 0),
      message: 'Solicitud de retiro registrada y procesada en retención',
    };
  }
}
