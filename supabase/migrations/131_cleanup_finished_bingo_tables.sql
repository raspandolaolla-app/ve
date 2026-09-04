-- ==============================================================================
-- MIGRACIÓN 131: FUNCIÓN DE LIMPIEZA AUTOMÁTICA DE MESAS DE BINGO FINALIZADAS
-- Proyecto: RASPANDO LA OLLA — Mantenimiento y Depuración de Mesas Finalizadas
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_finished_bingo_tables()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_admin BOOLEAN := false;
  v_cleaned_count INT := 0;
  v_table_record RECORD;
BEGIN
  -- 1. Verificación de permisos (Admin o service_role)
  IF current_setting('role', true) != 'service_role' AND COALESCE(auth.role(), '') != 'service_role' THEN
    SELECT public.is_admin(auth.uid()) INTO v_is_admin;
    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'NO_AUTORIZADO: Se requieren privilegios de administrador.';
    END IF;
  END IF;

  -- 2. Limpiar mesas de Bingo finalizadas o canceladas con más de 1 hora de antigüedad
  FOR v_table_record IN
    SELECT id 
    FROM public.game_tables
    WHERE LOWER(game_type::text) = 'bingo'
      AND status::text IN ('FINISHED', 'CANCELLED', 'CLOSED')
      AND (updated_at < NOW() - INTERVAL '1 hour' OR (updated_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'))
  LOOP
    BEGIN
      -- Limpiar referencias secundarias si existen
      DELETE FROM public.bingo_card_purchases WHERE game_table_id = v_table_record.id;
      DELETE FROM public.game_table_players WHERE table_id = v_table_record.id;
      
      -- Eliminar sesiones asociadas y sus secretos
      DELETE FROM public.game_session_secrets 
      WHERE session_id IN (SELECT id FROM public.game_sessions WHERE table_id = v_table_record.id);
      
      DELETE FROM public.game_actions 
      WHERE session_id IN (SELECT id FROM public.game_sessions WHERE table_id = v_table_record.id);

      DELETE FROM public.game_settlements WHERE table_id = v_table_record.id;
      DELETE FROM public.game_sessions WHERE table_id = v_table_record.id;

      -- Finalmente eliminar la mesa
      DELETE FROM public.game_tables WHERE id = v_table_record.id;
      v_cleaned_count := v_cleaned_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Si alguna restricción estricta de auditoría previene el borrado físico, marcar como CLOSED
      UPDATE public.game_tables 
      SET status = 'CLOSED', updated_at = NOW() 
      WHERE id = v_table_record.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Limpieza completada. Se eliminaron ' || v_cleaned_count || ' mesas finalizadas.',
    'cleaned_count', v_cleaned_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_finished_bingo_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_finished_bingo_tables() TO service_role;
