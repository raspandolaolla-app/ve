-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 033: SISTEMA OFICIAL DE POLLA VENEZOLANA
-- ==============================================================================
-- Quiniela de Animalitos (00-76), Bloques Mañana/Tarde, Ventanas de Venta,
-- Compras Atómicas de 250 Bs con Ledger, Cierres Auditables y RLS.
-- ==============================================================================

-- 1. TABLA DE TICKETS/POLLAS COMPRADAS
CREATE TABLE IF NOT EXISTS public.polla_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block TEXT NOT NULL CHECK (block IN ('MAÑANA', 'TARDE')),
  draw_date DATE NOT NULL,
  animalitos TEXT[] NOT NULL CHECK (cardinality(animalitos) = 6),
  cost_bs NUMERIC(15,2) NOT NULL DEFAULT 250.00,
  hits INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'WINNER', 'NOT_WINNER', 'CANCELLED')),
  prize_bs NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexación rápida para consultas por usuario y por bloque
CREATE INDEX IF NOT EXISTS idx_polla_tickets_user ON public.polla_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_polla_tickets_date_block ON public.polla_tickets(draw_date, block);

-- 2. TABLA DE RESULTADOS DE SORTEOS
CREATE TABLE IF NOT EXISTS public.polla_draw_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_date DATE NOT NULL,
  block TEXT NOT NULL CHECK (block IN ('MAÑANA', 'TARDE')),
  draw_time TIME NOT NULL,
  lotteries JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draw_date, block, draw_time)
);

-- 3. TABLA DE CIERRES AUDITABLES Y GANADORES
CREATE TABLE IF NOT EXISTS public.polla_block_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_date DATE NOT NULL,
  block TEXT NOT NULL CHECK (block IN ('MAÑANA', 'TARDE')),
  winner_user_id UUID REFERENCES public.profiles(id),
  winner_ticket_id UUID REFERENCES public.polla_tickets(id),
  hits INT NOT NULL DEFAULT 6,
  closure_reason TEXT NOT NULL DEFAULT 'REGULAR_6_HITS',
  closure_event_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(draw_date, block)
);

-- 4. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.polla_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polla_draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polla_block_closures ENABLE ROW LEVEL SECURITY;

-- Políticas para polla_tickets
DROP POLICY IF EXISTS "Usuarios ven sus propias pollas" ON public.polla_tickets;
CREATE POLICY "Usuarios ven sus propias pollas"
  ON public.polla_tickets FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Inserción vía RPC buy_polla_ticket_secure" ON public.polla_tickets;
DROP POLICY IF EXISTS "Sin inserción directa de usuarios" ON public.polla_tickets;
-- No INSERT policy for polla_tickets: Inserts are strictly reserved for SECURITY DEFINER RPC buy_polla_ticket_secure

-- Políticas para polla_draw_results (Lectura pública a usuarios autenticados)
DROP POLICY IF EXISTS "Lectura pública de resultados" ON public.polla_draw_results;
CREATE POLICY "Lectura pública de resultados"
  ON public.polla_draw_results FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Solo administradores crean resultados" ON public.polla_draw_results;
CREATE POLICY "Solo administradores crean resultados"
  ON public.polla_draw_results FOR ALL
  USING (public.is_admin(auth.uid()));

-- Políticas para polla_block_closures
DROP POLICY IF EXISTS "Lectura pública de ganadores y cierres" ON public.polla_block_closures;
CREATE POLICY "Lectura pública de ganadores y cierres"
  ON public.polla_block_closures FOR SELECT
  USING (auth.role() = 'authenticated');

-- 5. RPC SERVER-AUTHORITATIVE PARA COMPRA ATÓMICA DE POLLA (250 Bs)
CREATE OR REPLACE FUNCTION public.buy_polla_ticket_secure(
  p_block TEXT,
  p_draw_date DATE,
  p_animalitos TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_wallet_balance NUMERIC(15,2);
  v_ticket_count INT;
  v_ticket_id UUID;
  v_vet_now TIMESTAMPTZ;
  v_vet_time TIME;
  v_vet_date DATE;
  v_price NUMERIC(15,2) := 250.00;
  i INT;
  j INT;
BEGIN
  -- 1. Validar usuario autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  -- 2. Validar parámetro de bloque
  IF p_block NOT IN ('MAÑANA', 'TARDE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'BLOQUE_INVALIDO');
  END IF;

  -- 3. Validar exactamente 6 animalitos
  IF p_animalitos IS NULL OR cardinality(p_animalitos) <> 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'DEBE_SELECCIONAR_EXACTAMENTE_6_ANIMALITOS');
  END IF;

  -- 4. Validar que no haya códigos duplicados ni fuera de rango ('00' a '76')
  FOR i IN 1..6 LOOP
    IF p_animalitos[i] !~ '^(0[0-9]|[1-6][0-9]|7[0-6])$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'CODIGO_ANIMALITO_INVALIDO: ' || p_animalitos[i]);
    END IF;
    FOR j IN (i + 1)..6 LOOP
      IF p_animalitos[i] = p_animalitos[j] THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_SE_PERMITEN_ANIMALITOS_REPETIDOS');
      END IF;
    END LOOP;
  END LOOP;

  -- 5. Calcular fecha/hora en zona de Venezuela (UTC-4)
  v_vet_now := NOW() AT TIME ZONE 'America/Caracas';
  v_vet_time := v_vet_now::TIME;
  v_vet_date := v_vet_now::DATE;

  -- 6. Validar ventana de venta server-side
  -- BLOQUE MAÑANA: Cierre 07:55 AM del día del sorteo
  IF p_block = 'MAÑANA' THEN
    IF p_draw_date = v_vet_date AND v_vet_time > '07:55:00'::TIME THEN
      RETURN jsonb_build_object('success', false, 'error', 'VENTA_CERRADA_BLOQUE_MAÑANA');
    ELSIF p_draw_date < v_vet_date THEN
      RETURN jsonb_build_object('success', false, 'error', 'BLOQUE_PASADO');
    END IF;
  -- BLOQUE TARDE: Cierre 13:55 (01:55 PM) del día del sorteo
  ELSIF p_block = 'TARDE' THEN
    IF p_draw_date = v_vet_date AND v_vet_time > '13:55:00'::TIME THEN
      RETURN jsonb_build_object('success', false, 'error', 'VENTA_CERRADA_BLOQUE_TARDE');
    ELSIF p_draw_date < v_vet_date THEN
      RETURN jsonb_build_object('success', false, 'error', 'BLOQUE_PASADO');
    END IF;
  END IF;

  -- 7. Validar límite de 10 pollas por usuario por bloque
  SELECT COUNT(*) INTO v_ticket_count
  FROM public.polla_tickets
  WHERE user_id = v_user_id
    AND draw_date = p_draw_date
    AND block = p_block;

  IF v_ticket_count >= 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'LIMITE_ALCANZADO_MAX_10_POLLAS_POR_BLOQUE');
  END IF;

  -- 8. Validar y bloquear billetera del usuario
  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL OR v_wallet_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALDO_INSUFICIENTE_REQUIERE_250_BS');
  END IF;

  -- 9. Descontar 250 Bs de la billetera
  UPDATE public.wallets
  SET balance = balance - v_price,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 10. Registrar movimiento en ledger
  INSERT INTO public.ledger_entries (
    user_id,
    amount,
    entry_type,
    reference_type,
    notes,
    balance_after
  ) VALUES (
    v_user_id,
    -v_price,
    'DEBIT',
    'POLLA_PURCHASE',
    'Compra de Polla Venezolana - Bloque ' || p_block || ' (' || p_draw_date || ')',
    v_wallet_balance - v_price
  );

  -- 11. Crear ticket de Polla
  INSERT INTO public.polla_tickets (
    user_id,
    block,
    draw_date,
    animalitos,
    cost_bs,
    status
  ) VALUES (
    v_user_id,
    p_block,
    p_draw_date,
    p_animalitos,
    v_price,
    'PENDING'
  ) RETURNING id INTO v_ticket_id;

  -- 12. Retornar respuesta exitosa con confirmación explicita
  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'balance_after', v_wallet_balance - v_price,
    'message', 'SE DESCONTARON 250 Bs DE TU SALDO.'
  );
END;
$$;
