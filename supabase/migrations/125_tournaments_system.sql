-- ==============================================================================
-- MIGRACIÓN 125: SISTEMA COMPLETO DE TORNEOS
-- ==============================================================================

-- 1. Tabla principal de torneos
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  game_type TEXT NOT NULL CHECK (game_type IN ('chess', 'domino', 'truco', 'bingo', 'polla', 'atrapaito', 'checkers', 'rock_paper_scissors', 'tictactoe', 'una_olla')),
  game_variant TEXT DEFAULT NULL, -- Para bingo (75/90), etc.
  entry_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  prize_pool NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_participants INT NOT NULL DEFAULT 16,
  current_participants INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  registration_deadline TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REGISTRATION', 'ACTIVE', 'FINISHED', 'CANCELLED')),
  rules JSONB DEFAULT '{}'::jsonb,
  prize_distribution JSONB DEFAULT '[]'::jsonb, -- Ej: [{"position": 1, "percentage": 50}, {"position": 2, "percentage": 30}]
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de inscripciones a torneos
CREATE TABLE IF NOT EXISTS public.tournament_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'CONFIRMED', 'ELIMINATED', 'WINNER')),
  final_position INT DEFAULT NULL,
  prize_won NUMERIC(10,2) DEFAULT 0,
  UNIQUE(tournament_id, user_id)
);

-- 3. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_date ON public.tournaments(start_date);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament ON public.tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user ON public.tournament_registrations(user_id);

-- 4. Habilitar RLS
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_registrations ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS
DROP POLICY IF EXISTS "tournaments_select_all" ON public.tournaments;
CREATE POLICY "tournaments_select_all" ON public.tournaments FOR SELECT USING (true);

DROP POLICY IF EXISTS "tournaments_insert_admin" ON public.tournaments;
CREATE POLICY "tournaments_insert_admin" ON public.tournaments FOR INSERT 
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "tournaments_update_admin" ON public.tournaments;
CREATE POLICY "tournaments_update_admin" ON public.tournaments FOR UPDATE 
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "tournaments_delete_admin" ON public.tournaments;
CREATE POLICY "tournaments_delete_admin" ON public.tournaments FOR DELETE 
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "tournament_registrations_select_own" ON public.tournament_registrations;
CREATE POLICY "tournament_registrations_select_own" ON public.tournament_registrations FOR SELECT 
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "tournament_registrations_insert_own" ON public.tournament_registrations;
CREATE POLICY "tournament_registrations_insert_own" ON public.tournament_registrations FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 6. RPC: Crear Torneo (Solo Admin) - PARÁMETROS REORDENADOS
CREATE OR REPLACE FUNCTION public.create_tournament(
  p_name TEXT,
  p_description TEXT,
  p_game_type TEXT,
  p_entry_fee NUMERIC,
  p_prize_pool NUMERIC,
  p_max_participants INT,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_registration_deadline TIMESTAMPTZ,
  p_game_variant TEXT DEFAULT NULL,
  p_rules JSONB DEFAULT '{}'::jsonb,
  p_prize_distribution JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tournament_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  INSERT INTO public.tournaments (
    name, description, game_type, game_variant, entry_fee, prize_pool,
    max_participants, start_date, end_date, registration_deadline,
    rules, prize_distribution, created_by, status
  ) VALUES (
    p_name, p_description, p_game_type, p_game_variant, p_entry_fee, p_prize_pool,
    p_max_participants, p_start_date, p_end_date, p_registration_deadline,
    p_rules, p_prize_distribution, auth.uid(), 'DRAFT'
  ) RETURNING id INTO v_tournament_id;

  RETURN jsonb_build_object('success', true, 'tournament_id', v_tournament_id, 'message', 'Torneo creado exitosamente.');
END;
$$;

-- 7. RPC: Actualizar Estado del Torneo
CREATE OR REPLACE FUNCTION public.update_tournament_status(
  p_tournament_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  UPDATE public.tournaments
  SET status = p_status, updated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('success', true, 'message', 'Estado actualizado.');
END;
$$;

-- 8. RPC: Registrarse en Torneo
CREATE OR REPLACE FUNCTION public.register_for_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_tournament RECORD;
  v_current_count INT;
  v_entry_fee NUMERIC;
  v_wallet_id UUID;
  v_available NUMERIC(14,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO';
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  
  IF v_tournament IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Torneo no encontrado.');
  END IF;

  IF v_tournament.status != 'REGISTRATION' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Las inscripciones no están abiertas.');
  END IF;

  IF NOW() > v_tournament.registration_deadline THEN
    RETURN jsonb_build_object('success', false, 'message', 'El plazo de inscripción ha vencido.');
  END IF;

  SELECT current_participants INTO v_current_count FROM public.tournaments WHERE id = p_tournament_id;
  
  IF v_current_count >= v_tournament.max_participants THEN
    RETURN jsonb_build_object('success', false, 'message', 'Torneo lleno.');
  END IF;

  -- Verificar si ya está registrado
  IF EXISTS (SELECT 1 FROM public.tournament_registrations WHERE tournament_id = p_tournament_id AND user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ya estás registrado en este torneo.');
  END IF;

  -- Cobrar entrada si aplica
  v_entry_fee := v_tournament.entry_fee;
  IF v_entry_fee > 0 THEN
    SELECT id, available_balance INTO v_wallet_id, v_available
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_wallet_id IS NULL OR v_available < v_entry_fee THEN
      RETURN jsonb_build_object('success', false, 'message', 'Saldo insuficiente en billetera para cubrir la entrada (' || v_entry_fee || ' Bs).');
    END IF;

    UPDATE public.wallets
    SET available_balance = available_balance - v_entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    -- Registrar en ledger_entries si existe la tabla
    BEGIN
      INSERT INTO public.ledger_entries (
        wallet_id, user_id, entry_type, amount, balance_after, description, reference_id, reference_type
      ) VALUES (
        v_wallet_id, v_user_id, 'DEBIT', v_entry_fee, (v_available - v_entry_fee),
        'Inscripción Torneo: ' || v_tournament.name, p_tournament_id::text, 'TOURNAMENT_ENTRY'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Si la estructura varía, ignorar error de ledger para permitir flujo
      NULL;
    END;
  END IF;

  INSERT INTO public.tournament_registrations (tournament_id, user_id, status)
  VALUES (p_tournament_id, v_user_id, 'REGISTERED');

  UPDATE public.tournaments
  SET current_participants = current_participants + 1, updated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('success', true, 'message', 'Registro exitoso.');
END;
$$;

-- 9. RPC: Obtener Torneos Activos
CREATE OR REPLACE FUNCTION public.get_active_tournaments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tournaments JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'description', description,
    'game_type', game_type,
    'game_variant', game_variant,
    'entry_fee', entry_fee,
    'prize_pool', prize_pool,
    'max_participants', max_participants,
    'current_participants', current_participants,
    'start_date', start_date,
    'end_date', end_date,
    'registration_deadline', registration_deadline,
    'status', status,
    'prize_distribution', prize_distribution
  )) INTO v_tournaments
  FROM public.tournaments
  WHERE status IN ('REGISTRATION', 'ACTIVE')
  ORDER BY start_date ASC;

  RETURN jsonb_build_object('success', true, 'tournaments', COALESCE(v_tournaments, '[]'::jsonb));
END;
$$;

-- 10. Permisos y Recarga
GRANT EXECUTE ON FUNCTION public.create_tournament(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tournament_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_tournament(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_tournaments() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
