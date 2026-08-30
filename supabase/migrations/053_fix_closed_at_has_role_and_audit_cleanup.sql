-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 053: COLUMNAS DE MESA, OVERLOAD HAS_ROLE Y LIMPIEZA
-- ==============================================================================
-- 1. Agrega columnas faltantes `closed_at` y `updated_at` a `game_tables`
-- 2. Define overload para `public.has_role(p_role)` usando auth.uid()
-- 3. Asegura el funcionamiento correcto de las RPCs de limpieza de mesas sin eliminar registros
-- ==============================================================================

-- 1. AGREGAR COLUMNAS FALTANTES A GAME_TABLES
ALTER TABLE public.game_tables ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL;
ALTER TABLE public.game_tables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_game_tables_closed_at ON public.game_tables(closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_tables_updated_at ON public.game_tables(updated_at);

-- 2. OVERLOAD DE LA FUNCIÓN HAS_ROLE
-- Permite invocar public.has_role(p_role TEXT) sin requerir p_user_id
CREATE OR REPLACE FUNCTION public.has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = v_uid 
      AND role::text = UPPER(p_role)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_role app_role_enum)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = v_uid 
      AND role = p_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_role(TEXT) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.has_role(app_role_enum) TO authenticated, service_role, anon;

-- 3. REVISIÓN Y REFUERZO DE LA RPC ADMIN_TERMINATE_GAME_TABLE
CREATE OR REPLACE FUNCTION public.admin_terminate_game_table(
  p_table_id UUID,
  p_reason TEXT DEFAULT 'Terminada por administración',
  p_refund_players BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_table RECORD;
  v_player RECORD;
  v_refunded_count INT := 0;
  v_refund_amount NUMERIC(14,2);
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();

  -- Verificar permisos de administración
  IF v_caller_id IS NOT NULL THEN
    SELECT (
      public.is_admin(v_caller_id) OR 
      public.is_operator_or_above(v_caller_id) OR 
      public.has_role('ADMIN') OR 
      public.has_role('SUPER_ADMIN')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'No tiene permisos de administrador para finalizar la mesa.'
      );
    END IF;
  END IF;

  -- Obtener y bloquear la mesa
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Mesa no encontrada.'
    );
  END IF;

  v_refund_amount := COALESCE(v_table.entry_fee, 0.00);

  -- Reembolsar si fue solicitado y la mesa tenía costo de entrada
  IF p_refund_players AND v_refund_amount > 0 THEN
    FOR v_player IN 
      SELECT DISTINCT user_id FROM public.game_table_players 
      WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING')
    LOOP
      UPDATE public.wallets 
      SET available_balance = available_balance + v_refund_amount,
          updated_at = NOW()
      WHERE user_id = v_player.user_id;

      INSERT INTO public.ledger_entries (
        user_id,
        amount,
        type,
        reference_type,
        reference_id,
        description
      ) VALUES (
        v_player.user_id,
        v_refund_amount,
        'REFUND',
        'GAME_CANCELLED',
        p_table_id::text,
        'Reembolso administrativo por cancelación de mesa: ' || COALESCE(p_reason, 'Cancelación')
      );

      v_refunded_count := v_refunded_count + 1;
    END LOOP;
  END IF;

  -- Actualizar la mesa utilizando las columnas reales
  UPDATE public.game_tables
  SET status = 'TERMINATED'::table_status_enum,
      current_players_count = 0,
      closed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_table_id;

  -- Actualizar estado de jugadores en la mesa
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_status_enum,
      left_at = NOW()
  WHERE table_id = p_table_id AND status IN ('JOINED', 'READY', 'PLAYING');

  -- Finalizar sesiones asociadas si existen
  UPDATE public.game_sessions
  SET status = 'ABANDONED'::session_status_enum,
      ended_at = NOW(),
      updated_at = NOW()
  WHERE table_id = p_table_id AND status IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED');

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
