-- ================================================================
-- MIGRACIÓN 005: Cuentas de Pago Móvil (Payment Accounts)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  bank_code VARCHAR(4) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  id_number_masked VARCHAR(20) NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_payment_accounts_bank_code CHECK (length(bank_code) = 4)
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_user_id ON public.payment_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_active ON public.payment_accounts(user_id, is_active);

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts FORCE ROW LEVEL SECURITY;
