-- ================================================================
-- MIGRACIÓN 016: Funciones Transaccionales Seguras (SECURITY DEFINER)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- ================================================================
-- 1. Transacción de Entrada a Mesa (Bloqueo Pesimista + Hold en Ledger)
-- ================================================================
CREATE OR REPLACE FUNCTION public.join_table_transaction(
  p_table_id UUID,
  p_seat_number SMALLINT,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_table RECORD;
  v_wallet RECORD;
  v_existing_player RECORD;
  v_ledger_id UUID;
  v_player_id UUID;
BEGIN
  -- 1. Verificación de Autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  -- 2. Verificación de Estado de Cuenta del Perfil
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil de usuario no registrado';
  END IF;

  IF v_profile.account_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Cuenta no habilitada para unirse a mesas (estado: %)', v_profile.account_status;
  END IF;

  -- 3. Verificación de Idempotencia previa en la misma mesa
  SELECT * INTO v_existing_player
  FROM public.game_table_players
  WHERE table_id = p_table_id AND user_id = v_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'player_id', v_existing_player.id,
      'table_id', p_table_id,
      'seat_number', v_existing_player.seat_number
    );
  END IF;

  -- 4. Bloqueo Pesimista de la Mesa
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa especificada no existe';
  END IF;

  IF v_table.status != 'OPEN' THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: La mesa no está disponible (estado: %)', v_table.status;
  END IF;

  IF v_table.expires_at <= NOW() THEN
    RAISE EXCEPTION 'TABLE_EXPIRED: La mesa ha expirado';
  END IF;

  IF v_table.current_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: La mesa ha alcanzado su capacidad máxima';
  END IF;

  IF p_seat_number < 1 OR p_seat_number > v_table.max_players THEN
    RAISE EXCEPTION 'INVALID_SEAT: Número de asiento fuera de rango permitido (1..%)', v_table.max_players;
  END IF;

  IF EXISTS (SELECT 1 FROM public.game_table_players WHERE table_id = p_table_id AND seat_number = p_seat_number) THEN
    RAISE EXCEPTION 'SEAT_TAKEN: El asiento % ya está ocupado', p_seat_number;
  END IF;

  -- 5. Bloqueo Pesimista de Billetera y Validación de Saldo
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera de usuario no encontrada';
  END IF;

  IF v_table.entry_fee > 0.00 AND v_wallet.available_balance < v_table.entry_fee THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente (requerido: %, disponible: %)', 
      v_table.entry_fee, v_wallet.available_balance;
  END IF;

  -- 6. Aplicación de Hold y Asiento en Ledger si la mesa tiene costo
  IF v_table.entry_fee > 0.00 THEN
    UPDATE public.wallets
    SET 
      available_balance = available_balance - v_table.entry_fee,
      held_balance = held_balance + v_table.entry_fee,
      updated_at = NOW()
    WHERE id = v_wallet.id;

    v_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id,
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
      description,
      actor_id
    ) VALUES (
      v_ledger_id,
      v_wallet.id,
      v_user_id,
      'TABLE_ENTRY_HOLD',
      'HOLD',
      v_table.entry_fee,
      v_wallet.available_balance - v_table.entry_fee,
      v_wallet.held_balance + v_table.entry_fee,
      'game_tables',
      p_table_id,
      p_idempotency_key,
      'Retención de entrada a mesa ' || p_table_id::text || ' asiento ' || p_seat_number::text,
      v_user_id
    );
  END IF;

  -- 7. Registro del Jugador en la Mesa
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id,
    table_id,
    user_id,
    seat_number,
    status,
    entry_held_entry_id
  ) VALUES (
    v_player_id,
    p_table_id,
    v_user_id,
    p_seat_number,
    'JOINED',
    v_ledger_id
  );

  -- 8. Actualización Atómica del Contador de la Mesa
  UPDATE public.game_tables
  SET 
    current_players_count = current_players_count + 1,
    status = CASE 
      WHEN current_players_count + 1 = max_players THEN 'FULL'::table_status_enum 
      ELSE 'OPEN'::table_status_enum 
    END
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'player_id', v_player_id,
    'table_id', p_table_id,
    'seat_number', p_seat_number,
    'entry_fee', v_table.entry_fee
  );
END;
$$;


-- ================================================================
-- 2. Transacción de Solicitud de Retiro con Bloqueo y Validación MFA Real
-- ================================================================
CREATE OR REPLACE FUNCTION public.request_withdrawal_locked(
  p_payment_account_id UUID,
  p_amount NUMERIC,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_jwt_claims JSONB;
  v_aal_level TEXT;
  v_profile RECORD;
  v_wallet RECORD;
  v_account RECORD;
  v_existing_req RECORD;
  v_request_id UUID;
  v_ledger_id UUID;
BEGIN
  -- 1. Verificación de Autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  -- 2. Verificación Estricta de MFA / AAL2 en JWT
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil no encontrado';
  END IF;

  IF v_profile.is_mfa_enabled THEN
    v_jwt_claims := auth.jwt();
    v_aal_level := COALESCE(v_jwt_claims->>'aal', 'aal1');
    IF v_aal_level != 'aal2' THEN
      RAISE EXCEPTION 'MFA_AAL2_REQUIRED: Se requiere autenticación de segundo factor (AAL2) para autorizar solicitudes de retiro.';
    END IF;
  END IF;

  -- 3. Verificación de Estatus KYC y Cuenta
  IF v_profile.account_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE: La cuenta no está activa para retiros';
  END IF;

  IF v_profile.kyc_status != 'APPROVED' THEN
    RAISE EXCEPTION 'KYC_NOT_APPROVED: Se requiere verificación de identidad (KYC) aprobada para solicitar retiros.';
  END IF;

  -- 4. Verificación de Monto Mínimo
  IF p_amount < 100.00 THEN
    RAISE EXCEPTION 'MIN_WITHDRAWAL_NOT_MET: El monto mínimo de retiro es 100.00 Bs.';
  END IF;

  -- 5. Verificación de Cuenta de Pago Destino
  SELECT * INTO v_account
  FROM public.payment_accounts
  WHERE id = p_payment_account_id AND user_id = v_user_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ACCOUNT_INVALID: Cuenta bancaria destino no válida o no pertenece al usuario';
  END IF;

  -- 6. Verificación de Idempotencia previa
  SELECT * INTO v_existing_req
  FROM public.withdrawal_requests
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'withdrawal_id', v_existing_req.id,
      'amount', v_existing_req.amount,
      'status', v_existing_req.status
    );
  END IF;

  -- 7. Bloqueo Pesimista de Billetera
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente para retiro';
  END IF;

  -- 8. Aplicación de Retención Atómica
  UPDATE public.wallets
  SET 
    available_balance = available_balance - p_amount,
    held_balance = held_balance + p_amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  -- 9. Creación de la Solicitud
  v_request_id := gen_random_uuid();
  INSERT INTO public.withdrawal_requests (
    id,
    user_id,
    payment_account_id,
    amount,
    currency,
    status,
    mfa_verified_at,
    idempotency_key
  ) VALUES (
    v_request_id,
    v_user_id,
    p_payment_account_id,
    p_amount,
    'VES',
    'PENDING',
    NOW(),
    p_idempotency_key
  );

  -- 10. Asiento en Ledger
  v_ledger_id := gen_random_uuid();
  INSERT INTO public.ledger_entries (
    id,
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
    description,
    actor_id
  ) VALUES (
    v_ledger_id,
    v_wallet.id,
    v_user_id,
    'WITHDRAWAL_HOLD',
    'HOLD',
    p_amount,
    v_wallet.available_balance - p_amount,
    v_wallet.held_balance + p_amount,
    'withdrawal_requests',
    v_request_id,
    p_idempotency_key,
    'Retención por solicitud de retiro ' || v_request_id::text,
    v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_request_id,
    'amount', p_amount,
    'status', 'PENDING'
  );
END;
$$;


-- ================================================================
-- 3. Liquidación Atómica de Partida (Regla 90/10 - 1v1 y Equipos 2v2)
-- ================================================================
CREATE OR REPLACE FUNCTION public.settle_game_session(
  p_session_id UUID,
  p_winner_user_ids UUID[],
  p_winner_team SMALLINT,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_player_count INT;
  v_gross_pool NUMERIC(14,2);
  v_prize_pool NUMERIC(14,2);
  v_platform_fee NUMERIC(14,2);
  v_settlement_id UUID;
  v_player RECORD;
  v_winner_id UUID;
  v_winner_wallet RECORD;
  v_winner_count INT;
  v_individual_prize NUMERIC(14,2);
  v_distributed_sum NUMERIC(14,2) := 0.00;
  v_winner_ledger_id UUID;
  v_settlement_type settlement_type_enum;
  v_existing_settlement RECORD;
BEGIN
  -- 1. Control de Autorización (Motor Server-Side o Rol Operador+)
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL AND NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Solo el motor de juego o un operador pueden liquidar partidas';
  END IF;

  -- 2. Verificación de Idempotencia previa
  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id OR idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'settlement_id', v_existing_settlement.id,
      'gross_pool', v_existing_settlement.gross_pool,
      'prize_pool', v_existing_settlement.prize_pool,
      'platform_fee', v_existing_settlement.platform_fee
    );
  END IF;

  -- 3. Bloqueo Pesimista de la Sesión
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión de juego no encontrada';
  END IF;

  IF v_session.status IN ('SETTLED', 'CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_SESSION_STATUS: La sesión ya fue liquidada o cancelada (estado: %)', v_session.status;
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id;

  -- 4. Validación de Participantes
  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'INVALID_PLAYER_COUNT: Partida con menos de 2 participantes';
  END IF;

  -- 5. Validación de Ganadores
  v_winner_count := array_length(p_winner_user_ids, 1);
  IF v_winner_count IS NULL OR v_winner_count < 1 THEN
    RAISE EXCEPTION 'NO_WINNERS_SPECIFIED: Se requiere al menos un ganador para liquidar';
  END IF;

  FOREACH v_winner_id IN ARRAY p_winner_user_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.game_table_players 
      WHERE table_id = v_table.id AND user_id = v_winner_id
    ) THEN
      RAISE EXCEPTION 'INVALID_WINNER: El usuario % no participó en esta mesa', v_winner_id;
    END IF;
  END LOOP;

  -- 6. Cálculo Financiero Server-Side (Regla 90% Premio / 10% Comisión)
  v_gross_pool := v_table.entry_fee * v_player_count;
  v_prize_pool := ROUND(v_gross_pool * 0.90, 2);
  v_platform_fee := v_gross_pool - v_prize_pool;
  v_settlement_type := CASE WHEN v_winner_count > 1 THEN 'SPLIT_PAYOUT'::settlement_type_enum ELSE 'STANDARD_PAYOUT'::settlement_type_enum END;

  -- 7. Creación de la Liquidación Principal
  v_settlement_id := gen_random_uuid();
  INSERT INTO public.game_settlements (
    id,
    session_id,
    table_id,
    settlement_type,
    gross_pool,
    prize_pool,
    platform_fee,
    total_distributed,
    idempotency_key,
    settled_by
  ) VALUES (
    v_settlement_id,
    p_session_id,
    v_table.id,
    v_settlement_type,
    v_gross_pool,
    v_prize_pool,
    v_platform_fee,
    v_prize_pool,
    p_idempotency_key,
    COALESCE(v_caller_id::text, 'SERVER_ENGINE')
  );

  -- 8. Captura de Entrada (Held Balance) de todos los participantes
  IF v_table.entry_fee > 0.00 THEN
    FOR v_player IN (SELECT user_id FROM public.game_table_players WHERE table_id = v_table.id) LOOP
      UPDATE public.wallets
      SET 
        held_balance = held_balance - v_table.entry_fee,
        updated_at = NOW()
      WHERE user_id = v_player.user_id;

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
        description,
        actor_id
      )
      SELECT 
        w.id,
        w.user_id,
        'TABLE_ENTRY_CAPTURE'::ledger_entry_type_enum,
        'DEBIT'::ledger_direction_enum,
        v_table.entry_fee,
        w.available_balance,
        w.held_balance,
        'game_settlements',
        v_settlement_id,
        'CAPTURE_' || p_session_id::text || '_' || v_player.user_id::text,
        'Captura de entrada para liquidación de partida ' || p_session_id::text,
        v_caller_id
      FROM public.wallets w
      WHERE w.user_id = v_player.user_id;
    END LOOP;
  END IF;

  -- 9. Acreditación de Premio a Ganadores (1v1 o Reparto 2v2)
  IF v_prize_pool > 0.00 THEN
    FOR i IN 1..v_winner_count LOOP
      v_winner_id := p_winner_user_ids[i];
      
      -- En caso de división con centavos impares, el último ganador absorbe la diferencia exacta
      IF i = v_winner_count THEN
        v_individual_prize := v_prize_pool - v_distributed_sum;
      ELSE
        v_individual_prize := ROUND(v_prize_pool / v_winner_count, 2);
        v_distributed_sum := v_distributed_sum + v_individual_prize;
      END IF;

      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_winner_id
      FOR UPDATE;

      UPDATE public.wallets
      SET 
        available_balance = available_balance + v_individual_prize,
        updated_at = NOW()
      WHERE id = v_winner_wallet.id;

      v_winner_ledger_id := gen_random_uuid();
      INSERT INTO public.ledger_entries (
        id,
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
        description,
        actor_id
      ) VALUES (
        v_winner_ledger_id,
        v_winner_wallet.id,
        v_winner_id,
        'GAME_PRIZE_CREDIT',
        'CREDIT',
        v_individual_prize,
        v_winner_wallet.available_balance + v_individual_prize,
        v_winner_wallet.held_balance,
        'game_settlements',
        v_settlement_id,
        'PRIZE_' || p_session_id::text || '_' || v_winner_id::text,
        'Premio por victoria en partida ' || p_session_id::text,
        v_caller_id
      );

      INSERT INTO public.game_settlement_recipients (
        settlement_id,
        user_id,
        team_number,
        payout_amount,
        ledger_entry_id,
        payout_status
      ) VALUES (
        v_settlement_id,
        v_winner_id,
        p_winner_team,
        v_individual_prize,
        v_winner_ledger_id,
        'CREDITED'
      );
    END LOOP;
  END IF;

  -- 10. Cierre de Sesión y Mesa
  UPDATE public.game_sessions
  SET 
    status = 'SETTLED',
    winner_user_id = p_winner_user_ids[1],
    winner_team = p_winner_team,
    ended_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'
  WHERE id = v_table.id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'gross_pool', v_gross_pool,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee,
    'winners', p_winner_user_ids,
    'winner_team', p_winner_team
  );
END;
$$;


-- ================================================================
-- 4. Reembolso Total por Empate o Cancelación (0% Comisión de Servicio)
-- ================================================================
CREATE OR REPLACE FUNCTION public.refund_game_session(
  p_session_id UUID,
  p_reason VARCHAR,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_player_count INT;
  v_gross_pool NUMERIC(14,2);
  v_settlement_id UUID;
  v_player RECORD;
  v_player_wallet RECORD;
  v_refund_ledger_id UUID;
  v_existing_settlement RECORD;
BEGIN
  -- 1. Control de Autorización
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL AND NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Solo el motor de juego o un operador pueden procesar reembolsos';
  END IF;

  -- 2. Verificación de Idempotencia previa
  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id OR idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'settlement_id', v_existing_settlement.id,
      'total_refunded', v_existing_settlement.total_distributed
    );
  END IF;

  -- 3. Bloqueo Pesimista de Sesión
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión no encontrada';
  END IF;

  IF v_session.status IN ('SETTLED', 'CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_SESSION_STATUS: La sesión ya fue liquidada o cancelada previamente';
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id;

  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  v_gross_pool := v_table.entry_fee * v_player_count;

  -- 4. Creación del Registro de Liquidación de Reembolso
  v_settlement_id := gen_random_uuid();
  INSERT INTO public.game_settlements (
    id,
    session_id,
    table_id,
    settlement_type,
    gross_pool,
    prize_pool,
    platform_fee,
    total_distributed,
    idempotency_key,
    settled_by
  ) VALUES (
    v_settlement_id,
    p_session_id,
    v_table.id,
    'DRAW_REFUND',
    v_gross_pool,
    0.00,
    0.00,
    v_gross_pool,
    p_idempotency_key,
    COALESCE(v_caller_id::text, 'SERVER_ENGINE')
  );

  -- 5. Devolución Íntegra (100%) a Cada Participante
  IF v_table.entry_fee > 0.00 THEN
    FOR v_player IN (SELECT user_id FROM public.game_table_players WHERE table_id = v_table.id) LOOP
      SELECT * INTO v_player_wallet
      FROM public.wallets
      WHERE user_id = v_player.user_id
      FOR UPDATE;

      UPDATE public.wallets
      SET 
        available_balance = available_balance + v_table.entry_fee,
        held_balance = held_balance - v_table.entry_fee,
        updated_at = NOW()
      WHERE id = v_player_wallet.id;

      v_refund_ledger_id := gen_random_uuid();
      INSERT INTO public.ledger_entries (
        id,
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
        description,
        actor_id
      ) VALUES (
        v_refund_ledger_id,
        v_player_wallet.id,
        v_player.user_id,
        'TABLE_ENTRY_REFUND',
        'RELEASE',
        v_table.entry_fee,
        v_player_wallet.available_balance + v_table.entry_fee,
        v_player_wallet.held_balance - v_table.entry_fee,
        'game_settlements',
        v_settlement_id,
        'REFUND_' || p_session_id::text || '_' || v_player.user_id::text,
        'Reembolso 100% de entrada por: ' || p_reason,
        v_caller_id
      );

      INSERT INTO public.game_settlement_recipients (
        settlement_id,
        user_id,
        payout_amount,
        ledger_entry_id,
        payout_status
      ) VALUES (
        v_settlement_id,
        v_player.user_id,
        v_table.entry_fee,
        v_refund_ledger_id,
        'REFUNDED'
      );
    END LOOP;
  END IF;

  -- 6. Actualización de Sesión y Mesa
  UPDATE public.game_sessions
  SET 
    status = 'CANCELLED',
    ended_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CANCELLED'
  WHERE id = v_table.id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'total_refunded', v_gross_pool,
    'reason', p_reason
  );
END;
$$;


-- ================================================================
-- 5. Aprobación Administrativa Atómica de Depósito (Operador / Admin)
-- ================================================================
CREATE OR REPLACE FUNCTION public.process_deposit_approval(
  p_deposit_id UUID,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID;
  v_deposit RECORD;
  v_wallet RECORD;
  v_ledger_id UUID;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL OR NOT public.is_operator_or_above(v_operator_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposit_requests
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPOSIT_NOT_FOUND: Solicitud de depósito no encontrada';
  END IF;

  IF v_deposit.status != 'PENDING' AND v_deposit.status != 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'INVALID_DEPOSIT_STATUS: El depósito ya fue procesado (estado: %)', v_deposit.status;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_deposit.user_id
  FOR UPDATE;

  UPDATE public.wallets
  SET 
    available_balance = available_balance + v_deposit.amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  v_ledger_id := gen_random_uuid();
  INSERT INTO public.ledger_entries (
    id,
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
    description,
    actor_id
  ) VALUES (
    v_ledger_id,
    v_wallet.id,
    v_deposit.user_id,
    'DEPOSIT_CREDIT',
    'CREDIT',
    v_deposit.amount,
    v_wallet.available_balance + v_deposit.amount,
    v_wallet.held_balance,
    'deposit_requests',
    p_deposit_id,
    p_idempotency_key,
    'Acreditación por recarga aprobada ref: ' || v_deposit.reference_number,
    v_operator_id
  );

  UPDATE public.deposit_requests
  SET 
    status = 'APPROVED',
    reviewed_by = v_operator_id,
    reviewed_at = NOW()
  WHERE id = p_deposit_id;

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', p_deposit_id,
    'amount', v_deposit.amount,
    'status', 'APPROVED'
  );
END;
$$;


-- ================================================================
-- 6. Ejecución Final de Retiro Completado (Operador / Admin)
-- ================================================================
CREATE OR REPLACE FUNCTION public.process_withdrawal_completion(
  p_withdrawal_id UUID,
  p_bank_reference VARCHAR,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID;
  v_withdrawal RECORD;
  v_wallet RECORD;
  v_ledger_id UUID;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL OR NOT public.is_operator_or_above(v_operator_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND: Solicitud de retiro no encontrada';
  END IF;

  IF v_withdrawal.status != 'PENDING' AND v_withdrawal.status != 'PROCESSING' THEN
    RAISE EXCEPTION 'INVALID_WITHDRAWAL_STATUS: La solicitud ya fue procesada (estado: %)', v_withdrawal.status;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  UPDATE public.wallets
  SET 
    held_balance = held_balance - v_withdrawal.amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  v_ledger_id := gen_random_uuid();
  INSERT INTO public.ledger_entries (
    id,
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
    description,
    actor_id
  ) VALUES (
    v_ledger_id,
    v_wallet.id,
    v_withdrawal.user_id,
    'WITHDRAWAL_CAPTURE',
    'DEBIT',
    v_withdrawal.amount,
    v_wallet.available_balance,
    v_wallet.held_balance - v_withdrawal.amount,
    'withdrawal_requests',
    p_withdrawal_id,
    p_idempotency_key,
    'Débito definitivo por retiro completado ref: ' || p_bank_reference,
    v_operator_id
  );

  UPDATE public.withdrawal_requests
  SET 
    status = 'COMPLETED',
    bank_reference = p_bank_reference,
    processed_by = v_operator_id,
    completed_at = NOW()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', 'COMPLETED',
    'bank_reference', p_bank_reference
  );
END;
$$;


-- ================================================================
-- 7. Rechazo de Retiro con Liberación de Fondos (Operador / Admin)
-- ================================================================
CREATE OR REPLACE FUNCTION public.process_withdrawal_rejection(
  p_withdrawal_id UUID,
  p_rejection_reason TEXT,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID;
  v_withdrawal RECORD;
  v_wallet RECORD;
  v_ledger_id UUID;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL OR NOT public.is_operator_or_above(v_operator_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND: Solicitud de retiro no encontrada';
  END IF;

  IF v_withdrawal.status != 'PENDING' AND v_withdrawal.status != 'PROCESSING' THEN
    RAISE EXCEPTION 'INVALID_WITHDRAWAL_STATUS: La solicitud ya fue procesada (estado: %)', v_withdrawal.status;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  UPDATE public.wallets
  SET 
    available_balance = available_balance + v_withdrawal.amount,
    held_balance = held_balance - v_withdrawal.amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  v_ledger_id := gen_random_uuid();
  INSERT INTO public.ledger_entries (
    id,
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
    description,
    actor_id
  ) VALUES (
    v_ledger_id,
    v_wallet.id,
    v_withdrawal.user_id,
    'WITHDRAWAL_RELEASE',
    'RELEASE',
    v_withdrawal.amount,
    v_wallet.available_balance + v_withdrawal.amount,
    v_wallet.held_balance - v_withdrawal.amount,
    'withdrawal_requests',
    p_withdrawal_id,
    p_idempotency_key,
    'Liberación por retiro rechazado: ' || p_rejection_reason,
    v_operator_id
  );

  UPDATE public.withdrawal_requests
  SET 
    status = 'REJECTED',
    rejection_reason = p_rejection_reason,
    processed_by = v_operator_id,
    completed_at = NOW()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', 'REJECTED',
    'rejection_reason', p_rejection_reason
  );
END;
$$;


-- ================================================================
-- 8. Métricas del Panel Administrativo (ADMIN / SUPER_ADMIN)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_users_count INT;
  v_active_users INT;
  v_tables_count INT;
  v_pending_deposits INT;
  v_pending_withdrawals INT;
  v_volume NUMERIC(14,2);
  v_prizes NUMERIC(14,2);
  v_fees NUMERIC(14,2);
  v_security_alerts INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT COUNT(*) INTO v_users_count FROM public.profiles;
  SELECT COUNT(*) INTO v_active_users FROM public.profiles WHERE account_status = 'ACTIVE';
  SELECT COUNT(*) INTO v_tables_count FROM public.game_tables WHERE status IN ('WAITING', 'OPEN', 'FULL', 'IN_PROGRESS');
  SELECT COUNT(*) INTO v_pending_deposits FROM public.deposit_requests WHERE status = 'PENDING';
  SELECT COUNT(*) INTO v_pending_withdrawals FROM public.withdrawal_requests WHERE status = 'PENDING';
  
  SELECT COALESCE(SUM(gross_pool), 0.00), COALESCE(SUM(prize_pool), 0.00), COALESCE(SUM(platform_fee), 0.00)
  INTO v_volume, v_prizes, v_fees
  FROM public.game_settlements;

  SELECT COUNT(*) INTO v_security_alerts FROM public.audit_logs WHERE severity IN ('WARNING', 'CRITICAL');

  RETURN jsonb_build_object(
    'registeredUsersCount', v_users_count,
    'activeUsersCount', v_active_users,
    'connectedUsersCount', v_active_users,
    'activeTablesCount', v_tables_count,
    'pendingDepositsCount', v_pending_deposits,
    'pendingWithdrawalsCount', v_pending_withdrawals,
    'totalVolumePlayed', v_volume,
    'totalPrizesAwarded', v_prizes,
    'totalServiceFeesCollected', v_fees,
    'securityAlertsCount', v_security_alerts
  );
END;
$$;


-- ================================================================
-- 9. Hardening de Permisos (Principle of Least Privilege)
-- ================================================================
REVOKE ALL ON FUNCTION public.join_table_transaction FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_withdrawal_locked FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_game_session FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_game_session FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_deposit_approval FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_withdrawal_completion FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_withdrawal_rejection FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.join_table_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal_locked TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_game_session TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_game_session TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_deposit_approval TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_completion TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_rejection TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics TO authenticated, service_role;
