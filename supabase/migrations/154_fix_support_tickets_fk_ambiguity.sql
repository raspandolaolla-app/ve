-- ==============================================================================
-- MIGRACIÓN 154: CORRECCIÓN DE AMBIGÜEDAD EN RELACIONES FK DE SUPPORT_TICKETS
-- PROYECTO: RASPANDO LA OLLA 🇻🇪 / PulsoPLAY
-- ==============================================================================
-- Causa Raíz:
-- En migración 014 se creó 'support_tickets' con:
--   user_id UUID NOT NULL REFERENCES public.profiles(user_id)
-- Posteriormente en migración 133 se agregó:
--   ADD CONSTRAINT support_tickets_user_id_profiles_fkey
--   FOREIGN KEY (user_id) REFERENCES public.profiles(id)
-- Esta doble referencia sobre la columna 'user_id' (hacia profiles.user_id y hacia profiles.id)
-- provocaba el error de PostgREST:
-- "Could not embed because more than one relationship was found for 'support_tickets' and 'user_id'"
--
-- Solución:
-- 1. Eliminar la restricción errónea/redundante 'support_tickets_user_id_profiles_fkey'
--    que apuntaba indebidamente a profiles(id).
-- 2. Asegurar que la relación canónica y unívoca con profiles(user_id) permanezca limpia.
-- ==============================================================================

DO $$
BEGIN
  -- 1. Eliminar la restricción redundante/errónea que apunta a profiles(id)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'support_tickets_user_id_profiles_fkey'
      AND table_name = 'support_tickets'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.support_tickets
    DROP CONSTRAINT support_tickets_user_id_profiles_fkey;
  END IF;

  -- 2. Verificar y asegurar relación canónica con profiles(user_id)
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'support_tickets'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'profiles'
      AND ccu.column_name = 'user_id'
  ) THEN
    ALTER TABLE public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_canonical_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;
END $$;
