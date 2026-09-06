-- ==============================================================================
-- MIGRACIÓN 148: Corrección Canónica Centralizada de create_game_table_secure
-- Proyecto: RASPANDO LA OLLA 🇻🇪 / PulsoPLAY
-- Propósito: Garantizar la creación atómica, idempotente y segura de mesas para
--            TODOS los juegos del Game Registry, asegurando la secuencia de:
--            AUTH -> PROFILE -> WALLET (FOR UPDATE) -> LEDGER (TABLE_ENTRY_HOLD) -> TABLE -> SEAT 1
-- ==============================================================================

-- 1. Asegurar compatibilidad de tipos ENUM en caso de variaciones históricas
DO $$
BEGIN
  -- Agregar TABLE_ENTRY_HOLD si faltara
  BEGIN
    ALTER TYPE public.ledger_entry_type_enum ADD VALUE IF NOT EXISTS 'TABLE_ENTRY_HOLD';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Agregar BET_PLACED si faltara
  BEGIN
    ALTER TYPE public.ledger_entry_type_enum ADD VALUE IF NOT EXISTS 'BET_PLACED';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Agregar HOLD en ledger_direction_enum si faltara
  BEGIN
    ALTER TYPE public.ledger_direction_enum ADD VALUE IF NOT EXISTS 'HOLD';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- 2. DEFINICIÓN CANÓNICA BLINDADA DE create_game_table_secure
CREATE OR REPLACE FUNCTION public.create_game_table_secure(
  p_game_type TEXT,
  p_name VARCHAR DEFAULT NULL,
  p_visibility table_visibility_enum DEFAULT 'PUBLIC',
  p_entry_fee NUMERIC DEFAULT 25.00,
  p_max_players SMALLINT DEFAULT 2,
  p_config JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_profile_status account_status_enum;
  v_enum_game_type game_type_enum;
  v_game_variant VARCHAR(50);
  v_table_id UUID;
  v_invite_code VARCHAR(32);
  v_table_name VARCHAR(100);
  v_min_players SMALLINT := 2;
  v_max_allowed SMALLINT := 4;
  v_expires_at TIMESTAMPTZ;
  v_code_attempts INT := 0;
  v_code_candidate VARCHAR(32);
  v_active_table_count INT := 0;
  v_wallet_id UUID;
  v_wallet_available NUMERIC(14,2) := 0.00;
  v_wallet_held NUMERIC(14,2) := 0.00;
  v_ledger_id UUID := NULL;
  v_player_id UUID;
  v_effective_config JSONB;
  v_stale_rec RECORD;
  v_idempotency_key VARCHAR(100);
  v_clean_entry_fee NUMERIC(14,2);
BEGIN
  -- --------------------------------------------------------------------------
  -- PASO 1: Identificación y Validación del Usuario Autenticado (AUTH)
  -- --------------------------------------------------------------------------
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa de juego';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 2: Garantizar Perfil del Usuario (PROFILE)
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM public.ensure_current_user_profile();
  EXCEPTION WHEN OTHERS THEN
    -- Si la función no existe o falla levemente, continuar buscando en profiles
    NULL;
  END;

  SELECT account_status INTO v_profile_status
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id
  LIMIT 1;

  IF v_profile_status IS NOT NULL AND v_profile_status::text IN ('SUSPENDED', 'BANNED', 'BLOCKED') THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Tu cuenta se encuentra temporalmente restringida para participar o crear mesas';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 3: Normalización y Validación del Tipo de Juego (GAME REGISTRY)
  -- --------------------------------------------------------------------------
  IF p_game_type IS NULL OR trim(p_game_type) = '' THEN
    RAISE EXCEPTION 'INVALID_GAME_TYPE: El tipo de juego no puede ser vacío';
  END IF;

  -- Normalización centralizada usando la función canónica
  v_enum_game_type := public.fn_normalize_game_type_enum(p_game_type);

  -- Comprobación de disponibilidad global en game_configurations
  IF NOT public.is_game_enabled(v_enum_game_type::text) THEN
    RAISE EXCEPTION 'GAME_DISABLED: El juego seleccionado se encuentra temporalmente en mantenimiento técnico';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 4: Determinación de Reglas de Capacidad y Variantes por Juego
  -- --------------------------------------------------------------------------
  v_game_variant := COALESCE(p_config->>'variant', p_config->>'gameVariant', 'CLASSIC');

  CASE v_enum_game_type
    WHEN 'DOMINO_VENEZOLANO'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 4;
      IF p_max_players NOT IN (2, 4) THEN
        p_max_players := 4;
      END IF;

    WHEN 'TRUCO_VENEZOLANO'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 4;
      IF p_max_players NOT IN (2, 4) THEN
        p_max_players := 4;
      END IF;

    WHEN 'TRES_EN_RAYA'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'PIEDRA_PAPEL_TIJERA'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'DAMAS'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'CHESS'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'ATRAPAITO'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'UNA_OLLA'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 6;
      IF p_max_players < 2 OR p_max_players > 6 THEN
        p_max_players := 4;
      END IF;

    WHEN 'BINGO'::game_type_enum THEN
      v_min_players := 2;
      v_max_allowed := 100;
      IF p_max_players < 2 THEN
        p_max_players := 100;
      END IF;

    WHEN 'POLLA_VENEZOLANA'::game_type_enum THEN
      v_min_players := 1;
      v_max_allowed := 200;
      IF p_max_players < 1 THEN
        p_max_players := 200;
      END IF;

    ELSE
      v_min_players := 2;
      v_max_allowed := 10;
  END CASE;

  IF p_max_players < v_min_players THEN
    RAISE EXCEPTION 'INVALID_PLAYER_LIMIT: La mesa requiere mínimo % jugadores', v_min_players;
  END IF;

  IF p_max_players > v_max_allowed THEN
    RAISE EXCEPTION 'INVALID_PLAYER_LIMIT: La capacidad máxima permitida para este juego es de % jugadores', v_max_allowed;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 5: Validación Estricta de la Tarifa de Entrada (ENTRY FEE)
  -- --------------------------------------------------------------------------
  IF p_entry_fee IS NULL THEN
    p_entry_fee := 0.00;
  END IF;

  v_clean_entry_fee := ROUND(p_entry_fee, 2);

  IF v_clean_entry_fee < 0.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada no puede ser negativo';
  END IF;

  -- Validación de rango legal de la plataforma: 0 Bs (libre) o entre 10 Bs y 5.000 Bs
  IF v_clean_entry_fee > 0.00 AND (v_clean_entry_fee < 10.00 OR v_clean_entry_fee > 5000.00) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe ser 0 Bs. (libre) o estar entre 10 Bs. y 5.000 Bs.';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 6: Auto-Limpieza Previa y Verificación de Participación Activa
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM public.cleanup_stale_user_game_participation(v_user_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Limpiar mesas huérfanas creadas por este usuario que ya hayan expirado
  FOR v_stale_rec IN
    SELECT gt.id AS stale_table_id
    FROM public.game_tables gt
    WHERE gt.host_user_id = v_user_id
      AND gt.game_type = v_enum_game_type
      AND gt.status IN ('OPEN', 'FULL')
      AND (gt.expires_at < NOW() OR gt.created_at < NOW() - INTERVAL '2 hours')
  LOOP
    BEGIN
      UPDATE public.game_tables
      SET status = 'EXPIRED'::table_status_enum,
          updated_at = NOW()
      WHERE id = v_stale_rec.stale_table_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- Comprobar si el usuario YA está participando en una partida activa real
  SELECT COUNT(*) INTO v_active_table_count
  FROM public.game_table_players gtp
  JOIN public.game_tables gt ON gt.id = gtp.table_id
  LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
  WHERE gtp.user_id = v_user_id
    AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
    AND gt.game_type = v_enum_game_type
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE')
    AND (
      (gs.id IS NOT NULL AND gs.status::text IN ('STARTING', 'ACTIVE', 'IN_PROGRESS', 'PLAYING') AND gs.ended_at IS NULL)
      OR
      (gt.created_at >= NOW() - INTERVAL '30 minutes' AND (gt.expires_at IS NULL OR gt.expires_at > NOW()))
    );

  IF v_active_table_count > 0 THEN
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya tienes una mesa o partida activa en curso de este juego. Finaliza esa partida antes de crear una nueva.';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 7: Garantizar y Bloquear Billetera del Usuario (WALLET LOCK)
  -- --------------------------------------------------------------------------
  IF v_clean_entry_fee > 0.00 THEN
    SELECT id, available_balance, held_balance
    INTO v_wallet_id, v_wallet_available, v_wallet_held
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- Si la billetera no existe, crearla atómicamente y re-bloquear
    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, currency, available_balance, held_balance)
      VALUES (v_user_id, 'VES', 0.00, 0.00)
      ON CONFLICT (user_id) DO NOTHING;

      SELECT id, available_balance, held_balance
      INTO v_wallet_id, v_wallet_available, v_wallet_held
      FROM public.wallets
      WHERE user_id = v_user_id
      FOR UPDATE;
    END IF;

    -- Comprobación estricta de saldo disponible suficiente
    IF COALESCE(v_wallet_available, 0.00) < v_clean_entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Tu saldo disponible (% Bs.) es insuficiente para cubrir la entrada de % Bs.',
        COALESCE(v_wallet_available, 0.00), v_clean_entry_fee;
    END IF;
  ELSE
    -- Mesa libre (0 Bs.): Garantizar existencia sin bloqueo estricto ni cargo
    SELECT id INTO v_wallet_id
    FROM public.wallets
    WHERE user_id = v_user_id;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, currency, available_balance, held_balance)
      VALUES (v_user_id, 'VES', 0.00, 0.00)
      ON CONFLICT (user_id) DO NOTHING;

      SELECT id INTO v_wallet_id
      FROM public.wallets
      WHERE user_id = v_user_id;
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 8: Generación de Identificadores y Códigos Únicos de Mesa
  -- --------------------------------------------------------------------------
  v_table_id := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '24 hours';

  -- Generación de código de invitación alfanumérico seguro (6 caracteres)
  LOOP
    v_code_attempts := v_code_attempts + 1;
    v_code_candidate := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));

    IF NOT EXISTS (SELECT 1 FROM public.game_tables WHERE invite_code = v_code_candidate) THEN
      v_invite_code := v_code_candidate;
      EXIT;
    END IF;

    IF v_code_attempts > 10 THEN
      v_invite_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
      EXIT;
    END IF;
  END LOOP;

  -- Determinación del nombre de la mesa
  IF p_name IS NOT NULL AND trim(p_name) <> '' THEN
    v_table_name := trim(p_name);
  ELSIF p_config ? 'name' AND trim(p_config->>'name') <> '' THEN
    v_table_name := trim(p_config->>'name');
  ELSE
    v_table_name := 'Mesa de ' || initcap(replace(v_enum_game_type::text, '_', ' '));
  END IF;

  IF length(v_table_name) > 100 THEN
    v_table_name := substring(v_table_name from 1 for 100);
  END IF;

  -- Configuración efectiva consolidada
  v_effective_config := COALESCE(p_config, '{}'::jsonb);
  v_effective_config := v_effective_config || jsonb_build_object(
    'name', v_table_name,
    'variant', v_game_variant,
    'inviteCode', v_invite_code,
    'createdVia', 'create_game_table_secure_canonical_148'
  );

  -- --------------------------------------------------------------------------
  -- PASO 9: Inserción Atómica de la Mesa (game_tables)
  -- --------------------------------------------------------------------------
  INSERT INTO public.game_tables (
    id,
    game_type,
    game_variant,
    name,
    visibility,
    entry_fee,
    min_players,
    max_players,
    current_players_count,
    status,
    created_by,
    host_user_id,
    invite_code,
    config,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    v_table_id,
    v_enum_game_type,
    v_game_variant,
    v_table_name,
    p_visibility,
    v_clean_entry_fee,
    v_min_players,
    p_max_players,
    1,
    'OPEN'::table_status_enum,
    v_user_id,
    v_user_id,
    v_invite_code,
    v_effective_config,
    v_expires_at,
    NOW(),
    NOW()
  );

  -- --------------------------------------------------------------------------
  -- PASO 10: Retención Contable (LEDGER HOLD) si la tarifa es mayor a 0
  -- --------------------------------------------------------------------------
  IF v_clean_entry_fee > 0.00 THEN
    v_idempotency_key := COALESCE(
      p_config->>'idempotency_key',
      'create_hold_' || v_table_id::text || '_' || v_user_id::text
    );

    -- Actualizar balance de la billetera: transferir de available a held
    UPDATE public.wallets
    SET available_balance = available_balance - v_clean_entry_fee,
        held_balance = held_balance + v_clean_entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    -- Registrar evento contable inmutable de retención (HOLD)
    INSERT INTO public.ledger_entries (
      wallet_id,
      user_id,
      amount,
      entry_type,
      direction,
      reference_table,
      reference_id,
      description,
      idempotency_key,
      balance_after_available,
      balance_after_held,
      created_at
    ) VALUES (
      v_wallet_id,
      v_user_id,
      v_clean_entry_fee,
      'TABLE_ENTRY_HOLD'::ledger_entry_type_enum,
      'HOLD'::ledger_direction_enum,
      'game_tables',
      v_table_id,
      'Retención de entrada al crear mesa: ' || v_table_name,
      v_idempotency_key,
      v_wallet_available - v_clean_entry_fee,
      v_wallet_held + v_clean_entry_fee,
      NOW()
    ) RETURNING id INTO v_ledger_id;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 11: Inserción del Anfitrión como Jugador (Asiento 1 Exclusivo)
  -- --------------------------------------------------------------------------
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id,
    table_id,
    user_id,
    seat_number,
    status,
    entry_held_entry_id,
    joined_at,
    updated_at
  ) VALUES (
    v_player_id,
    v_table_id,
    v_user_id,
    1,
    'JOINED'::player_table_status_enum,
    v_ledger_id,
    NOW(),
    NOW()
  );

  -- --------------------------------------------------------------------------
  -- PASO 12: Retorno Estructurado y Compatible (JSONB)
  -- --------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'id', v_table_id,
    'invite_code', v_invite_code,
    'player_id', v_player_id,
    'seat_number', 1,
    'name', v_table_name,
    'game_type', v_enum_game_type,
    'game_variant', v_game_variant,
    'status', 'OPEN',
    'entry_fee', v_clean_entry_fee,
    'max_players', p_max_players,
    'min_players', v_min_players,
    'currency', 'VES',
    'created_at', NOW(),
    'expires_at', v_expires_at
  );
END;
$$;

-- Permisos de ejecución para usuarios autenticados y rol de servicio
GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB)
TO authenticated, service_role;

-- Notificar recarga de schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
