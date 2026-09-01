// ==============================================================================
// RASPANDO LA OLLA — UTILERÍA DE RESOLUCIÓN DE RUTAS DE ASSETS ESTÁTICOS
// ==============================================================================
// Garantiza la resolución correcta de assets (logo.svg, favicon.svg, etc.)
// tanto en entornos locales, Cloud Run y desplegados bajo subrutas como /ve/.
// ==============================================================================

/**
 * Resuelve la URL pública para un asset estático respetando la ruta base configurada.
 */
export function getAssetUrl(path?: string | null): string {
  const baseUrl = import.meta.env.BASE_URL || '/ve/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  if (!path) {
    return `${normalizedBase}logo.svg`;
  }

  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }

  // Si la ruta contiene fragmentos de imágenes genéricas no válidas
  if (path.includes('photo-1518709268805') || path.includes('unsplash')) {
    return `${normalizedBase}logo.svg`;
  }

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${cleanPath}`;
}
