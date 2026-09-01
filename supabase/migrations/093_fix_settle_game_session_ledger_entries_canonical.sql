-- ==============================================================================
-- RASPANDO LA OLLA / PULSOPLAY — MIGRACIÓN 093
-- CORRECCIÓN DEFINITIVA DE LIQUIDACIÓN Y CONTRATOS CANÓNICOS DE LEDGER_ENTRIES
-- ==============================================================================
-- Causa Raíz Identificada:
-- 1. Error en liquidación: column "balance_before" of relation "ledger_entries" does not exist.
--    El esquema real de `public.ledger_entries` (migraciones 004 y 079) utiliza:
--    `balance_after`, `balance_after_available` y `balance_after_held`.
-- 2. Coexistencia de sobrecargas de `settle_game_session` en PostgREST donde llamadas
--    con `p_winner_team` invocaban la versión obsoleta de la migración 089 que aún
--    incluía `balance_before` en el INSERT.
--
-- Esta migración:
-- 1. Elimina de forma limpia y explícita todas las firmas obsoletas/conflictivas de settle_game_session.
-- 2. Define la función canónica única `settle_game_session(UUID, UUID[], INTEGER, TEXT)`
--    respetando el esquema real de `ledger_entries`, garantizando atomicidad, idempotencia y
--    la regla 90% ganador / 10% plataforma.
-- 3. Define `settle_game_session_secure(UUID, UUID, INTEGER, TEXT)` como envoltorio unificado.
-- 4. Reconcilia `abandon_game_table_secure` y `request_withdrawal_locked` para evitar
--    cualquier inserción de columnas inexistentes en `ledger_entries`.
-- 5. Recarga el caché de esquema de PostgREST.
-- ==============================================================================

-- 1. ELIMINAR SOBRECARGAS OBSOLETAS O EN CONFLICTO
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, TEXT[], INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], SMALLINT, VARCHAR);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], SMALLINT, TEXT);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], INTEGER, VARCHAR);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[], INTEGER);
DROP FUNCTION IF EXISTS public.settle_game_session(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.settle_game_session_secure(UUID, UUID, SMALLINT, VARCHAR);
DROP FUNCTION IF EXISTS public.settle_game_session_secure(UUID, UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.settle_game_session_secure(UUID, UUID, INTEGER, VARCHAR);
DROP FUNCTION IF EXISTS public.settle_game_session_secure(UUID, UUID);

-- 2. FUNCIÓN CANÓNICA: settle_game_session
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
  v_effective_idempotency TEXT;
  v_existing_settlement RECORD;
  v_settlement_id UUID;
  v_entry_fee NUMERIC(14,2);
  v_total_players INTEGER;
  v_gross_pool NUMERIC(14,2);
  v_platform_fee NUMERIC(14,2);
  v_prize_pool NUMERIC(14,2);
  v_winners_count INTEGER;
  v_individual_prize NUMERIC(14,2);
  v_winner_id UUID;
  v_winner_wallet RECORD;
  v_has_role BOOLEAN := FALSE;
  v_primary_winner_id UUID := NULL;
  v_settlement_type settlement_type_enum := 'STANDARD'::settlement_type_enum;
  v_winner_ledger_id UUID;
BEGIN
  -- 1. Autorización: Service role o usuario autenticado
  v_caller_id := auth.uid();
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    v_has_role := TRUE;
  ELSIF v_caller_id IS NOT NULL THEN
    v_has_role := TRUE;
  END IF;

  IF NOT v_has_role THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Se requiere autenticación válida para liquidar la partida.';
  END IF;

  -- 2. Obtener sesión con bloqueo pesimista
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: No se encontró la sesión de juego especificada.';
  END IF;

  -- Idempotencia estricta: Si ya está liquidada, asegurar cierre de mesa y retornar resultado existente
  IF v_session.status = 'SETTLED'::session_status_enum OR v_session.is_settled THEN
    SELECT * INTO v_existing_settlement
    FROM public.game_settlements
    WHERE session_id = p_session_id
    LIMIT 1;

    -- Asegurar que la mesa y jugadores estén cerrados/liberados
    UPDATE public.game_tables
    SET status = 'CLOSED'::table_status_enum,
        closed_at = COALESCE(closed_at, NOW()),
        current_players_count = 0,
        updated_at = NOW()
    WHERE id = v_session.table_id;

    UPDATE public.game_table_players
    SET status = 'LEFT'::player_table_status_enum,
        left_at = COALESCE(left_at, NOW()),
        updated_at = NOW()
    WHERE table_id = v_session.table_id AND status != 'LEFT'::player_table_status_enum;

    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'session_id', p_session_id,
      'gross_pool', COALESCE(v_existing_settlement.gross_pool, v_session.gross_pool, 0.00),
      'platform_fee', COALESCE(v_existing_settlement.platform_fee, v_session.platform_fee, 0.00),
      'prize_pool', COALESCE(v_existing_settlement.prize_pool, v_session.prize_pool, 0.00),
      'winner_user_id', v_session.winner_user_id,
      'settlement_id', v_existing_settlement.id
    );
  END IF;

  -- 3. Obtener mesa asociada con bloqueo pesimista
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: No se encontró la mesa asociada a la sesión.';
  END IF;

  -- 4. Contar jugadores participantes en la mesa
  SELECT COUNT(DISTINCT user_id) INTO v_total_players
  FROM public.game_table_players
  WHERE table_id = v_table.id
    AND status != 'LEFT'::player_table_status_enum;

  IF v_total_players = 0 THEN
    SELECT COUNT(DISTINCT user_id) INTO v_total_players
    FROM public.game_table_players
    WHERE table_id = v_table.id;
  END IF;

  v_total_players := GREATEST(v_total_players, 2);
  v_entry_fee := COALESCE(v_table.entry_fee, 0.00);
  v_gross_pool := v_entry_fee * v_total_players;
  v_platform_fee := ROUND(v_gross_pool * 0.10, 2);
  v_prize_pool := v_gross_pool - v_platform_fee;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'stl_' || p_session_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  v_winners_count := COALESCE(array_length(p_winner_user_ids, 1), 0);

  IF v_winners_count > 0 THEN
    v_primary_winner_id := p_winner_user_ids[1];
  ELSE
    v_settlement_type := 'DRAW'::settlement_type_enum;
  END IF;

  -- 5. Crear registro contable en game_settlements
  INSERT INTO public.game_settlements (
    session_id,
    table_id,
    gross_pool,
    platform_fee,
    prize_pool,
    total_distributed,
    settlement_type,
    idempotency_key,
    created_at
  ) VALUES (
    p_session_id,
    v_table.id,
    v_gross_pool,
    v_platform_fee,
    v_prize_pool,
    CASE WHEN v_winners_count > 0 THEN v_prize_pool ELSE 0.00 END,
    v_settlement_type,
    v_effective_idempotency,
    NOW()
  )
  RETURNING id INTO v_settlement_id;

  -- 6. Acreditar a ganadores respetando el esquema real de ledger_entries
  IF v_winners_count > 0 AND v_prize_pool > 0.00 THEN
    v_individual_prize := ROUND(v_prize_pool / v_winners_count, 2);

    FOREACH v_winner_id IN ARRAY p_winner_user_ids LOOP
      SELECT * INTO v_winner_wallet
      FROM public.wallets
      WHERE user_id = v_winner_id AND currency = 'VES'
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.wallets (user_id, currency, available_balance, held_balance)
        VALUES (v_winner_id, 'VES', 0.00, 0.00)
        RETURNING * INTO v_winner_wallet;
      END IF;

      -- Actualizar saldo disponible de la billetera
      UPDATE public.wallets
      SET available_balance = available_balance + v_individual_prize,
          updated_at = NOW()
      WHERE id = v_winner_wallet.id;

      v_winner_ledger_id := gen_random_uuid();

      -- Inserción atómica en el libro mayor inmutable (ledger_entries)
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
        v_winner_ledger_id,
        v_winner_wallet.id,
        v_winner_id,
        v_individual_prize,
        'VES',
        'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
        'CREDIT'::ledger_direction_enum,
        v_settlement_id,
        'game_settlements',
        'game_settlement',
        COALESCE(v_winner_wallet.available_balance, 0.00) + v_individual_prize,
        COALESCE(v_winner_wallet.available_balance, 0.00) + v_individual_prize,
        COALESCE(v_winner_wallet.held_balance, 0.00),
        v_effective_idempotency || '_payout_' || v_winner_id::text,
        'Premio de victoria en ' || COALESCE(v_table.game_type, 'juego'),
        NOW()
      );

      -- Registrar destinatario de liquidación
      INSERT INTO public.game_settlement_recipients (
        settlement_id,
        user_id,
        amount,
        role
      ) VALUES (
        v_settlement_id,
        v_winner_id,
        v_individual_prize,
        'WINNER'::recipient_role_enum
      );
    END LOOP;
  END IF;

  -- 7. Actualizar estado de la sesión de juego a SETTLED
  UPDATE public.game_sessions
  SET status = 'SETTLED'::session_status_enum,
      winner_user_id = v_primary_winner_id,
      winner_team = p_winner_team,
      gross_pool = v_gross_pool,
      platform_fee = v_platform_fee,
      prize_pool = v_prize_pool,
      is_settled = true,
      settled_at = NOW(),
      ended_at = NOW()
  WHERE id = p_session_id;

  -- 8. Cerrar la mesa y liberar asientos
  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      current_players_count = 0,
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
    'winner_user_id', v_primary_winner_id,
    'settlement_id', v_settlement_id
  );
END;
$$;


-- 3. FUNCIÓN ENVOLTORIO: settle_game_session_secure
CREATE OR REPLACE FUNCTION public.settle_game_session_secure(
  p_session_id UUID,
  p_winner_user_id UUID DEFAULT NULL,
  p_winner_team INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_winner_array UUID[];
BEGIN
  IF p_winner_user_id IS NOT NULL THEN
    v_winner_array := ARRAY[p_winner_user_id];
  ELSE
    v_winner_array := ARRAY[]::UUID[];
  END IF;

  RETURN public.settle_game_session(
    p_session_id,
    v_winner_array,
    p_winner_team,
    p_idempotency_key
  );
END;
$$;


-- 4. RECONCILIAR abandon_game_table_secure
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
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para abandonar la mesa.';
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
    RAISE EXCEPTION 'TABLE_NOT_FOUND: No se encontró la mesa especificada.';
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

  -- 3. Obtener registro del jugador
  SELECT * INTO v_player
  FROM public.game_table_players
  WHERE table_id = p_table_id
    AND user_id = v_caller_id
    AND status IN ('JOINED'::player_table_status_enum, 'READY'::player_table_status_enum, 'PLAYING'::player_table_status_enum)
  FOR UPDATE;

  IF NOT FOUND THEN
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

  -- Marcar jugador como LEFT
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE id = v_player.id;

  -- 4. Reembolso pre-partida si la partida no ha comenzado
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
        'Reembolso por abandono voluntario de mesa previa al inicio',
        NOW()
      );
      v_refund_amount := v_table.entry_fee;
    END IF;
  END IF;

  -- 5. Contar jugadores restantes
  SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum;

  -- 6. Si la partida estaba activa y queda 1 solo jugador, forzar liquidación por abandono (Forfeit)
  IF v_session_is_active THEN
    IF v_active_players_count = 1 THEN
      SELECT user_id INTO v_remaining_player
      FROM public.game_table_players
      WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum
      LIMIT 1;

      IF v_remaining_player.user_id IS NOT NULL THEN
        v_settle_result := public.settle_game_session(
          v_session.id,
          ARRAY[v_remaining_player.user_id],
          NULL,
          'forfeit_' || v_session.id::text || '_' || v_remaining_player.user_id::text
        );
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
    -- Mesa en lobby: actualizar conteo o cerrar si queda vacía
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
    'refund_amount', v_refund_amount,
    'remaining_players', v_active_players_count
  );
END;
$$;


-- 5. RECONCILIAR request_withdrawal_locked
CREATE OR REPLACE FUNCTION public.request_withdrawal_locked(
  p_payment_account_id UUID,
  p_amount NUMERIC,
  p_idempotency_key VARCHAR,
  p_totp_code VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_user_role VARCHAR(50);
  v_profile RECORD;
  v_wallet RECORD;
  v_account RECORD;
  v_existing_req RECORD;
  v_request_id UUID;
  v_ledger_id UUID;
BEGIN
  -- 1. Verificación de Autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  -- 2. Bloqueo para roles técnicos
  SELECT role::text INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role IN ('ADMIN', 'SUPER_ADMIN', 'OPERATOR') THEN
    RAISE EXCEPTION 'OPERACION_DENEGADA: Los usuarios con rol Administrador u Operador no tienen permitido solicitar retiros.';
  END IF;

  -- 3. Verificación de Perfil y 2FA/MFA
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil no encontrado';
  END IF;

  IF COALESCE(v_profile.is_mfa_enabled, FALSE) THEN
    PERFORM public.validate_2fa_if_enabled(v_user_id, p_totp_code, 'WITHDRAWAL_REQUEST');
  END IF;

  -- 4. Verificación de Estatus KYC y Cuenta
  IF v_profile.account_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE: La cuenta no está activa para retiros';
  END IF;

  IF v_profile.kyc_status NOT IN ('APPROVED', 'VERIFIED') THEN
    RAISE EXCEPTION 'KYC_NOT_APPROVED: Se requiere verificación de identidad (KYC) aprobada para solicitar retiros.';
  END IF;

  -- 5. Verificación de Monto Mínimo
  IF p_amount < 100.00 THEN
    RAISE EXCEPTION 'MIN_WITHDRAWAL_NOT_MET: El monto mínimo de retiro es 100.00 Bs.';
  END IF;

  -- 6. Verificación de Cuenta de Pago Destino
  SELECT * INTO v_account
  FROM public.payment_accounts
  WHERE id = p_payment_account_id AND user_id = v_user_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ACCOUNT_INVALID: Cuenta bancaria destino no válida o no pertenece al usuario';
  END IF;

  -- 7. Idempotencia
  SELECT * INTO v_existing_req
  FROM public.withdrawal_requests
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'withdrawal_id', v_existing_req.id,
      'held_amount', v_existing_req.amount,
      'message', 'Solicitud de retiro procesada previamente (Idempotente).'
    );
  END IF;

  -- 8. Obtener y Bloquear Billetera del Usuario
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera del usuario no encontrada';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente para este retiro.';
  END IF;

  -- 9. Retención Atómica de Fondos en Wallet
  UPDATE public.wallets
  SET available_balance = available_balance - p_amount,
      held_balance = held_balance + p_amount,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 10. Registrar Asiento Contable (Esquema Canónico de ledger_entries)
  v_ledger_id := gen_random_uuid();
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
    reference_id,
    reference_table,
    reference_type,
    description,
    idempotency_key,
    created_at
  ) VALUES (
    v_ledger_id,
    v_wallet.id,
    v_user_id,
    'WITHDRAWAL_HOLD'::ledger_entry_type_enum,
    'HOLD'::ledger_direction_enum,
    p_amount,
    'VES',
    v_wallet.available_balance - p_amount,
    v_wallet.available_balance - p_amount,
    v_wallet.held_balance + p_amount,
    p_payment_account_id,
    'payment_accounts',
    'payment_accounts',
    'Retención de fondos para solicitud de retiro Pago Móvil',
    p_idempotency_key || '_ledger',
    NOW()
  );

  -- 11. Crear Registro de Solicitud de Retiro
  INSERT INTO public.withdrawal_requests (
    user_id,
    payment_account_id,
    amount,
    status,
    idempotency_key,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    p_payment_account_id,
    p_amount,
    'PENDING',
    p_idempotency_key,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_request_id,
    'held_amount', p_amount,
    'available_balance', v_wallet.available_balance - p_amount,
    'held_balance', v_wallet.held_balance + p_amount
  );
END;
$$;


-- 6. PERMISOS DE EJECUCIÓN
GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.settle_game_session_secure(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal_locked(UUID, NUMERIC, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 7. RECARGA DE CACHÉ DE ESQUEMA EN POSTGREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
