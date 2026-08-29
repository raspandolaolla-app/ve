-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 034: CORRECCIÓN DE ROLES, POLLA Y BINGO
-- ==============================================================================
-- 1. Diagnóstico y Corrección de Error 42703 (columna "role" no existe en profiles).
-- 2. Endurecimiento de RLS y Prevención de Bypass Directo en Polla Venezolana.
-- 3. Control de Concurrencia y Ventanas VET para Polla Venezolana.
-- 4. Soporte Server-Authoritative para Bingo 75/80/90, Distribución 90/10 y Reglas.
-- 5. Control Server-Side de Vidas y Timeouts en Juegos por Turnos.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECCIÓN 1: REPARACIÓN DE TABLAS DE POLLA Y REFERENCIAS DE CLAVES FORÁNEAS
-- ------------------------------------------------------------------------------

-- Asegurar compatibilidad de claves foráneas con auth.users / profiles(user_id)
ALTER TABLE IF EXISTS public.polla_tickets
  DROP CONSTRAINT IF EXISTS polla_tickets_user_id_fkey;

ALTER TABLE IF EXISTS public.polla_tickets
  ADD CONSTRAINT polla_tickets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.polla_draw_results
  DROP CONSTRAINT IF EXISTS polla_draw_results_created_by_fkey;

ALTER TABLE IF EXISTS public.polla_draw_results
  ADD CONSTRAINT polla_draw_results_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.polla_block_closures
  DROP CONSTRAINT IF EXISTS polla_block_closures_winner_user_id_fkey;

ALTER TABLE IF EXISTS public.polla_block_closures
  ADD CONSTRAINT polla_block_closures_winner_user_id_fkey
  FOREIGN KEY (winner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- SECCIÓN 2: CORRECCIÓN DE POLÍTICAS RLS EN POLLA VENEZOLANA (USANDO is_admin)
-- ------------------------------------------------------------------------------

ALTER TABLE public.polla_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polla_draw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polla_block_closures ENABLE ROW LEVEL SECURITY;

-- 2.1 polla_tickets
DROP POLICY IF EXISTS "Usuarios ven sus propias pollas" ON public.polla_tickets;
DROP POLICY IF EXISTS "Inserción vía RPC buy_polla_ticket_secure" ON public.polla_tickets;
DROP POLICY IF EXISTS "Sin inserción directa de usuarios" ON public.polla_tickets;

-- Lectura: El dueño o un Administrador (usando la función is_admin)
CREATE POLICY "Usuarios ven sus propias pollas"
  ON public.polla_tickets FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_admin(auth.uid())
  );

-- Inserción directa DENEGADA para authenticated/anon (Se realiza EXCLUSIVAMENTE vía RPC SECURITY DEFINER)
-- Ninguna política INSERT para authenticated significa que las inserciones directas por cliente son rechazadas.

-- 2.2 polla_draw_results
DROP POLICY IF EXISTS "Lectura pública de resultados" ON public.polla_draw_results;
DROP POLICY IF EXISTS "Solo administradores crean resultados" ON public.polla_draw_results;

CREATE POLICY "Lectura pública de resultados"
  ON public.polla_draw_results FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Solo administradores crean resultados"
  ON public.polla_draw_results FOR ALL
  USING (public.is_admin(auth.uid()));

-- 2.3 polla_block_closures
DROP POLICY IF EXISTS "Lectura pública de ganadores y cierres" ON public.polla_block_closures;
DROP POLICY IF EXISTS "Solo administradores gestionan cierres" ON public.polla_block_closures;

CREATE POLICY "Lectura pública de ganadores y cierres"
  ON public.polla_block_closures FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Solo administradores gestionan cierres"
  ON public.polla_block_closures FOR ALL
  USING (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- SECCIÓN 3: RPC SERVER-AUTHORITATIVE HARDENED DE POLLA (buy_polla_ticket_secure)
-- ------------------------------------------------------------------------------

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
  i INT;
  j INT;
BEGIN
  -- 1. Validar usuario autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  -- 2. Validar parámetro de bloque
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

  -- 6. Validar ventana de venta server-side (Caracas VET)
  IF p_block = 'MAÑANA' THEN
    -- Mañana: Venta abre 19:05 del día anterior y cierra 07:55 AM del día del sorteo
    IF p_draw_date = v_vet_date THEN
      IF v_vet_time > '07:55:00'::TIME THEN
        RETURN jsonb_build_object('success', false, 'error', 'VENTA_CERRADA_BLOQUE_MAÑANA');
      END IF;
    ELSIF p_draw_date = (v_vet_date + INTERVAL '1 day')::DATE THEN
      IF v_vet_time < '19:05:00'::TIME THEN
        RETURN jsonb_build_object('success', false, 'error', 'VENTA_NO_INICIADA_BLOQUE_MAÑANA');
      END IF;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'FECHA_SORTEO_FUERA_DE_VENTANA');
    END IF;
  ELSIF p_block = 'TARDE' THEN
    -- Tarde: Venta abre 08:00 AM y cierra 13:55 PM (01:55 PM) del día del sorteo
    IF p_draw_date = v_vet_date THEN
      IF v_vet_time < '08:00:00'::TIME OR v_vet_time > '13:55:00'::TIME THEN
        RETURN jsonb_build_object('success', false, 'error', 'VENTA_CERRADA_BLOQUE_TARDE');
      END IF;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'FECHA_SORTEO_FUERA_DE_VENTANA');
    END IF;
  END IF;

  -- 7. BLOQUEO TRANSACCIONAL PARA PREVENIR CONDICIONES DE CARRERA (Máximo 10 pollas)
  PERFORM pg_advisory_xact_lock(hashtext('polla_buy_' || v_user_id::text || '_' || p_draw_date::text || '_' || p_block));

  SELECT COUNT(*) INTO v_ticket_count
  FROM public.polla_tickets
  WHERE user_id = v_user_id
    AND draw_date = p_draw_date
    AND block = p_block;

  IF v_ticket_count >= 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'LIMITE_ALCANZADO_MAX_10_POLLAS_POR_BLOQUE');
  END IF;

  -- 8. Validar y bloquear saldo en billetera
  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL OR v_wallet_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALDO_INSUFICIENTE_REQUIERE_250_BS');
  END IF;

  -- 9. Descontar 250 Bs atómicamente
  UPDATE public.wallets
  SET balance = balance - v_price,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 10. Registrar movimiento en ledger
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
    'Compra de Polla Venezolana - Bloque ' || p_block || ' (' || p_draw_date || ')',
    v_wallet_balance - v_price
  );

  -- 11. Crear ticket de Polla
  INSERT INTO public.polla_tickets (
    user_id,
    block,
    draw_date,
    animalitos,
    cost_bs,
    status
  ) VALUES (
    v_user_id,
    p_block,
    p_draw_date,
    p_animalitos,
    v_price,
    'PENDING'
  ) RETURNING id INTO v_ticket_id;

  -- 12. Retornar confirmación
  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'balance_after', v_wallet_balance - v_price,
    'message', 'SE DESCONTARON 250 Bs DE TU SALDO.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_polla_ticket_secure(TEXT, DATE, TEXT[]) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- SECCIÓN 4: BINGO 75 / 80 / 90 — TABLA Y RPC DE COMPRA (buy_bingo_cards_secure)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bingo_card_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_table_id UUID REFERENCES public.game_tables(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('75', '80', '90')),
  card_count INT NOT NULL CHECK (card_count BETWEEN 1 AND 20),
  price_per_card NUMERIC(15,2) NOT NULL DEFAULT 10.00,
  total_cost NUMERIC(15,2) NOT NULL,
  winner_pool NUMERIC(15,2) NOT NULL, -- 90%
  system_fee NUMERIC(15,2) NOT NULL,  -- 10%
  cards_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bingo_card_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven sus propios cartones de bingo" ON public.bingo_card_purchases;
CREATE POLICY "Usuarios ven sus propios cartones de bingo"
  ON public.bingo_card_purchases FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.buy_bingo_cards_secure(
  p_game_table_id UUID,
  p_card_count INT,
  p_variant TEXT,
  p_price_per_card NUMERIC(15,2) DEFAULT 10.00,
  p_cards_data JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_wallet_balance NUMERIC(15,2);
  v_total_cost NUMERIC(15,2);
  v_winner_pool NUMERIC(15,2);
  v_system_fee NUMERIC(15,2);
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

  -- Regla especial de 2 Jugadores: Si la mesa tiene exactamente 2 jugadores, ambos deben tener la misma cantidad de cartones (máx 5 cada uno)
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

  -- Bloquear billetera y verificar saldo
  SELECT balance INTO v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL OR v_wallet_balance < v_total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALDO_INSUFICIENTE_PARA_COMPRA_DE_CARTONES');
  END IF;

  -- Descontar saldo
  UPDATE public.wallets
  SET balance = balance - v_total_cost,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- Registrar movimiento en ledger
  INSERT INTO public.ledger_entries (
    user_id,
    amount,
    entry_type,
    reference_type,
    notes,
    balance_after
  ) VALUES (
    v_user_id,
    -v_total_cost,
    'DEBIT',
    'BINGO_CARD_PURCHASE',
    'Compra de ' || p_card_count || ' cartón(es) de Bingo ' || p_variant,
    v_wallet_balance - v_total_cost
  );

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

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'total_cost', v_total_cost,
    'winner_pool', v_winner_pool,
    'system_fee', v_system_fee,
    'balance_after', v_wallet_balance - v_total_cost,
    'message', 'COMPRA DE CARTONES EXITOSA.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.buy_bingo_cards_secure(UUID, INT, TEXT, NUMERIC, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- SECCIÓN 5: REGISTRO AUDITABLE DE TIMEOUTS Y VIDAS EN JUEGOS POR TURNOS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_turn_timeout_secure(
  p_session_id UUID,
  p_user_id UUID,
  p_bot_move JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'user_id', p_user_id,
    'message', 'TIMEOUT_REGISTRADO_CORRECTAMENTE'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_turn_timeout_secure(UUID, UUID, JSONB) TO authenticated, service_role;
