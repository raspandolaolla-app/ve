-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 130: SISTEMA FINANCIERO CENTRALIZADO Y AUTORITATIVO
-- ==============================================================================
-- 1. Tabla public.financial_rules: Fuente única de verdad para comisiones y premios
-- 2. Función canónica public.universal_settle_game_session:
--    - Lee dinámicamente las tasas activas desde financial_rules
--    - Aplica deducción atómica de held_balance para todos los participantes
--    - Acredita premio al/los ganador(es) o restituye fondos en caso de empate (DRAW)
--    - Registros inmutables en ledger_entries y game_settlements
-- 3. Delegación de retrocompatibilidad para settle_game_session y settle_game_session_secure
-- 4. Función de consulta public.get_financial_rules()
-- 5. Recarga de esquema PostgREST
-- ==============================================================================

-- 1. CREAR TABLA DE REGLAS FINANCIERAS (FUENTE ÚNICA DE VERDAD)
CREATE TABLE IF NOT EXISTS public.financial_rules (
  id TEXT PRIMARY KEY DEFAULT 'GLOBAL',
  rule_name TEXT NOT NULL UNIQUE DEFAULT 'GLOBAL_FINANCIAL_RULE',
  winner_percentage NUMERIC(5,2) NOT NULL DEFAULT 90.00,
  platform_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT DEFAULT 'Regla financiera global de comisiones y premios (90% ganador / 10% plataforma)',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS y políticas
ALTER TABLE public.financial_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on financial_rules" ON public.financial_rules;
CREATE POLICY "Allow public read on financial_rules"
  ON public.financial_rules FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Allow admin manage on financial_rules" ON public.financial_rules;
CREATE POLICY "Allow admin manage on financial_rules"
  ON public.financial_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() AND r.name IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- Insertar configuración inicial por defecto (90% / 10%)
INSERT INTO public.financial_rules (id, rule_name, winner_percentage, platform_fee_percentage, is_active, description)
VALUES ('GLOBAL', 'GLOBAL_FINANCIAL_RULE', 90.00, 10.00, true, 'Regla financiera global de comisiones (90% ganador / 10% plataforma)')
ON CONFLICT (id) DO UPDATE SET
  is_active = true,
  updated_at = NOW();


-- FUNCIÓN DE LECTURA RÁPIDA DE REGLAS FINANCIERAS
CREATE OR REPLACE FUNCTION public.get_financial_rules()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_rule RECORD;
BEGIN
  SELECT * INTO v_rule
  FROM public.financial_rules
  WHERE is_active = true
  ORDER BY (id = 'GLOBAL') DESC, created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'winner_percentage', 90.00,
      'platform_fee_percentage', 10.00,
      'rule_name', 'DEFAULT_FALLBACK'
    );
  END IF;

  RETURN jsonb_build_object(
    'winner_percentage', v_rule.winner_percentage,
    'platform_fee_percentage', v_rule.platform_fee_percentage,
    'rule_name', v_rule.rule_name,
    'description', v_rule.description
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_rules() TO authenticated, anon, service_role;


-- 2. FUNCIÓN AUTORITATIVA CENTRAL: universal_settle_game_session
CREATE OR REPLACE FUNCTION public.universal_settle_game_session(
  p_session_id UUID,
  p_winner_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_winner_team INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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
  v_winner_wallet RECORD;
  v_player_wallet RECORD;
  v_winner_ledger_id UUID;
  v_refund_ledger_id UUID;
  v_total_players INTEGER := 0;
  v_table_players UUID[] := ARRAY[]::UUID[];
  v_settlement_type settlement_type_enum := 'NORMAL'::settlement_type_enum;
  v_is_draw BOOLEAN := false;
BEGIN
  -- 1. Idempotencia estricta: Verificar liquidación existente por idempotency_key
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) != '' THEN
    SELECT * INTO v_existing_settlement
    FROM public.game_settlements
    WHERE idempotency_key = trim(p_idempotency_key)
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'session_id', v_existing_settlement.session_id,
        'table_id', v_existing_settlement.table_id,
        'gross_pool', v_existing_settlement.gross_pool,
        'platform_fee', v_existing_settlement.platform_fee,
        'prize_pool', v_existing_settlement.prize_pool,
        'winner_user_id', COALESCE(p_winner_user_ids[1], NULL),
        'settlement_id', v_existing_settlement.id
      );
    END IF;
  END IF;

  -- 2. Bloquear la sesión con FOR UPDATE
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: No se encontró la sesión especificada (%)', p_session_id;
  END IF;

  IF v_session.is_settled = true THEN
    SELECT * INTO v_existing_settlement
    FROM public.game_settlements
    WHERE session_id = p_session_id
    ORDER BY created_at DESC
    LIMIT 1;

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

  -- 3. Bloquear la mesa asociada
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE id = v_session.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: No se encontró la mesa asociada a la sesión.';
  END IF;

  -- 4. Leer Fuente Única de Verdad: Reglas Financieras Centralizadas
  SELECT * INTO v_rule
  FROM public.financial_rules
  WHERE is_active = true
  ORDER BY (id = 'GLOBAL') DESC, created_at ASC
  LIMIT 1;

  IF FOUND THEN
    v_winner_pct := COALESCE(v_rule.winner_percentage, 90.00);
    v_platform_pct := COALESCE(v_rule.platform_fee_percentage, 10.00);
  END IF;

  -- Normalización matemática para prevenir fugas de fondos
  IF (v_winner_pct + v_platform_pct) != 100.00 THEN
    v_platform_pct := GREATEST(0.00, 100.00 - v_winner_pct);
  END IF;

  -- 5. Obtener participantes de la mesa
  SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), ARRAY[]::UUID[]) INTO v_table_players
  FROM public.game_table_players
  WHERE table_id = v_table.id;

  IF array_length(v_table_players, 1) IS NULL OR array_length(v_table_players, 1) = 0 THEN
    v_table_players := p_winner_user_ids;
  END IF;

  v_total_players := GREATEST(COALESCE(array_length(v_table_players, 1), 0), 2);
  v_entry_fee := COALESCE(v_table.entry_fee, 0.00);
  v_gross_pool := v_entry_fee * v_total_players;
  v_platform_fee := ROUND(v_gross_pool * (v_platform_pct / 100.00), 2);
  v_prize_pool := v_gross_pool - v_platform_fee;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'stl_' || p_session_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  v_winners_count := COALESCE(array_length(p_winner_user_ids, 1), 0);

  IF v_winners_count > 0 AND p_winner_user_ids[1] IS NOT NULL THEN
    v_primary_winner_id := p_winner_user_ids[1];
    v_is_draw := false;
  ELSE
    v_settlement_type := 'DRAW'::settlement_type_enum;
    v_is_draw := true;
  END IF;

  -- 6. Insertar registro en game_settlements
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

  -- 7. GESTIÓN ATÓMICA DE FONDOS RETENIDOS (held_balance)
  -- Para TODOS los participantes de la mesa:
  IF v_entry_fee > 0.00 AND v_table_players IS NOT NULL AND array_length(v_table_players, 1) > 0 THEN
    FOREACH v_player_id IN ARRAY v_table_players LOOP
      SELECT * INTO v_player_wallet
      FROM public.wallets
      WHERE user_id = v_player_id AND currency = 'VES'
      FOR UPDATE;

      IF FOUND THEN
        IF v_is_draw THEN
          -- EMPATE / REEMBOLSO: Regresar el saldo retenido a disponible
          UPDATE public.wallets
          SET available_balance = available_balance + v_entry_fee,
              held_balance = GREATEST(0.00, held_balance - v_entry_fee),
              updated_at = NOW()
          WHERE id = v_player_wallet.id;

          v_refund_ledger_id := gen_random_uuid();
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
            v_refund_ledger_id,
            v_player_wallet.id,
            v_player_id,
            v_entry_fee,
            'VES',
            'GAME_REFUND'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            v_settlement_id,
            'game_settlements',
            'game_settlement',
            COALESCE(v_player_wallet.available_balance, 0.00) + v_entry_fee,
            COALESCE(v_player_wallet.available_balance, 0.00) + v_entry_fee,
            GREATEST(0.00, COALESCE(v_player_wallet.held_balance, 0.00) - v_entry_fee),
            v_effective_idempotency || '_refund_' || v_player_id::text,
            'Devolución de entrada por empate en ' || COALESCE(v_table.game_type, 'juego'),
            NOW()
          );
        ELSE
          -- PARTIDA NORMAL CON GANADOR: Descontar definitivamente el saldo retenido
          UPDATE public.wallets
          SET held_balance = GREATEST(0.00, held_balance - v_entry_fee),
              updated_at = NOW()
          WHERE id = v_player_wallet.id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 8. ACREDITACIÓN DE PREMIO A LOS GANADORES EN available_balance
  IF NOT v_is_draw AND v_winners_count > 0 AND v_prize_pool > 0.00 THEN
    v_individual_prize := ROUND(v_prize_pool / v_winners_count, 2);

    FOREACH v_winner_id IN ARRAY p_winner_user_ids LOOP
      IF v_winner_id IS NOT NULL THEN
        SELECT * INTO v_winner_wallet
        FROM public.wallets
        WHERE user_id = v_winner_id AND currency = 'VES'
        FOR UPDATE;

        IF FOUND THEN
          UPDATE public.wallets
          SET available_balance = available_balance + v_individual_prize,
              updated_at = NOW()
          WHERE id = v_winner_wallet.id;

          v_winner_ledger_id := gen_random_uuid();
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
            'GAME_WIN'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            v_settlement_id,
            'game_settlements',
            'game_settlement',
            COALESCE(v_winner_wallet.available_balance, 0.00) + v_individual_prize,
            COALESCE(v_winner_wallet.available_balance, 0.00) + v_individual_prize,
            COALESCE(v_winner_wallet.held_balance, 0.00),
            v_effective_idempotency || '_win_' || v_winner_id::text,
            'Premio por victoria en partida (' || v_winner_pct::text || '% del pozo)',
            NOW()
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 9. Actualizar estado oficial de la sesión
  UPDATE public.game_sessions
  SET is_settled = true,
      status = (CASE WHEN v_is_draw THEN 'CANCELLED' ELSE 'FINISHED' END)::session_status_enum,
      winner_user_id = v_primary_winner_id,
      ended_at = NOW(),
      settled_at = NOW(),
      gross_pool = v_gross_pool,
      platform_fee = v_platform_fee,
      prize_pool = v_prize_pool,
      updated_at = NOW()
  WHERE id = p_session_id;

  -- 10. Actualizar estado de la mesa
  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_table.id;

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

GRANT EXECUTE ON FUNCTION public.universal_settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role, anon;


-- 3. RETROCOMPATIBILIDAD: settle_game_session DELEGA A universal_settle_game_session
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
BEGIN
  RETURN public.universal_settle_game_session(
    p_session_id,
    p_winner_user_ids,
    p_winner_team,
    p_idempotency_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role, anon;


-- 4. RETROCOMPATIBILIDAD: settle_game_session_secure DELEGA A universal_settle_game_session
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
  v_winner_array UUID[] := ARRAY[]::UUID[];
BEGIN
  IF p_winner_user_id IS NOT NULL THEN
    v_winner_array := ARRAY[p_winner_user_id];
  END IF;

  RETURN public.universal_settle_game_session(
    p_session_id,
    v_winner_array,
    p_winner_team,
    p_idempotency_key
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_game_session_secure(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role, anon;

-- 5. RECARGA DEL ESQUEMA EN POSTGREST
NOTIFY pgrst, 'reload schema';
