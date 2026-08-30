-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 056: FUENTE ÚNICA DE VERDAD Y VISIBILIDAD DE PRESENCIA GLOBAL
-- ==============================================================================
-- 1. Actualiza RLS de user_roles y wallets para permitir acceso SELECT a Operadores.
-- 2. Ajusta la ventana de presencia inactiva a 4 minutos en cleanup_inactive_user_presence.
-- 3. Actualiza record_user_heartbeat para sincronizar profiles y user_activity_sessions.
-- 4. Actualiza get_admin_dashboard_metrics con ventana de 4 minutos.
-- 5. Crea RPC get_admin_users_list() para consulta atómica y garantizada de usuarios por Admins y Operadores.
-- ==============================================================================

-- 1. Actualización de Políticas RLS para user_roles y wallets (Permitir Operadores)
DROP POLICY IF EXISTS p_user_roles_select ON public.user_roles;
CREATE POLICY p_user_roles_select ON public.user_roles
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_wallets_select ON public.wallets;
CREATE POLICY p_wallets_select ON public.wallets
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_operator_or_above(auth.uid())
  );

-- 2. Limpieza de presencias inactivas con tolerancia de 4 minutos (resiliente a redes móviles / PWA)
CREATE OR REPLACE FUNCTION public.cleanup_inactive_user_presence(p_timeout_minutes INT DEFAULT 4)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleaned INT := 0;
BEGIN
  UPDATE public.profiles
  SET 
    is_online = FALSE,
    updated_at = NOW()
  WHERE 
    is_online = TRUE 
    AND (last_seen_at IS NULL OR last_seen_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL);

  GET DIAGNOSTICS v_cleaned = ROW_COUNT;
  RETURN v_cleaned;
END;
$$;

-- 3. RPC record_user_heartbeat con sincronización garantizada de profiles y user_activity_sessions
CREATE OR REPLACE FUNCTION public.record_user_heartbeat(p_activity_type TEXT DEFAULT 'PAGE_ACTIVE')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMPTZ := NOW();
  v_session_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autenticado');
  END IF;

  -- 3.1 Actualizar presencia única en public.profiles
  UPDATE public.profiles
  SET 
    is_online = TRUE,
    last_seen_at = v_now,
    updated_at = v_now
  WHERE user_id = v_user_id OR id = v_user_id;

  -- 3.2 Sincronizar user_activity_sessions si la tabla existe
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_activity_sessions') THEN
    UPDATE public.user_activity_sessions
    SET 
      status = 'DISCONNECTED',
      ended_at = last_seen_at,
      session_duration_seconds = EXTRACT(EPOCH FROM (last_seen_at - started_at))::BIGINT,
      updated_at = v_now
    WHERE user_id = v_user_id 
      AND status IN ('ACTIVE', 'IDLE')
      AND last_seen_at < (v_now - INTERVAL '10 minutes');

    SELECT id INTO v_session_id
    FROM public.user_activity_sessions
    WHERE user_id = v_user_id 
      AND status IN ('ACTIVE', 'IDLE')
      AND last_seen_at >= (v_now - INTERVAL '10 minutes')
    ORDER BY last_seen_at DESC
    LIMIT 1;

    IF v_session_id IS NOT NULL THEN
      UPDATE public.user_activity_sessions
      SET 
        last_seen_at = v_now,
        last_activity_type = COALESCE(p_activity_type, 'PAGE_ACTIVE'),
        status = 'ACTIVE',
        session_duration_seconds = EXTRACT(EPOCH FROM (v_now - started_at))::BIGINT,
        updated_at = v_now
      WHERE id = v_session_id;
    ELSE
      INSERT INTO public.user_activity_sessions (
        id,
        user_id,
        started_at,
        last_seen_at,
        status,
        session_duration_seconds,
        last_activity_type
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        v_now,
        v_now,
        'ACTIVE',
        0,
        COALESCE(p_activity_type, 'PAGE_ACTIVE')
      );
    END IF;
  END IF;

  -- 3.3 Limpiar usuarios inactivos por más de 4 min
  PERFORM public.cleanup_inactive_user_presence(4);

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'timestamp', v_now
  );
END;
$$;

-- 4. Métricas de Dashboard con ventana de presencia global de 4 minutos
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

  -- Mesas y Partidas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_tables') THEN
    SELECT COUNT(*) INTO v_active_tables FROM public.game_tables WHERE status IN ('OPEN', 'WAITING_PLAYERS', 'FULL', 'WAITING', 'IN_GAME', 'STARTING');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_sessions') THEN
    SELECT COUNT(*) INTO v_active_matches FROM public.game_sessions WHERE status IN ('IN_PROGRESS', 'WAITING', 'STARTING');
    SELECT COUNT(*) INTO v_finished_matches FROM public.game_sessions WHERE status IN ('SETTLED', 'COMPLETED', 'FINISHED');
  END IF;

  -- Solicitudes pendientes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deposit_requests') THEN
    SELECT COUNT(*) INTO v_pending_deposits FROM public.deposit_requests WHERE status = 'PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'withdrawal_requests') THEN
    SELECT COUNT(*) INTO v_pending_withdrawals FROM public.withdrawal_requests WHERE status = 'PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'support_tickets') THEN
    SELECT COUNT(*) INTO v_pending_tickets FROM public.support_tickets WHERE status IN ('OPEN', 'IN_PROGRESS');
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

-- 5. RPC get_admin_users_list() - Fuente de verdad absoluta para el listado de usuarios
CREATE OR REPLACE FUNCTION public.get_admin_users_list()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Requiere rol de Operador o Administrador.';
  END IF;

  -- Ejecutar limpieza previa de presencias inactivas (> 4 min)
  PERFORM public.cleanup_inactive_user_presence(4);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'first_name', COALESCE(p.first_name, 'Jugador'),
        'last_name', COALESCE(p.last_name, ''),
        'display_name', COALESCE(p.display_name, p.first_name, 'Jugador'),
        'email', p.email,
        'phone_number', p.phone_number,
        'cedula_last4', p.cedula_last4,
        'state_venezuela', COALESCE(p.state_venezuela, 'Distrito Capital'),
        'account_status', COALESCE(p.account_status, 'ACTIVE'),
        'kyc_status', COALESCE(p.kyc_status, 'UNSUBMITTED'),
        'is_online', (
          COALESCE(p.is_online, FALSE) 
          OR (p.last_seen_at IS NOT NULL AND p.last_seen_at >= (NOW() - INTERVAL '4 minutes'))
        ),
        'last_seen_at', COALESCE(p.last_seen_at, p.updated_at, p.created_at),
        'created_at', p.created_at,
        'updated_at', p.updated_at,
        'role', COALESCE(r.role, 'PLAYER'),
        'available_balance', COALESCE(w.available_balance, 0),
        'held_balance', COALESCE(w.held_balance, 0),
        'total_balance', COALESCE(w.available_balance + w.held_balance, 0)
      ) ORDER BY p.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM public.profiles p
  LEFT JOIN (
    SELECT DISTINCT ON (user_id) user_id, role 
    FROM public.user_roles 
    ORDER BY user_id, 
             CASE role 
               WHEN 'SUPER_ADMIN' THEN 1 
               WHEN 'ADMIN' THEN 2 
               WHEN 'OPERATOR' THEN 3 
               ELSE 4 
             END
  ) r ON p.user_id = r.user_id
  LEFT JOIN public.wallets w ON p.user_id = w.user_id;

  RETURN v_result;
END;
$$;

-- Otorgar Permisos de Ejecución
GRANT EXECUTE ON FUNCTION public.cleanup_inactive_user_presence(INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_user_heartbeat(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_users_list() TO authenticated;

NOTIFY pgrst, 'reload schema';
