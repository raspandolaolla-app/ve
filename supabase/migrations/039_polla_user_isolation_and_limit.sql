-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 039: LÍMITE DE 20 POLLAS POR JUGADOR/TURNO Y AISLAMIENTO RIGUROSO
-- ==============================================================================

-- 1. ASEGURAR RLS EN POLLA_TICKETS
ALTER TABLE public.polla_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven sus propias pollas" ON public.polla_tickets;
DROP POLICY IF EXISTS "Lectura de pollas propia o admin" ON public.polla_tickets;

CREATE POLICY "Lectura de pollas propia o admin"
  ON public.polla_tickets FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_admin(auth.uid())
  );

-- 2. RE-CREAR FUNCTION buy_polla_ticket_secure CON LÍMITE DE 20 POLLAS POR USUARIO Y POR TURNO
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
  v_wallet_id UUID;
  v_wallet_available NUMERIC(14,2);
  v_wallet_held NUMERIC(14,2);
  v_ticket_count INT;
  v_ticket_id UUID;
  v_vet_now TIMESTAMPTZ;
  v_vet_time TIME;
  v_vet_date DATE;
  v_price NUMERIC(14,2) := 250.00;
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

  -- 8. BLOQUEO ADVISORY PARA MÁXIMO DE 20 POLLAS POR JUGADOR + FECHA + TURNO
  PERFORM pg_advisory_xact_lock(hashtext('polla_buy_' || v_user_id::text || '_' || p_draw_date::text || '_' || p_block));

  SELECT COUNT(*) INTO v_ticket_count
  FROM public.polla_tickets
  WHERE user_id = v_user_id
    AND draw_date = p_draw_date
    AND block = p_block;

  IF v_ticket_count >= 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'LIMITE_ALCANZADO_ESTE_TURNO_MAX_20');
  END IF;

  -- 9. VALIDAR Y BLOQUEAR BILLETERA (available_balance)
  SELECT id, available_balance, held_balance 
  INTO v_wallet_id, v_wallet_available, v_wallet_held
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, available_balance, held_balance)
    VALUES (v_user_id, 0.00, 0.00)
    RETURNING id, available_balance, held_balance 
    INTO v_wallet_id, v_wallet_available, v_wallet_held;
  END IF;

  IF v_wallet_available IS NULL OR v_wallet_available < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALDO_INSUFICIENTE_REQUIERE_250_BS');
  END IF;

  -- 10. GENERAR NUMERACIÓN ÚNICA Y CÓDIGO DE VERIFICACIÓN
  v_seq_val := NEXTVAL('public.polla_ticket_number_seq');
  v_ticket_num := 'POLLA #' || LPAD(v_seq_val::text, 8, '0');
  v_verif_code := 'PL-' || TO_CHAR(p_draw_date, 'YYYYMMDD') || '-' || SUBSTRING(p_block, 1, 1) || '-' || UPPER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 6));

  -- 11. DESCONTAR 250 BS DE AVAILABLE_BALANCE
  UPDATE public.wallets
  SET available_balance = available_balance - v_price,
      updated_at = NOW()
  WHERE id = v_wallet_id;

  -- 12. REGISTRAR TICKET EN POLLA_TICKETS ASOCIADO DIRECTAMENTE A v_user_id (auth.uid())
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

  -- 13. REGISTRAR ENTRADA EN LEDGER
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
    v_user_id,
    'TABLE_ENTRY_CAPTURE'::ledger_entry_type_enum,
    'DEBIT'::ledger_direction_enum,
    v_price,
    v_wallet_available - v_price,
    v_wallet_held,
    'polla_tickets',
    v_ticket_id,
    'polla_buy_' || v_ticket_id::text,
    'Compra ' || v_ticket_num || ' - Turno ' || p_block || ' (' || p_draw_date || ')'
  );

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'ticket_number', v_ticket_num,
    'verification_code', v_verif_code,
    'cost_bs', v_price,
    'balance_after', v_wallet_available - v_price,
    'message', 'POLLA COMPRADA EXITOSAMENTE.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_polla_ticket_secure(TEXT, DATE, TEXT[]) TO authenticated, service_role;
