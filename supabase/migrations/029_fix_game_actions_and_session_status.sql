-- ==============================================================================
-- MIGRACIÓN 029: CORRECCIÓN DE SECUENCIA ATÓMICA EN GAME_ACTIONS Y ACCIONES DE JUEGO
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / EJECUTAR EN SUPABASE SQL EDITOR DIRECTAMENTE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.submit_game_action_secure(
  p_session_id UUID,
  p_action_type VARCHAR(50),
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key VARCHAR(100) DEFAULT NULL,
  p_server_state_hash VARCHAR(64) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_effective_idempotency VARCHAR(100);
  v_next_seq INT;
  v_action_id UUID;
  v_existing_action RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para registrar una jugada';
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'act_' || p_session_id::text || '_' || v_user_id::text || '_' || extract(epoch from now())::text
  );

  -- 1. Verificar idempotencia: si la acción ya existe, retornar de forma transparente sin error
  SELECT id, sequence_number INTO v_existing_action
  FROM public.game_actions
  WHERE idempotency_key = v_effective_idempotency;

  IF v_existing_action.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'action_id', v_existing_action.id,
      'sequence_number', v_existing_action.sequence_number,
      'is_duplicate', true
    );
  END IF;

  -- 2. Bloquear transaccionalmente la sesión de juego para garantizar incremento atómico de sequence_number
  PERFORM 1 FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND: La sesión de juego % no existe', p_session_id;
  END IF;

  -- 3. Calcular de forma atómica el siguiente número de secuencia
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_next_seq
  FROM public.game_actions
  WHERE session_id = p_session_id;

  v_action_id := gen_random_uuid();

  -- 4. Registrar la acción de juego de forma inmutable
  INSERT INTO public.game_actions (
    id,
    session_id,
    user_id,
    sequence_number,
    action_type,
    payload,
    is_valid,
    server_state_hash,
    idempotency_key,
    created_at
  ) VALUES (
    v_action_id,
    p_session_id,
    v_user_id,
    v_next_seq,
    p_action_type,
    COALESCE(p_payload, '{}'::jsonb),
    TRUE,
    COALESCE(NULLIF(trim(p_server_state_hash), ''), 'HASH_' || extract(epoch from now())::text),
    v_effective_idempotency,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'sequence_number', v_next_seq,
    'is_duplicate', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_game_action_secure(UUID, VARCHAR, JSONB, VARCHAR, VARCHAR) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
