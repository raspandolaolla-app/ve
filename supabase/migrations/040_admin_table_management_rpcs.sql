-- ==============================================================================
-- MIGRACIÓN 040: FUNCIONES Y RPCS PARA ADMINISTRACIÓN Y TERMINACIÓN DE MESAS
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / SEGURIDAD DEFINER CON RBAC (OPERADOR Y SUPERADMIN)
-- ==============================================================================

-- 1. Asegurar valores enum para estado de mesas y ledger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'table_status_enum'::regtype AND enumlabel = 'TERMINATED'
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'TERMINATED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'ledger_entry_type_enum'::regtype AND enumlabel = 'TABLE_ENTRY_REFUND'
  ) THEN
    ALTER TYPE public.ledger_entry_type_enum ADD VALUE 'TABLE_ENTRY_REFUND';
  END IF;
END $$;

-- 2. RPC: Terminar Mesa de Juego (SECURITY DEFINER)
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
  v_effective_reason TEXT;
BEGIN
  -- Verificar autenticación y permisos de Operador o superior
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador para terminar mesas';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  -- Lock y verificación de la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa con ID % no existe', p_table_id;
  END IF;

  v_effective_reason := COALESCE(NULLIF(trim(p_reason), ''), 'Terminación administrativa por operador');

  -- Si la mesa ya se encuentra terminada o cerrada
  IF v_table.status IN ('TERMINATED', 'CLOSED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'table_id', p_table_id,
      'action', 'ALREADY_TERMINATED',
      'refunded_count', 0,
      'message', 'La mesa ya se encontraba terminada o cerrada'
    );
  END IF;

  -- Cancelar todas las sesiones activas de juego para esta mesa
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

  -- Procesar reembolsos de cuota de entrada si fue indicado y la entrada > 0
  IF p_refund_players AND COALESCE(v_table.entry_fee, 0) > 0 THEN
    FOR v_player IN (
      SELECT DISTINCT user_id 
      FROM public.game_table_players 
      WHERE table_id = p_table_id AND user_id IS NOT NULL
    ) LOOP
      SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_player.user_id FOR UPDATE;
      IF FOUND THEN
        UPDATE public.wallets
        SET available_balance = available_balance + v_table.entry_fee,
            total_balance = total_balance + v_table.entry_fee,
            updated_at = NOW()
        WHERE id = v_wallet.id;

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
    END LOOP;
  END IF;

  -- Actualizar estado de los participantes a LEFT
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW()
  WHERE table_id = p_table_id AND status != 'LEFT';

  -- Actualizar la mesa a TERMINATED
  UPDATE public.game_tables
  SET status = 'TERMINATED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  -- Registrar en audit_logs para trazabilidad forense
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

-- 3. RPC: Limpiar Datos Efímeros de Mesa (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_cleanup_game_table(
  p_table_id UUID
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
  v_cleaned_count INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador para limpiar mesas';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa con ID % no existe', p_table_id;
  END IF;

  -- Depurar registros de presencia abandonados/desconectados
  WITH deleted_players AS (
    DELETE FROM public.game_table_players
    WHERE table_id = p_table_id AND status IN ('LEFT', 'DISCONNECTED')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cleaned_count FROM deleted_players;

  -- Si la mesa está sin jugadores activos, asegurar que figure como CERRADA
  IF (SELECT COUNT(*) FROM public.game_table_players WHERE table_id = p_table_id) = 0 THEN
    IF v_table.status IN ('OPEN', 'FULL', 'STARTING') THEN
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          current_players_count = 0,
          closed_at = NOW(),
          updated_at = NOW()
      WHERE id = p_table_id;
    END IF;

    -- Cancelar sesiones huérfanas sin liquidar
    UPDATE public.game_sessions
    SET status = 'CANCELLED'::session_status_enum,
        ended_at = NOW()
    WHERE table_id = p_table_id AND status NOT IN ('SETTLED', 'CANCELLED');
  END IF;

  -- Auditoría de la limpieza
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
    'ADMIN_CLEANUP_GAME_TABLE',
    'GAME_TABLE',
    p_table_id::text,
    'INFO'::audit_severity_enum,
    jsonb_build_object(
      'table_id', p_table_id,
      'cleaned_items_count', v_cleaned_count,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'cleaned_items_count', v_cleaned_count,
    'message', 'Limpieza de datos efímeros completada correctamente'
  );
END;
$$;

-- 4. RPC: Limpieza Automática de Mesas Expiradas (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_auto_clean_expired_tables(
  p_inactive_minutes INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role VARCHAR(50);
  v_cutoff TIMESTAMPTZ;
  v_expired_count INT := 0;
  v_table_record RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  v_cutoff := NOW() - (COALESCE(p_inactive_minutes, 15) || ' minutes')::INTERVAL;

  FOR v_table_record IN (
    SELECT id, status, entry_fee 
    FROM public.game_tables
    WHERE status IN ('OPEN', 'FULL', 'STARTING')
      AND created_at < v_cutoff
      AND (
        SELECT COUNT(*) FROM public.game_table_players WHERE table_id = id AND status IN ('JOINED', 'READY', 'PLAYING')
      ) = 0
    FOR UPDATE
  ) LOOP
    UPDATE public.game_tables
    SET status = 'EXPIRED'::table_status_enum,
        current_players_count = 0,
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_table_record.id;

    UPDATE public.game_sessions
    SET status = 'CANCELLED'::session_status_enum,
        ended_at = NOW()
    WHERE table_id = v_table_record.id AND status NOT IN ('SETTLED', 'CANCELLED');

    v_expired_count := v_expired_count + 1;
  END LOOP;

  IF v_expired_count > 0 THEN
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
      'ADMIN_AUTO_CLEANUP_EXPIRED_TABLES',
      'GAME_TABLE_BATCH',
      'AUTO_CLEANUP',
      'INFO'::audit_severity_enum,
      jsonb_build_object(
        'expired_tables_count', v_expired_count,
        'inactive_minutes_threshold', p_inactive_minutes,
        'timestamp', NOW()
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expired_tables_count', v_expired_count,
    'message', 'Política de limpieza automática ejecutada con éxito'
  );
END;
$$;

-- 5. Concesión de Permisos
GRANT EXECUTE ON FUNCTION public.admin_terminate_game_table(UUID, TEXT, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_cleanup_game_table(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_auto_clean_expired_tables(INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
