-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 110: COLUMNA GAME_VARIANT EN GAME_TABLES Y GAME_SESSIONS
-- ==============================================================================
-- 1. Añade columna game_variant con valor por defecto '90' en game_tables y game_sessions.
-- 2. Retro-migra variantes existentes guardadas en config/current_state.
-- 3. Actualiza create_game_table_secure para guardar explícitamente game_variant.
-- ==============================================================================

-- 1. Agregar la columna si no existe
ALTER TABLE public.game_tables ADD COLUMN IF NOT EXISTS game_variant TEXT DEFAULT '90';
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS game_variant TEXT DEFAULT '90';

-- 2. Retrocompatibilidad: Población de variantes desde JSONB
UPDATE public.game_tables
SET game_variant = COALESCE(config->>'gameVariant', config->>'variant', '90')
WHERE config ? 'gameVariant' OR config ? 'variant';

UPDATE public.game_sessions
SET game_variant = COALESCE(current_state->>'variant', current_state->>'gameVariant', '90')
WHERE current_state ? 'variant' OR current_state ? 'gameVariant';

-- 3. Índice para consultas rápidas por variante de juego
CREATE INDEX IF NOT EXISTS idx_game_tables_variant ON public.game_tables(game_type, game_variant);
CREATE INDEX IF NOT EXISTS idx_game_sessions_variant ON public.game_sessions(game_variant);

-- 4. Actualización de create_game_table_secure para persistir game_variant
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
  v_table_id UUID;
  v_invite_code VARCHAR(32);
  v_table_name VARCHAR(100);
  v_min_players SMALLINT;
  v_expires_at TIMESTAMPTZ;
  v_code_attempts INT := 0;
  v_code_candidate VARCHAR(32);
  v_active_table_count INT;
  v_wallet_id UUID;
  v_wallet_available NUMERIC;
  v_wallet_held NUMERIC;
  v_ledger_id UUID;
  v_player_id UUID;
  v_stale_rec RECORD;
  v_stale_session_status TEXT;
  v_effective_config JSONB;
  v_game_variant TEXT;
BEGIN
  -- 1. Identificación y Validación del Usuario Autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa';
  END IF;

  -- AUTO-LIMPIEZA SELF-HEALING: Limpia estados huérfanos previos del usuario antes de comprobar mesas activas
  PERFORM public.cleanup_stale_user_game_participation(v_user_id);

  -- Bloqueo pesimista FOR UPDATE en billetera
  IF p_entry_fee > 0 THEN
    SELECT id, available_balance, held_balance 
    INTO v_wallet_id, v_wallet_available, v_wallet_held
    FROM public.wallets
    WHERE user_id = v_user_id FOR UPDATE;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, available_balance, held_balance, currency)
      VALUES (v_user_id, 0.00, 0.00, 'VES')
      ON CONFLICT (user_id) DO NOTHING;

      SELECT id, available_balance, held_balance 
      INTO v_wallet_id, v_wallet_available, v_wallet_held
      FROM public.wallets
      WHERE user_id = v_user_id FOR UPDATE;
    END IF;

    IF v_wallet_available < p_entry_fee THEN
      RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Tu saldo disponible (% Bs.) es insuficiente para cubrir la entrada (% Bs.)',
        COALESCE(v_wallet_available, 0.00), p_entry_fee;
    END IF;
  END IF;

  -- Verificar estado de la cuenta
  SELECT account_status INTO v_profile_status
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile_status IS NOT NULL AND v_profile_status IN ('SUSPENDED', 'BANNED') THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Tu cuenta se encuentra temporalmente restringida';
  END IF;

  -- Convertir tipo de juego a enum de forma segura
  BEGIN
    v_enum_game_type := p_game_type::game_type_enum;
  EXCEPTION WHEN OTHERS THEN
    CASE upper(p_game_type)
      WHEN 'DOMINO_VENEZOLANO' THEN v_enum_game_type := 'DOMINO'::game_type_enum;
      WHEN 'DOMINO' THEN v_enum_game_type := 'DOMINO'::game_type_enum;
      WHEN 'TRUCO_VENEZOLANO' THEN v_enum_game_type := 'TRUCO'::game_type_enum;
      WHEN 'TRUCO' THEN v_enum_game_type := 'TRUCO'::game_type_enum;
      WHEN 'LUDO' THEN v_enum_game_type := 'LUDO'::game_type_enum;
      WHEN 'BINGO' THEN v_enum_game_type := 'BINGO'::game_type_enum;
      WHEN 'POLLA' THEN v_enum_game_type := 'POLLA'::game_type_enum;
      WHEN 'POLLA_ENCUESTADORA' THEN v_enum_game_type := 'POLLA'::game_type_enum;
      WHEN 'ATRAPAITO' THEN v_enum_game_type := 'ATRAPAITO'::game_type_enum;
      WHEN 'UNA_OLLA' THEN v_enum_game_type := 'UNA_OLLA'::game_type_enum;
      ELSE RAISE EXCEPTION 'INVALID_GAME_TYPE: Tipo de juego no reconocido: %', p_game_type;
    END CASE;
  END;

  -- Extraer la variante de juego (e.g. '75' | '90')
  v_game_variant := COALESCE(p_config->>'gameVariant', p_config->>'variant', '90');

  -- 2. Limpieza de mesas huérfanas
  FOR v_stale_rec IN
    SELECT gtp.table_id, gs.id AS session_id
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
    WHERE gtp.user_id = v_user_id
      AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
      AND gt.game_type = v_enum_game_type
      AND (
        gt.status IN ('CLOSED', 'CANCELLED')
        OR (gs.id IS NOT NULL AND gs.status::text IN ('FINISHED', 'CANCELLED', 'ABANDONED'))
        OR (gt.updated_at IS NOT NULL AND gt.updated_at < NOW() - INTERVAL '4 hours')
        OR (gt.expires_at IS NOT NULL AND gt.expires_at < NOW())
      )
  LOOP
    BEGIN
      IF v_stale_rec.session_id IS NOT NULL THEN
        SELECT status::text INTO v_stale_session_status FROM public.game_sessions WHERE id = v_stale_rec.session_id;
        IF v_stale_session_status = 'ACTIVE' THEN
          UPDATE public.game_sessions
          SET status = 'CANCELLED'::session_status_enum,
              ended_at = NOW()
          WHERE id = v_stale_rec.session_id;
        END IF;
      END IF;

      PERFORM public.abandon_game_table_secure(
        v_stale_rec.table_id,
        v_stale_rec.session_id,
        'auto_cleanup_create_110_' || v_stale_rec.table_id::text
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- 3. CONTROL ESTRICTO DE OTRA MESA ACTIVA REAL
  SELECT COUNT(*) INTO v_active_table_count
  FROM public.game_table_players gtp
  JOIN public.game_tables gt ON gt.id = gtp.table_id
  LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
  WHERE gtp.user_id = v_user_id
    AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
    AND gt.game_type = v_enum_game_type
    AND gt.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE')
    AND gs.id IS NOT NULL
    AND gs.status::text = 'ACTIVE'
    AND (gs.current_state->>'winnerUserId' IS NULL OR gs.current_state->>'winnerUserId' = '')
    AND (gt.updated_at IS NULL OR gt.updated_at >= NOW() - INTERVAL '1 hour')
    AND gt.created_at >= NOW() - INTERVAL '1 hour'
    AND (gt.expires_at IS NULL OR gt.expires_at >= NOW());

  IF v_active_table_count > 0 THEN
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya estás participando en una mesa activa de este juego. Sal de esa mesa o espera a que finalice antes de crear otra.';
  END IF;

  -- 4. Validaciones de Tarifas y Límites
  IF p_entry_fee < 10.00 OR p_entry_fee > 5000.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe estar entre 10 Bs. y 5.000 Bs.';
  END IF;

  -- 5. Determinación de Límites de Jugadores y Nombre
  v_min_players := 2;
  IF v_enum_game_type = 'BINGO'::game_type_enum THEN
    v_min_players := 2;
  END IF;

  IF p_max_players < v_min_players THEN
    RAISE EXCEPTION 'INVALID_PLAYER_LIMIT: La mesa requiere mínimo % jugadores', v_min_players;
  END IF;

  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || v_enum_game_type::text);
  v_table_id := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '1 hour';
  v_effective_config := COALESCE(p_config, '{}'::jsonb) || jsonb_build_object(
    'name', v_table_name,
    'gameVariant', v_game_variant,
    'variant', v_game_variant
  );

  -- 6. Generación de Código de Invitación Único
  LOOP
    v_code_attempts := v_code_attempts + 1;
    v_code_candidate := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
    IF NOT EXISTS (
      SELECT 1 FROM public.game_tables 
      WHERE invite_code = v_code_candidate 
        AND status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE')
    ) THEN
      v_invite_code := v_code_candidate;
      EXIT;
    END IF;
    IF v_code_attempts > 20 THEN
      v_invite_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10));
      EXIT;
    END IF;
  END LOOP;

  -- 7. Inserción Atómica de la Mesa de Juego (Con columna "name", "config" y "game_variant")
  INSERT INTO public.game_tables (
    id, host_user_id, game_type, name, visibility,
    status, entry_fee, min_players, max_players,
    current_players_count, invite_code, config, game_variant,
    created_at, updated_at, expires_at
  ) VALUES (
    v_table_id, v_user_id, v_enum_game_type, v_table_name, p_visibility,
    'OPEN'::table_status_enum, p_entry_fee, v_min_players, p_max_players,
    1, v_invite_code, v_effective_config, v_game_variant,
    NOW(), NOW(), v_expires_at
  );

  -- 8. Deducción Segura de Fondos en Billetera y Registro Canónico en Ledger
  IF p_entry_fee > 0 THEN
    UPDATE public.wallets
    SET available_balance = available_balance - p_entry_fee,
        held_balance = held_balance + p_entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    v_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id,
      wallet_id,
      user_id,
      entry_type,
      direction,
      amount,
      balance_before,
      balance_after,
      currency,
      reference_id,
      reference_table,
      status,
      description,
      metadata,
      created_at
    ) VALUES (
      v_ledger_id,
      v_wallet_id,
      v_user_id,
      'GAME_ENTRY_HOLD',
      'HOLD',
      p_entry_fee,
      v_wallet_available,
      v_wallet_available - p_entry_fee,
      'VES',
      v_table_id,
      'game_tables',
      'HELD',
      'Retención por creación de mesa ' || v_table_name,
      jsonb_build_object(
        'table_id', v_table_id,
        'game_type', v_enum_game_type::text,
        'game_variant', v_game_variant,
        'invite_code', v_invite_code,
        'entry_fee', p_entry_fee
      ),
      NOW()
    );
  END IF;

  -- 9. Asignar al creador como Asiento #1 (Host)
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id, table_id, user_id, seat_number, status, joined_at
  ) VALUES (
    v_player_id, v_table_id, v_user_id, 1, 'READY', NOW()
  );

  -- 10. Retornar Estado Completo
  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'invite_code', v_invite_code,
    'name', v_table_name,
    'game_type', v_enum_game_type::text,
    'game_variant', v_game_variant,
    'status', 'OPEN',
    'entry_fee', p_entry_fee,
    'seat_number', 1,
    'ledger_id', v_ledger_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) TO authenticated, service_role;
