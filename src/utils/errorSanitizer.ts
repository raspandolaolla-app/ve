// ==============================================================================
// RASPANDO LA OLLA — SANITIZADOR DE ERRORES PARA INTERFAZ PÚBLICA
// ==============================================================================
// Transforma errores técnicos (PostgreSQL, PGRST, RPCs, red) en mensajes claros
// y amigables para el usuario, protegiendo detalles internos de infraestructura.
// ==============================================================================

/**
 * Traduce cualquier mensaje de error técnico a un mensaje amigable para el usuario.
 * Registra el detalle técnico en consola de desarrollo si aplica.
 */
export function sanitizeUserErrorMessage(rawError: unknown, fallbackMessage = 'No fue posible completar la operación. Inténtalo nuevamente.'): string {
  if (!rawError) return fallbackMessage;

  const rawMsg = rawError instanceof Error ? rawError.message : String(rawError || '');
  const lower = rawMsg.toLowerCase();

  // Log técnico controlado para depuración
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Sanitized Error]', rawMsg);
  }

  // Proveedor de autenticación no disponible o no configurado
  if (
    lower.includes('provider is not enabled') ||
    lower.includes('unsupported provider') ||
    lower.includes('provider google is not enabled') ||
    lower.includes('oauth provider') ||
    lower.includes('not_configured') ||
    lower.includes('not configured') ||
    lower.includes('service_unavailable') ||
    lower.includes('client no configurado')
  ) {
    return 'El servicio de autenticación no está disponible temporalmente.';
  }

  // Cancelación por el usuario
  if (
    lower.includes('popup closed') ||
    lower.includes('user cancelled') ||
    lower.includes('closed by user') ||
    lower.includes('access_denied')
  ) {
    return 'El inicio de sesión fue cancelado. Puedes intentarlo de nuevo cuando desees.';
  }

  // Problemas de conexión y red
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('networkerror') ||
    lower.includes('timeout') ||
    lower.includes('fetch failed') ||
    lower.includes('connection refused')
  ) {
    return 'Problema de conexión con el servidor. Revisa tu acceso a internet e inténtalo de nuevo.';
  }

  // Errores de saldo o balance
  if (
    lower.includes('insufficient_balance') ||
    lower.includes('saldo insuficiente') ||
    lower.includes('insufficient funds') ||
    lower.includes('no dispones de saldo')
  ) {
    return 'Saldo disponible insuficiente para completar esta operación.';
  }

  // Errores de mesa o asientos
  if (
    lower.includes('seat_taken') ||
    lower.includes('table_full') ||
    lower.includes('asiento ocupado') ||
    lower.includes('mesa llena')
  ) {
    return 'El asiento seleccionado ya fue ocupado o la mesa alcanzó su capacidad máxima.';
  }

  if (
    lower.includes('table_not_waiting') ||
    lower.includes('already_started') ||
    lower.includes('partida en curso')
  ) {
    return 'La mesa ya ha iniciado su partida o no está disponible.';
  }

  // Errores de duplicidad / idempotencia
  if (
    lower.includes('duplicate key') ||
    lower.includes('unique constraint') ||
    lower.includes('already exists') ||
    lower.includes('ya existe')
  ) {
    return 'Ya existe un registro con estos datos o la operación ya fue procesada.';
  }

  // Errores de límites y tasas
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('429')) {
    return 'Demasiados intentos seguidos. Por favor espera unos momentos antes de reintentar.';
  }

  // Errores de sesión o tokens
  if (lower.includes('jwt') || lower.includes('expired') || lower.includes('invalid claim')) {
    return 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.';
  }

  // Errores SQL o RPC internos (ocultar firmas, nombres de funciones y códigos PGRST)
  if (
    lower.includes('pgrst') ||
    lower.includes('rpc') ||
    lower.includes('security definer') ||
    lower.includes('relation') ||
    lower.includes('function') ||
    lower.includes('syntax error') ||
    lower.includes('permission denied')
  ) {
    return 'No fue posible completar la operación en este momento. Inténtalo nuevamente.';
  }

  return fallbackMessage;
}
