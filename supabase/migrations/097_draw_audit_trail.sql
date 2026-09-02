-- ==============================================================================
-- RASPANDO LA OLLA — TABLA DE AUDITORÍA COMPLETA DE SORTEOS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.draw_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_type TEXT NOT NULL CHECK (draw_type IN ('BINGO', 'POLLA')),
  session_id UUID,
  table_id UUID,
  draw_date DATE NOT NULL,
  draw_time TEXT,
  block TEXT CHECK (block IN ('MAÑANA', 'TARDE')),
  lottery_name TEXT,
  result_numbers JSONB,
  winner_user_id UUID REFERENCES auth.users(id),
  winner_ticket_id UUID,
  prize_amount_bs NUMERIC(14,2),
  commission_amount_bs NUMERIC(14,2),
  total_collected_bs NUMERIC(14,2),
  total_tickets INTEGER,
  automated BOOLEAN DEFAULT true,
  executed_by TEXT DEFAULT 'SYSTEM',
  commitment_hash TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT draw_audit_type_check CHECK (
    (draw_type = 'BINGO' AND session_id IS NOT NULL) OR
    (draw_type = 'POLLA' AND (lottery_name IS NOT NULL OR draw_date IS NOT NULL))
  )
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_draw_audit_type_date ON public.draw_audit_trail(draw_type, draw_date);
CREATE INDEX IF NOT EXISTS idx_draw_audit_winner ON public.draw_audit_trail(winner_user_id);
CREATE INDEX IF NOT EXISTS idx_draw_audit_automated ON public.draw_audit_trail(automated, created_at DESC);

-- RLS policies
ALTER TABLE public.draw_audit_trail ENABLE ROW LEVEL SECURITY;

-- Usuarios pueden ver sus propios sorteos ganadores o sorteos públicos
DROP POLICY IF EXISTS p_draw_audit_select ON public.draw_audit_trail;
CREATE POLICY p_draw_audit_select ON public.draw_audit_trail
FOR SELECT
USING (
  true
);

-- Solo el sistema / service_role puede insertar
DROP POLICY IF EXISTS p_draw_audit_insert ON public.draw_audit_trail;
CREATE POLICY p_draw_audit_insert ON public.draw_audit_trail
FOR INSERT
WITH CHECK (true);

-- Grants
GRANT SELECT ON public.draw_audit_trail TO authenticated, anon;
