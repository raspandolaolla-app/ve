// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE PAGOS, RECARGAS Y RETIROS
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import type { PaymentAccount, DepositRequest, WithdrawalRequest } from '../../types/payments';

export class PaymentRepository {
  /**
   * Obtiene las cuentas de Pago Móvil registradas por el usuario.
   */
  public static async getPaymentAccounts(userId: string): Promise<PaymentAccount[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('payment_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PaymentRepository] Error obteniendo cuentas de pago:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      bankCode: row.bank_code,
      bankName: row.bank_name,
      phoneNumber: row.phone_number,
      idDocument: row.id_document,
      accountHolderName: row.account_holder_name,
      isVerified: Boolean(row.is_verified),
      isLocked: Boolean(row.is_locked),
      createdAt: row.created_at,
    }));
  }

  /**
   * Obtiene las solicitudes de recarga del usuario.
   */
  public static async getDepositRequests(userId: string): Promise<DepositRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('deposit_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PaymentRepository] Error obteniendo recargas:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      amount: Number(row.amount),
      paymentMethod: row.payment_method,
      bankOrigin: row.bank_origin,
      referenceNumber: row.reference_number,
      receiptUrl: row.receipt_url,
      status: row.status,
      rejectionReason: row.rejection_reason,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Obtiene las solicitudes de retiro del usuario.
   */
  public static async getWithdrawalRequests(userId: string): Promise<WithdrawalRequest[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PaymentRepository] Error obteniendo retiros:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      amount: Number(row.amount),
      destinationAccountId: row.payment_account_id || row.destination_account_id,
      status: row.status,
      bankReference: row.bank_reference,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
    }));
  }

  /**
   * Registra una nueva cuenta de Pago Móvil para el usuario.
   */
  public static async createPaymentAccount(params: {
    bankCode: string;
    bankName: string;
    phoneNumber: string;
    idDocument: string;
    accountHolderName: string;
  }): Promise<PaymentAccount | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    const [cedType, cedNum] = params.idDocument.includes('-')
      ? params.idDocument.split('-')
      : ['V', params.idDocument];

    const { data, error } = await supabase
      .from('payment_accounts')
      .insert({
        user_id: userData.user.id,
        account_type: 'PAGO_MOVIL',
        bank_code: params.bankCode,
        bank_name: params.bankName,
        phone_number: params.phoneNumber,
        cedula_type: cedType || 'V',
        cedula_number: cedNum || params.idDocument,
        account_holder_name: params.accountHolderName,
        is_active: true,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[PaymentRepository] Error registrando cuenta de pago:', error?.message);
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      bankCode: data.bank_code,
      bankName: data.bank_name,
      phoneNumber: data.phone_number,
      idDocument: `${data.cedula_type}-${data.cedula_number}`,
      accountHolderName: data.account_holder_name,
      isVerified: Boolean(data.is_verified),
      isLocked: Boolean(data.is_locked),
      createdAt: data.created_at,
    };
  }

  /**
   * Envía un comprobante de recarga en bolívares.
   */
  public static async submitDepositRequest(params: {
    amount: number;
    bankOrigin: string;
    referenceNumber: string;
    receiptUrl?: string;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { success: false, error: 'Usuario no autenticado' };

    const { data, error } = await supabase
      .from('deposit_requests')
      .insert({
        user_id: userData.user.id,
        amount: params.amount,
        currency: 'VES',
        origin_bank: params.bankOrigin,
        reference_number: params.referenceNumber,
        receipt_url: params.receiptUrl,
        payment_date: new Date().toISOString().split('T')[0],
        status: 'PENDING',
      })
      .select()
      .single();

    if (error) {
      console.error('[PaymentRepository] Error enviando recarga:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al registrar solicitud de recarga.') };
    }

    return { success: true, id: data.id };
  }

  /**
   * Aprueba una recarga ejecutando la función segura process_deposit_approval.
   */
  public static async approveDeposit(
    depositId: string,
    idempotencyKey: string = `appr_dep_${depositId}_${Date.now()}`
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    const { error } = await supabase.rpc('process_deposit_approval', {
      p_deposit_id: depositId,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('[PaymentRepository] Error aprobando recarga:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al aprobar recarga.') };
    }

    return { success: true };
  }

  /**
   * Completa un retiro con referencia bancaria mediante process_withdrawal_completion.
   */
  public static async completeWithdrawal(
    withdrawalId: string,
    bankReference: string,
    idempotencyKey: string = `comp_wth_${withdrawalId}_${Date.now()}`
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    const { error } = await supabase.rpc('process_withdrawal_completion', {
      p_withdrawal_id: withdrawalId,
      p_bank_reference: bankReference,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('[PaymentRepository] Error completando retiro:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al completar retiro.') };
    }

    return { success: true };
  }

  /**
   * Rechaza y libera la retención de un retiro mediante process_withdrawal_rejection.
   */
  public static async rejectWithdrawal(
    withdrawalId: string,
    rejectionReason: string,
    idempotencyKey: string = `rej_wth_${withdrawalId}_${Date.now()}`
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    const { error } = await supabase.rpc('process_withdrawal_rejection', {
      p_withdrawal_id: withdrawalId,
      p_rejection_reason: rejectionReason,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('[PaymentRepository] Error rechazando retiro:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al rechazar retiro.') };
    }

    return { success: true };
  }
}
