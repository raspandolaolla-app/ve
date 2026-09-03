-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 111: BINGO FAIRNESS LOCK (BLOQUEO DE COMPRAS)
-- ==============================================================================
-- 🔒 PASO 1: Bloquear compras de cartones si el sorteo ya comenzó (DRAWING/FINISHED/COMPLETED)
-- 🔒 PASO 2: Actualizar reveal_next_bingo_ball y prepare_bingo_draw para bloquear la mesa en 'ACTIVE'
-- ==============================================================================

-- 1. SOBRESCRITURA DE buy_bingo_cards_secure CON CANDADO ESTRICTO DE FAIRNESS
CREATE OR REPLACE FUNCTION public.buy_bingo_cards_secure(
  p_game_table_id UUID,
  p_card_count INT,
  p_variant TEXT,
  p_price_per_card NUMERIC(14,2) DEFAULT 10.00,
  p_cards_data JSONB DEFAULT '[]'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_total_cost NUMERIC(14,2);
  v_winner_pool NUMERIC(14,2);
  v_system_fee NUMERIC(14,2);
  v_purchase_id UUID;
  v_table RECORD;
  v_session RECORD;
  v_session_status TEXT;
  v_online_count INT := 0;
  v_countdown_duration INT := 120;
  v_scheduled_start TIMESTAMPTZ;
  v_config JSONB;
  v_new_cards JSONB := '[]'::jsonb;
  v_card_item JSONB;
  v_card_hash TEXT;
  v_c INT;
  v_player_exists BOOLEAN := false;
  v_seat_assigned INT := 1;
  v_existing_purchase RECORD;
  v_table_variant TEXT;
  v_already_owned INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  -- 🔐 RATE LIMIT EN COMPRAS: Máximo 10 compras por minuto (60 segundos)
  IF NOT public.check_rate_limit('buy_bingo_cards', v_user_id::text, 10, INTERVAL '60 seconds') THEN
    RETURN jsonb_build_object('success', false, 'error', 'RATE_LIMIT_EXCEEDED: Has realizado demasiadas transacciones en poco tiempo. Espera un momento.');
  END IF;

  -- Validación estricta del formato de variante
  IF p_variant NOT IN ('75', '80', '90') THEN
    RETURN jsonb_build_object('success', false, 'error', 'VARIANTE_BINGO_INVALIDA');
  END IF;

  IF p_card_count < 1 OR p_card_count > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANTIDAD_CARTONES_INVALIDA_MAX_20');
  END IF;

  -- Validar idempotencia de compra antes de cualquier transacción
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_purchase 
    FROM public.bingo_card_purchases 
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'is_idempotent', true,
        'purchase_id', v_existing_purchase.id,
        'variant', v_existing_purchase.variant,
        'card_count', v_existing_purchase.card_count,
        'cards', v_existing_purchase.cards_data,
        'total_cost', v_existing_purchase.total_cost,
        'winner_pool', v_existing_purchase.winner_pool,
        'system_fee', v_existing_purchase.system_fee
      );
    END IF;
  END IF;

  -- 1. Bloquear Mesa y Verificar Estado
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_game_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MESA_NO_ENCONTRADA');
  END IF;

  -- 🔒 PASO 1 (CANDADO DE FAIRNESS): Bloquear compras si la mesa o el sorteo ya comenzaron
  IF v_table.status IN ('FINISHED'::table_status_enum, 'CLOSED'::table_status_enum, 'ACTIVE'::table_status_enum) THEN
    RAISE EXCEPTION 'MESA_NO_DISPONIBLE: La partida ya comenzó o finalizó. No se pueden comprar más cartones.';
  END IF;

  -- Verificar el estado de la sesión activa de la mesa
  SELECT status::text INTO v_session_status
  FROM public.game_sessions
  WHERE table_id = p_game_table_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_session_status IS NOT NULL AND v_session_status IN ('DRAWING', 'FINISHED', 'COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'El sorteo ya comenzó. No se pueden comprar más cartones.';
  END IF;

  -- Validación de variante autorizada de la mesa contra el cartón comprado
  v_config := COALESCE(v_table.config, '{}'::jsonb);
  v_table_variant := COALESCE(v_config->>'variant', '75');
  IF p_variant <> v_table_variant THEN
    RETURN jsonb_build_object('success', false, 'error', 'VARIANTE_BINGO_INVALIDA_MESA: El tipo de cartón no coincide con la variante autorizada de la mesa.');
  END IF;

  -- Límite acumulativo de cartones por mesa (máximo 20 por usuario/mesa)
  SELECT COALESCE(SUM(card_count), 0) INTO v_already_owned
  FROM public.bingo_card_purchases
  WHERE game_table_id = p_game_table_id AND user_id = v_user_id;

  IF v_already_owned + p_card_count > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXCEDE_MAXIMO_DE_20_CARTONES_ACUMULADOS: El límite acumulado permitido es de 20 cartones por jugador.');
  END IF;

  -- Verificar si las ventas están cerradas (últimos 10 segundos antes del inicio programado)
  IF (v_config->>'scheduled_start_at') IS NOT NULL THEN
    v_scheduled_start := (v_config->>'scheduled_start_at')::TIMESTAMPTZ;
    IF NOW() >= (v_scheduled_start - INTERVAL '10 seconds') THEN
      RAISE EXCEPTION 'SALES_CLOSED: Ventas cerradas. El sorteo comenzará en menos de 10 segundos.';
    END IF;
  END IF;

  -- 2. Calcular costos exclusivamente usando el precio autoritativo (v_table.entry_fee)
  v_total_cost := ROUND(p_card_count * COALESCE(v_table.entry_fee, 10.00), 2);
  v_winner_pool := ROUND(v_total_cost * 0.90, 2);
  v_system_fee := ROUND(v_total_cost * 0.10, 2);

  -- 3. Bloquear Billetera y Descontar Saldo
  SELECT id, available_balance INTO v_wallet_id, v_wallet_available
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, available_balance, held_balance)
    VALUES (v_user_id, 0.00, 0.00)
    RETURNING id, available_balance INTO v_wallet_id, v_wallet_available;
  END IF;

  IF v_wallet_available < v_total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALDO_INSUFICIENTE_PARA_COMPRA_DE_CARTONES');
  END IF;

  UPDATE public.wallets
  SET available_balance = available_balance - v_total_cost,
      updated_at = NOW()
  WHERE id = v_wallet_id;

  -- 4. Generar Cartones Únicos para el Usuario
  FOR v_c IN 1..p_card_count LOOP
    v_card_item := public.generate_single_bingo_card_jsonb(p_variant, p_game_table_id, v_c);
    v_new_cards := v_new_cards || jsonb_build_array(v_card_item);
  END LOOP;

  v_card_hash := encode(digest(v_new_cards::text, 'sha256'), 'hex');

  -- 5. Registrar la Compra
  INSERT INTO public.bingo_card_purchases (
    user_id,
    game_table_id,
    variant,
    card_count,
    price_per_card,
    total_cost,
    winner_pool,
    system_fee,
    cards_data,
    unique_card_hash,
    idempotency_key
  ) VALUES (
    v_user_id,
    p_game_table_id,
    p_variant,
    p_card_count,
    COALESCE(v_table.entry_fee, 10.00),
    v_total_cost,
    v_winner_pool,
    v_system_fee,
    v_new_cards,
    v_card_hash,
    p_idempotency_key
  )
  RETURNING id INTO v_purchase_id;

  -- Registrar Ledger de Retención
  INSERT INTO public.wallet_ledgers (
    wallet_id,
    user_id,
    amount,
    entry_type,
    reference_type,
    reference_id,
    idempotency_key,
    description
  ) VALUES (
    v_wallet_id,
    v_user_id,
    -v_total_cost,
    'GAME_ENTRY_HOLD',
    'bingo_card_purchases',
    v_purchase_id::text,
    'bingo_buy_' || v_purchase_id::text,
    'Compra de ' || p_card_count || ' cartón(es) de Bingo ' || p_variant || ' Bolas'
  );

  -- 6. Asentar al Jugador en game_table_players si aún no está presente
  SELECT EXISTS (
    SELECT 1 FROM public.game_table_players
    WHERE table_id = p_game_table_id AND user_id = v_user_id AND status != 'LEFT'::player_table_status_enum
  ) INTO v_player_exists;

  IF NOT v_player_exists THEN
    SELECT COALESCE(MAX(seat_number), 0) + 1 INTO v_seat_assigned
    FROM public.game_table_players
    WHERE table_id = p_game_table_id AND status != 'LEFT'::player_table_status_enum;

    INSERT INTO public.game_table_players (
      table_id,
      user_id,
      seat_number,
      seat_index,
      team_index,
      status
    ) VALUES (
      p_game_table_id,
      v_user_id,
      v_seat_assigned,
      v_seat_assigned - 1,
      0,
      'READY'::player_table_status_enum
    );

    UPDATE public.game_tables
    SET current_players_count = current_players_count + 1,
        updated_at = NOW()
    WHERE id = p_game_table_id;
  END IF;

  -- 7. Lógica del Temporizador Server-Authoritative (Mínimo 2 Jugadores)
  IF (v_table.current_players_count + (CASE WHEN v_player_exists THEN 0 ELSE 1 END)) >= 2 THEN
    IF (v_config->>'scheduled_start_at') IS NULL THEN
      v_countdown_duration := CASE WHEN COALESCE((v_config->>'online_users_count')::INT, 0) > 100 THEN 180 ELSE 120 END;
      v_scheduled_start := NOW() + (v_countdown_duration || ' seconds')::INTERVAL;

      v_config := v_config || jsonb_build_object(
        'countdown_started_at', NOW(),
        'countdown_duration', v_countdown_duration,
        'scheduled_start_at', v_scheduled_start,
        'status', 'COUNTDOWN'
      );

      UPDATE public.game_tables
      SET config = v_config,
          status = 'READY'::table_status_enum,
          updated_at = NOW()
      WHERE id = p_game_table_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'variant', p_variant,
    'card_count', p_card_count,
    'cards', v_new_cards,
    'total_cost', v_total_cost,
    'winner_pool', v_winner_pool,
    'system_fee', v_system_fee,
    'scheduled_start_at', v_config->>'scheduled_start_at'
  );
END;
$$;

-- 🔒 PASO 2: Actualizar reveal_next_bingo_ball para bloquear la mesa en 'ACTIVE' al revelar bolas
CREATE OR REPLACE FUNCTION public.reveal_next_bingo_ball(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_next_index INT;
  v_revealed_ball INT;
  v_has_winner BOOLEAN := false;
  v_winner_user_id UUID;
BEGIN
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status != 'DRAWING' THEN 
    RETURN jsonb_build_object('success', false, 'reason', 'NOT_DRAWING'); 
  END IF;

  -- 🔒 CANDADO DE FAIRNESS: Bloquear inmediatamente la mesa en 'ACTIVE' para cerrar compras y nuevas uniones
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      updated_at = NOW()
  WHERE id = v_session.table_id AND status != 'ACTIVE'::table_status_enum;

  v_next_index := v_session.current_ball_index + 1;
  
  IF v_next_index > array_length(v_session.draw_sequence, 1) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'DRAW_COMPLETE');
  END IF;

  v_revealed_ball := v_session.draw_sequence[v_next_index];

  -- Actualizar sesión
  UPDATE public.game_sessions
  SET 
    current_ball_index = v_next_index,
    last_revealed_ball = v_revealed_ball,
    current_state = jsonb_set(
      jsonb_set(current_state, '{currentBall}', to_jsonb(v_revealed_ball)),
      '{drawnBalls}', COALESCE(current_state->'drawnBalls', '[]'::jsonb) || to_jsonb(v_revealed_ball)
    ),
    updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'ball_number', v_revealed_ball,
    'index', v_next_index,
    'has_winner', v_has_winner,
    'winner_user_id', v_winner_user_id
  );
END;
$$;

-- También asegurar que al preparar el sorteo (prepare_bingo_draw), la mesa pase de inmediato a 'ACTIVE'
CREATE OR REPLACE FUNCTION public.prepare_bingo_draw(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_total_balls INT;
  v_sequence INT[];
  v_hash TEXT;
BEGIN
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;

  v_total_balls := COALESCE((v_session.current_state->>'totalBalls')::INT, 90);

  -- Generar secuencia aleatoria de 1 a total_balls
  SELECT array_agg(n ORDER BY random()) INTO v_sequence
  FROM generate_series(1, v_total_balls) AS n;

  v_hash := md5(v_sequence::text || p_session_id::text || NOW()::text);

  UPDATE public.game_sessions
  SET 
    draw_sequence = v_sequence,
    current_ball_index = 0,
    last_revealed_ball = NULL,
    current_state = jsonb_set(current_state, '{status}', '"DRAWING"'),
    status = 'DRAWING'::session_status_enum,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- 🔒 Bloquear la mesa en 'ACTIVE' al preparar el sorteo
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      updated_at = NOW()
  WHERE id = v_session.table_id AND status != 'ACTIVE'::table_status_enum;

  RETURN jsonb_build_object('success', true, 'total_balls', v_total_balls, 'hash', v_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_bingo_cards_secure(UUID, INT, TEXT, NUMERIC, JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reveal_next_bingo_ball(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_bingo_draw(UUID) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
