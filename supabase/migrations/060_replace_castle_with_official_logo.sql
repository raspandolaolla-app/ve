-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 060: REEMPLAZO DE PLACEHOLDER CASTILLO POR LOGO OFICIAL
-- ==============================================================================
-- Reemplaza cualquier referencia al castillo/unsplash en la tabla public.content_banners
-- por el logo oficial de la WebApp (/logo.svg).
-- ==============================================================================

UPDATE public.content_banners
SET image_url = '/logo.svg'
WHERE image_url LIKE '%photo-1518709268805%'
   OR image_url LIKE '%unsplash%'
   OR image_url IS NULL
   OR image_url = '';
