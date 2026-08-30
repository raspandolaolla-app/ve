-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 059: SISTEMA DE RNG CRIPTOGRÁFICAMENTE SEGURO
-- ==============================================================================
-- Servidor como fuente de verdad (Server-Authoritative RNG) utilizando pgcrypto,
-- gen_random_bytes(), tabla de eventos auditables, idempotencia y compromiso criptográfico.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABLA DE AUDITORÍA Y EVENTOS RNG INMUTABLES
CREATE TABLE IF NOT EXISTS public.rng_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(64) UNIQUE NOT NULL,
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.game_tables(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  game_type public.game_type_enum NOT NULL,
  event_type VARCHAR(64) NOT NULL, -- 'ROLL_DICE', 'SHUFFLE_DECK', 'DRAW_BALL', 'DEAL_TILES', 'DRAW_POLLA_RESULT'
  sequence_number INT NOT NULL DEFAULT 1,
  result JSONB NOT NULL,
  commitment_hash VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de alto rendimiento para auditoría e idempotencia
CREATE INDEX IF NOT EXISTS idx_rng_events_session_id ON public.rng_events(session_id);
CREATE INDEX IF NOT EXISTS idx_rng_events_idempotency_key ON public.rng_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_rng_events_game_type ON public.rng_events(game_type);

-- RLS para rng_events
ALTER TABLE public.rng_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Jugadores pueden leer eventos RNG de sus partidas" ON public.rng_events;
CREATE POLICY "Jugadores pueden leer eventos RNG de sus partidas"
  ON public.rng_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_table_players tp
      JOIN public.game_sessions gs ON gs.table_id = tp.table_id
      WHERE gs.id = rng_events.session_id
        AND tp.user_id = auth.uid()
    ) OR public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'SUPER_ADMIN') OR public.has_role(auth.uid(), 'OPERATOR')
  );

-- 2. FUNCIONES DE RNG CRIPTOGRÁFICAMENTE SEGURO (PL/pgSQL + pgcrypto)

-- Genera un entero en el rango [p_min, p_max] sin sesgo utilizando gen_random_bytes
CREATE OR REPLACE FUNCTION public.fn_secure_rng_int(p_min INT, p_max INT)
RETURNS INT AS $$
DECLARE
  v_range BIGINT;
  v_random_bytes BYTEA;
  v_random_uint32 BIGINT;
  v_result INT;
BEGIN
  IF p_min >= p_max THEN
    RETURN p_min;
  END IF;

  v_range := (p_max - p_min + 1)::BIGINT;
  v_random_bytes := gen_random_bytes(4);
  
  -- Convertir 4 bytes a entero de 32-bit sin signo
  v_random_uint32 := (get_byte(v_random_bytes, 0)::BIGINT << 24) |
                     (get_byte(v_random_bytes, 1)::BIGINT << 16) |
                     (get_byte(v_random_bytes, 2)::BIGINT << 8)  |
                     (get_byte(v_random_bytes, 3)::BIGINT);

  v_result := p_min + (v_random_uint32 % v_range);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- Mezcla un arreglo JSONB utilizando el algoritmo Fisher-Yates criptográficamente seguro
CREATE OR REPLACE FUNCTION public.fn_secure_rng_shuffle_jsonb(p_array JSONB)
RETURNS JSONB AS $$
DECLARE
  v_len INT;
  v_i INT;
  v_j INT;
  v_temp JSONB;
  v_elements JSONB[];
BEGIN
  v_len := jsonb_array_length(p_array);
  IF v_len <= 1 THEN
    RETURN p_array;
  END IF;

  -- Convertir JSONB array a arreglo Postgres
  FOR v_i IN 0..(v_len - 1) LOOP
    v_elements[v_i + 1] := p_array->v_i;
  END LOOP;

  -- Fisher-Yates shuffle con gen_random_bytes
  FOR v_i IN REVERSE v_len..2 LOOP
    v_j := public.fn_secure_rng_int(1, v_i);
    v_temp := v_elements[v_i];
    v_elements[v_i] := v_elements[v_j];
    v_elements[v_j] := v_temp;
  END LOOP;

  RETURN to_jsonb(v_elements);
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;


-- 3. RPC DE LANZAMIENTO DE DADOS SERVER-AUTHORITATIVE (ATRAPAÍTO / PARCHÍS)
CREATE OR REPLACE FUNCTION public.rpc_roll_dice_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_idempotency_key TEXT;
  v_existing_event RECORD;
  v_dice_value INT;
  v_event_id TEXT;
  v_commitment_hash TEXT;
  v_new_seq INT;
  v_current_state JSONB;
  v_result_json JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  v_idempotency_key := COALESCE(p_idempotency_key, 'roll_' || p_session_id || '_' || v_user_id || '_' || now());

  -- Verificar si el evento ya se procesó (Idempotencia)
  SELECT * INTO v_existing_event FROM public.rng_events WHERE idempotency_key = v_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent', true,
      'dice_value', (v_existing_event.result->>'dice_value')::INT,
      'event_id', v_existing_event.event_id,
      'commitment_hash', v_existing_event.commitment_hash
    );
  END IF;

  -- Obtener sesión de juego
  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión de juego no encontrada.';
  END IF;

  IF v_session.status NOT IN ('ACTIVE', 'STARTING', 'READY') THEN
    RAISE EXCEPTION 'La partida no se encuentra activa.';
  END IF;

  -- Generar valor de dado seguro 1..6
  v_dice_value := public.fn_secure_rng_int(1, 6);
  v_event_id := 'rng_dice_' || encode(gen_random_bytes(8), 'hex');
  v_commitment_hash := encode(digest(p_session_id::text || '_' || v_idempotency_key || '_' || v_dice_value::text, 'sha256'), 'hex');

  -- Obtener siguiente secuencia
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_new_seq
  FROM public.rng_events WHERE session_id = p_session_id;

  v_result_json := jsonb_build_object(
    'dice_value', v_dice_value,
    'rolled_by', v_user_id,
    'timestamp', now()
  );

  -- Registrar evento RNG inmutable
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
    'ROLL_DICE',
    v_new_seq,
    v_result_json,
    v_commitment_hash,
    v_idempotency_key
  );

  -- Actualizar estado público de la sesión
  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_current_state := jsonb_set(v_current_state, '{diceValue}', to_jsonb(v_dice_value));
  v_current_state := jsonb_set(v_current_state, '{lastRngEventId}', to_jsonb(v_event_id));

  UPDATE public.game_sessions
  SET current_state = v_current_state,
      turn_deadline_at = now() + INTERVAL '30 seconds',
      updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'is_idempotent', false,
    'dice_value', v_dice_value,
    'event_id', v_event_id,
    'commitment_hash', v_commitment_hash
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;


-- 4. RPC DE EXTRACCIÓN DE BOLA BINGO SERVER-AUTHORITATIVE
CREATE OR REPLACE FUNCTION public.rpc_draw_bingo_ball_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
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
    RAISE EXCEPTION 'Usuario no autenticado.';
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
    RAISE EXCEPTION 'Sesión de juego no encontrada.';
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
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;


-- 5. RPC DE REPARTO INICIAL SERVER-AUTHORITATIVE PARA DOMINÓ VENEZOLANO
CREATE OR REPLACE FUNCTION public.rpc_start_domino_round_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_idempotency_key TEXT;
  v_existing_event RECORD;
  v_all_tiles JSONB;
  v_shuffled JSONB;
  v_event_id TEXT;
  v_commitment_hash TEXT;
  v_current_state JSONB;
  v_players UUID[];
  v_hands JSONB;
  v_i INT;
  v_hand_tiles JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  v_idempotency_key := COALESCE(p_idempotency_key, 'domino_deal_' || p_session_id);

  SELECT * INTO v_existing_event FROM public.rng_events WHERE idempotency_key = v_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'is_idempotent', true, 'result', v_existing_event.result);
  END IF;

  SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión de juego no encontrada.';
  END IF;

  -- Construir las 28 fichas del Dominó Venezolano [[0,0], [0,1]...[6,6]]
  v_all_tiles := '[
    [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],
    [1,1],[1,2],[1,3],[1,4],[1,5],[1,6],
    [2,2],[2,3],[2,4],[2,5],[2,6],
    [3,3],[3,4],[3,5],[3,6],
    [4,4],[4,5],[4,6],
    [5,5],[5,6],
    [6,6]
  ]'::jsonb;

  -- Mezclar fichas con RNG criptográficamente seguro
  v_shuffled := public.fn_secure_rng_shuffle_jsonb(v_all_tiles);

  v_event_id := 'rng_domino_' || encode(gen_random_bytes(8), 'hex');
  v_commitment_hash := encode(digest(p_session_id::text || '_' || v_event_id, 'sha256'), 'hex');

  -- Obtener IDs de jugadores de la mesa
  SELECT ARRAY(SELECT user_id FROM public.game_table_players WHERE table_id = v_session.table_id ORDER BY seat_number ASC)
  INTO v_players;

  v_hands := '{}'::jsonb;
  FOR v_i IN 1..array_length(v_players, 1) LOOP
    IF v_i = 1 THEN v_hand_tiles := jsonb_path_query_array(v_shuffled, '$[0 to 6]');
    ELSIF v_i = 2 THEN v_hand_tiles := jsonb_path_query_array(v_shuffled, '$[7 to 13]');
    ELSIF v_i = 3 THEN v_hand_tiles := jsonb_path_query_array(v_shuffled, '$[14 to 20]');
    ELSIF v_i = 4 THEN v_hand_tiles := jsonb_path_query_array(v_shuffled, '$[21 to 27]');
    END IF;
    
    v_hands := jsonb_set(v_hands, ARRAY[v_players[v_i]::text], v_hand_tiles);
  END LOOP;

  -- Registrar evento RNG
  INSERT INTO public.rng_events (
    event_id, session_id, table_id, user_id, game_type, event_type, result, commitment_hash, idempotency_key
  ) VALUES (
    v_event_id, p_session_id, v_session.table_id, v_user_id, 'DOMINO_VENEZOLANO', 'DEAL_TILES',
    jsonb_build_object('shuffled_tiles', v_shuffled, 'hands', v_hands),
    v_commitment_hash, v_idempotency_key
  );

  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);
  v_current_state := jsonb_set(v_current_state, '{hands}', v_hands);
  v_current_state := jsonb_set(v_current_state, '{boardTiles}', '[]'::jsonb);
  v_current_state := jsonb_set(v_current_state, '{lastRngEventId}', to_jsonb(v_event_id));

  UPDATE public.game_sessions
  SET current_state = v_current_state, updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_event_id,
    'hands', v_hands,
    'commitment_hash', v_commitment_hash
  );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;


-- 6. PERMISOS Y GRANTS DE EJECUCIÓN
GRANT EXECUTE ON FUNCTION public.fn_secure_rng_int(INT, INT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_secure_rng_shuffle_jsonb(JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_roll_dice_secure(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_draw_bingo_ball_secure(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_start_domino_round_secure(UUID, TEXT) TO authenticated, service_role;
