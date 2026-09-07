-- ==============================================================================
-- MIGRACIÓN 153: AUDITORÍA FORENSE DE SEGUNDA PASADA
-- HARDENING FINANCIERO: WALLET + LEDGER (HOLD -> RELEASE -> CAPTURE)
-- SETTLEMENT 90/10 + GAME SETTLEMENT RECIPIENTS AUDIT
-- ASIGNACIÓN DE ASIENTOS CONCURRENTE (ROW-LEVEL SEAT RECLAIMING)
-- ABANDONO MULTIJUGADOR / EQUIPOS ROBUSTO Y REEMBOLSOS IDEMPOTENTES
-- ==============================================================================

-- 0. DROPS PREVIOS DE FUNCIONES PARA EVITAR CONFLICTOS DE DEFAULT PARAMETERS (ERROR 42P13)
DROP FUNCTION IF EXISTS public.universal_settle_game_session(UUID, UUID[], INT, TEXT);
DROP FUNCTION IF EXISTS public.refund_game_session(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.refund_game_session(UUID, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.abandon_game_secure(UUID, TEXT);
DROP FUNCTION IF EXISTS public.create_quick_match_table(UUID, TEXT, NUMERIC, INT, BOOLEAN);
DROP FUNCTION IF EXISTS public.join_table_transaction(UUID, SMALLINT, VARCHAR);

-- 1. CORRECCIÓN CANÓNICA DE join_table_transaction
-- Usa 'TABLE_ENTRY_HOLD' como tipo de ledger estandarizado, asigna entry_held_entry_id
-- y aplica limpieza a nivel de fila (ROW-LEVEL SEAT RECLAIM) de asientos con status = 'LEFT'
-- garantizando concurrencia total sin colisiones de asientos.
CREATE OR REPLACE FUNCTION public.join_table_transaction(
  p_table_id UUID,
  p_seat_number SMALLINT DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_table RECORD;
  v_existing_player RECORD;
  v_assigned_seat SMALLINT;
  v_seat_iter SMALLINT;
  v_wallet_id UUID;
  v_wallet_available NUMERIC;
  v_wallet_held NUMERIC;
  v_ledger_id UUID := NULL;
  v_player_id UUID;
  v_new_count INT;
  v_effective_key VARCHAR(100);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para unirte a una mesa';
  END IF;

  -- 1. Bloqueo de la mesa
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa especificada no existe';
  END IF;

  -- BLOQUEO DE SEGURIDAD BACKEND: VERIFICAR DISPONIBILIDAD DEL JUEGO
  IF NOT public.is_game_enabled(v_table.game_type::text) THEN
    RAISE EXCEPTION 'GAME_DISABLED: Este juego se encuentra temporalmente deshabilitado por el administrador.';
  END IF;

  IF v_table.status::text NOT IN ('OPEN', 'WAITING', 'READY') THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: La mesa no está abierta para nuevos jugadores (estado: %)', v_table.status;
  END IF;

  -- 2. Verificar si el usuario ya pertenece a esta mesa
  SELECT * INTO v_existing_player
  FROM public.game_table_players
  WHERE table_id = p_table_id AND user_id = v_user_id;

  IF FOUND AND v_existing_player.status IN ('JOINED', 'READY', 'PLAYING') THEN
    RETURN jsonb_build_object(
      'success', true,
      'table_id', p_table_id,
      'seat_number', v_existing_player.seat_number,
      'message', 'Ya perteneces a esta mesa',
      'is_already_joined', true,
      'current_players_count', v_table.current_players_count
    );
  END IF;

  IF v_table.current_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: La mesa ya ha alcanzado su capacidad máxima';
  END IF;

  -- 3. Asignar asiento disponible (excluyendo a los que salieron)
  IF p_seat_number IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.game_table_players
      WHERE table_id = p_table_id
        AND seat_number = p_seat_number
        AND status != 'LEFT'::player_table_status_enum
    ) THEN
      RAISE EXCEPTION 'SEAT_TAKEN: El asiento % ya está ocupado', p_seat_number;
    END IF;
    v_assigned_seat := p_seat_number;
  ELSE
    v_assigned_seat := NULL;
    FOR v_seat_iter IN 1..v_table.max_players LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.game_table_players
        WHERE table_id = p_table_id
          AND seat_number = v_seat_iter
          AND status != 'LEFT'::player_table_status_enum
      ) THEN
        v_assigned_seat := v_seat_iter;
        EXIT;
      END IF;
    END LOOP;

    IF v_assigned_seat IS NULL THEN
      RAISE EXCEPTION 'NO_SEATS_AVAILABLE: No hay asientos disponibles en esta mesa';
    END IF;
  END IF;

  -- LIMPIEZA DE ASIENTO LIBERADO: Si un jugador anterior con status = 'LEFT' ocupaba este asiento,
  -- se libera la fila inactiva para evitar colisión de índice único
  DELETE FROM public.game_table_players
  WHERE table_id = p_table_id
    AND seat_number = v_assigned_seat
    AND status = 'LEFT'::player_table_status_enum
    AND user_id != v_user_id;

  -- 4. Validar saldo y retención (HOLD) si hay tarifa de entrada
  IF v_table.entry_fee > 0 THEN
    SELECT id, available_balance, held_balance
    INTO v_wallet_id, v_wallet_available, v_wallet_held
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, available_balance, held_balance, currency)
      VALUES (v_user_id, 0.00, 0.00, 'VES')
      ON CONFLICT (user_id) DO NOTHING;

      SELECT id, available_balance, held_balance
      INTO v_wallet_id, v_wallet_available, v_wallet_held
      FROM public.wallets
      WHERE user_id = v_user_id
      FOR UPDATE;
    END IF;

    IF v_wallet_available < v_table.entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Tu saldo disponible (% Bs.) no cubre la entrada (% Bs.)',
        COALESCE(v_wallet_available, 0.00), v_table.entry_fee;
    END IF;

    -- Movimiento atómico: Disminuye available_balance y aumenta held_balance
    UPDATE public.wallets
    SET available_balance = available_balance - v_table.entry_fee,
        held_balance = held_balance + v_table.entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    v_effective_key := COALESCE(
      p_idempotency_key,
      'join_hold_' || p_table_id::text || '_' || v_user_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
    );

    -- Registrar en ledger como TABLE_ENTRY_HOLD (HOLD financiero)
    INSERT INTO public.ledger_entries (
      wallet_id,
      user_id,
      amount,
      currency,
      entry_type,
      direction,
      reference_table,
      reference_type,
      reference_id,
      description,
      idempotency_key,
      balance_after,
      balance_after_available,
      balance_after_held,
      created_at
    ) VALUES (
      v_wallet_id,
      v_user_id,
      v_table.entry_fee,
      'VES',
      'TABLE_ENTRY_HOLD'::ledger_entry_type_enum,
      'DEBIT'::ledger_direction_enum,
      'game_tables',
      'game_table',
      p_table_id,
      'Retención de entrada a mesa: ' || COALESCE(v_table.name, v_table.invite_code, p_table_id::text),
      v_effective_key,
      v_wallet_available - v_table.entry_fee,
      v_wallet_available - v_table.entry_fee,
      v_wallet_held + v_table.entry_fee,
      NOW()
    ) RETURNING id INTO v_ledger_id;
  END IF;

  -- 5. Insertar o reactivar registro del jugador en la mesa
  IF v_existing_player.id IS NOT NULL THEN
    UPDATE public.game_table_players
    SET status = 'JOINED'::player_table_status_enum,
        seat_number = v_assigned_seat,
        entry_held_entry_id = COALESCE(v_ledger_id, entry_held_entry_id),
        left_at = NULL,
        joined_at = NOW(),
        updated_at = NOW()
    WHERE id = v_existing_player.id
    RETURNING id INTO v_player_id;
  ELSE
    INSERT INTO public.game_table_players (
      table_id,
      user_id,
      seat_number,
      entry_held_entry_id,
      status,
      joined_at,
      updated_at
    ) VALUES (
      p_table_id,
      v_user_id,
      v_assigned_seat,
      v_ledger_id,
      'JOINED'::player_table_status_enum,
      NOW(),
      NOW()
    ) RETURNING id INTO v_player_id;
  END IF;

  -- 6. Actualizar contador de jugadores en la mesa
  SELECT COUNT(*) INTO v_new_count
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND status IN ('JOINED', 'READY', 'PLAYING');

  UPDATE public.game_tables
  SET current_players_count = v_new_count,
      status = CASE
        WHEN v_new_count >= v_table.max_players THEN 'FULL'::table_status_enum
        ELSE 'OPEN'::table_status_enum
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'player_id', v_player_id,
    'seat_number', v_assigned_seat,
    'current_players_count', v_new_count,
    'max_players', v_table.max_players,
    'status', CASE WHEN v_new_count >= v_table.max_players THEN 'FULL' ELSE 'OPEN' END
  );
END;
$$;

-- 2. MEJORA Y AUDITORÍA DE universal_settle_game_session
-- Vincula game_settlement_recipients, acepta TABLE_ENTRY_HOLD y BET_PLACED, y gestiona 90/10 exacto
CREATE OR REPLACE FUNCTION public.universal_settle_game_session(
  p_session_id UUID,
  p_winner_user_ids UUID[],
  p_winner_team INT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_table RECORD;
  v_rule RECORD;
  v_winner_pct NUMERIC(5,2) := 90.00;
  v_platform_pct NUMERIC(5,2) := 10.00;
  v_entry_fee NUMERIC(14,2) := 0.00;
  v_gross_pool NUMERIC(14,2) := 0.00;
  v_platform_fee NUMERIC(14,2) := 0.00;
  v_prize_pool NUMERIC(14,2) := 0.00;
  v_individual_prize NUMERIC(14,2) := 0.00;
  v_effective_idempotency TEXT;
  v_settlement_id UUID;
  v_existing_settlement RECORD;
  v_winners_count INTEGER := 0;
  v_primary_winner_id UUID := NULL;
  v_winner_id UUID;
  v_player_id UUID;
  v_table_players UUID[];
  v_total_players INTEGER := 0;
  v_player_wallet RECORD;
  v_winner_wallet RECORD;
  v_is_draw BOOLEAN := false;
  v_settlement_type settlement_type_enum;
  v_ledger_entry_id UUID;
BEGIN
  -- 1. Obtener y bloquear la sesión
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: La sesión de juego % no existe', p_session_id;
  END IF;

  -- 2. Idempotencia: Verificar si ya fue liquidada
  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'settle_' || p_session_id::text
  );

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'session_id', p_session_id,
      'table_id', v_existing_settlement.table_id,
      'gross_pool', v_existing_settlement.gross_pool,
      'platform_fee', v_existing_settlement.platform_fee,
      'prize_pool', v_existing_settlement.prize_pool,
      'settlement_id', v_existing_settlement.id
    );
  END IF;

  IF v_session.status = 'FINISHED'::session_status_enum THEN
    RAISE EXCEPTION 'SESSION_ALREADY_FINISHED: La sesión ya concluyó';
  END IF;

  -- 3. Obtener y bloquear la mesa
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa vinculada a la sesión no existe';
  END IF;

  -- 4. Obtener reglas de distribución (Por defecto 90% Ganador / 10% Plataforma)
  SELECT * INTO v_rule
  FROM public.settlement_rules
  WHERE (game_type IS NULL OR game_type = v_table.game_type::text)
    AND is_active = true
  ORDER BY game_type NULLS LAST
  LIMIT 1;

  IF FOUND AND v_rule.winner_percentage IS NOT NULL THEN
    v_winner_pct := v_rule.winner_percentage;
    v_platform_pct := COALESCE(v_rule.platform_fee_percentage, 100.00 - v_winner_pct);
  END IF;

  -- 5. Obtener todos los participantes con trazabilidad completa (mesa, ledger y ganadores)
  -- Acepta tanto TABLE_ENTRY_HOLD como el legacy BET_PLACED
  SELECT COALESCE(ARRAY_AGG(DISTINCT u_id), ARRAY[]::UUID[]) INTO v_table_players
  FROM (
    SELECT user_id AS u_id FROM public.game_table_players WHERE table_id = v_table.id
    UNION
    SELECT user_id AS u_id FROM public.ledger_entries 
    WHERE reference_id = v_table.id 
      AND entry_type IN ('TABLE_ENTRY_HOLD'::ledger_entry_type_enum, 'BET_PLACED'::ledger_entry_type_enum)
    UNION
    SELECT unnest(p_winner_user_ids) AS u_id
  ) all_p
  WHERE u_id IS NOT NULL;

  v_winners_count := COALESCE(array_length(p_winner_user_ids, 1), 0);
  IF v_winners_count > 0 AND p_winner_user_ids[1] IS NOT NULL THEN
    v_primary_winner_id := p_winner_user_ids[1];
    v_is_draw := false;
    IF v_winners_count > 1 THEN
      v_settlement_type := 'SPLIT_PAYOUT'::settlement_type_enum;
    ELSE
      v_settlement_type := 'STANDARD_PAYOUT'::settlement_type_enum;
    END IF;
  ELSE
    v_settlement_type := 'DRAW_REFUND'::settlement_type_enum;
    v_is_draw := true;
  END IF;

  v_total_players := GREATEST(COALESCE(array_length(v_table_players, 1), 0), 2);
  v_entry_fee := COALESCE(v_table.entry_fee, 0.00);
  v_gross_pool := v_entry_fee * v_total_players;

  IF v_is_draw THEN
    v_platform_fee := 0.00;
    v_prize_pool := 0.00;
  ELSE
    v_platform_fee := ROUND(v_gross_pool * (v_platform_pct / 100.00), 2);
    v_prize_pool := v_gross_pool - v_platform_fee;
  END IF;

  -- 6. Insertar registro en game_settlements
  v_settlement_id := gen_random_uuid();
  INSERT INTO public.game_settlements (
    id,
    session_id,
    table_id,
    gross_pool,
    platform_fee,
    prize_pool,
    total_distributed,
    settlement_type,
    idempotency_key,
    settled_at
  ) VALUES (
    v_settlement_id,
    p_session_id,
    v_table.id,
    v_gross_pool,
    v_platform_fee,
    v_prize_pool,
    CASE WHEN v_is_draw THEN v_gross_pool ELSE v_prize_pool END,
    v_settlement_type,
    v_effective_idempotency,
    NOW()
  );

  -- 7. GESTIÓN FINANCIERA ATÓMICA DE FONDOS RETENIDOS (held_balance)
  IF v_entry_fee > 0.00 AND v_table_players IS NOT NULL AND array_length(v_table_players, 1) > 0 THEN
    FOREACH v_player_id IN ARRAY v_table_players LOOP
      SELECT * INTO v_player_wallet
      FROM public.wallets
      WHERE user_id = v_player_id
      FOR UPDATE;

      IF FOUND THEN
        IF v_is_draw THEN
          -- EMPATE TÉCNICO (RELEASE): Regresar saldo retenido a saldo disponible al 100%
          UPDATE public.wallets
          SET available_balance = available_balance + v_entry_fee,
              held_balance = GREATEST(0.00, held_balance - v_entry_fee),
              updated_at = NOW()
          WHERE id = v_player_wallet.id;

          INSERT INTO public.ledger_entries (
            id,
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
            gen_random_uuid(),
            v_player_wallet.id,
            v_player_id,
            v_entry_fee,
            'VES',
            'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            v_settlement_id,
            'game_settlements',
            'game_settlement',
            v_player_wallet.available_balance + v_entry_fee,
            v_player_wallet.available_balance + v_entry_fee,
            GREATEST(0.00, v_player_wallet.held_balance - v_entry_fee),
            v_effective_idempotency || '_refund_' || v_player_id::text,
            'Devolución de entrada por empate en ' || COALESCE(v_table.game_type::text, 'partida'),
            NOW()
          );
        ELSE
          -- PARTIDA NORMAL CON GANADOR (CAPTURE): Capturar y descontar definitivamente held_balance
          UPDATE public.wallets
          SET held_balance = GREATEST(0.00, held_balance - v_entry_fee),
              updated_at = NOW()
          WHERE id = v_player_wallet.id;

          INSERT INTO public.ledger_entries (
            id,
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
            gen_random_uuid(),
            v_player_wallet.id,
            v_player_id,
            v_entry_fee,
            'VES',
            'TABLE_ENTRY_CAPTURE'::ledger_entry_type_enum,
            'DEBIT'::ledger_direction_enum,
            v_settlement_id,
            'game_settlements',
            'game_settlement',
            v_player_wallet.available_balance,
            v_player_wallet.available_balance,
            GREATEST(0.00, v_player_wallet.held_balance - v_entry_fee),
            v_effective_idempotency || '_capture_' || v_player_id::text,
            'Captura de entrada para liquidación en ' || COALESCE(v_table.game_type::text, 'partida'),
            NOW()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 8. ACREDITACIÓN DE PREMIO A LOS GANADORES EN available_balance Y REGISTRO EN game_settlement_recipients
  IF NOT v_is_draw AND v_winners_count > 0 AND v_prize_pool > 0.00 THEN
    v_individual_prize := ROUND(v_prize_pool / v_winners_count, 2);

    FOREACH v_winner_id IN ARRAY p_winner_user_ids LOOP
      IF v_winner_id IS NOT NULL THEN
        SELECT * INTO v_winner_wallet
        FROM public.wallets
        WHERE user_id = v_winner_id
        FOR UPDATE;

        IF FOUND THEN
          UPDATE public.wallets
          SET available_balance = available_balance + v_individual_prize,
              updated_at = NOW()
          WHERE id = v_winner_wallet.id;

          v_ledger_entry_id := gen_random_uuid();

          INSERT INTO public.ledger_entries (
            id,
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
            v_ledger_entry_id,
            v_winner_wallet.id,
            v_winner_id,
            v_individual_prize,
            'VES',
            'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            v_settlement_id,
            'game_settlements',
            'game_settlement',
            v_winner_wallet.available_balance + v_individual_prize,
            v_winner_wallet.available_balance + v_individual_prize,
            v_winner_wallet.held_balance,
            v_effective_idempotency || '_win_' || v_winner_id::text,
            'Premio por victoria en partida (' || v_winner_pct::text || '% del pozo)',
            NOW()
          );

          -- Registro detallado de receptor de liquidación
          INSERT INTO public.game_settlement_recipients (
            id,
            settlement_id,
            user_id,
            team_number,
            payout_amount,
            ledger_entry_id,
            payout_status,
            created_at
          ) VALUES (
            gen_random_uuid(),
            v_settlement_id,
            v_winner_id,
            p_winner_team,
            v_individual_prize,
            v_ledger_entry_id,
            'COMPLETED',
            NOW()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 9. Actualizar estado oficial de la sesión
  UPDATE public.game_sessions
  SET status = (CASE WHEN v_is_draw THEN 'CANCELLED' ELSE 'FINISHED' END)::session_status_enum,
      winner_user_id = v_primary_winner_id,
      winner_team = p_winner_team,
      ended_at = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id;

  -- 10. Actualizar estado de la mesa y jugadores
  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_table.id;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = v_table.id AND status != 'LEFT'::player_table_status_enum;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'table_id', v_table.id,
    'gross_pool', v_gross_pool,
    'platform_fee', v_platform_fee,
    'prize_pool', v_prize_pool,
    'winner_percentage', v_winner_pct,
    'platform_percentage', v_platform_pct,
    'winner_user_id', v_primary_winner_id,
    'is_draw', v_is_draw,
    'settlement_id', v_settlement_id
  );
END;
$$;

-- 3. MEJORA Y AUDITORÍA DE abandon_game_secure
-- Soporta abandono 1v1 y equipos (2v2), liquidando al equipo oponente completo
CREATE OR REPLACE FUNCTION public.abandon_game_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_game_type TEXT;
  v_leaving_player RECORD;
  v_winner_ids UUID[] := ARRAY[]::UUID[];
  v_winning_team INT := NULL;
  v_effective_idempotency TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_AUTENTICADO');
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abn_' || p_session_id::text || '_' || v_user_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

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

  IF v_session.status::text IN ('FINISHED', 'CANCELLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'JUEGO_YA_FINALIZADO');
  END IF;

  -- Obtener registro del jugador que abandona
  SELECT * INTO v_leaving_player
  FROM public.game_table_players
  WHERE table_id = v_session.table_id AND user_id = v_user_id;

  -- Marcar jugador como ABANDONED
  UPDATE public.game_table_players
  SET status = 'ABANDONED'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = v_session.table_id 
     AND user_id = v_user_id 
     AND status::text NOT IN ('ABANDONED', 'LEFT');

  -- Lógica de liquidación por tipo de juego
  IF v_game_type IN (
    'atrapaito', 'chess', 'checkers', 'tictactoe', 'tic_tac_toe', 
    'rps', 'rock_paper_scissors', 'domino', 'domino_venezolano', 
    'truco', 'truco_venezolano', 'una_olla', 'unaolla'
  ) THEN
    -- Si el juego tiene asignación de equipos (ej. Domino 2v2 o Truco 2v2)
    IF v_leaving_player.team_number IS NOT NULL THEN
      SELECT ARRAY_AGG(user_id), MAX(team_number)
      INTO v_winner_ids, v_winning_team
      FROM public.game_table_players
      WHERE table_id = v_session.table_id
        AND team_number != v_leaving_player.team_number
        AND status::text NOT IN ('ABANDONED', 'LEFT');
    ELSE
      -- Juego 1v1 o individual
      SELECT ARRAY_AGG(user_id)
      INTO v_winner_ids
      FROM public.game_table_players
      WHERE table_id = v_session.table_id
        AND user_id != v_user_id
        AND status::text NOT IN ('ABANDONED', 'LEFT');
    END IF;

    IF v_winner_ids IS NOT NULL AND array_length(v_winner_ids, 1) > 0 THEN
      -- Liquidar autoritativamente con el oponente o equipo oponente como ganador(es)
      PERFORM public.universal_settle_game_session(
        p_session_id,
        v_winner_ids,
        v_winning_team,
        v_effective_idempotency || '_settle'
      );
    ELSE
      -- Sin oponentes activos: reembolsar íntegramente
      PERFORM public.refund_game_session(
        p_session_id,
        'Abandono sin oponentes activos',
        v_effective_idempotency || '_refund'
      );
    END IF;

  ELSIF v_game_type = 'bingo' THEN
    -- En Bingo, abandonar solo desmarca al jugador sin alterar el pozo comunitario
    UPDATE public.game_sessions
    SET current_state = jsonb_set(
        COALESCE(current_state, '{}'::jsonb),
        '{abandonedPlayers}',
        COALESCE(current_state->'abandonedPlayers', '[]'::jsonb) || to_jsonb(v_user_id::text)
    ),
    updated_at = NOW()
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Has abandonado la partida correctamente'
  );
END;
$$;

-- 4. MEJORA Y AUDITORÍA DE refund_game_session
-- Acepta TABLE_ENTRY_HOLD y BET_PLACED, idéntica trazabilidad
CREATE OR REPLACE FUNCTION public.refund_game_session(
  p_session_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_gross_pool NUMERIC(14,2) := 0.00;
  v_settlement_id UUID;
  v_player_id UUID;
  v_player_wallet RECORD;
  v_existing_settlement RECORD;
  v_effective_idempotency TEXT;
  v_refunded_count INT := 0;
  v_participants UUID[] := ARRAY[]::UUID[];
BEGIN
  v_caller_id := auth.uid();

  -- 1. Obtener y bloquear sesión
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión % no encontrada', p_session_id;
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada';
  END IF;

  -- 2. Idempotencia
  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'refund_' || p_session_id::text || '_' || COALESCE(v_caller_id::text, 'sys')
  );

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id AND settlement_type = 'ADMIN_CANCEL_REFUND'::settlement_type_enum;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_idempotent_replay', true,
      'settlement_id', v_existing_settlement.id
    );
  END IF;

  IF v_session.status = 'FINISHED'::session_status_enum THEN
    RAISE EXCEPTION 'INVALID_SESSION_STATUS: No se puede reembolsar una sesión ya liquidada y finalizada con ganador.';
  END IF;

  -- 3. Identificar TODOS los participantes que aportaron entrada (HOLD o legacy BET_PLACED)
  SELECT COALESCE(ARRAY_AGG(DISTINCT u_id), ARRAY[]::UUID[]) INTO v_participants
  FROM (
    SELECT user_id AS u_id FROM public.game_table_players WHERE table_id = v_table.id
    UNION
    SELECT user_id AS u_id FROM public.ledger_entries 
    WHERE reference_id = v_table.id 
      AND entry_type IN ('TABLE_ENTRY_HOLD'::ledger_entry_type_enum, 'BET_PLACED'::ledger_entry_type_enum)
    UNION
    SELECT user_id AS u_id FROM public.ledger_entries 
    WHERE reference_id = p_session_id 
      AND entry_type IN ('TABLE_ENTRY_HOLD'::ledger_entry_type_enum, 'BET_PLACED'::ledger_entry_type_enum)
  ) all_p
  WHERE u_id IS NOT NULL;

  v_gross_pool := COALESCE(v_table.entry_fee, 0.00) * GREATEST(COALESCE(array_length(v_participants, 1), 0), 1);

  -- 4. Registro de liquidación tipo ADMIN_CANCEL_REFUND
  v_settlement_id := gen_random_uuid();
  INSERT INTO public.game_settlements (
    id,
    session_id,
    table_id,
    settlement_type,
    gross_pool,
    prize_pool,
    platform_fee,
    total_distributed,
    idempotency_key,
    settled_at
  ) VALUES (
    v_settlement_id,
    p_session_id,
    v_table.id,
    'ADMIN_CANCEL_REFUND'::settlement_type_enum,
    v_gross_pool,
    0.00,
    0.00,
    v_gross_pool,
    v_effective_idempotency,
    NOW()
  );

  -- 5. Liberación íntegra de saldos retenidos a disponible (held_balance -> available_balance)
  IF COALESCE(v_table.entry_fee, 0.00) > 0.00 AND v_participants IS NOT NULL THEN
    FOREACH v_player_id IN ARRAY v_participants LOOP
      SELECT * INTO v_player_wallet
      FROM public.wallets
      WHERE user_id = v_player_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET available_balance = available_balance + v_table.entry_fee,
            held_balance = GREATEST(0.00, held_balance - v_table.entry_fee),
            updated_at = NOW()
        WHERE id = v_player_wallet.id;

        INSERT INTO public.ledger_entries (
          id,
          wallet_id,
          user_id,
          entry_type,
          direction,
          amount,
          currency,
          balance_after,
          balance_after_available,
          balance_after_held,
          reference_table,
          reference_type,
          reference_id,
          idempotency_key,
          description,
          actor_id,
          created_at
        ) VALUES (
          gen_random_uuid(),
          v_player_wallet.id,
          v_player_id,
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          'CREDIT'::ledger_direction_enum,
          v_table.entry_fee,
          'VES',
          v_player_wallet.available_balance + v_table.entry_fee,
          v_player_wallet.available_balance + v_table.entry_fee,
          GREATEST(0.00, v_player_wallet.held_balance - v_table.entry_fee),
          'game_sessions',
          'game_session',
          p_session_id,
          v_effective_idempotency || '_refund_' || v_player_id::text,
          'Reembolso de entrada por empate o cancelación: ' || COALESCE(p_reason, 'Sin motivo'),
          v_caller_id,
          NOW()
        );

        v_refunded_count := v_refunded_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 6. Actualización de Estados
  UPDATE public.game_sessions
  SET status = 'CANCELLED'::session_status_enum,
      ended_at = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_table.id;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = v_table.id AND status != 'LEFT'::player_table_status_enum;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'refunded_count', v_refunded_count,
    'gross_refunded', v_gross_pool
  );
END;
$$;

-- 5. ACTUALIZAR RPC LEGACY create_quick_match_table PARA BLOQUEO POR ADMINISTRADOR
CREATE OR REPLACE FUNCTION public.create_quick_match_table(
  p_host_user_id UUID,
  p_game_type TEXT,
  p_entry_fee NUMERIC,
  p_max_players INT,
  p_is_private BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_table_id UUID;
  v_table_code TEXT;
BEGIN
  -- BLOQUEO DE SEGURIDAD BACKEND: VERIFICAR DISPONIBILIDAD DEL JUEGO
  IF NOT public.is_game_enabled(p_game_type) THEN
    RAISE EXCEPTION 'GAME_DISABLED: Este juego se encuentra temporalmente deshabilitado por el administrador.';
  END IF;

  -- Generar código único de mesa
  v_table_code := upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
  
  -- Crear la mesa
  INSERT INTO public.game_tables (
    host_user_id,
    game_type,
    entry_fee,
    max_players,
    is_private,
    table_code,
    invite_code,
    status
  ) VALUES (
    p_host_user_id,
    p_game_type::game_type_enum,
    p_entry_fee,
    p_max_players,
    p_is_private,
    v_table_code,
    v_table_code,
    'OPEN'
  )
  RETURNING id INTO v_table_id;

  -- Agregar al host como primer jugador
  INSERT INTO public.game_table_players (
    table_id,
    user_id,
    seat_number,
    status
  ) VALUES (
    v_table_id,
    p_host_user_id,
    1,
    'JOINED'
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'table_code', v_table_code,
    'game_type', p_game_type,
    'entry_fee', p_entry_fee
  );
END;
$$;

-- 6. RECARGAR CACHÉ DE ESQUEMA POSTGREST
NOTIFY pgrst, 'reload schema';
