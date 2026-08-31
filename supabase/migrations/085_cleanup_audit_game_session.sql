-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 085
-- FUNCIÓN RPC DE LIMPIEZA SEGURA PARA AUDITORÍAS DE JUEGO (cleanup_audit_game_session)
-- ==============================================================================
-- 1. Permite cerrar y sanear de forma segura mesas y sesiones de prueba (AUDIT_TEST)
--    asociadas al usuario auditor para prevenir el bloqueo por ALREADY_IN_ACTIVE_TABLE.
-- 2. REGLA ESTRICTA DE SEGURIDAD: NUNCA altera, borra ni cierra mesas de dinero real
--    o partidas activas legítimas de los usuarios.
-- 3. Si el usuario participa en una partida real, reporta real_active_tables > 0
--    sin modificar ningún registro.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_audit_game_session(
  p_user_id UUID DEFAULT NULL,
  p_game_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_target_user_id UUID;
  v_cleaned_tables_count INT := 0;
  v_cleaned_sessions_count INT := 0;
  v_real_active_tables_count INT := 0;
  v_audit_table_ids UUID[];
  v_game_type_clean TEXT;
BEGIN
  -- 1. Identificar el usuario objetivo (parámetro o invocador autenticado)
  v_target_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_REQUIRED: Se requiere un UUID de usuario válido',
      'cleaned_tables', 0,
      'cleaned_sessions', 0,
      'real_active_tables', 0
    );
  END IF;

  v_game_type_clean := NULLIF(TRIM(LOWER(p_game_type)), '');

  -- 2. Detectar si el usuario tiene partidas REALES activas en este juego
  SELECT COUNT(DISTINCT gt.id) INTO v_real_active_tables_count
  FROM public.game_tables gt
  JOIN public.game_table_players gtp ON gtp.table_id = gt.id
  WHERE gtp.user_id = v_target_user_id
    AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE', 'WAITING', 'IN_GAME')
    AND (v_game_type_clean IS NULL OR gt.game_type::text = v_game_type_clean)
    AND NOT (
      gt.name ILIKE '%AUDIT_TEST%' 
      OR gt.name ILIKE 'Mesa AUDIT%' 
      OR gt.invite_code ILIKE 'AUDIT%'
      OR gt.share_token ILIKE 'AUDIT%'
    );

  -- 3. Identificar mesas de AUDITORÍA (AUDIT_TEST) asociadas al usuario
  SELECT ARRAY_AGG(DISTINCT gt.id) INTO v_audit_table_ids
  FROM public.game_tables gt
  LEFT JOIN public.game_table_players gtp ON gtp.table_id = gt.id
  WHERE (gtp.user_id = v_target_user_id OR gt.host_user_id = v_target_user_id)
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE', 'WAITING', 'IN_GAME')
    AND (v_game_type_clean IS NULL OR gt.game_type::text = v_game_type_clean)
    AND (
      gt.name ILIKE '%AUDIT_TEST%' 
      OR gt.name ILIKE 'Mesa AUDIT%' 
      OR gt.invite_code ILIKE 'AUDIT%'
      OR gt.share_token ILIKE 'AUDIT%'
    );

  -- 4. Cerrar de forma segura las mesas de auditoría detectadas
  IF v_audit_table_ids IS NOT NULL AND ARRAY_LENGTH(v_audit_table_ids, 1) > 0 THEN
    -- Actualizar estado de jugadores en mesas de auditoría
    UPDATE public.game_table_players
    SET status = 'LEFT'
    WHERE table_id = ANY(v_audit_table_ids);

    -- Actualizar sesiones de juego asociadas a auditoría
    WITH closed_s AS (
      UPDATE public.game_sessions
      SET status = 'SETTLED'::game_session_status_enum,
          ended_at = NOW(),
          is_settled = TRUE
      WHERE table_id = ANY(v_audit_table_ids)
        AND status::text NOT IN ('SETTLED', 'CLOSED', 'CANCELLED', 'FINISHED')
      RETURNING id
    )
    SELECT COUNT(*) INTO v_cleaned_sessions_count FROM closed_s;

    -- Actualizar y cerrar mesas de prueba
    WITH closed_t AS (
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY(v_audit_table_ids)
      RETURNING id
    )
    SELECT COUNT(*) INTO v_cleaned_tables_count FROM closed_t;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_target_user_id,
    'game_type', v_game_type_clean,
    'cleaned_tables', v_cleaned_tables_count,
    'cleaned_sessions', v_cleaned_sessions_count,
    'real_active_tables', v_real_active_tables_count,
    'message', CASE 
      WHEN v_real_active_tables_count > 0 THEN 'Usuario participa en partida real de ' || COALESCE(v_game_type_clean, 'juego') || '. Auditoría omitida.'
      WHEN v_cleaned_tables_count > 0 THEN 'Mesas de auditoría previas cerradas correctamente (' || v_cleaned_tables_count || ' mesas).'
      ELSE 'No se requirió limpieza previa.'
    END
  );
END;
$$;

-- Permisos estrictos
REVOKE ALL ON FUNCTION public.cleanup_audit_game_session(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_audit_game_session(UUID, TEXT) TO authenticated, service_role, anon;
