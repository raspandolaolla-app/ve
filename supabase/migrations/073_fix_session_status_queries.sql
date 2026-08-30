-- ==============================================================================
-- MIGRACIÓN 073 — CORRECCIÓN DE ENUM SESSION_STATUS_ENUM Y CONSULTAS SQL
-- ==============================================================================
-- Esta migración soluciona de forma definitiva el error 22P02 al iniciar partidas:
-- "invalid input value for enum session_status_enum: \"IN_PROGRESS\""
--
-- Redefine las funciones start_game_session_secure y get_admin_dashboard_metrics
-- para realizar castings seguros de status::text en comparaciones que involucren
-- estados lógicos del frontend que no existen directamente en la base de datos,
-- o valores del enum PostgreSQL que se comparan usando literales de texto.
-- ==============================================================================

-- 1. Redefinición Segura de start_game_session_secure
CREATE OR REPLACE FUNCTION public.start_game_session_secure(
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_table RECORD;
  v_players JSONB := '[]'::jsonb;
  v_player_order JSONB := '[]'::jsonb;
  v_lives JSONB := '{}'::jsonb;
  v_scores JSONB := '{}'::jsonb;
  v_player_record RECORD;
  v_session_id UUID;
  v_first_turn_user_id UUID;
  v_initial_state JSONB;
  v_deadline TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión';
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

  IF v_table.host_user_id <> v_user_id THEN
    RAISE EXCEPTION 'ONLY_HOST_CAN_START: Únicamente el Anfitrión de la mesa puede iniciar la partida';
  END IF;

  -- Si ya existe una sesión activa o en curso, retornarla
  -- Se aplica casting seguro (status::text) para evitar error 22P02 con 'IN_PROGRESS'
  SELECT id INTO v_session_id
  FROM public.game_sessions
  WHERE table_id = p_table_id
    AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'IN_PROGRESS');

  IF v_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'session_id', v_session_id,
      'table_id', p_table_id,
      'already_active', true
    );
  END IF;

  -- Compilar lista de jugadores activos
  FOR v_player_record IN (
    SELECT gtp.user_id, gtp.seat_number, p.display_name, p.first_name, p.last_name, p.avatar_url
    FROM public.game_table_players gtp
    JOIN public.profiles p ON p.user_id = gtp.user_id
    WHERE gtp.table_id = p_table_id
      AND gtp.status != 'LEFT'::player_table_status_enum
    ORDER BY gtp.seat_number ASC
  ) LOOP
    IF v_first_turn_user_id IS NULL THEN
      v_first_turn_user_id := v_player_record.user_id;
    END IF;

    v_player_order := v_player_order || to_jsonb(v_player_record.user_id::text);
    v_lives := jsonb_set(v_lives, ARRAY[v_player_record.user_id::text], '3'::jsonb);
    v_scores := jsonb_set(v_scores, ARRAY[v_player_record.user_id::text], '0'::jsonb);

    v_players := v_players || jsonb_build_object(
      'userId', v_player_record.user_id,
      'seatNumber', v_player_record.seat_number,
      'displayName', COALESCE(NULLIF(trim(v_player_record.display_name), ''), trim(COALESCE(v_player_record.first_name, '') || ' ' || COALESCE(v_player_record.last_name, ''))),
      'avatarUrl', v_player_record.avatar_url,
      'lives', 3
    );
  END LOOP;

  IF v_first_turn_user_id IS NULL THEN
    v_first_turn_user_id := v_user_id;
  END IF;

  v_deadline := NOW() + INTERVAL '10 seconds';
  v_session_id := gen_random_uuid();

  v_initial_state := jsonb_build_object(
    'status', 'PLAYING',
    'playerOrder', v_player_order,
    'players', v_players,
    'currentTurnUserId', v_first_turn_user_id,
    'lives', v_lives,
    'scores', v_scores,
    'round', 1
  );

  -- Crear sesión en game_sessions usando el estado ACTIVE del enum
  INSERT INTO public.game_sessions (
    id, table_id, game_type, session_number, status, current_state,
    current_turn_user_id, turn_deadline_at, started_at
  ) VALUES (
    v_session_id, p_table_id, v_table.game_type, 1, 'ACTIVE'::session_status_enum,
    v_initial_state, v_first_turn_user_id, v_deadline, NOW()
  );

  -- Actualizar estado de la mesa a ACTIVE
  UPDATE public.game_tables
  SET status = 'ACTIVE'::table_status_enum,
      started_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'table_id', p_table_id,
    'current_turn_user_id', v_first_turn_user_id,
    'turn_deadline_at', v_deadline,
    'already_active', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game_session_secure(UUID) TO authenticated, service_role, anon;


-- 2. Redefinición Segura de get_admin_dashboard_metrics
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
  -- Limpiar inactivos (> 4 min)
  PERFORM public.cleanup_inactive_user_presence(4);

  -- Registrados vs Conectados globales
  SELECT COUNT(*) INTO v_registered_users FROM public.profiles;
  SELECT COUNT(*) INTO v_connected_users 
  FROM public.profiles 
  WHERE is_online = TRUE 
     OR (last_seen_at IS NOT NULL AND last_seen_at >= (NOW() - INTERVAL '4 minutes'));
  
  -- Usuarios activos en las últimas 24h
  SELECT COUNT(*) INTO v_active_users 
  FROM public.profiles 
  WHERE last_seen_at >= (NOW() - INTERVAL '24 hours');

  -- Mesas y Partidas (con castings status::text seguros)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_tables') THEN
    SELECT COUNT(*) INTO v_active_tables FROM public.game_tables WHERE status::text IN ('OPEN', 'WAITING_PLAYERS', 'FULL', 'WAITING', 'IN_GAME', 'STARTING', 'ACTIVE');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_sessions') THEN
    SELECT COUNT(*) INTO v_active_matches FROM public.game_sessions WHERE status::text IN ('IN_PROGRESS', 'WAITING', 'STARTING', 'ACTIVE', 'PAUSED');
    SELECT COUNT(*) INTO v_finished_matches FROM public.game_sessions WHERE status::text IN ('SETTLED', 'COMPLETED', 'FINISHED');
  END IF;

  -- Solicitudes pendientes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deposit_requests') THEN
    SELECT COUNT(*) INTO v_pending_deposits FROM public.deposit_requests WHERE status = 'PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'withdrawal_requests') THEN
    SELECT COUNT(*) INTO v_pending_withdrawals FROM public.withdrawal_requests WHERE status = 'PENDING';
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
    SELECT COUNT(*) INTO v_security_alerts FROM public.audit_logs WHERE severity IN ('CRITICAL', 'SECURITY_ALERT') AND created_at >= (NOW() - INTERVAL '7 days');
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

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated, service_role, anon;

-- Notificar a PostgREST para actualizar el cache del esquema
NOTIFY pgrst, 'reload schema';
