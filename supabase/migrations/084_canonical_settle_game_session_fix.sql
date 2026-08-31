-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 084
-- CORRECCIÓN DEFINITIVA DE FIRMAS Y DUPLICADOS EN RPC SETTLE_GAME_SESSION
-- ==============================================================================
-- 1. Elimina explícitamente cualquier sobrecarga antigua que cause ambigüedad en PostgREST:
--    - settle_game_session(UUID, TEXT[], INTEGER, TEXT)
--    - settle_game_session(UUID, UUID[], SMALLINT, VARCHAR)
--    - settle_game_session(UUID, UUID[], INTEGER, TEXT)
-- 2. Crea UNA SOLA función canónica oficial con tipos estrictos:
--    public.settle_game_session(
--      p_session_id UUID,
--      p_winner_user_ids UUID[],
--      p_winner_team INTEGER DEFAULT NULL,
--      p_idempotency_key TEXT DEFAULT NULL
--    )
-- 3. Mantiene intactos: SECURITY DEFINER, search_path seguro, regla financiera 90/10,
--    ledger inmutable, wallet, idempotencia, RLS y liquidación de mesas.
-- 4. Asigna permisos canónicos a: authenticated, anon, service_role.
-- ==============================================================================

-- 1. ELIMINACIÓN DE SOBRECARGAS INCOMPATIBLES
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, TEXT[], INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], SMALLINT, VARCHAR);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], INTEGER, TEXT);

-- 2. CREACIÓN DE LA FUNCIÓN CANÓNICA ÚNICA
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
  -- 1. Identificación del invocador y control de autorización
  v_caller_id := auth.uid();
  
  -- Verificar existencia de la sesión con bloqueo de fila para evitar condiciones de carrera (TOCTOU)
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

  -- Si es invocado por un usuario autenticado, validar que sea participante o rol administrativo
  IF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.game_table_players
      WHERE table_id = v_table.id AND user_id = v_caller_id
    ) INTO v_is_participant;

    IF NOT v_is_participant AND NOT public.has_role(v_caller_id, 'OPERATOR') AND NOT public.has_role(v_caller_id, 'ADMIN') AND NOT public.has_role(v_caller_id, 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'UNAUTHORIZED: No tienes permisos para liquidar esta partida';
    END IF;
  END IF;

  -- 2. Manejo de Idempotencia estricta
  v_effective_idempotency := COALESCE(p_idempotency_key, 'settle_' || p_session_id::TEXT);

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE idempotency_key = v_effective_idempotency
     OR session_id = p_session_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'settlement_id', v_existing_settlement.id,
      'gross_pool', v_existing_settlement.gross_pool,
      'prize_pool', v_existing_settlement.prize_pool,
      'platform_fee', v_existing_settlement.platform_fee,
      'message', 'Partida ya liquidada previamente de forma segura'
    );
  END IF;

  -- 3. Cálculo de Pozos Financieros (Regla 90% Ganador / 10% Plataforma)
  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  IF v_player_count < 1 THEN
    v_player_count := 2; -- Fallback seguro de quorum
  END IF;

  v_gross_pool := ROUND((v_table.entry_fee * v_player_count)::NUMERIC, 2);
  v_prize_pool := ROUND((v_gross_pool * 0.90)::NUMERIC, 2);
  v_platform_fee := ROUND((v_gross_pool - v_prize_pool)::NUMERIC, 2);

  v_winner_count := COALESCE(array_length(p_winner_user_ids, 1), 0);

  -- 4. Determinar tipo de liquidación
  IF v_winner_count = 0 THEN
    v_settlement_type := 'REFUND_TECHNICAL_DRAW'::settlement_type_enum;
  ELSIF v_winner_count = 1 THEN
    v_settlement_type := 'WINNER_TAKES_ALL'::settlement_type_enum;
  ELSE
    v_settlement_type := 'SPLIT_POT'::settlement_type_enum;
  END IF;

  -- 5. Crear Registro Maestro de Liquidación en game_settlements
  INSERT INTO public.game_settlements (
    session_id,
    table_id,
    settlement_type,
    gross_pool,
    prize_pool,
    platform_fee,
    currency,
    idempotency_key,
    created_at
  ) VALUES (
    p_session_id,
    v_table.id,
    v_settlement_type,
    v_gross_pool,
    v_prize_pool,
    v_platform_fee,
    v_table.currency,
    v_effective_idempotency,
    NOW()
  ) RETURNING id INTO v_settlement_id;

  -- 6. Distribución y Acreditación de Ganadores
  IF v_winner_count > 0 THEN
    v_individual_prize := TRUNC((v_prize_pool / v_winner_count)::NUMERIC, 2);

    FOREACH v_winner_id IN ARRAY p_winner_user_ids
    LOOP
      -- Obtener o inicializar billetera con bloqueo de fila
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_winner_id AND currency = v_table.currency
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.wallets (user_id, currency, balance, created_at, updated_at)
        VALUES (v_winner_id, v_table.currency, 0.00, NOW(), NOW())
        RETURNING * INTO v_winner_wallet;
      END IF;

      -- Actualizar saldo de la billetera
      UPDATE public.wallets
      SET balance = balance + v_individual_prize,
          updated_at = NOW()
      WHERE id = v_winner_wallet.id;

      -- Registrar transacción inmutable en el Ledger
      INSERT INTO public.ledger_entries (
        wallet_id,
        user_id,
        amount,
        currency,
        entry_type,
        reference_id,
        reference_type,
        balance_before,
        balance_after,
        metadata,
        created_at
      ) VALUES (
        v_winner_wallet.id,
        v_winner_id,
        v_individual_prize,
        v_table.currency,
        'PRIZE_PAYOUT'::ledger_entry_type_enum,
        v_settlement_id,
        'game_settlement',
        v_winner_wallet.balance,
        v_winner_wallet.balance + v_individual_prize,
        jsonb_build_object(
          'session_id', p_session_id,
          'table_id', v_table.id,
          'game_type', v_table.game_type,
          'idempotency_key', v_effective_idempotency,
          'description', 'Premio de victoria en ' || v_table.game_type
        ),
        NOW()
      ) RETURNING id INTO v_winner_ledger_id;

      -- Registrar detalle en settlement_recipients
      INSERT INTO public.settlement_recipients (
        settlement_id,
        user_id,
        payout_amount,
        ledger_entry_id,
        created_at
      ) VALUES (
        v_settlement_id,
        v_winner_id,
        v_individual_prize,
        v_winner_ledger_id,
        NOW()
      );

      v_distributed_sum := v_distributed_sum + v_individual_prize;
    END LOOP;
  ELSE
    -- Reembolso íntegro en caso de empate técnico o sin ganadores
    FOR v_player IN (
      SELECT DISTINCT user_id FROM public.game_table_players WHERE table_id = v_table.id
    ) LOOP
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_player.user_id AND currency = v_table.currency
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET balance = balance + v_table.entry_fee,
            updated_at = NOW()
        WHERE id = v_winner_wallet.id;

        INSERT INTO public.ledger_entries (
          wallet_id,
          user_id,
          amount,
          currency,
          entry_type,
          reference_id,
          reference_type,
          balance_before,
          balance_after,
          metadata,
          created_at
        ) VALUES (
          v_winner_wallet.id,
          v_player.user_id,
          v_table.entry_fee,
          v_table.currency,
          'REFUND'::ledger_entry_type_enum,
          v_settlement_id,
          'game_settlement',
          v_winner_wallet.balance,
          v_winner_wallet.balance + v_table.entry_fee,
          jsonb_build_object(
            'session_id', p_session_id,
            'table_id', v_table.id,
            'reason', 'Empate técnico o anulación segura'
          ),
          NOW()
        );
      END IF;
    END LOOP;
  END IF;

  -- 7. Actualizar Estados de Sesión y Mesa
  UPDATE public.game_sessions
  SET status = 'SETTLED'::game_session_status_enum,
      winner_user_id = p_winner_user_ids[1],
      winner_team = p_winner_team,
      gross_pool = v_gross_pool,
      prize_pool = v_prize_pool,
      platform_fee = v_platform_fee,
      ended_at = NOW(),
      is_settled = TRUE
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_table.id;

  RETURN jsonb_build_object(
    'success', true,
    'already_settled', false,
    'settlement_id', v_settlement_id,
    'gross_pool', v_gross_pool,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee,
    'winner_count', v_winner_count
  );
END;
$$;

-- 3. PERMISOS DE EJECUCIÓN ESTRICTOS
REVOKE ALL ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role, anon;
