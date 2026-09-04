-- ============================================================================
-- MIGRACIÓN 121: ADICIÓN DE 'WAITING' AL ENUM table_status_enum
-- ============================================================================
-- Problema: "invalid input value for enum table_status_enum: 'WAITING'"
-- Causa: El frontend envía 'WAITING' en consultas de mesas, pero el enum solo tenía 'WAITING_PLAYERS'.
-- Solución: Agregar 'WAITING' al enum para garantizar compatibilidad retroactiva total.
-- ============================================================================

DO $$
BEGIN
    -- Agregar 'WAITING' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'WAITING' 
        AND enumtypid = 'public.table_status_enum'::regtype
    ) THEN
        ALTER TYPE public.table_status_enum ADD VALUE 'WAITING';
    END IF;

    -- Agregar 'READY' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'READY' 
        AND enumtypid = 'public.table_status_enum'::regtype
    ) THEN
        ALTER TYPE public.table_status_enum ADD VALUE 'READY';
    END IF;

    -- Agregar 'SALES' si no existe (usado en Bingo)
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'SALES' 
        AND enumtypid = 'public.table_status_enum'::regtype
    ) THEN
        ALTER TYPE public.table_status_enum ADD VALUE 'SALES';
    END IF;

    -- Agregar 'DRAWING' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'DRAWING' 
        AND enumtypid = 'public.table_status_enum'::regtype
    ) THEN
        ALTER TYPE public.table_status_enum ADD VALUE 'DRAWING';
    END IF;
END $$;

-- Forzar recarga de caché de PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN DE MIGRACIÓN 121
-- ============================================================================
