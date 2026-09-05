-- ==============================================================================
-- MIGRACIÓN 137: ASEGURAR COLUMNA GAME_VARIANT EN GAME_TABLES Y GAME_SESSIONS
-- ==============================================================================
-- Corrige el error "column game_tables_1.game_variant does not exist" y
-- asegura compatibilidad completa de consultas relacionales de variantes (75, 80, 90).
-- ==============================================================================

-- 1. Asegurar que la columna game_variant exista en game_tables
ALTER TABLE public.game_tables 
ADD COLUMN IF NOT EXISTS game_variant TEXT DEFAULT '90';

-- 2. Asegurar que la columna game_variant exista en game_sessions
ALTER TABLE public.game_sessions 
ADD COLUMN IF NOT EXISTS game_variant TEXT DEFAULT '90';

-- 3. Crear índices para optimizar filtros de variantes
CREATE INDEX IF NOT EXISTS idx_game_tables_game_variant ON public.game_tables (game_variant);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_variant ON public.game_sessions (game_variant);

-- 4. Notificar a PostgREST para recargar el esquema inmediatamente
NOTIFY pgrst, 'reload schema';
