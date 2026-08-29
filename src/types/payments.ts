// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: PAGOS Y MÉTODOS
// ==============================================================================

export type PaymentMethodType = 'pago_movil' | 'bank_transfer';

export interface PaymentAccount {
  id: string;
  userId: string;
  bankCode: string; // Código de 4 dígitos bancarios (ej. 0102, 0108, 0134, etc.)
  bankName: string;
  phoneNumber: string;
  idDocument: string; // V-12345678
  accountHolderName: string;
  isVerified: boolean;
  isLocked: boolean;
  createdAt: string;
}

export interface DepositRequest {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: PaymentMethodType;
  bankOrigin: string;
  referenceNumber: string;
  receiptUrl?: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'cancelled';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  destinationAccountId: string;
  status: 'requested' | 'reserved' | 'under_review' | 'approved' | 'processing' | 'paid' | 'rejected' | 'cancelled';
  bankReference?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}
