/**
 * ==============================================================================
 * RASPANDO LA OLLA — UTILIDAD DE VIDEOS TUTORIALES PARA JUEGOS
 * ==============================================================================
 * Procesamiento seguro, sanitización, autodetección y generación de embeds
 * oficiales para YouTube, TikTok e Instagram Reels.
 * Sin almacenamiento local de archivos de video ni ejecución de HTML/JS inseguro.
 * ==============================================================================
 */

import type { VideoPlatform, VideoOrientation, GameTutorialVideo } from '../types/admin';

export interface VideoValidationResult {
  isValid: boolean;
  platform?: VideoPlatform;
  orientation?: VideoOrientation;
  embedUrl?: string;
  normalizedUrl?: string;
  videoId?: string;
  error?: string;
}

// Dominios permitidos estrictamente
const YOUTUBE_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
];

const TIKTOK_DOMAINS = [
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
];

const INSTAGRAM_DOMAINS = [
  'instagram.com',
  'www.instagram.com',
];

/**
 * Valida y procesa una URL de video tutorial.
 * Rechaza esquemas no seguros, inyecciones de código o dominios no autorizados.
 */
export function validateAndParseVideoUrl(rawUrl: string): VideoValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL vacía o no proporcionada.' };
  }

  const trimmed = rawUrl.trim();

  // Bloqueo estricto de secuencias maliciosas o no HTTPS
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    /<[^>]*>/i.test(trimmed) ||
    /["'`<>]/.test(trimmed)
  ) {
    return { isValid: false, error: 'La URL contiene caracteres o protocolos no permitidos.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Formato de enlace inválido. Asegúrate de incluir https://' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { isValid: false, error: 'Solo se permiten enlaces con protocolo HTTPS seguro.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 1. Detección YouTube (Horizontal estándar o Vertical Shorts)
  if (YOUTUBE_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return parseYouTubeUrl(parsed, trimmed);
  }

  // 2. Detección TikTok (Vertical)
  if (TIKTOK_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return parseTikTokUrl(parsed, trimmed);
  }

  // 3. Detección Instagram Reels (Vertical)
  if (INSTAGRAM_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return parseInstagramUrl(parsed, trimmed);
  }

  return {
    isValid: false,
    error: 'Plataforma no soportada. Solo se admiten enlaces de YouTube, TikTok o Instagram Reels.',
  };
}

/**
 * Procesa enlaces de YouTube (estándar, shorts, youtu.be, embed)
 */
function parseYouTubeUrl(urlObj: URL, originalUrl: string): VideoValidationResult {
  let videoId: string | null = null;
  let isShorts = false;

  const pathname = urlObj.pathname;

  if (urlObj.hostname.includes('youtu.be')) {
    // Formato: https://youtu.be/VIDEO_ID
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      videoId = parts[0];
    }
  } else if (pathname.includes('/shorts/')) {
    // Formato: https://www.youtube.com/shorts/VIDEO_ID
    const parts = pathname.split('/shorts/')[1]?.split(/[/&?]/)[0];
    if (parts) {
      videoId = parts;
      isShorts = true;
    }
  } else if (pathname.includes('/embed/')) {
    // Formato: https://www.youtube.com/embed/VIDEO_ID
    const parts = pathname.split('/embed/')[1]?.split(/[/&?]/)[0];
    if (parts) {
      videoId = parts;
    }
  } else {
    // Formato: https://www.youtube.com/watch?v=VIDEO_ID
    videoId = urlObj.searchParams.get('v');
  }

  // Validar formato id YouTube (alfanumérico, guiones o guión bajo, usualmente 11 chars)
  if (!videoId || !/^[a-zA-Z0-9_-]{8,15}$/.test(videoId)) {
    return {
      isValid: false,
      platform: 'youtube',
      error: 'No se pudo identificar el código del video de YouTube en el enlace proporcionado.',
    };
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`;
  const normalizedUrl = isShorts
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;

  return {
    isValid: true,
    platform: 'youtube',
    orientation: isShorts ? 'vertical' : 'horizontal',
    videoId,
    embedUrl,
    normalizedUrl,
  };
}

/**
 * Procesa enlaces de TikTok (tiktok.com/@user/video/ID o vm.tiktok.com)
 */
function parseTikTokUrl(urlObj: URL, originalUrl: string): VideoValidationResult {
  const pathname = urlObj.pathname;
  let videoId: string | null = null;

  // Formato estándar: /@username/video/1234567890123456789
  const match = pathname.match(/\/video\/(\d+)/);
  if (match && match[1]) {
    videoId = match[1];
  } else {
    // Enlace corto o embed
    const parts = pathname.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart && /^\d+$/.test(lastPart)) {
      videoId = lastPart;
    }
  }

  if (!videoId) {
    // Si es enlace corto vm.tiktok.com, permitimos el embed directo del enlace oficial
    return {
      isValid: true,
      platform: 'tiktok',
      orientation: 'vertical',
      embedUrl: `https://www.tiktok.com/embed/v2/${encodeURIComponent(pathname.replace(/^\//, ''))}`,
      normalizedUrl: originalUrl,
    };
  }

  return {
    isValid: true,
    platform: 'tiktok',
    orientation: 'vertical',
    videoId,
    embedUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
    normalizedUrl: `https://www.tiktok.com/video/${videoId}`,
  };
}

/**
 * Procesa enlaces de Instagram Reels (/reel/CODE/ o /p/CODE/)
 */
function parseInstagramUrl(urlObj: URL, originalUrl: string): VideoValidationResult {
  const pathname = urlObj.pathname;
  let code: string | null = null;

  // Formato: /reel/CRk12345678/ o /reels/CRk12345678/ o /p/CRk12345678/
  const match = pathname.match(/\/(reel|reels|p)\/([a-zA-Z0-9_-]+)/);
  if (match && match[2]) {
    code = match[2];
  }

  if (!code) {
    return {
      isValid: false,
      platform: 'instagram',
      error: 'No se reconoció el identificador del Reel de Instagram (ej: /reel/CODIGO/).',
    };
  }

  return {
    isValid: true,
    platform: 'instagram',
    orientation: 'vertical',
    videoId: code,
    embedUrl: `https://www.instagram.com/reel/${code}/embed/`,
    normalizedUrl: `https://www.instagram.com/reel/${code}/`,
  };
}

/**
 * Nombre para mostrar de la plataforma
 */
export function getPlatformDisplayName(platform: VideoPlatform): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube';
    case 'tiktok':
      return 'TikTok';
    case 'instagram':
      return 'Instagram Reels';
    default:
      return 'Video Tutorial';
  }
}

/**
 * Genera un objeto predeterminado de tutorial de video
 */
export function createEmptyTutorialVideo(): GameTutorialVideo {
  return {
    enabled: false,
    platform: 'youtube',
    url: '',
    embedUrl: '',
    orientation: 'horizontal',
    title: '',
    description: '',
    updatedAt: new Date().toISOString(),
  };
}
