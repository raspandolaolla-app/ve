-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 055: POZO ÚNICO POR DÍA Y TURNO EN POLLA VENEZOLANA
-- ==============================================================================
-- Consolidación estricta de compras por (draw_date + block) en UN SOLO POZO.
-- Distribución 90% Ganador / 10% Plataforma calculada obligatoriamente en servidor.
-- Operación transaccional con bloqueos pesimistas e idempotencia garantizada.
-- ==============================================================================

-- 1. ESTRUCTURA Y COLUMNAS EN POLLA_BLOCK_CLOSURES
ALTER TABLE public.polla_block_closures
  ADD COLUMN IF NOT EXISTS total_collected_bs NUMERIC(15,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS prize_bs NUMERIC(15,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS commission_bs NUMERIC(15,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_tickets INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_settled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_by UUID REFERENCES auth.users(id);

-- 2. RPC PARA CONSULTAR EL POZO ÚNICO Y ACUMULADO DEL TURNO (FECHA + BLOQUE)
CREATE OR REPLACE FUNCTION public.get_polla_shift_pool_summary(
  p_draw_date DATE,
  p_block TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_total_tickets INT := 0;
  v_total_collected NUMERIC(15,2) := 0.00;
  v_prize_90 NUMERIC(15,2) := 0.00;
  v_commission_10 NUMERIC(15,2) := 0.00;
  v_closure RECORD;
  v_winner_name TEXT := NULL;
BEGIN
  -- 1. Sumar todas las compras válidas y confirmadas del turno
  SELECT 
    COUNT(*),
    COALESCE(SUM(cost_bs), 0.00)
  INTO 
    v_total_tickets,
    v_total_collected
  FROM public.polla_tickets
  WHERE draw_date = p_draw_date 
    AND block = p_block
    AND status != 'CANCELLED'
    AND (validation_status IS NULL OR validation_status != 'REJECTED');

  -- 2. Calcular pozo 90% para el ganador y 10% para la plataforma
  v_prize_90 := ROUND(v_total_collected * 0.90, 2);
  v_commission_10 := v_total_collected - v_prize_90;

  -- 3. Obtener registro de cierre si el turno ya fue liquidado
  SELECT * INTO v_closure
  FROM public.polla_block_closures
  WHERE draw_date = p_draw_date AND block = p_block;

  IF v_closure.winner_user_id IS NOT NULL THEN
    SELECT COALESCE(TRIM(p.first_name || ' ' || p.last_name), p.display_name, 'JUGADOR SIN NOMBRE')
    INTO v_winner_name
    FROM public.profiles p
    WHERE p.id = v_closure.winner_user_id;
  END IF;

  RETURN jsonb_build_object(
    'draw_date', p_draw_date,
    'block', p_block,
    'total_tickets', v_total_tickets,
    'total_collected_bs', v_total_collected,
    'prize_90_bs', v_prize_90,
    'commission_10_bs', v_commission_10,
    'is_settled', COALESCE(v_closure.is_settled, false),
    'winner_user_id', v_closure.winner_user_id,
    'winner_name', UPPER(COALESCE(v_winner_name, '')),
    'winner_ticket_id', v_closure.winner_ticket_id,
    'settled_at', v_closure.settled_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_polla_shift_pool_summary(DATE, TEXT) TO authenticated, service_role;

-- 3. RPC ACREDITACIÓN DE PREMIO SERVER-AUTHORITATIVE Y CONSOLIDACIÓN DE POZO
CREATE OR REPLACE FUNCTION public.credit_polla_prize_secure(
  p_ticket_id UUID,
  p_prize_bs NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id UUID;
  v_ticket RECORD;
  v_draw_date DATE;
  v_block TEXT;
  v_winner_user_id UUID;
  v_wallet_id UUID;
  v_wallet_available NUMERIC(14,2);
  v_wallet_held NUMERIC(14,2);
  v_winner_ledger_id UUID;
  v_total_tickets INT := 0;
  v_total_collected_bs NUMERIC(15,2) := 0.00;
  v_prize_90 NUMERIC(15,2) := 0.00;
  v_commission_10 NUMERIC(15,2) := 0.00;
  v_existing_closure RECORD;
BEGIN
  -- 1. Validar permisos de administrador
  v_admin_id := auth.uid();
  IF NOT public.is_admin(v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUIERE_ACCESO_ADMINISTRATIVO');
  END IF;

  -- 2. Obtener ticket con bloqueo pesimista
  SELECT * INTO v_ticket 
  FROM public.polla_tickets 
  WHERE id = p_ticket_id 
  FOR UPDATE;

  IF v_ticket.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TICKET_NO_ENCONTRADO');
  END IF;

  v_draw_date := v_ticket.draw_date;
  v_block := v_ticket.block;
  v_winner_user_id := v_ticket.user_id;

  -- 3. BLOQUEO TRANSACCIONAL POR TURNO (PREVENIR CONDICIONES DE CARRERA)
  PERFORM pg_advisory_xact_lock(hashtext('polla_closure_' || v_draw_date::text || '_' || v_block));

  -- 4. VERIFICAR IDEMPOTENCIA Y PREVENIR DOBLE LIQUIDACIÓN
  SELECT * INTO v_existing_closure
  FROM public.polla_block_closures
  WHERE draw_date = v_draw_date AND block = v_block AND is_settled = TRUE
  FOR UPDATE;

  IF v_existing_closure.id IS NOT NULL OR v_ticket.validation_status = 'CREDITED' OR v_ticket.credited_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'TURNO_YA_LIQUIDADO',
      'message', 'El turno (' || v_draw_date::text || ' ' || v_block || ') ya fue liquidado previamente. Se evitó un pago o comisión duplicados.'
    );
  END IF;

  -- 5. CÁLCULO DEL POZO ÚNICO EN EL SERVIDOR (90% GANADOR / 10% PLATAFORMA)
  SELECT 
    COUNT(*),
    COALESCE(SUM(cost_bs), 0.00)
  INTO 
    v_total_tickets,
    v_total_collected_bs
  FROM public.polla_tickets
  WHERE draw_date = v_draw_date 
    AND block = v_block
    AND status != 'CANCELLED'
    AND (validation_status IS NULL OR validation_status != 'REJECTED');

  IF v_total_collected_bs <= 0 THEN
    v_total_collected_bs := COALESCE(v_ticket.cost_bs, 250.00);
    v_total_tickets := 1;
  END IF;

  v_prize_90 := ROUND(v_total_collected_bs * 0.90, 2);
  v_commission_10 := v_total_collected_bs - v_prize_90;

  -- 6. BLOQUEAR BILLETERA DEL JUGADOR GANADOR
  SELECT id, available_balance, held_balance 
  INTO v_wallet_id, v_wallet_available, v_wallet_held
  FROM public.wallets
  WHERE user_id = v_winner_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, available_balance, held_balance) 
    VALUES (v_winner_user_id, 0.00, 0.00) 
    RETURNING id, available_balance, held_balance 
    INTO v_wallet_id, v_wallet_available, v_wallet_held;
  END IF;

  -- 7. ACREDITAR ÚNICO PREMIO DEL TURNO EN LA BILLETERA DEL GANADOR
  UPDATE public.wallets
  SET available_balance = available_balance + v_prize_90,
      updated_at = NOW()
  WHERE id = v_wallet_id;

  -- 8. REGISTRAR ENTRADA EN LEDGER PARA EL GANADOR (90%)
  INSERT INTO public.ledger_entries (
    wallet_id,
    user_id,
    entry_type,
    direction,
    amount,
    balance_after_available,
    balance_after_held,
    reference_table,
    reference_id,
    idempotency_key,
    description
  ) VALUES (
    v_wallet_id,
    v_winner_user_id,
    'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
    'CREDIT'::ledger_direction_enum,
    v_prize_90,
    v_wallet_available + v_prize_90,
    v_wallet_held,
    'polla_tickets',
    v_ticket.id,
    'polla_prize_' || v_draw_date::text || '_' || v_block,
    'Premio Polla Venezolana (90% Pozo Turno ' || v_block || ' ' || v_draw_date::text || ')'
  ) RETURNING id INTO v_winner_ledger_id;

  -- 9. REGISTRAR ENTRADA EN LEDGER PARA LA COMISIÓN DE PLATAFORMA (10%)
  IF v_commission_10 > 0 THEN
    INSERT INTO public.ledger_entries (
      wallet_id,
      user_id,
      entry_type,
      direction,
      amount,
      balance_after_available,
      balance_after_held,
      reference_table,
      reference_id,
      idempotency_key,
      description
    ) VALUES (
      v_wallet_id,
      v_winner_user_id,
      'PLATFORM_FEE_CREDIT'::ledger_entry_type_enum,
      'CREDIT'::ledger_direction_enum,
      v_commission_10,
      v_wallet_available + v_prize_90,
      v_wallet_held,
      'polla_block_closures',
      v_ticket.id,
      'polla_commission_' || v_draw_date::text || '_' || v_block,
      'Comisión Plataforma Polla (10% Pozo Turno ' || v_block || ' ' || v_draw_date::text || ')'
    );
  END IF;

  -- 10. MARCAR TICKETS DEL TURNO Y DEL USUARIO COMO PAGADOS
  UPDATE public.polla_tickets
  SET validation_status = 'CREDITED',
      status = 'WINNER',
      prize_bs = CASE WHEN id = v_ticket.id THEN v_prize_90 ELSE 0.00 END,
      credited_at = NOW(),
      ledger_entry_id = v_winner_ledger_id
  WHERE draw_date = v_draw_date 
    AND block = v_block 
    AND user_id = v_winner_user_id
    AND status IN ('PENDING', 'WINNER');

  -- Marcar tickets restantes de otros usuarios en el turno como NO_GANADORES
  UPDATE public.polla_tickets
  SET status = 'NOT_WINNER'
  WHERE draw_date = v_draw_date 
    AND block = v_block 
    AND user_id != v_winner_user_id
    AND status = 'PENDING';

  -- 11. REGISTRAR EL CIERRE DEFINITIVO DEL TURNO EN POLLA_BLOCK_CLOSURES
  INSERT INTO public.polla_block_closures (
    draw_date,
    block,
    winner_user_id,
    winner_ticket_id,
    hits,
    closure_reason,
    total_collected_bs,
    prize_bs,
    commission_bs,
    total_tickets,
    is_settled,
    settled_at,
    settled_by,
    closure_event_data
  ) VALUES (
    v_draw_date,
    v_block,
    v_winner_user_id,
    v_ticket.id,
    COALESCE(v_ticket.hits, 6),
    'SINGLE_POOL_SHIFT_SETTLEMENT',
    v_total_collected_bs,
    v_prize_90,
    v_commission_10,
    v_total_tickets,
    TRUE,
    NOW(),
    v_admin_id,
    jsonb_build_object(
      'total_collected_bs', v_total_collected_bs,
      'prize_bs', v_prize_90,
      'commission_bs', v_commission_10,
      'total_tickets', v_total_tickets,
      'settled_by', v_admin_id,
      'settled_at', NOW()
    )
  ) ON CONFLICT (draw_date, block) DO UPDATE
    SET winner_user_id = EXCLUDED.winner_user_id,
        winner_ticket_id = EXCLUDED.winner_ticket_id,
        closure_reason = EXCLUDED.closure_reason,
        total_collected_bs = EXCLUDED.total_collected_bs,
        prize_bs = EXCLUDED.prize_bs,
        commission_bs = EXCLUDED.commission_bs,
        total_tickets = EXCLUDED.total_tickets,
        is_settled = TRUE,
        settled_at = NOW(),
        settled_by = EXCLUDED.settled_by,
        closure_event_data = EXCLUDED.closure_event_data;

  RETURN jsonb_build_object(
    'success', true,
    'draw_date', v_draw_date,
    'block', v_block,
    'winner_user_id', v_winner_user_id,
    'total_collected_bs', v_total_collected_bs,
    'prize_bs', v_prize_90,
    'commission_bs', v_commission_10,
    'total_tickets', v_total_tickets,
    'balance_after', v_wallet_available + v_prize_90,
    'message', 'LIQUIDACIÓN EXITOSA: Pozo Total de ' || v_total_collected_bs || ' Bs consolidado. Premio 90%: ' || v_prize_90 || ' Bs. Comisión 10%: ' || v_commission_10 || ' Bs.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_polla_prize_secure(UUID, NUMERIC) TO authenticated, service_role;

-- 4. RPC DE AUDITORÍA DE CONSISTENCIA DE POZOS HISTÓRICOS DE POLLA
CREATE OR REPLACE FUNCTION public.audit_polla_shift_pools()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_record RECORD;
  v_inconsistencies INT := 0;
  v_details JSONB := '[]'::jsonb;
BEGIN
  FOR v_record IN 
    SELECT 
      c.draw_date,
      c.block,
      c.total_collected_bs,
      c.prize_bs,
      c.commission_bs,
      c.total_tickets,
      c.is_settled,
      (c.prize_bs + c.commission_bs) AS sum_check
    FROM public.polla_block_closures c
    WHERE c.is_settled = TRUE
  LOOP
    IF v_record.sum_check <> v_record.total_collected_bs THEN
      v_inconsistencies := v_inconsistencies + 1;
      v_details := v_details || jsonb_build_object(
        'draw_date', v_record.draw_date,
        'block', v_record.block,
        'total_collected_bs', v_record.total_collected_bs,
        'prize_bs', v_record.prize_bs,
        'commission_bs', v_record.commission_bs,
        'sum_check', v_record.sum_check
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'audit_status', CASE WHEN v_inconsistencies = 0 THEN 'PASS' ELSE 'WARNING' END,
    'inconsistencies_count', v_inconsistencies,
    'details', v_details
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_polla_shift_pools() TO authenticated, service_role;
