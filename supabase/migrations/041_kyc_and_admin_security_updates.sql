-- ==============================================================================
-- MIGRACIÓN 041: MEJORAS EN KYC, RESTRICCIÓN DE RETIROS PARA ADMIN/OPERADOR Y MÉTODO WHATSAPP
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / SEGURIDAD DEFINER CON RBAC
-- ==============================================================================

-- 1. Agregar columna verification_method en kyc_verifications si no existe
ALTER TABLE public.kyc_verifications 
  ADD COLUMN IF NOT EXISTS verification_method VARCHAR(30) DEFAULT 'DOCUMENT_UPLOAD';

-- 2. Asegurar bucket kyc-selfies en storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('kyc-selfies', 'kyc-selfies', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Políticas RLS sobre storage.objects para kyc-selfies
DROP POLICY IF EXISTS p_storage_kyc_selfies_user_insert ON storage.objects;
CREATE POLICY p_storage_kyc_selfies_user_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-selfies'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS p_storage_kyc_selfies_user_select ON storage.objects;
CREATE POLICY p_storage_kyc_selfies_user_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'kyc-selfies'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_operator_or_above(auth.uid())
    )
  );

-- 3. RPC para envío de expediente KYC por parte del jugador
CREATE OR REPLACE FUNCTION public.submit_kyc_verification(
  p_id_number VARCHAR,
  p_full_legal_name VARCHAR,
  p_document_storage_path TEXT DEFAULT NULL,
  p_selfie_storage_path TEXT DEFAULT NULL,
  p_verification_method VARCHAR DEFAULT 'DOCUMENT_UPLOAD'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_rec_id UUID;
  v_role VARCHAR(50);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  -- Verificar si el usuario es Admin u Operador (su KYC es automáticamente validado)
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_role IN ('ADMIN', 'SUPER_ADMIN', 'OPERATOR') THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'APPROVED',
      'message', 'Los perfiles con rol Administrador u Operador poseen estatus KYC verificado de forma permanente por política interna.'
    );
  END IF;

  -- Upsert en kyc_verifications
  INSERT INTO public.kyc_verifications (
    user_id,
    document_type,
    id_number,
    full_legal_name,
    document_storage_path,
    selfie_storage_path,
    verification_method,
    status,
    submitted_at
  ) VALUES (
    v_user_id,
    'CEDULA_VENEZOLANA',
    p_id_number,
    p_full_legal_name,
    COALESCE(p_document_storage_path, 'WHATSAPP_PENDING'),
    p_selfie_storage_path,
    p_verification_method,
    'PENDING'::kyc_status_enum,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE -- En caso de nuevo envío tras rechazo
  SET
    id_number = EXCLUDED.id_number,
    full_legal_name = EXCLUDED.full_legal_name,
    document_storage_path = CASE 
                              WHEN EXCLUDED.document_storage_path IS NOT NULL AND EXCLUDED.document_storage_path != 'WHATSAPP_PENDING' 
                              THEN EXCLUDED.document_storage_path 
                              ELSE kyc_verifications.document_storage_path 
                            END,
    selfie_storage_path = CASE 
                            WHEN EXCLUDED.selfie_storage_path IS NOT NULL 
                            THEN EXCLUDED.selfie_storage_path 
                            ELSE kyc_verifications.selfie_storage_path 
                          END,
    verification_method = EXCLUDED.verification_method,
    status = 'PENDING'::kyc_status_enum,
    submitted_at = NOW();

  -- Actualizar perfil del jugador
  UPDATE public.profiles
  SET 
    kyc_status = 'PENDING',
    updated_at = NOW()
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'PENDING',
    'message', 'Expediente KYC enviado exitosamente para revisión.'
  );
END;
$$;

-- 4. Actualizar admin_process_kyc_verification para soportar métodos y nuevos estados
CREATE OR REPLACE FUNCTION public.admin_process_kyc_verification(
  p_verification_id UUID,
  p_status VARCHAR,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_reviewer_id UUID;
  v_rec RECORD;
  v_target_status kyc_status_enum;
  v_kyc_profile_status VARCHAR(50);
BEGIN
  v_reviewer_id := auth.uid();
  IF v_reviewer_id IS NULL OR NOT public.is_operator_or_above(v_reviewer_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Se requiere rol de Operador o Administrador';
  END IF;

  SELECT * INTO v_rec
  FROM public.kyc_verifications
  WHERE id = p_verification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KYC_NOT_FOUND: Expediente no encontrado';
  END IF;

  IF p_status IN ('APPROVED', 'VERIFIED_WHATSAPP') THEN
    v_target_status := 'APPROVED'::kyc_status_enum;
    v_kyc_profile_status := 'VERIFIED';
  ELSIF p_status = 'REJECTED' THEN
    v_target_status := 'REJECTED'::kyc_status_enum;
    v_kyc_profile_status := 'REJECTED';
  ELSE
    v_target_status := 'UNDER_REVIEW'::kyc_status_enum;
    v_kyc_profile_status := 'PENDING';
  END IF;

  UPDATE public.kyc_verifications
  SET
    status = v_target_status,
    reviewer_id = v_reviewer_id,
    reviewer_notes = COALESCE(p_notes, CASE WHEN p_status = 'VERIFIED_WHATSAPP' THEN 'Verificado por WhatsApp por el operador' ELSE reviewer_notes END),
    verification_method = CASE WHEN p_status = 'VERIFIED_WHATSAPP' THEN 'WHATSAPP' ELSE verification_method END,
    reviewed_at = NOW()
  WHERE id = p_verification_id;

  -- Si fue aprobado, actualizar perfil
  IF v_target_status = 'APPROVED' THEN
    UPDATE public.profiles
    SET 
      account_status = 'ACTIVE',
      kyc_status = 'VERIFIED',
      updated_at = NOW()
    WHERE user_id = v_rec.user_id;
  ELSIF v_target_status = 'REJECTED' THEN
    UPDATE public.profiles
    SET 
      kyc_status = 'REJECTED',
      updated_at = NOW()
    WHERE user_id = v_rec.user_id;
  END IF;

  -- Auditoría
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    severity,
    metadata
  ) VALUES (
    v_reviewer_id,
    'ADMIN',
    'ADMIN_REVIEW_KYC',
    'kyc_verifications',
    p_verification_id::text,
    'INFO',
    jsonb_build_object(
      'target_user_id', v_rec.user_id,
      'new_status', v_target_status,
      'input_status', p_status,
      'notes', p_notes
    )
  );

  -- Notificación al usuario
  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    metadata
  ) VALUES (
    v_rec.user_id,
    'Actualización de Verificación KYC',
    CASE 
      WHEN v_target_status = 'APPROVED' THEN 'Tu identidad ha sido verificada exitosamente. Ya puedes solicitar retiros.'
      WHEN v_target_status = 'REJECTED' THEN 'Tu verificación de identidad ha sido rechazada. Revisa las observaciones: ' || COALESCE(p_notes, 'Sin notas adicionales')
      ELSE 'Se ha modificado el estatus de tu expediente KYC.'
    END,
    'SYSTEM',
    jsonb_build_object('verification_id', p_verification_id, 'status', v_target_status)
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', v_target_status,
    'message', 'Expediente procesado correctamente'
  );
END;
$$;

-- 5. ACTUALIZAR RPC DE RETIRO PARA BLOQUEAR ESTRICTAMENTE A ADMIN Y OPERADOR (SEGUNDA CAPA DE SEGURIDAD SERVER-SIDE)
CREATE OR REPLACE FUNCTION public.request_withdrawal_locked(
  p_payment_account_id UUID,
  p_amount NUMERIC,
  p_idempotency_key VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_user_role VARCHAR(50);
  v_jwt_claims JSONB;
  v_aal_level TEXT;
  v_profile RECORD;
  v_wallet RECORD;
  v_account RECORD;
  v_existing_req RECORD;
  v_request_id UUID;
  v_ledger_id UUID;
BEGIN
  -- 1. Verificación de Autenticación
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Usuario no autenticado';
  END IF;

  -- 2. BLOQUEO ABSOLUTO PARA ROLES TÉCNICOS: ADMIN Y OPERADOR NO PUEDEN RETIRAR FONDOS
  SELECT role::text INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role IN ('ADMIN', 'SUPER_ADMIN', 'OPERATOR') THEN
    RAISE EXCEPTION 'OPERACION_DENEGADA: Los usuarios con rol Administrador u Operador no tienen permitido solicitar retiros de la plataforma.';
  END IF;

  -- 3. Verificación Estricta de MFA / AAL2 en JWT
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil no encontrado';
  END IF;

  IF v_profile.is_mfa_enabled THEN
    v_jwt_claims := auth.jwt();
    v_aal_level := COALESCE(v_jwt_claims->>'aal', 'aal1');
    IF v_aal_level != 'aal2' THEN
      RAISE EXCEPTION 'MFA_AAL2_REQUIRED: Se requiere autenticación de segundo factor (AAL2) para autorizar solicitudes de retiro.';
    END IF;
  END IF;

  -- 4. Verificación de Estatus KYC y Cuenta
  IF v_profile.account_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE: La cuenta no está activa para retiros';
  END IF;

  IF v_profile.kyc_status NOT IN ('APPROVED', 'VERIFIED') THEN
    RAISE EXCEPTION 'KYC_NOT_APPROVED: Se requiere verificación de identidad (KYC) aprobada para solicitar retiros.';
  END IF;

  -- 5. Verificación de Monto Mínimo
  IF p_amount < 100.00 THEN
    RAISE EXCEPTION 'MIN_WITHDRAWAL_NOT_MET: El monto mínimo de retiro es 100.00 Bs.';
  END IF;

  -- 6. Verificación de Cuenta de Pago Destino
  SELECT * INTO v_account
  FROM public.payment_accounts
  WHERE id = p_payment_account_id AND user_id = v_user_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_ACCOUNT_INVALID: Cuenta bancaria destino no válida o no pertenece al usuario';
  END IF;

  -- 7. Verificación de Idempotencia previa
  SELECT * INTO v_existing_req
  FROM public.withdrawal_requests
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'withdrawal_id', v_existing_req.id,
      'status', v_existing_req.status,
      'idempotent', true,
      'message', 'Solicitud de retiro procesada previamente (idempotente)'
    );
  END IF;

  -- 8. Bloqueo Pesimista sobre la Billetera (FOR UPDATE)
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera no encontrada para el usuario';
  END IF;

  -- 9. Validación de Saldo Disponible Suficiente
  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente para procesar el retiro';
  END IF;

  -- 10. Actualización Atómica de Saldos (Pesimista)
  UPDATE public.wallets
  SET
    available_balance = available_balance - p_amount,
    held_balance = held_balance + p_amount,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  -- 11. Inserción de la Solicitud de Retiro (Estatus PENDING)
  INSERT INTO public.withdrawal_requests (
    user_id,
    payment_account_id,
    amount,
    status,
    idempotency_key,
    created_at
  ) VALUES (
    v_user_id,
    p_payment_account_id,
    p_amount,
    'PENDING',
    p_idempotency_key,
    NOW()
  )
  RETURNING id INTO v_request_id;

  -- 12. Inserción de la Entrada de Ajuste en el Libro Mayor (LEDGER)
  INSERT INTO public.ledger_entries (
    wallet_id,
    user_id,
    entry_type,
    direction,
    amount,
    balance_after_available,
    balance_after_held,
    reference_table,
    reference_id,
    description,
    idempotency_key,
    created_at
  ) VALUES (
    v_wallet.id,
    v_user_id,
    'WITHDRAWAL_REQUEST'::ledger_entry_type_enum,
    'DEBIT'::ledger_direction_enum,
    p_amount,
    v_wallet.available_balance - p_amount,
    v_wallet.held_balance + p_amount,
    'withdrawal_requests',
    v_request_id,
    'Solicitud de retiro a Pago Móvil (Fondos retenidos pesimistamente)',
    'ledger_' || p_idempotency_key,
    NOW()
  )
  RETURNING id INTO v_ledger_id;

  -- Registrar en Auditoría
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
    'PLAYER',
    'REQUEST_WITHDRAWAL',
    'withdrawal_requests',
    v_request_id::text,
    'INFO',
    jsonb_build_object(
      'amount', p_amount,
      'payment_account_id', p_payment_account_id,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_request_id,
    'ledger_id', v_ledger_id,
    'amount', p_amount,
    'status', 'PENDING',
    'message', 'Solicitud de retiro registrada exitosamente y fondos retenidos en ledger.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_kyc_verification(VARCHAR, VARCHAR, TEXT, TEXT, VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_process_kyc_verification(UUID, VARCHAR, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_withdrawal_locked(UUID, NUMERIC, VARCHAR) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
