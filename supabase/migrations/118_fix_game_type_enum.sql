-- ==============================================================================
-- MIGRACIÓN 118: ACTUALIZACIÓN SEGURA DE VALORES DEL ENUM game_type_enum
-- ==============================================================================
-- Soluciona el error: invalid input value for enum game_type_enum: "bingo"
-- y asegura que todos los tipos de juego de la plataforma estén registrados
-- en public.game_type_enum de forma idempotente y segura en PostgreSQL / Supabase.
-- ==============================================================================

DO $$ 
BEGIN
  -- Intentamos agregar cada valor. Si ya existe, PostgreSQL ignorará el error interno del bloque
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'bingo';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'atrapaito';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'chess';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'checkers';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'domino';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'truco';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'tictactoe';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'rps';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'unaolla';
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    ALTER TYPE public.game_type_enum ADD VALUE 'polla';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Recargar caché de esquema de PostgREST para exponer los nuevos valores inmediatamente
NOTIFY pgrst, 'reload schema';
