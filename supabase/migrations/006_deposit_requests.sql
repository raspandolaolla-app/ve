-- ================================================================
-- MIGRACIÓN 006: Solicitudes de Recarga (Deposit Requests)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'VES',
  origin_bank_code VARCHAR(4) NOT NULL,
  origin_phone VARCHAR(20) NOT NULL,
  destination_account_id UUID NOT NULL,
  reference_number VARCHAR(50) NOT NULL,
  payment_date DATE NOT NULL,
  status deposit_status_enum NOT NULL DEFAULT 'PENDING',
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_deposit_amount CHECK (amount >= 50.00),
  CONSTRAINT chk_deposit_currency CHECK (currency = 'VES'),
  CONSTRAINT uq_deposit_bank_ref_date UNIQUE (origin_bank_code, reference_number, payment_date),
  CONSTRAINT uq_deposit_idempotency UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_deposit_user_id ON public.deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_status ON public.deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposit_created_at ON public.deposit_requests(created_at);

ALTER TABLE public.deposit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposit_requests FORCE ROW LEVEL SECURITY;
