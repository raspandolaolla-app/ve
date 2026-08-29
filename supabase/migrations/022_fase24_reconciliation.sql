-- ================================================================
-- MIGRACIÓN 022: Reconciliación Integral Schema ↔ Frontend (FASE 24)
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / COMPATIBILIDAD RETROACTIVA TOTAL (RLS + RPC + STORAGE)
-- ================================================================

-- ================================================================
-- 1. RECONCILIACIÓN DE SOLICITUDES DE RECARGA (deposit_requests)
-- ================================================================

-- Asegurar columnas para compatibilidad tanto con código de banco como con nombre
ALTER TABLE IF EXISTS public.deposit_requests 
  ADD COLUMN IF NOT EXISTS origin_bank VARCHAR(100),
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Flexibilizar campos para evitar fallos si el cliente envía solo nombre o solo código
DO $$
BEGIN
  -- Quitar NOT NULL restrictivo de destination_account_id si existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'deposit_requests' 
      AND column_name = 'destination_account_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.deposit_requests ALTER COLUMN destination_account_id DROP NOT NULL;
  END IF;

  -- Quitar NOT NULL restrictivo de origin_bank_code si existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'deposit_requests' 
      AND column_name = 'origin_bank_code'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.deposit_requests ALTER COLUMN origin_bank_code DROP NOT NULL;
  END IF;

  -- Quitar NOT NULL restrictivo de origin_phone si existe
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'deposit_requests' 
      AND column_name = 'origin_phone'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.deposit_requests ALTER COLUMN origin_phone DROP NOT NULL;
  END IF;

  -- Asegurar valor por defecto para idempotency_key
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'deposit_requests' 
      AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.deposit_requests ALTER COLUMN idempotency_key SET DEFAULT ('dep_' || gen_random_uuid()::text);
  END IF;
END $$;

-- Trigger para autocompletar origin_bank_code a partir de origin_bank si viene vacío
CREATE OR REPLACE FUNCTION public.fn_normalize_deposit_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si origin_bank_code viene nulo o vacío pero hay origin_bank
  IF (NEW.origin_bank_code IS NULL OR NEW.origin_bank_code = '') AND NEW.origin_bank IS NOT NULL THEN
    -- Extraer primeros 4 dígitos si contiene código (ej: '0102 - Banco de Venezuela')
    IF NEW.origin_bank ~ '^[0-9]{4}' THEN
      NEW.origin_bank_code := SUBSTRING(NEW.origin_bank FROM 1 FOR 4);
    ELSE
      NEW.origin_bank_code := '0102';
    END IF;
  END IF;

  -- Si origin_bank viene nulo pero hay origin_bank_code
  IF (NEW.origin_bank IS NULL OR NEW.origin_bank = '') AND NEW.origin_bank_code IS NOT NULL THEN
    NEW.origin_bank := 'Banco (' || NEW.origin_bank_code || ')';
  END IF;

  -- Garantizar clave de idempotencia
  IF NEW.idempotency_key IS NULL OR NEW.idempotency_key = '' THEN
    NEW.idempotency_key := 'dep_' || NEW.user_id::text || '_' || gen_random_uuid()::text;
  END IF;

  -- Garantizar fecha de pago
  IF NEW.payment_date IS NULL THEN
    NEW.payment_date := CURRENT_DATE;
  END IF;

  -- Garantizar teléfono de origen
  IF NEW.origin_phone IS NULL OR NEW.origin_phone = '' THEN
    SELECT COALESCE(phone_number, '0414-0000000') INTO NEW.origin_phone
    FROM public.profiles WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_deposit_request ON public.deposit_requests;
CREATE TRIGGER trg_normalize_deposit_request
  BEFORE INSERT ON public.deposit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_normalize_deposit_request();


-- ================================================================
-- 2. TABLA DE ANUNCIOS DEL SISTEMA (system_announcements)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'GENERAL', -- GENERAL, IMPORTANT, MAINTENANCE, PROMOTION, UPDATE, SECURITY
  priority INT NOT NULL DEFAULT 0,
  target_audience VARCHAR(30) NOT NULL DEFAULT 'ALL', -- ALL, PLAYERS, OPERATORS, UNVERIFIED
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.system_announcements(is_active, starts_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_announcements_priority ON public.system_announcements(priority DESC);

ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_announcements FORCE ROW LEVEL SECURITY;

-- Políticas RLS para system_announcements
DROP POLICY IF EXISTS p_announcements_read ON public.system_announcements;
CREATE POLICY p_announcements_read ON public.system_announcements
  FOR SELECT
  USING (
    is_active = true 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_announcements_admin_all ON public.system_announcements;
CREATE POLICY p_announcements_admin_all ON public.system_announcements
  FOR ALL
  USING (public.is_operator_or_above(auth.uid()))
  WITH CHECK (public.is_operator_or_above(auth.uid()));

-- Insertar anuncio de bienvenida si no hay ninguno registrado
INSERT INTO public.system_announcements (title, content, type, priority, is_active)
SELECT 
  '¡Bienvenidos a Raspando La Olla!', 
  'Plataforma oficial de juegos tradicionales venezolanos con liquidaciones instantáneas en Bolívares (VES).',
  'GENERAL', 
  10, 
  true
WHERE NOT EXISTS (SELECT 1 FROM public.system_announcements LIMIT 1);


-- ================================================================
-- 3. TABLA DE SESIONES DE ACTIVIDAD (user_activity_sessions)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, IDLE, DISCONNECTED, ENDED
  session_duration_seconds BIGINT NOT NULL DEFAULT 0,
  last_activity_type VARCHAR(50) NOT NULL DEFAULT 'PAGE_ACTIVE',
  client_platform VARCHAR(50) NOT NULL DEFAULT 'WEB',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_session_status CHECK (status IN ('ACTIVE', 'IDLE', 'DISCONNECTED', 'ENDED'))
);

CREATE INDEX IF NOT EXISTS idx_activity_user_status ON public.user_activity_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_last_seen ON public.user_activity_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_status ON public.user_activity_sessions(status);

ALTER TABLE public.user_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_sessions FORCE ROW LEVEL SECURITY;

-- Políticas RLS para user_activity_sessions
DROP POLICY IF EXISTS p_activity_user_select ON public.user_activity_sessions;
CREATE POLICY p_activity_user_select ON public.user_activity_sessions
  FOR SELECT
  USING (
    user_id = auth.uid() 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_activity_user_insert ON public.user_activity_sessions;
CREATE POLICY p_activity_user_insert ON public.user_activity_sessions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p_activity_user_update ON public.user_activity_sessions;
CREATE POLICY p_activity_user_update ON public.user_activity_sessions
  FOR UPDATE
  USING (
    user_id = auth.uid() 
    OR public.is_operator_or_above(auth.uid())
  );


-- ================================================================
-- 4. HORA OFICIAL DEL SERVIDOR (get_server_time)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_caracas_time TIMESTAMPTZ;
BEGIN
  v_caracas_time := timezone('America/Caracas', v_now);

  RETURN jsonb_build_object(
    'server_timestamp', v_now,
    'timezone', 'America/Caracas',
    'caracas_timestamp', v_caracas_time,
    'caracas_formatted', to_char(timezone('America/Caracas', v_now), 'DD/MM/YYYY hh:MI:SS AM'),
    'epoch_ms', (EXTRACT(EPOCH FROM v_now) * 1000)::BIGINT
  );
END;
$$;


-- ================================================================
-- 5. RPC DE HEARTBEAT SEGURO (record_user_heartbeat)
-- ================================================================
CREATE OR REPLACE FUNCTION public.record_user_heartbeat(
  p_activity_type VARCHAR DEFAULT 'PAGE_ACTIVE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_session_id UUID;
  v_started_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_duration BIGINT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 1. Marcar desconectadas las sesiones inactivas por más de 10 minutos
  UPDATE public.user_activity_sessions
  SET 
    status = 'DISCONNECTED',
    ended_at = last_seen_at,
    session_duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (last_seen_at - started_at))::BIGINT),
    updated_at = v_now
  WHERE user_id = v_user_id 
    AND status IN ('ACTIVE', 'IDLE')
    AND last_seen_at < (v_now - INTERVAL '10 minutes');

  -- 2. Buscar sesión activa existente
  SELECT id, started_at INTO v_session_id, v_started_at
  FROM public.user_activity_sessions
  WHERE user_id = v_user_id 
    AND status IN ('ACTIVE', 'IDLE')
    AND last_seen_at >= (v_now - INTERVAL '10 minutes')
  ORDER BY last_seen_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    -- Actualizar sesión existente
    v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_started_at))::BIGINT);
    UPDATE public.user_activity_sessions
    SET 
      last_seen_at = v_now,
      last_activity_type = COALESCE(p_activity_type, 'PAGE_ACTIVE'),
      status = 'ACTIVE',
      session_duration_seconds = v_duration,
      updated_at = v_now
    WHERE id = v_session_id;
  ELSE
    -- Iniciar nueva sesión de actividad
    v_session_id := gen_random_uuid();
    v_duration := 0;

    INSERT INTO public.user_activity_sessions (
      id,
      user_id,
      started_at,
      last_seen_at,
      status,
      session_duration_seconds,
      last_activity_type
    ) VALUES (
      v_session_id,
      v_user_id,
      v_now,
      v_now,
      'ACTIVE',
      0,
      COALESCE(p_activity_type, 'PAGE_ACTIVE')
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'status', 'ACTIVE',
    'duration_seconds', v_duration,
    'server_time', v_now
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ================================================================
-- 6. RPC DE CIERRE DE SESIÓN LIMPIO (end_user_session)
-- ================================================================
CREATE OR REPLACE FUNCTION public.end_user_session()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  UPDATE public.user_activity_sessions
  SET 
    status = 'ENDED',
    ended_at = v_now,
    session_duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - started_at))::BIGINT),
    updated_at = v_now
  WHERE user_id = v_user_id 
    AND status IN ('ACTIVE', 'IDLE');

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ================================================================
-- 7. ASIGNACIÓN EXPLÍCITA DE PERMISOS DE EJECUCIÓN
-- ================================================================
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_user_heartbeat(VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_user_session() TO anon, authenticated, service_role;

-- ================================================================
-- 8. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- ================================================================
NOTIFY pgrst, 'reload schema';
