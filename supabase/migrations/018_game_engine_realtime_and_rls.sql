-- ================================================================
-- MIGRACIÓN 018: Políticas RLS y Permisos de Sesión en Tiempo Real
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true
-- ================================================================

-- 1. Políticas RLS para game_sessions: Permitir creación y actualización a participantes de la mesa
DROP POLICY IF EXISTS p_sessions_insert ON public.game_sessions;
CREATE POLICY p_sessions_insert ON public.game_sessions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.game_table_players p
      WHERE p.table_id = game_sessions.table_id AND p.user_id = auth.uid()
    )
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_sessions_update ON public.game_sessions;
CREATE POLICY p_sessions_update ON public.game_sessions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.game_table_players p
      WHERE p.table_id = game_sessions.table_id AND p.user_id = auth.uid()
    )
    OR public.is_operator_or_above(auth.uid())
  );

-- 2. Políticas RLS para game_actions: Permitir inserción de jugadas a participantes
DROP POLICY IF EXISTS p_actions_insert ON public.game_actions;
CREATE POLICY p_actions_insert ON public.game_actions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.game_sessions s
      JOIN public.game_table_players p ON p.table_id = s.table_id
      WHERE s.id = game_actions.session_id AND p.user_id = auth.uid()
    )
  );

-- 3. Actualizar función RPC settle_game_session para permitir llamada a participantes legítimos
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
  v_is_participant BOOLEAN := FALSE;
BEGIN
  -- 1. Control de Autorización (Participante de la mesa o Rol Operador+)
  v_caller_id := auth.uid();
  
  -- Verificar si la sesión existe primero
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión de juego no encontrada';
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id;

  IF v_caller_id IS NOT NULL THEN
    IF public.is_operator_or_above(v_caller_id) THEN
      v_is_participant := TRUE;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.game_table_players
        WHERE table_id = v_table.id AND user_id = v_caller_id
      ) INTO v_is_participant;
    END IF;

    IF NOT v_is_participant THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Solo los jugadores participantes o un operador pueden liquidar partidas';
    END IF;
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

  -- 3. Verificación de Estado de la Sesión
  IF v_session.status IN ('SETTLED', 'CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_SESSION_STATUS: La sesión ya fue liquidada o cancelada (estado: %)', v_session.status;
  END IF;

  -- 4. Validación de Participantes
  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  IF v_player_count < 1 THEN
    RAISE EXCEPTION 'INVALID_PLAYER_COUNT: Partida sin participantes';
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

      IF FOUND THEN
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
      END IF;
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

-- 4. Actualizar función RPC refund_game_session para permitir reembolsos
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
  v_is_participant BOOLEAN := FALSE;
BEGIN
  -- 1. Control de Autorización
  v_caller_id := auth.uid();

  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión no encontrada';
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id;

  IF v_caller_id IS NOT NULL THEN
    IF public.is_operator_or_above(v_caller_id) THEN
      v_is_participant := TRUE;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.game_table_players
        WHERE table_id = v_table.id AND user_id = v_caller_id
      ) INTO v_is_participant;
    END IF;

    IF NOT v_is_participant THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Solo los jugadores de la mesa o un operador pueden procesar reembolsos';
    END IF;
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

  IF v_session.status IN ('SETTLED', 'CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_SESSION_STATUS: La sesión ya fue liquidada o cancelada previamente';
  END IF;

  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  v_gross_pool := v_table.entry_fee * v_player_count;

  -- 3. Creación del Registro de Liquidación de Reembolso (0% Fee)
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

  -- 4. Devolución Íntegra (100%) a Cada Participante
  IF v_table.entry_fee > 0.00 THEN
    FOR v_player IN (SELECT user_id FROM public.game_table_players WHERE table_id = v_table.id) LOOP
      SELECT * INTO v_player_wallet
      FROM public.wallets
      WHERE user_id = v_player.user_id
      FOR UPDATE;

      IF FOUND THEN
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
      END IF;
    END LOOP;
  END IF;

  -- 5. Actualización de Sesión y Mesa
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
