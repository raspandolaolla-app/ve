-- ==============================================================================
-- RASPANDO LA OLLA — CONFIGURACIÓN DE CRON PARA SORTEO AUTOMÁTICO DE POLLA
-- ==============================================================================
-- Ejecuta la Edge Function cada 15 minutos para procesar loterías de animalitos
-- ==============================================================================

-- Habilitar extensión pg_cron si no está habilitada
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Eliminar job existente si existe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('polla-auto-draw-job')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'polla-auto-draw-job');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Crear nuevo job que ejecuta la Edge Function cada 15 minutos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'polla-auto-draw-job',
      '*/15 * * * *',
      $cron$
      SELECT
        net.http_post(
          url := current_setting('app.settings.supabase_url', true) || '/functions/v1/polla-auto-draw',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.cron_job_secret', true)
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
