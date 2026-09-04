-- ================================================================
-- MIGRACIÓN 116: ELIMINAR AMBIGÜEDAD EN RPC abandon_game_table_secure
-- Proyecto: RASPANDO LA OLLA 🇻🇪
-- Fecha: 2026-09-03
-- Descripción:
--   1. Elimina todas las sobrecargas conflictivas de abandon_game_table_secure
--      que usaban (UUID, UUID, VARCHAR), (UUID, VARCHAR), (UUID, UUID) etc.,
--      evitando el error de PostgREST:
--      "Could not choose the best candidate function between ... character varying ... text".
--   2. Establece la versión definitiva canónica con p_idempotency_key TEXT DEFAULT NULL.
--   3. Integra resolución atómica para partidas activas (incluyendo Atrapaíto y juegos 1v1),
--      reembolso de entradas pre-partida y notificación de recarga de esquema.
-- ================================================================

-- 1. ELIMINAR TODAS LAS FIRMAS ANTERIORES Y AMBIGUAS
DROP FUNCTION IF EXISTS public.abandon_game_table_secure(UUID, UUID, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.abandon_game_table_secure(UUID, UUID, VARCHAR);
DROP FUNCTION IF EXISTS public.abandon_game_table_secure(UUID, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.abandon_game_table_secure(UUID, VARCHAR);
DROP FUNCTION IF EXISTS public.abandon_game_table_secure(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.abandon_game_table_secure(UUID, TEXT);
DROP FUNCTION IF EXISTS public.abandon_game_table_secure(UUID, UUID);
DROP FUNCTION IF EXISTS public.abandon_game_table_secure(UUID);

-- 2. CREAR LA VERSIÓN DEFINITIVA Y CANÓNICA CON TEXT
CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_table RECORD;
  v_player RECORD;
  v_session RECORD;
  v_wallet RECORD;
  v_active_players_count INTEGER;
  v_remaining_player RECORD;
  v_effective_idempotency TEXT;
  v_refund_amount NUMERIC(14,2) := 0.00;
  v_session_is_active BOOLEAN := false;
  v_settle_result JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_AUTHENTICATED');
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abn_' || p_table_id::text || '_' || v_caller_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  -- 1. Obtener mesa con bloqueo pesimista
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
  END IF;

  -- 2. Obtener sesión activa si existe
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE id = p_session_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE table_id = p_table_id
      AND status IN ('ACTIVE'::session_status_enum, 'READY'::session_status_enum, 'STARTING'::session_status_enum, 'PAUSED'::session_status_enum)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_session.id IS NOT NULL AND v_session.status = 'ACTIVE'::session_status_enum THEN
    v_session_is_active := true;
  END IF;

  -- 3. Obtener y actualizar registro del jugador a 'LEFT'
  SELECT * INTO v_player
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND user_id = v_caller_id
    AND status IN ('JOINED'::player_table_status_enum, 'READY'::player_table_status_enum, 'PLAYING'::player_table_status_enum)
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.game_table_players
    SET status = 'LEFT'::player_table_status_enum,
        left_at = NOW(),
        updated_at = NOW()
    WHERE id = v_player.id;
  ELSE
    -- Verificar si ya estaba marcado como LEFT
    SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
    FROM public.game_table_players
    WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum;

    RETURN jsonb_build_object(
      'success', true,
      'already_left', true,
      'table_id', p_table_id,
      'remaining_players', v_active_players_count
    );
  END IF;

  -- 4. Reembolso pre-partida si la partida NO ha comenzado y había cuota de entrada
  IF NOT v_session_is_active AND v_table.entry_fee > 0.00 THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_caller_id AND currency = 'VES'
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.wallets
      SET available_balance = available_balance + v_table.entry_fee,
          updated_at = NOW()
      WHERE id = v_wallet.id;

      INSERT INTO public.ledger_entries (
        wallet_id,
        user_id,
        amount,
        currency,
        entry_type,
        direction,
        reference_id,
        reference_table,
        reference_type,
        balance_after,
        balance_after_available,
        balance_after_held,
        idempotency_key,
        description,
        created_at
      ) VALUES (
        v_wallet.id,
        v_caller_id,
        v_table.entry_fee,
        'VES',
        'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
        'CREDIT'::ledger_direction_enum,
        p_table_id,
        'game_tables',
        'game_tables',
        COALESCE(v_wallet.available_balance, 0.00) + v_table.entry_fee,
        COALESCE(v_wallet.available_balance, 0.00) + v_table.entry_fee,
        COALESCE(v_wallet.held_balance, 0.00),
        v_effective_idempotency || '_refund',
        'Reembolso por abandono de mesa antes del inicio',
        NOW()
      );
      v_refund_amount := v_table.entry_fee;
    END IF;
  END IF;

  -- 5. Contar jugadores restantes en la mesa
  SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum;

  -- 6. Si la partida estaba activa y queda 1 solo jugador: victoria por abandono (Forfeit)
  IF v_session_is_active AND v_session.id IS NOT NULL THEN
    IF v_active_players_count = 1 THEN
      SELECT user_id INTO v_remaining_player
      FROM public.game_table_players
      WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum
      LIMIT 1;

      IF v_remaining_player.user_id IS NOT NULL THEN
        -- Si es Atrapaíto, usar liquidación especializada si existe
        IF v_table.game_type::text = 'atrapaito' THEN
          BEGIN
            PERFORM public.credit_atrapaito_winner(v_session.id, v_remaining_player.user_id);
          EXCEPTION WHEN OTHERS THEN
            -- Fallback a settle_game_session estándar
            PERFORM public.settle_game_session(
              v_session.id,
              ARRAY[v_remaining_player.user_id],
              NULL,
              'forfeit_' || v_session.id::text || '_' || v_remaining_player.user_id::text
            );
          END;
        ELSE
          PERFORM public.settle_game_session(
            v_session.id,
            ARRAY[v_remaining_player.user_id],
            NULL,
            'forfeit_' || v_session.id::text || '_' || v_remaining_player.user_id::text
          );
        END IF;

        UPDATE public.game_sessions
        SET status = 'FINISHED'::session_status_enum,
            winner_user_id = v_remaining_player.user_id,
            ended_at = NOW()
        WHERE id = v_session.id;
      END IF;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = p_table_id;

    ELSIF v_active_players_count = 0 THEN
      UPDATE public.game_sessions
      SET status = 'CANCELLED'::session_status_enum,
          ended_at = NOW()
      WHERE id = v_session.id;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = p_table_id;
    END IF;
  ELSE
    -- Si la mesa previa quedó con 0 jugadores, cerrarla
    IF v_active_players_count = 0 THEN
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = p_table_id;
    ELSE
      UPDATE public.game_tables
      SET current_players_count = v_active_players_count,
          updated_at = NOW()
      WHERE id = p_table_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'session_id', v_session.id,
    'remaining_players', v_active_players_count,
    'refund_amount', v_refund_amount
  );
END;
$$;

-- Otorgar permisos a los roles necesarios
GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role, anon;

-- Notificar a PostgREST para recargar el esquema inmediatamente
NOTIFY pgrst, 'reload schema';
