-- ==============================================================================
-- MIGRACIÓN 101: Corrección de Columna "name" en game_tables y create_game_table_secure
-- Soluciona el error 42703 (column "name" of relation "game_tables" does not exist)
-- Asegura compatibilidad dual: columna "name" dedicada + "config->>'name'"
-- ==============================================================================

-- 1. Agregar columna name a public.game_tables si no existe y ajustar constraint de rango de jugadores
ALTER TABLE public.game_tables 
ADD COLUMN IF NOT EXISTS name VARCHAR(100);

-- Flexibilizar la restricción para admitir min_players >= 1 y max_players >= min_players
ALTER TABLE public.game_tables DROP CONSTRAINT IF EXISTS chk_game_tables_players_range;
ALTER TABLE public.game_tables ADD CONSTRAINT chk_game_tables_players_range CHECK (max_players >= min_players AND min_players >= 1);

-- 2. Migrar retroactivamente los nombres guardados en config hacia la columna name
UPDATE public.game_tables
SET name = config->>'name'
WHERE name IS NULL AND config ? 'name';

-- 3. Redefinición blindada de create_game_table_secure
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
  END IF;

  SELECT account_status INTO v_profile_status
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_profile_status IS NULL THEN
    PERFORM public.ensure_current_user_profile();
    SELECT account_status INTO v_profile_status
    FROM public.profiles
    WHERE user_id = v_user_id;
  END IF;

  IF v_profile_status::text NOT IN ('ACTIVE', 'PENDING_VERIFICATION') THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Tu cuenta no está autorizada para crear mesas';
  END IF;

  v_enum_game_type := public.fn_normalize_game_type_enum(p_game_type);

  -- 2. AUTO-ABANDONO SEGURO DE PARTICIPACIONES OBSOLETAS O HUÉRFANAS
  FOR v_stale_rec IN
    SELECT DISTINCT gt.id as table_id, gs.id as session_id
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    LEFT JOIN public.game_sessions gs ON gs.table_id = gt.id
    WHERE gtp.user_id = v_user_id
      AND gtp.status IN ('JOINED', 'READY', 'PLAYING')
      AND gt.game_type = v_enum_game_type
      AND (
        (gt.status::text IN ('OPEN', 'FULL') AND gs.id IS NULL)
        OR (gs.id IS NOT NULL AND gs.status::text IN ('WAITING', 'READY', 'STARTING', 'PAUSED'))
        OR (gs.id IS NOT NULL AND (
             gs.status::text IN ('FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'ABANDONED')
             OR (gs.current_state->>'winnerUserId') IS NOT NULL AND (gs.current_state->>'winnerUserId') <> ''
           ))
        OR (gt.status::text IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE') AND (
             gt.created_at < NOW() - INTERVAL '1 hour'
             OR (gt.updated_at IS NOT NULL AND gt.updated_at < NOW() - INTERVAL '1 hour')
           ))
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
        'auto_cleanup_create_101_' || v_stale_rec.table_id::text
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
  IF p_entry_fee < 25.00 OR p_entry_fee > 5000.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe estar entre 25 Bs. y 5.000 Bs.';
  END IF;

  IF NOT public.is_valid_entry_fee(p_entry_fee, v_enum_game_type) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de participación debe estar entre 25 Bs. y 5.000 Bs.';
  END IF;

  IF p_entry_fee > 0 AND COALESCE(v_wallet_available, 0.00) < p_entry_fee THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente (%.2f Bs.) para cubrir la entrada de %.2f Bs.', COALESCE(v_wallet_available, 0.00), p_entry_fee;
  END IF;

  -- 5. Configuración de Jugadores
  IF p_max_players < 2 OR p_max_players > 100 THEN
    RAISE EXCEPTION 'INVALID_MAX_PLAYERS: El número de jugadores permitidos es entre 2 y 100';
  END IF;

  IF v_enum_game_type = 'BINGO'::game_type_enum THEN
    v_min_players := CASE WHEN p_max_players = 1 THEN 1 ELSE 2 END;
  ELSIF p_max_players >= 4 THEN
    v_min_players := 2;
  ELSE
    v_min_players := p_max_players;
  END IF;

  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || v_enum_game_type::text);
  v_table_id := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '1 hour';
  v_effective_config := COALESCE(p_config, '{}'::jsonb) || jsonb_build_object('name', v_table_name);

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

  -- 7. Inserción Atómica de la Mesa de Juego (Con columna "name" y "config->'name'")
  INSERT INTO public.game_tables (
    id, host_user_id, game_type, name, visibility,
    status, entry_fee, min_players, max_players,
    current_players_count, invite_code, config,
    created_at, updated_at, expires_at
  ) VALUES (
    v_table_id, v_user_id, v_enum_game_type, v_table_name, p_visibility,
    'OPEN'::table_status_enum, p_entry_fee, v_min_players, p_max_players,
    1, v_invite_code, v_effective_config,
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
      actor_id
    ) VALUES (
      v_ledger_id,
      v_wallet_id,
      v_user_id,
      'TABLE_ENTRY_HOLD'::ledger_entry_type_enum,
      'HOLD'::ledger_direction_enum,
      p_entry_fee,
      (COALESCE(v_wallet_available, 0.00) - p_entry_fee),
      (COALESCE(v_wallet_available, 0.00) - p_entry_fee),
      (COALESCE(v_wallet_held, 0.00) + p_entry_fee),
      'game_tables',
      'game_tables',
      v_table_id,
      'HOLD_' || v_table_id::text || '_' || v_user_id::text,
      'Retención de entrada al crear la mesa ' || v_table_name,
      'COMPLETED',
      'VES',
      v_user_id
    );
  END IF;

  -- 9. Inserción del Creador como Jugador (Asiento 1 garantizado con referencia a ledger)
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id, table_id, user_id, seat_number, status, entry_held_entry_id, joined_at, updated_at
  ) VALUES (
    v_player_id, v_table_id, v_user_id, 1, 'JOINED'::player_table_status_enum, v_ledger_id, NOW(), NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'invite_code', v_invite_code,
    'name', v_table_name,
    'game_type', v_enum_game_type,
    'entry_fee', p_entry_fee,
    'player_id', v_player_id,
    'seat_number', 1,
    'max_players', p_max_players,
    'min_players', v_min_players
  );
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB)
TO authenticated, service_role;

-- Notificar recarga de schema cache
NOTIFY pgrst, 'reload schema';
