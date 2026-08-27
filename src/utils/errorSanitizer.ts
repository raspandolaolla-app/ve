// ==============================================================================
// RASPANDO LA OLLA — SANITIZADOR DE ERRORES PARA INTERFAZ PÚBLICA (FASE 24)
// ==============================================================================
// Transforma errores técnicos (PostgreSQL, PGRST, RPCs, HTTP, red) en mensajes claros
// y amigables para el usuario, protegiendo detalles internos de infraestructura.
// ==============================================================================

/**
 * Traduce cualquier mensaje o código de error técnico a un mensaje amigable para el usuario.
 * Garantiza que nunca se muestren SQLSTATEs, tablas, funciones RPC ni stack traces.
 */
export function sanitizeUserErrorMessage(
  rawError: unknown,
  fallbackMessage = 'No fue posible completar la operación. Inténtalo nuevamente.'
): string {
  if (!rawError) return fallbackMessage;

  let rawMsg = '';
  let errorCode = '';

  if (typeof rawError === 'string') {
    rawMsg = rawError;
  } else if (rawError && typeof rawError === 'object') {
    const obj = rawError as Record<string, any>;
    rawMsg = obj.message || obj.error_description || obj.error || JSON.stringify(rawError);
    errorCode = String(obj.code || obj.status || obj.statusCode || '');
  }

  const lower = rawMsg.toLowerCase();
  const code = errorCode.toLowerCase();

  // Log técnico controlado exclusivamente en modo desarrollo
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[Sanitized Error]', { code: errorCode, message: rawMsg });
  }

  // 1. Mapeo específico por códigos SQL / PostgREST / HTTP
  if (code === '23505' || lower.includes('23505') || lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return 'Ya existe un registro con estos datos o la operación ya fue procesada.';
  }

  if (code === '23503' || lower.includes('23503') || lower.includes('foreign key constraint')) {
    return 'La referencia seleccionada no es válida o ya no existe en el sistema.';
  }

  if (code === '42501' || lower.includes('42501') || lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'No dispones de los permisos necesarios para realizar esta acción.';
  }

  if (code === '42703' || lower.includes('42703') || lower.includes('column') || lower.includes('schema cache')) {
    return 'El sistema se está actualizando. Por favor recarga la página o inténtalo en breve.';
  }

  if (code === 'pgrst116' || lower.includes('pgrst116') || code === '404' || lower.includes('not found')) {
    return 'El registro solicitado no fue encontrado o no está disponible.';
  }

  if (code === '401' || lower.includes('401') || lower.includes('unauthorized') || lower.includes('unauthenticated')) {
    return 'Debes iniciar sesión para realizar esta operación.';
  }

  if (code === '403' || lower.includes('403') || lower.includes('forbidden')) {
    return 'Acceso no permitido para este recurso.';
  }

  if (code === '409' || lower.includes('409') || lower.includes('conflict')) {
    return 'Conflicto de concurrencia al procesar la solicitud. Inténtalo de nuevo.';
  }

  if (code === '429' || lower.includes('429') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'Demasiados intentos seguidos. Por favor espera unos momentos antes de reintentar.';
  }

  if (code === '500' || code === '502' || code === '503' || lower.includes('500') || lower.includes('internal server error')) {
    return 'El servicio está experimentando alta demanda. Inténtalo en unos minutos.';
  }

  // 2. Proveedores de Autenticación
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

  // 3. Cancelaciones por el usuario
  if (
    lower.includes('popup closed') ||
    lower.includes('user cancelled') ||
    lower.includes('closed by user') ||
    lower.includes('access_denied')
  ) {
    return 'El inicio de sesión fue cancelado. Puedes intentarlo de nuevo cuando desees.';
  }

  // 4. Problemas de red o conectividad
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

  // 5. Saldo y billetera
  if (
    lower.includes('insufficient_balance') ||
    lower.includes('saldo insuficiente') ||
    lower.includes('insufficient funds') ||
    lower.includes('no dispones de saldo')
  ) {
    return 'Saldo disponible insuficiente para completar esta operación.';
  }

  // 6. Mesas y partidas
  if (
    lower.includes('auth_required') ||
    lower.includes('debes iniciar sesión') ||
    lower.includes('usuario no autenticado')
  ) {
    return 'Debes iniciar sesión para crear una mesa.';
  }

  if (
    lower.includes('invalid_entry_fee') ||
    lower.includes('monto de entrada') ||
    lower.includes('no está autorizado')
  ) {
    return 'El monto de entrada no es válido o no está autorizado en el sistema.';
  }

  if (
    lower.includes('game_inactive') ||
    lower.includes('mantenimiento temporal') ||
    lower.includes('juego no disponible')
  ) {
    return 'El juego seleccionado se encuentra en mantenimiento temporal.';
  }

  if (
    lower.includes('profile_not_active') ||
    lower.includes('cuenta no se encuentra activa') ||
    lower.includes('cuenta bloqueada') ||
    lower.includes('cuenta suspendida')
  ) {
    return 'Tu cuenta no se encuentra activa para crear o participar en mesas.';
  }

  if (
    lower.includes('table_creation_error') ||
    lower.includes('error al crear la mesa')
  ) {
    return 'No fue posible crear la mesa en este momento. Intenta nuevamente.';
  }

  if (
    lower.includes('invalid_game_type') ||
    lower.includes('tipo de juego')
  ) {
    return 'El tipo de juego seleccionado no es válido.';
  }

  if (
    lower.includes('invalid_players_count') ||
    lower.includes('cantidad de jugadores')
  ) {
    return 'La cantidad de jugadores configurada no es válida para este juego.';
  }

  if (
    lower.includes('duplicate_invite_code') ||
    lower.includes('código único')
  ) {
    return 'No fue posible generar un código único. Intenta nuevamente.';
  }

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

  // 7. Sesión o tokens
  if (lower.includes('jwt') || lower.includes('expired') || lower.includes('invalid claim')) {
    return 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.';
  }

  // 8. Ocultación de nombres de funciones internas / tablas / RPC / SQL
  if (
    lower.includes('pgrst') ||
    lower.includes('rpc') ||
    lower.includes('security definer') ||
    lower.includes('relation') ||
    lower.includes('function') ||
    lower.includes('syntax error') ||
    lower.includes('permission_denied')
  ) {
    return 'No fue posible completar la operación en este momento. Inténtalo nuevamente.';
  }

  return fallbackMessage;
}
