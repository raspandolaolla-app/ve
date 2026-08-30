-- ================================================================
-- MIGRACIÓN 004: Billeteras (Wallets) y Libro Mayor Inmutable (Ledger)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- 1. Tabla de Billeteras de Usuario
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  currency VARCHAR(3) NOT NULL DEFAULT 'VES',
  available_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  held_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_balance NUMERIC(14,2) GENERATED ALWAYS AS (available_balance + held_balance) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_wallets_user_id UNIQUE (user_id),
  CONSTRAINT chk_wallets_available_balance CHECK (available_balance >= 0.00),
  CONSTRAINT chk_wallets_held_balance CHECK (held_balance >= 0.00),
  CONSTRAINT chk_wallets_currency CHECK (currency = 'VES')
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets FORCE ROW LEVEL SECURITY;

-- 2. Tabla del Libro Mayor Inmutable (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  entry_type ledger_entry_type_enum NOT NULL,
  direction ledger_direction_enum NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  balance_after_available NUMERIC(14,2) NOT NULL,
  balance_after_held NUMERIC(14,2) NOT NULL,
  reference_table VARCHAR(50) NOT NULL,
  reference_id UUID NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  actor_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_ledger_amount CHECK (amount > 0.00),
  CONSTRAINT chk_ledger_balance_after_available CHECK (balance_after_available >= 0.00),
  CONSTRAINT chk_ledger_balance_after_held CHECK (balance_after_held >= 0.00),
  CONSTRAINT uq_ledger_idempotency_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_id ON public.ledger_entries(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON public.ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entry_type ON public.ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON public.ledger_entries(reference_table, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_idempotency_key ON public.ledger_entries(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.ledger_entries(created_at);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries FORCE ROW LEVEL SECURITY;

-- 3. Garantía Estricta de Inmutabilidad en Ledger (Bloqueo a nivel de motor DB)
CREATE OR REPLACE FUNCTION public.enforce_ledger_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE_VIOLATION: El libro mayor contable es estrictamente inmutable. No se permite UPDATE ni DELETE.';
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_prevent_modification ON public.ledger_entries;
CREATE TRIGGER trg_ledger_prevent_modification
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ledger_immutability();
