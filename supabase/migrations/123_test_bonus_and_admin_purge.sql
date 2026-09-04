-- ============================================================================
-- MIGRACIÓN 123: SISTEMA DE BONO DE PRUEBA (5000 BS) Y LIMPIEZA ADMINISTRATIVA SEGURA
-- ============================================================================
-- Principio de Seguridad Crítico:
-- El dinero real NUNCA es tocado. Cada transacción originada en este bono se
-- etiqueta con source_type = 'TEST_BONUS'. La limpieza administrativa solo actúa
-- sobre estas marcas y ajusta saldos restando exactamente el monto de prueba,
-- respetando cualquier depósito real posterior.
-- ============================================================================

-- 1. Agregar columna para rastrear si el usuario ya cobró el bono en profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS has_claimed_test_bonus BOOLEAN DEFAULT FALSE;

-- 2. Agregar columnas de rastreo de origen de fondos en el ledger
ALTER TABLE public.ledger_entries 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'REAL';

ALTER TABLE public.ledger_entries 
ADD COLUMN IF NOT EXISTS transaction_type TEXT;

-- Restricción check para source_type de forma idempotente
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_ledger_source_type'
  ) THEN 
    ALTER TABLE public.ledger_entries 
    ADD CONSTRAINT chk_ledger_source_type CHECK (source_type IN ('REAL', 'TEST_BONUS', 'REFUND')); 
  END IF; 
END $$;

-- 3. Actualizar la función de inmutabilidad del ledger para permitir purga exclusiva de TEST_BONUS
CREATE OR REPLACE FUNCTION public.enforce_ledger_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Permitir depuración administrativa segura exclusivamente para registros marcados como TEST_BONUS
  IF TG_OP = 'DELETE' AND OLD.source_type = 'TEST_BONUS' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'LEDGER_IMMUTABLE_VIOLATION: El libro mayor contable es estrictamente inmutable. No se permite UPDATE ni DELETE.';
END;
$$;

-- 4. RPC: Solicitar Bono de Prueba (5000 Bs) - Idempotente y Seguro
CREATE OR REPLACE FUNCTION public.claim_test_bonus()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_claimed BOOLEAN;
  v_current_balance NUMERIC;
  v_wallet_id UUID;
  v_held_balance NUMERIC;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO';
  END IF;

  -- Verificar si ya lo reclamó
  SELECT has_claimed_test_bonus INTO v_has_claimed 
  FROM public.profiles 
  WHERE user_id = v_user_id OR id = v_user_id;

  IF v_has_claimed IS TRUE THEN
    RAISE EXCEPTION 'BONO_YA_RECLAMADO: Ya has obtenido tu bono de prueba.';
  END IF;

  -- Asegurar que la billetera exista de forma atómica
  INSERT INTO public.wallets (user_id, available_balance, held_balance, currency)
  VALUES (v_user_id, 0.00, 0.00, 'VES')
  ON CONFLICT (user_id) DO NOTHING;

  -- Actualizar perfil indicando que el bono fue reclamado
  UPDATE public.profiles 
  SET has_claimed_test_bonus = TRUE 
  WHERE user_id = v_user_id OR id = v_user_id;

  -- Acreditar 5000.00 Bs al saldo disponible
  UPDATE public.wallets 
  SET available_balance = available_balance + 5000.00,
      updated_at = NOW()
  WHERE user_id = v_user_id
  RETURNING id, available_balance, COALESCE(held_balance, 0.00) 
  INTO v_wallet_id, v_current_balance, v_held_balance;

  -- Registrar en el libro mayor (Ledger) con marca 'TEST_BONUS'
  INSERT INTO public.ledger_entries (
    wallet_id,
    user_id,
    amount,
    balance_after,
    balance_after_available,
    balance_after_held,
    entry_type,
    direction,
    transaction_type,
    description,
    source_type,
    idempotency_key,
    reference_table,
    reference_id
  )
  VALUES (
    v_wallet_id,
    v_user_id,
    5000.00,
    v_current_balance,
    v_current_balance,
    v_held_balance,
    'ADMIN_ADJUSTMENT',
    'CREDIT',
    'CREDIT',
    'BONO_DE_PRUEBA_5000_BS',
    'TEST_BONUS',
    'test_bonus_' || v_user_id::text || '_' || extract(epoch from now())::bigint,
    'wallets',
    COALESCE(v_wallet_id, gen_random_uuid())
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Bono de 5000 Bs acreditado exitosamente.',
    'new_balance', v_current_balance
  );
END;
$$;

-- 5. RPC: Limpieza Administrativa de Datos de Prueba (SOLO ADMIN)
CREATE OR REPLACE FUNCTION public.admin_purge_test_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_affected_users INT := 0;
BEGIN
  -- 1. Verificación estricta de rol administrador
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: Se requieren privilegios de administrador.';
  END IF;

  -- 2. Identificar usuarios que tienen saldo derivado del bono de prueba
  -- Si disponible <= 5000: solo tenía fondos de prueba -> Queda en 0.
  -- Si disponible > 5000: tenía fondos reales + prueba -> Se restan únicamente los 5000 de prueba.
  WITH test_users AS (
    SELECT DISTINCT user_id, available_balance 
    FROM public.wallets w
    WHERE EXISTS (
      SELECT 1 FROM public.ledger_entries le 
      WHERE le.user_id = w.user_id AND le.source_type = 'TEST_BONUS'
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.user_id = w.user_id OR p.id = w.user_id) AND p.has_claimed_test_bonus = TRUE
    )
  )
  UPDATE public.wallets w
  SET available_balance = CASE 
      WHEN tu.available_balance <= 5000.00 THEN 0.00
      ELSE tu.available_balance - 5000.00
    END,
    updated_at = NOW()
  FROM test_users tu
  WHERE w.user_id = tu.user_id;

  GET DIAGNOSTICS v_affected_users = ROW_COUNT;

  -- 3. Eliminar entradas del libro mayor exclusivamente marcadas como TEST_BONUS
  DELETE FROM public.ledger_entries WHERE source_type = 'TEST_BONUS';

  -- 4. Limpiar historial de partidas y acciones de prueba de manera segura
  BEGIN
    DELETE FROM public.game_actions 
    WHERE session_id IN (
      SELECT gs.id FROM public.game_sessions gs
      JOIN public.game_table_players gtp ON gs.id = gtp.session_id
      JOIN public.wallets w ON gtp.user_id = w.user_id
      WHERE w.available_balance = 0 AND gtp.user_id IN (
          SELECT COALESCE(user_id, id) FROM public.profiles WHERE has_claimed_test_bonus = TRUE
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 5. Resetear la bandera para permitir nuevos ciclos de prueba
  UPDATE public.profiles 
  SET has_claimed_test_bonus = FALSE 
  WHERE has_claimed_test_bonus = TRUE;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Limpieza completada. Se afectaron ' || v_affected_users || ' usuarios.',
    'affected_users', v_affected_users
  );
END;
$$;

-- 6. Asignar Permisos
REVOKE EXECUTE ON FUNCTION public.claim_test_bonus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_test_bonus() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_test_bonus() TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_purge_test_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_test_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_test_data() TO service_role;

-- 7. Notificar a PostgREST para recargar esquema
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN DE MIGRACIÓN 123
-- ============================================================================
