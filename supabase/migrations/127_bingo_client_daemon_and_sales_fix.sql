-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 127: CLIENT-SIDE DAEMON Y CORRECCIÓN DE VENTAS BINGO
-- ==============================================================================
-- 1. Enums: Asegurar 'SALES', 'WAITING', 'READY', 'ACTIVE', 'DRAWING'
-- 2. Función public.force_start_bingo_draw(p_session_id UUID)
-- 3. Función public.draw_next_bingo_ball_client(p_session_id UUID)
-- 4. Permisos de ejecución y recarga de esquema PostgREST
-- ==============================================================================

-- 1. Asegurar valores en table_status_enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SALES'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'SALES';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'WAITING'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'WAITING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'READY'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'READY';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ACTIVE'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'DRAWING'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'DRAWING';
  END IF;
END $$;

-- 2. Asegurar valores en session_status_enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'WAITING'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'session_status_enum')
  ) THEN
    ALTER TYPE public.session_status_enum ADD VALUE 'WAITING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'READY'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'session_status_enum')
  ) THEN
    ALTER TYPE public.session_status_enum ADD VALUE 'READY';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'SALES'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'session_status_enum')
  ) THEN
    ALTER TYPE public.session_status_enum ADD VALUE 'SALES';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ACTIVE'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'session_status_enum')
  ) THEN
    ALTER TYPE public.session_status_enum ADD VALUE 'ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'DRAWING'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'session_status_enum')
  ) THEN
    ALTER TYPE public.session_status_enum ADD VALUE 'DRAWING';
  END IF;
END $$;

-- 3. Función para forzar inicio del sorteo de Bingo (Host o Admin)
CREATE OR REPLACE FUNCTION public.force_start_bingo_draw(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_host_id UUID;
  v_table_id UUID;
  v_status TEXT;
  v_cards_count INT := 0;
BEGIN
  -- Verificar la sesión y la mesa asociada
  SELECT gs.table_id, gt.host_user_id, gs.status::text INTO v_table_id, v_host_id, v_status
  FROM public.game_sessions gs
  JOIN public.game_tables gt ON gs.table_id = gt.id
  WHERE gs.id = p_session_id;

  IF v_table_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sesión de juego no encontrada.');
  END IF;

  -- Autorización: Host de la mesa o Administrador
  IF v_host_id IS NULL OR (v_host_id != auth.uid() AND NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solo el anfitrión de la mesa o un administrador puede iniciar el sorteo.');
  END IF;

  -- Contar cartones comprados en la sesión o mesa
  SELECT COUNT(*) INTO v_cards_count
  FROM public.bingo_card_purchases
  WHERE session_id = p_session_id OR game_table_id = v_table_id;

  IF v_cards_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'message', 'No hay cartones comprados para iniciar el sorteo.');
  END IF;

  -- Forzar transición a DRAWING si está en estado de venta/espera/cuenta regresiva
  IF UPPER(COALESCE(v_status, '')) IN ('WAITING', 'READY', 'SALES', 'OPEN', 'COUNTDOWN', 'IN_PROGRESS') THEN
    UPDATE public.game_sessions
    SET status = 'DRAWING'::session_status_enum,
        countdown_ends_at = NOW(),
        current_state = jsonb_set(COALESCE(current_state, '{}'::jsonb), '{status}', '"DRAWING"'),
        updated_at = NOW()
    WHERE id = p_session_id;

    UPDATE public.game_tables
    SET status = 'ACTIVE'::table_status_enum,
        updated_at = NOW()
    WHERE id = v_table_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Sorteo iniciado exitosamente. Las balotas comenzarán a extraerse.',
      'cards_count', v_cards_count
    );
  END IF;

  IF UPPER(COALESCE(v_status, '')) = 'DRAWING' THEN
    RETURN jsonb_build_object('success', true, 'message', 'El sorteo ya está en curso (DRAWING).');
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'message', 'El estado actual no permite iniciar el sorteo (' || COALESCE(v_status, 'DESCONOCIDO') || ').'
  );
END;
$$;

-- 4. Función para extraer la siguiente balota (Client-Side Daemon llamada por el Host)
CREATE OR REPLACE FUNCTION public.draw_next_bingo_ball_client(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_host_id UUID;
  v_table_id UUID;
  v_status TEXT;
  v_result JSONB;
BEGIN
  -- Verificar anfitrión de la mesa o admin
  SELECT gs.table_id, gt.host_user_id, gs.status::text INTO v_table_id, v_host_id, v_status
  FROM public.game_sessions gs
  JOIN public.game_tables gt ON gs.table_id = gt.id
  WHERE gs.id = p_session_id;

  IF v_table_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sesión de juego no encontrada.');
  END IF;

  IF v_host_id IS NULL OR (v_host_id != auth.uid() AND NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autorizado para extraer balotas.');
  END IF;

  IF UPPER(COALESCE(v_status, '')) != 'DRAWING' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'El sorteo no está en estado activo de extracción (Estado: ' || COALESCE(v_status, 'NULL') || ').'
    );
  END IF;

  -- Llamar de forma segura al motor server-authoritative
  BEGIN
    SELECT public.server_bingo_operation('draw_ball', p_session_id, auth.uid()) INTO v_result;
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%BINGO_COMPLETE%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'game_over', true,
        'reason', 'BINGO_COMPLETE',
        'message', 'Todas las balotas han sido extraídas exitosamente.'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'message', 'Error en extracción de balota: ' || SQLERRM
      );
    END IF;
  END;
END;
$$;

-- 5. Otorgar permisos a usuarios autenticados
GRANT EXECUTE ON FUNCTION public.force_start_bingo_draw(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.draw_next_bingo_ball_client(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
