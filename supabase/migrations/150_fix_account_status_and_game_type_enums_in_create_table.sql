-- ==============================================================================
-- RASPANDO LA OLLA 🇻🇪 / PulsoPLAY — MIGRACIÓN 150
-- CORRECCIÓN DEFINITIVA DE ENUMS Y BLINDAJE EN create_game_table_secure
-- ==============================================================================
-- 1. Resuelve el error PostgreSQL 22P02 (invalid input value for enum account_status_enum: "BANNED")
--    desacoplando la verificación de estado de cuenta a TEXT para admitir cualquier valor
--    presente en la BD remota ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED').
-- 2. Desacopla la evaluación de CASE de game_type a TEXT para evitar fallos de casteo
--    en enums como DAMAS (no DAMAS_VENEZOLANAS), CHESS (no AJEDREZ) y ATRAPAITO (no ATRAPAITO_CRIOLLO).
-- 3. Mantiene la inserción canónica universal desacoplada de columnas opcionales
--    y la sincronización dinámica de game_variant.
-- 4. Garantiza el flujo financiero atómico inalterado:
--    AUTH -> PROFILE -> WALLET FOR UPDATE -> HOLD -> LEDGER -> HOST SEAT 1.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- REEMPLAZO ATÓMICO DE FUNCIÓN (CERO LOCK CONTENTION EN TABLAS)
-- ------------------------------------------------------------------------------
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
  v_profile_status TEXT;
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
  v_clean_entry_fee NUMERIC(14,2);
  v_has_variant_col BOOLEAN := false;
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
    NULL;
  END;

  -- Consulta segura de estado de perfil casteado a TEXT para evitar error 22P02
  SELECT account_status::text INTO v_profile_status
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id
  LIMIT 1;

  IF v_profile_status IS NOT NULL AND v_profile_status IN ('SUSPENDED', 'BLOCKED', 'CLOSED', 'BANNED', 'LOCKED') THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Tu cuenta se encuentra temporalmente restringida';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 3: Normalización y Comprobación del Tipo de Juego
  -- --------------------------------------------------------------------------
  IF p_game_type IS NULL OR trim(p_game_type) = '' THEN
    RAISE EXCEPTION 'INVALID_GAME_TYPE: El tipo de juego no puede ser vacío';
  END IF;

  v_enum_game_type := public.fn_normalize_game_type_enum(p_game_type);

  IF NOT public.is_game_enabled(v_enum_game_type::text) THEN
    RAISE EXCEPTION 'GAME_DISABLED: El juego seleccionado se encuentra temporalmente en mantenimiento técnico';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 4: Determinación de Reglas de Capacidad y Variantes por Juego (Robusto)
  -- --------------------------------------------------------------------------
  v_game_variant := COALESCE(p_config->>'variant', p_config->>'gameVariant', 'CLASSIC');

  CASE v_enum_game_type::text
    WHEN 'DOMINO_VENEZOLANO' THEN
      v_min_players := 2;
      v_max_allowed := 4;
      IF p_max_players NOT IN (2, 4) THEN
        p_max_players := 4;
      END IF;

    WHEN 'TRUCO_VENEZOLANO' THEN
      v_min_players := 2;
      v_max_allowed := 4;
      IF p_max_players NOT IN (2, 4) THEN
        p_max_players := 4;
      END IF;

    WHEN 'TRES_EN_RAYA', 'TIC_TAC_TOE' THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'PIEDRA_PAPEL_TIJERA', 'ROCK_PAPER_SCISSORS' THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'DAMAS', 'DAMAS_VENEZOLANAS', 'CHECKERS' THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'CHESS', 'AJEDREZ' THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'ATRAPAITO', 'ATRAPAITO_CRIOLLO' THEN
      v_min_players := 2;
      v_max_allowed := 2;
      p_max_players := 2;

    WHEN 'UNA_OLLA' THEN
      v_min_players := 2;
      v_max_allowed := 6;
      IF p_max_players < 2 OR p_max_players > 6 THEN
        p_max_players := 4;
      END IF;

    WHEN 'BINGO', 'bingo', 'bingo_75', 'bingo_90' THEN
      v_min_players := 2;
      v_max_allowed := 100;
      IF p_max_players < 2 THEN
        p_max_players := 100;
      END IF;
      IF v_game_variant NOT IN ('75', '80', '90') THEN
        v_game_variant := '90';
      END IF;

    WHEN 'POLLA_VENEZOLANA', 'POLLA' THEN
      v_min_players := 2;
      v_max_allowed := 200;
      IF p_max_players < 2 THEN
        p_max_players := 200;
      END IF;

    ELSE
      v_min_players := 2;
      v_max_allowed := 4;
  END CASE;

  -- --------------------------------------------------------------------------
  -- PASO 5: Validación Rigurosa del Monto de Entrada (ENTRY_FEE)
  -- --------------------------------------------------------------------------
  v_clean_entry_fee := ROUND(COALESCE(p_entry_fee, 0.00)::NUMERIC, 2);

  IF v_clean_entry_fee < 0.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada no puede ser negativo';
  END IF;

  IF v_clean_entry_fee > 0.00 AND (v_clean_entry_fee < 10.00 OR v_clean_entry_fee > 5000.00) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe ser 0 Bs. o estar entre 10,00 Bs. y 5.000,00 Bs.';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 6: Auto-Limpieza Previa y Prevención de Doble Mesa Activa (IDEMPOTENCIA)
  -- --------------------------------------------------------------------------
  BEGIN
    PERFORM public.cleanup_stale_user_game_participation(v_user_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  UPDATE public.game_tables
  SET status = 'CANCELLED'::table_status_enum,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE host_user_id = v_user_id
    AND status::text IN ('OPEN', 'WAITING')
    AND current_players_count <= 1
    AND created_at < NOW() - INTERVAL '15 minutes';

  SELECT COUNT(*) INTO v_active_table_count
  FROM public.game_tables gt
  INNER JOIN public.game_table_players gtp ON gtp.table_id = gt.id
  WHERE gtp.user_id = v_user_id
    AND gtp.status::text IN ('JOINED', 'READY', 'PLAYING')
    AND gt.status::text IN ('OPEN', 'WAITING', 'ACTIVE', 'STARTING', 'SALES', 'FULL')
    AND gt.game_type = v_enum_game_type
    AND gt.created_at >= NOW() - INTERVAL '4 hours';

  IF v_active_table_count > 0 THEN
    RAISE EXCEPTION 'ALREADY_IN_ACTIVE_TABLE: Ya tienes una mesa o partida activa en curso de este juego';
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 7: Bloqueo Pesimista de Billetera y Verificación Financiera
  -- --------------------------------------------------------------------------
  INSERT INTO public.wallets (
    user_id,
    currency,
    available_balance,
    held_balance,
    updated_at
  ) VALUES (
    v_user_id,
    'VES',
    0.00,
    0.00,
    NOW()
  ) ON CONFLICT (user_id) DO NOTHING;

  SELECT id, available_balance, held_balance
  INTO v_wallet_id, v_wallet_available, v_wallet_held
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: No se encontró la billetera del usuario';
  END IF;

  IF v_clean_entry_fee > 0.00 AND v_wallet_available < v_clean_entry_fee THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo insuficiente en tu billetera. Disponible: % Bs., Requerido: % Bs.',
      to_char(v_wallet_available, 'FM999,999,990.00'),
      to_char(v_clean_entry_fee, 'FM999,999,990.00');
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 8: Generación de Identificador UUID y Código Único de Mesa
  -- --------------------------------------------------------------------------
  v_table_id := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '24 hours';

  LOOP
    v_code_attempts := v_code_attempts + 1;
    IF p_visibility = 'PRIVATE' THEN
      v_code_candidate := 'TRK-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
    ELSE
      v_code_candidate := 'PUB-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.game_tables
      WHERE invite_code = v_code_candidate
        AND status::text IN ('OPEN', 'WAITING', 'ACTIVE', 'STARTING', 'SALES', 'FULL')
    ) THEN
      v_invite_code := v_code_candidate;
      EXIT;
    END IF;

    IF v_code_attempts >= 15 THEN
      v_invite_code := 'MES-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
      EXIT;
    END IF;
  END LOOP;

  -- Normalización del Nombre de la Mesa
  v_table_name := COALESCE(trim(p_name), '');
  IF v_table_name = '' THEN
    v_table_name := 'Mesa ' || v_invite_code;
  END IF;

  IF length(v_table_name) > 100 THEN
    v_table_name := substring(v_table_name from 1 for 100);
  END IF;

  -- Configuración efectiva consolidada (siempre resguarda variant en config JSONB)
  v_effective_config := COALESCE(p_config, '{}'::jsonb);
  v_effective_config := v_effective_config || jsonb_build_object(
    'name', v_table_name,
    'variant', v_game_variant,
    'gameVariant', v_game_variant,
    'inviteCode', v_invite_code,
    'createdVia', 'create_game_table_secure_canonical_150'
  );

  -- --------------------------------------------------------------------------
  -- PASO 9: Inserción Atómica Canónica de la Mesa (game_tables)
  -- --------------------------------------------------------------------------
  INSERT INTO public.game_tables (
    id,
    game_type,
    name,
    visibility,
    entry_fee,
    min_players,
    max_players,
    current_players_count,
    status,
    host_user_id,
    invite_code,
    config,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    v_table_id,
    v_enum_game_type,
    v_table_name,
    p_visibility,
    v_clean_entry_fee,
    v_min_players,
    p_max_players,
    1,
    'OPEN'::table_status_enum,
    v_user_id,
    v_invite_code,
    v_effective_config,
    v_expires_at,
    NOW(),
    NOW()
  );

  -- --------------------------------------------------------------------------
  -- PASO 9.1: Sincronización Dinámica de Columnas Opcionales (game_variant, created_by)
  -- --------------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'game_tables' 
      AND column_name = 'game_variant'
  ) INTO v_has_variant_col;

  IF v_has_variant_col THEN
    EXECUTE 'UPDATE public.game_tables SET game_variant = $1 WHERE id = $2'
    USING v_game_variant, v_table_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'game_tables' 
      AND column_name = 'created_by'
  ) THEN
    EXECUTE 'UPDATE public.game_tables SET created_by = $1 WHERE id = $2'
    USING v_user_id, v_table_id;
  END IF;

  -- --------------------------------------------------------------------------
  -- PASO 10: Retención Contable de Fondos en Billetera y Registro en Ledger
  -- --------------------------------------------------------------------------
  IF v_clean_entry_fee > 0.00 THEN
    UPDATE public.wallets
    SET available_balance = available_balance - v_clean_entry_fee,
        held_balance = held_balance + v_clean_entry_fee,
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
      balance_after,
      balance_after_available,
      balance_after_held,
      reference_table,
      reference_type,
      reference_id,
      idempotency_key,
      description,
      status,
      currency,
      actor_id,
      created_at
    ) VALUES (
      v_ledger_id,
      v_wallet_id,
      v_user_id,
      'TABLE_ENTRY_HOLD'::ledger_entry_type_enum,
      'HOLD'::ledger_direction_enum,
      v_clean_entry_fee,
      v_wallet_available,
      (v_wallet_available - v_clean_entry_fee),
      (v_wallet_held + v_clean_entry_fee),
      'game_tables',
      'TABLE_ENTRY',
      v_table_id,
      'table_entry_hold_' || v_table_id::text || '_' || v_user_id::text,
      'Retención de entrada para mesa ' || v_table_name || ' (' || v_enum_game_type::text || ')',
      'CONFIRMED',
      'VES',
      v_user_id,
      NOW()
    );
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
TO authenticated, anon, service_role;

-- Notificar recarga de schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
