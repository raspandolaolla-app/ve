-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 143: SISTEMA FINANCIERO CENTRALIZADO Y AUDITORÍA FORENSE DE SALDOS RETENIDOS
-- ==============================================================================
-- 1. Tabla public.financial_rules (Fuente única de verdad para comisiones y premios)
-- 2. Función public.get_financial_rules()
-- 3. Función canónica public.universal_settle_game_session (90/10, captura de held_balance y abono de premio)
-- 4. Delegación de retrocompatibilidad para settle_game_session y settle_game_session_secure
-- 5. Función public.refund_game_session (Devolución íntegra 100% held_balance -> available_balance)
-- 6. Función public.rpc_claim_bingo_secure corregida (libera held_balance de todos los compradores de Bingo)
-- 7. Función public.refund_bingo_session_secure (Reembolso de cartones si se cancela la sala)
-- 8. Funciones de abandono actualizadas con enums válidos: abandon_game_secure y abandon_game_table_secure
-- 9. Corrección de admin_terminate_game_table para deducir held_balance en reembolsos
-- 10. Función de auditoría y conciliación forense de saldos huérfanos: audit_and_reconcile_held_balances()
-- ==============================================================================

-- 1. CREAR TABLA DE REGLAS FINANCIERAS
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

-- RLS y permisos para financial_rules
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
      WHERE ur.user_id = auth.uid() AND ur.role::text IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- Configuración inicial por defecto
INSERT INTO public.financial_rules (id, rule_name, winner_percentage, platform_fee_percentage, is_active, description)
VALUES ('GLOBAL', 'GLOBAL_FINANCIAL_RULE', 90.00, 10.00, true, 'Regla financiera global de comisiones (90% ganador / 10% plataforma)')
ON CONFLICT (id) DO UPDATE SET
  winner_percentage = 90.00,
  platform_fee_percentage = 10.00,
  is_active = true,
  updated_at = NOW();

-- 2. FUNCIÓN DE LECTURA DE REGLAS FINANCIERAS
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

-- 3. FUNCIÓN AUTORITATIVA CENTRAL: universal_settle_game_session
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
  v_total_players INTEGER := 0;
  v_table_players UUID[] := ARRAY[]::UUID[];
  v_settlement_type settlement_type_enum := 'STANDARD_PAYOUT'::settlement_type_enum;
  v_is_draw BOOLEAN := false;
BEGIN
  -- 1. Idempotencia estricta: Verificar si ya existe liquidación por clave o por sesión
  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'stl_' || p_session_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text
  );

  SELECT * INTO v_existing_settlement
  FROM public.game_settlements
  WHERE session_id = p_session_id OR (idempotency_key IS NOT NULL AND idempotency_key = v_effective_idempotency)
  ORDER BY settled_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'session_id', v_existing_settlement.session_id,
      'table_id', v_existing_settlement.table_id,
      'gross_pool', v_existing_settlement.gross_pool,
      'platform_fee', v_existing_settlement.platform_fee,
      'prize_pool', v_existing_settlement.prize_pool,
      'winner_user_id', COALESCE(p_winner_user_ids[1], NULL),
      'settlement_id', v_existing_settlement.id
    );
  END IF;

  -- 2. Bloquear la sesión con FOR UPDATE
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: No se encontró la sesión especificada (%)', p_session_id;
  END IF;

  IF v_session.status::text IN ('FINISHED', 'CANCELLED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_settled', true,
      'session_id', p_session_id,
      'winner_user_id', v_session.winner_user_id
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

  IF (v_winner_pct + v_platform_pct) != 100.00 THEN
    v_platform_pct := GREATEST(0.00, 100.00 - v_winner_pct);
  END IF;

  -- 5. Obtener todos los participantes con trazabilidad completa (mesa, ledger y ganadores)
  SELECT COALESCE(ARRAY_AGG(DISTINCT u_id), ARRAY[]::UUID[]) INTO v_table_players
  FROM (
    SELECT user_id AS u_id FROM public.game_table_players WHERE table_id = v_table.id
    UNION
    SELECT user_id AS u_id FROM public.ledger_entries WHERE reference_id = v_table.id AND entry_type = 'TABLE_ENTRY_HOLD'::ledger_entry_type_enum
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
          -- EMPATE TÉCNICO: Regresar saldo retenido a saldo disponible al 100%
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
          -- PARTIDA NORMAL CON GANADOR: Capturar y descontar definitivamente held_balance
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

  -- 8. ACREDITACIÓN DE PREMIO A LOS GANADORES EN available_balance
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

GRANT EXECUTE ON FUNCTION public.universal_settle_game_session(UUID, UUID[], INTEGER, TEXT) TO authenticated, service_role, anon;

-- 4. RETROCOMPATIBILIDAD: settle_game_session
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

-- RETROCOMPATIBILIDAD: settle_game_session_secure
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

-- 5. FUNCIÓN CENTRALIZADA DE REEMBOLSO: refund_game_session
CREATE OR REPLACE FUNCTION public.refund_game_session(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'CANCELLED',
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

  -- 3. Identificar TODOS los participantes que aportaron entrada
  SELECT COALESCE(ARRAY_AGG(DISTINCT u_id), ARRAY[]::UUID[]) INTO v_participants
  FROM (
    SELECT user_id AS u_id FROM public.game_table_players WHERE table_id = v_table.id
    UNION
    SELECT user_id AS u_id FROM public.ledger_entries WHERE reference_id = v_table.id AND entry_type = 'TABLE_ENTRY_HOLD'::ledger_entry_type_enum
    UNION
    SELECT user_id AS u_id FROM public.ledger_entries WHERE reference_id = p_session_id AND entry_type = 'TABLE_ENTRY_HOLD'::ledger_entry_type_enum
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

GRANT EXECUTE ON FUNCTION public.refund_game_session(UUID, TEXT, TEXT) TO authenticated, service_role, anon;

-- 6. CORRECCIÓN ROBUSTA DE rpc_claim_bingo_secure
-- Liquidación autoritativa 90/10 y liberación de held_balance para TODOS los participantes
CREATE OR REPLACE FUNCTION public.rpc_claim_bingo_secure(
  p_session_id UUID,
  p_card_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_current_state JSONB;
  v_drawn_balls INT[];
  v_variant TEXT;
  v_purchase RECORD;
  v_user_cards JSONB;
  v_valid_bingo BOOLEAN := false;
  v_total_sales NUMERIC(14,2) := 0.00;
  v_winner_pool NUMERIC(14,2) := 0.00;
  v_platform_fee NUMERIC(14,2) := 0.00;
  v_winner_wallet RECORD;
  v_winner_profile RECORD;
  v_winner_name TEXT;
  v_winner_avatar TEXT;
  v_card_item JSONB;
  v_player_purchase RECORD;
  v_p_wallet RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'USUARIO_NO_AUTENTICADO');
  END IF;

  -- 1. Bloquear la Sesión para Garantizar UN SOLO Ganador Atómico
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  v_current_state := COALESCE(v_session.current_state, '{}'::jsonb);

  -- Si la partida ya fue reclamada y tiene ganador
  IF (v_current_state->>'winnerUserId') IS NOT NULL AND (v_current_state->>'winnerUserId') <> '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'claimed_already', true,
      'winner_user_id', v_current_state->>'winnerUserId',
      'error', 'El bingo ya fue reclamado y verificado por otro jugador.'
    );
  END IF;

  -- Extraer balotas jugadas
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(v_current_state->'drawnBalls', '[]'::jsonb))::INT
  ) INTO v_drawn_balls;

  v_variant := COALESCE(v_current_state->>'variant', '75');

  -- 2. Obtener Cartones del Usuario para esta Mesa
  SELECT * INTO v_purchase
  FROM public.bingo_card_purchases
  WHERE game_table_id = v_session.table_id AND user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'CARTON_NO_ENCONTRADO: No posees cartones registrados para esta mesa.');
  END IF;

  v_user_cards := v_purchase.cards_data;

  -- 3. Validar Canto de Bingo en Servidor (100% Server-Authoritative)
  IF array_length(v_drawn_balls, 1) IS NULL OR array_length(v_drawn_balls, 1) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANTO_FALSO: Se han extraído muy pocas balotas para completar Bingo.');
  END IF;

  FOR v_card_item IN SELECT jsonb_array_elements(v_user_cards) LOOP
    IF public.fn_validate_bingo_card_win(v_card_item, v_variant, v_drawn_balls) THEN
      v_valid_bingo := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_valid_bingo THEN
    RETURN jsonb_build_object('success', false, 'error', 'CANTO_FALSO: Tus cartones no completan un Bingo válido con las balotas extraídas.');
  END IF;

  -- 4. Calcular Pozo Total y Otorgar Premio (90% al Ganador, 10% Plataforma)
  SELECT COALESCE(SUM(total_cost), 0.00) INTO v_total_sales
  FROM public.bingo_card_purchases
  WHERE game_table_id = v_session.table_id;

  v_winner_pool := ROUND(v_total_sales * 0.90, 2);
  v_platform_fee := v_total_sales - v_winner_pool;

  IF v_winner_pool <= 0.00 THEN
    v_winner_pool := ROUND(COALESCE(v_purchase.total_cost, 25.00) * 0.90, 2);
  END IF;

  -- Actualizar billetera del ganador
  SELECT * INTO v_winner_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_winner_wallet.id IS NULL THEN
    INSERT INTO public.wallets (user_id, available_balance, held_balance)
    VALUES (v_user_id, v_winner_pool, 0.00)
    RETURNING * INTO v_winner_wallet;
  ELSE
    UPDATE public.wallets
    SET available_balance = available_balance + v_winner_pool,
        updated_at = NOW()
    WHERE id = v_winner_wallet.id;
  END IF;

  -- Registrar Premio en ledger_entries oficial
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
    v_winner_wallet.id,
    v_user_id,
    v_winner_pool,
    'VES',
    'GAME_PRIZE_CREDIT'::ledger_entry_type_enum,
    'CREDIT'::ledger_direction_enum,
    p_session_id,
    'game_sessions',
    'bingo_session',
    v_winner_wallet.available_balance + v_winner_pool,
    v_winner_wallet.available_balance + v_winner_pool,
    v_winner_wallet.held_balance,
    'bingo_prize_' || p_session_id::text || '_' || v_user_id::text,
    'Premio de Bingo ' || v_variant || ' Bolas (90% pozo)',
    NOW()
  );

  -- 5. LIBERACIÓN ATÓMICA DE SALDOS RETENIDOS DE TODOS LOS PARTICIPANTES DE ESTE BINGO
  -- Por cada usuario que compró cartones en esta mesa, descontar de held_balance y registrar captura
  FOR v_player_purchase IN
    SELECT user_id, SUM(total_cost) as total_purchase
    FROM public.bingo_card_purchases
    WHERE game_table_id = v_session.table_id
    GROUP BY user_id
  LOOP
    SELECT * INTO v_p_wallet
    FROM public.wallets
    WHERE user_id = v_player_purchase.user_id
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.wallets
      SET held_balance = GREATEST(0.00, held_balance - v_player_purchase.total_purchase),
          updated_at = NOW()
      WHERE id = v_p_wallet.id;

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
        v_p_wallet.id,
        v_player_purchase.user_id,
        v_player_purchase.total_purchase,
        'VES',
        'TABLE_ENTRY_CAPTURE'::ledger_entry_type_enum,
        'DEBIT'::ledger_direction_enum,
        p_session_id,
        'game_sessions',
        'bingo_session',
        v_p_wallet.available_balance,
        v_p_wallet.available_balance,
        GREATEST(0.00, v_p_wallet.held_balance - v_player_purchase.total_purchase),
        'bingo_capture_' || p_session_id::text || '_' || v_player_purchase.user_id::text,
        'Captura de fondos retenidos por compra de cartones de Bingo',
        NOW()
      );
    END IF;
  END LOOP;

  -- 6. Obtener Perfil del Ganador
  SELECT first_name, last_name, avatar_url INTO v_winner_profile
  FROM public.profiles
  WHERE user_id = v_user_id;

  v_winner_name := TRIM(COALESCE(v_winner_profile.first_name || ' ' || v_winner_profile.last_name, 'Jugador Bingo'));
  v_winner_avatar := v_winner_profile.avatar_url;

  -- 7. Actualizar Estado de la Sesión y Mesa
  v_current_state := v_current_state || jsonb_build_object(
    'status', 'bingo_won',
    'winnerUserId', v_user_id,
    'winnerName', v_winner_name,
    'winnerAvatar', v_winner_avatar,
    'winnerPoolBs', v_winner_pool
  );

  UPDATE public.game_sessions
  SET status = 'FINISHED'::session_status_enum,
      winner_user_id = v_user_id,
      ended_at = NOW(),
      current_state = v_current_state,
      updated_at = NOW()
  WHERE id = p_session_id;

  UPDATE public.game_tables
  SET status = 'CLOSED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      finished_at = NOW(),
      updated_at = NOW()
  WHERE id = v_session.table_id;

  -- 8. Historial Dedicado de Bingo
  INSERT INTO public.bingo_winner_history (
    session_id,
    user_id,
    winner_name,
    prize_bs,
    photo_url
  ) VALUES (
    p_session_id,
    v_user_id,
    v_winner_name,
    v_winner_pool,
    NULL
  );

  -- Limpieza automática de registros antiguos de Bingo
  DELETE FROM public.bingo_winner_history WHERE created_at < NOW() - INTERVAL '7 days';

  RETURN jsonb_build_object(
    'success', true,
    'winner_user_id', v_user_id,
    'winner_name', v_winner_name,
    'winner_avatar', v_winner_avatar,
    'prize_bs', v_winner_pool,
    'variant', v_variant,
    'message', '¡Felicidades! Se te ha acreditado el premio de ' || v_winner_pool || ' Bs.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_claim_bingo_secure(UUID, UUID) TO authenticated, service_role, anon;

-- 7. FUNCIÓN PARA REEMBOLSAR SALAS DE BINGO CANCELADAS O SIN GANADOR
CREATE OR REPLACE FUNCTION public.refund_bingo_session_secure(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'Cancelación de sala de Bingo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_session RECORD;
  v_player_purchase RECORD;
  v_p_wallet RECORD;
  v_refunded_count INT := 0;
  v_total_refunded NUMERIC(14,2) := 0.00;
BEGIN
  SELECT * INTO v_session
  FROM public.game_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SESION_NO_ENCONTRADA');
  END IF;

  IF v_session.status = 'FINISHED'::session_status_enum THEN
    RETURN jsonb_build_object('success', false, 'error', 'SALA_YA_LIQUIDADA_CON_GANADOR');
  END IF;

  -- Reembolsar a todos los compradores de cartones de esta mesa
  FOR v_player_purchase IN
    SELECT user_id, SUM(total_cost) as total_purchase
    FROM public.bingo_card_purchases
    WHERE game_table_id = v_session.table_id
    GROUP BY user_id
  LOOP
    SELECT * INTO v_p_wallet
    FROM public.wallets
    WHERE user_id = v_player_purchase.user_id
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.wallets
      SET available_balance = available_balance + v_player_purchase.total_purchase,
          held_balance = GREATEST(0.00, held_balance - v_player_purchase.total_purchase),
          updated_at = NOW()
      WHERE id = v_p_wallet.id;

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
        v_p_wallet.id,
        v_player_purchase.user_id,
        v_player_purchase.total_purchase,
        'VES',
        'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
        'CREDIT'::ledger_direction_enum,
        p_session_id,
        'game_sessions',
        'bingo_session',
        v_p_wallet.available_balance + v_player_purchase.total_purchase,
        v_p_wallet.available_balance + v_player_purchase.total_purchase,
        GREATEST(0.00, v_p_wallet.held_balance - v_player_purchase.total_purchase),
        'bingo_refund_' || p_session_id::text || '_' || v_player_purchase.user_id::text,
        'Reembolso íntegro por cancelación de sala de Bingo: ' || COALESCE(p_reason, 'Cancelación'),
        NOW()
      );

      v_refunded_count := v_refunded_count + 1;
      v_total_refunded := v_total_refunded + v_player_purchase.total_purchase;
    END IF;
  END LOOP;

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
  WHERE id = v_session.table_id;

  RETURN jsonb_build_object(
    'success', true,
    'refunded_count', v_refunded_count,
    'total_refunded', v_total_refunded
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_bingo_session_secure(UUID, TEXT) TO authenticated, service_role, anon;

-- 8. ABANDONO SEGURO CON ENUMS VÁLIDOS: abandon_game_table_secure
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
  -- Liberar de held_balance y restituir a available_balance con TABLE_ENTRY_REFUND
  IF NOT v_session_is_active AND COALESCE(v_table.entry_fee, 0.00) > 0.00 THEN
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_caller_id
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.wallets
      SET available_balance = available_balance + v_table.entry_fee,
          held_balance = GREATEST(0.00, held_balance - v_table.entry_fee),
          updated_at = NOW()
      WHERE id = v_wallet.id;

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
        v_wallet.id,
        v_caller_id,
        v_table.entry_fee,
        'VES',
        'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
        'CREDIT'::ledger_direction_enum,
        p_table_id,
        'game_tables',
        'game_table',
        v_wallet.available_balance + v_table.entry_fee,
        v_wallet.available_balance + v_table.entry_fee,
        GREATEST(0.00, v_wallet.held_balance - v_table.entry_fee),
        v_effective_idempotency || '_refund',
        'Reembolso por abandonar mesa antes del inicio',
        NOW()
      );

      v_refund_amount := v_table.entry_fee;
    END IF;
  END IF;

  -- 5. Contar jugadores restantes
  SELECT COUNT(DISTINCT user_id) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum;

  -- 6. Si la partida estaba activa
  IF v_session_is_active THEN
    IF v_active_players_count = 1 THEN
      SELECT user_id INTO v_remaining_player
      FROM public.game_table_players
      WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum
      LIMIT 1;

      IF v_remaining_player.user_id IS NOT NULL THEN
        v_settle_result := public.universal_settle_game_session(
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
      -- Si ya no queda ningún jugador, reembolsar íntegramente
      PERFORM public.refund_game_session(
        v_session.id,
        'Abandono de todos los jugadores',
        v_effective_idempotency || '_all_abandon_refund'
      );
    END IF;
  ELSE
    -- Mesa en lobby
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

GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, TEXT) TO authenticated, service_role, anon;

-- ABANDONO UNIVERSAL POR SESIÓN: abandon_game_secure
CREATE OR REPLACE FUNCTION public.abandon_game_secure(
  p_session_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_session RECORD;
  v_table RECORD;
  v_game_type TEXT;
  v_opponent_id UUID;
  v_effective_idempotency TEXT;
  v_next_seq INT := 1;
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

  -- Marcar jugador como ABANDONED
  UPDATE public.game_table_players
  SET status = 'ABANDONED'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = v_session.table_id
     AND user_id = v_user_id
     AND status::text NOT IN ('ABANDONED', 'LEFT');

  -- Lógica de liquidación por tipo de juego
  IF v_game_type IN ('atrapaito', 'chess', 'checkers', 'tictactoe', 'tic_tac_toe', 'rps', 'rock_paper_scissors', 'domino', 'domino_venezolano', 'truco', 'truco_venezolano', 'una_olla', 'unaolla') THEN
    SELECT user_id INTO v_opponent_id
    FROM public.game_table_players
    WHERE table_id = v_session.table_id
       AND user_id != v_user_id
       AND status::text NOT IN ('ABANDONED', 'LEFT')
    LIMIT 1;

    IF v_opponent_id IS NOT NULL THEN
      -- Liquidar autoritativamente con el oponente como ganador
      PERFORM public.universal_settle_game_session(
        p_session_id,
        ARRAY[v_opponent_id],
        NULL,
        v_effective_idempotency || '_settle'
      );
    ELSE
      -- Sin oponentes: reembolsar íntegramente
      PERFORM public.refund_game_session(
        p_session_id,
        'Abandono sin oponentes activos',
        v_effective_idempotency || '_refund'
      );
    END IF;
  ELSIF v_game_type = 'bingo' THEN
    -- En Bingo, abandonar solo desmarca al jugador sin alterar el pozo
    UPDATE public.game_sessions
    SET current_state = jsonb_set(
        COALESCE(current_state, '{}'::jsonb),
        '{abandonedPlayers}',
        COALESCE(current_state->'abandonedPlayers', '[]'::jsonb) || to_jsonb(v_user_id::text)
    ),
    updated_at = NOW()
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Has abandonado la partida correctamente');
END;
$$;

GRANT EXECUTE ON FUNCTION public.abandon_game_secure(UUID, TEXT) TO authenticated, service_role, anon;

-- 9. CORRECCIÓN DE admin_terminate_game_table PARA DEDUCIR held_balance
CREATE OR REPLACE FUNCTION public.admin_terminate_game_table(
  p_table_id UUID,
  p_reason TEXT DEFAULT 'Terminada por administración',
  p_refund_players BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_table RECORD;
  v_player RECORD;
  v_player_wallet RECORD;
  v_refunded_count INT := 0;
  v_refund_amount NUMERIC(14,2);
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_player_id UUID;
  v_participants UUID[] := ARRAY[]::UUID[];
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NOT NULL THEN
    SELECT (
      public.is_admin(v_caller_id) OR 
      public.is_operator_or_above(v_caller_id) OR 
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_caller_id AND ur.role::text IN ('ADMIN', 'SUPER_ADMIN'))
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'No tiene permisos de administrador para finalizar la mesa.'
      );
    END IF;
  END IF;

  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa no encontrada.');
  END IF;

  v_refund_amount := COALESCE(v_table.entry_fee, 0.00);

  IF p_refund_players AND v_refund_amount > 0.00 THEN
    SELECT COALESCE(ARRAY_AGG(DISTINCT u_id), ARRAY[]::UUID[]) INTO v_participants
    FROM (
      SELECT user_id AS u_id FROM public.game_table_players WHERE table_id = p_table_id
      UNION
      SELECT user_id AS u_id FROM public.ledger_entries WHERE reference_id = p_table_id AND entry_type = 'TABLE_ENTRY_HOLD'::ledger_entry_type_enum
    ) all_p
    WHERE u_id IS NOT NULL;

    IF v_participants IS NOT NULL THEN
      FOREACH v_player_id IN ARRAY v_participants LOOP
        SELECT * INTO v_player_wallet FROM public.wallets WHERE user_id = v_player_id FOR UPDATE;
        IF FOUND THEN
          UPDATE public.wallets
          SET available_balance = available_balance + v_refund_amount,
              held_balance = GREATEST(0.00, held_balance - v_refund_amount),
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
            v_refund_amount,
            'VES',
            'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
            'CREDIT'::ledger_direction_enum,
            p_table_id,
            'game_tables',
            'game_table',
            v_player_wallet.available_balance + v_refund_amount,
            v_player_wallet.available_balance + v_refund_amount,
            GREATEST(0.00, v_player_wallet.held_balance - v_refund_amount),
            'admin_term_' || p_table_id::text || '_' || v_player_id::text || '_' || EXTRACT(EPOCH FROM NOW())::text,
            'Reembolso administrativo por cancelación de mesa: ' || COALESCE(p_reason, 'Cancelación'),
            NOW()
          );

          v_refunded_count := v_refunded_count + 1;
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.game_tables
  SET status = 'TERMINATED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      left_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND status != 'LEFT'::player_table_status_enum;

  UPDATE public.game_sessions
  SET status = 'CANCELLED'::session_status_enum,
      ended_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND status NOT IN ('SETTLED', 'CANCELLED', 'FINISHED');

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'refunded_count', v_refunded_count,
    'refund_amount', v_refund_amount,
    'reason', p_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_terminate_game_table(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- 10. FUNCIÓN DE CONCILIACIÓN FORENSE Y RESCATE DE SALDOS RETENIDOS HUÉRFANOS
-- Esta función audita y restituye cualquier saldo retenido que pertenezca a partidas o bingos que ya fueron cerrados o terminados.
CREATE OR REPLACE FUNCTION public.audit_and_reconcile_held_balances()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_wallet RECORD;
  v_reconciled_users INT := 0;
  v_total_released NUMERIC(14,2) := 0.00;
  v_active_holds NUMERIC(14,2) := 0.00;
  v_amount_to_release NUMERIC(14,2) := 0.00;
  v_report JSONB := '[]'::jsonb;
BEGIN
  -- Marcar mesas no finalizadas cuyo expires_at ya venció como EXPIRED
  UPDATE public.game_tables
  SET status = 'EXPIRED'::table_status_enum,
      updated_at = NOW()
  WHERE status::text IN ('OPEN', 'FULL', 'WAITING', 'STARTING', 'READY', 'SALES')
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  FOR v_wallet IN
    SELECT w.*
    FROM public.wallets w
    WHERE w.held_balance > 0.00
    FOR UPDATE
  LOOP
    -- Calcular cuánto saldo retenido corresponde a mesas REALMENTE ACTIVAS Y NO EXPIRADAS
    SELECT COALESCE(SUM(gt.entry_fee), 0.00) INTO v_active_holds
    FROM public.game_table_players gtp
    JOIN public.game_tables gt ON gt.id = gtp.table_id
    WHERE gtp.user_id = v_wallet.user_id
      AND gt.status::text IN ('OPEN', 'FULL', 'WAITING', 'STARTING', 'ACTIVE', 'READY', 'SALES', 'DRAWING')
      AND (gt.expires_at IS NULL OR gt.expires_at > NOW())
      AND gtp.status::text IN ('JOINED', 'READY', 'PLAYING');

    -- Sumar compras de bingo en mesas aún no finalizadas ni expiradas
    v_active_holds := v_active_holds + COALESCE((
      SELECT SUM(bcp.total_cost)
      FROM public.bingo_card_purchases bcp
      JOIN public.game_tables gt ON gt.id = bcp.game_table_id
      WHERE bcp.user_id = v_wallet.user_id
        AND gt.status::text NOT IN ('CLOSED', 'EXPIRED', 'CANCELLED', 'TERMINATED')
        AND (gt.expires_at IS NULL OR gt.expires_at > NOW())
    ), 0.00);

    -- Si el held_balance supera lo que realmente está en juego activo, liberar el excedente huérfano
    IF v_wallet.held_balance > v_active_holds THEN
      v_amount_to_release := v_wallet.held_balance - v_active_holds;

      UPDATE public.wallets
      SET available_balance = available_balance + v_amount_to_release,
          held_balance = v_active_holds,
          updated_at = NOW()
      WHERE id = v_wallet.id;

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
        v_wallet.id,
        v_wallet.user_id,
        v_amount_to_release,
        'VES',
        'TABLE_ENTRY_REFUND'::ledger_entry_type_enum,
        'CREDIT'::ledger_direction_enum,
        v_wallet.id,
        'wallets',
        'wallet_reconciliation',
        v_wallet.available_balance + v_amount_to_release,
        v_wallet.available_balance + v_amount_to_release,
        v_active_holds,
        'forensic_reconcile_' || v_wallet.id::text || '_' || EXTRACT(EPOCH FROM NOW())::text,
        'Conciliación forense y restitución de saldo retenido por partidas/bingo finalizados',
        NOW()
      );

      v_reconciled_users := v_reconciled_users + 1;
      v_total_released := v_total_released + v_amount_to_release;

      v_report := v_report || jsonb_build_object(
        'user_id', v_wallet.user_id,
        'released_amount', v_amount_to_release,
        'remaining_held', v_active_holds
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'reconciled_users_count', v_reconciled_users,
    'total_released_bs', v_total_released,
    'details', v_report
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_and_reconcile_held_balances() TO authenticated, service_role;

-- 11. RECARGA DE ESQUEMA EN POSTGREST
NOTIFY pgrst, 'reload schema';
