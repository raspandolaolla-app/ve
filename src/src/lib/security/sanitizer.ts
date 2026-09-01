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
 * Valida formato telefónico venezolano común (+58412..., 0414..., 0424..., 0416..., 0426...)
 */
export function isValidPhoneFormat(phone: string): boolean {
  if (!phone) return false;
  const clean = phone.replace(/[\s\-()]/g, '');
  const regex = /^(\+58|58|0)(412|414|424|416|426|212|419)\d{7}$/;
  return regex.test(clean);
}
