-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 113: CUENTA REGRESIVA DE 3 MINUTOS Y BLOQUEO A 10S
-- ==============================================================================
-- 1. Columna countdown_ends_at en game_sessions
-- 2. check_and_start_bingo_countdown: Mínimo 2 jugadores distintos con cartones -> 3 minutos
-- 3. reveal_next_bingo_ball: Revela bolas SOLO cuando los 3 minutos terminan
-- 4. buy_bingo_cards_secure: Bloqueo estricto de compras si faltan <= 10 segundos o sorteo activo
-- 5. server_bingo_operation: Delegación segura y estricta a reveal_next_bingo_ball
-- ==============================================================================

-- 1. Asegurar que exista la columna de cuenta regresiva
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS countdown_ends_at TIMESTAMPTZ;

-- 2. Función que verifica si hay 2 jugadores distintos con cartones para iniciar los 3 minutos
CREATE OR REPLACE FUNCTION public.check_and_start_bingo_countdown()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_unique_players INT;
  v_total_cards INT;
BEGIN
  FOR v_session IN
    SELECT gs.id, gs.table_id
    FROM public.game_sessions gs
    WHERE LOWER(gs.game_type::text) = 'bingo'
      AND gs.status::text IN ('WAITING', 'READY', 'SALES', 'IN_PROGRESS', 'waiting', 'ready', 'sales', 'in_progress')
      AND gs.countdown_ends_at IS NULL -- Solo si aún no ha iniciado la cuenta
  LOOP
    -- Contar jugadores ÚNICOS con al menos 1 cartón
    SELECT COUNT(DISTINCT user_id) INTO v_unique_players
    FROM public.bingo_card_purchases
    WHERE session_id = v_session.id OR game_table_id = v_session.table_id;
    
    -- Contar total de cartones
    SELECT COUNT(*) INTO v_total_cards
    FROM public.bingo_card_purchases
    WHERE session_id = v_session.id OR game_table_id = v_session.table_id;
    
    -- 👇 REGLA ESTRICTA: Mínimo 2 jugadores distintos con cartones y mínimo 2 cartones en total
    IF v_unique_players >= 2 AND v_total_cards >= 2 THEN
      UPDATE public.game_sessions
      SET countdown_ends_at = NOW() + INTERVAL '3 minutes', -- 3 MINUTOS DE RETROCESO
          updated_at = NOW()
      WHERE id = v_session.id;

      -- También reflejar en la configuración de la mesa para compatibilidad
      IF v_session.table_id IS NOT NULL THEN
        UPDATE public.game_tables
        SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
          'scheduled_start_at', NOW() + INTERVAL '3 minutes',
          'countdown_duration', 180,
          'status', 'COUNTDOWN'
        ),
        updated_at = NOW()
        WHERE id = v_session.table_id;
      END IF;
      
      RAISE NOTICE 'Cuenta regresiva de 3 minutos iniciada para sesión %', v_session.id;
    END IF;
  END LOOP;
END;
$$;

-- 3. Función que revela la bola SOLO cuando los 3 minutos terminan
CREATE OR REPLACE FUNCTION public.reveal_next_bingo_ball(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_current_state JSONB;
  v_drawn_balls INT[];
  v_new_ball INT;
  v_total_balls INT;
  v_last_drawn_at TIMESTAMPTZ;
  v_seconds_since_last NUMERIC;
  v_available_balls INT[];
  v_next_sequence INT;
  v_action_payload JSONB;
  v_state_hash TEXT;
  v_seconds_left NUMERIC;
BEGIN
  SELECT id, table_id, current_state, status, countdown_ends_at INTO v_session 
  FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  
  -- Si no está en DRAWING, verificar la cuenta regresiva
  IF v_session.status::text != 'DRAWING' THEN
    IF v_session.countdown_ends_at IS NOT NULL THEN
      v_seconds_left := EXTRACT(EPOCH FROM (v_session.countdown_ends_at - NOW()));
      
      IF v_seconds_left > 0 THEN
        -- Aún no es hora, devolver cuántos segundos faltan
        RETURN jsonb_build_object(
          'success', false, 
          'reason', 'COUNTDOWN_ACTIVE',
          'seconds_remaining', CEIL(v_seconds_left)
        );
      END IF;
      
      -- ¡La cuenta regresiva terminó! Iniciar sorteo
      UPDATE public.game_sessions
      SET status = 'DRAWING'::session_status_enum,
          current_state = jsonb_set(COALESCE(current_state, '{}'::jsonb), '{status}', '"DRAWING"'),
          updated_at = NOW()
      WHERE id = p_session_id;

      -- Bloquear mesa en 'ACTIVE' para cerrar permanentemente ventas
      IF v_session.table_id IS NOT NULL THEN
        UPDATE public.game_tables
        SET status = 'ACTIVE'::table_status_enum,
            updated_at = NOW()
        WHERE id = v_session.table_id AND status != 'ACTIVE'::table_status_enum;
      END IF;
      
      SELECT current_state INTO v_current_state FROM public.game_sessions WHERE id = p_session_id;
    ELSE
      RETURN jsonb_build_object('success', false, 'reason', 'NO_COUNTDOWN');
    END IF;
  ELSE
    v_current_state := v_session.current_state;
  END IF;
  
  IF v_current_state IS NULL THEN
    v_current_state := '{}'::jsonb;
  END IF;

  v_drawn_balls := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_current_state->'drawnBalls')::INT), '{}'::INT[]);
  v_total_balls := COALESCE((v_current_state->>'totalBalls')::INT, 90);
  v_last_drawn_at := (v_current_state->>'lastDrawnAt')::TIMESTAMPTZ;

  -- Validar tiempo entre bolas (mínimo 2 segundos)
  IF v_last_drawn_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_drawn_at));
    IF v_seconds_since_last < 2.0 THEN 
      RETURN jsonb_build_object('success', false, 'reason', 'TOO_FAST');
    END IF;
  END IF;

  IF array_length(v_drawn_balls, 1) >= v_total_balls THEN 
    RAISE EXCEPTION 'BINGO_COMPLETE';
  END IF;

  -- Generar bola aleatoria disponible
  SELECT array_agg(n) INTO v_available_balls FROM generate_series(1, v_total_balls) AS n WHERE NOT (n = ANY(v_drawn_balls));
  SELECT n INTO v_new_ball FROM unnest(v_available_balls) AS n ORDER BY random() LIMIT 1;

  -- Actualizar estado
  v_current_state := jsonb_set(v_current_state, '{currentBall}', to_jsonb(v_new_ball));
  v_current_state := jsonb_set(v_current_state, '{drawnBalls}', COALESCE(v_current_state->'drawnBalls', '[]'::jsonb) || to_jsonb(v_new_ball));
  v_current_state := jsonb_set(v_current_state, '{lastDrawnAt}', to_jsonb(NOW()));

  UPDATE public.game_sessions SET current_state = v_current_state, updated_at = NOW() WHERE id = p_session_id;

  -- Registrar acción de auditoría y propagación Realtime
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_sequence FROM public.game_actions WHERE session_id = p_session_id;
  v_action_payload := jsonb_build_object('ball_number', v_new_ball, 'drawn_at', NOW());
  v_state_hash := md5(v_action_payload::text || p_session_id::text || v_new_ball::text);

  INSERT INTO public.game_actions (session_id, user_id, action_type, payload, server_state_hash, idempotency_key, created_at, sequence_number)
  VALUES (p_session_id, '00000000-0000-0000-0000-000000000000'::uuid, 'DRAW_BALL', v_action_payload, v_state_hash, gen_random_uuid()::text, NOW(), v_next_sequence);

  RETURN jsonb_build_object('success', true, 'ball_number', v_new_ball);

EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;

-- 4. Actualizar buy_bingo_cards_secure con CANDADO ESTRICTO DE 10 SEGUNDOS
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
  v_countdown_ends_at TIMESTAMPTZ;
  v_seconds_left NUMERIC;
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

  -- 🔐 CANDADO ESTRICTO 1: Verificar cuenta regresiva en game_sessions
  SELECT countdown_ends_at, status::text INTO v_countdown_ends_at, v_session_status
  FROM public.game_sessions 
  WHERE table_id = p_game_table_id
  ORDER BY created_at DESC LIMIT 1;
  
  IF v_session_status IS NOT NULL AND v_session_status IN ('DRAWING', 'FINISHED', 'COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'El sorteo ya comenzó. No se pueden comprar más cartones.';
  END IF;

  IF v_countdown_ends_at IS NOT NULL THEN
    -- Calcular cuántos segundos faltan
    v_seconds_left := EXTRACT(EPOCH FROM (v_countdown_ends_at - NOW()));
    
    -- 👇 BLOQUEO ESTRICTO: Si faltan 10 segundos o menos, o ya inició
    IF v_seconds_left <= 10 THEN
      RAISE EXCEPTION 'VENTAS_CERRADAS: Las ventas de cartones se bloquean 10 segundos antes del sorteo.';
    END IF;
  END IF;

  -- 🔐 RATE LIMIT EN COMPRAS: Máximo 10 compras por minuto
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

  -- Bloquear compras si la mesa ya comenzó
  IF v_table.status IN ('FINISHED'::table_status_enum, 'CLOSED'::table_status_enum, 'ACTIVE'::table_status_enum) THEN
    RAISE EXCEPTION 'MESA_NO_DISPONIBLE: La partida ya comenzó o finalizó. No se pueden comprar más cartones.';
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

  -- 2. Calcular costos usando el precio autoritativo
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

  -- 7. Disparar verificación de inicio de cuenta regresiva (3 minutos si hay >= 2 jugadores)
  PERFORM public.check_and_start_bingo_countdown();

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'variant', p_variant,
    'card_count', p_card_count,
    'cards', v_new_cards,
    'total_cost', v_total_cost,
    'winner_pool', v_winner_pool,
    'system_fee', v_system_fee
  );
END;
$$;

-- 5. BLINDAR server_bingo_operation PARA QUE NUNCA FORZAR EL SORTEO ANTES DE TIEMPO
CREATE OR REPLACE FUNCTION public.server_bingo_operation(
  p_operation TEXT,
  p_session_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_operation = 'draw_ball' THEN
    -- Delegar estrictamente a reveal_next_bingo_ball que respeta la cuenta regresiva de 3 minutos
    RETURN public.reveal_next_bingo_ball(p_session_id);
  ELSE
    RAISE EXCEPTION 'INVALID_OPERATION: Operación no soportada';
  END IF;
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.check_and_start_bingo_countdown() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.reveal_next_bingo_ball(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.buy_bingo_cards_secure(UUID, INT, TEXT, NUMERIC, JSONB, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(TEXT, UUID, UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(UUID, TEXT, UUID) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
