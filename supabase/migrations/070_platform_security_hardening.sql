-- ==============================================================================
-- 🔐 MIGRACIÓN 070: PLATFORM GENERAL SECURITY HARDENING & RATE LIMITING
-- ==============================================================================
-- Esta migración implementa seguridad general y protección proactiva contra
-- ataques de denegación de servicio (DoS) y fuerza bruta en Supabase,
-- agregando un motor de Rate Limiting transaccional y concurrent-safe.
-- ==============================================================================

-- 1. Crear tabla de Rate Limits para asentar hits por usuario y acción
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,
  hits INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Forzar RLS en la tabla de rate limits (Deny by Default)
-- Clientes no tienen políticas de SELECT, INSERT, UPDATE, DELETE directos.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;

-- 2. Crear función de verificación de Rate Limiting
-- SECURITY DEFINER para que pueda escribir en public.rate_limits sin políticas públicas
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action TEXT,
  p_user_id TEXT,
  p_max_hits INT,
  p_window_interval INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
  v_hits INT;
  v_reset_at TIMESTAMP WITH TIME ZONE;
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  v_key := COALESCE(p_user_id, 'anonymous') || ':' || p_action;

  -- Intentamos consultar el registro actual
  SELECT hits, reset_at INTO v_hits, v_reset_at
  FROM public.rate_limits
  WHERE key = v_key;

  IF NOT FOUND THEN
    -- Crear entrada inicial de hit
    INSERT INTO public.rate_limits (key, hits, reset_at)
    VALUES (v_key, 1, v_now + p_window_interval)
    ON CONFLICT (key) DO UPDATE
    SET hits = public.rate_limits.hits + 1;
    RETURN TRUE;
  ELSIF v_now > v_reset_at THEN
    -- Ventana expirada, reiniciamos conteo
    UPDATE public.rate_limits
    SET hits = 1, reset_at = v_now + p_window_interval
    WHERE key = v_key;
    RETURN TRUE;
  ELSIF v_hits < p_max_hits THEN
    -- Incrementamos hit
    UPDATE public.rate_limits
    SET hits = hits + 1
    WHERE key = v_key;
    RETURN TRUE;
  ELSE
    -- Límite excedido
    RETURN FALSE;
  END IF;
END;
$$;

-- Otorgar ejecución a authenticated y service_role de forma explícita
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INTERVAL) TO authenticated, service_role;


-- 3. SOBREESCRITURA DE FUNCIONES CRÍTICAS PARA INTEGRAR EL RATE LIMIT

-- A. buy_bingo_cards_secure (Protección de Compras de Bingo contra DoS)
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

  -- 🔐 RATE LIMIT EN COMPRAS: Máximo 10 compras por minuto (60 segundos)
  IF NOT public.check_rate_limit('buy_bingo_cards', v_user_id::text, 10, INTERVAL '60 seconds') THEN
    RETURN jsonb_build_object('success', false, 'error', 'RATE_LIMIT_EXCEEDED: Has realizado demasiadas transacciones en poco tiempo. Espera un momento.');
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

GRANT EXECUTE ON FUNCTION public.buy_bingo_cards_secure(UUID, INT, TEXT, NUMERIC, JSONB, TEXT) TO authenticated, service_role;


-- B. rpc_claim_bingo_secure (Protección de Reclamos contra Spam de Solicitudes)
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

  -- 🔐 RATE LIMIT EN RECLAMO: Máximo 3 intentos de reclamo por minuto (60 segundos)
  IF NOT public.check_rate_limit('claim_bingo', v_user_id::text, 3, INTERVAL '60 seconds') THEN
    RETURN jsonb_build_object('success', false, 'error', 'RATE_LIMIT_EXCEEDED: Has excedido la tasa de intentos de reclamo de Bingo. Por favor espera un momento.');
  END IF;

  -- 1. Bloquear la Sesión para Garantizar UN Solo Ganador Atómico
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

GRANT EXECUTE ON FUNCTION public.rpc_claim_bingo_secure(UUID, UUID) TO authenticated, service_role;


-- Notificar cambios para recarga de esquemas
NOTIFY pgrst, 'reload schema';
