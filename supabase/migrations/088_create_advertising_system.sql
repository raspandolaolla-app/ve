-- ================================================================
-- MIGRACIÓN 088: Sistema Profesional de Publicidad desde GitHub
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- 1. Tabla de Catálogo de Recursos Multimedia (Assets Metadata)
CREATE TABLE IF NOT EXISTS public.advertising_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'video', 'animation', 'icon')),
  mime_type TEXT,
  title TEXT,
  description TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC,
  file_size_bytes BIGINT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adv_assets_type_active ON public.advertising_assets(asset_type, active);
CREATE INDEX IF NOT EXISTS idx_adv_assets_created ON public.advertising_assets(created_at DESC);

-- 2. Tabla de Campañas Publicitarias (Campaign Configurations)
CREATE TABLE IF NOT EXISTS public.advertising_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NULL REFERENCES public.advertising_assets(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 0,
  placement TEXT NOT NULL,
  game_type TEXT NULL,
  device_type TEXT NOT NULL DEFAULT 'ALL' CHECK (device_type IN ('ALL', 'MOBILE', 'TABLET', 'DESKTOP')),
  orientation TEXT NOT NULL DEFAULT 'ANY' CHECK (orientation IN ('ANY', 'PORTRAIT', 'LANDSCAPE')),
  start_at TIMESTAMPTZ NULL,
  end_at TIMESTAMPTZ NULL,
  display_duration_seconds INTEGER NULL DEFAULT 10,
  frequency_limit INTEGER NULL,
  target_url TEXT NULL,
  cta_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adv_campaigns_active_placement ON public.advertising_campaigns(active, placement, priority DESC);
CREATE INDEX IF NOT EXISTS idx_adv_campaigns_game_device ON public.advertising_campaigns(game_type, device_type);

-- 3. Activación y Forzado de Row Level Security (RLS)
ALTER TABLE public.advertising_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertising_campaigns ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad para advertising_assets
DROP POLICY IF EXISTS p_adv_assets_public_read ON public.advertising_assets;
CREATE POLICY p_adv_assets_public_read ON public.advertising_assets
  FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS p_adv_assets_admin_all ON public.advertising_assets;
CREATE POLICY p_adv_assets_admin_all ON public.advertising_assets
  FOR ALL
  TO authenticated
  USING (
    public.is_admin(auth.uid()) 
    OR public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role_enum)
    OR public.is_operator_or_above(auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid()) 
    OR public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role_enum)
    OR public.is_operator_or_above(auth.uid())
  );

-- Políticas de Seguridad para advertising_campaigns
DROP POLICY IF EXISTS p_adv_campaigns_public_read ON public.advertising_campaigns;
CREATE POLICY p_adv_campaigns_public_read ON public.advertising_campaigns
  FOR SELECT
  USING (
    active = true
    AND (start_at IS NULL OR start_at <= NOW())
    AND (end_at IS NULL OR end_at >= NOW())
  );

DROP POLICY IF EXISTS p_adv_campaigns_admin_all ON public.advertising_campaigns;
CREATE POLICY p_adv_campaigns_admin_all ON public.advertising_campaigns
  FOR ALL
  TO authenticated
  USING (
    public.is_admin(auth.uid()) 
    OR public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role_enum)
    OR public.is_operator_or_above(auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid()) 
    OR public.has_role(auth.uid(), 'SUPER_ADMIN'::app_role_enum)
    OR public.is_operator_or_above(auth.uid())
  );

-- 4. Publicación en Supabase Realtime para Notificación Instantánea a Clientes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.advertising_campaigns;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.advertising_assets;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- 5. Sembrado Inicial de Assets y Campañas por Defecto
INSERT INTO public.advertising_assets (
  asset_key,
  file_path,
  asset_type,
  mime_type,
  title,
  description,
  width,
  height,
  duration_seconds,
  file_size_bytes,
  active
) VALUES 
(
  'banner_polla_diaria',
  'banners/banner_polla_diaria.webp',
  'image',
  'image/webp',
  'Polla Venezolana — Sorteo Diario 250 Bs',
  'Elige 6 animalitos del 00 al 76 y gana el pozo acumulado diario.',
  1200,
  400,
  NULL,
  142850,
  true
),
(
  'banner_domino_criollo',
  'banners/banner_domino_criollo.webp',
  'image',
  'image/webp',
  'Dominó Clásico Venezolano',
  'Mesas 1v1 y por Parejas a 100 puntos con tranque de cochina.',
  1200,
  400,
  NULL,
  138400,
  true
),
(
  'promo_pago_movil_video',
  'videos/promo_pago_movil_video.mp4',
  'video',
  'video/mp4',
  'Video Promocional — Recargas Instantáneas Pago Móvil',
  'Abonos y retiros automatizados en Bolívares con tasa oficial BCV.',
  1280,
  720,
  15,
  1840000,
  true
)
ON CONFLICT (asset_key) DO UPDATE SET
  file_path = EXCLUDED.file_path,
  asset_type = EXCLUDED.asset_type,
  mime_type = EXCLUDED.mime_type,
  title = EXCLUDED.title,
  updated_at = NOW();

-- Sembrar Campañas de Ejemplo Activas
INSERT INTO public.advertising_campaigns (
  name,
  active,
  priority,
  placement,
  game_type,
  device_type,
  orientation,
  target_url,
  cta_text
) VALUES
(
  'Campaña Global Polla Venezolana',
  true,
  10,
  'HOME_TOP',
  NULL,
  'ALL',
  'ANY',
  'polla',
  'JUGAR POLLA'
),
(
  'Campaña Mesas Dominó',
  true,
  5,
  'GAME_DOMINO',
  'domino_venezolano',
  'ALL',
  'ANY',
  'tables',
  'VER MESAS'
)
ON CONFLICT DO NOTHING;
