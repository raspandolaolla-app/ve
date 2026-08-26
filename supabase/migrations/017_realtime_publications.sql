-- ================================================================
-- MIGRACIÓN 017: Publicaciones Supabase Realtime
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- Habilitar replicación Realtime exclusivamente en tablas de lobby, juego y notificaciones
-- (Las tablas financieras y de identidad privada permanecen excluidas de canales de difusión pública)

DO $$ 
BEGIN
  -- 1. Verificar si la publicación supabase_realtime existe
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 2. Agregar tablas de sincronización en tiempo real
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_tables;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_table_players;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.game_actions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

END $$;
