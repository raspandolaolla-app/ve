-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 103: RESOLVER SOBRECARGA AMBIGUA EN SERVER_BINGO_OPERATION
-- ==============================================================================
-- Elimina la función sobrecargada redundante (uuid, text, uuid) para permitir
-- que PostgREST resuelva inequívocamente las llamadas RPC con parámetros nombrados
-- (p_operation, p_session_id, p_user_id) sin conflicto PGRST203.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.server_bingo_operation(uuid, text, uuid);

-- Asegurar permisos EXECUTE para authenticated y anon en la variante canónica
GRANT EXECUTE ON FUNCTION public.server_bingo_operation(text, uuid, uuid) TO anon, authenticated, service_role;
