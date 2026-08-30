-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 048: RASTREO ROBUSTO DE PRESENCIA Y USUARIOS EN LÍNEA
-- ==============================================================================
-- 1. Asegura columnas is_online y last_seen_at en public.profiles.
-- 2. Crea funciones RPC para heartbeat, cierre de sesión y limpieza de presencias inactivas.
-- 3. Actualiza get_admin_dashboard_metrics para diferenciar con precisión Registrados vs Online.
-- ==============================================================================

-- 1. Agregar columnas a public.profiles si no existen
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_online'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_online BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN last_seen_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN email TEXT;
  END IF;
END $$;

-- Índice para consultas rápidas de estado en línea
CREATE INDEX IF NOT EXISTS idx_profiles_is_online_last_seen ON public.profiles(is_online, last_seen_at);

-- 2. RPC para limpieza de presencias inactivas (Umbral por defecto: 2 minutos)
CREATE OR REPLACE FUNCTION public.cleanup_inactive_user_presence(p_timeout_minutes INT DEFAULT 2)
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

-- 3. RPC para registrar latido (Heartbeat) del usuario autenticado
CREATE OR REPLACE FUNCTION public.record_user_heartbeat(p_activity_type TEXT DEFAULT 'PAGE_ACTIVE')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autenticado');
  END IF;

  -- Actualizar profiles
  UPDATE public.profiles
  SET 
    is_online = TRUE,
    last_seen_at = NOW(),
    updated_at = NOW()
  WHERE user_id = v_user_id OR id = v_user_id;

  -- Limpiar presencias de otros usuarios inactivas > 3 min de forma transparente
  PERFORM public.cleanup_inactive_user_presence(3);

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'timestamp', NOW()
  );
END;
$$;

-- 4. RPC para finalizar sesión (Logout limpio)
CREATE OR REPLACE FUNCTION public.end_user_session()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autenticado');
  END IF;

  UPDATE public.profiles
  SET 
    is_online = FALSE,
    last_seen_at = NOW(),
    updated_at = NOW()
  WHERE user_id = v_user_id OR id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Actualización de get_admin_dashboard_metrics() con conteos precisos de presencia
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
  -- 5.1 Ejecutar limpieza de presencias inactivas previamente (> 2 min)
  PERFORM public.cleanup_inactive_user_presence(2);

  -- 5.2 Usuarios Registrados vs Online
  SELECT COUNT(*) INTO v_registered_users FROM public.profiles;
  SELECT COUNT(*) INTO v_connected_users FROM public.profiles WHERE is_online = TRUE AND last_seen_at >= (NOW() - INTERVAL '2 minutes');
  
  -- Usuarios activos en las últimas 24h
  SELECT COUNT(*) INTO v_active_users FROM public.profiles WHERE last_seen_at >= (NOW() - INTERVAL '24 hours');

  -- 5.3 Mesas y Partidas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_tables') THEN
    SELECT COUNT(*) INTO v_active_tables FROM public.game_tables WHERE status IN ('OPEN', 'WAITING_PLAYERS', 'FULL', 'WAITING', 'IN_GAME', 'STARTING');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_sessions') THEN
    SELECT COUNT(*) INTO v_active_matches FROM public.game_sessions WHERE status IN ('IN_PROGRESS', 'WAITING', 'STARTING');
    SELECT COUNT(*) INTO v_finished_matches FROM public.game_sessions WHERE status IN ('SETTLED', 'COMPLETED', 'FINISHED');
  END IF;

  -- 5.4 Solicitudes pendientes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deposit_requests') THEN
    SELECT COUNT(*) INTO v_pending_deposits FROM public.deposit_requests WHERE status = 'PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'withdrawal_requests') THEN
    SELECT COUNT(*) INTO v_pending_withdrawals FROM public.withdrawal_requests WHERE status = 'PENDING';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'support_tickets') THEN
    SELECT COUNT(*) INTO v_pending_tickets FROM public.support_tickets WHERE status IN ('OPEN', 'IN_PROGRESS');
  END IF;

  -- 5.5 Volúmenes y comisiones
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_settlements') THEN
    SELECT COALESCE(SUM(gross_pool), 0), COALESCE(SUM(prize_pool), 0), COALESCE(SUM(platform_fee), 0)
    INTO v_total_volume, v_total_prizes, v_total_fees
    FROM public.game_settlements;
  END IF;

  -- 5.6 Alertas de seguridad
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

-- Otorgar permisos
GRANT EXECUTE ON FUNCTION public.cleanup_inactive_user_presence(INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_user_heartbeat(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_user_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
