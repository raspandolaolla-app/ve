// ==============================================================================
// RASPANDO LA OLLA — UTILIDADES DE FORMATEO Y PRIVACIDAD
// ==============================================================================

/**
 * Formatea un monto numérico en Bolívares con separadores legibles.
 */
export function formatBolivares(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '0,00 Bs.';
  }

  const formatted = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${formatted} Bs.`;
}

/**
 * Enmascara la cédula de identidad venezolana para proteger la privacidad.
 * Ejemplo de entrada: "V-12345678" -> Salida: "V-***678"
 */
export function maskCedula(cedula: string): string {
  if (!cedula || typeof cedula !== 'string') return 'V-***';

  const clean = cedula.trim().toUpperCase();
  const parts = clean.split('-');
  const prefix = parts.length > 1 ? parts[0] : 'V';
  const number = parts.length > 1 ? parts[1] : clean.replace(/^[VEJPG]-?/i, '');

  if (number.length <= 3) {
    return `${prefix}-***${number}`;
  }

  const lastThree = number.slice(-3);
  return `${prefix}-***${lastThree}`;
}

/**
 * Enmascara el número telefónico para visualización segura en perfil.
 * Ejemplo: "+584121234567" -> "+58 412 *** 4567"
 */
export function maskPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '***';
  const clean = phone.replace(/\s+/g, '');
  if (clean.length < 7) return '***';
  const lastFour = clean.slice(-4);
  const prefix = clean.slice(0, 5);
  return `${prefix} *** ${lastFour}`;
}

/**
 * Formatea una fecha ISO a formato local venezolano DD/MM/AAAA.
 */
export function formatDateVE(isoDate: string): string {
  if (!isoDate) return '-';
  try {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoDate;
  }
}
