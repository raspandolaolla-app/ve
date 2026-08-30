-- ================================================================
-- MIGRACIÓN 010: Liquidaciones Contables y Desglose de Pagos
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- 1. Tabla de Liquidación Principal de Partida (Regla 90/10 o Reembolso Total)
CREATE TABLE IF NOT EXISTS public.game_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
  table_id UUID NOT NULL REFERENCES public.game_tables(id) ON DELETE RESTRICT,
  settlement_type settlement_type_enum NOT NULL DEFAULT 'STANDARD_PAYOUT',
  gross_pool NUMERIC(14,2) NOT NULL,
  prize_pool NUMERIC(14,2) NOT NULL,
  platform_fee NUMERIC(14,2) NOT NULL,
  total_distributed NUMERIC(14,2) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_by VARCHAR(50) NOT NULL DEFAULT 'SERVER_ENGINE',

  CONSTRAINT uq_game_settlements_session UNIQUE (session_id),
  CONSTRAINT uq_game_settlements_idempotency UNIQUE (idempotency_key),
  CONSTRAINT chk_game_settlements_gross_pool CHECK (gross_pool >= 0.00),
  CONSTRAINT chk_game_settlements_prize_pool CHECK (prize_pool >= 0.00),
  CONSTRAINT chk_game_settlements_platform_fee CHECK (platform_fee >= 0.00),
  CONSTRAINT chk_game_settlements_financial_math CHECK (
    (settlement_type IN ('STANDARD_PAYOUT', 'SPLIT_PAYOUT') 
      AND prize_pool = ROUND(gross_pool * 0.90, 2) 
      AND platform_fee = gross_pool - prize_pool
      AND prize_pool + platform_fee = gross_pool
      AND total_distributed = prize_pool)
    OR
    (settlement_type IN ('DRAW_REFUND', 'ADMIN_CANCEL_REFUND')
      AND prize_pool = 0.00
      AND platform_fee = 0.00
      AND total_distributed = gross_pool)
  )
);

CREATE INDEX IF NOT EXISTS idx_settlements_session_id ON public.game_settlements(session_id);
CREATE INDEX IF NOT EXISTS idx_settlements_table_id ON public.game_settlements(table_id);
CREATE INDEX IF NOT EXISTS idx_settlements_settled_at ON public.game_settlements(settled_at);

ALTER TABLE public.game_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_settlements FORCE ROW LEVEL SECURITY;

-- 2. Tabla de Destinatarios de Pagos y Reembolsos Individuales
CREATE TABLE IF NOT EXISTS public.game_settlement_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.game_settlements(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  team_number SMALLINT NULL,
  payout_amount NUMERIC(14,2) NOT NULL,
  ledger_entry_id UUID NOT NULL REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  payout_status VARCHAR(20) NOT NULL DEFAULT 'CREDITED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_settlement_recipients_payout CHECK (payout_amount > 0.00),
  CONSTRAINT uq_settlement_recipients_user UNIQUE (settlement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_recipients_settlement ON public.game_settlement_recipients(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_recipients_user ON public.game_settlement_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_settlement_recipients_ledger ON public.game_settlement_recipients(ledger_entry_id);

ALTER TABLE public.game_settlement_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_settlement_recipients FORCE ROW LEVEL SECURITY;
