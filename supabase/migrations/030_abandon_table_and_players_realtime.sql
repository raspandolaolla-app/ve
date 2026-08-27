-- ==============================================================================
-- MIGRACIÓN 030: REGLA ATÓMICA DE ABANDONO DE MESA Y RESOLUCIÓN DE PARTIDAS
-- Proyecto: RASPANDO LA OLLA
-- Estado: PRODUCCIÓN / EJECUTAR EN SUPABASE SQL EDITOR DIRECTAMENTE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.abandon_game_table_secure(
  p_table_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_table RECORD;
  v_session RECORD;
  v_active_players_count INT;
  v_remaining_player RECORD;
  v_effective_idempotency VARCHAR(100);
  v_settle_result JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para abandonar la mesa';
  END IF;

  -- 1. Bloquear mesa y verificar existencia
  SELECT * INTO v_table FROM public.game_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TABLE_NOT_FOUND: La mesa de juego no existe';
  END IF;

  -- 2. Cambiar el estado del participante en game_table_players a 'LEFT'
  UPDATE public.game_table_players
  SET status = 'LEFT'::player_table_status_enum,
      updated_at = NOW()
  WHERE table_id = p_table_id AND user_id = v_caller_id;

  -- 3. Contar los jugadores activos/restantes en la mesa
  SELECT COUNT(*) INTO v_active_players_count
  FROM public.game_table_players
  WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY');

  -- Actualizar el contador de jugadores de la mesa
  UPDATE public.game_tables
  SET current_players_count = v_active_players_count,
      updated_at = NOW()
  WHERE id = p_table_id;

  -- 4. Si se especificó una sesión o buscar la última activa
  IF p_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.game_sessions WHERE id = p_session_id FOR UPDATE;
  ELSE
    SELECT * INTO v_session FROM public.game_sessions
    WHERE table_id = p_table_id AND status IN ('WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED')
    ORDER BY created_at DESC LIMIT 1
    FOR UPDATE;
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'abandon_' || p_table_id::text || '_' || v_caller_id::text || '_' || extract(epoch from now())::text
  );

  -- Caso A: Si la sesión estaba activa y queda un ÚNICO jugador restante -> DECLARAR GANADOR POR ABANDONO
  IF v_active_players_count = 1 AND v_session.id IS NOT NULL AND v_session.status NOT IN ('SETTLED', 'CANCELLED') THEN
    SELECT user_id INTO v_remaining_player
    FROM public.game_table_players
    WHERE table_id = p_table_id AND status IN ('PLAYING', 'JOINED', 'READY')
    LIMIT 1;

    IF v_remaining_player.user_id IS NOT NULL THEN
      -- Liquidar partida a favor del jugador restante usando settle_game_session
      v_settle_result := public.settle_game_session(
        v_session.id,
        ARRAY[v_remaining_player.user_id],
        1,
        'SETTLE_ABANDON_' || v_effective_idempotency
      );

      RETURN jsonb_build_object(
        'success', true,
        'action', 'WINNER_DECLARED_BY_ABANDON',
        'winner_user_id', v_remaining_player.user_id,
        'settlement', v_settle_result
      );
    END IF;
  END IF;

  -- Caso B: Si quedan 0 jugadores activos -> Cancelar/Cerrar mesa y sesión huérfana
  IF v_active_players_count = 0 THEN
    IF v_session.id IS NOT NULL AND v_session.status NOT IN ('SETTLED', 'CANCELLED') THEN
      UPDATE public.game_sessions
      SET status = 'CANCELLED', ended_at = NOW()
      WHERE id = v_session.id;
    END IF;

    UPDATE public.game_tables
    SET status = 'CLOSED', updated_at = NOW()
    WHERE id = p_table_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'TABLE_CLOSED_NO_PLAYERS'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'PLAYER_LEFT',
    'remaining_players_count', v_active_players_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.abandon_game_table_secure(UUID, UUID, VARCHAR) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
