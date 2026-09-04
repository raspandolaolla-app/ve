-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 128: CORRECCIÓN DE ESTADO DE SESIÓN BINGO Y VENTAS
-- ==============================================================================
-- 1. Asegurar valores 'SALES' y 'DRAWING' en session_status_enum y table_status_enum
-- 2. Corregir sesión atrapada en 'in_progress' a 'SALES'
-- 3. Corregir mesa a 'WAITING' para habilitar compras
-- 4. Reconciliar sesiones de bingo en curso sin balotas a 'SALES'
-- 5. Recarga de esquema PostgREST
-- ==============================================================================

-- 1. Asegurar que los estados correctos existan en el enum de sesiones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'SALES' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'session_status_enum')
  ) THEN
    ALTER TYPE public.session_status_enum ADD VALUE 'SALES';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'DRAWING' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'session_status_enum')
  ) THEN
    ALTER TYPE public.session_status_enum ADD VALUE 'DRAWING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'SALES' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'SALES';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'DRAWING' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'table_status_enum')
  ) THEN
    ALTER TYPE public.table_status_enum ADD VALUE 'DRAWING';
  END IF;
END $$;

-- 2. Corregir el estado de la sesión específica que está atrapada en "in_progress"
UPDATE public.game_sessions 
SET status = 'SALES'::session_status_enum,
    updated_at = NOW()
WHERE id = '148981d9-e84b-431a-962d-343dc96b5cf8' AND game_type = 'bingo';

-- 3. Asegurar que la mesa específica también esté en un estado que permita ventas
UPDATE public.game_tables 
SET status = 'WAITING'::table_status_enum,
    updated_at = NOW()
WHERE id = '1ef9b2e9-73ac-4baa-9c0e-2d622f45182f';

-- 4. Sanar automáticamente cualquier sesión de bingo activa que no haya extraído balotas
UPDATE public.game_sessions
SET status = 'SALES'::session_status_enum,
    updated_at = NOW()
WHERE game_type = 'bingo' 
  AND status IN ('in_progress'::session_status_enum, 'ACTIVE'::session_status_enum, 'WAITING'::session_status_enum)
  AND (
    current_state IS NULL 
    OR current_state->'drawnBalls' IS NULL 
    OR jsonb_array_length(CASE WHEN jsonb_typeof(current_state->'drawnBalls') = 'array' THEN current_state->'drawnBalls' ELSE '[]'::jsonb END) = 0
  );

-- 5. Asegurar que las mesas de bingo correspondientes estén en WAITING
UPDATE public.game_tables
SET status = 'WAITING'::table_status_enum,
    updated_at = NOW()
WHERE game_type = 'bingo'
  AND id IN (
    SELECT table_id FROM public.game_sessions 
    WHERE game_type = 'bingo' AND status = 'SALES'::session_status_enum
  );

NOTIFY pgrst, 'reload schema';
