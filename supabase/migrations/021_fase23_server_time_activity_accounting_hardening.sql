-- ================================================================
-- MIGRACIÓN 021: Supabase Central, Hora Oficial Caracas, Actividad,
-- Contabilidad, Storage Privado y Mantenimiento Seguro (FASE 23)
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / HARDENING ESTRICTO (RLS + RBAC + RPC + AUDIT)
-- ================================================================

-- ================================================================
-- 1. HORA OFICIAL DEL SISTEMA — AMERICA/CARACAS
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
  v_caracas_str TEXT;
BEGIN
  -- Convertir hora del servidor al huso horario oficial de Venezuela (UTC-4)
  v_caracas_time := timezone('America/Caracas', v_now);
  v_caracas_str := to_char(timezone('America/Caracas', v_now), 'YYYY-MM-DD"T"HH24:MI:SS.MSOF');

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
-- 2. TABLA DE SESIONES Y ACTIVIDAD DE USUARIOS (user_activity_sessions)
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
-- 3. RPC DE HEARTBEAT SEGURO (record_user_heartbeat)
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
  v_now TIMESTAMPTZ := NOW();
  v_duration BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- 1. Reconciliar sesiones inactivas previas de más de 10 minutos
  UPDATE public.user_activity_sessions
  SET 
    status = 'DISCONNECTED',
    ended_at = last_seen_at,
    session_duration_seconds = EXTRACT(EPOCH FROM (last_seen_at - started_at))::BIGINT,
    updated_at = v_now
  WHERE user_id = v_user_id 
    AND status IN ('ACTIVE', 'IDLE')
    AND last_seen_at < (v_now - INTERVAL '10 minutes');

  -- 2. Buscar sesión activa existente dentro de los últimos 10 minutos
  SELECT id, started_at INTO v_session_id, v_now
  FROM public.user_activity_sessions
  WHERE user_id = v_user_id 
    AND status IN ('ACTIVE', 'IDLE')
    AND last_seen_at >= (v_now - INTERVAL '10 minutes')
  ORDER BY last_seen_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    -- Actualizar sesión existente
    UPDATE public.user_activity_sessions
    SET 
      last_seen_at = v_now,
      last_activity_type = COALESCE(p_activity_type, 'PAGE_ACTIVE'),
      status = 'ACTIVE',
      session_duration_seconds = EXTRACT(EPOCH FROM (v_now - started_at))::BIGINT,
      updated_at = v_now
    WHERE id = v_session_id
    RETURNING session_duration_seconds INTO v_duration;
  ELSE
    -- Crear nueva sesión activa
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
END;
$$;


-- ================================================================
-- 4. RPC DE CIERRE DE SESIÓN SEGURO (end_user_session)
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
    session_duration_seconds = EXTRACT(EPOCH FROM (v_now - started_at))::BIGINT,
    updated_at = v_now
  WHERE user_id = v_user_id AND status IN ('ACTIVE', 'IDLE', 'DISCONNECTED');

  -- Registrar evento de auditoría de logout
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_user_id,
    'USER',
    'USER_LOGOUT',
    'user_activity_sessions',
    v_user_id::text,
    'INFO',
    jsonb_build_object('timestamp', v_now, 'reason', 'USER_INITIATED_LOGOUT')
  );

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ================================================================
-- 5. RPC DE RECONCILIACIÓN SERVER-SIDE DE SESIONES INACTIVAS
-- ================================================================
CREATE OR REPLACE FUNCTION public.reconcile_idle_sessions(p_idle_minutes INT DEFAULT 5)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INT;
  v_cutoff TIMESTAMPTZ := NOW() - (p_idle_minutes || ' minutes')::INTERVAL;
BEGIN
  UPDATE public.user_activity_sessions
  SET 
    status = 'DISCONNECTED',
    ended_at = last_seen_at,
    session_duration_seconds = EXTRACT(EPOCH FROM (last_seen_at - started_at))::BIGINT,
    updated_at = NOW()
  WHERE status IN ('ACTIVE', 'IDLE')
    AND last_seen_at < v_cutoff;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'reconciled_sessions_count', v_updated_count,
    'cutoff_time', v_cutoff
  );
END;
$$;


-- ================================================================
-- 6. RPC DE CONTABILIDAD CENTRALIZADA Y RESUMEN FINANCIERO (get_accounting_overview)
-- ================================================================
CREATE OR REPLACE FUNCTION public.get_accounting_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_total_available NUMERIC(14,2) := 0.00;
  v_total_held NUMERIC(14,2) := 0.00;
  v_wallets_count INT := 0;
  
  v_approved_deposits_sum NUMERIC(14,2) := 0.00;
  v_approved_deposits_count INT := 0;
  v_pending_deposits_sum NUMERIC(14,2) := 0.00;
  v_pending_deposits_count INT := 0;

  v_completed_withdrawals_sum NUMERIC(14,2) := 0.00;
  v_completed_withdrawals_count INT := 0;
  v_pending_withdrawals_sum NUMERIC(14,2) := 0.00;
  v_pending_withdrawals_count INT := 0;

  v_total_prizes_awarded NUMERIC(14,2) := 0.00;
  v_total_rake_collected NUMERIC(14,2) := 0.00;
  v_settled_matches_count INT := 0;
BEGIN
  v_actor_id := auth.uid();
  IF NOT public.is_operator_or_above(v_actor_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol de Operador o Administrador';
  END IF;

  -- 1. Saldos totales en Billeteras
  SELECT 
    COALESCE(SUM(available_balance), 0.00),
    COALESCE(SUM(held_balance), 0.00),
    COUNT(*)
  INTO v_total_available, v_total_held, v_wallets_count
  FROM public.wallets;

  -- 2. Recargas (Depósitos)
  SELECT 
    COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END), 0.00),
    COUNT(CASE WHEN status = 'APPROVED' THEN 1 END),
    COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0.00),
    COUNT(CASE WHEN status = 'PENDING' THEN 1 END)
  INTO v_approved_deposits_sum, v_approved_deposits_count, v_pending_deposits_sum, v_pending_deposits_count
  FROM public.deposit_requests;

  -- 3. Retiros
  SELECT 
    COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0.00),
    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END),
    COALESCE(SUM(CASE WHEN status IN ('PENDING', 'IN_REVIEW') THEN amount ELSE 0 END), 0.00),
    COUNT(CASE WHEN status IN ('PENDING', 'IN_REVIEW') THEN 1 END)
  INTO v_completed_withdrawals_sum, v_completed_withdrawals_count, v_pending_withdrawals_sum, v_pending_withdrawals_count
  FROM public.withdrawal_requests;

  -- 4. Premios y Comisiones de Liquidación (90% Ganador / 10% Plataforma)
  SELECT 
    COALESCE(SUM(winner_payout_amount), 0.00),
    COALESCE(SUM(platform_fee_amount), 0.00),
    COUNT(*)
  INTO v_total_prizes_awarded, v_total_rake_collected, v_settled_matches_count
  FROM public.game_settlements
  WHERE status = 'SETTLED';

  RETURN jsonb_build_object(
    'total_available_balance', v_total_available,
    'total_held_balance', v_total_held,
    'total_wallet_funds', v_total_available + v_total_held,
    'wallets_count', v_wallets_count,
    'approved_deposits_sum', v_approved_deposits_sum,
    'approved_deposits_count', v_approved_deposits_count,
    'pending_deposits_sum', v_pending_deposits_sum,
    'pending_deposits_count', v_pending_deposits_count,
    'completed_withdrawals_sum', v_completed_withdrawals_sum,
    'completed_withdrawals_count', v_completed_withdrawals_count,
    'pending_withdrawals_sum', v_pending_withdrawals_sum,
    'pending_withdrawals_count', v_pending_withdrawals_count,
    'total_prizes_awarded', v_total_prizes_awarded,
    'total_rake_collected', v_total_rake_collected,
    'settled_matches_count', v_settled_matches_count,
    'net_operating_margin', v_total_rake_collected,
    'calculated_at', NOW()
  );
END;
$$;


-- ================================================================
-- 7. RPC DE MANTENIMIENTO Y LIMPIEZA SEGURA (Dry-Run & Execute)
-- ================================================================
CREATE OR REPLACE FUNCTION public.admin_cleanup_dry_run()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_expired_sessions INT := 0;
  v_old_audit_logs INT := 0;
  v_old_notifications INT := 0;
BEGIN
  v_actor_id := auth.uid();
  IF NOT public.is_admin(v_actor_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol de Administrador o Super Administrador';
  END IF;

  -- 1. Contar sesiones finalizadas/desconectadas con más de 30 días
  SELECT COUNT(*) INTO v_expired_sessions
  FROM public.user_activity_sessions
  WHERE status IN ('DISCONNECTED', 'ENDED')
    AND updated_at < (NOW() - INTERVAL '30 days');

  -- 2. Contar notificaciones leídas con más de 60 días
  SELECT COUNT(*) INTO v_old_notifications
  FROM public.notifications
  WHERE is_read = true
    AND created_at < (NOW() - INTERVAL '60 days');

  -- 3. Contar logs técnicos temporales no críticos con más de 90 días
  SELECT COUNT(*) INTO v_old_audit_logs
  FROM public.audit_logs
  WHERE severity = 'INFO'
    AND action IN ('USER_HEARTBEAT', 'USER_LOGOUT')
    AND created_at < (NOW() - INTERVAL '90 days');

  RETURN jsonb_build_object(
    'expired_sessions_count', v_expired_sessions,
    'old_notifications_count', v_old_notifications,
    'old_audit_logs_count', v_old_audit_logs,
    'total_eligible_records', v_expired_sessions + v_old_notifications + v_old_audit_logs,
    'evaluated_at', NOW(),
    'can_proceed', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cleanup_execute(p_confirm BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id UUID;
  v_deleted_sessions INT := 0;
  v_deleted_notifications INT := 0;
  v_deleted_audit_logs INT := 0;
BEGIN
  v_actor_id := auth.uid();
  IF NOT public.is_admin(v_actor_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol de Administrador o Super Administrador';
  END IF;

  IF p_confirm IS NOT TRUE THEN
    RAISE EXCEPTION 'CONFIRMATION_REQUIRED: Debes enviar confirmación explícita (p_confirm = true)';
  END IF;

  -- 1. Limpieza de sesiones expiradas
  DELETE FROM public.user_activity_sessions
  WHERE status IN ('DISCONNECTED', 'ENDED')
    AND updated_at < (NOW() - INTERVAL '30 days');
  GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;

  -- 2. Limpieza de notificaciones leídas antiguas
  DELETE FROM public.notifications
  WHERE is_read = true
    AND created_at < (NOW() - INTERVAL '60 days');
  GET DIAGNOSTICS v_deleted_notifications = ROW_COUNT;

  -- 3. Limpieza de logs técnicos no críticos
  DELETE FROM public.audit_logs
  WHERE severity = 'INFO'
    AND action IN ('USER_HEARTBEAT', 'USER_LOGOUT')
    AND created_at < (NOW() - INTERVAL '90 days');
  GET DIAGNOSTICS v_deleted_audit_logs = ROW_COUNT;

  -- 4. Registrar auditoría de la operación de mantenimiento
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_actor_id,
    'ADMIN',
    'MAINTENANCE_CLEANUP_EXECUTED',
    'system_maintenance',
    'cleanup_routine',
    'WARNING',
    jsonb_build_object(
      'deleted_sessions', v_deleted_sessions,
      'deleted_notifications', v_deleted_notifications,
      'deleted_audit_logs', v_deleted_audit_logs,
      'executed_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_sessions', v_deleted_sessions,
    'deleted_notifications', v_deleted_notifications,
    'deleted_audit_logs', v_deleted_audit_logs,
    'total_cleaned', v_deleted_sessions + v_deleted_notifications + v_deleted_audit_logs
  );
END;
$$;


-- ================================================================
-- 8. CONFIGURACIÓN Y POLÍTICAS DE SUPABASE STORAGE (kyc-documents y payment-proofs)
-- ================================================================

-- Crear buckets privados de Supabase Storage de manera segura
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('kyc-documents', 'kyc-documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('payment-proofs', 'payment-proofs', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Políticas RLS sobre storage.objects para kyc-documents
DROP POLICY IF EXISTS p_storage_kyc_user_insert ON storage.objects;
CREATE POLICY p_storage_kyc_user_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS p_storage_kyc_user_select ON storage.objects;
CREATE POLICY p_storage_kyc_user_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_operator_or_above(auth.uid())
    )
  );

-- Políticas RLS sobre storage.objects para payment-proofs
DROP POLICY IF EXISTS p_storage_proofs_user_insert ON storage.objects;
CREATE POLICY p_storage_proofs_user_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS p_storage_proofs_user_select ON storage.objects;
CREATE POLICY p_storage_proofs_user_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_operator_or_above(auth.uid())
    )
  );
