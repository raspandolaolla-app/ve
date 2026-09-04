-- ==============================================================================
-- MIGRACIÓN 134: REGLA DE ORO EN VENTA DE CARTONES DE BINGO
-- Proyecto: RASPANDO LA OLLA — Ventas abiertas mientras no haya balotas extraídas
-- ==============================================================================

-- 1. ACTUALIZAR FUNCIÓN CANÓNICA buy_bingo_cards_secure
CREATE OR REPLACE FUNCTION public.buy_bingo_cards_secure(
  p_game_table_id UUID,
  p_card_count INTEGER,
  p_variant TEXT DEFAULT '90',
  p_price_per_card NUMERIC DEFAULT 0,
  p_cards_data JSONB DEFAULT '[]'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_table RECORD;
  v_session RECORD;
  v_total_cost NUMERIC;
  v_wallet RECORD;
  v_effective_idempotency TEXT;
  v_i INT;
  v_new_cards JSONB := '[]'::jsonb;
  v_card_data JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO';
  END IF;

  -- 1. Obtener y bloquear la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_game_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MESA_NO_ENCONTRADA';
  END IF;

  -- 2. Obtener y bloquear la sesión
  SELECT * INTO v_session FROM public.game_sessions WHERE table_id = p_game_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESION_NO_ENCONTRADA';
  END IF;

  -- 3. 🔒 REGLA DE ORO INFALIBLE (FAIRNESS LOCK):
  -- Las ventas SOLO se cierran si la partida terminó ('FINISHED', 'CANCELLED')
  -- o si el sorteo ya comenzó formalmente ('DRAWING')
  -- o si ya existen balotas extraídas en game_state->'drawnBalls'.
  -- Estados como 'ACTIVE' o 'in_progress' generados por el inicio del contenedor NO bloquean compras.
  IF v_session.status IN ('FINISHED', 'CANCELLED', 'DRAWING') OR
     (v_session.game_state IS NOT NULL AND jsonb_array_length(COALESCE(v_session.game_state->'drawnBalls', '[]'::jsonb)) > 0) THEN
    RAISE EXCEPTION 'VENTAS_CERRADAS: El sorteo ya comenzó o la partida terminó.';
  END IF;

  -- 4. Calcular costo total
  v_total_cost := p_card_count * COALESCE(p_price_per_card, v_table.entry_fee);

  -- 5. Verificar y bloquear billetera
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.available_balance < v_total_cost THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE';
  END IF;

  -- 6. Generar clave de idempotencia única
  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'buy_bingo_' || p_game_table_id::text || '_' || v_user_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  -- 7. Verificar idempotencia (evitar doble cobro por clics múltiples o reconexión)
  IF EXISTS (
    SELECT 1 FROM public.ledger_entries 
    WHERE user_id = v_user_id AND idempotency_key = v_effective_idempotency
  ) THEN
    -- Ya se procesó esta compra, devolver los cartones existentes
    SELECT COALESCE(jsonb_agg(card_data), '[]'::jsonb) INTO v_new_cards
    FROM public.bingo_card_purchases
    WHERE session_id = v_session.id AND user_id = v_user_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Compra ya procesada anteriormente.',
      'cards', v_new_cards
    );
  END IF;

  -- 8. Descontar saldo disponible y mover a retenido (held_balance)
  UPDATE public.wallets
  SET available_balance = available_balance - v_total_cost,
      held_balance = held_balance + v_total_cost,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 9. Registrar en Ledger (Libro Mayor Inmutable)
  INSERT INTO public.ledger_entries (
    user_id, amount, balance_after, transaction_type, description, source_type, idempotency_key
  ) VALUES (
    v_user_id, -v_total_cost, v_wallet.available_balance - v_total_cost, 
    'DEBIT_PURCHASE', 'Compra de ' || p_card_count || ' cartones de Bingo', 'REAL', v_effective_idempotency
  );

  -- 10. Generar y guardar los cartones
  FOR v_i IN 1..p_card_count LOOP
    v_card_data := COALESCE(p_cards_data->>(v_i-1), '{}')::jsonb;
    
    INSERT INTO public.bingo_card_purchases (
      session_id, table_id, user_id, variant, price_paid, card_data, purchased_at
    ) VALUES (
      v_session.id, v_table.id, v_user_id, p_variant, COALESCE(p_price_per_card, v_table.entry_fee), 
      v_card_data, NOW()
    );
    
    v_new_cards := v_new_cards || jsonb_build_array(v_card_data);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Cartones comprados exitosamente.',
    'cards', v_new_cards,
    'total_cost', v_total_cost,
    'new_balance', v_wallet.available_balance - v_total_cost
  );
END;
$$;

-- 2. Permisos
GRANT EXECUTE ON FUNCTION public.buy_bingo_cards_secure(UUID, INTEGER, TEXT, NUMERIC, JSONB, TEXT) TO authenticated, service_role;

-- 3. RESET DE SESIÓN Y MESA ATRAPADA (Si existen)
UPDATE public.game_sessions 
SET status = 'SALES' 
WHERE id = 'a50d6e22-7e0c-4abd-8194-cdf559f2bb0d';

UPDATE public.game_tables 
SET status = 'WAITING' 
WHERE id = 'f9e69b56-ea93-457c-ad87-7fc5d587114e';

-- 4. Notificar a PostgREST
NOTIFY pgrst, 'reload schema';
