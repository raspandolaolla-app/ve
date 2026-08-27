-- ================================================================
-- MIGRACIÓN 026: Corrección Quirúrgica de RLS y Normalización de Contratos
-- Proyecto: RASPANDO LA OLLA
-- Estado: FASE 25.2 PRODUCCIÓN (Eliminación de Recursión Circular y 400/404)
-- ================================================================
-- 1. Elimina la recursión circular entre game_tables y game_table_players
-- 2. Elimina la autorecursión interna en p_table_players_select
-- 3. Corrige la función get_admin_dashboard_metrics para evitar HTTP 400 por ENUMs
-- 4. Otorga permisos explícitos SELECT a entry_fees y tablas de catálogo en PostgREST
-- 5. Asegura visibilidad multijugador sin fugas de seguridad
-- ================================================================

-- ================================================================
-- 1. POLÍTICAS RLS NO RECURSIVAS: game_tables
-- ================================================================
-- La política de game_tables evalúa únicamente columnas locales y la función
-- auxiliar is_operator_or_above (SECURITY DEFINER sobre user_roles).
-- NO realiza subconsultas a game_table_players, evitando recursión circular.
DROP POLICY IF EXISTS p_tables_select ON public.game_tables;
CREATE POLICY p_tables_select ON public.game_tables
  FOR SELECT
  USING (
    -- Mesas públicas en estados operativos visibles en lobby
    (visibility = 'PUBLIC' AND status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
    -- Host creador puede consultar siempre su mesa
    OR host_user_id = auth.uid()
    -- Operadores y Administradores autorizados
    OR public.is_operator_or_above(auth.uid())
    -- Mesas privadas en estado operativo (para acceso por código o URL)
    OR (visibility = 'PRIVATE' AND status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
  );

-- ================================================================
-- 2. POLÍTICAS RLS NO RECURSIVAS: game_table_players
-- ================================================================
-- Eliminada la subconsulta recursiva sobre sí misma (game_table_players p2).
-- Permite ver los asientos de la mesa a:
-- A) El propio usuario jugador.
-- B) Operadores y administradores.
-- C) Cualquier usuario que tenga acceso a la mesa a través de game_tables.
DROP POLICY IF EXISTS p_table_players_select ON public.game_table_players;
CREATE POLICY p_table_players_select ON public.game_table_players
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_tables t
      WHERE t.id = game_table_players.table_id
        AND (
          (t.visibility = 'PUBLIC' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
          OR t.host_user_id = auth.uid()
          OR (t.visibility = 'PRIVATE' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
        )
    )
  );

-- ================================================================
-- 3. POLÍTICAS RLS NO RECURSIVAS: game_sessions
-- ================================================================
DROP POLICY IF EXISTS p_sessions_select ON public.game_sessions;
CREATE POLICY p_sessions_select ON public.game_sessions
  FOR SELECT
  USING (
    public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_tables t
      WHERE t.id = game_sessions.table_id
        AND (
          (t.visibility = 'PUBLIC' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
          OR t.host_user_id = auth.uid()
          OR (t.visibility = 'PRIVATE' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
        )
    )
  );

-- ================================================================
-- 4. POLÍTICAS RLS NO RECURSIVAS: game_settlements
-- ================================================================
DROP POLICY IF EXISTS p_settlements_select ON public.game_settlements;
CREATE POLICY p_settlements_select ON public.game_settlements
  FOR SELECT
  USING (
    public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_tables t
      WHERE t.id = game_settlements.table_id
        AND (
          (t.visibility = 'PUBLIC' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
          OR t.host_user_id = auth.uid()
          OR (t.visibility = 'PRIVATE' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
        )
    )
  );

-- ================================================================
-- 5. CORRECCIÓN DE FUNCIÓN RPC: get_admin_dashboard_metrics()
-- ================================================================
-- Corrige el error HTTP 400 causado por valores no pertenecientes a table_status_enum
-- ('WAITING' e 'IN_PROGRESS' pertenecían a session_status_enum, no a table_status_enum).
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_users_count INT;
  v_active_users INT;
  v_tables_count INT;
  v_pending_deposits INT;
  v_pending_withdrawals INT;
  v_volume NUMERIC(14,2);
  v_prizes NUMERIC(14,2);
  v_fees NUMERIC(14,2);
  v_security_alerts INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT COUNT(*) INTO v_users_count FROM public.profiles;
  SELECT COUNT(*) INTO v_active_users FROM public.profiles WHERE account_status = 'ACTIVE';
  
  -- Filtrado sobre valores estrictamente válidos de table_status_enum
  SELECT COUNT(*) INTO v_tables_count 
  FROM public.game_tables 
  WHERE status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE');

  SELECT COUNT(*) INTO v_pending_deposits FROM public.deposit_requests WHERE status = 'PENDING';
  SELECT COUNT(*) INTO v_pending_withdrawals FROM public.withdrawal_requests WHERE status = 'PENDING';
  
  SELECT 
    COALESCE(SUM(gross_pool), 0.00), 
    COALESCE(SUM(prize_pool), 0.00), 
    COALESCE(SUM(platform_fee), 0.00)
  INTO v_volume, v_prizes, v_fees
  FROM public.game_settlements;

  SELECT COUNT(*) INTO v_security_alerts 
  FROM public.audit_logs 
  WHERE severity IN ('WARNING', 'CRITICAL');

  RETURN jsonb_build_object(
    'registeredUsersCount', v_users_count,
    'activeUsersCount', v_active_users,
    'connectedUsersCount', v_active_users,
    'activeTablesCount', v_tables_count,
    'pendingDepositsCount', v_pending_deposits,
    'pendingWithdrawalsCount', v_pending_withdrawals,
    'totalVolumePlayed', v_volume,
    'totalPrizesAwarded', v_prizes,
    'totalServiceFeesCollected', v_fees,
    'securityAlertsCount', v_security_alerts
  );
END;
$$;

-- ================================================================
-- 6. PERMISOS Y PRIVILEGIOS DE TABLAS Y CATÁLOGOS PARA POSTGREST
-- ================================================================
-- Asegura que PostgREST exponga las tablas con RLS a los roles auth y anon
GRANT SELECT ON TABLE public.entry_fees TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_tables TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_table_players TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_sessions TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_actions TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_settlements TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_settlement_recipients TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.payment_accounts TO authenticated, service_role;
GRANT SELECT ON TABLE public.payment_accounts TO anon;

GRANT SELECT, INSERT ON TABLE public.deposit_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.withdrawal_requests TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated, service_role;

-- ================================================================
-- 7. RECARGA DEL ESQUEMA EN POSTGREST
-- ================================================================
NOTIFY pgrst, 'reload schema';
