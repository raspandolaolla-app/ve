-- ==============================================================================
-- MIGRACIÓN 100: Self-healing de participación en mesas y prevención de bloqueos
-- Soluciona bloqueos por mesas huérfanas, jugadores no marcados LEFT,
-- sesiones activas residuales y tablas que quedan ACTIVE después de terminar.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Helper: buscar una etiqueta válida de enum entre varios candidatos
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_valid_enum_label(
  p_enum_type text,
  p_candidates text[]
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_label text;
  v_candidate text;
BEGIN
  FOREACH v_candidate IN ARRAY p_candidates LOOP
    SELECT e.enumlabel
      INTO v_label
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = p_enum_type
       AND e.enumlabel = v_candidate
     LIMIT 1;

    IF v_label IS NOT NULL THEN
      RETURN v_label;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- ------------------------------------------------------------------------------
-- Cerrar una mesa completamente:
-- - marca jugadores LEFT
-- - cierra sesiones activas
-- - cierra la mesa
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_game_table(
  p_table_id UUID,
  p_reason TEXT DEFAULT 'CLEANUP'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_table RECORD;
  v_closed_table_statuses text[] := ARRAY[
    'FINISHED','CLOSED','CANCELED','CANCELLED','ABANDONED','TERMINATED','EXPIRED'
  ];
  v_active_session_statuses text[] := ARRAY[
    'WAITING','READY','STARTING','ACTIVE','IN_PROGRESS','PLAYING'
  ];
  v_table_closed_label text;
  v_session_closed_label text;
  v_has_updated_at boolean;
BEGIN
  SELECT id, status::text AS status_text
    INTO v_table
    FROM public.game_tables
   WHERE id = p_table_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TABLE_NOT_FOUND',
      'table_id', p_table_id
    );
  END IF;

  -- 1) Marcar todos los jugadores como LEFT
  UPDATE public.game_table_players
     SET status = 'LEFT'::player_table_status_enum
   WHERE table_id = p_table_id
     AND status <> 'LEFT'::player_table_status_enum;

  -- 2) Cerrar sesiones activas
  v_session_closed_label := public.get_valid_enum_label(
    'session_status_enum',
    ARRAY['SETTLED','COMPLETED','FINISHED','CANCELLED','CANCELED','ABANDONED','TERMINATED']
  );

  IF v_session_closed_label IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.game_sessions
          SET status = %L::session_status_enum
        WHERE table_id = $1
          AND status::text = ANY($2)',
      v_session_closed_label
    )
    USING p_table_id, v_active_session_statuses;
  END IF;

  -- 3) Cerrar mesa si no estaba ya cerrada
  IF NOT (v_table.status_text = ANY(v_closed_table_statuses)) THEN
    v_table_closed_label := public.get_valid_enum_label(
      'table_status_enum',
      ARRAY['CLOSED','ABANDONED','FINISHED','CANCELLED','CANCELED','TERMINATED','EXPIRED']
    );

    IF v_table_closed_label IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'game_tables'
           AND column_name = 'updated_at'
      )
      INTO v_has_updated_at;

      IF v_has_updated_at THEN
        EXECUTE format(
          'UPDATE public.game_tables
              SET status = %L::table_status_enum,
                  updated_at = NOW()
            WHERE id = $1',
          v_table_closed_label
        )
        USING p_table_id;
      ELSE
        EXECUTE format(
          'UPDATE public.game_tables
              SET status = %L::table_status_enum
            WHERE id = $1',
          v_table_closed_label
        )
        USING p_table_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'reason', p_reason
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'table_id', p_table_id,
    'error', SQLERRM
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- Cerrar mesa solo si quedó huérfana: sin jugadores activos
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_game_table_if_orphaned(
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_table RECORD;
  v_active_players INT;
  v_closed_table_statuses text[] := ARRAY[
    'FINISHED','CLOSED','CANCELED','CANCELLED','ABANDONED','TERMINATED','EXPIRED'
  ];
BEGIN
  SELECT id, status::text AS status_text
    INTO v_table
    FROM public.game_tables
   WHERE id = p_table_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TABLE_NOT_FOUND',
      'table_id', p_table_id
    );
  END IF;

  IF v_table.status_text = ANY(v_closed_table_statuses) THEN
    RETURN jsonb_build_object(
      'success', true,
      'table_id', p_table_id,
      'closed', false,
      'already_closed', true
    );
  END IF;

  SELECT COUNT(*)
    INTO v_active_players
    FROM public.game_table_players
   WHERE table_id = p_table_id
     AND status <> 'LEFT'::player_table_status_enum;

  IF v_active_players = 0 THEN
    PERFORM public.close_game_table(p_table_id, 'ORPHANED_NO_ACTIVE_PLAYERS');

    RETURN jsonb_build_object(
      'success', true,
      'table_id', p_table_id,
      'closed', true
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'closed', false
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'table_id', p_table_id,
    'error', SQLERRM
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- Limpieza global de mesas huérfanas
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_game_tables()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  r RECORD;
  v_result JSONB;
  v_tables_closed INT := 0;

  v_closed_table_statuses text[] := ARRAY[
    'FINISHED','CLOSED','CANCELED','CANCELLED','ABANDONED','TERMINATED','EXPIRED'
  ];

  v_active_session_statuses text[] := ARRAY[
    'WAITING','READY','STARTING','ACTIVE','IN_PROGRESS','PLAYING'
  ];

  v_session_closed_label text;
BEGIN
  -- 1) Cerrar mesas que no tienen jugadores activos
  FOR r IN (
    SELECT gt.id
      FROM public.game_tables gt
     WHERE NOT (gt.status::text = ANY(v_closed_table_statuses))
       AND NOT EXISTS (
         SELECT 1
           FROM public.game_table_players gtp
          WHERE gtp.table_id = gt.id
            AND gtp.status <> 'LEFT'::player_table_status_enum
       )
  ) LOOP
    v_result := public.close_game_table(r.id, 'ORPHANED_NO_ACTIVE_PLAYERS');

    IF COALESCE((v_result->>'success')::boolean, false) THEN
      v_tables_closed := v_tables_closed + 1;
    END IF;
  END LOOP;

  -- 2) Marcar LEFT jugadores que siguen activos en mesas ya cerradas
  UPDATE public.game_table_players gtp
     SET status = 'LEFT'::player_table_status_enum
    FROM public.game_tables gt
   WHERE gt.id = gtp.table_id
     AND gtp.status <> 'LEFT'::player_table_status_enum
     AND gt.status::text = ANY(v_closed_table_statuses);

  -- 3) Cerrar sesiones activas que pertenezcan a mesas ya cerradas
  v_session_closed_label := public.get_valid_enum_label(
    'session_status_enum',
    ARRAY['SETTLED','COMPLETED','FINISHED','CANCELLED','CANCELED','ABANDONED','TERMINATED']
  );

  IF v_session_closed_label IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.game_sessions gs
          SET status = %L::session_status_enum
         FROM public.game_tables gt
        WHERE gs.table_id = gt.id
          AND gs.status::text = ANY($1)
          AND gt.status::text = ANY($2)',
      v_session_closed_label
    )
    USING v_active_session_statuses, v_closed_table_statuses;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tables_closed', v_tables_closed
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- Limpiar participación bloqueante de un usuario
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_stale_user_game_participation(
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_table_id UUID;
  v_result JSONB;
  v_closed_tables INT := 0;
  v_remaining INT;

  v_closed_table_statuses text[] := ARRAY[
    'FINISHED','CLOSED','CANCELED','CANCELLED','ABANDONED','TERMINATED','EXPIRED'
  ];

  v_active_table_statuses text[] := ARRAY[
    'WAITING','OPEN','LOBBY','STARTING','ACTIVE','IN_PROGRESS','PLAYING'
  ];

  v_active_session_statuses text[] := ARRAY[
    'WAITING','READY','STARTING','ACTIVE','IN_PROGRESS','PLAYING'
  ];

  v_inactive_session_statuses text[] := ARRAY[
    'SETTLED','COMPLETED','FINISHED','CANCELED','CANCELLED','ABANDONED','TERMINATED'
  ];
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_REQUIRED'
    );
  END IF;

  -- 1) Si el usuario aparece activo en mesas ya cerradas, marcar LEFT
  UPDATE public.game_table_players gtp
     SET status = 'LEFT'::player_table_status_enum
    FROM public.game_tables gt
   WHERE gt.id = gtp.table_id
     AND gtp.user_id = v_user_id
     AND gtp.status <> 'LEFT'::player_table_status_enum
     AND gt.status::text = ANY(v_closed_table_statuses);

  -- 2) Si el usuario aparece activo en mesas cuya sesión ya terminó o se liquidó, marcar LEFT
  UPDATE public.game_table_players gtp
     SET status = 'LEFT'::player_table_status_enum
    FROM public.game_tables gt
   WHERE gt.id = gtp.table_id
     AND gtp.user_id = v_user_id
     AND gtp.status <> 'LEFT'::player_table_status_enum
     AND NOT EXISTS (
       SELECT 1
         FROM public.game_sessions gs
        WHERE gs.table_id = gt.id
          AND gs.status::text = ANY(v_active_session_statuses)
     )
     AND EXISTS (
       SELECT 1
         FROM public.game_sessions gs
        WHERE gs.table_id = gt.id
          AND gs.status::text = ANY(v_inactive_session_statuses)
     );

  -- 3) Cerrar mesas huérfanas relacionadas con el usuario
  FOR v_table_id IN (
    SELECT DISTINCT gt.id
      FROM public.game_table_players gtp
      JOIN public.game_tables gt ON gt.id = gtp.table_id
     WHERE gtp.user_id = v_user_id
  ) LOOP
    v_result := public.close_game_table_if_orphaned(v_table_id);

    IF COALESCE((v_result->>'closed')::boolean, false) THEN
      v_closed_tables := v_closed_tables + 1;
    END IF;
  END LOOP;

  -- 4) Contar participaciones activas reales restantes
  SELECT COUNT(*)
    INTO v_remaining
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
   WHERE gtp.user_id = v_user_id
     AND gtp.status <> 'LEFT'::player_table_status_enum
     AND gt.status::text = ANY(v_active_table_statuses);

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'closed_tables', v_closed_tables,
    'remaining_active_tables', v_remaining
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- Salir forzosamente de una mesa específica
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_leave_game_table(
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AUTH_REQUIRED'
    );
  END IF;

  UPDATE public.game_table_players
     SET status = 'LEFT'::player_table_status_enum
   WHERE table_id = p_table_id
     AND user_id = v_user_id
     AND status <> 'LEFT'::player_table_status_enum;

  v_result := public.close_game_table_if_orphaned(p_table_id);

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'cleanup', v_result
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'table_id', p_table_id,
    'error', SQLERRM
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- Salir forzosamente de todas las mesas del usuario actual
-- Útil cuando quedó bloqueado por registros huérfanos
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_leave_all_game_tables(
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  r RECORD;
  v_result JSONB;
  v_left_rows INT;
  v_total_left INT := 0;
  v_closed_tables INT := 0;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'USER_REQUIRED'
    );
  END IF;

  -- Evitar que un usuario normal fuerce salida de otro usuario
  IF p_user_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'FORBIDDEN_OTHER_USER'
    );
  END IF;

  FOR r IN (
    SELECT DISTINCT gt.id AS table_id
      FROM public.game_table_players gtp
      JOIN public.game_tables gt ON gt.id = gtp.table_id
     WHERE gtp.user_id = v_user_id
       AND gtp.status <> 'LEFT'::player_table_status_enum
  ) LOOP
    UPDATE public.game_table_players
       SET status = 'LEFT'::player_table_status_enum
     WHERE table_id = r.table_id
       AND user_id = v_user_id
       AND status <> 'LEFT'::player_table_status_enum;

    GET DIAGNOSTICS v_left_rows = ROW_COUNT;
    v_total_left := v_total_left + v_left_rows;

    v_result := public.close_game_table_if_orphaned(r.table_id);

    IF COALESCE((v_result->>'closed')::boolean, false) THEN
      v_closed_tables := v_closed_tables + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'left_tables_players_rows', v_total_left,
    'closed_orphaned_tables', v_closed_tables
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- Trigger: cuando una sesión termina, cerrar mesa y dejar jugadores LEFT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_close_table_when_session_finished()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_inactive_session_statuses text[] := ARRAY[
    'SETTLED','COMPLETED','FINISHED','CANCELED','CANCELLED','ABANDONED','TERMINATED'
  ];
BEGIN
  IF NEW.status::text = ANY(v_inactive_session_statuses)
     AND pg_trigger_depth() <= 1 THEN
    PERFORM public.close_game_table(NEW.table_id, 'SESSION_FINISHED');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_table_when_session_finished
ON public.game_sessions;

CREATE TRIGGER trg_close_table_when_session_finished
AFTER UPDATE OF status
ON public.game_sessions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.tg_close_table_when_session_finished();

-- ------------------------------------------------------------------------------
-- Trigger: cuando un jugador queda LEFT, cerrar mesa si quedó huérfana
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_close_table_if_player_left()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status::text = 'LEFT'
     AND pg_trigger_depth() <= 1 THEN
    PERFORM public.close_game_table_if_orphaned(NEW.table_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_table_if_player_left
ON public.game_table_players;

CREATE TRIGGER trg_close_table_if_player_left
AFTER UPDATE OF status
ON public.game_table_players
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.tg_close_table_if_player_left();

-- ------------------------------------------------------------------------------
-- Reconciliación de create_game_table_secure con Auto-Limpieza Previa (Self-Healing)
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
        'auto_cleanup_create_100_' || v_stale_rec.table_id::text
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
    v_min_players := 1;
  ELSIF p_max_players = 4 THEN
    v_min_players := 2;
  ELSE
    v_min_players := p_max_players;
  END IF;

  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || v_enum_game_type::text);
  v_table_id := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '1 hour';

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

  -- 7. Inserción Atómica de la Mesa de Juego (Host siempre en seat 1)
  INSERT INTO public.game_tables (
    id, host_user_id, game_type, name, visibility,
    status, entry_fee, min_players, max_players,
    current_players_count, invite_code, config,
    created_at, updated_at, expires_at
  ) VALUES (
    v_table_id, v_user_id, v_enum_game_type, v_table_name, p_visibility,
    'OPEN'::table_status_enum, p_entry_fee, v_min_players, p_max_players,
    1, v_invite_code, p_config,
    NOW(), NOW(), v_expires_at
  );

  -- 8. Inserción del Creador como Jugador (Asiento 1 garantizado)
  v_player_id := gen_random_uuid();
  INSERT INTO public.game_table_players (
    id, table_id, user_id, seat_number, status, joined_at, updated_at
  ) VALUES (
    v_player_id, v_table_id, v_user_id, 1, 'JOINED'::player_table_status_enum, NOW(), NOW()
  );

  -- 9. Retención Segura de Fondos en Billetera (Entrada)
  IF p_entry_fee > 0 THEN
    UPDATE public.wallets
    SET available_balance = available_balance - p_entry_fee,
        held_balance = held_balance + p_entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    v_ledger_id := gen_random_uuid();
    INSERT INTO public.ledger_entries (
      id, user_id, wallet_id, amount, balance_after,
      balance_available_after, balance_held_after,
      idempotency_key, description, created_at
    ) VALUES (
      v_ledger_id, v_user_id, v_wallet_id, -p_entry_fee,
      (COALESCE(v_wallet_available, 0.00) + COALESCE(v_wallet_held, 0.00)),
      (COALESCE(v_wallet_available, 0.00) - p_entry_fee),
      (COALESCE(v_wallet_held, 0.00) + p_entry_fee),
      'create_table_fee_' || v_table_id::text || '_' || v_user_id::text,
      'Retención de entrada al crear la mesa ' || v_table_name,
      NOW()
    );
  END IF;

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

-- ------------------------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_valid_enum_label(text, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_valid_enum_label(text, text[]) TO service_role;

REVOKE ALL ON FUNCTION public.close_game_table(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.close_game_table(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.close_game_table_if_orphaned(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.close_game_table_if_orphaned(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_orphaned_game_tables() FROM public;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_game_tables() TO service_role;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_user_game_participation(uuid)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.force_leave_game_table(uuid)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.force_leave_all_game_tables(uuid)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
