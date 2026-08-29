-- ==============================================================================
-- MIGRACIÓN 042: CORRECCIÓN DE COLUMNAS Y PROCEDIMIENTOS DE ABANDONO / DESCONEXIÓN DE MESAS
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / COMPATIBLE CON HISTORIAL
-- ==============================================================================

-- 1. Asegurar que la columna updated_at exista de forma segura en public.game_table_players
ALTER TABLE public.game_table_players 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. RPC ATÓMICO: Abandono seguro de mesa por jugador (actualizado)
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
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
  v_player RECORD;
  v_wallet RECORD;
  v_active_players_count INT;
  v_remaining_player RECORD;
  v_effective_idempotency VARCHAR(100);
  v_settle_result JSONB;
  v_already_refunded BOOLEAN := FALSE;
  v_refund_amount NUMERIC(15, 2) := 0.00;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para abandonar la mesa';
  END IF;

  -- Bloquear mesa y verificar existencia
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa de juego no existe';
  END IF;

  -- Verificar si el jugador pertenece a la mesa
  SELECT * INTO v_player 
  FROM public.game_table_players 
  WHERE table_id = p_table_id AND user_id = v_caller_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'ALREADY_LEFT_OR_NOT_IN_TABLE'
    );
  END IF;

  -- Cambiar el estado del participante en game_table_players a 'LEFT'
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND user_id = v_caller_id;

  -- Buscar sesión de juego asociada
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  ELSE
    SELECT * INTO v_session FROM public.game_sessions
    WHERE table_id = p_table_id AND status IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED')
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE;
  END IF;

  -- Procesar liberación/devolución de entrada si la partida NO ha sido liquidada/capturada y la mesa tiene entrada
  IF v_table.entry_fee > 0.00 AND (v_session.id IS NULL OR v_session.status NOT IN ('SETTLED', 'ACTIVE')) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE user_id = v_caller_id
        AND reference_table = 'game_tables'
        AND reference_id = p_table_id
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
          wallet_id,
          user_id,
          entry_type,
          direction,
          amount,
          balance_after_available,
          balance_after_held,
          reference_table,
          reference_id,
          description,
          idempotency_key,
          created_at
        ) VALUES (
          v_wallet.id,
          v_caller_id,
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_table.entry_fee,
          v_wallet.available_balance + v_table.entry_fee,
          v_wallet.held_balance,
          'game_tables',
          p_table_id,
          'Reembolso por abandono de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
          'abandon_refund_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text,
          NOW()
        );
        v_refund_amount := v_table.entry_fee;
      END IF;
    END IF;
  END IF;

  -- Contar jugadores activos restantes
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

  -- Actualizar el contador de la mesa y estado
  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      status = CASE
        WHEN v_active_players_count = 0 AND status IN ('OPEN', 'FULL', 'WAITING') THEN 'CLOSED'::table_status_enum
        WHEN status = 'FULL' AND v_active_players_count < max_players THEN 'OPEN'::table_status_enum
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abandon_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text
  );

  -- Si la sesión estaba activa y queda un ÚNICO jugador restante -> Declarar ganador por abandono
  IF v_active_players_count = 1 AND v_session.id IS NOT NULL AND v_session.status = 'ACTIVE' THEN
    SELECT user_id INTO v_remaining_player
    FROM public.game_table_players
    WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY')
    LIMIT 1;

    IF v_remaining_player.user_id IS NOT NULL THEN
      v_settle_result := public.settle_game_session(
        v_session.id,
        ARRAY[v_remaining_player.user_id],
        1,
        'SETTLE_ABANDON_' || v_effective_idempotency
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'WINNER_DECLARED_BY_ABANDON',
        'winner_user_id', v_remaining_player.user_id,
        'refund_amount', v_refund_amount,
        'settlement', v_settle_result
      );
    END IF;
  END IF;

  -- Si quedan 0 jugadores activos -> Cerrar mesa y cancelar sesión huérfana
  IF v_active_players_count = 0 THEN
    IF v_session.id IS NOT NULL AND v_session.status NOT IN ('SETTLED', 'CANCELLED') THEN
      UPDATE public.game_sessions
      SET status = 'CANCELLED'::session_status_enum, ended_at = NOW()
      WHERE id = v_session.id;
    END IF;

    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum, closed_at = NOW(), updated_at = NOW()
    WHERE id = p_table_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'TABLE_CLOSED_NO_PLAYERS',
      'refund_amount', v_refund_amount
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'PLAYER_LEFT',
    'remaining_players_count', v_active_players_count,
    'refund_amount', v_refund_amount
  );
END;
$$;

-- 3. RPC ATÓMICO: Desconexión administrativa de jugador individual por ADMIN/OPERADOR
CREATE OR REPLACE FUNCTION public.admin_disconnect_player_secure(
  p_table_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role VARCHAR(50);
  v_table RECORD;
  v_player RECORD;
  v_wallet RECORD;
  v_active_players_count INT;
  v_already_refunded BOOLEAN := FALSE;
  v_refunded BOOLEAN := FALSE;
  v_effective_reason TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador para desconectar jugadores';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa especificada no existe';
  END IF;

  SELECT * INTO v_player 
  FROM public.game_table_players 
  WHERE table_id = p_table_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'El jugador no se encuentra en la mesa');
  END IF;

  v_effective_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Desconexión ejecutada por administración');

  -- Actualizar estado del jugador
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND user_id = p_user_id;

  -- Comprobar si corresponde reembolso
  IF COALESCE(v_table.entry_fee, 0) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE user_id = p_user_id
        AND reference_table = 'game_tables'
        AND reference_id = p_table_id
        AND entry_type = 'TABLE_ENTRY_REFUND'::ledger_entry_type_enum
    ) INTO v_already_refunded;

    IF NOT v_already_refunded THEN
      SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
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
          wallet_id,
          user_id,
          entry_type,
          direction,
          amount,
          balance_after_available,
          balance_after_held,
          reference_table,
          reference_id,
          description,
          idempotency_key,
          created_at
        ) VALUES (
          v_wallet.id,
          p_user_id,
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_table.entry_fee,
          v_wallet.available_balance + v_table.entry_fee,
          v_wallet.held_balance,
          'game_tables',
          p_table_id,
          'Reembolso por desconexión administrativa de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
          'admin_disconnect_' || p_table_id::text || '_' || p_user_id::text || '_' || extract(epoch from now())::text,
          NOW()
        );
        v_refunded := TRUE;
      END IF;
    END IF;
  END IF;

  -- Recalcular jugadores activos
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      status = CASE
        WHEN v_active_players_count = 0 AND status IN ('OPEN', 'FULL', 'WAITING') THEN 'CLOSED'::table_status_enum
        WHEN status = 'FULL' AND v_active_players_count < max_players THEN 'OPEN'::table_status_enum
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  -- Registro en auditoría
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_caller_id,
    v_caller_role,
    'ADMIN_DISCONNECT_PLAYER',
    'GAME_TABLE',
    p_table_id::text,
    'WARNING'::audit_severity_enum,
    jsonb_build_object(
      'table_id', p_table_id,
      'target_user_id', p_user_id,
      'reason', v_effective_reason,
      'refunded', v_refunded,
      'disconnected_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'PLAYER_DISCONNECTED_BY_ADMIN',
    'table_id', p_table_id,
    'target_user_id', p_user_id,
    'refunded', v_refunded,
    'remaining_players_count', v_active_players_count
  );
END;
$$;

-- 4. RPC ATÓMICO: Terminación de Mesa por Administración (actualizado con prevención de doble reembolso y left_at)
CREATE OR REPLACE FUNCTION public.admin_terminate_game_table(
  p_table_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_refund_players BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role VARCHAR(50);
  v_table RECORD;
  v_session RECORD;
  v_player RECORD;
  v_wallet RECORD;
  v_refunded_count INT := 0;
  v_already_refunded BOOLEAN := FALSE;
  v_effective_reason TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador para terminar mesas';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa con ID % no existe', p_table_id;
  END IF;

  v_effective_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Terminación administrativa por operador');

  IF v_table.status IN ('TERMINATED', 'CLOSED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'table_id', p_table_id,
      'action', 'ALREADY_TERMINATED',
      'refunded_count', 0,
      'message', 'La mesa ya se encontraba terminada o cerrada'
    );
  END IF;

  -- Cancelar todas las sesiones activas
  FOR v_session IN (
    SELECT * FROM public.game_sessions 
    WHERE table_id = p_table_id AND status NOT IN ('SETTLED', 'CANCELLED')
    FOR UPDATE
  ) LOOP
    UPDATE public.game_sessions
    SET status = 'CANCELLED'::session_status_enum,
        ended_at = NOW()
    WHERE id = v_session.id;
  END LOOP;

  -- Procesar reembolsos de cuota de entrada evitando doble reembolso
  IF p_refund_players AND COALESCE(v_table.entry_fee, 0) > 0 THEN
    FOR v_player IN (
      SELECT DISTINCT user_id 
      FROM public.game_table_players 
      WHERE table_id = p_table_id AND user_id IS NOT NULL
    ) LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.ledger_entries
        WHERE user_id = v_player.user_id
          AND reference_table = 'game_tables'
          AND reference_id = p_table_id
          AND entry_type = 'TABLE_ENTRY_REFUND'::ledger_entry_type_enum
      ) INTO v_already_refunded;

      IF NOT v_already_refunded THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_player.user_id FOR UPDATE;
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
            wallet_id,
            user_id,
            entry_type,
            direction,
            amount,
            balance_after_available,
            balance_after_held,
            reference_table,
            reference_id,
            description,
            idempotency_key,
            created_at
          ) VALUES (
            v_wallet.id,
            v_player.user_id,
            'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            v_table.entry_fee,
            v_wallet.available_balance + v_table.entry_fee,
            v_wallet.held_balance,
            'game_tables',
            p_table_id,
            'Reembolso por terminación administrativa de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
            'admin_refund_' || p_table_id::text || '_' || v_player.user_id::text || '_' || extract(epoch from now())::text,
            NOW()
          );

          v_refunded_count := v_refunded_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Actualizar estado de los participantes a LEFT
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND status != 'LEFT';

  -- Actualizar la mesa a TERMINATED
  UPDATE public.game_tables
  SET status = 'TERMINATED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  -- Registro en audit_logs
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_caller_id,
    v_caller_role,
    'ADMIN_TERMINATE_GAME_TABLE',
    'GAME_TABLE',
    p_table_id::text,
    'CRITICAL'::audit_severity_enum,
    jsonb_build_object(
      'table_id', p_table_id,
      'game_type', v_table.game_type,
      'reason', v_effective_reason,
      'refund_players', p_refund_players,
      'refunded_count', v_refunded_count,
      'previous_status', v_table.status,
      'entry_fee', v_table.entry_fee,
      'terminated_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'action', 'TERMINATED',
    'refunded_count', v_refunded_count,
    'message', 'Mesa terminada exitosamente por la administración'
  );
END;
$$;

-- Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, VARCHAR) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_disconnect_player_secure(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_terminate_game_table(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
