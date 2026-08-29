-- ================================================================
-- MIGRACIÓN 007: Solicitudes de Retiro (Withdrawal Requests)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  payment_account_id UUID NOT NULL REFERENCES public.payment_accounts(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'VES',
  status withdrawal_status_enum NOT NULL DEFAULT 'PENDING',
  mfa_verified_at TIMESTAMPTZ NOT NULL,
  processed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  bank_reference VARCHAR(50) NULL,
  rejection_reason TEXT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_withdrawal_amount CHECK (amount >= 100.00),
  CONSTRAINT chk_withdrawal_currency CHECK (currency = 'VES'),
  CONSTRAINT uq_withdrawal_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user_id ON public.withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON public.withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_created_at ON public.withdrawal_requests(created_at);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests FORCE ROW LEVEL SECURITY;
