-- ==============================================================================
-- RASPANDO LA OLLA — CONFIGURACIÓN DE CRON PARA SORTEO AUTOMÁTICO DE BINGO
-- ==============================================================================
-- Ejecuta la Edge Function cada 5 segundos para extraer balotas automáticamente
-- ==============================================================================

-- Habilitar extensión pg_cron si no está habilitada
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Eliminar job existente si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('bingo-auto-draw-job')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bingo-auto-draw-job');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Crear nuevo job que ejecuta la Edge Function cada 5 segundos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'bingo-auto-draw-job',
      '*/5 * * * * *',
      $cron$
      SELECT
        net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/bingo-auto-draw',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
          ),
          body := '{}'::jsonb
        )
      $cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
