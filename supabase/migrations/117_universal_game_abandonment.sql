-- ==============================================================================
-- MIGRACIÓN 117: SISTEMA UNIVERSAL DE ABANDONO DE PARTIDA (VOLUNTARIO E INVOLUNTARIO)
-- ==============================================================================
-- 1. Asegurar valores 'ABANDONED' en tipos enumerados player_table_status_enum y session_status_enum
-- 2. Compatibilidad en game_actions para admitir action_data además de payload
-- 3. Función canónica public.abandon_game_secure(p_session_id UUID, p_idempotency_key TEXT)
-- 4. Función de daemon public.process_expired_turns() para abandono por tiempo agotado
-- ==============================================================================

DO $$
BEGIN
  -- Agregar ABANDONED a player_table_status_enum si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.player_table_status_enum'::regtype
      AND enumlabel = 'ABANDONED'
  ) THEN
    ALTER TYPE public.player_table_status_enum ADD VALUE 'ABANDONED';
  END IF;

  -- Agregar ABANDONED a session_status_enum si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.session_status_enum'::regtype
      AND enumlabel = 'ABANDONED'
  ) THEN
    ALTER TYPE public.session_status_enum ADD VALUE 'ABANDONED';
  END IF;
END $$;

-- Asegurar columnas y restricciones flexibles en game_actions para auditoría universal
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_actions') THEN
    ALTER TABLE public.game_actions ADD COLUMN IF NOT EXISTS action_data JSONB;
    ALTER TABLE public.game_actions ALTER COLUMN payload DROP NOT NULL;
    ALTER TABLE public.game_actions ALTER COLUMN server_state_hash DROP NOT NULL;
    ALTER TABLE public.game_actions ALTER COLUMN sequence_number DROP NOT NULL;
    ALTER TABLE public.game_actions ALTER COLUMN idempotency_key DROP NOT NULL;
  END IF;
END $$;

-- ==============================================================================
-- FUNCIÓN UNIFICADA DE ABANDONO DE PARTIDA (Todos los juegos)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.abandon_game_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_game_type TEXT;
  v_entry_fee NUMERIC(14,2) := 0.00;
  v_opponent_id UUID;
  v_prize_pool NUMERIC(14,2) := 0.00;
  v_effective_idempotency TEXT;
  v_next_seq INT := 1;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_AUTENTICADO');
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abn_' || p_session_id::text || '_' || v_user_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  -- 1. Obtener datos con bloqueo para evitar condiciones de carrera
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  v_game_type := LOWER(COALESCE(v_table.game_type::text, v_session.game_type::text, ''));
  v_entry_fee := COALESCE(v_table.entry_fee, 0.00);

  IF v_session.status::text IN ('FINISHED', 'finished', 'CANCELLED', 'cancelled', 'ABANDONED', 'abandoned', 'SETTLED', 'settled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'JUEGO_YA_FINALIZADO');
  END IF;

  -- 2. Marcar al jugador como ABANDONED en la mesa
  UPDATE public.game_table_players
  SET status = 'ABANDONED'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = v_session.table_id 
    AND user_id = v_user_id 
    AND status::text NOT IN ('ABANDONED', 'LEFT');

  -- 3. Lógica específica según el tipo de juego
  IF v_game_type IN ('atrapaito', 'chess', 'checkers', 'tictactoe', 'tic_tac_toe', 'rps', 'rock_paper_scissors', 'domino', 'domino_venezolano', 'truco', 'truco_venezolano', 'una_olla', 'unaolla') THEN
    -- Para juegos 1vs1 / tablero: buscar al oponente restante activo
    SELECT user_id INTO v_opponent_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id 
      AND user_id != v_user_id 
      AND status::text NOT IN ('ABANDONED', 'LEFT')
    LIMIT 1;

    IF v_opponent_id IS NOT NULL THEN
      -- Liquidar de manera segura usando settle_game_session si está disponible
      BEGIN
        PERFORM public.settle_game_session(
          p_session_id,
          ARRAY[v_opponent_id],
          NULL,
          v_effective_idempotency || '_settle'
        );
      EXCEPTION WHEN OTHERS THEN
        -- Fallback de liquidación directa 90/10
        v_prize_pool := (v_entry_fee * 2.00) * 0.90;
        IF v_prize_pool > 0.00 THEN
          UPDATE public.wallets
          SET available_balance = available_balance + v_prize_pool,
              updated_at = NOW()
          WHERE user_id = v_opponent_id AND currency = 'VES';
        END IF;
      END;
      
      -- Finalizar sesión y declarar ganador por abandono
      UPDATE public.game_sessions
      SET status = 'FINISHED'::session_status_enum,
          winner_user_id = v_opponent_id,
          current_state = jsonb_set(
            COALESCE(current_state, '{}'::jsonb),
            '{winner}',
            '"OPPONENT_BY_ABANDON"'::jsonb
          ),
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = p_session_id;

      -- Cerrar la mesa correspondiente
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = v_session.table_id;
    ELSE
      -- Si no quedó ningún oponente, cancelar la sesión y cerrar la mesa
      UPDATE public.game_sessions
      SET status = 'CANCELLED'::session_status_enum,
          ended_at = NOW(),
          updated_at = NOW()
      WHERE id = p_session_id;

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = v_session.table_id;
    END IF;

  ELSIF v_game_type = 'bingo' THEN
    -- En Bingo, abandonar no detiene el juego para el resto de la sala
    UPDATE public.game_sessions
    SET current_state = jsonb_set(
        COALESCE(current_state, '{}'::jsonb),
        '{abandonedPlayers}', 
        COALESCE(current_state->'abandonedPlayers', '[]'::jsonb) || to_jsonb(v_user_id::text)
    ),
    updated_at = NOW()
    WHERE id = p_session_id;
  END IF;

  -- 4. Registrar la acción de abandono en el historial de jugadas
  BEGIN
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_seq
    FROM public.game_actions
    WHERE session_id = p_session_id;

    INSERT INTO public.game_actions (
      session_id, user_id, sequence_number, action_type, payload, action_data,
      is_valid, server_state_hash, idempotency_key, created_at
    ) VALUES (
      p_session_id, v_user_id, v_next_seq, 'ABANDON',
      jsonb_build_object('reason', 'VOLUNTARY', 'user_id', v_user_id),
      jsonb_build_object('reason', 'VOLUNTARY', 'user_id', v_user_id),
      true, 'abandon_hash', v_effective_idempotency || '_act', NOW()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Si falla el registro secundario en game_actions, no bloquear la transacción principal
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'message', 'Has abandonado la partida correctamente');
END;
$$;

-- ==============================================================================
-- FUNCIÓN PARA DETECTAR ABANDONO POR TIEMPO AGOTADO (Para el Daemon de Backend)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.process_expired_turns()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_expired_session RECORD;
  v_opponent_id UUID;
  v_prize_pool NUMERIC(14,2);
  v_entry_fee NUMERIC(14,2);
  v_next_seq INT := 1;
BEGIN
  FOR v_expired_session IN 
    SELECT gs.id, gs.table_id, gs.current_turn_user_id, gt.game_type, gt.entry_fee
    FROM public.game_sessions gs
    JOIN public.game_tables gt ON gt.id = gs.table_id
    WHERE gs.status::text IN ('ACTIVE', 'active', 'IN_PROGRESS', 'in_progress', 'STARTING', 'starting', 'READY', 'ready')
      AND gs.turn_expires_at IS NOT NULL
      AND gs.turn_expires_at < NOW()
      AND gs.current_turn_user_id IS NOT NULL
    FOR UPDATE OF gs SKIP LOCKED
  LOOP
    -- Si es un juego 1vs1 y se acaba el tiempo, el rival gana automáticamente
    IF LOWER(v_expired_session.game_type::text) IN ('atrapaito', 'chess', 'checkers', 'tictactoe', 'tic_tac_toe', 'rps', 'rock_paper_scissors', 'domino', 'domino_venezolano', 'truco', 'truco_venezolano') THEN
      SELECT user_id INTO v_opponent_id
      FROM public.game_table_players
      WHERE table_id = v_expired_session.table_id 
        AND user_id != v_expired_session.current_turn_user_id 
        AND status::text NOT IN ('ABANDONED', 'LEFT')
      LIMIT 1;

      IF v_opponent_id IS NOT NULL THEN
        v_entry_fee := COALESCE(v_expired_session.entry_fee, 0.00);

        BEGIN
          PERFORM public.settle_game_session(
            v_expired_session.id,
            ARRAY[v_opponent_id],
            NULL,
            'timeout_' || v_expired_session.id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
          );
        EXCEPTION WHEN OTHERS THEN
          v_prize_pool := (v_entry_fee * 2.00) * 0.90;
          IF v_prize_pool > 0.00 THEN
            UPDATE public.wallets
            SET available_balance = available_balance + v_prize_pool,
                updated_at = NOW()
            WHERE user_id = v_opponent_id AND currency = 'VES';
          END IF;
        END;
        
        UPDATE public.game_sessions
        SET status = 'FINISHED'::session_status_enum,
            winner_user_id = v_opponent_id,
            current_state = jsonb_set(
              COALESCE(current_state, '{}'::jsonb),
              '{winner}',
              '"OPPONENT_BY_ABANDON"'::jsonb
            ),
            ended_at = NOW(),
            updated_at = NOW()
        WHERE id = v_expired_session.id;

        UPDATE public.game_tables
        SET status = 'CLOSED'::table_status_enum,
            closed_at = NOW(),
            current_players_count = 0,
            updated_at = NOW()
        WHERE id = v_expired_session.table_id;

        BEGIN
          SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_seq
          FROM public.game_actions
          WHERE session_id = v_expired_session.id;

          INSERT INTO public.game_actions (
            session_id, user_id, sequence_number, action_type, payload, action_data,
            is_valid, server_state_hash, idempotency_key, created_at
          ) VALUES (
            v_expired_session.id,
            v_expired_session.current_turn_user_id,
            v_next_seq,
            'TIMEOUT_ABANDON',
            jsonb_build_object('reason', 'TURN_EXPIRED', 'winner_id', v_opponent_id),
            jsonb_build_object('reason', 'TURN_EXPIRED', 'winner_id', v_opponent_id),
            true, 'timeout_hash', 'timeout_' || v_expired_session.id::text || '_' || EXTRACT(EPOCH FROM NOW())::text, NOW()
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.abandon_game_secure(UUID, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.process_expired_turns() TO service_role, authenticated, anon;
NOTIFY pgrst, 'reload schema';
