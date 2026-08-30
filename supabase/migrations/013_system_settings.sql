-- ================================================================
-- MIGRACIÓN 013: Parámetros Operativos del Sistema (System Settings)
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NOT NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_public ON public.system_settings(is_public);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings FORCE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
