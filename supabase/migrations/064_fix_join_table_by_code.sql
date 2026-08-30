-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 064: UNIRSE CON CÓDIGO TRANCAÍTO
-- Función Atómica e Idempotente de Unión por Código Privado/Público
-- Asignación Automática de Asiento Libre, Validación de Estado y Retención
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.join_table_by_code_secure(
  p_invite_code VARCHAR,
  p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_normalized_code VARCHAR;
  v_table RECORD;
  v_existing_seat SMALLINT;
  v_join_result JSONB;
BEGIN
  -- 1. Validar Usuario Autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para unirte a una mesa.';
  END IF;

  -- 2. Validar Código Vacío
  IF p_invite_code IS NULL OR trim(p_invite_code) = '' THEN
    RAISE EXCEPTION 'EMPTY_CODE: Introduce el código de la mesa.';
  END IF;

  v_normalized_code := UPPER(trim(p_invite_code));

  -- 3. Buscar Mesa Real en game_tables con bloqueo FOR UPDATE
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE invite_code = v_normalized_code
     OR join_code = v_normalized_code
     OR invite_code = 'TRK-' || v_normalized_code
     OR invite_code = 'PUB-' || v_normalized_code
     OR replace(invite_code, 'TRK-', '') = v_normalized_code
     OR replace(invite_code, 'PUB-', '') = v_normalized_code
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CODE_NOT_FOUND: Código de Trancaíto no encontrado.';
  END IF;

  -- 4. Validar Estado de la Mesa
  IF v_table.status = 'ACTIVE'::table_status_enum THEN
    RAISE EXCEPTION 'GAME_ALREADY_STARTED: Esta partida ya comenzó y no acepta nuevos jugadores.';
  END IF;

  IF v_table.status IN ('FINISHED'::table_status_enum, 'CLOSED'::table_status_enum, 'EXPIRED'::table_status_enum, 'CANCELLED'::table_status_enum) THEN
    RAISE EXCEPTION 'TABLE_CLOSED: Esta mesa ya no está disponible.';
  END IF;

  IF v_table.status NOT IN ('OPEN'::table_status_enum, 'READY'::table_status_enum) THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: Esta mesa no está disponible para nuevos jugadores.';
  END IF;

  -- 5. Verificar si el usuario ya está dentro de la mesa
  SELECT seat_number INTO v_existing_seat
  FROM public.game_table_players
  WHERE table_id = v_table.id
    AND user_id = v_user_id
    AND status != 'LEFT'::player_table_status_enum;

  IF v_existing_seat IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_joined', true,
      'table_id', v_table.id,
      'user_id', v_user_id,
      'seat_number', v_existing_seat,
      'current_players_count', v_table.current_players_count,
      'max_players', v_table.max_players,
      'table_status', v_table.status,
      'invite_code', v_table.invite_code,
      'message', 'Ya estás dentro de esta mesa.'
    );
  END IF;

  -- 6. Verificar si la mesa está llena
  IF v_table.current_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: Esta mesa ya está completa.';
  END IF;

  -- 7. Ejecutar transacción de unión atómica con asignación automática de asiento
  v_join_result := public.join_table_transaction(
    v_table.id,
    NULL, -- p_seat_number = NULL -> busca automáticamente el primer asiento libre 1..max_players
    COALESCE(p_idempotency_key, 'join_code_' || v_table.id || '_' || v_user_id || '_' || extract(epoch from now()))
  );

  RETURN v_join_result || jsonb_build_object(
    'table_id', v_table.id,
    'game_type', v_table.game_type,
    'invite_code', v_table.invite_code,
    'entry_fee', v_table.entry_fee
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_table_by_code_secure(VARCHAR, VARCHAR) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
