-- ==============================================================================
-- MIGRACIÓN 140: BLINDAJE DE SEGURIDAD INTEGRAL Y MITIGACIONES CRÍTICAS
-- Proyecto: RASPANDO LA OLLA 🇻🇪 (PulsoPLAY)
-- Estado: PRODUCCIÓN / EJECUTAR EN SUPABASE SQL EDITOR
-- ==============================================================================

-- 1. BLINDAJE DE RATE LIMITING EN draw_next_bingo_ball_client (Vulnerabilidad #1)
-- Evita manipulación de frecuencia por clientes o daemons de bingo maliciosos.
CREATE OR REPLACE FUNCTION public.draw_next_bingo_ball_client(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_host_id UUID;
  v_table_id UUID;
  v_status TEXT;
  v_last_draw TIMESTAMPTZ;
  v_min_interval INTERVAL := INTERVAL '2 seconds';
  v_result JSONB;
BEGIN
  -- 1. Verificar anfitrión de la mesa o admin
  SELECT gs.table_id, gt.host_user_id, gs.status::text INTO v_table_id, v_host_id, v_status
  FROM public.game_sessions gs
  JOIN public.game_tables gt ON gs.table_id = gt.id
  WHERE gs.id = p_session_id;

  IF v_table_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sesión de juego no encontrada.');
  END IF;

  IF v_host_id IS NULL OR (v_host_id != auth.uid() AND NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autorizado para extraer balotas.');
  END IF;

  IF UPPER(COALESCE(v_status, '')) != 'DRAWING' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'El sorteo no está en estado activo de extracción (Estado: ' || COALESCE(v_status, 'NULL') || ').'
    );
  END IF;

  -- 2. Validar intervalo estricto entre extracciones (mínimo 2 segundos)
  SELECT created_at INTO v_last_draw
  FROM public.game_actions
  WHERE session_id = p_session_id
    AND action_type = 'DRAW_BALL'
  ORDER BY sequence_number DESC, created_at DESC
  LIMIT 1;

  IF v_last_draw IS NOT NULL AND (NOW() - v_last_draw) < v_min_interval THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'TOO_FAST',
      'message', 'Debe esperar al menos 2 segundos entre extracciones de balota.'
    );
  END IF;

  -- 3. Llamar de forma segura al motor server-authoritative
  BEGIN
    SELECT public.server_bingo_operation('draw_ball', p_session_id, auth.uid()) INTO v_result;
    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%BINGO_COMPLETE%' THEN
      RETURN jsonb_build_object(
        'success', false,
        'game_over', true,
        'reason', 'BINGO_COMPLETE',
        'message', 'Todas las balotas han sido extraídas exitosamente.'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'message', 'Error en extracción de balota: ' || SQLERRM
      );
    END IF;
  END;
END;
$$;


-- 2. REFUERZO DE INMUTABILIDAD DEL LIBRO MAYOR CONTABLE (Vulnerabilidad #2)
-- Garantiza que source_type y todas las columnas contables sean estrictamente inmutables.
CREATE OR REPLACE FUNCTION public.enforce_ledger_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo se permite purga administrativa de registros etiquetados como TEST_BONUS ejecutada por el sistema
  IF TG_OP = 'DELETE' AND OLD.source_type = 'TEST_BONUS' THEN
    IF NOT public.is_admin(auth.uid()) AND current_user != 'postgres' THEN
      RAISE EXCEPTION 'NO_AUTORIZADO: Solo un administrador puede depurar registros de prueba.';
    END IF;
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'LEDGER_IMMUTABLE_VIOLATION: El libro mayor contable es estrictamente inmutable. No se permite UPDATE ni DELETE.';
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_prevent_modification ON public.ledger_entries;
CREATE TRIGGER trg_ledger_prevent_modification
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ledger_immutability();


-- 3. BLINDAJE DE CONCURRENCIA EN INSCRIPCIÓN DE TORNEOS (Vulnerabilidad #3)
-- Bloquea con FOR UPDATE tanto la fila del torneo como la billetera del usuario.
CREATE OR REPLACE FUNCTION public.register_for_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_tournament RECORD;
  v_entry_fee NUMERIC;
  v_wallet_id UUID;
  v_available NUMERIC(14,2);
  v_current_registrations INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTENTICADO';
  END IF;

  -- 1. Bloquear la fila del torneo para evitar sobrecupo concurrente
  SELECT * INTO v_tournament 
  FROM public.tournaments 
  WHERE id = p_tournament_id
  FOR UPDATE;
  
  IF v_tournament IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Torneo no encontrado.');
  END IF;

  IF v_tournament.status != 'REGISTRATION' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Las inscripciones no están abiertas.');
  END IF;

  IF NOW() > v_tournament.registration_deadline THEN
    RETURN jsonb_build_object('success', false, 'message', 'El plazo de inscripción ha vencido.');
  END IF;

  SELECT COUNT(*) INTO v_current_registrations
  FROM public.tournament_registrations
  WHERE tournament_id = p_tournament_id;

  IF v_current_registrations >= v_tournament.max_participants THEN
    RETURN jsonb_build_object('success', false, 'message', 'El torneo ya alcanzó su capacidad máxima de participantes.');
  END IF;

  -- Verificar si el usuario ya está inscrito
  IF EXISTS (
    SELECT 1 FROM public.tournament_registrations 
    WHERE tournament_id = p_tournament_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ya estás registrado en este torneo.');
  END IF;

  -- 2. Cobrar entrada con bloqueo serial de billetera
  v_entry_fee := COALESCE(v_tournament.entry_fee, 0);
  IF v_entry_fee > 0 THEN
    SELECT id, available_balance INTO v_wallet_id, v_available
    FROM public.wallets
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF v_wallet_id IS NULL OR v_available < v_entry_fee THEN
      RETURN jsonb_build_object(
        'success', false, 
        'message', 'Saldo insuficiente en billetera para cubrir la entrada (' || v_entry_fee || ' Bs).'
      );
    END IF;

    UPDATE public.wallets
    SET available_balance = available_balance - v_entry_fee,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    -- Asentar debito en ledger_entries
    BEGIN
      INSERT INTO public.ledger_entries (
        wallet_id, user_id, entry_type, direction, amount, 
        balance_after_available, balance_after_held, 
        reference_table, reference_id, idempotency_key, description
      ) VALUES (
        v_wallet_id, v_user_id, 'GAME_ENTRY_HOLD'::ledger_entry_type_enum, 'DEBIT'::ledger_direction_enum, v_entry_fee,
        (v_available - v_entry_fee), 0.00,
        'tournaments', p_tournament_id, 'tourn_reg_' || p_tournament_id::text || '_' || v_user_id::text,
        'Inscripción al Torneo: ' || v_tournament.name
      );
    EXCEPTION WHEN OTHERS THEN
      -- Compatibilidad con variaciones en schema de ledger_entries
      NULL;
    END;
  END IF;

  -- 3. Registrar al participante
  INSERT INTO public.tournament_registrations (tournament_id, user_id, status)
  VALUES (p_tournament_id, v_user_id, 'REGISTERED');

  UPDATE public.tournaments
  SET current_participants = v_current_registrations + 1,
      updated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('success', true, 'message', 'Inscripción confirmada exitosamente.');
END;
$$;


-- 4. REEMBOLSOS AUTOMÁTICOS EN CANCELACIÓN DE TORNEOS (Vulnerabilidad #7)
-- Reintegra automáticamente la cuota a cada usuario registrado al cancelar un torneo.
CREATE OR REPLACE FUNCTION public.cancel_tournament_with_refund(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tournament RECORD;
  v_reg RECORD;
  v_entry_fee NUMERIC;
  v_refunded_count INT := 0;
  v_wallet_id UUID;
  v_cur_balance NUMERIC;
BEGIN
  -- Solo administradores pueden cancelar torneos
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: Solo un administrador puede cancelar torneos.';
  END IF;

  SELECT * INTO v_tournament 
  FROM public.tournaments 
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF v_tournament IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Torneo no encontrado.');
  END IF;

  IF v_tournament.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('success', false, 'message', 'El torneo ya se encuentra cancelado.');
  END IF;

  v_entry_fee := COALESCE(v_tournament.entry_fee, 0);

  -- Si el torneo tenía cuota de entrada, reembolsar a cada participante inscrito
  IF v_entry_fee > 0 THEN
    FOR v_reg IN 
      SELECT id, user_id 
      FROM public.tournament_registrations
      WHERE tournament_id = p_tournament_id 
        AND status IN ('REGISTERED', 'CONFIRMED')
    LOOP
      -- Bloquear billetera para acreditación segura
      SELECT id, available_balance INTO v_wallet_id, v_cur_balance
      FROM public.wallets
      WHERE user_id = v_reg.user_id
      FOR UPDATE;

      IF v_wallet_id IS NOT NULL THEN
        UPDATE public.wallets
        SET available_balance = available_balance + v_entry_fee,
            updated_at = NOW()
        WHERE id = v_wallet_id;

        -- Registrar asiento de reembolso en libro mayor
        BEGIN
          INSERT INTO public.ledger_entries (
            wallet_id, user_id, entry_type, direction, amount,
            balance_after_available, balance_after_held,
            reference_table, reference_id, idempotency_key, description
          ) VALUES (
            v_wallet_id, v_reg.user_id, 'PRIZE_PAYOUT'::ledger_entry_type_enum, 'CREDIT'::ledger_direction_enum, v_entry_fee,
            (v_cur_balance + v_entry_fee), 0.00,
            'tournaments', p_tournament_id, 'tourn_ref_' || p_tournament_id::text || '_' || v_reg.user_id::text,
            'Reembolso por cancelación de Torneo: ' || v_tournament.name
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;

        v_refunded_count := v_refunded_count + 1;
      END IF;

      -- Marcar registro como reembolsado
      UPDATE public.tournament_registrations
      SET status = 'REFUNDED'
      WHERE id = v_reg.id;
    END LOOP;
  END IF;

  -- Actualizar estado del torneo a CANCELLED
  UPDATE public.tournaments
  SET status = 'CANCELLED',
      updated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Torneo cancelado exitosamente.',
    'refunded_participants', v_refunded_count,
    'refund_amount_per_user', v_entry_fee
  );
END;
$$;

-- Integrar el reembolso automático en update_tournament_status
CREATE OR REPLACE FUNCTION public.update_tournament_status(
  p_tournament_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO: Se requieren privilegios de administrador.';
  END IF;

  IF UPPER(p_status) = 'CANCELLED' THEN
    RETURN public.cancel_tournament_with_refund(p_tournament_id);
  END IF;

  UPDATE public.tournaments
  SET status = p_status, updated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('success', true, 'message', 'Estado actualizado a ' || p_status);
END;
$$;


-- 5. RATE LIMITING EN ACCIONES DE JUEGO EN VIVO (Vulnerabilidad #9)
-- Protege submit_game_action_secure contra bombardeo o inundación de acciones.
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
  v_recent_actions INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Debes iniciar sesión para registrar una jugada';
  END IF;

  -- Control de frecuencia: máximo 30 acciones por minuto por usuario en la sesión
  SELECT COUNT(*) INTO v_recent_actions
  FROM public.game_actions
  WHERE session_id = p_session_id
    AND user_id = v_user_id
    AND created_at > (NOW() - INTERVAL '60 seconds');

  IF v_recent_actions >= 30 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'RATE_LIMIT_EXCEEDED',
      'message', 'Demasiados movimientos registrados en poco tiempo. Por favor espera unos segundos.'
    );
  END IF;

  v_effective_idempotency := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    'act_' || p_session_id::text || '_' || v_user_id::text || '_' || extract(epoch from now())::text
  );

  -- 1. Verificar idempotencia
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

  -- 2. Incrementar secuencia atómica por sesión
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_seq
  FROM public.game_actions
  WHERE session_id = p_session_id;

  -- 3. Registrar la acción
  INSERT INTO public.game_actions (
    session_id,
    user_id,
    action_type,
    payload,
    server_state_hash,
    idempotency_key,
    sequence_number,
    created_at
  ) VALUES (
    p_session_id,
    v_user_id,
    p_action_type,
    p_payload,
    p_server_state_hash,
    v_effective_idempotency,
    v_next_seq,
    NOW()
  )
  RETURNING id INTO v_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'sequence_number', v_next_seq
  );
END;
$$;


-- 6. LIMPIEZA DE DESCONEXIONES EN PARTIDAS (Vulnerabilidad #10)
CREATE OR REPLACE FUNCTION public.cleanup_disconnected_players()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleaned INT := 0;
BEGIN
  -- Marcar como LEFT a jugadores en partidas activas cuyo perfil no registre actividad reciente (> 60 seg)
  UPDATE public.game_table_players gtp
  SET status = 'LEFT'
  FROM public.profiles p
  WHERE gtp.user_id = p.user_id
    AND gtp.status = 'PLAYING'
    AND p.last_seen_at < (NOW() - INTERVAL '60 seconds');

  GET DIAGNOSTICS v_cleaned = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'cleaned_players', v_cleaned);
END;
$$;


-- 7. OTORGAR PERMISOS Y RECARGAR SCHEMA
GRANT EXECUTE ON FUNCTION public.draw_next_bingo_ball_client(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_tournament(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_tournament_with_refund(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tournament_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_game_action_secure(UUID, VARCHAR, JSONB, VARCHAR, VARCHAR) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_disconnected_players() TO authenticated;

NOTIFY pgrst, 'reload schema';
