-- ================================================================
-- MIGRACIÓN 008: Mesas de Juego y Participantes (Game Tables & Players)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- 1. Tabla de Mesas de Juego
CREATE TABLE IF NOT EXISTS public.game_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type game_type_enum NOT NULL,
  host_user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  visibility table_visibility_enum NOT NULL DEFAULT 'PUBLIC',
  invite_code VARCHAR(12) NULL,
  entry_fee NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  min_players SMALLINT NOT NULL DEFAULT 2,
  max_players SMALLINT NOT NULL,
  current_players_count SMALLINT NOT NULL DEFAULT 1,
  status table_status_enum NOT NULL DEFAULT 'OPEN',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT chk_game_tables_entry_fee CHECK (entry_fee >= 0.00),
  CONSTRAINT chk_game_tables_players_range CHECK (max_players >= min_players AND min_players >= 2),
  CONSTRAINT chk_game_tables_players_count CHECK (current_players_count >= 0 AND current_players_count <= max_players),
  CONSTRAINT uq_game_tables_invite_code UNIQUE (invite_code)
);

CREATE INDEX IF NOT EXISTS idx_game_tables_status ON public.game_tables(status);
CREATE INDEX IF NOT EXISTS idx_game_tables_game_type ON public.game_tables(game_type);
CREATE INDEX IF NOT EXISTS idx_game_tables_invite_code ON public.game_tables(invite_code);
CREATE INDEX IF NOT EXISTS idx_game_tables_host ON public.game_tables(host_user_id);

ALTER TABLE public.game_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_tables FORCE ROW LEVEL SECURITY;

-- 2. Tabla de Jugadores en Mesa (Asientos y Equipos)
CREATE TABLE IF NOT EXISTS public.game_table_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES public.game_tables(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE RESTRICT,
  seat_number SMALLINT NOT NULL,
  team_number SMALLINT NULL,
  status player_table_status_enum NOT NULL DEFAULT 'JOINED',
  entry_held_entry_id UUID NULL REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ NULL,

  CONSTRAINT uq_game_table_players_user UNIQUE (table_id, user_id),
  CONSTRAINT uq_game_table_players_seat UNIQUE (table_id, seat_number),
  CONSTRAINT chk_game_table_players_seat CHECK (seat_number >= 1)
);

CREATE INDEX IF NOT EXISTS idx_table_players_table_id ON public.game_table_players(table_id);
CREATE INDEX IF NOT EXISTS idx_table_players_user_id ON public.game_table_players(user_id);

ALTER TABLE public.game_table_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_table_players FORCE ROW LEVEL SECURITY;
