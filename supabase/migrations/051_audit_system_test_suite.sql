-- ==============================================================================
-- MIGRACIÓN 051: SISTEMA DE AUDITORÍA Y TEST DEL SISTEMA (Raspando La Olla)
-- ==============================================================================
-- Proporciona funciones RPC para inspección y limpieza segura de datos de prueba (AUDIT_TEST)
-- con control de roles (OPERATOR, ADMIN, SUPER_ADMIN) preservando intactos todos los registros reales.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_audit_test_summary(
  p_test_prefix VARCHAR DEFAULT 'AUDIT_TEST'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_test_tables_count INT := 0;
  v_test_actions_count INT := 0;
  v_test_tickets_count INT := 0;
  v_test_logs_count INT := 0;
  v_real_tables_count INT := 0;
  v_real_wallets_count INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT COUNT(*) INTO v_test_tables_count
  FROM public.game_tables
  WHERE name LIKE p_test_prefix || '%' OR invite_code LIKE 'AUDIT%';

  SELECT COUNT(*) INTO v_test_actions_count
  FROM public.game_actions ga
  JOIN public.game_tables gt ON ga.table_id = gt.id
  WHERE gt.name LIKE p_test_prefix || '%';

  SELECT COUNT(*) INTO v_test_tickets_count
  FROM public.polla_tickets
  WHERE transaction_id LIKE p_test_prefix || '%';

  SELECT COUNT(*) INTO v_test_logs_count
  FROM public.audit_logs
  WHERE action LIKE p_test_prefix || '%';

  SELECT COUNT(*) INTO v_real_tables_count
  FROM public.game_tables
  WHERE (name IS NULL OR name NOT LIKE p_test_prefix || '%');

  SELECT COUNT(*) INTO v_real_wallets_count
  FROM public.wallets;

  RETURN jsonb_build_object(
    'success', true,
    'test_prefix', p_test_prefix,
    'test_tables_count', v_test_tables_count,
    'test_actions_count', v_test_actions_count,
    'test_tickets_count', v_test_tickets_count,
    'test_logs_count', v_test_logs_count,
    'real_tables_count', v_real_tables_count,
    'real_wallets_count', v_real_wallets_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cleanup_audit_test_data(
  p_test_prefix VARCHAR DEFAULT 'AUDIT_TEST'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role VARCHAR(50);
  v_deleted_tables INT := 0;
  v_deleted_actions INT := 0;
  v_deleted_tickets INT := 0;
  v_deleted_logs INT := 0;
  v_remaining_real_tables INT := 0;
  v_remaining_real_wallets INT := 0;
  v_test_table_ids UUID[];
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;

  SELECT ARRAY_AGG(id) INTO v_test_table_ids
  FROM public.game_tables
  WHERE name LIKE p_test_prefix || '%' OR invite_code LIKE 'AUDIT%';

  IF v_test_table_ids IS NOT NULL AND ARRAY_LENGTH(v_test_table_ids, 1) > 0 THEN
    WITH deleted_a AS (
      DELETE FROM public.game_actions
      WHERE table_id = ANY(v_test_table_ids)
      RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_actions FROM deleted_a;

    DELETE FROM public.game_table_players
    WHERE table_id = ANY(v_test_table_ids);

    DELETE FROM public.game_sessions
    WHERE table_id = ANY(v_test_table_ids);

    WITH deleted_t AS (
      DELETE FROM public.game_tables
      WHERE id = ANY(v_test_table_ids)
      RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_tables FROM deleted_t;
  END IF;

  WITH deleted_p AS (
    DELETE FROM public.polla_tickets
    WHERE transaction_id LIKE p_test_prefix || '%'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_tickets FROM deleted_p;

  WITH deleted_l AS (
    DELETE FROM public.audit_logs
    WHERE action LIKE p_test_prefix || '%'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_logs FROM deleted_l;

  INSERT INTO public.audit_logs (user_id, action, entity_type, details)
  VALUES (
    v_caller_id,
    'ADMIN_CLEANUP_AUDIT_TEST_DATA',
    'SYSTEM',
    jsonb_build_object(
      'prefix', p_test_prefix,
      'deleted_tables', v_deleted_tables,
      'deleted_actions', v_deleted_actions,
      'deleted_tickets', v_deleted_tickets,
      'deleted_logs', v_deleted_logs,
      'executor_role', v_caller_role
    )
  );

  SELECT COUNT(*) INTO v_remaining_real_tables
  FROM public.game_tables;

  SELECT COUNT(*) INTO v_remaining_real_wallets
  FROM public.wallets;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_tables', v_deleted_tables,
    'deleted_actions', v_deleted_actions,
    'deleted_tickets', v_deleted_tickets,
    'deleted_logs', v_deleted_logs,
    'remaining_real_tables', v_remaining_real_tables,
    'remaining_real_wallets', v_remaining_real_wallets,
    'message', 'Limpieza de datos de auditoría completada con éxito. Todos los datos reales, cuentas de usuario, monederos y partidas normales se preservaron intactos.'
  );
END;
$$;
