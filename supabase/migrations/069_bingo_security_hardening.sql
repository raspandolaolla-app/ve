-- ==============================================================================
-- MIGRACIÓN 069: BINGO SECURITY HARDENING (AUDITORÍA OFENSIVA - CORRECCIONES)
-- ==============================================================================

-- 1. CRITICAL-01: Proteger `game_sessions` bloqueando accesos de escritura directos por el cliente
-- Se eliminan políticas de escritura abiertas para jugadores comunes en la tabla `game_sessions`
DROP POLICY IF EXISTS p_sessions_insert ON public.game_sessions;
DROP POLICY IF EXISTS p_sessions_update ON public.game_sessions;

-- Recrear las políticas restringiéndolas a operadores o service_role
CREATE POLICY p_sessions_insert ON public.game_sessions
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    public.is_operator_or_above(auth.uid())
    OR auth.role() = 'service_role'
  );

CREATE POLICY p_sessions_update ON public.game_sessions
  FOR UPDATE
  TO authenticated, service_role
  USING (
    public.is_operator_or_above(auth.uid())
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    public.is_operator_or_above(auth.uid())
    OR auth.role() = 'service_role'
  );


-- 2. HIGH-02: Restringir escritura en `bingo_winner_history`
-- Solo lectura (SELECT) permitida para clientes. Las escrituras deben correr únicamente del lado del servidor.
DROP POLICY IF EXISTS p_bingo_winner_history_all ON public.bingo_winner_history;


-- 3. PREPARAR COLUMNAS PARA IDEMPOTENCIA EN bingo_card_purchases (HIGH-05)
ALTER TABLE public.bingo_card_purchases ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

DROP INDEX IF EXISTS idx_bingo_card_purchases_idempotency;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bingo_card_purchases_idempotency 
  ON public.bingo_card_purchases(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;


-- 4. CRITICAL-02 & HIGH-03 & HIGH-05 & HIGH-06: Robustecer `buy_bingo_cards_secure`
-- - Descarta p_price_per_card proporcionado por el cliente y usa el valor autoritativo de la mesa.
-- - Implementa validación estricta de variante (75/80/90) de mesa contra cartón.
-- - Controla el límite acumulativo de 20 cartones por mesa por usuario para evitar re-compras maliciosas.
-- - Soporta idempotencia mediante p_idempotency_key.
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

  -- HIGH-05: Validación estricta del formato de variante
  IF p_variant NOT IN ('75', '80', '90') THEN
    RETURN jsonb_build_object('success', false, 'error', 'VARIANTE_BINGO_INVALIDA');
  END IF;

  IF p_card_count < 1 OR p_card_count > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANTIDAD_CARTONES_INVALIDA_MAX_20');
  END IF;

  -- HIGH-05: Validar idempotencia de compra antes de cualquier transacción
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

  -- 1. Bloquear Mesa y Verificar Estado & Ventas
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_game_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MESA_NO_ENCONTRADA');
  END IF;

  IF v_table.status IN ('FINISHED'::table_status_enum, 'CLOSED'::table_status_enum, 'ACTIVE'::table_status_enum) THEN
    RETURN jsonb_build_object('success', false, 'error', 'MESA_NO_DISPONIBLE: La partida ya comenzó o finalizó.');
  END IF;

  -- HIGH-06: Validación de variante autorizada de la mesa contra el cartón comprado
  v_config := COALESCE(v_table.config, '{}'::jsonb);
  v_table_variant := COALESCE(v_config->>'variant', '75');
  IF p_variant <> v_table_variant THEN
    RETURN jsonb_build_object('success', false, 'error', 'VARIANTE_BINGO_INVALIDA_MESA: El tipo de cartón no coincide con la variante autorizada de la mesa.');
  END IF;

  -- HIGH-03: Límite acumulativo de cartones por mesa (máximo 20 por usuario/mesa)
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
      RETURN jsonb_build_object('success', false, 'error', 'SALES_CLOSED: Ventas cerradas. El sorteo comenzará en menos de 10 segundos.');
    END IF;
  END IF;

  -- 2. CRITICAL-02: Calcular costos exclusivamente usando el precio autoritativo (v_table.entry_fee), ignorando p_price_per_card del cliente
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

  -- 4. Generar Cartones Únicos para el Usuario (Ignorar p_cards_data proveído por el cliente)
  FOR v_c IN 1..p_card_count LOOP
    v_card_item := public.generate_single_bingo_card_jsonb(p_variant, p_game_table_id, v_c);
    v_new_cards := v_new_cards || jsonb_build_array(v_card_item);
  END FOR;

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
  -- Si la mesa tiene al menos 2 jugadores y el temporizador no ha iniciado, iniciarlo
  IF (v_table.current_players_count + (CASE WHEN v_player_exists THEN 0 ELSE 1 END)) >= 2 THEN
    IF (v_config->>'scheduled_start_at') IS NULL THEN
      -- Determinar si hay más de 100 usuarios (por configuración o conteo)
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

-- Otorgar permisos de ejecución de manera compatible
GRANT EXECUTE ON FUNCTION public.buy_bingo_cards_secure(UUID, INT, TEXT, NUMERIC, JSONB, TEXT) TO authenticated, service_role;


-- 5. HIGH-01: Robustecer `rpc_draw_bingo_ball_secure` contra suplantación del anfitrión en mesas automáticas/sistema
CREATE OR REPLACE FUNCTION public.rpc_draw_bingo_ball_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_current_state JSONB;
  v_drawn_balls INT[];
  v_total_balls INT;
  v_available INT[];
  v_next_ball INT;
  v_idx INT;
  v_event_id TEXT;
  v_commitment_hash TEXT;
  v_new_seq INT;
  v_result_json JSONB;
  v_idempotency_key TEXT;
  v_existing_event RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  v_idempotency_key := COALESCE(p_idempotency_key, 'draw_ball_' || p_session_id::text || '_' || encode(gen_random_bytes(6), 'hex'));

  -- Validar idempotencia primero
  SELECT * INTO v_existing_event
  FROM public.rng_events
  WHERE session_id = p_session_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent', true,
      'ball', (v_existing_event.result->>'ball')::INT,
      'event_id', v_existing_event.event_id,
      'commitment_hash', v_existing_event.commitment_hash
    );
  END IF;

  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  -- Restringir extracción únicamente al Host / Creador de la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = v_session.table_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MESA_DE_JUEGO_NO_ENCONTRADA');
  END IF;

  -- HIGH-01: Evitar desvíos/bypasses. Validamos que el emisor sea el host de la mesa, el creador, operador, o service_role.
  IF NOT (
    (v_table.host_user_id IS NOT NULL AND v_user_id = v_table.host_user_id)
    OR (v_table.host_user_id IS NULL AND v_table.created_by IS NOT NULL AND v_user_id = v_table.created_by)
    OR public.is_operator_or_above(v_user_id)
    OR auth.role() = 'service_role'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'HOST_ONLY: Solo el anfitrión legítimo de la mesa o el sistema puede extraer balotas.');
  END IF;

  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_total_balls := COALESCE((v_current_state->>'totalBalls')::INT, 75);

  -- Extraer bolas ya jugadas
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_current_state->'drawnBalls', '[]'::jsonb))::INT)
  INTO v_drawn_balls;

  -- Calcular balotas disponibles
  SELECT ARRAY(
    SELECT s FROM generate_series(1, v_total_balls) s
    WHERE NOT (s = ANY(v_drawn_balls))
  ) INTO v_available;

  IF array_length(v_available, 1) IS NULL OR array_length(v_available, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Se han extraído todas las balotas de la balotera.'
    );
  END IF;

  -- Seleccionar bola usando RNG seguro
  v_idx := public.fn_secure_rng_int(1, array_length(v_available, 1));
  v_next_ball := v_available[v_idx];

  v_event_id := 'rng_bingo_' || encode(gen_random_bytes(8), 'hex');
  v_commitment_hash := encode(digest(p_session_id::text || '_' || v_next_ball::text || '_' || v_event_id, 'sha256'), 'hex');

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_new_seq
  FROM public.rng_events WHERE session_id = p_session_id;

  v_result_json := jsonb_build_object(
    'ball', v_next_ball,
    'total_drawn', array_length(v_drawn_balls, 1) + 1,
    'drawn_by', v_user_id
  );

  -- Registrar auditoría RNG
  INSERT INTO public.rng_events (
    event_id,
    session_id,
    table_id,
    user_id,
    game_type,
    event_type,
    sequence_number,
    result,
    commitment_hash,
    idempotency_key
  ) VALUES (
    v_event_id,
    p_session_id,
    v_session.table_id,
    v_user_id,
    v_session.game_type,
    'DRAW_BINGO_BALL',
    v_new_seq,
    v_result_json,
    v_commitment_hash,
    v_idempotency_key
  );

  -- Actualizar estado de la partida
  v_drawn_balls := array_append(v_drawn_balls, v_next_ball);
  v_current_state := jsonb_set(v_current_state, '{drawnBalls}', to_jsonb(v_drawn_balls));
  v_current_state := jsonb_set(v_current_state, '{currentBall}', to_jsonb(v_next_ball));

  UPDATE public.game_sessions
  SET current_state = v_current_state,
      updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_idempotent', false,
    'ball', v_next_ball,
    'event_id', v_event_id,
    'commitment_hash', v_commitment_hash
  );
END;
$$;


-- 6. HIGH-04: Robustecer `rpc_claim_bingo_secure` para validar todos los cartones comprados por el usuario
CREATE OR REPLACE FUNCTION public.rpc_claim_bingo_secure(
  p_session_id UUID,
  p_card_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_current_state JSONB;
  v_drawn_balls INT[];
  v_variant TEXT;
  v_purchase RECORD;
  v_user_cards JSONB;
  v_valid_bingo BOOLEAN := false;
  v_total_sales NUMERIC(14,2) := 0;
  v_winner_pool NUMERIC(14,2) := 0;
  v_wallet_id UUID;
  v_winner_profile RECORD;
  v_winner_name TEXT;
  v_winner_avatar TEXT;
  v_has_purchased BOOLEAN := false;
  v_card_item JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  -- 1. Bloquear la Sesión para Garantizar UN SOLO Ganador Atómico
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);

  -- Si la partida ya fue reclamada y tiene ganador
  IF (v_current_state->>'winnerUserId') IS NOT NULL AND (v_current_state->>'winnerUserId') <> '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'claimed_already', true,
      'winner_user_id', v_current_state->>'winnerUserId',
      'error', 'El bingo ya fue reclamado y verificado por otro jugador.'
    );
  END IF;

  -- Extraer balotas jugadas
  SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_current_state->'drawnBalls', '[]'::jsonb))::INT)
  INTO v_drawn_balls;

  v_variant := COALESCE(v_current_state->>'variant', '75');

  -- HIGH-04: Verificar si el usuario compró cartones en algún momento para esta mesa
  SELECT EXISTS (
    SELECT 1 FROM public.bingo_card_purchases
    WHERE game_table_id = v_session.table_id AND user_id = v_user_id
  ) INTO v_has_purchased;

  IF NOT v_has_purchased THEN
    RETURN jsonb_build_object('success', false, 'error', 'CARTON_NO_ENCONTRADO: No posees cartones registrados para esta mesa.');
  END IF;

  -- 3. Validar Canto de Bingo en Servidor (100% Server-Authoritative)
  IF array_length(v_drawn_balls, 1) IS NULL OR array_length(v_drawn_balls, 1) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANTO_FALSO: Se han extraído muy pocas balotas para completar Bingo.');
  END IF;

  -- HIGH-04: Iterar sobre todas las compras y todos los cartones de cada una para validar si alguno es ganador
  FOR v_purchase IN 
    SELECT cards_data FROM public.bingo_card_purchases
    WHERE game_table_id = v_session.table_id AND user_id = v_user_id
  LOOP
    FOR v_card_item IN SELECT jsonb_array_elements(v_purchase.cards_data) LOOP
      -- Si se especifica p_card_id, podemos opcionalmente validar ese específico, pero la regla general
      -- es permitir que valide contra todos los que compró el usuario para maximizar consistencia.
      IF public.fn_validate_bingo_card_win(v_card_item, v_variant, v_drawn_balls) THEN
        v_valid_bingo := true;
        EXIT;
      END IF;
    END LOOP;
    IF v_valid_bingo THEN
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_valid_bingo THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANTO_FALSO: Tus cartones no completan un Bingo válido con las balotas extraídas.');
  END IF;

  -- 4. Calcular Pozo Total y Otorgar Premio (90% al Ganador)
  SELECT COALESCE(SUM(total_cost), 0) INTO v_total_sales
  FROM public.bingo_card_purchases
  WHERE game_table_id = v_session.table_id;

  v_winner_pool := ROUND(v_total_sales * 0.90, 2);
  
  -- Si el pozo total es 0, usar el valor por defecto del cartón comprado por el ganador
  IF v_winner_pool <= 0 THEN
    SELECT COALESCE(SUM(total_cost), 0) INTO v_total_sales
    FROM public.bingo_card_purchases
    WHERE game_table_id = v_session.table_id AND user_id = v_user_id;
    v_winner_pool := ROUND(v_total_sales * 0.90, 2);
  END IF;

  -- Actualizar billetera del ganador
  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, available_balance, held_balance)
    VALUES (v_user_id, v_winner_pool, 0.00)
    RETURNING id INTO v_wallet_id;
  ELSE
    UPDATE public.wallets
    SET available_balance = available_balance + v_winner_pool,
        updated_at = NOW()
    WHERE id = v_wallet_id;
  END IF;

  -- Ledger de Abono de Premio
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
    v_winner_pool,
    'GAME_PRIZE_PAYOUT',
    'bingo_sessions',
    p_session_id::text,
    'bingo_prize_' || p_session_id::text || '_' || v_user_id::text,
    'Premio de Bingo ' || v_variant || ' Bolas (90% pozo)'
  );

  -- Obtener Perfil del Ganador
  SELECT first_name, last_name, avatar_url INTO v_winner_profile
  FROM public.profiles
  WHERE user_id = v_user_id;

  v_winner_name := TRIM(COALESCE(v_winner_profile.first_name || ' ' || v_winner_profile.last_name, 'Jugador Bingo'));
  v_winner_avatar := v_winner_profile.avatar_url;

  -- 5. Actualizar Estado de la Sesión y Mesa
  v_current_state := v_current_state || jsonb_build_object(
    'status', 'bingo_won',
    'winnerUserId', v_user_id,
    'winnerName', v_winner_name,
    'winnerAvatar', v_winner_avatar,
    'winnerPoolBs', v_winner_pool
  );

  UPDATE public.game_sessions
  SET current_state = v_current_state,
      updated_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'FINISHED'::table_status_enum,
      finished_at = NOW(),
      updated_at = NOW()
  WHERE id = v_session.table_id;

  -- 6. Registrar Historial de Ganador Público (Realtime)
  -- Nota: Esto ahora se hace de forma segura únicamente por este canal de base de datos
  INSERT INTO public.bingo_winner_history (
    session_id,
    user_id,
    winner_name,
    prize_bs,
    photo_url
  ) VALUES (
    p_session_id,
    v_user_id,
    v_winner_name,
    v_winner_pool,
    v_winner_avatar
  );

  -- Registrar Historial de Partidas General
  INSERT INTO public.public_match_history (
    game_type,
    table_id,
    session_id,
    winner_user_id,
    winner_name_snapshot,
    winner_avatar_snapshot,
    result_summary
  ) VALUES (
    'BINGO'::game_type_enum,
    v_session.table_id,
    p_session_id,
    v_user_id,
    v_winner_name,
    v_winner_avatar,
    '¡BINGO! Ganador del Sorteo ' || v_variant || ' Bolas (' || v_winner_pool || ' Bs)'
  );

  RETURN jsonb_build_object(
    'success', true,
    'winner_user_id', v_user_id,
    'winner_name', v_winner_name,
    'winner_avatar', v_winner_avatar,
    'prize_bs', v_winner_pool,
    'variant', v_variant,
    'message', '¡Felicidades! Se te ha acreditado el premio de ' || v_winner_pool || ' Bs.'
  );
END;
$$;


-- Notificar cambios al motor de postgrest
NOTIFY pgrst, 'reload schema';
