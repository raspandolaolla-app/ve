-- ==============================================================================
-- MIGRACIÓN 068: "BINGO LA OLLA" MASTER UPGRADE
-- Autoridad del Servidor, Validación Atómica, Historial y Foto de Ganadores
-- ==============================================================================

-- 1. Tabla de Historial de Ganadores de Bingo ("Bingo La Olla")
CREATE TABLE IF NOT EXISTS public.bingo_winner_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  winner_name TEXT NOT NULL,
  prize_bs NUMERIC(14,2) NOT NULL,
  photo_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.bingo_winner_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_winner_history FORCE ROW LEVEL SECURITY;

-- Políticas de Seguridad RLS
DROP POLICY IF EXISTS p_bingo_winner_history_select ON public.bingo_winner_history;
CREATE POLICY p_bingo_winner_history_select ON public.bingo_winner_history
  FOR SELECT TO anon, authenticated, service_role USING (true);

DROP POLICY IF EXISTS p_bingo_winner_history_all ON public.bingo_winner_history;
CREATE POLICY p_bingo_winner_history_all ON public.bingo_winner_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agregar a Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'bingo_winner_history'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.bingo_winner_history;
    END IF;
  END IF;
END $$;


-- 2. Función de Validación Server-Authoritative de Cartón Ganador de Bingo (fn_validate_bingo_card_win)
CREATE OR REPLACE FUNCTION public.fn_validate_bingo_card_win(
  p_card JSONB,
  p_variant TEXT,
  p_drawn_balls INT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b INT[]; v_i INT[]; v_n TEXT[]; v_g INT[]; v_o INT[];
  v_grid JSONB;
  v_numbers INT[];
  v_row_idx INT;
  v_col_idx INT;
  v_row_drawn BOOLEAN;
  v_col_drawn BOOLEAN;
  v_diag_drawn1 BOOLEAN;
  v_diag_drawn2 BOOLEAN;
  v_val_int INT;
BEGIN
  IF p_variant = '75' THEN
    -- Extraer columnas como arreglos
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_card->'b', '[]'::jsonb))::INT) INTO v_b;
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_card->'i', '[]'::jsonb))::INT) INTO v_i;
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_card->'n', '[]'::jsonb))) INTO v_n;
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_card->'g', '[]'::jsonb))::INT) INTO v_g;
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_card->'o', '[]'::jsonb))::INT) INTO v_o;

    -- Verificar filas horizontales (1 a 5)
    FOR v_row_idx IN 1..5 LOOP
      v_row_drawn := true;
      IF NOT (v_b[v_row_idx] = ANY(p_drawn_balls)) THEN v_row_drawn := false; END IF;
      IF NOT (v_i[v_row_idx] = ANY(p_drawn_balls)) THEN v_row_drawn := false; END IF;
      IF v_row_idx <> 3 THEN
        IF NOT (v_n[v_row_idx]::INT = ANY(p_drawn_balls)) THEN v_row_drawn := false; END IF;
      END IF;
      IF NOT (v_g[v_row_idx] = ANY(p_drawn_balls)) THEN v_row_drawn := false; END IF;
      IF NOT (v_o[v_row_idx] = ANY(p_drawn_balls)) THEN v_row_drawn := false; END IF;

      IF v_row_drawn THEN RETURN true; END IF;
    END LOOP;

    -- Verificar columnas verticales (1 a 5)
    -- Columna B
    v_col_drawn := true;
    FOR v_row_idx IN 1..5 LOOP
      IF NOT (v_b[v_row_idx] = ANY(p_drawn_balls)) THEN v_col_drawn := false; END IF;
    END LOOP;
    IF v_col_drawn THEN RETURN true; END IF;

    -- Columna I
    v_col_drawn := true;
    FOR v_row_idx IN 1..5 LOOP
      IF NOT (v_i[v_row_idx] = ANY(p_drawn_balls)) THEN v_col_drawn := false; END IF;
    END LOOP;
    IF v_col_drawn THEN RETURN true; END IF;

    -- Columna N (el elemento central de la fila 3 es FREE)
    v_col_drawn := true;
    FOR v_row_idx IN 1..5 LOOP
      IF v_row_idx <> 3 THEN
        IF NOT (v_n[v_row_idx]::INT = ANY(p_drawn_balls)) THEN v_col_drawn := false; END IF;
      END IF;
    END LOOP;
    IF v_col_drawn THEN RETURN true; END IF;

    -- Columna G
    v_col_drawn := true;
    FOR v_row_idx IN 1..5 LOOP
      IF NOT (v_g[v_row_idx] = ANY(p_drawn_balls)) THEN v_col_drawn := false; END IF;
    END LOOP;
    IF v_col_drawn THEN RETURN true; END IF;

    -- Columna O
    v_col_drawn := true;
    FOR v_row_idx IN 1..5 LOOP
      IF NOT (v_o[v_row_idx] = ANY(p_drawn_balls)) THEN v_col_drawn := false; END IF;
    END LOOP;
    IF v_col_drawn THEN RETURN true; END IF;

    -- Diagonal 1 (De arriba-izquierda a abajo-derecha)
    v_diag_drawn1 := true;
    IF NOT (v_b[1] = ANY(p_drawn_balls)) THEN v_diag_drawn1 := false; END IF;
    IF NOT (v_i[2] = ANY(p_drawn_balls)) THEN v_diag_drawn1 := false; END IF;
    IF NOT (v_g[4] = ANY(p_drawn_balls)) THEN v_diag_drawn1 := false; END IF;
    IF NOT (v_o[5] = ANY(p_drawn_balls)) THEN v_diag_drawn1 := false; END IF;
    IF v_diag_drawn1 THEN RETURN true; END IF;

    -- Diagonal 2 (De arriba-derecha a abajo-izquierda)
    v_diag_drawn2 := true;
    IF NOT (v_o[1] = ANY(p_drawn_balls)) THEN v_diag_drawn2 := false; END IF;
    IF NOT (v_g[2] = ANY(p_drawn_balls)) THEN v_diag_drawn2 := false; END IF;
    IF NOT (v_i[4] = ANY(p_drawn_balls)) THEN v_diag_drawn2 := false; END IF;
    IF NOT (v_b[5] = ANY(p_drawn_balls)) THEN v_diag_drawn2 := false; END IF;
    IF v_diag_drawn2 THEN RETURN true; END IF;

  ELSIF p_variant = '80' THEN
    v_grid := p_card->'grid';
    
    -- Verificar filas horizontales
    FOR v_row_idx IN 0..3 LOOP
      v_row_drawn := true;
      FOR v_col_idx IN 0..3 LOOP
        v_val_int := (v_grid->v_col_idx->v_row_idx)::INT;
        IF NOT (v_val_int = ANY(p_drawn_balls)) THEN v_row_drawn := false; END IF;
      END LOOP;
      IF v_row_drawn THEN RETURN true; END IF;
    END LOOP;

    -- Verificar columnas verticales
    FOR v_col_idx IN 0..3 LOOP
      v_col_drawn := true;
      FOR v_row_idx IN 0..3 LOOP
        v_val_int := (v_grid->v_col_idx->v_row_idx)::INT;
        IF NOT (v_val_int = ANY(p_drawn_balls)) THEN v_col_drawn := false; END IF;
      END LOOP;
      IF v_col_drawn THEN RETURN true; END IF;
    END LOOP;

    -- Diagonal 1
    v_diag_drawn1 := true;
    FOR v_row_idx IN 0..3 LOOP
      v_val_int := (v_grid->v_row_idx->v_row_idx)::INT;
      IF NOT (v_val_int = ANY(p_drawn_balls)) THEN v_diag_drawn1 := false; END IF;
    END LOOP;
    IF v_diag_drawn1 THEN RETURN true; END IF;

    -- Diagonal 2
    v_diag_drawn2 := true;
    FOR v_row_idx IN 0..3 LOOP
      v_val_int := (v_grid->v_row_idx->(3 - v_row_idx))::INT;
      IF NOT (v_val_int = ANY(p_drawn_balls)) THEN v_diag_drawn2 := false; END IF;
    END LOOP;
    IF v_diag_drawn2 THEN RETURN true; END IF;

  ELSIF p_variant = '90' THEN
    -- En Bingo 90 el cartón gana al completarse todos sus 15 números (Full House)
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_card->'numbers', '[]'::jsonb))::INT) INTO v_numbers;
    IF array_length(v_numbers, 1) IS NOT NULL THEN
      FOR v_col_idx IN 1..array_length(v_numbers, 1) LOOP
        IF NOT (v_numbers[v_col_idx] = ANY(p_drawn_balls)) THEN
          RETURN false;
        END IF;
      END LOOP;
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;


-- 3. Actualizar la RPC de Reclamo Atómico de Bingo con Validación Real y Registro en Historial
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
  v_table RECORD;
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

  -- 2. Obtener Cartones del Usuario para esta Mesa
  SELECT * INTO v_purchase
  FROM public.bingo_card_purchases
  WHERE game_table_id = v_session.table_id AND user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'CARTON_NO_ENCONTRADO: No posees cartones registrados para esta mesa.');
  END IF;

  v_user_cards := v_purchase.cards_data;

  -- 3. Validar Canto de Bingo en Servidor (100% Server-Authoritative)
  IF array_length(v_drawn_balls, 1) IS NULL OR array_length(v_drawn_balls, 1) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANTO_FALSO: Se han extraído muy pocas balotas para completar Bingo.');
  END IF;

  -- Recorrer todos los cartones comprados por el usuario para validar si alguno completa Bingo
  FOR v_card_item IN SELECT jsonb_array_elements(v_user_cards) LOOP
    IF public.fn_validate_bingo_card_win(v_card_item, v_variant, v_drawn_balls) THEN
      v_valid_bingo := true;
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
  IF v_winner_pool <= 0 THEN
    v_winner_pool := ROUND(v_purchase.total_cost * 0.90, 2);
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

  -- 6. Registrar Historial Público de Partidas (Normal)
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

  -- 7. Registrar en el Historial Dedicado de Bingo con Autolimpieza
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
    NULL
  );

  -- Limpieza automática de registros antiguos de Bingo (> 7 días)
  DELETE FROM public.bingo_winner_history WHERE created_at < NOW() - INTERVAL '7 days';

  -- Limpieza automática de registros excedentes (> 100 ganadores)
  DELETE FROM public.bingo_winner_history
  WHERE id NOT IN (
    SELECT id FROM public.bingo_winner_history
    ORDER BY created_at DESC
    LIMIT 100
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


-- 4. RPC para el Registro Seguro de la Foto de Victoria
CREATE OR REPLACE FUNCTION public.rpc_register_bingo_winner_photo(
  p_session_id UUID,
  p_photo_url TEXT
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);

  IF (v_current_state->>'winnerUserId') IS NULL OR (v_current_state->>'winnerUserId') <> v_user_id::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'SOLO_EL_GANADOR_PUEDE_REGISTRAR_SU_FOTO');
  END IF;

  -- Actualizar el estado de la sesión
  v_current_state := v_current_state || jsonb_build_object(
    'winnerPhotoUrl', p_photo_url
  );

  UPDATE public.game_sessions
  SET current_state = v_current_state,
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Actualizar el historial dedicado de ganadores
  UPDATE public.bingo_winner_history
  SET photo_url = p_photo_url
  WHERE session_id = p_session_id AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true, 'photo_url', p_photo_url);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_register_bingo_winner_photo(UUID, TEXT) TO authenticated, service_role;


-- 5. Actualizar la RPC de Extracción para Garantizar HOST-ONLY
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
  v_idempotency_key TEXT;
  v_existing_event RECORD;
  v_current_state JSONB;
  v_drawn_balls INT[];
  v_total_balls INT;
  v_available INT[];
  v_idx INT;
  v_next_ball INT;
  v_event_id TEXT;
  v_commitment_hash TEXT;
  v_new_seq INT;
  v_result_json JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  v_idempotency_key := COALESCE(p_idempotency_key, 'draw_ball_' || p_session_id || '_' || now());

  -- Idempotencia
  SELECT * INTO v_existing_event FROM public.rng_events WHERE idempotency_key = v_idempotency_key;
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

  IF v_table.host_user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'HOST_ONLY: Solo el anfitrión de la mesa puede extraer balotas.');
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

GRANT EXECUTE ON FUNCTION public.rpc_draw_bingo_ball_secure(UUID, TEXT) TO authenticated, service_role;


-- 6. Crear bucket de storage "bingo-winners" si no existe y habilitar políticas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bingo-winners', 'bingo-winners', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Permitir lectura pública de fotos de ganadores
DROP POLICY IF EXISTS "Permitir lectura pública de fotos de ganadores" ON storage.objects;
CREATE POLICY "Permitir lectura pública de fotos de ganadores" ON storage.objects
  FOR SELECT USING (bucket_id = 'bingo-winners');

-- Permitir inserción de fotos por usuarios autenticados
DROP POLICY IF EXISTS "Permitir insertar fotos de ganadores" ON storage.objects;
CREATE POLICY "Permitir insertar fotos de ganadores" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bingo-winners');


-- Recargar esquema de PostgREST para aplicar los cambios de inmediato
NOTIFY pgrst, 'reload schema';
