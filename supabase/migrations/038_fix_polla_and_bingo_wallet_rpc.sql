-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 038: CORRECCIÓN DE COLUMNA DE SALDO Y RELACIONES EN POLLA Y BINGO
-- ==============================================================================

-- 1. CORREGIR CONSTRAINTS DE CLAVE FORÁNEA PARA RELACIÓN DIRECTA CON PROFILES
ALTER TABLE IF EXISTS public.polla_block_closures
  DROP CONSTRAINT IF EXISTS polla_block_closures_winner_user_id_fkey;

ALTER TABLE IF EXISTS public.polla_block_closures
  ADD CONSTRAINT polla_block_closures_winner_user_id_fkey
  FOREIGN KEY (winner_user_id) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.polla_tickets
  DROP CONSTRAINT IF EXISTS polla_tickets_user_id_fkey;

ALTER TABLE IF EXISTS public.polla_tickets
  ADD CONSTRAINT polla_tickets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- 2. RE-CREAR FUNCTION buy_polla_ticket_secure UTILIZANDO COLUMNA REAL 'available_balance'
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

-- 3. RE-CREAR credit_polla_prize_secure CON COLUMNA REAL 'available_balance'
CREATE OR REPLACE FUNCTION public.credit_polla_prize_secure(
  p_ticket_id UUID,
  p_prize_bs NUMERIC(14,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id UUID;
  v_ticket RECORD;
  v_wallet_id UUID;
  v_wallet_available NUMERIC(14,2);
  v_wallet_held NUMERIC(14,2);
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

  IF v_ticket.validation_status = 'CREDITED' OR v_ticket.credited_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PREMIO_YA_ACREDITADO');
  END IF;

  IF v_ticket.validation_status <> 'VALIDATED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'LA_POLLA_DEBE_SER_VALIDADA_PRIMERO');
  END IF;

  -- Bloquear billetera del jugador ganador
  SELECT id, available_balance, held_balance 
  INTO v_wallet_id, v_wallet_available, v_wallet_held
  FROM public.wallets
  WHERE user_id = v_ticket.user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, available_balance, held_balance) 
    VALUES (v_ticket.user_id, 0.00, 0.00) 
    RETURNING id, available_balance, held_balance 
    INTO v_wallet_id, v_wallet_available, v_wallet_held;
  END IF;

  -- Acreditar monto en available_balance
  UPDATE public.wallets
  SET available_balance = available_balance + p_prize_bs,
      updated_at = NOW()
  WHERE id = v_wallet_id;

  -- Registrar entrada en Ledger auditor
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
    v_ticket.user_id,
    'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
    'CREDIT'::ledger_direction_enum,
    p_prize_bs,
    v_wallet_available + p_prize_bs,
    v_wallet_held,
    'polla_tickets',
    v_ticket.id,
    'polla_prize_' || v_ticket.id::text,
    'Premio Polla Venezolana - ' || COALESCE(v_ticket.ticket_number, v_ticket.id::text) || ' (Aprobado por Admin)'
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
    'MANUAL_ADMIN_VALIDATION',
    jsonb_build_object(
      'prize_bs', p_prize_bs,
      'validated_by', v_admin_id,
      'validated_at', NOW()
    )
  )
  ON CONFLICT (draw_date, block) DO UPDATE SET
    winner_user_id = EXCLUDED.winner_user_id,
    winner_ticket_id = EXCLUDED.winner_ticket_id,
    hits = EXCLUDED.hits,
    closure_reason = EXCLUDED.closure_reason,
    closure_event_data = EXCLUDED.closure_event_data;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', p_ticket_id,
    'prize_bs', p_prize_bs,
    'balance_after', v_wallet_available + p_prize_bs,
    'message', 'PREMIO ACREDITADO EXITOSAMENTE.'
  );
END;
$$;

-- 4. RE-CREAR buy_bingo_cards_secure CON COLUMNA REAL 'available_balance'
CREATE OR REPLACE FUNCTION public.buy_bingo_cards_secure(
  p_game_table_id UUID,
  p_card_count INT,
  p_variant TEXT,
  p_price_per_card NUMERIC(14,2) DEFAULT 10.00,
  p_cards_data JSONB DEFAULT '[]'::jsonb
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
  v_total_cost NUMERIC(14,2);
  v_winner_pool NUMERIC(14,2);
  v_system_fee NUMERIC(14,2);
  v_purchase_id UUID;
  v_joined_players_count INT := 0;
  v_other_player_card_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  IF p_variant NOT IN ('75', '80', '90') THEN
    RETURN jsonb_build_object('success', false, 'error', 'VARIANTE_BINGO_INVALIDA');
  END IF;

  IF p_card_count < 1 OR p_card_count > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANTIDAD_CARTONES_INVALIDA_MAX_20');
  END IF;

  IF p_game_table_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_joined_players_count
    FROM public.game_table_players
    WHERE table_id = p_game_table_id AND status = 'JOINED';

    IF v_joined_players_count = 2 THEN
      IF p_card_count > 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'EN_MESA_DE_2_JUGADORES_MAXIMO_5_CARTONES');
      END IF;

      SELECT COALESCE(SUM(card_count), 0) INTO v_other_player_card_count
      FROM public.bingo_card_purchases
      WHERE game_table_id = p_game_table_id AND user_id <> v_user_id;

      IF v_other_player_card_count > 0 AND v_other_player_card_count <> p_card_count THEN
        RETURN jsonb_build_object('success', false, 'error', 'EN_PARTIDAS_DE_2_JUGADORES_AMBOS_DEBEN_TENER_LA_MISMA_CANTIDAD_DE_CARTONES');
      END IF;
    END IF;
  END IF;

  v_total_cost := ROUND(p_card_count * p_price_per_card, 2);
  v_winner_pool := ROUND(v_total_cost * 0.90, 2);
  v_system_fee := ROUND(v_total_cost * 0.10, 2);

  -- Bloquear billetera y verificar saldo disponible
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

  IF v_wallet_available IS NULL OR v_wallet_available < v_total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALDO_INSUFICIENTE_PARA_COMPRA_DE_CARTONES');
  END IF;

  -- Descontar saldo
  UPDATE public.wallets
  SET available_balance = available_balance - v_total_cost,
      updated_at = NOW()
  WHERE id = v_wallet_id;

  -- Registrar compra de cartones
  INSERT INTO public.bingo_card_purchases (
    user_id,
    game_table_id,
    variant,
    card_count,
    price_per_card,
    total_cost,
    winner_pool,
    system_fee,
    cards_data
  ) VALUES (
    v_user_id,
    p_game_table_id,
    p_variant,
    p_card_count,
    p_price_per_card,
    v_total_cost,
    v_winner_pool,
    v_system_fee,
    p_cards_data
  ) RETURNING id INTO v_purchase_id;

  -- Registrar movimiento en ledger
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
    v_total_cost,
    v_wallet_available - v_total_cost,
    v_wallet_held,
    'bingo_card_purchases',
    v_purchase_id,
    'bingo_buy_' || v_purchase_id::text,
    'Compra de ' || p_card_count || ' cartón(es) de Bingo ' || p_variant
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'total_cost', v_total_cost,
    'winner_pool', v_winner_pool,
    'system_fee', v_system_fee,
    'balance_after', v_wallet_available - v_total_cost,
    'message', 'COMPRA DE CARTONES EXITOSA.'
  );
END;
$$;

-- CONCEDER PERMISOS DE EJECUCIÓN A ROLES AUTENTICADOS
GRANT EXECUTE ON FUNCTION public.buy_polla_ticket_secure(TEXT, DATE, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.credit_polla_prize_secure(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.buy_bingo_cards_secure(UUID, INT, TEXT, NUMERIC, JSONB) TO authenticated, service_role;
