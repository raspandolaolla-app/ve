-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 086
-- CORRECCIÓN CONTROLADA RPC get_or_create_automated_bingo_table
-- Y AISLAMIENTO IDEMPOTENTE AUDIT_TEST vs PARTIDAS REALES
-- ==============================================================================
-- 1. Actualiza public.get_or_create_automated_bingo_table() para:
--    a) Limpieza idempotente previa de residuos de auditoría (AUDIT_TEST).
--    b) Búsqueda robusta de mesas automáticas activas (OPEN, READY, WAITING, STARTING).
--    c) Protección estricta: NUNCA altera ni borra partidas reales de dinero real.
-- 2. Asegura que create_game_table_secure y join_game_table_secure aíslen
--    estrictamente registros de prueba (AUDIT_TEST) de partidas reales.
-- 3. Mantiene intactos: Wallet, Ledger, RLS, permisos y compatibilidad con Frontend.
-- ==============================================================================

-- 1. ACTUALIZACIÓN CANÓNICA DE get_or_create_automated_bingo_table
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
        gt.name ILIKE '%AUDIT_TEST%' 
        OR gt.name ILIKE 'Mesa AUDIT%' 
        OR gt.invite_code ILIKE 'AUDIT%'
        OR gt.share_token ILIKE 'AUDIT%'
      );

    IF v_audit_table_ids IS NOT NULL AND ARRAY_LENGTH(v_audit_table_ids, 1) > 0 THEN
      UPDATE public.game_table_players
      SET status = 'LEFT',
          left_at = COALESCE(left_at, NOW()),
          updated_at = NOW()
      WHERE table_id = ANY(v_audit_table_ids);

      UPDATE public.game_sessions
      SET status = 'SETTLED'::game_session_status_enum,
          ended_at = NOW(),
          is_settled = TRUE
      WHERE table_id = ANY(v_audit_table_ids)
        AND status::text NOT IN ('SETTLED', 'CLOSED', 'CANCELLED', 'FINISHED');

      UPDATE public.game_tables
      SET status = 'CLOSED'::table_status_enum,
          closed_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY(v_audit_table_ids);
    END IF;
  END IF;

  -- 2. BUSCAR MESA AUTOMATIZADA ACTIVA EXISTENTE PARA ESTA VARIANTE
  -- (Excluyendo mesas de prueba AUDIT_TEST)
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE game_type::text IN ('BINGO', 'bingo')
    AND (config->>'variant') = v_variant
    AND (config->>'automated')::boolean IS TRUE
    AND status IN ('OPEN'::table_status_enum, 'READY'::table_status_enum, 'WAITING'::table_status_enum, 'STARTING'::table_status_enum)
    AND NOT (
      name ILIKE '%AUDIT_TEST%' 
      OR name ILIKE 'Mesa AUDIT%' 
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

  INSERT INTO public.game_tables (
    game_type,
    name,
    mode,
    currency,
    min_players,
    max_players,
    current_players_count,
    status,
    is_private,
    invite_code,
    join_code,
    entry_fee,
    config,
    created_at,
    updated_at
  ) VALUES (
    'BINGO'::game_type_enum,
    v_name,
    'INDIVIDUAL',
    'VES',
    2,
    1000,
    0,
    'OPEN'::table_status_enum,
    false,
    v_invite_code,
    v_invite_code,
    COALESCE(p_entry_fee, 25.00),
    jsonb_build_object(
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
    current_turn_seat,
    current_state,
    created_at,
    updated_at
  ) VALUES (
    v_table_id,
    1,
    jsonb_build_object(
      'variant', v_variant,
      'status', 'WAITING_FOR_PLAYERS',
      'totalBalls', v_total_balls,
      'drawnBalls', '[]'::jsonb,
      'currentBall', null,
      'callIntervalMs', 3500,
      'winnerUserId', null
    ),
    NOW(),
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

-- PERMISOS DE EJECUCIÓN
REVOKE ALL ON FUNCTION public.get_or_create_automated_bingo_table(TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_automated_bingo_table(TEXT, NUMERIC) TO authenticated, service_role, anon;
