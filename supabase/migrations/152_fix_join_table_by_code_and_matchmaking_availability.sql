-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 152: CORRECCIÓN DEFINITIVA DE UNIRSE POR CÓDIGO Y
-- FILTRADO AUTORITATIVO DE JUEGOS DISPONIBLES EN MATCHMAKING Y MESAS
-- ==============================================================================
-- 1. Corrige join_table_by_code_secure eliminando referencia a columna inexistente 'join_code'
-- 2. Implementa normalización estricta (trim, espacios internos, uppercase, prefijos TRK/PUB/MES)
-- 3. Valida disponibilidad del juego (is_game_enabled) impidiendo unirse si está deshabilitado
-- 4. Diferencia códigos de error: CODE_NOT_FOUND, GAME_DISABLED, TABLE_FULL, TABLE_CLOSED, etc.
-- 5. Devuelve únicamente campos seguros de la mesa (sin balances, wallets ni emails)
-- 6. Actualiza get_public_available_tables para filtrar juegos deshabilitados
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
  v_raw_code VARCHAR;
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

  -- 3. Normalización del código: trim, remover espacios internos y uppercase
  v_normalized_code := UPPER(regexp_replace(trim(p_invite_code), '\s+', '', 'g'));
  -- Extraer código base sin prefijos TRK-, PUB-, MES-
  v_raw_code := replace(replace(replace(v_normalized_code, 'TRK-', ''), 'PUB-', ''), 'MES-', '');

  -- 4. Buscar Mesa Real en game_tables con bloqueo FOR UPDATE
  SELECT * INTO v_table
  FROM public.game_tables
  WHERE UPPER(invite_code) = v_normalized_code
     OR UPPER(invite_code) = 'TRK-' || v_raw_code
     OR UPPER(invite_code) = 'PUB-' || v_raw_code
     OR UPPER(invite_code) = 'MES-' || v_raw_code
     OR replace(replace(replace(UPPER(invite_code), 'TRK-', ''), 'PUB-', ''), 'MES-', '') = v_raw_code
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CODE_NOT_FOUND: No encontramos una mesa con ese código. Verifica el código e intenta nuevamente.';
  END IF;

  -- 5. Validar Disponibilidad del Juego (Administración Central)
  IF NOT public.is_game_enabled(v_table.game_type::text) THEN
    RAISE EXCEPTION 'GAME_DISABLED: Esta mesa pertenece a un juego que se encuentra temporalmente en mantenimiento.';
  END IF;

  -- 6. Validar Estado de la Mesa
  IF v_table.status = 'ACTIVE'::table_status_enum THEN
    RAISE EXCEPTION 'GAME_ALREADY_STARTED: Esta partida ya comenzó y no acepta nuevos jugadores.';
  END IF;

  IF v_table.status IN ('FINISHED'::table_status_enum, 'CLOSED'::table_status_enum, 'EXPIRED'::table_status_enum, 'CANCELLED'::table_status_enum) THEN
    RAISE EXCEPTION 'TABLE_CLOSED: Esta mesa ya no está disponible.';
  END IF;

  IF v_table.status NOT IN ('OPEN'::table_status_enum, 'WAITING'::table_status_enum, 'READY'::table_status_enum) THEN
    RAISE EXCEPTION 'TABLE_NOT_OPEN: Esta mesa no está disponible para nuevos jugadores.';
  END IF;

  -- 7. Verificar si el usuario ya está dentro de la mesa
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
      'name', v_table.name,
      'game_type', v_table.game_type,
      'seat_number', v_existing_seat,
      'current_players_count', v_table.current_players_count,
      'max_players', v_table.max_players,
      'status', v_table.status,
      'invite_code', v_table.invite_code,
      'message', 'Ya perteneces a esta mesa. Te estamos redirigiendo...'
    );
  END IF;

  -- 8. Verificar si la mesa está llena
  IF v_table.current_players_count >= v_table.max_players THEN
    RAISE EXCEPTION 'TABLE_FULL: Esta mesa ya alcanzó el límite de jugadores.';
  END IF;

  -- 9. Ejecutar transacción de unión atómica con asignación automática de asiento
  v_join_result := public.join_table_transaction(
    v_table.id,
    NULL, -- p_seat_number = NULL -> busca automáticamente el primer asiento libre 1..max_players
    COALESCE(p_idempotency_key, 'join_code_' || v_table.id || '_' || v_user_id || '_' || extract(epoch from now()))
  );

  -- 10. Devolver respuesta segura y limpia (sin balances de anfitrión ni datos sensibles)
  RETURN jsonb_build_object(
    'success', true,
    'already_joined', false,
    'table_id', v_table.id,
    'name', v_table.name,
    'game_type', v_table.game_type,
    'game_variant', v_table.game_variant,
    'invite_code', v_table.invite_code,
    'entry_fee', v_table.entry_fee,
    'current_players_count', COALESCE((v_join_result->>'current_players_count')::int, v_table.current_players_count + 1),
    'max_players', v_table.max_players,
    'seat_number', (v_join_result->>'seat_number')::int,
    'player_id', (v_join_result->>'player_id')::text,
    'message', 'Te has unido exitosamente a la mesa.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_table_by_code_secure(VARCHAR, VARCHAR) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- Actualización de get_public_available_tables para excluir juegos deshabilitados
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_available_tables(
  p_game_type text DEFAULT NULL::text
)
RETURNS SETOF public.game_tables
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT gt.*
  FROM public.game_tables gt
  WHERE (gt.visibility = 'PUBLIC'::table_visibility_enum OR gt.visibility IS NULL)
    AND gt.status = 'OPEN'::table_status_enum
    AND gt.closed_at IS NULL
    AND gt.current_players_count < gt.max_players
    AND (gt.expires_at IS NULL OR gt.expires_at > NOW())
    AND public.is_game_enabled(gt.game_type::text)
    AND (
      p_game_type IS NULL
      OR p_game_type = 'all'
      OR gt.game_type::text ILIKE p_game_type
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.table_id = gt.id
        AND (
          gs.ended_at IS NOT NULL
          OR gs.status::text IN ('SETTLED', 'FINISHED', 'CANCELLED', 'COMPLETED', 'ABANDONED', 'CLOSED', 'ACTIVE', 'IN_PROGRESS', 'IN_GAME')
        )
    )
  ORDER BY gt.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_available_tables(text) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
