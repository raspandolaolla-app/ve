-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 049: ELIMINACIÓN COMPLETA DEL SISTEMA 2FA / TOTP
-- ==============================================================================
-- 1. Elimina la tabla de secretos 2FA
-- 2. Elimina todas las funciones RPC asociadas a 2FA/TOTP
-- 3. Actualiza la RPC request_withdrawal_locked para retirar la validación 2FA
-- 4. Elimina la columna is_mfa_enabled de public.profiles de forma segura
-- ==============================================================================

-- 1. Eliminar Funciones RPC relacionadas con 2FA / TOTP
DROP FUNCTION IF EXISTS public.generate_totp_secret();
DROP FUNCTION IF EXISTS public.generate_totp_enrollment();
DROP FUNCTION IF EXISTS public.calculate_totp(TEXT, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS public.verify_totp_code_internal(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.verify_totp_code(TEXT);
DROP FUNCTION IF EXISTS public.verify_and_enable_totp(TEXT);
DROP FUNCTION IF EXISTS public.enable_2fa(TEXT);
DROP FUNCTION IF EXISTS public.disable_totp(TEXT);
DROP FUNCTION IF EXISTS public.disable_2fa(TEXT);
DROP FUNCTION IF EXISTS public.validate_2fa_if_enabled(UUID, TEXT);
DROP FUNCTION IF EXISTS public.validate_totp_for_action(TEXT);

-- 2. Eliminar Tabla de Secretos 2FA
DROP TABLE IF EXISTS public.user_2fa_secrets CASCADE;

-- 3. Actualización de request_withdrawal_locked sin verificación 2FA
CREATE OR REPLACE FUNCTION public.request_withdrawal_locked(
  p_payment_account_id UUID,
  p_amount NUMERIC,
  p_idempotency_key VARCHAR,
  p_totp_code VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_user_role VARCHAR(50);
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

  -- 2. BLOQUEO ABSOLUTO PARA ROLES TÉCNICOS
  SELECT role::text INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
  IF v_user_role IN ('ADMIN', 'SUPER_ADMIN', 'OPERATOR') THEN
    RAISE EXCEPTION 'OPERACION_DENEGADA: Los usuarios con rol Administrador u Operador no tienen permitido solicitar retiros de la plataforma.';
  END IF;

  -- 3. Verificación de Perfil
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = v_user_id OR id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND: Perfil no encontrado';
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

  -- 7. Idempotencia: Verificar si la solicitud ya existe
  SELECT * INTO v_existing_req
  FROM public.withdrawal_requests
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'withdrawal_id', v_existing_req.id,
      'held_amount', v_existing_req.amount,
      'message', 'Solicitud de retiro procesada previamente (Idempotente).'
    );
  END IF;

  -- 8. Obtener y Bloquear Billetera del Usuario
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: Billetera del usuario no encontrada';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Saldo disponible insuficiente para este retiro.';
  END IF;

  -- 9. Retención Atómica de Fondos en Wallet
  UPDATE public.wallets
  SET 
    available_balance = available_balance - p_amount,
    held_balance = held_balance + p_amount,
    updated_at = NOW()
  WHERE user_id = v_user_id;

  -- 10. Registrar Asiento Contable (Ledger Entry - HELD)
  INSERT INTO public.ledger_entries (
    user_id,
    entry_type,
    amount,
    balance_before_available,
    balance_after_available,
    balance_before_held,
    balance_after_held,
    description,
    idempotency_key
  ) VALUES (
    v_user_id,
    'WITHDRAWAL_HOLD',
    p_amount,
    v_wallet.available_balance,
    v_wallet.available_balance - p_amount,
    v_wallet.held_balance,
    v_wallet.held_balance + p_amount,
    'Retención de fondos para solicitud de retiro Pago Móvil',
    p_idempotency_key || '_ledger'
  ) RETURNING id INTO v_ledger_id;

  -- 11. Crear Registro de Solicitud de Retiro
  INSERT INTO public.withdrawal_requests (
    user_id,
    payment_account_id,
    amount,
    status,
    idempotency_key,
    ledger_entry_id
  ) VALUES (
    v_user_id,
    p_payment_account_id,
    p_amount,
    'PENDING',
    p_idempotency_key,
    v_ledger_id
  ) RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_request_id,
    'held_amount', p_amount,
    'remaining_available', v_wallet.available_balance - p_amount,
    'message', 'Solicitud de retiro registrada y procesada en retención exitosamente.'
  );
END;
$$;

-- Permiso para la función de retiro
GRANT EXECUTE ON FUNCTION public.request_withdrawal_locked(UUID, NUMERIC, VARCHAR, VARCHAR) TO authenticated, service_role;

-- 4. Eliminar columna is_mfa_enabled de public.profiles si existe
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_mfa_enabled;
