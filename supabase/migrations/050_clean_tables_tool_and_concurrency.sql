-- ==============================================================================
-- MIGRACIÓN 050: HERRAMIENTA LIMPIAR MESAS, CONCURRENCIA Y AUDITORÍA
-- Proyecto: PULSOPLAY (Raspando la Olla)
-- ==============================================================================
-- Proporciona funciones RPC con control de concurrencia (FOR UPDATE),
-- seguridad RLS (SECURITY DEFINER sobre user_roles), auditoría detallada
-- y depuración limpia de mesas vacías sin alterar registros financieros ni historial.
-- ==============================================================================

-- 1. REEMPLAZAR O CREAR EL RPC DE TERMINAR MESA (admin_terminate_game_table)
CREATE OR REPLACE FUNCTION public.admin_terminate_game_table(
  p_table_id UUID,
  p_reason VARCHAR DEFAULT 'Terminación administrativa por operador',
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
  v_player RECORD;
  v_wallet RECORD;
  v_already_refunded BOOLEAN := FALSE;
  v_refund_count INT := 0;
  v_initial_players INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  -- Bloquear mesa para control de concurrencia (FOR UPDATE)
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MESA_YA_PROCESADA',
      'message', 'La mesa de juego no existe o ya fue eliminada',
      'refunded_count', 0
    );
  END IF;

  IF v_table.status IN ('CLOSED', 'TERMINATED', 'CANCELLED') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MESA_YA_PROCESADA',
      'action', 'ALREADY_TERMINATED',
      'message', 'La mesa ya fue procesada o terminada por otro administrador',
      'refunded_count', 0
    );
  END IF;

  v_initial_players := COALESCE(v_table.current_players_count, 0);

  -- 1. Cancelar sesiones activas/pendientes de la mesa
  UPDATE public.game_sessions
  SET status = 'CANCELLED'::session_status_enum,
      ended_at = NOW()
  WHERE table_id = p_table_id AND status NOT IN ('SETTLED', 'CANCELLED');

  -- 2. Procesar reembolsos si corresponde
  IF p_refund_players AND v_table.entry_fee > 0.00 THEN
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
            'Reembolso por terminación administrativa de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
            'admin_terminate_refund_' || p_table_id::text || '_' || v_player.user_id::text,
            NOW()
          );

          v_refund_count := v_refund_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Marcar participaciones de jugadores como 'LEFT'
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND status != 'LEFT';

  -- 4. Marcar la mesa como TERMINATED
  UPDATE public.game_tables
  SET status = 'TERMINATED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  -- 5. Registrar evento en auditoría (MESA_TERMINADA)
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
    'MESA_TERMINADA',
    'GAME_TABLE',
    p_table_id::text,
    CASE WHEN v_initial_players > 0 THEN 'CRITICAL' ELSE 'WARNING' END,
    jsonb_build_object(
      'table_id', p_table_id,
      'invite_code', v_table.invite_code,
      'game_type', v_table.game_type,
      'reason', p_reason,
      'refund_players', p_refund_players,
      'refunded_count', v_refund_count,
      'initial_players', v_initial_players,
      'entry_fee', v_table.entry_fee,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'action', 'MESA_TERMINADA',
    'refunded_count', v_refund_count
  );
END;
$$;


-- 2. REEMPLAZAR O CREAR EL RPC DE LIMPIAR MESA INDIVIDUAL (admin_cleanup_game_table)
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
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  -- Bloquear registro para concurrencia
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MESA_YA_PROCESADA',
      'message', 'La mesa ya fue procesada o eliminada por otro administrador',
      'cleaned_items_count', 0
    );
  END IF;

  -- Si la mesa tiene jugadores activos y está en progreso/espera, no permitir eliminación directa sin terminar
  IF v_table.current_players_count > 0 AND v_table.status IN ('OPEN', 'WAITING_PLAYERS', 'FULL', 'WAITING', 'IN_GAME', 'STARTING', 'PAUSED') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MESA_CON_JUGADORES',
      'message', 'Esta mesa tiene ' || v_table.current_players_count || ' jugadores activos. No puede eliminarse directamente. Debes terminarla primero.',
      'current_players', v_table.current_players_count
    );
  END IF;

  -- Eliminar dependencias temporales de la mesa
  DELETE FROM public.game_table_players WHERE table_id = p_table_id;
  
  -- Eliminar la entidad de mesa vacía/terminada
  DELETE FROM public.game_tables WHERE id = p_table_id;
  v_cleaned_count := 1;

  -- Registrar en auditoría (MESA_VACIA_ELIMINADA / MESA_LIMPIADA)
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
    'MESA_VACIA_ELIMINADA',
    'GAME_TABLE',
    p_table_id::text,
    'INFO',
    jsonb_build_object(
      'table_id', p_table_id,
      'invite_code', v_table.invite_code,
      'game_type', v_table.game_type,
      'previous_status', v_table.status,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'action', 'MESA_VACIA_ELIMINADA',
    'cleaned_items_count', v_cleaned_count
  );
END;
$$;


-- 3. NUEVO RPC: LIMPIEZA MASIVA GLOBAL DE MESAS VACÍAS (admin_cleanup_empty_tables)
CREATE OR REPLACE FUNCTION public.admin_cleanup_empty_tables()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role VARCHAR(50);
  v_table RECORD;
  v_cleaned_tables_count INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  -- Seleccionar y procesar todas las mesas vacías o finalizadas
  FOR v_table IN
    SELECT id, invite_code, game_type, status, current_players_count 
    FROM public.game_tables 
    WHERE (COALESCE(current_players_count, 0) = 0 
       OR status IN ('CLOSED', 'TERMINATED', 'CANCELLED', 'EXPIRED', 'FINISHED'))
    FOR UPDATE
  LOOP
    -- Eliminar registros de jugadores asociados a la mesa
    DELETE FROM public.game_table_players WHERE table_id = v_table.id;
    -- Eliminar la mesa vacía
    DELETE FROM public.game_tables WHERE id = v_table.id;

    v_cleaned_tables_count := v_cleaned_tables_count + 1;
  END LOOP;

  -- Auditoría masiva (LIMPIEZA_MASIVA)
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
    'LIMPIEZA_MASIVA',
    'GAME_TABLE',
    'GLOBAL_CLEANUP',
    'INFO',
    jsonb_build_object(
      'cleaned_tables_count', v_cleaned_tables_count,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'LIMPIEZA_MASIVA',
    'processed_count', v_cleaned_tables_count,
    'message', 'Limpieza completada: ' || v_cleaned_tables_count || ' mesas procesadas.'
  );
END;
$$;
