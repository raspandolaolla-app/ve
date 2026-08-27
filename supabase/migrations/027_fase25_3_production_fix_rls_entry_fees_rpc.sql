-- ==============================================================================
-- MIGRACIÓN 027: RESOLUCIÓN DEFINITIVA DE RECURSIÓN RLS, CATÁLOGOS Y RPC
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / EJECUTAR EN SUPABASE SQL EDITOR DIRECTAMENTE
-- ==============================================================================

-- 1. CORREGIR POLÍTICAS RLS NO RECURSIVAS EN game_tables
DROP POLICY IF EXISTS p_tables_select ON public.game_tables;
CREATE POLICY p_tables_select ON public.game_tables
  FOR SELECT
  USING (
    (visibility = 'PUBLIC' AND status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
    OR host_user_id = auth.uid()
    OR public.is_operator_or_above(auth.uid())
    OR (visibility = 'PRIVATE' AND status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
  );

-- 2. CORREGIR POLÍTICAS RLS NO RECURSIVAS EN game_table_players
DROP POLICY IF EXISTS p_table_players_select ON public.game_table_players;
CREATE POLICY p_table_players_select ON public.game_table_players
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_tables t
      WHERE t.id = game_table_players.table_id
        AND (
          (t.visibility = 'PUBLIC' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
          OR t.host_user_id = auth.uid()
          OR (t.visibility = 'PRIVATE' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
        )
    )
  );

-- 3. POLÍTICAS RLS NO RECURSIVAS EN game_sessions
DROP POLICY IF EXISTS p_sessions_select ON public.game_sessions;
CREATE POLICY p_sessions_select ON public.game_sessions
  FOR SELECT
  USING (
    public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_tables t
      WHERE t.id = game_sessions.table_id
        AND (
          (t.visibility = 'PUBLIC' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
          OR t.host_user_id = auth.uid()
          OR (t.visibility = 'PRIVATE' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
        )
    )
  );

-- 4. POLÍTICAS RLS NO RECURSIVAS EN game_settlements
DROP POLICY IF EXISTS p_settlements_select ON public.game_settlements;
CREATE POLICY p_settlements_select ON public.game_settlements
  FOR SELECT
  USING (
    public.is_operator_or_above(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.game_tables t
      WHERE t.id = game_settlements.table_id
        AND (
          (t.visibility = 'PUBLIC' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
          OR t.host_user_id = auth.uid()
          OR (t.visibility = 'PRIVATE' AND t.status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE'))
        )
    )
  );

-- 5. TABLA entry_fees Y POBLACIÓN IDEMPOTENTE
CREATE TABLE IF NOT EXISTS public.entry_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(14,2) NOT NULL,
  game_type game_type_enum NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_entry_fee_positive CHECK (amount > 0.00)
);

ALTER TABLE public.entry_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_fees FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_entry_fees_read ON public.entry_fees;
CREATE POLICY p_entry_fees_read ON public.entry_fees
  FOR SELECT
  USING (true);

INSERT INTO public.entry_fees (amount, display_order, is_active)
SELECT v.amount, v.display_order, true
FROM (VALUES
  (10.00, 1),
  (15.00, 2),
  (20.00, 3),
  (25.00, 4),
  (50.00, 5),
  (100.00, 6),
  (250.00, 7),
  (500.00, 8),
  (1000.00, 9),
  (2000.00, 10)
) AS v(amount, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.entry_fees ef WHERE ef.amount = v.amount AND ef.game_type IS NULL
);

-- 6. FUNCIÓN DE NORMALIZACIÓN DE GAME TYPE
CREATE OR REPLACE FUNCTION public.fn_normalize_game_type_enum(p_game_str TEXT)
RETURNS game_type_enum
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := UPPER(TRIM(COALESCE(p_game_str, '')));
  
  -- Conversión de kebab-case o minusculas a nombres de enum
  v_normalized := REPLACE(v_normalized, '-', '_');

  CASE v_normalized
    WHEN 'DOMINO', 'DOMINO_VENEZOLANO', 'DOMINÓ', 'DOMINO-VENEZOLANO' THEN
      RETURN 'DOMINO_VENEZOLANO'::game_type_enum;
    WHEN 'TRUCO', 'TRUCO_VENEZOLANO', 'TRUCO-VENEZOLANO' THEN
      RETURN 'TRUCO_VENEZOLANO'::game_type_enum;
    WHEN 'TIC_TAC_TOE', 'TRES_EN_RAYA', 'LA_VIEJA', 'VIEJA', 'TIC-TAC-TOE' THEN
      RETURN 'TRES_EN_RAYA'::game_type_enum;
    WHEN 'ROCK_PAPER_SCISSORS', 'PIEDRA_PAPEL_TIJERA', 'PIEDRA_PAPEL_O_TIJERA' THEN
      RETURN 'PIEDRA_PAPEL_TIJERA'::game_type_enum;
    WHEN 'CHECKERS', 'DAMAS', 'DAMAS_ESPANOLAS', 'DAMAS_INTERNACIONALES' THEN
      RETURN 'DAMAS'::game_type_enum;
    WHEN 'BINGO', 'BINGO_75', 'BINGO_90', 'BINGO_LATINO' THEN
      RETURN 'BINGO'::game_type_enum;
    WHEN 'POLLA', 'POLLA_VENEZOLANA', 'POLLA_FUTBOL', 'POLLA_DEPORTIVA' THEN
      RETURN 'POLLA_VENEZOLANA'::game_type_enum;
    WHEN 'ATRAPAITO', 'ATRAPA_AL_MILLON', 'TRIVIA_ATRAPAITO', 'ATRAPA' THEN
      RETURN 'ATRAPAITO'::game_type_enum;
    ELSE
      -- Intento directo de casteo si coincide exactamente con el tipo
      BEGIN
        RETURN v_normalized::game_type_enum;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_GAME_TYPE: El tipo de juego "%" no es válido.', p_game_str;
      END;
  END CASE;
END;
$$;

-- 7. FUNCIÓN is_valid_entry_fee
CREATE OR REPLACE FUNCTION public.is_valid_entry_fee(
  p_amount NUMERIC,
  p_game_type game_type_enum DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_amount = 0.00 THEN
    RETURN TRUE;
  END IF;

  IF p_amount <= 0.00 THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.entry_fees
    WHERE amount = p_amount
      AND is_active = true
      AND (game_type IS NULL OR game_type = p_game_type)
  );
END;
$$;

-- 8. RPC create_game_table_secure
CREATE OR REPLACE FUNCTION public.create_game_table_secure(
  p_game_type TEXT,
  p_name VARCHAR DEFAULT NULL,
  p_visibility table_visibility_enum DEFAULT 'PUBLIC',
  p_entry_fee NUMERIC DEFAULT 0.00,
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para crear una mesa';
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

  IF v_profile_status IN ('SUSPENDED', 'BANNED', 'LOCKED') THEN
    RAISE EXCEPTION 'ACCOUNT_BLOCKED: Tu cuenta no está autorizada para crear mesas';
  END IF;

  v_enum_game_type := public.fn_normalize_game_type_enum(p_game_type);

  IF p_entry_fee < 0.00 THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada no puede ser negativo';
  END IF;

  IF NOT public.is_valid_entry_fee(p_entry_fee, v_enum_game_type) THEN
    RAISE EXCEPTION 'INVALID_ENTRY_FEE: El monto de entrada % Bs. no está autorizado en el sistema', p_entry_fee;
  END IF;

  IF p_max_players < 2 OR p_max_players > 1000 THEN
    RAISE EXCEPTION 'INVALID_PLAYERS_COUNT: Cantidad de jugadores inválida (mínimo 2, máximo 1000)';
  END IF;

  v_min_players := CASE 
    WHEN p_max_players = 4 THEN 2 
    WHEN p_max_players > 4 THEN 2
    ELSE p_max_players 
  END;

  LOOP
    v_code_attempts := v_code_attempts + 1;
    IF p_visibility = 'PRIVATE' THEN
      v_code_candidate := 'TRK-' || (1000 + floor(random() * 9000))::text;
    ELSE
      v_code_candidate := 'PUB-' || (1000 + floor(random() * 9000))::text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.game_tables WHERE invite_code = v_code_candidate) THEN
      v_invite_code := v_code_candidate;
      EXIT;
    END IF;

    IF v_code_attempts > 20 THEN
      v_invite_code := CASE WHEN p_visibility = 'PRIVATE' THEN 'TRK-' ELSE 'PUB-' END || substring(encode(gen_random_bytes(3), 'hex') from 1 for 5);
      EXIT;
    END IF;
  END LOOP;

  v_expires_at := NOW() + INTERVAL '2 hours';
  v_table_id := gen_random_uuid();
  v_table_name := COALESCE(NULLIF(trim(p_name), ''), 'Mesa de ' || v_enum_game_type::text);

  INSERT INTO public.game_tables (
    id,
    game_type,
    host_user_id,
    visibility,
    invite_code,
    entry_fee,
    min_players,
    max_players,
    current_players_count,
    status,
    config,
    expires_at
  ) VALUES (
    v_table_id,
    v_enum_game_type,
    v_user_id,
    p_visibility,
    v_invite_code,
    p_entry_fee,
    v_min_players,
    p_max_players,
    0,
    'OPEN',
    COALESCE(p_config, '{}'::jsonb),
    v_expires_at
  );

  RETURN jsonb_build_object(
    'success', true,
    'table_id', v_table_id,
    'game_type', v_enum_game_type,
    'invite_code', v_invite_code,
    'name', v_table_name,
    'entry_fee', p_entry_fee,
    'visibility', p_visibility,
    'max_players', p_max_players,
    'status', 'OPEN',
    'created_at', NOW()
  );
END;
$$;

-- 9. RPC get_admin_dashboard_metrics CORREGIDA
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_users_count INT;
  v_active_users INT;
  v_tables_count INT;
  v_pending_deposits INT;
  v_pending_withdrawals INT;
  v_volume NUMERIC(14,2);
  v_prizes NUMERIC(14,2);
  v_fees NUMERIC(14,2);
  v_security_alerts INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL OR NOT public.is_operator_or_above(v_caller_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT COUNT(*) INTO v_users_count FROM public.profiles;
  SELECT COUNT(*) INTO v_active_users FROM public.profiles WHERE account_status = 'ACTIVE';
  
  SELECT COUNT(*) INTO v_tables_count 
  FROM public.game_tables 
  WHERE status IN ('OPEN', 'FULL', 'STARTING', 'ACTIVE');

  SELECT COUNT(*) INTO v_pending_deposits FROM public.deposit_requests WHERE status = 'PENDING';
  SELECT COUNT(*) INTO v_pending_withdrawals FROM public.withdrawal_requests WHERE status = 'PENDING';
  
  SELECT 
    COALESCE(SUM(gross_pool), 0.00), 
    COALESCE(SUM(prize_pool), 0.00), 
    COALESCE(SUM(platform_fee), 0.00)
  INTO v_volume, v_prizes, v_fees
  FROM public.game_settlements;

  SELECT COUNT(*) INTO v_security_alerts 
  FROM public.audit_logs 
  WHERE severity IN ('WARNING', 'CRITICAL');

  RETURN jsonb_build_object(
    'registeredUsersCount', v_users_count,
    'activeUsersCount', v_active_users,
    'connectedUsersCount', v_active_users,
    'activeTablesCount', v_tables_count,
    'pendingDepositsCount', v_pending_deposits,
    'pendingWithdrawalsCount', v_pending_withdrawals,
    'totalVolumePlayed', v_volume,
    'totalPrizesAwarded', v_prizes,
    'totalServiceFeesCollected', v_fees,
    'securityAlertsCount', v_security_alerts
  );
END;
$$;

-- 10. PERMISOS Y PRIVILEGIOS POSTGREST
GRANT SELECT ON TABLE public.entry_fees TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_tables TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_table_players TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_sessions TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.game_settlements TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fn_normalize_game_type_enum(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_valid_entry_fee(NUMERIC, game_type_enum) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_game_table_secure(TEXT, VARCHAR, table_visibility_enum, NUMERIC, SMALLINT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated, service_role;

-- 11. RECARGA DE ESQUEMA POSTGREST
NOTIFY pgrst, 'reload schema';
