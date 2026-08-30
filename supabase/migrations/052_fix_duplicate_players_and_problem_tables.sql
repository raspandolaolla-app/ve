-- ==============================================================================
-- MIGRACIÓN 052: PREVENCIÓN DE JUGADORES DUPLICADOS, LIMPIEZA DE MESAS BLOQUEADAS
-- Y CORRECCIÓN DE METRICAS DEL DASHBOARD (HTTP 400)
-- Proyecto: PULSOPLAY (Raspando la Olla)
-- ==============================================================================

-- 1. CORRECCIÓN DE HTTP 400 EN get_admin_dashboard_metrics()
-- Se agregan conversiones explicitas status::text para evitar fallos por valores ENUM
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registered_users INT := 0;
  v_active_users INT := 0;
  v_connected_users INT := 0;
  v_active_tables INT := 0;
  v_active_matches INT := 0;
  v_finished_matches INT := 0;
  v_pending_deposits INT := 0;
  v_pending_withdrawals INT := 0;
  v_pending_tickets INT := 0;
  v_total_volume NUMERIC := 0;
  v_total_prizes NUMERIC := 0;
  v_total_fees NUMERIC := 0;
  v_security_alerts INT := 0;
BEGIN
  -- Limpieza de presencias inactivas
  PERFORM public.cleanup_inactive_user_presence(2);

  -- Conteo de usuarios
  SELECT COUNT(*) INTO v_registered_users FROM public.profiles;
  SELECT COUNT(*) INTO v_connected_users FROM public.profiles WHERE is_online = TRUE AND last_seen_at >= (NOW() - INTERVAL '2 minutes');
  SELECT COUNT(*) INTO v_active_users FROM public.profiles WHERE last_seen_at >= (NOW() - INTERVAL '24 hours');

  -- Conteo de mesas con cast seguro status::text (Evita HTTP 400 por enum invalido)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_tables') THEN
    SELECT COUNT(*) INTO v_active_tables 
    FROM public.game_tables 
    WHERE status::text IN ('OPEN', 'WAITING_PLAYERS', 'FULL', 'WAITING', 'IN_GAME', 'STARTING', 'PLAYING', 'ACTIVE');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_sessions') THEN
    SELECT COUNT(*) INTO v_active_matches FROM public.game_sessions WHERE status::text IN ('IN_PROGRESS', 'WAITING', 'STARTING', 'ACTIVE', 'PAUSED');
    SELECT COUNT(*) INTO v_finished_matches FROM public.game_sessions WHERE status::text IN ('SETTLED', 'COMPLETED', 'FINISHED');
  END IF;

  -- Solicitudes pendientes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deposit_requests') THEN
    SELECT COUNT(*) INTO v_pending_deposits FROM public.deposit_requests WHERE status::text = 'PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'withdrawal_requests') THEN
    SELECT COUNT(*) INTO v_pending_withdrawals FROM public.withdrawal_requests WHERE status::text = 'PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'support_tickets') THEN
    SELECT COUNT(*) INTO v_pending_tickets FROM public.support_tickets WHERE status::text IN ('OPEN', 'IN_PROGRESS');
  END IF;

  -- Volúmenes y comisiones
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_settlements') THEN
    SELECT COALESCE(SUM(gross_pool), 0), COALESCE(SUM(prize_pool), 0), COALESCE(SUM(platform_fee), 0)
    INTO v_total_volume, v_total_prizes, v_total_fees
    FROM public.game_settlements;
  END IF;

  -- Alertas de seguridad
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    SELECT COUNT(*) INTO v_security_alerts 
    FROM public.audit_logs 
    WHERE severity::text IN ('CRITICAL', 'SECURITY_ALERT') AND created_at >= (NOW() - INTERVAL '7 days');
  END IF;

  RETURN jsonb_build_object(
    'registeredUsersCount', v_registered_users,
    'activeUsersCount', GREATEST(v_active_users, v_connected_users),
    'connectedUsersCount', v_connected_users,
    'activeTablesCount', v_active_tables,
    'activeMatchesCount', v_active_matches,
    'finishedMatchesCount', v_finished_matches,
    'pendingDepositsCount', v_pending_deposits,
    'pendingWithdrawalsCount', v_pending_withdrawals,
    'pendingTicketsCount', v_pending_tickets,
    'totalVolumePlayed', v_total_volume,
    'totalPrizesAwarded', v_total_prizes,
    'totalServiceFeesCollected', v_total_fees,
    'securityAlertsCount', v_security_alerts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated, service_role;


-- 2. LIMPIEZA DE JUGADORES DUPLICADOS EXISTENTES EN BASE DE DATOS
-- Marcar como 'LEFT' los registros duplicados de un mismo usuario en una misma mesa manteniéndose sólo el más reciente.
WITH ranked_players AS (
  SELECT id, table_id, user_id, seat_number, status,
         ROW_NUMBER() OVER (
           PARTITION BY table_id, user_id 
           ORDER BY joined_at DESC, created_at DESC, id DESC
         ) as rank_num
  FROM public.game_table_players
  WHERE status IN ('JOINED', 'READY', 'PLAYING') AND user_id IS NOT NULL
)
UPDATE public.game_table_players
SET status = 'LEFT'::player_table_status_enum,
    left_at = NOW(),
    updated_at = NOW()
WHERE id IN (SELECT id FROM ranked_players WHERE rank_num > 1);


-- 3. BINDING DE ÍNDICES ÚNICOS PARCIALES PARA GARANTIZAR REGLA: UN USUARIO = UN SOLO ASIENTO POR MESA
-- Esto impide físicamente que el mismo usuario o el mismo asiento contenga más de un registro activo simultáneo.
DROP INDEX IF EXISTS public.idx_uq_active_player_per_table;
CREATE UNIQUE INDEX idx_uq_active_player_per_table 
ON public.game_table_players (table_id, user_id) 
WHERE status IN ('JOINED', 'READY', 'PLAYING');

DROP INDEX IF EXISTS public.idx_uq_active_seat_per_table;
CREATE UNIQUE INDEX idx_uq_active_seat_per_table 
ON public.game_table_players (table_id, seat_number) 
WHERE status IN ('JOINED', 'READY', 'PLAYING');


-- 4. RPC MEJORADO: join_table_transaction CON PROTECCIÓN ANTI-DUPLICACIÓN Y CONCURRENCIA
CREATE OR REPLACE FUNCTION public.join_table_transaction(
  p_table_id UUID,
  p_seat_number SMALLINT,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_profile RECORD;
  v_table RECORD;
  v_wallet RECORD;
  v_existing_active_player RECORD;
  v_existing_left_player RECORD;
  v_active_players_count INT;
  v_ledger_id UUID;
  v_player_id UUID;
BEGIN
  -- 1. Verificación de Autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  -- 2. Verificación de Estado de Cuenta del Perfil
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil de usuario no registrado';
  END IF;

  IF v_profile.account_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Cuenta no habilitada para unirse a mesas (estado: %)', v_profile.account_status;
  END IF;

  -- 3. BLOQUEO PESIMISTA DE LA MESA Y REVISIÓN DE CONCURRENCIA
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa especificada no existe';
  END IF;

  IF v_table.status NOT IN ('OPEN', 'WAITING', 'WAITING_PLAYERS') THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: La mesa no está disponible para unirse (estado: %)', v_table.status;
  END IF;

  IF v_table.expires_at <= NOW() THEN
    RAISE EXCEPTION 'TABLE_EXPIRED: La mesa ha expirado';
  END IF;

  -- 4. VERIFICAR SI EL JUGADOR YA TIENE UN ASIENTO ACTIVO EN ESTA MESA (UN USUARIO = UN ASIENTO)
  SELECT * INTO v_existing_active_player
  FROM public.game_table_players
  WHERE table_id = p_table_id 
    AND user_id = v_user_id 
    AND status IN ('JOINED', 'READY', 'PLAYING');

  IF FOUND THEN
    -- Retornar el asiento existente. ¡NUNCA CREAR UN SEGUNDO ASIENTO!
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'already_seated', true,
      'player_id', v_existing_active_player.id,
      'table_id', p_table_id,
      'seat_number', v_existing_active_player.seat_number,
      'message', 'El jugador ya ocupa el asiento #' || v_existing_active_player.seat_number || ' en esta mesa.'
    );
  END IF;

  -- 5. VERIFICACIÓN DE LÍMITE DE CAPACIDAD Y ASIENTO SOLICITADO
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING');

  IF v_active_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: La mesa ha alcanzado su capacidad máxima (%/%)', v_active_players_count, v_table.max_players;
  END IF;

  IF p_seat_number < 1 OR p_seat_number > v_table.max_players THEN
    RAISE EXCEPTION 'INVALID_SEAT: Número de asiento fuera de rango permitido (1..%)', v_table.max_players;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.game_table_players 
    WHERE table_id = p_table_id 
      AND seat_number = p_seat_number 
      AND status IN ('JOINED', 'READY', 'PLAYING')
  ) THEN
    RAISE EXCEPTION 'SEAT_TAKEN: El asiento % ya está ocupado', p_seat_number;
  END IF;

  -- 6. APLICACIÓN DE HOLD Y ASIENTO EN LEDGER SI LA MESA TIENE COSTO Y NO TENÍA RETENCIÓN PREVIA
  IF v_table.entry_fee > 0.00 THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera de usuario no encontrada';
    END IF;

    IF v_wallet.available_balance < v_table.entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente (requerido: %, disponible: %)', 
        v_table.entry_fee, v_wallet.available_balance;
    END IF;

    UPDATE public.wallets
    SET 
      available_balance = available_balance - v_table.entry_fee,
      held_balance = held_balance + v_table.entry_fee,
      updated_at = NOW()
    WHERE id = v_wallet.id;

    v_ledger_id := gen_random_uuid();
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
      v_ledger_id,
      v_wallet.id,
      v_user_id,
      'TABLE_ENTRY_HOLD',
      'HOLD',
      v_table.entry_fee,
      v_wallet.available_balance - v_table.entry_fee,
      v_wallet.held_balance + v_table.entry_fee,
      'game_tables',
      p_table_id,
      p_idempotency_key,
      'Retención de entrada a mesa ' || p_table_id::text || ' asiento ' || p_seat_number::text,
      v_user_id
    );
  END IF;

  -- 7. REUTILIZAR O INSERTAR REGISTRO DEL JUGADOR
  SELECT * INTO v_existing_left_player
  FROM public.game_table_players
  WHERE table_id = p_table_id AND user_id = v_user_id;

  IF FOUND THEN
    -- Reactivar registro previo liberando flag LEFT
    v_player_id := v_existing_left_player.id;
    UPDATE public.game_table_players
    SET 
      seat_number = p_seat_number,
      status = 'JOINED'::player_table_status_enum,
      entry_held_entry_id = COALESCE(v_ledger_id, entry_held_entry_id),
      left_at = NULL,
      updated_at = NOW()
    WHERE id = v_player_id;
  ELSE
    -- Insertar nuevo asiento de jugador
    v_player_id := gen_random_uuid();
    INSERT INTO public.game_table_players (
      id,
      table_id,
      user_id,
      seat_number,
      status,
      entry_held_entry_id
    ) VALUES (
      v_player_id,
      p_table_id,
      v_user_id,
      p_seat_number,
      'JOINED'::player_table_status_enum,
      v_ledger_id
    );
  END IF;

  -- 8. RECONCILIACIÓN ATÓMICA DEL CONTADOR Y ESTADO DE LA MESA
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING');

  UPDATE public.game_tables
  SET 
    current_players_count = v_active_players_count,
    status = CASE 
      WHEN v_active_players_count >= max_players THEN 'FULL'::table_status_enum 
      ELSE 'OPEN'::table_status_enum 
    END,
    updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'player_id', v_player_id,
    'table_id', p_table_id,
    'seat_number', p_seat_number,
    'active_players_count', v_active_players_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_table_transaction(UUID, SMALLINT, VARCHAR) TO authenticated, service_role;


-- 5. RPC ADMINISTRATIVO PARA LIMPIEZA SEGURA DE MESAS BLOQUEADAS
-- Reembolsa retenciones activas si la partida no se jugó y limpia referencias sin tocar el historial financiero.
CREATE OR REPLACE FUNCTION public.admin_fix_and_cleanup_problematic_table(
  p_table_id UUID,
  p_reason TEXT DEFAULT 'Limpieza administrativa de mesa con problemas / bloqueada'
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
  v_already_refunded BOOLEAN := FALSE;
  v_refund_count INT := 0;
  v_cleaned_seats_count INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  -- Bloquear la mesa para concurrencia
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MESA_NO_ENCONTRADA',
      'message', 'La mesa de juego especificada no existe o ya fue eliminada'
    );
  END IF;

  -- 1. Reparar/Marcar como 'LEFT' registros duplicados de jugadores activos en esta mesa
  WITH ranked_players AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id 
             ORDER BY joined_at DESC, created_at DESC, id DESC
           ) as rank_num
    FROM public.game_table_players
    WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING') AND user_id IS NOT NULL
  )
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum, left_at = NOW(), updated_at = NOW()
  WHERE id IN (SELECT id FROM ranked_players WHERE rank_num > 1);

  -- 2. Procesar reembolsos seguros si la mesa tiene costo y los jugadores tienen dinero retenido
  IF v_table.entry_fee > 0.00 THEN
    FOR v_player IN 
      SELECT DISTINCT user_id 
      FROM public.game_table_players 
      WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING') AND user_id IS NOT NULL
    LOOP
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
            'Reembolso por limpieza de mesa con problemas #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
            'problem_cleanup_refund_' || p_table_id::text || '_' || v_player.user_id::text || '_' || extract(epoch from now())::text,
            NOW()
          );

          v_refund_count := v_refund_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Cancelar sesiones asociadas a esta mesa
  UPDATE public.game_sessions
  SET status = 'CANCELLED'::session_status_enum, ended_at = NOW()
  WHERE table_id = p_table_id AND status NOT IN ('SETTLED', 'CANCELLED');

  -- 4. Liberar todos los asientos marcándolos como LEFT
  SELECT COUNT(*) INTO v_cleaned_seats_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING');

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND status != 'LEFT';

  -- 5. Terminar la mesa
  UPDATE public.game_tables
  SET status = 'TERMINATED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  -- 6. Auditoría
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
    'MESA_PROBLEMATICA_LIMPIADA',
    'GAME_TABLE',
    p_table_id::text,
    'WARNING',
    jsonb_build_object(
      'table_id', p_table_id,
      'invite_code', v_table.invite_code,
      'game_type', v_table.game_type,
      'reason', p_reason,
      'refunded_players', v_refund_count,
      'cleaned_seats', v_cleaned_seats_count,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'action', 'MESA_PROBLEMATICA_LIMPIADA',
    'refunded_count', v_refund_count,
    'cleaned_seats', v_cleaned_seats_count,
    'message', 'Mesa limpiada y asientos liberados exitosamente.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fix_and_cleanup_problematic_table(UUID, TEXT) TO authenticated, service_role;
