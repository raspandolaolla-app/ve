-- ================================================================
-- MIGRACIÓN 009: Sesiones de Partida y Registro de Jugadas (Game Sessions & Actions)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- 1. Tabla de Sesiones de Juego (Estado Público y Sincronizable)
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.game_tables(id) ON DELETE RESTRICT,
  game_type game_type_enum NOT NULL,
  session_number INT NOT NULL DEFAULT 1,
  status session_status_enum NOT NULL DEFAULT 'WAITING',
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_turn_user_id UUID NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  turn_deadline_at TIMESTAMPTZ NULL,
  winner_user_id UUID NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  winner_team SMALLINT NULL,
  started_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_game_sessions_session_number CHECK (session_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_table_id ON public.game_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON public.game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_game_sessions_turn_user ON public.game_sessions(current_turn_user_id);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions FORCE ROW LEVEL SECURITY;

-- 2. Tabla Segregada de Secretos de Partida (Cartas Ocultas, Semillas RNG y Nonces)
-- Esta tabla NUNCA se publica en Realtime y solo es accesible por el motor server-side
CREATE TABLE IF NOT EXISTS public.game_session_secrets (
  session_id UUID PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  secret_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  server_seed VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.game_session_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_secrets FORCE ROW LEVEL SECURITY;

-- 3. Tabla de Historial Inmutable de Jugadas (Game Actions)
CREATE TABLE IF NOT EXISTS public.game_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  sequence_number INT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  server_state_hash VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_game_actions_session_seq UNIQUE (session_id, sequence_number),
  CONSTRAINT uq_game_actions_idempotency UNIQUE (idempotency_key),
  CONSTRAINT chk_game_actions_seq CHECK (sequence_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_game_actions_session_id ON public.game_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_user_id ON public.game_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_created_at ON public.game_actions(created_at);

ALTER TABLE public.game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_actions FORCE ROW LEVEL SECURITY;

-- 4. Garantía de Inmutabilidad en Acciones de Juego
CREATE OR REPLACE FUNCTION public.enforce_game_actions_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'GAME_ACTIONS_IMMUTABLE_VIOLATION: El registro histórico de jugadas es estrictamente inmutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_game_actions_prevent_modification ON public.game_actions;
CREATE TRIGGER trg_game_actions_prevent_modification
  BEFORE UPDATE OR DELETE ON public.game_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_game_actions_immutability();
