// ==============================================================================
// RASPANDO LA OLLA — UTILIDADES DE SEGURIDAD Y SANITIZACIÓN FRONTEND
// ==============================================================================

/**
 * Sanitiza una cadena de texto para evitar inyecciones XSS en el renderizado.
 */
export function sanitizeText(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

/**
 * Valida formato estándar de cédula venezolana (V-12345678, E-12345678, J-12345678)
 */
export function isValidCedulaFormat(cedula: string): boolean {
  if (!cedula) return false;
  const regex = /^[VEJPGvejpg]-?\d{5,9}$/;
  return regex.test(cedula.trim());
}

/**
 * Sanitiza y valida formato de UUID v4 estándar. Retorna null si no es un UUID válido.
 */
export function sanitizeUUID(uuid: string): string | null {
  if (!uuid || typeof uuid !== 'string') return null;
  const clean = uuid.trim().toLowerCase();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(clean) ? clean : null;
}

/**
 * Sanitiza una cadena general alfanumérica segura para claves de idempotencia o identifiers.
 */
export function sanitizeString(input: string, maxLength: number = 255): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[^\w\-.:_]/g, '')
    .substring(0, maxLength)
    .trim();
}
