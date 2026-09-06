-- ==============================================================================
-- MIGRACIÓN 146: Sistema Profesional Centralizado de Notificaciones
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- Principio: Solo eventos reales del sistema generan notificaciones.
-- Deduplicación e idempotencia garantizada a nivel de base de datos.
-- ==============================================================================

-- 1. Ampliar columnas en public.notifications si no existen
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS source_id VARCHAR(150) NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- 2. Índice Único de Deduplicación (Garantía de Idempotencia)
-- Una misma entidad y tipo no puede generar múltiples notificaciones para el mismo usuario.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedup 
ON public.notifications (user_id, type, source_type, source_id)
WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

-- Índices de consulta de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_notifications_user_active 
ON public.notifications (user_id, is_read, created_at DESC)
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_source 
ON public.notifications (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_notifications_expires_at 
ON public.notifications (expires_at)
WHERE expires_at IS NOT NULL;

-- 3. Limpieza de datos demo, falsos o de prueba existentes
DELETE FROM public.notifications
WHERE title ILIKE '%demo%'
   OR title ILIKE '%prueba%'
   OR title ILIKE '%test%'
   OR message ILIKE '%demo%'
   OR message ILIKE '%notificación de prueba%'
   OR type ILIKE '%test%';

-- 4. Función Canónica Segura: create_user_notification
-- Permite insertar notificaciones de forma atómica e idempotente
CREATE OR REPLACE FUNCTION public.create_user_notification(
  p_user_id UUID,
  p_type VARCHAR(50),
  p_title VARCHAR(150),
  p_message TEXT,
  p_data JSONB DEFAULT '{}'::jsonb,
  p_source_type VARCHAR(50) DEFAULT NULL,
  p_source_id VARCHAR(150) DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_notif_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Si tiene origen y fuente definida, se inserta con deduplicación estricta
  IF p_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      source_type,
      source_id,
      expires_at,
      is_read,
      created_at
    ) VALUES (
      p_user_id,
      p_type,
      p_title,
      p_message,
      COALESCE(p_data, '{}'::jsonb),
      p_source_type,
      p_source_id,
      p_expires_at,
      FALSE,
      NOW()
    )
    ON CONFLICT (user_id, type, source_type, source_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      message = EXCLUDED.message,
      data = EXCLUDED.data,
      expires_at = COALESCE(EXCLUDED.expires_at, notifications.expires_at)
    RETURNING id INTO v_notif_id;
  ELSE
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      source_type,
      source_id,
      expires_at,
      is_read,
      created_at
    ) VALUES (
      p_user_id,
      p_type,
      p_title,
      p_message,
      COALESCE(p_data, '{}'::jsonb),
      p_source_type,
      p_source_id,
      p_expires_at,
      FALSE,
      NOW()
    )
    RETURNING id INTO v_notif_id;
  END IF;

  RETURN v_notif_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_notification(UUID, VARCHAR, VARCHAR, TEXT, JSONB, VARCHAR, VARCHAR, TIMESTAMPTZ) TO authenticated, service_role;

-- 5. Función de Limpieza de Notificaciones Expiradas
CREATE OR REPLACE FUNCTION public.clean_expired_notifications()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
  v_count INT := 0;
BEGIN
  -- 1. Eliminar expiradas explícitas
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + v_count;

  -- 2. Eliminar notificaciones leídas operativas con más de 60 días
  DELETE FROM public.notifications
  WHERE is_read = TRUE AND created_at < NOW() - INTERVAL '60 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + v_count;

  -- 3. Eliminar notificaciones de mantenimiento o disponibilidad con más de 14 días
  DELETE FROM public.notifications
  WHERE type IN ('GAME_ENABLED', 'GAME_DISABLED', 'MAINTENANCE_ANNOUNCEMENT')
    AND created_at < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + v_count;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clean_expired_notifications() TO authenticated, service_role;

-- 6. RPC Administrativa: Enviar Comunicado Oficial / Broadcast Real
CREATE OR REPLACE FUNCTION public.admin_send_broadcast(
  p_title VARCHAR(150),
  p_message TEXT,
  p_type VARCHAR(50) DEFAULT 'ADMIN_BROADCAST',
  p_target_user_id UUID DEFAULT NULL,
  p_expires_in_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID := auth.uid();
  v_count INT := 0;
  v_expires TIMESTAMPTZ;
  v_broadcast_id TEXT;
  v_user RECORD;
BEGIN
  IF v_operator_id IS NULL OR NOT (public.is_admin(v_operator_id) OR public.is_operator_or_above(v_operator_id)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol de administrador u operador';
  END IF;

  IF TRIM(COALESCE(p_title, '')) = '' OR TRIM(COALESCE(p_message, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: El título y mensaje son obligatorios';
  END IF;

  v_expires := CASE 
    WHEN p_expires_in_days > 0 THEN NOW() + (p_expires_in_days || ' days')::interval 
    ELSE NULL 
  END;

  v_broadcast_id := 'broadcast_' || gen_random_uuid()::text;

  IF p_target_user_id IS NOT NULL THEN
    -- Mensaje a usuario específico
    PERFORM public.create_user_notification(
      p_target_user_id,
      COALESCE(p_type, 'ADMIN_MESSAGE'),
      p_title,
      p_message,
      jsonb_build_object('sender_id', v_operator_id, 'is_direct', true),
      'admin_broadcast',
      v_broadcast_id,
      v_expires
    );
    v_count := 1;
  ELSE
    -- Broadcast a todos los usuarios activos
    FOR v_user IN 
      SELECT user_id FROM public.profiles WHERE status IS NULL OR status != 'BANNED'
    LOOP
      PERFORM public.create_user_notification(
        v_user.user_id,
        COALESCE(p_type, 'ADMIN_BROADCAST'),
        p_title,
        p_message,
        jsonb_build_object('sender_id', v_operator_id, 'is_broadcast', true),
        'admin_broadcast',
        v_broadcast_id,
        v_expires
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  -- Registrar en log de auditoría
  INSERT INTO public.admin_audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_operator_id,
    'ADMIN',
    'SEND_NOTIFICATION_BROADCAST',
    'NOTIFICATION',
    v_broadcast_id,
    'INFO',
    jsonb_build_object(
      'title', p_title,
      'target_user_id', p_target_user_id,
      'recipients_count', v_count,
      'type', p_type,
      'expires_in_days', p_expires_in_days
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'recipients_count', v_count,
    'broadcast_id', v_broadcast_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_broadcast(VARCHAR, TEXT, VARCHAR, UUID, INT) TO authenticated, service_role;

-- 7. Integración con Evento Real: Aprobación y Rechazo de Recargas
CREATE OR REPLACE FUNCTION public.admin_approve_deposit(
  p_deposit_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID := auth.uid();
  v_deposit RECORD;
  v_wallet RECORD;
  v_ledger_id UUID;
BEGIN
  IF v_operator_id IS NULL OR NOT (public.is_admin(v_operator_id) OR public.is_operator_or_above(v_operator_id)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposit_requests
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPOSIT_NOT_FOUND: Solicitud de recarga no encontrada';
  END IF;

  IF v_deposit.status != 'PENDING' AND v_deposit.status != 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'INVALID_DEPOSIT_STATUS: La recarga ya fue procesada (estado actual: %)', v_deposit.status;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_deposit.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera de usuario no encontrada';
  END IF;

  -- 1. Actualizar balance
  UPDATE public.wallets
  SET 
    available_balance = available_balance + v_deposit.amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  -- 2. Registrar en libro contable (ledger)
  v_ledger_id := gen_random_uuid();
  INSERT INTO public.ledger_entries (
    id,
    wallet_id,
    user_id,
    entry_type,
    direction,
    amount,
    balance_after_available,
    balance_after_held,
    reference_table,
    reference_id,
    idempotency_key,
    description,
    actor_id
  ) VALUES (
    v_ledger_id,
    v_wallet.id,
    v_deposit.user_id,
    'DEPOSIT_CREDIT',
    'CREDIT',
    v_deposit.amount,
    v_wallet.available_balance + v_deposit.amount,
    v_wallet.held_balance,
    'deposit_requests',
    p_deposit_id,
    'DEP_APP_' || p_deposit_id::text,
    'Acreditación por recarga aprobada ref: ' || COALESCE(v_deposit.reference_number, 'S/R'),
    v_operator_id
  );

  -- 3. Actualizar estado del depósito
  UPDATE public.deposit_requests
  SET 
    status = 'APPROVED',
    reviewed_by = v_operator_id,
    reviewed_at = NOW()
  WHERE id = p_deposit_id;

  -- 4. Notificación Real Transaccional al Usuario (Idempotente)
  PERFORM public.create_user_notification(
    v_deposit.user_id,
    'DEPOSIT_APPROVED',
    'Recarga Aprobada',
    'Tu recarga de Bs. ' || TRIM(TO_CHAR(v_deposit.amount, 'FM999,999,990.00')) || ' ha sido acreditada a tu billetera.',
    jsonb_build_object(
      'deposit_id', p_deposit_id,
      'amount', v_deposit.amount,
      'reference_number', v_deposit.reference_number
    ),
    'deposit_requests',
    p_deposit_id::text,
    NOW() + INTERVAL '30 days'
  );

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', p_deposit_id,
    'amount', v_deposit.amount,
    'new_balance', v_wallet.available_balance + v_deposit.amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_deposit(UUID) TO authenticated, service_role;

-- Rechazo de Recarga Transaccional
CREATE OR REPLACE FUNCTION public.admin_reject_deposit(
  p_deposit_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID := auth.uid();
  v_deposit RECORD;
BEGIN
  IF v_operator_id IS NULL OR NOT (public.is_admin(v_operator_id) OR public.is_operator_or_above(v_operator_id)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT * INTO v_deposit
  FROM public.deposit_requests
  WHERE id = p_deposit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPOSIT_NOT_FOUND: Solicitud de recarga no encontrada';
  END IF;

  IF v_deposit.status != 'PENDING' AND v_deposit.status != 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'INVALID_DEPOSIT_STATUS: La recarga ya fue procesada (estado actual: %)', v_deposit.status;
  END IF;

  UPDATE public.deposit_requests
  SET 
    status = 'REJECTED',
    rejection_reason = p_reason,
    reviewed_by = v_operator_id,
    reviewed_at = NOW()
  WHERE id = p_deposit_id;

  -- Notificación Real de Rechazo (Idempotente)
  PERFORM public.create_user_notification(
    v_deposit.user_id,
    'DEPOSIT_REJECTED',
    'Recarga No Procesada',
    'Tu recarga de Bs. ' || TRIM(TO_CHAR(v_deposit.amount, 'FM999,999,990.00')) || ' no pudo ser aprobada. Motivo: ' || COALESCE(p_reason, 'Comprobante no válido o pago no recibido.'),
    jsonb_build_object(
      'deposit_id', p_deposit_id,
      'amount', v_deposit.amount,
      'reason', p_reason
    ),
    'deposit_requests',
    p_deposit_id::text,
    NOW() + INTERVAL '30 days'
  );

  RETURN jsonb_build_object(
    'success', true,
    'deposit_id', p_deposit_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reject_deposit(UUID, TEXT) TO authenticated, service_role;

-- 8. Integración con Evento Real: Rechazo de Retiro
CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(
  p_withdrawal_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_operator_id UUID := auth.uid();
  v_withdrawal RECORD;
  v_wallet RECORD;
BEGIN
  IF v_operator_id IS NULL OR NOT (public.is_admin(v_operator_id) OR public.is_operator_or_above(v_operator_id)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol OPERATOR o superior';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WITHDRAWAL_NOT_FOUND: Solicitud de retiro no encontrada';
  END IF;

  IF v_withdrawal.status != 'PENDING' AND v_withdrawal.status != 'PROCESSING' THEN
    RAISE EXCEPTION 'INVALID_WITHDRAWAL_STATUS: La solicitud ya fue procesada';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  -- Reintegrar saldo retenido a disponible
  UPDATE public.wallets
  SET 
    available_balance = available_balance + v_withdrawal.amount,
    held_balance = held_balance - v_withdrawal.amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  -- Actualizar estado del retiro
  UPDATE public.withdrawal_requests
  SET 
    status = 'REJECTED',
    rejection_reason = p_reason,
    processed_by = v_operator_id,
    updated_at = NOW()
  WHERE id = p_withdrawal_id;

  -- Notificación Real de Retiro Rechazado (Idempotente)
  PERFORM public.create_user_notification(
    v_withdrawal.user_id,
    'WITHDRAWAL_REJECTED',
    'Retiro No Aprobado',
    'Tu solicitud de retiro de Bs. ' || TRIM(TO_CHAR(v_withdrawal.amount, 'FM999,999,990.00')) || ' fue rechazada y tus fondos reintegrados. Motivo: ' || COALESCE(p_reason, 'Datos de cuenta erróneos.'),
    jsonb_build_object(
      'withdrawal_id', p_withdrawal_id,
      'amount', v_withdrawal.amount,
      'reason', p_reason
    ),
    'withdrawal_requests',
    p_withdrawal_id::text,
    NOW() + INTERVAL '30 days'
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'amount_reintegrated', v_withdrawal.amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal(UUID, TEXT) TO authenticated, service_role;

-- 9. Integración con Evento Real: Chat y Soporte
-- Actualizar send_chat_message para notificar al usuario cuando el operador responde
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_ticket_id UUID,
  p_message TEXT,
  p_image_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sender_id UUID := auth.uid();
  v_sender_role TEXT;
  v_ticket RECORD;
  v_msg_id UUID := gen_random_uuid();
BEGIN
  IF v_sender_id IS NULL THEN RAISE EXCEPTION 'NO_AUTENTICADO'; END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TICKET_NO_ENCONTRADO'; END IF;

  -- Determinar rol del remitente
  IF public.is_admin(v_sender_id) OR public.is_operator_or_above(v_sender_id) THEN
    v_sender_role := CASE WHEN public.is_admin(v_sender_id) THEN 'ADMIN' ELSE 'OPERATOR' END;
    
    -- Actualizar estado a IN_PROGRESS si estaba WAITING
    IF v_ticket.first_response_at IS NULL AND v_ticket.status = 'WAITING' THEN
      UPDATE public.support_tickets 
      SET status = 'IN_PROGRESS', first_response_at = NOW()
      WHERE id = p_ticket_id;
    END IF;

    -- Notificar al usuario que recibió una respuesta del soporte (Idempotente por mensaje)
    PERFORM public.create_user_notification(
      v_ticket.user_id,
      'SUPPORT_MESSAGE',
      'Respuesta de Soporte',
      'Un operador ha respondido a tu ticket #' || COALESCE(v_ticket.ticket_number, 'S/N'),
      jsonb_build_object('ticket_id', p_ticket_id, 'ticket_number', v_ticket.ticket_number),
      'support_tickets',
      p_ticket_id::text || '_' || v_msg_id::text,
      NOW() + INTERVAL '14 days'
    );
  ELSE
    v_sender_role := 'USER';
  END IF;

  INSERT INTO public.chat_messages (id, ticket_id, sender_id, sender_role, message, image_url)
  VALUES (v_msg_id, p_ticket_id, v_sender_id, v_sender_role, p_message, p_image_url);

  RETURN jsonb_build_object('success', true, 'message', 'Mensaje enviado', 'message_id', v_msg_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_chat_message(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 10. Actualizar Políticas RLS de public.notifications
DROP POLICY IF EXISTS p_notifications_select ON public.notifications;
CREATE POLICY p_notifications_select ON public.notifications
  FOR SELECT
  USING (
    user_id = auth.uid() 
    OR public.is_admin(auth.uid()) 
    OR public.is_operator_or_above(auth.uid())
  );

DROP POLICY IF EXISTS p_notifications_update ON public.notifications;
CREATE POLICY p_notifications_update ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p_notifications_delete ON public.notifications;
CREATE POLICY p_notifications_delete ON public.notifications
  FOR DELETE
  USING (user_id = auth.uid());

-- 11. Garantizar publicación en Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
