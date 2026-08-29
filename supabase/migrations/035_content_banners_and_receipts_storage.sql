-- ================================================================
-- MIGRACIÓN 035: Gestor de Contenido Multimedia (Banners) y Soporte de Comprobantes
-- Proyecto: RASPANDO LA OLLA
-- Estado: SAFE_DEVELOPMENT_MODE = true (Generación Controlada de SQL)
-- ================================================================

-- 1. Asegurar columnas de comprobantes de pago en deposit_requests
ALTER TABLE public.deposit_requests ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE public.deposit_requests ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.deposit_requests ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.deposit_requests ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE public.deposit_requests ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- 2. Tabla de Banners y Contenido Multimedia Administrable
CREATE TABLE IF NOT EXISTS public.content_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  image_url TEXT NOT NULL,
  video_url TEXT NULL,
  button_text VARCHAR(100) NULL,
  target_action VARCHAR(100) NULL DEFAULT 'polla', -- 'polla', 'bingo', 'games', 'wallet', etc.
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NULL,
  location VARCHAR(50) NOT NULL DEFAULT 'HOME', -- 'HOME', 'GAMES', 'POLLA', 'BINGO', 'PROFILE', 'MAIN_PANEL', 'GENERAL'
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banners_active_location ON public.content_banners(is_active, location, priority DESC);
CREATE INDEX IF NOT EXISTS idx_banners_created_at ON public.content_banners(created_at);

ALTER TABLE public.content_banners ENABLE ROW LEVEL SECURITY;

-- Politica 1: Lectura publica de banners activos
DROP POLICY IF EXISTS p_banners_select_active ON public.content_banners;
CREATE POLICY p_banners_select_active ON public.content_banners
  FOR SELECT
  USING (
    is_active = true 
    AND (start_date <= NOW())
    AND (end_date IS NULL OR end_date >= NOW())
  );

-- Politica 2: Lectura total para administradores y operadores
DROP POLICY IF EXISTS p_banners_select_admin ON public.content_banners;
CREATE POLICY p_banners_select_admin ON public.content_banners
  FOR SELECT
  TO authenticated
  USING (
    public.is_operator_or_above(auth.uid())
  );

-- Politica 3: Modificación exclusiva por administradores y operadores
DROP POLICY IF EXISTS p_banners_write_admin ON public.content_banners;
CREATE POLICY p_banners_write_admin ON public.content_banners
  FOR ALL
  TO authenticated
  USING (
    public.is_operator_or_above(auth.uid())
  )
  WITH CHECK (
    public.is_operator_or_above(auth.uid())
  );

-- 3. Inserción de Banners Promocionales Iniciales de Polla Venezolana
INSERT INTO public.content_banners (
  title,
  description,
  image_url,
  button_text,
  target_action,
  priority,
  is_active,
  location
) VALUES (
  '🐾 COMPRA TU POLLA VENEZOLANA',
  'Selecciona tus 6 animalitos y participa en el sorteo diario. ¡Turno Mañana y Tarde con pozo acumulado!',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
  'COMPRAR POLLA',
  'polla',
  10,
  true,
  'HOME'
), (
  '🌅 SORTEO DIARIO — TURNO MAÑANA',
  'Cierre de venta a las 07:55 AM. Selecciona 6 animalitos del 00 al 76 sin repetir. Precio 250 Bs.',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
  'JUGAR AHORA',
  'polla',
  9,
  true,
  'POLLA'
) ON CONFLICT DO NOTHING;
