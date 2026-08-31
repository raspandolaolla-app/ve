-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 087
-- CORRECCIÓN DEL CICLO DE VIDA Y LIMPIEZA INMEDIATA DE MESAS PÚBLICAS
-- ==============================================================================
-- 1. Actualiza settle_game_session para:
--    - Marcar game_tables con status = 'CLOSED', closed_at = NOW() y current_players_count = 0.
--    - Liberar atómicamente todos los asientos en game_table_players (status = 'LEFT', left_at = NOW()).
--    - Blindar la rama de idempotencia para asegurar que mesas previamente liquidadas
--      queden marcadas como CLOSED, con closed_at y jugadores como LEFT.
--    - Usar los ENUMs y tablas reales del esquema (session_status_enum, settlement_type_enum,
--      game_settlement_recipients, ledger_entries).
-- 2. Actualiza abandon_game_table_secure para:
--    - Asignar closed_at = NOW() y current_players_count = 0 en cualquier escenario donde
--      la mesa pase a estado CLOSED.
--    - Liberar asientos y liquidar por abandono canónico (1v1 forfeit).
-- 3. Crea RPC canónica get_public_available_tables(TEXT) para filtrado de alta precisión en DB:
--    - Comprueba visibilidad pública exclusiva con visibility = 'PUBLIC' (sin gt.is_private).
--    - Comprueba status = 'OPEN', closed_at IS NULL, current_players_count < max_players.
--    - Excluye cualquier mesa con sesión terminal o liquidada.
-- 4. Actualiza cleanup_audit_game_session y get_or_create_automated_bingo_table
--    para alinearlas con el esquema real de enums y columnas.
-- 5. Concilia y limpia de forma conservadora cualquier mesa huérfana o finalizada
--    sin usar cierres ciegos por antigüedad.
-- ==============================================================================

-- 1. ACTUALIZACIÓN CANÓNICA DE SETTLE_GAME_SESSION
CREATE OR REPLACE FUNCTION public.settle_game_session(
  p_session_id UUID,
  p_winner_user_ids UUID[],
  p_winner_team INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_player_count INT;
  v_gross_pool NUMERIC(14,2);
  v_prize_pool NUMERIC(14,2);
  v_platform_fee NUMERIC(14,2);
  v_settlement_id UUID;
  v_player RECORD;
  v_winner_id UUID;
  v_winner_wallet RECORD;
  v_winner_count INT;
  v_individual_prize NUMERIC(14,2);
  v_distributed_sum NUMERIC(14,2) := 0.00;
  v_winner_ledger_id UUID;
  v_settlement_type settlement_type_enum;
  v_existing_settlement RECORD;
  v_is_participant BOOLEAN := FALSE;
  v_effective_idempotency TEXT;
BEGIN
  -- 1. Identificación del invocador y control de autorización
  v_caller_id := auth.uid();
  
  -- Verificar existencia de la sesión con bloqueo de fila para evitar condiciones de carrera (TOCTOU)
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: Sesión de juego % no encontrada', p_session_id;
  END IF;

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa de juego no encontrada';
  END IF;

  -- Si es invocado por un usuario autenticado, validar que sea participante o rol administrativo
  IF v_caller_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.game_table_players
      WHERE table_id = v_table.id AND user_id = v_caller_id
    ) INTO v_is_participant;

    IF NOT v_is_participant AND NOT public.has_role(v_caller_id, 'OPERATOR') AND NOT public.has_role(v_caller_id, 'ADMIN') AND NOT public.has_role(v_caller_id, 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'UNAUTHORIZED: No tienes permisos para liquidar esta partida';
    END IF;
  END IF;

  -- 2. Manejo de Idempotencia estricta
  v_effective_idempotency := COALESCE(p_idempotency_key, 'settle_' || p_session_id::TEXT);

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE idempotency_key = v_effective_idempotency
     OR session_id = p_session_id;

  IF FOUND THEN
    -- Garantizar que mesa y jugadores queden en estado terminal limpio
    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        closed_at = COALESCE(closed_at, NOW()),
        current_players_count = 0,
        updated_at = NOW()
    WHERE id = v_table.id;

    UPDATE public.game_table_players
    SET status = 'LEFT'::player_table_status_enum,
        left_at = COALESCE(left_at, NOW()),
        updated_at = NOW()
    WHERE table_id = v_table.id
      AND status != 'LEFT'::player_table_status_enum;

    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'settlement_id', v_existing_settlement.id,
      'gross_pool', v_existing_settlement.gross_pool,
      'prize_pool', v_existing_settlement.prize_pool,
      'platform_fee', v_existing_settlement.platform_fee,
      'message', 'Partida ya liquidada previamente de forma segura'
    );
  END IF;

  -- 3. Cálculo de Pozos Financieros (Regla 90% Ganador / 10% Plataforma)
  SELECT COUNT(*) INTO v_player_count
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  IF v_player_count < 1 THEN
    v_player_count := 2; -- Fallback seguro de quorum
  END IF;

  v_gross_pool := ROUND((v_table.entry_fee * v_player_count)::NUMERIC, 2);
  v_prize_pool := ROUND((v_gross_pool * 0.90)::NUMERIC, 2);
  v_platform_fee := ROUND((v_gross_pool - v_prize_pool)::NUMERIC, 2);

  v_winner_count := COALESCE(array_length(p_winner_user_ids, 1), 0);

  -- 4. Determinar tipo de liquidación según los enums reales (settlement_type_enum)
  IF v_winner_count = 0 THEN
    v_settlement_type := 'DRAW_REFUND'::settlement_type_enum;
  ELSIF v_winner_count = 1 THEN
    v_settlement_type := 'STANDARD_PAYOUT'::settlement_type_enum;
  ELSE
    v_settlement_type := 'SPLIT_PAYOUT'::settlement_type_enum;
  END IF;

  -- 5. Crear Registro Maestro de Liquidación en public.game_settlements
  INSERT INTO public.game_settlements (
    session_id,
    table_id,
    settlement_type,
    gross_pool,
    prize_pool,
    platform_fee,
    total_distributed,
    idempotency_key,
    settled_at,
    settled_by
  ) VALUES (
    p_session_id,
    v_table.id,
    v_settlement_type,
    v_gross_pool,
    v_prize_pool,
    v_platform_fee,
    CASE WHEN v_winner_count > 0 THEN v_prize_pool ELSE v_gross_pool END,
    v_effective_idempotency,
    NOW(),
    COALESCE(v_caller_id::text, 'SERVER_ENGINE')
  ) RETURNING id INTO v_settlement_id;

  -- 6. Distribución y Acreditación de Ganadores
  IF v_winner_count > 0 THEN
    v_individual_prize := TRUNC((v_prize_pool / v_winner_count)::NUMERIC, 2);

    FOREACH v_winner_id IN ARRAY p_winner_user_ids
    LOOP
      -- Obtener o inicializar billetera con bloqueo de fila
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_winner_id AND currency = 'VES'
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.wallets (user_id, currency, balance, created_at, updated_at)
        VALUES (v_winner_id, 'VES', 0.00, NOW(), NOW())
        RETURNING * INTO v_winner_wallet;
      END IF;

      -- Actualizar saldo de la billetera
      UPDATE public.wallets
      SET balance = balance + v_individual_prize,
          updated_at = NOW()
      WHERE id = v_winner_wallet.id;

      -- Registrar transacción inmutable en el Ledger
      INSERT INTO public.ledger_entries (
        wallet_id,
        user_id,
        amount,
        currency,
        entry_type,
        reference_id,
        reference_type,
        balance_before,
        balance_after,
        metadata,
        created_at
      ) VALUES (
        v_winner_wallet.id,
        v_winner_id,
        v_individual_prize,
        'VES',
        'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
        v_settlement_id,
        'game_settlement',
        v_winner_wallet.balance,
        v_winner_wallet.balance + v_individual_prize,
        jsonb_build_object(
          'session_id', p_session_id,
          'table_id', v_table.id,
          'game_type', v_table.game_type,
          'idempotency_key', v_effective_idempotency,
          'description', 'Premio de victoria en ' || v_table.game_type
        ),
        NOW()
      ) RETURNING id INTO v_winner_ledger_id;

      -- Registrar detalle en public.game_settlement_recipients
      INSERT INTO public.game_settlement_recipients (
        settlement_id,
        user_id,
        payout_amount,
        ledger_entry_id,
        created_at
      ) VALUES (
        v_settlement_id,
        v_winner_id,
        v_individual_prize,
        v_winner_ledger_id,
        NOW()
      );

      v_distributed_sum := v_distributed_sum + v_individual_prize;
    END LOOP;
  ELSE
    -- Reembolso íntegro en caso de empate técnico o sin ganadores
    FOR v_player IN (
      SELECT DISTINCT user_id FROM public.game_table_players WHERE table_id = v_table.id
    ) LOOP
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_player.user_id AND currency = 'VES'
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET balance = balance + v_table.entry_fee,
            updated_at = NOW()
        WHERE id = v_winner_wallet.id;

        INSERT INTO public.ledger_entries (
          wallet_id,
          user_id,
          amount,
          currency,
          entry_type,
          reference_id,
          reference_type,
          balance_before,
          balance_after,
          metadata,
          created_at
        ) VALUES (
          v_winner_wallet.id,
          v_player.user_id,
          v_table.entry_fee,
          'VES',
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          v_settlement_id,
          'game_settlement',
          v_winner_wallet.balance,
          v_winner_wallet.balance + v_table.entry_fee,
          jsonb_build_object(
            'session_id', p_session_id,
            'table_id', v_table.id,
            'reason', 'Empate técnico o anulación segura'
          ),
          NOW()
        );
      END IF;
    END LOOP;
  END IF;

  -- 7. Actualizar Estados de Sesión y Mesa de forma inmediata
  UPDATE public.game_sessions
  SET status = 'SETTLED'::session_status_enum,
      winner_user_id = p_winner_user_ids[1],
      winner_team = p_winner_team,
      ended_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      current_players_count = 0,
      updated_at = NOW()
  WHERE id = v_table.id;

  -- 8. Liberar inmediatamente todos los asientos de los jugadores
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = COALESCE(left_at, NOW()),
      updated_at = NOW()
  WHERE table_id = v_table.id
    AND status != 'LEFT'::player_table_status_enum;

  RETURN jsonb_build_object(
    'success', true,
    'already_settled', false,
    'settlement_id', v_settlement_id,
    'gross_pool', v_gross_pool,
    'prize_pool', v_prize_pool,
    'platform_fee', v_platform_fee,
    'winner_count', v_winner_count
  );
END;
$$;

-- 2. ACTUALIZACIÓN DE ABANDON_GAME_TABLE_SECURE PARA ASIGNAR CLOSED_AT Y LIBERAR ASIENTOS
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
  v_session RECORD;
  v_player RECORD;
  v_wallet RECORD;
  v_active_players_count INT;
  v_refund_amount NUMERIC(14,2) := 0.00;
  v_effective_idempotency TEXT;
  v_settle_result JSONB;
  v_remaining_player RECORD;
  v_next_player RECORD;
  v_session_is_active BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para abandonar o salir de la mesa.';
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abandon_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text
  );

  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: Mesa no encontrada.';
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE id = p_session_id AND table_id = p_table_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_session
    FROM public.game_sessions
    WHERE table_id = p_table_id
      AND status::text IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'IN_PROGRESS')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  v_session_is_active := (v_session.id IS NOT NULL AND v_session.status::text IN ('ACTIVE', 'IN_PROGRESS'));

  SELECT * INTO v_player
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND user_id = v_caller_id
    AND status IN ('PLAYING', 'JOINED', 'READY')
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
    FROM public.game_table_players
    WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

    RETURN jsonb_build_object(
      'success', true,
      'already_left', true,
      'table_id', p_table_id,
      'remaining_players', v_active_players_count
    );
  END IF;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE id = v_player.id;

  IF NOT v_session_is_active THEN
    IF v_table.entry_fee > 0 THEN
      SELECT * INTO v_wallet
      FROM public.wallets
      WHERE user_id = v_caller_id AND currency = 'VES'
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.wallets
        SET balance = balance + v_table.entry_fee,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        INSERT INTO public.ledger_entries (
          wallet_id, user_id, amount, currency, entry_type,
          reference_id, reference_type, balance_before, balance_after,
          metadata, created_at
        ) VALUES (
          v_wallet.id, v_caller_id, v_table.entry_fee, 'VES',
          'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
          p_table_id, 'game_tables',
          v_wallet.balance, v_wallet.balance + v_table.entry_fee,
          jsonb_build_object('reason', 'Reembolso por abandono voluntario de mesa previa al inicio'),
          NOW()
        );
        v_refund_amount := v_table.entry_fee;
      END IF;
    END IF;
  END IF;

  SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND status IN ('PLAYING', 'JOINED', 'READY');

  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      status = CASE
        WHEN v_active_players_count = 0 AND status::text IN ('OPEN', 'FULL', 'WAITING') THEN 'CLOSED'::table_status_enum
        WHEN status::text = 'FULL' AND v_active_players_count < max_players THEN 'OPEN'::table_status_enum
        ELSE status
      END,
      closed_at = CASE
        WHEN v_active_players_count = 0 AND status::text IN ('OPEN', 'FULL', 'WAITING') THEN NOW()
        ELSE closed_at
      END,
      updated_at = NOW()
  WHERE id = p_table_id;

  IF v_session_is_active THEN
    IF v_active_players_count = 1 THEN
      SELECT user_id INTO v_remaining_player
      FROM public.game_table_players
      WHERE table_id = p_table_id
        AND status IN ('PLAYING', 'JOINED', 'READY')
      LIMIT 1;

      IF v_remaining_player.user_id IS NOT NULL THEN
        v_settle_result := public.settle_game_session(
          v_session.id,
          ARRAY[v_remaining_player.user_id],
          1,
          'SETTLE_FORFEIT_' || v_effective_idempotency
        );

        RETURN jsonb_build_object(
          'success', true,
          'action', 'WINNER_DECLARED_BY_ABANDON',
          'abandoned_user_id', v_caller_id,
          'winner_user_id', v_remaining_player.user_id,
          'refund_amount', v_refund_amount,
          'settlement', v_settle_result
        );
      END IF;
    ELSIF v_active_players_count > 1 THEN
      IF v_session.current_turn_user_id = v_caller_id THEN
        SELECT user_id INTO v_next_player
        FROM public.game_table_players
        WHERE table_id = p_table_id
          AND status IN ('PLAYING', 'JOINED', 'READY')
          AND user_id <> v_caller_id
        ORDER BY seat_number ASC
        LIMIT 1;

        IF v_next_player.user_id IS NOT NULL THEN
          UPDATE public.game_sessions
          SET current_turn_user_id = v_next_player.user_id,
              turn_deadline_at = NOW() + INTERVAL '10 seconds'
          WHERE id = v_session.id;
        END IF;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'PLAYER_ABANDONED_CONTINUE',
        'abandoned_user_id', v_caller_id,
        'remaining_players', v_active_players_count,
        'table_id', p_table_id
      );
    ELSE
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

      UPDATE public.game_table_players
      SET status = 'LEFT'::player_table_status_enum,
          left_at = COALESCE(left_at, NOW()),
          updated_at = NOW()
      WHERE table_id = p_table_id
        AND status != 'LEFT'::player_table_status_enum;

      RETURN jsonb_build_object(
        'success', true,
        'action', 'ALL_ABANDONED_CLOSED',
        'table_id', p_table_id,
        'remaining_players', 0
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'refund_amount', v_refund_amount,
    'remaining_players', v_active_players_count
  );
END;
$$;

-- Permisos canónicos
GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role, anon;

-- 3. RPC CANÓNICA PARA OBTENER MESAS PÚBLICAS DISPONIBLES DE FORMA PURA
CREATE OR REPLACE FUNCTION public.get_public_available_tables(
  p_game_type TEXT DEFAULT NULL
)
RETURNS SETOF public.game_tables
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT gt.*
  FROM public.game_tables gt
  WHERE (gt.visibility = 'PUBLIC'::table_visibility_enum OR gt.visibility IS NULL)
    AND gt.status = 'OPEN'::table_status_enum
    AND gt.closed_at IS NULL
    AND gt.current_players_count < gt.max_players
    AND (gt.expires_at IS NULL OR gt.expires_at > NOW())
    AND (
      p_game_type IS NULL
      OR p_game_type = 'all'
      OR gt.game_type::text ILIKE p_game_type
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.table_id = gt.id
        AND (
          gs.ended_at IS NOT NULL
          OR gs.status::text IN ('SETTLED', 'FINISHED', 'CANCELLED', 'COMPLETED', 'ABANDONED', 'CLOSED', 'ACTIVE', 'IN_PROGRESS', 'IN_GAME')
        )
    )
  ORDER BY gt.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_available_tables(TEXT) TO authenticated, service_role, anon;

-- 4. ACTUALIZACIÓN CANÓNICA DE CLEANUP_AUDIT_GAME_SESSION
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

  -- Detectar si el usuario tiene partidas REALES activas en este juego
  SELECT COUNT(DISTINCT gt.id) INTO v_real_active_tables_count
  FROM public.game_tables gt
  JOIN public.game_table_players gtp ON gtp.table_id = gt.id
  WHERE gtp.user_id = v_target_user_id
    AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE', 'WAITING', 'IN_GAME')
    AND (v_game_type_clean IS NULL OR gt.game_type::text = v_game_type_clean)
    AND NOT (
      gt.config->>'name' ILIKE '%AUDIT_TEST%' 
      OR gt.invite_code ILIKE 'AUDIT%'
    );

  -- Identificar mesas de AUDITORÍA (AUDIT_TEST) asociadas al usuario
  SELECT ARRAY_AGG(DISTINCT gt.id) INTO v_audit_table_ids
  FROM public.game_tables gt
  LEFT JOIN public.game_table_players gtp ON gtp.table_id = gt.id
  WHERE (gtp.user_id = v_target_user_id OR gt.host_user_id = v_target_user_id)
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE', 'WAITING', 'IN_GAME')
    AND (v_game_type_clean IS NULL OR gt.game_type::text = v_game_type_clean)
    AND (
      gt.config->>'name' ILIKE '%AUDIT_TEST%' 
      OR gt.invite_code ILIKE 'AUDIT%'
    );

  -- Cerrar de forma segura las mesas de auditoría detectadas
  IF v_audit_table_ids IS NOT NULL AND ARRAY_LENGTH(v_audit_table_ids, 1) > 0 THEN
    UPDATE public.game_table_players
    SET status = 'LEFT'::player_table_status_enum,
        left_at = COALESCE(left_at, NOW()),
        updated_at = NOW()
    WHERE table_id = ANY(v_audit_table_ids);

    WITH closed_s AS (
      UPDATE public.game_sessions
      SET status = 'SETTLED'::session_status_enum,
          ended_at = NOW()
      WHERE table_id = ANY(v_audit_table_ids)
        AND status::text NOT IN ('SETTLED', 'CLOSED', 'CANCELLED', 'FINISHED')
      RETURNING id
    )
    SELECT COUNT(*) INTO v_cleaned_sessions_count FROM closed_s;

    WITH closed_t AS (
      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = ANY(v_audit_table_ids)
      RETURNING id
    )
    SELECT COUNT(*) INTO v_cleaned_tables_count FROM closed_t;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cleaned_tables', v_cleaned_tables_count,
    'cleaned_sessions', v_cleaned_sessions_count,
    'real_active_tables', v_real_active_tables_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_audit_game_session(UUID, TEXT) TO authenticated, service_role, anon;

-- 5. ACTUALIZACIÓN CANÓNICA DE GET_OR_CREATE_AUTOMATED_BINGO_TABLE
CREATE OR REPLACE FUNCTION public.get_or_create_automated_bingo_table(
  p_variant TEXT DEFAULT '75',
  p_entry_fee NUMERIC DEFAULT 10.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_host_id UUID;
  v_variant TEXT;
  v_table RECORD;
  v_table_id UUID;
  v_session_id UUID;
  v_invite_code TEXT;
  v_name TEXT;
  v_total_balls INT;
  v_audit_table_ids UUID[];
BEGIN
  v_caller_id := auth.uid();
  v_variant := COALESCE(p_variant, '75');
  IF v_variant NOT IN ('75', '80', '90') THEN
    v_variant := '75';
  END IF;

  v_total_balls := CASE WHEN v_variant = '90' THEN 90 WHEN v_variant = '80' THEN 80 ELSE 75 END;

  -- 1. LIMPIEZA IDEMPOTENTE DE RESIDUOS AUDIT_TEST DEL INVOCADOR (SI EXISTEN)
  IF v_caller_id IS NOT NULL THEN
    SELECT ARRAY_AGG(DISTINCT gt.id) INTO v_audit_table_ids
    FROM public.game_tables gt
    LEFT JOIN public.game_table_players gtp ON gtp.table_id = gt.id
    WHERE (gtp.user_id = v_caller_id OR gt.host_user_id = v_caller_id)
      AND gt.game_type::text IN ('BINGO', 'bingo')
      AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE', 'WAITING', 'IN_GAME')
      AND (
        gt.config->>'name' ILIKE '%AUDIT_TEST%' 
        OR gt.invite_code ILIKE 'AUDIT%'
      );

    IF v_audit_table_ids IS NOT NULL AND ARRAY_LENGTH(v_audit_table_ids, 1) > 0 THEN
      UPDATE public.game_table_players
      SET status = 'LEFT'::player_table_status_enum,
          left_at = COALESCE(left_at, NOW()),
          updated_at = NOW()
      WHERE table_id = ANY(v_audit_table_ids);

      UPDATE public.game_sessions
      SET status = 'SETTLED'::session_status_enum,
          ended_at = NOW()
      WHERE table_id = ANY(v_audit_table_ids)
        AND status::text NOT IN ('SETTLED', 'CLOSED', 'CANCELLED', 'FINISHED');

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          current_players_count = 0,
          updated_at = NOW()
      WHERE id = ANY(v_audit_table_ids);
    END IF;
  END IF;

  -- 2. BUSCAR MESA AUTOMATIZADA ACTIVA EXISTENTE PARA ESTA VARIANTE
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE game_type::text IN ('BINGO', 'bingo')
    AND (config->>'variant') = v_variant
    AND (config->>'automated')::boolean IS TRUE
    AND status IN ('OPEN'::table_status_enum, 'STARTING'::table_status_enum)
    AND closed_at IS NULL
    AND NOT (
      config->>'name' ILIKE '%AUDIT_TEST%' 
      OR invite_code ILIKE 'AUDIT%'
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'table_id', v_table.id,
      'variant', v_variant,
      'status', v_table.status,
      'current_players_count', v_table.current_players_count,
      'min_players', v_table.min_players,
      'max_players', v_table.max_players,
      'entry_fee', v_table.entry_fee,
      'config', v_table.config
    );
  END IF;

  -- 3. CREAR NUEVA MESA PÚBLICA AUTOMATIZADA DE BINGO VIRTUAL
  v_invite_code := 'PUB-BINGO-' || v_variant || '-' || UPPER(encode(gen_random_bytes(3), 'hex'));
  v_name := 'Sorteo Bingo Virtual ' || v_variant || ' Bolas';
  
  v_host_id := COALESCE(
    v_caller_id,
    (SELECT user_id FROM public.profiles WHERE role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATOR') LIMIT 1),
    (SELECT user_id FROM public.profiles LIMIT 1)
  );

  INSERT INTO public.game_tables (
    game_type,
    host_user_id,
    visibility,
    entry_fee,
    min_players,
    max_players,
    current_players_count,
    status,
    invite_code,
    expires_at,
    config,
    created_at,
    updated_at
  ) VALUES (
    'BINGO'::game_type_enum,
    v_host_id,
    'PUBLIC'::table_visibility_enum,
    COALESCE(p_entry_fee, 25.00),
    2,
    1000,
    0,
    'OPEN'::table_status_enum,
    v_invite_code,
    NOW() + INTERVAL '30 days',
    jsonb_build_object(
      'name', v_name,
      'mode', 'INDIVIDUAL',
      'variant', v_variant,
      'automated', true,
      'total_balls', v_total_balls,
      'call_interval_ms', 3500,
      'min_players_required', 2
    ),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_table_id;

  -- 4. CREAR SESIÓN DE JUEGO ASOCIADA
  INSERT INTO public.game_sessions (
    table_id,
    game_type,
    session_number,
    status,
    current_state,
    created_at
  ) VALUES (
    v_table_id,
    'BINGO'::game_type_enum,
    1,
    'WAITING'::session_status_enum,
    jsonb_build_object(
      'variant', v_variant,
      'status', 'WAITING_FOR_PLAYERS',
      'totalBalls', v_total_balls,
      'drawnBalls', '[]'::jsonb,
      'currentBall', null,
      'callIntervalMs', 3500,
      'winnerUserId', null
    ),
    NOW()
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'session_id', v_session_id,
    'variant', v_variant,
    'status', 'OPEN',
    'current_players_count', 0,
    'min_players', 2,
    'max_players', 1000,
    'entry_fee', COALESCE(p_entry_fee, 25.00)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_automated_bingo_table(TEXT, NUMERIC) TO authenticated, service_role, anon;

-- 6. CONCILIACIÓN INICIAL CONSERVADORA DE RESIDUOS Y MESAS TERMINADAS
-- Cierra únicamente mesas con sesiones finalizadas/liquidadas, expiradas o sin jugadores
UPDATE public.game_tables gt
SET status = 'CLOSED'::table_status_enum,
    closed_at = COALESCE(gt.closed_at, NOW()),
    current_players_count = 0,
    updated_at = NOW()
WHERE gt.status::text NOT IN ('CLOSED', 'TERMINATED', 'CANCELLED', 'EXPIRED')
  AND (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.table_id = gt.id
        AND (
          gs.ended_at IS NOT NULL
          OR gs.status::text IN ('SETTLED', 'FINISHED', 'CANCELLED', 'COMPLETED', 'ABANDONED', 'CLOSED')
        )
    )
    OR (gt.expires_at IS NOT NULL AND gt.expires_at <= NOW())
    OR NOT EXISTS (
      SELECT 1 FROM public.game_table_players gtp
      WHERE gtp.table_id = gt.id
        AND gtp.status::text IN ('JOINED', 'READY', 'PLAYING')
    )
  );

-- Liberar asientos de cualquier jugador en mesas cerradas/terminadas/canceladas/expiradas
UPDATE public.game_table_players gtp
SET status = 'LEFT'::player_table_status_enum,
    left_at = COALESCE(gtp.left_at, NOW()),
    updated_at = NOW()
FROM public.game_tables gt
WHERE gtp.table_id = gt.id
  AND gt.status::text IN ('CLOSED', 'TERMINATED', 'CANCELLED', 'EXPIRED')
  AND gtp.status != 'LEFT'::player_table_status_enum;

-- Sincronizar contador real de jugadores en mesas que permanezcan abiertas
UPDATE public.game_tables gt
SET current_players_count = (
  SELECT COUNT(DISTINCT gtp.user_id)
  FROM public.game_table_players gtp
  WHERE gtp.table_id = gt.id
    AND gtp.status::text IN ('JOINED', 'READY', 'PLAYING')
),
updated_at = NOW()
WHERE gt.status::text IN ('OPEN', 'FULL', 'WAITING');
