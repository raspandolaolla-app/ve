-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 081
-- CORRECCIÓN DEFINITIVA DE FIRMA RPC Y COMPATIBILIDAD: SETTLE_GAME_SESSION & REFUND_GAME_SESSION
-- ==============================================================================
-- Causa Raíz Identificada:
-- Error: "function public.settle_game_session(uuid, uuid[], integer, text) does not exist"
-- En la migración 018 se definió el parámetro `p_winner_team` como `SMALLINT`. Al ser invocado
-- desde clientes JavaScript/PostgREST o desde funciones PL/pgSQL con literales enteros, PostgREST
-- envía `INTEGER` (int4) y `TEXT`, lo que causaba un fallo de resolución de tipos.
--
-- Esta migración:
-- 1. Normaliza `settle_game_session` con `p_winner_team INTEGER DEFAULT NULL` y `p_idempotency_key TEXT DEFAULT NULL`.
-- 2. Añade sobrecargas seguras (UUID[], TEXT[], SMALLINT) para compatibilidad total e inquebrantable.
-- 3. Reconcilia `refund_game_session` con `p_reason TEXT` y `p_idempotency_key TEXT`.
-- 4. Garantiza permisos de ejecución a authenticated, anon y service_role.
-- ==============================================================================

-- 1. FUNCIÓN CANÓNICA: SETTLE_GAME_SESSION (UUID, UUID[], INTEGER, TEXT)
CREATE OR REPLACE FUNCTION public.settle_game_session(
  p_session_id UUID,
  p_winner_user_ids UUID[],
  p_winner_team INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
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
  v_effective_idempotency TEXT;
BEGIN
  -- 1. Control de Autorización (Participante de la mesa, Rol Operador+ o Motor Servidor)
  v_caller_id := auth.uid();
  
  -- Verificar si la sesión existe primero
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión de juego % no encontrada', p_session_id;
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa de juego no encontrada';
  END IF;

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

  -- 2. Idempotencia y Replay Seguro
  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'settle_' || p_session_id::text || '_' || COALESCE(v_caller_id::text, 'sys')
  );

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id OR idempotency_key = v_effective_idempotency;

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
    RETURN jsonb_build_object(
      'success', true,
      'is_already_settled', true,
      'session_status', v_session.status
    );
  END IF;

  -- 4. Validación de Participantes
  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  IF v_player_count < 1 THEN
    RAISE EXCEPTION 'INVALID_PLAYER_COUNT: Partida sin participantes';
  END IF;

  -- 5. Validación de Ganadores
  v_winner_count := COALESCE(array_length(p_winner_user_ids, 1), 0);
  IF v_winner_count < 1 THEN
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

  -- 6. Cálculo Financiero Server-Side (Regla 90% Premio / 10% Comisión Plataforma)
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
    v_effective_idempotency,
    COALESCE(v_caller_id::text, 'SERVER_ENGINE')
  );

  -- 8. Captura de Entrada (Held Balance) de todos los participantes
  IF v_table.entry_fee > 0.00 THEN
    FOR v_player IN (SELECT user_id FROM public.game_table_players WHERE table_id = v_table.id) LOOP
      UPDATE public.wallets
      SET 
        held_balance = GREATEST(0.00, held_balance - v_table.entry_fee),
        updated_at = NOW()
      WHERE user_id = v_player.user_id;

      INSERT INTO public.ledger_entries (
        wallet_id,
        user_id,
        entry_type,
        direction,
        amount,
        balance_after,
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

  -- 9. Acreditación de Premio a Ganadores (1v1 o Reparto)
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
          balance_after,
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
          'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_individual_prize,
          v_winner_wallet.available_balance + v_individual_prize,
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
          'COMPLETED'
        );
      END IF;
    END LOOP;
  END IF;

  -- 10. Actualizar Estado de la Sesión y Mesa
  UPDATE public.game_sessions
  SET 
    status = 'SETTLED'::session_status_enum,
    winner_user_id = p_winner_user_ids[1],
    ended_at = NOW(),
    updated_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET 
    status = 'CLOSED'::table_status_enum,
    updated_at = NOW()
  WHERE id = v_table.id;

  -- 11. Registrar en Historial Público si existe la tabla
  BEGIN
    INSERT INTO public.public_match_history (
      session_id,
      table_id,
      game_type,
      winner_user_id,
      prize_pool,
      player_count,
      ended_at
    ) VALUES (
      p_session_id,
      v_table.id,
      v_table.game_type,
      p_winner_user_ids[1],
      v_prize_pool,
      v_player_count,
      NOW()
    )
    ON CONFLICT (session_id) DO UPDATE SET
      winner_user_id = EXCLUDED.winner_user_id,
      prize_pool = EXCLUDED.prize_pool,
      ended_at = EXCLUDED.ended_at;
  EXCEPTION WHEN OTHERS THEN
    -- Silenciar error de ticker público para no bloquear la liquidación
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'gross_pool', v_gross_pool,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee,
    'winner_count', v_winner_count
  );
END;
$$;

-- 2. SOBRECARGA PARA SMALLINT (COMPATIBILIDAD CON FUNCIONES PL/PGSQL HISTÓRICAS)
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
BEGIN
  RETURN public.settle_game_session(
    p_session_id,
    p_winner_user_ids,
    p_winner_team::INTEGER,
    p_idempotency_key::TEXT
  );
END;
$$;

-- 3. SOBRECARGA PARA ARRAYS DE TEXT (POSTGREST JSON CASTING FALLBACK)
CREATE OR REPLACE FUNCTION public.settle_game_session(
  p_session_id UUID,
  p_winner_user_ids TEXT[],
  p_winner_team INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uuid_array UUID[];
BEGIN
  v_uuid_array := p_winner_user_ids::UUID[];
  RETURN public.settle_game_session(
    p_session_id,
    v_uuid_array,
    p_winner_team,
    p_idempotency_key
  );
END;
$$;

-- 4. FUNCIÓN CANÓNICA: REFUND_GAME_SESSION (UUID, TEXT, TEXT)
CREATE OR REPLACE FUNCTION public.refund_game_session(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'CANCELLED',
  p_idempotency_key TEXT DEFAULT NULL
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
  v_effective_idempotency TEXT;
  v_refunded_count INT := 0;
BEGIN
  -- 1. Control de Autorización
  v_caller_id := auth.uid();

  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión % no encontrada', p_session_id;
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

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
      RAISE EXCEPTION 'PERMISSION_DENIED: Solo los jugadores participantes o un operador pueden reembolsar partidas';
    END IF;
  END IF;

  -- 2. Idempotencia
  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'refund_' || p_session_id::text || '_' || COALESCE(v_caller_id::text, 'sys')
  );

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id OR idempotency_key = v_effective_idempotency;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'settlement_id', v_existing_settlement.id
    );
  END IF;

  -- 3. Verificación de Estado
  IF v_session.status = 'SETTLED' THEN
    RAISE EXCEPTION 'INVALID_SESSION_STATUS: No se puede reembolsar una sesión ya liquidada';
  END IF;

  IF v_session.status = 'CANCELLED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_already_cancelled', true
    );
  END IF;

  -- 4. Conteo de Participantes y Cálculo de Pozo
  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  v_gross_pool := v_table.entry_fee * COALESCE(v_player_count, 0);

  -- 5. Creación de Registro de Reembolso
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
    'CANCELLED_REFUND'::settlement_type_enum,
    v_gross_pool,
    0.00,
    0.00,
    v_gross_pool,
    v_effective_idempotency,
    COALESCE(v_caller_id::text, 'SERVER_ENGINE')
  );

  -- 6. Liberación de Saldos Retenidos (Held Balance)
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
          held_balance = GREATEST(0.00, held_balance - v_table.entry_fee),
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
          balance_after,
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
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_table.entry_fee,
          v_player_wallet.available_balance + v_table.entry_fee,
          v_player_wallet.available_balance + v_table.entry_fee,
          GREATEST(0.00, v_player_wallet.held_balance - v_table.entry_fee),
          'game_settlements',
          v_settlement_id,
          'REFUND_' || p_session_id::text || '_' || v_player.user_id::text,
          'Reembolso de entrada por empate o cancelación: ' || COALESCE(p_reason, 'Sin motivo'),
          v_caller_id
        );

        v_refunded_count := v_refunded_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 7. Actualización de Estados
  UPDATE public.game_sessions
  SET 
    status = 'CANCELLED'::session_status_enum,
    ended_at = NOW(),
    updated_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET 
    status = 'CLOSED'::table_status_enum,
    updated_at = NOW()
  WHERE id = v_table.id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'refunded_count', v_refunded_count,
    'gross_refunded', v_gross_pool
  );
END;
$$;

-- 5. SOBRECARGA PARA VARCHAR (COMPATIBILIDAD CON ESQUEMAS PREVIOS)
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
BEGIN
  RETURN public.refund_game_session(
    p_session_id,
    p_reason::TEXT,
    p_idempotency_key::TEXT
  );
END;
$$;

-- 6. PERMISOS DE EJECUCIÓN
GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], SMALLINT, VARCHAR) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, TEXT[], INTEGER, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_game_session(UUID, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refund_game_session(UUID, VARCHAR, VARCHAR) TO authenticated, anon, service_role;
