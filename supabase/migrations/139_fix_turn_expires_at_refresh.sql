-- ==============================================================================
-- MIGRACIÓN 139: REFRESCO AUTOMÁTICO DE turn_expires_at
-- ==============================================================================
-- Objetivo: Actualizar automáticamente el tiempo de expiración del turno 
-- cada vez que el estado del juego cambia y la partida sigue siendo jugable.
-- ==============================================================================

-- Asegurar columnas necesarias en game_sessions
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS turn_expires_at TIMESTAMPTZ;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS turn_deadline_at TIMESTAMPTZ;
ALTER TABLE public.game_sessions ADD COLUMN IF NOT EXISTS turn_duration_seconds INT DEFAULT 15;

CREATE OR REPLACE FUNCTION public.fn_refresh_turn_expires_at()
RETURNS TRIGGER AS $$
DECLARE
  v_duration INT;
  v_status TEXT;
BEGIN
  -- Determinar el estado actual del juego
  v_status := COALESCE(NEW.status::TEXT, 'UNKNOWN');
  
  -- Solo refrescar el tiempo si el juego está en un estado jugable
  IF UPPER(v_status) IN ('ACTIVE', 'WAITING', 'READY', 'SALES', 'DRAWING', 'PLAYING', 'ROUND_COMMIT') THEN
    -- Obtener la duración del turno del estado JSONB o usar la columna por defecto (15s)
    v_duration := COALESCE(
      NULLIF((NEW.current_state->>'turnDurationSeconds'), '')::INT, 
      NEW.turn_duration_seconds, 
      15
    );
    
    -- Actualizar turn_expires_at a AHORA + duración
    NEW.turn_expires_at := NOW() + (v_duration || ' seconds')::INTERVAL;
    NEW.turn_deadline_at := NEW.turn_expires_at;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar el trigger a la tabla game_sessions
DROP TRIGGER IF EXISTS trg_refresh_turn_expires_at ON public.game_sessions;

CREATE TRIGGER trg_refresh_turn_expires_at
  BEFORE UPDATE OF current_state, status ON public.game_sessions
  FOR EACH ROW
  WHEN (OLD.current_state IS DISTINCT FROM NEW.current_state OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_refresh_turn_expires_at();

-- Recargar esquema de PostgREST
NOTIFY pgrst, 'reload schema';
