-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 082
-- MEJORA CONTROLADA DE ABANDONO DE PARTIDAS + LIQUIDACIÓN AUTOMÁTICA POR FORFEIT
-- ==============================================================================
-- 1. Permite abandono voluntario seguro con resolución autoritativa del servidor.
-- 2. En partidas 1v1 activas: Al abandonar el Jugador A, el Jugador B es declarado
--    ganador inmediato y se liquida la partida (90% ganador / 10% plataforma) mediante ledger.
-- 3. En partidas multijugador (3-4 jugadores): El jugador es eliminado de la mesa activa,
--    la partida continúa con los jugadores restantes y se rota el turno si correspondía al saliente.
-- 4. En salas de espera (partida no iniciada): Se realiza el reembolso íntegro de la entrada retenida.
-- 5. Blindaje de idempotencia, FOR UPDATE y prevención estricta de doble liquidación.
-- ==============================================================================

-- 1. FUNCIÓN CANÓNICA: ABANDON_GAME_TABLE_SECURE
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_table RECORD;
  v_session RECORD;
  v_wallet RECORD;
  v_player RECORD;
  v_already_refunded BOOLEAN := FALSE;
  v_refund_amount NUMERIC(14,2) := 0.00;
  v_active_players_count INT := 0;
  v_remaining_player RECORD;
  v_next_player RECORD;
  v_effective_idempotency TEXT;
  v_settle_result JSONB := NULL;
  v_session_is_active BOOLEAN := FALSE;
BEGIN
  -- 1. Validar autenticación
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes estar autenticado para abandonar la mesa';
  END IF;

  -- 2. Bloquear mesa con FOR UPDATE
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

  -- 3. Verificar estado actual del participante
  SELECT * INTO v_player
  FROM public.game_table_players
  WHERE table_id = p_table_id AND user_id = v_caller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'El usuario no pertenece a la mesa o ya no es participante',
      'table_id', p_table_id
    );
  END IF;

  -- 4. Marcar jugador como LEFT en la mesa
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND user_id = v_caller_id;

  -- 5. Obtener sesión de juego
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE id = p_session_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE table_id = p_table_id
      AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED', 'IN_PROGRESS')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  v_session_is_active := (v_session.id IS NOT NULL AND v_session.status::text IN ('ACTIVE', 'IN_PROGRESS', 'PLAYING'));

  -- 6. Clave de idempotencia efectiva
  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abandon_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text
  );

  -- 7. REGLA DE RETENCIÓN / REEMBOLSO SEGÚN ESTADO DE PARTIDA
  IF v_table.entry_fee > 0.00 THEN
    IF NOT v_session_is_active AND (v_session.id IS NULL OR v_session.status::text NOT IN ('SETTLED', 'ACTIVE')) THEN
      -- Sala de espera o partida no iniciada: Devolver fondos retenidos a available_balance
      SELECT EXISTS (
        SELECT 1 FROM public.ledger_entries
        WHERE user_id = v_caller_id
          AND (reference_table = 'game_tables' OR reference_type = 'game_tables')
          AND (reference_id = p_table_id::text OR reference_id = p_table_id::uuid::text)
          AND entry_type = 'TABLE_ENTRY_REFUND'::ledger_entry_type_enum
      ) INTO v_already_refunded;

      IF NOT v_already_refunded THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_caller_id FOR UPDATE;
        IF FOUND THEN
          IF v_wallet.held_balance >= v_table.entry_fee THEN
            UPDATE public.wallets
            SET available_balance = available_balance + v_table.entry_fee,
                held_balance = held_balance - v_table.entry_fee,
                updated_at = NOW()
            WHERE id = v_wallet.id;
          ELSE
            UPDATE public.wallets
            SET available_balance = available_balance + v_table.entry_fee,
                total_balance = total_balance + v_table.entry_fee,
                updated_at = NOW()
            WHERE id = v_wallet.id;
          END IF;

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
            reference_type,
            reference_id,
            description,
            idempotency_key,
            status,
            currency,
            actor_id
          ) VALUES (
            gen_random_uuid(),
            v_wallet.id,
            v_caller_id,
            'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            v_table.entry_fee,
            v_wallet.available_balance + v_table.entry_fee,
            v_wallet.available_balance + v_table.entry_fee,
            GREATEST(0.00, v_wallet.held_balance - v_table.entry_fee),
            'game_tables',
            'game_tables',
            p_table_id,
            'Reembolso por abandono voluntario de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
            'refund_' || v_effective_idempotency,
            'COMPLETED',
            'VES',
            v_caller_id
          );
          v_refund_amount := v_table.entry_fee;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 8. Contar jugadores activos restantes
  SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND status IN ('PLAYING', 'JOINED', 'READY');

  -- 9. Actualizar contador y estado en game_tables
  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      status = CASE
        WHEN v_active_players_count = 0 AND status::text IN ('OPEN', 'FULL', 'WAITING') THEN 'CLOSED'::table_status_enum
        WHEN status::text = 'FULL' AND v_active_players_count < max_players THEN 'OPEN'::table_status_enum
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  -- 10. EVALUACIÓN Y LIQUIDACIÓN EN PARTIDA ACTIVA
  IF v_session_is_active THEN
    -- Caso 1v1 o solo queda 1 jugador activo restante: VICTORIA AUTOMÁTICA POR ABANDONO
    IF v_active_players_count = 1 THEN
      SELECT user_id INTO v_remaining_player
      FROM public.game_table_players
      WHERE table_id = p_table_id
        AND status IN ('PLAYING', 'JOINED', 'READY')
      LIMIT 1;

      IF v_remaining_player.user_id IS NOT NULL THEN
        -- Liquidar la partida asignando victoria al jugador restante
        v_settle_result := public.settle_game_session(
          v_session.id,
          ARRAY[v_remaining_player.user_id],
          1,
          'SETTLE_FORFEIT_' || v_effective_idempotency
        );

        -- Registrar en log de auditoría
        INSERT INTO public.audit_logs (
          id, action, user_id, target_table, record_id, metadata, created_at
        ) VALUES (
          gen_random_uuid(),
          'GAME_SESSION_FORFEIT_SETTLED',
          v_caller_id,
          'game_sessions',
          v_session.id::text,
          jsonb_build_object(
            'table_id', p_table_id,
            'abandoned_user_id', v_caller_id,
            'winner_user_id', v_remaining_player.user_id,
            'settlement', v_settle_result
          ),
          NOW()
        );

        RETURN jsonb_build_object(
          'success', true,
          'action', 'WINNER_DECLARED_BY_ABANDON',
          'abandoned_user_id', v_caller_id,
          'winner_user_id', v_remaining_player.user_id,
          'refund_amount', v_refund_amount,
          'settlement', v_settle_result
        );
      END IF;

    -- Caso Multijugador (3 o más jugadores): La partida continúa con los restantes
    ELSIF v_active_players_count > 1 THEN
      -- Si era el turno del jugador que abandona, avanzar el turno al siguiente jugador activo
      IF v_session.current_turn_user_id = v_caller_id THEN
        SELECT user_id INTO v_next_player
        FROM public.game_table_players
        WHERE table_id = p_table_id
          AND status IN ('PLAYING', 'JOINED', 'READY')
          AND user_id <> v_caller_id
        ORDER BY seat_number ASC
        LIMIT 1;

        IF v_next_player.user_id IS NOT NULL THEN
          UPDATE public.game_sessions
          SET current_turn_user_id = v_next_player.user_id,
              turn_deadline_at = NOW() + INTERVAL '30 seconds',
              updated_at = NOW()
          WHERE id = v_session.id;
        END IF;
      END IF;

      -- Registrar auditoría del abandono multijugador
      INSERT INTO public.audit_logs (
        id, action, user_id, target_table, record_id, metadata, created_at
      ) VALUES (
        gen_random_uuid(),
        'MULTIPLAYER_PLAYER_ABANDONED',
        v_caller_id,
        'game_tables',
        p_table_id::text,
        jsonb_build_object(
          'session_id', v_session.id,
          'remaining_players', v_active_players_count
        ),
        NOW()
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'PLAYER_ABANDONED_CONTINUE',
        'abandoned_user_id', v_caller_id,
        'remaining_players', v_active_players_count,
        'table_id', p_table_id
      );

    -- Caso extraordinario: Todos abandonaron
    ELSE
      UPDATE public.game_sessions
      SET status = 'CANCELLED'::session_status_enum,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = v_session.id;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          updated_at = NOW()
      WHERE id = p_table_id;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'ALL_ABANDONED_CLOSED',
        'table_id', p_table_id,
        'remaining_players', 0
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'refund_amount', v_refund_amount,
    'remaining_players', v_active_players_count
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role, anon;

-- Sobrecargas de compatibilidad para evitar cualquier error de resolución de tipos
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.abandon_game_table_secure(p_table_id, NULL, p_idempotency_key);
END;
$$;

GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, TEXT) TO authenticated, service_role, anon;
