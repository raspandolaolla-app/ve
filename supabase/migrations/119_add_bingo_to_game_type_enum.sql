-- ============================================================================
-- MIGRACIÓN 119: ADICIÓN DE 'bingo' AL ENUM game_type_enum
-- ============================================================================
-- Problema: "invalid input value for enum game_type_enum: 'bingo'"
-- Causa: El frontend consulta mesas con game_type = 'bingo', pero el enum no lo tenía registrado.
-- ============================================================================

DO $$
BEGIN
    -- Agregar 'bingo' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'bingo' 
        AND enumtypid = 'public.game_type_enum'::regtype
    ) THEN
        ALTER TYPE public.game_type_enum ADD VALUE 'bingo';
    END IF;

    -- Variantes directas en el enum si aplican
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'bingo_75' 
        AND enumtypid = 'public.game_type_enum'::regtype
    ) THEN
        ALTER TYPE public.game_type_enum ADD VALUE 'bingo_75';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'bingo_90' 
        AND enumtypid = 'public.game_type_enum'::regtype
    ) THEN
        ALTER TYPE public.game_type_enum ADD VALUE 'bingo_90';
    END IF;
END $$;

-- Forzar recarga de caché de PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN DE MIGRACIÓN 119
-- ============================================================================
