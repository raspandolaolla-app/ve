-- ==============================================================================
-- MIGRACIÓN 043: CORRECCIÓN DEFINITIVA DE LIMPIAR / TERMINAR MESA Y COLUMNA UPDATED_AT
-- Proyecto: PULSOPLAY (Raspando la Olla)
-- ==============================================================================

-- 1. Garantizar de forma segura que la columna updated_at exista en game_table_players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'game_table_players' 
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.game_table_players ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- 2. REEMPLAZAR O CREAR EL RPC DE TERMINAR MESA (admin_terminate_game_table)
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
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  -- Bloquear mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa de juego no existe';
  END IF;

  IF v_table.status IN ('CLOSED', 'TERMINATED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'ALREADY_TERMINATED',
      'message', 'La mesa ya se encuentra terminada o cerrada',
      'refunded_count', 0
    );
  END IF;

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
      -- Verificar idempotencia en ledger
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

  -- 5. Registrar en auditoría
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
    'GAME_TABLE_TERMINATED',
    'GAME_TABLE',
    p_table_id::text,
    'CRITICAL',
    jsonb_build_object(
      'table_id', p_table_id,
      'reason', p_reason,
      'refund_players', p_refund_players,
      'refunded_count', v_refund_count,
      'entry_fee', v_table.entry_fee,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'action', 'TERMINATED',
    'refunded_count', v_refund_count
  );
END;
$$;


-- 3. REEMPLAZAR O CREAR EL RPC DE LIMPIAR MESA (admin_cleanup_game_table)
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
  v_player RECORD;
  v_wallet RECORD;
  v_cleaned_count INT := 0;
  v_refund_count INT := 0;
  v_already_refunded BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'ACCESO_RESTRINGIDO: Se requieren permisos de Operador o Administrador';
  END IF;

  SELECT role::text INTO v_caller_role FROM public.user_roles WHERE user_id = v_caller_id LIMIT 1;
  v_caller_role := COALESCE(v_caller_role, 'ADMIN');

  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa con ID % no existe', p_table_id;
  END IF;

  -- Si la mesa aún está activa o abierta, realizar cierre administrativo seguro primero
  IF v_table.status IN ('OPEN', 'WAITING_PLAYERS', 'FULL', 'WAITING', 'IN_GAME', 'STARTING', 'PAUSED') THEN
    -- Cancelar sesiones no liquidadas
    UPDATE public.game_sessions
    SET status = 'CANCELLED'::session_status_enum,
        ended_at = NOW()
    WHERE table_id = p_table_id AND status NOT IN ('SETTLED', 'CANCELLED');

    -- Reembolsar a jugadores activos con cuota retenida
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
              'Reembolso por limpieza/cierre de mesa #' || COALESCE(v_table.invite_code, substring(p_table_id::text from 1 for 6)),
              'admin_clean_refund_' || p_table_id::text || '_' || v_player.user_id::text,
              NOW()
            );

            v_refund_count := v_refund_count + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Marcar jugadores como desconectados
    UPDATE public.game_table_players
    SET status = 'LEFT'::player_table_status_enum,
        left_at = NOW(),
        updated_at = NOW()
    WHERE table_id = p_table_id AND status != 'LEFT';

    -- Cerrar la mesa
    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        current_players_count = 0,
        closed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_table_id;
  END IF;

  -- Depurar registros efímeros/abandonados
  WITH deleted_players AS (
    DELETE FROM public.game_table_players
    WHERE table_id = p_table_id AND status IN ('LEFT', 'DISCONNECTED')
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cleaned_count FROM deleted_players;

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
    'GAME_TABLE_CLEANUP',
    'GAME_TABLE',
    p_table_id::text,
    'INFO',
    jsonb_build_object(
      'table_id', p_table_id,
      'cleaned_items_count', v_cleaned_count,
      'refunded_count', v_refund_count,
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'action', 'CLEANED',
    'cleaned_items_count', v_cleaned_count,
    'refunded_count', v_refund_count
  );
END;
$$;
