-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 036: SISTEMA DE TURNOS Y VALIDACIÓN HUMANA DE POLLA
-- ==============================================================================
-- 1. Campos de numeración, código de verificación y estados de validación de premios.
-- 2. Horarios automáticos de venta por turno (Caracas VET).
-- 3. Detección de posibles ganadores con estado PENDIENTE_VALIDACION (sin pago automático).
-- 4. RPCs administrativas de revisión humana (VALIDAR / RECHAZAR) y Acreditación Segura con Ledger.
-- 5. Control estricto de prevención de doble pago (PREMIO_YA_ACREDITADO).
-- ==============================================================================

-- 1. SECUENCIA Y COLUMNAS EN POLLA_TICKETS
CREATE SEQUENCE IF NOT EXISTS public.polla_ticket_number_seq START WITH 10001;

ALTER TABLE public.polla_tickets 
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS verification_code TEXT,
  ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS ledger_entry_id UUID REFERENCES public.ledger_entries(id);

-- Índices de búsqueda para acelerar auditoría y filtros
CREATE INDEX IF NOT EXISTS idx_polla_tickets_validation ON public.polla_tickets(validation_status);
CREATE INDEX IF NOT EXISTS idx_polla_tickets_number ON public.polla_tickets(ticket_number);

-- 2. RPC DE COMPRA ATÓMICA CON HORARIOS AUTOMÁTICOS DE TURNO
CREATE OR REPLACE FUNCTION public.buy_polla_ticket_secure(
  p_block TEXT,
  p_draw_date DATE,
  p_animalitos TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
  v_seq_val BIGINT;
  v_ticket_num TEXT;
  v_verif_code TEXT;
  i INT;
  j INT;
BEGIN
  -- 1. Validar usuario autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  -- 2. Validar bloque
  IF p_block NOT IN ('MAÑANA', 'TARDE') THEN
    RETURN jsonb_build_object('success', false, 'error', 'BLOQUE_INVALIDO');
  END IF;

  -- 3. Validar exactamente 6 animalitos
  IF p_animalitos IS NULL OR cardinality(p_animalitos) <> 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'DEBE_SELECCIONAR_EXACTAMENTE_6_ANIMALITOS');
  END IF;

  -- 4. Validar códigos válidos '00' a '76' sin duplicados
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

  -- 5. Calcular fecha/hora oficial en zona horaria de Venezuela (UTC-4)
  v_vet_now := NOW() AT TIME ZONE 'America/Caracas';
  v_vet_time := v_vet_now::TIME;
  v_vet_date := v_vet_now::DATE;

  -- 6. REGULACIÓN AUTOMÁTICA DE HORARIOS Y TURNOS
  -- TURNO TARDE DEL MISMO DÍA: Venta abre 08:05 AM y cierra 01:55 PM (13:55:00)
  IF p_block = 'TARDE' THEN
    IF p_draw_date = v_vet_date THEN
      IF v_vet_time < '08:05:00'::TIME THEN
        RETURN jsonb_build_object('success', false, 'error', 'VENTAS_NO_INICIADAS_TURNO_TARDE');
      ELSIF v_vet_time > '13:55:00'::TIME THEN
        RETURN jsonb_build_object('success', false, 'error', 'VENTAS_CERRADAS_TURNO_TARDE');
      END IF;
    ELSIF p_draw_date < v_vet_date THEN
      RETURN jsonb_build_object('success', false, 'error', 'SORTEO_PASADO');
    END IF;

  -- TURNO MAÑANA DEL DÍA SIGUIENTE / HOY: 
  -- Hoy temprano: Venta cierra 07:55 AM
  -- Hoy tarde/noche: Desde las 02:00 PM (14:00:00) se activa Turno Mañana del día siguiente
  ELSIF p_block = 'MAÑANA' THEN
    IF p_draw_date = v_vet_date THEN
      IF v_vet_time > '07:55:00'::TIME THEN
        RETURN jsonb_build_object('success', false, 'error', 'VENTAS_CERRADAS_TURNO_MANANA');
      END IF;
    ELSIF p_draw_date = (v_vet_date + INTERVAL '1 day')::DATE THEN
      IF v_vet_time < '14:00:00'::TIME THEN
        RETURN jsonb_build_object('success', false, 'error', 'VENTAS_NO_INICIADAS_MANANA_SIGUIENTE');
      END IF;
    ELSIF p_draw_date < v_vet_date THEN
      RETURN jsonb_build_object('success', false, 'error', 'SORTEO_PASADO');
    END IF;
  END IF;

  -- 7. INTERVALO DE CIERRE RESTRINGIDO (13:55:01 a 13:59:59 y 07:55:01 a 08:04:59)
  IF p_draw_date = v_vet_date THEN
    IF (v_vet_time > '13:55:00'::TIME AND v_vet_time < '14:00:00'::TIME) OR
       (v_vet_time > '07:55:00'::TIME AND v_vet_time < '08:05:00'::TIME) THEN
      RETURN jsonb_build_object('success', false, 'error', 'VENTAS_CERRADAS_EN_PERIODO_DE_CAMBIO_DE_TURNO');
    END IF;
  END IF;

  -- 8. BLOQUEO ADVISORY PARA MÁXIMO DE POLLAS POR JUGADOR + FECHA + TURNO
  PERFORM pg_advisory_xact_lock(hashtext('polla_buy_' || v_user_id::text || '_' || p_draw_date::text || '_' || p_block));

  SELECT COUNT(*) INTO v_ticket_count
  FROM public.polla_tickets
  WHERE user_id = v_user_id
    AND draw_date = p_draw_date
    AND block = p_block;

  IF v_ticket_count >= 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'LIMITE_ALCANZADO_ESTE_TURNO');
  END IF;

  -- 9. VALIDAR Y BLOQUEAR BILLETERA
  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL OR v_wallet_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALDO_INSUFICIENTE_REQUIERE_250_BS');
  END IF;

  -- 10. GENERAR NUMERACIÓN ÚNICA Y CÓDIGO DE VERIFICACIÓN
  v_seq_val := NEXTVAL('public.polla_ticket_number_seq');
  v_ticket_num := 'POLLA #' || LPAD(v_seq_val::text, 8, '0');
  v_verif_code := 'PL-' || TO_CHAR(p_draw_date, 'YYYYMMDD') || '-' || SUBSTRING(p_block, 1, 1) || '-' || UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 6));

  -- 11. DESCONTAR 250 BS Y REGISTRAR LEDGER
  UPDATE public.wallets
  SET balance = balance - v_price,
      updated_at = NOW()
  WHERE user_id = v_user_id;

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
    'Compra ' || v_ticket_num || ' - Turno ' || p_block || ' (' || p_draw_date || ')',
    v_wallet_balance - v_price
  );

  -- 12. REGISTRAR TICKET EN POLLA_TICKETS
  INSERT INTO public.polla_tickets (
    user_id,
    block,
    draw_date,
    animalitos,
    cost_bs,
    status,
    ticket_number,
    verification_code,
    validation_status
  ) VALUES (
    v_user_id,
    p_block,
    p_draw_date,
    p_animalitos,
    v_price,
    'PENDING',
    v_ticket_num,
    v_verif_code,
    'PENDING'
  ) RETURNING id INTO v_ticket_id;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'ticket_number', v_ticket_num,
    'verification_code', v_verif_code,
    'balance_after', v_wallet_balance - v_price,
    'message', 'COMPRA EXITOSA DE ' || v_ticket_num || '. SE DESCONTARON 250 Bs DE TU SALDO.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_polla_ticket_secure(TEXT, DATE, TEXT[]) TO authenticated, service_role;

-- 3. RPC DE DETECCIÓN AUTOMÁTICA DE POSIBLES GANADORES (SIN ACREDITACIÓN DE DINERO)
CREATE OR REPLACE FUNCTION public.detect_polla_potential_winners(
  p_draw_date DATE,
  p_block TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id UUID;
  v_ticket RECORD;
  v_drawn_numbers TEXT[] := ARRAY[]::TEXT[];
  v_draw_rec RECORD;
  v_lottery JSONB;
  v_num TEXT;
  v_hits INT;
  v_detected_count INT := 0;
BEGIN
  v_admin_id := auth.uid();
  IF NOT public.is_admin(v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUIERE_ACCESO_ADMINISTRATIVO');
  END IF;

  -- Recopilar todos los números sorteados para esa fecha y bloque
  FOR v_draw_rec IN 
    SELECT lotteries FROM public.polla_draw_results 
    WHERE draw_date = p_draw_date AND block = p_block 
  LOOP
    FOR v_lottery IN SELECT * FROM jsonb_array_elements(v_draw_rec.lotteries) LOOP
      IF v_lottery->'numbers' IS NOT NULL THEN
        FOR v_num IN SELECT jsonb_array_elements_text(v_lottery->'numbers') LOOP
          v_drawn_numbers := array_append(v_drawn_numbers, v_num);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  IF cardinality(v_drawn_numbers) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_HAY_RESULTADOS_REGISTRADOS_PARA_ESTE_TURNO');
  END IF;

  -- Inspeccionar los tickets comprados para este turno
  FOR v_ticket IN 
    SELECT id, animalitos, hits, status, validation_status 
    FROM public.polla_tickets
    WHERE draw_date = p_draw_date AND block = p_block
  LOOP
    v_hits := 0;
    -- Contar coincidencias
    FOR i IN 1..cardinality(v_ticket.animalitos) LOOP
      IF v_ticket.animalitos[i] = ANY(v_drawn_numbers) THEN
        v_hits := v_hits + 1;
      END IF;
    END LOOP;

    -- Actualizar hits acumulados
    UPDATE public.polla_tickets
    SET hits = v_hits
    WHERE id = v_ticket.id;

    -- Marcar como POSIBLE GANADORES (PENDIENTE_VALIDACION) si tiene >= 5 aciertos
    IF v_hits >= 5 AND v_ticket.validation_status IN ('PENDING', 'DETECTED') THEN
      UPDATE public.polla_tickets
      SET validation_status = 'PENDING_VALIDATION',
          status = 'PENDING'
      WHERE id = v_ticket.id;
      v_detected_count := v_detected_count + 1;
    ELSIF v_hits < 5 AND v_ticket.validation_status = 'PENDING' THEN
      UPDATE public.polla_tickets
      SET status = 'NOT_WINNER'
      WHERE id = v_ticket.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'detected_count', v_detected_count,
    'message', 'DETECCIÓN COMPLETADA. ' || v_detected_count || ' POSIBLES GANADORES PENDIENTES DE VALIDACIÓN HUMANA.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_polla_potential_winners(DATE, TEXT) TO authenticated, service_role;

-- 4. RPC DE REVISIÓN Y VALIDACIÓN HUMANA (ADMINISTRADOR/OPERADOR)
CREATE OR REPLACE FUNCTION public.validate_polla_winner_secure(
  p_ticket_id UUID,
  p_action TEXT, -- 'VALIDATE' | 'REJECT'
  p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id UUID;
  v_ticket RECORD;
BEGIN
  v_admin_id := auth.uid();
  IF NOT public.is_admin(v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUIERE_ACCESO_ADMINISTRATIVO');
  END IF;

  SELECT * INTO v_ticket 
  FROM public.polla_tickets 
  WHERE id = p_ticket_id 
  FOR UPDATE;

  IF v_ticket.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TICKET_NO_ENCONTRADO');
  END IF;

  IF v_ticket.validation_status = 'CREDITED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PREMIO_YA_ACREDITADO');
  END IF;

  IF p_action = 'VALIDATE' THEN
    UPDATE public.polla_tickets
    SET validation_status = 'VALIDATED',
        status = 'WINNER',
        validated_by = v_admin_id,
        validated_at = NOW()
    WHERE id = p_ticket_id;

    RETURN jsonb_build_object(
      'success', true,
      'ticket_id', p_ticket_id,
      'status', 'VALIDATED',
      'message', 'POLLA VALIDADA CORRECTAMENTE POR EL ADMINISTRADOR.'
    );
  ELSIF p_action = 'REJECT' THEN
    UPDATE public.polla_tickets
    SET validation_status = 'REJECTED',
        status = 'CANCELLED',
        validated_by = v_admin_id,
        validated_at = NOW(),
        rejection_reason = p_reason
    WHERE id = p_ticket_id;

    RETURN jsonb_build_object(
      'success', true,
      'ticket_id', p_ticket_id,
      'status', 'REJECTED',
      'message', 'POLLA RECHAZADA. MOTIVO REGISTRADO.'
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'ACCION_INVALIDA');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_polla_winner_secure(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 5. RPC DE ACREDITACIÓN SEGURA DEL PREMIO EN WALLET/LEDGER (PREVENCIÓN DE DOBLE PAGO)
CREATE OR REPLACE FUNCTION public.credit_polla_prize_secure(
  p_ticket_id UUID,
  p_prize_bs NUMERIC(15,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id UUID;
  v_ticket RECORD;
  v_user_wallet_balance NUMERIC(15,2);
  v_ledger_id UUID;
BEGIN
  v_admin_id := auth.uid();
  IF NOT public.is_admin(v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'REQUIERE_ACCESO_ADMINISTRATIVO');
  END IF;

  IF p_prize_bs <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'MONTO_DE_PREMIO_INVALIDO');
  END IF;

  SELECT * INTO v_ticket 
  FROM public.polla_tickets 
  WHERE id = p_ticket_id 
  FOR UPDATE;

  IF v_ticket.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TICKET_NO_ENCONTRADO');
  END IF;

  -- CONTROL ESTRICTO CONTRA DOBLE PAGO
  IF v_ticket.validation_status = 'CREDITED' OR v_ticket.credited_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PREMIO_YA_ACREDITADO');
  END IF;

  IF v_ticket.validation_status <> 'VALIDATED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'LA_POLLA_DEBE_SER_VALIDADA_PRIMERO');
  END IF;

  -- Bloquear billetera del jugador ganador
  SELECT balance INTO v_user_wallet_balance
  FROM public.wallets
  WHERE user_id = v_ticket.user_id
  FOR UPDATE;

  IF v_user_wallet_balance IS NULL THEN
    -- Si no existe billetera la crea
    INSERT INTO public.wallets (user_id, balance) 
    VALUES (v_ticket.user_id, 0.00) 
    RETURNING balance INTO v_user_wallet_balance;
  END IF;

  -- Acreditar monto en la billetera
  UPDATE public.wallets
  SET balance = balance + p_prize_bs,
      updated_at = NOW()
  WHERE user_id = v_ticket.user_id;

  -- Registrar entrada en Ledger auditor con referencia explícita
  INSERT INTO public.ledger_entries (
    user_id,
    amount,
    entry_type,
    reference_type,
    notes,
    balance_after
  ) VALUES (
    v_ticket.user_id,
    p_prize_bs,
    'CREDIT',
    'POLLA_PRIZE',
    'Premio Polla Venezolana - ' || COALESCE(v_ticket.ticket_number, v_ticket.id::text) || ' (Aprobado por Admin)',
    v_user_wallet_balance + p_prize_bs
  ) RETURNING id INTO v_ledger_id;

  -- Actualizar estado final del ticket
  UPDATE public.polla_tickets
  SET validation_status = 'CREDITED',
      status = 'WINNER',
      prize_bs = p_prize_bs,
      credited_at = NOW(),
      ledger_entry_id = v_ledger_id
  WHERE id = p_ticket_id;

  -- Registrar cierre de bloque si no existe
  INSERT INTO public.polla_block_closures (
    draw_date,
    block,
    winner_user_id,
    winner_ticket_id,
    hits,
    closure_reason,
    closure_event_data
  ) VALUES (
    v_ticket.draw_date,
    v_ticket.block,
    v_ticket.user_id,
    v_ticket.id,
    v_ticket.hits,
    'HUMAN_VALIDATED_PRIZE_CREDIT',
    jsonb_build_object('prize_bs', p_prize_bs, 'admin_id', v_admin_id)
  ) ON CONFLICT (draw_date, block) DO UPDATE
    SET winner_user_id = EXCLUDED.winner_user_id,
        winner_ticket_id = EXCLUDED.winner_ticket_id,
        closure_event_data = EXCLUDED.closure_event_data;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', p_ticket_id,
    'user_id', v_ticket.user_id,
    'prize_bs', p_prize_bs,
    'balance_after', v_user_wallet_balance + p_prize_bs,
    'message', 'PREMIO DE ' || p_prize_bs || ' Bs ACREDITADO CON ÉXITO EN LA BILLETERA DEL JUGADOR.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_polla_prize_secure(UUID, NUMERIC) TO authenticated, service_role;
