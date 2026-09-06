-- ==============================================================================
-- RASPANDO LA OLLA — MIGRACIÓN 147: ACTUALIZACIÓN DE ASSETS Y CAMPAÑAS REALES
-- ==============================================================================
-- Sincroniza la tabla public.advertising_assets y public.advertising_campaigns
-- con los archivos multimedia reales verificados en /public/ads/banners/:
--  - default_banner.svg
--  - video1.mp4 (con poster_video1.jpg)
--  - video2.mp4 (con poster_video2.jpg)
--  - video3.mp4 (con poster_video3.jpg)
--  - banner_domino.svg
--  - banner_truco.svg
--  - banner_bingo.svg
--  - banner_polla.svg
--  - banner_atrapaito.svg
-- ==============================================================================

-- 1. Insertar / Actualizar Assets Físicos Reales
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
  'banner_default',
  'banners/default_banner.svg',
  'image',
  'image/svg+xml',
  'Raspando La Olla — Plataforma Oficial',
  '¡Juegos Tradicionales Venezolanos en Tiempo Real! Dominó, Truco, Bingo, Polla, Atrapaíto y más.',
  1200,
  400,
  NULL,
  1433,
  true
),
(
  'video_spot_1',
  'banners/video1.mp4',
  'video',
  'video/mp4',
  'Spot Promocional 1 — Emoción en Vivo',
  'Vive la adrenalina de las apuestas en Bolívares con pagos inmediatos por Pago Móvil.',
  1280,
  720,
  10,
  2485941,
  true
),
(
  'video_spot_2',
  'banners/video2.mp4',
  'video',
  'video/mp4',
  'Spot Promocional 2 — Comunidad y Torneos',
  'Únete a las mesas públicas o crea salas privadas con tus panas. Sorteos diarios garantizados.',
  1280,
  720,
  10,
  3003326,
  true
),
(
  'video_spot_3',
  'banners/video3.mp4',
  'video',
  'video/mp4',
  'Spot Promocional 3 — Gran Pozo Acumulado',
  'Juega a la Polla y al Bingo con pozos progresivos certificados y auditoría transparente.',
  1280,
  720,
  10,
  2484717,
  true
),
(
  'banner_domino',
  'banners/banner_domino.svg',
  'image',
  'image/svg+xml',
  'Dominó Clásico Venezolano',
  'Mesas 1v1 y por Parejas a 100 puntos con tranque de cochina y paso con cuenta atrás.',
  1200,
  400,
  NULL,
  4065,
  true
),
(
  'banner_truco',
  'banners/banner_truco.svg',
  'image',
  'image/svg+xml',
  'Truco Venezolano — ¡Quiero Vale Cuatro!',
  'Envite, vira, flor y ley del juego con señas venezolanas y multijugador en vivo.',
  1200,
  400,
  NULL,
  3950,
  true
),
(
  'banner_bingo',
  'banners/banner_bingo.svg',
  'image',
  'image/svg+xml',
  'Gran Bingo Criollo — Salas 24/7',
  'Cartones de 75 y 90 bolas con cantaor en voz real y pozos acumulados comunitarios.',
  1200,
  400,
  NULL,
  4126,
  true
),
(
  'banner_polla',
  'banners/banner_polla.svg',
  'image',
  'image/svg+xml',
  'Polla Venezolana — Pozo Diario',
  'Elige 6 animalitos del 00 al 76 y gana con 3, 4, 5 o 6 aciertos.',
  1200,
  400,
  NULL,
  3809,
  true
),
(
  'banner_atrapaito',
  'banners/banner_atrapaito.svg',
  'image',
  'image/svg+xml',
  '¡Atrapaíto! — Parchís Criollo 4 Jugadores',
  'Bloqueos, capturas y carrera al cielo en partidas intensas en tiempo real.',
  1200,
  400,
  NULL,
  3114,
  true
)
ON CONFLICT (asset_key) DO UPDATE SET
  file_path = EXCLUDED.file_path,
  asset_type = EXCLUDED.asset_type,
  mime_type = EXCLUDED.mime_type,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  duration_seconds = EXCLUDED.duration_seconds,
  file_size_bytes = EXCLUDED.file_size_bytes,
  active = EXCLUDED.active,
  updated_at = NOW();

-- 2. Asegurar Campañas Activas Vinculadas a los Assets Reales
INSERT INTO public.advertising_campaigns (
  name,
  asset_id,
  active,
  priority,
  placement,
  game_type,
  device_type,
  orientation,
  target_url,
  cta_text,
  display_duration_seconds
)
SELECT
  'Spot Promocional 1 — Emoción en Vivo',
  id,
  true,
  20,
  'HOME_TOP',
  NULL,
  'ALL',
  'ANY',
  'tables',
  'VER MESAS EN VIVO',
  10
FROM public.advertising_assets
WHERE asset_key = 'video_spot_1'
AND NOT EXISTS (
  SELECT 1 FROM public.advertising_campaigns WHERE name = 'Spot Promocional 1 — Emoción en Vivo'
);

INSERT INTO public.advertising_campaigns (
  name,
  asset_id,
  active,
  priority,
  placement,
  game_type,
  device_type,
  orientation,
  target_url,
  cta_text,
  display_duration_seconds
)
SELECT
  'Spot Promocional 2 — Comunidad y Torneos',
  id,
  true,
  18,
  'HOME_TOP',
  NULL,
  'ALL',
  'ANY',
  'lobby',
  'EXPLORAR SALAS',
  10
FROM public.advertising_assets
WHERE asset_key = 'video_spot_2'
AND NOT EXISTS (
  SELECT 1 FROM public.advertising_campaigns WHERE name = 'Spot Promocional 2 — Comunidad y Torneos'
);

INSERT INTO public.advertising_campaigns (
  name,
  asset_id,
  active,
  priority,
  placement,
  game_type,
  device_type,
  orientation,
  target_url,
  cta_text,
  display_duration_seconds
)
SELECT
  'Campaña Dominó Criollo',
  id,
  true,
  15,
  'GAME_DOMINO',
  'domino_venezolano',
  'ALL',
  'ANY',
  'tables',
  'ENTRAR A LAS MESAS',
  10
FROM public.advertising_assets
WHERE asset_key = 'banner_domino'
AND NOT EXISTS (
  SELECT 1 FROM public.advertising_campaigns WHERE name = 'Campaña Dominó Criollo'
);

INSERT INTO public.advertising_campaigns (
  name,
  asset_id,
  active,
  priority,
  placement,
  game_type,
  device_type,
  orientation,
  target_url,
  cta_text,
  display_duration_seconds
)
SELECT
  'Campaña Truco Venezolano',
  id,
  true,
  15,
  'GAME_TRUCO',
  'truco_venezolano',
  'ALL',
  'ANY',
  'tables',
  'JUGAR TRUCO',
  10
FROM public.advertising_assets
WHERE asset_key = 'banner_truco'
AND NOT EXISTS (
  SELECT 1 FROM public.advertising_campaigns WHERE name = 'Campaña Truco Venezolano'
);

INSERT INTO public.advertising_campaigns (
  name,
  asset_id,
  active,
  priority,
  placement,
  game_type,
  device_type,
  orientation,
  target_url,
  cta_text,
  display_duration_seconds
)
SELECT
  'Campaña Bingo Criollo',
  id,
  true,
  15,
  'GAME_BINGO',
  'bingo',
  'ALL',
  'ANY',
  'bingo',
  'CANTAR BINGO',
  10
FROM public.advertising_assets
WHERE asset_key = 'banner_bingo'
AND NOT EXISTS (
  SELECT 1 FROM public.advertising_campaigns WHERE name = 'Campaña Bingo Criollo'
);

INSERT INTO public.advertising_campaigns (
  name,
  asset_id,
  active,
  priority,
  placement,
  game_type,
  device_type,
  orientation,
  target_url,
  cta_text,
  display_duration_seconds
)
SELECT
  'Campaña Polla Venezolana',
  id,
  true,
  15,
  'GAME_POLLA',
  'polla',
  'ALL',
  'ANY',
  'polla',
  'HACER MI JUGADA',
  10
FROM public.advertising_assets
WHERE asset_key = 'banner_polla'
AND NOT EXISTS (
  SELECT 1 FROM public.advertising_campaigns WHERE name = 'Campaña Polla Venezolana'
);

INSERT INTO public.advertising_campaigns (
  name,
  asset_id,
  active,
  priority,
  placement,
  game_type,
  device_type,
  orientation,
  target_url,
  cta_text,
  display_duration_seconds
)
SELECT
  'Campaña Atrapaíto 4J',
  id,
  true,
  15,
  'GAME_ATRAPAITO',
  'atrapaito',
  'ALL',
  'ANY',
  'tables',
  'TIRAR LOS DADOS',
  10
FROM public.advertising_assets
WHERE asset_key = 'banner_atrapaito'
AND NOT EXISTS (
  SELECT 1 FROM public.advertising_campaigns WHERE name = 'Campaña Atrapaíto 4J'
);
