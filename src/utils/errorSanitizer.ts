// ==============================================================================
// RASPANDO LA OLLA — SANITIZADOR DE ERRORES PARA INTERFAZ PÚBLICA (FASE 25.1)
// ==============================================================================
// Transforma errores técnicos (PostgreSQL, PGRST, RPCs, HTTP, red) en mensajes claros
// y amigables para el usuario, protegiendo detalles internos de infraestructura.
//
// REGLA CRÍTICA:
// 1. Errores técnicos (42703, 42P01, PGRST204, PGRST205, etc.) NUNCA deben interpretarse
//    como "El sistema se está actualizando".
// 2. "Mantenimiento" SOLO se muestra ante una señal explícita y verificable del sistema.
// 3. Los datos sensibles (tokens, contraseñas, documentos) se limpian de los logs.
// ==============================================================================

/**
 * Categorías canónicas de error en el sistema.
 */
export type ErrorCategory =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_OPERATION'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'MAINTENANCE'
  | 'UNKNOWN_ERROR';

/**
 * Estructura de error clasificado para uso interno y de interfaz.
 */
export interface ClassifiedError {
  category: ErrorCategory;
  userMessage: string;
  safeCode: string;
}

/**
 * Sanitiza objetos o mensajes de error para remover credenciales, tokens, JWTs y datos privados
 * antes de registrar en la consola interna de depuración.
 */
export function scrubSensitiveData(data: unknown): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    return data
      .replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/eyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_+/=]*/g, '[JWT_REDACTED]')
      .replace(/sb_secret_[A-Za-z0-9\-_]+/gi, '[SECRET_KEY_REDACTED]')
      .replace(/password\s*[:=]\s*["']?[^"',\s]+/gi, 'password=[REDACTED]')
      .replace(/service_role/gi, '[ROLE_REDACTED]');
  }
  if (typeof data === 'object') {
    const scrubbed: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('jwt') ||
        lowerKey.includes('password') ||
        lowerKey.includes('service_role') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('cedula') ||
        lowerKey.includes('document')
      ) {
        scrubbed[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        scrubbed[key] = scrubSensitiveData(value);
      } else if (typeof value === 'string') {
        scrubbed[key] = scrubSensitiveData(value);
      } else {
        scrubbed[key] = value;
      }
    }
    return scrubbed;
  }
  return data;
}

/**
 * Registra un error internamente sin exponer secretos ni información sensible.
 */
export function logInternalError(context: string, rawError: unknown, extraDetails?: Record<string, any>): void {
  if (process.env.NODE_ENV !== 'production') {
    const safeError = scrubSensitiveData(rawError);
    const safeExtra = extraDetails ? scrubSensitiveData(extraDetails) : undefined;
    console.debug(`[INTERNAL_ERROR] [${context}]`, {
      error: safeError,
      ...(safeExtra ? { details: safeExtra } : {}),
    });
  }
}

/**
 * Clasifica un error técnico y devuelve una categoría estructurada y un mensaje seguro para el usuario.
 */
export function classifyError(rawError: unknown): ClassifiedError {
  if (!rawError) {
    return {
      category: 'UNKNOWN_ERROR',
      userMessage: 'No fue posible completar la operación. Por favor, inténtalo nuevamente en unos instantes.',
      safeCode: 'UNKNOWN',
    };
  }

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

  // 1. Mantenimiento REAL del sistema (SOLO ante banderas o estados explícitos verificables)
  if (
    code === 'maintenance' ||
    code === 'maintenance_mode' ||
    lower.includes('system_maintenance_active') ||
    lower.includes('platform_maintenance') ||
    lower.includes('mantenimiento_programado') ||
    lower.includes('mantenimiento_activo') ||
    lower.includes('sistema_en_mantenimiento')
  ) {
    return {
      category: 'MAINTENANCE',
      userMessage: 'El sistema se encuentra temporalmente en mantenimiento.',
      safeCode: 'MAINTENANCE',
    };
  }

  // 2. Mantenimiento específico de un juego
  if (
    lower.includes('game_inactive') ||
    lower.includes('mantenimiento temporal') ||
    lower.includes('juego no disponible')
  ) {
    return {
      category: 'MAINTENANCE',
      userMessage: 'El juego seleccionado se encuentra en mantenimiento temporal.',
      safeCode: 'GAME_MAINTENANCE',
    };
  }

  // 3. Autenticación requerida
  if (
    code === '401' ||
    code === 'auth_required' ||
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('unauthenticated') ||
    lower.includes('auth_required') ||
    lower.includes('debes iniciar sesión') ||
    lower.includes('usuario no autenticado')
  ) {
    const isTableCreation = lower.includes('crear una mesa') || lower.includes('mesa');
    return {
      category: 'AUTH_REQUIRED',
      userMessage: isTableCreation
        ? 'Debes iniciar sesión para crear una mesa.'
        : 'Debes iniciar sesión para continuar.',
      safeCode: 'AUTH_REQUIRED',
    };
  }

  // 4. Sesión expirada
  if (
    code === 'session_expired' ||
    lower.includes('jwt') ||
    lower.includes('expired') ||
    lower.includes('token_expired') ||
    lower.includes('invalid claim')
  ) {
    return {
      category: 'AUTH_EXPIRED',
      userMessage: 'Tu sesión ha expirado. Inicia sesión nuevamente.',
      safeCode: 'AUTH_EXPIRED',
    };
  }

  // 5. Permisos denegados (RLS, roles, 403, 42501)
  if (
    code === '403' ||
    code === '42501' ||
    lower.includes('403') ||
    lower.includes('42501') ||
    lower.includes('forbidden') ||
    lower.includes('permission denied') ||
    lower.includes('row-level security') ||
    lower.includes('permission_denied')
  ) {
    return {
      category: 'PERMISSION_DENIED',
      userMessage: 'No tienes permisos para realizar esta operación.',
      safeCode: 'PERMISSION_DENIED',
    };
  }

  // 6. Saldo insuficiente
  if (
    code === 'insufficient_funds' ||
    code === 'insufficient_balance' ||
    lower.includes('insufficient_balance') ||
    lower.includes('insufficient_funds') ||
    lower.includes('saldo insuficiente') ||
    lower.includes('insufficient funds') ||
    lower.includes('no dispones de saldo')
  ) {
    return {
      category: 'INSUFFICIENT_BALANCE',
      userMessage: 'Saldo disponible insuficiente para completar esta operación.',
      safeCode: 'INSUFFICIENT_BALANCE',
    };
  }

  // 7. Problemas de red o conectividad
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('networkerror') ||
    lower.includes('timeout') ||
    lower.includes('fetch failed') ||
    lower.includes('connection refused')
  ) {
    return {
      category: 'NETWORK_ERROR',
      userMessage: 'No se pudo conectar temporalmente con el servidor.',
      safeCode: 'NETWORK_ERROR',
    };
  }

  // 8. Elementos no encontrados (404, pgrst116)
  if (
    code === '404' ||
    code === 'pgrst116' ||
    lower.includes('404') ||
    lower.includes('pgrst116') ||
    lower.includes('not found') ||
    lower.includes('no encontrado')
  ) {
    return {
      category: 'NOT_FOUND',
      userMessage: 'No encontramos la información solicitada.',
      safeCode: 'NOT_FOUND',
    };
  }

  // 9. Operaciones inválidas específicas (mesas, validaciones de negocio)
  if (lower.includes('invalid_entry_fee') || lower.includes('monto de entrada') || lower.includes('no está autorizado')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'El monto de entrada no es válido o no está autorizado en el sistema.',
      safeCode: 'INVALID_ENTRY_FEE',
    };
  }

  if (lower.includes('invalid_game_type') || lower.includes('tipo de juego')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'El tipo de juego seleccionado no es válido.',
      safeCode: 'INVALID_GAME_TYPE',
    };
  }

  if (lower.includes('profile_not_active') || lower.includes('cuenta no se encuentra activa') || lower.includes('cuenta bloqueada')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Tu cuenta no se encuentra activa para crear o participar en mesas.',
      safeCode: 'PROFILE_NOT_ACTIVE',
    };
  }

  if (lower.includes('code_not_found') || lower.includes('código de trancaíto no encontrado')) {
    return {
      category: 'NOT_FOUND',
      userMessage: 'Código de Trancaíto no encontrado.',
      safeCode: 'CODE_NOT_FOUND',
    };
  }

  if (lower.includes('empty_code') || lower.includes('introduce el código')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Introduce el código de la mesa.',
      safeCode: 'EMPTY_CODE',
    };
  }

  if (lower.includes('table_full') || lower.includes('esta mesa ya está completa')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Esta mesa ya está completa.',
      safeCode: 'TABLE_FULL',
    };
  }

  if (lower.includes('game_already_started') || lower.includes('esta partida ya comenzó')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Esta partida ya comenzó y no acepta nuevos jugadores.',
      safeCode: 'GAME_ALREADY_STARTED',
    };
  }

  if (lower.includes('already_joined') || lower.includes('already_in_table') || lower.includes('ya estás dentro de esta mesa')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Ya estás dentro de esta mesa.',
      safeCode: 'ALREADY_JOINED',
    };
  }

  if (lower.includes('table_closed') || lower.includes('esta mesa ya no está disponible')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Esta mesa ya no está disponible.',
      safeCode: 'TABLE_CLOSED',
    };
  }

  if (lower.includes('seat_taken') || lower.includes('asiento ocupado')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'El asiento seleccionado ya fue ocupado o la mesa alcanzó su capacidad máxima.',
      safeCode: 'SEAT_TAKEN',
    };
  }

  if (code === '23505' || lower.includes('23505') || lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Ya existe un registro con estos datos o la operación ya fue procesada.',
      safeCode: 'DUPLICATE_KEY',
    };
  }

  if (code === '23503' || lower.includes('23503') || lower.includes('foreign key constraint')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'La referencia seleccionada no es válida o ya no existe en el sistema.',
      safeCode: 'FOREIGN_KEY_VIOLATION',
    };
  }

  if (
    lower.includes('popup closed') ||
    lower.includes('user cancelled') ||
    lower.includes('closed by user') ||
    lower.includes('access_denied')
  ) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'El inicio de sesión fue cancelado. Puedes intentarlo de nuevo cuando desees.',
      safeCode: 'OAUTH_CANCELLED',
    };
  }

  if (
    lower.includes('provider is not enabled') ||
    lower.includes('unsupported provider') ||
    lower.includes('provider google is not enabled') ||
    lower.includes('oauth provider') ||
    lower.includes('not_configured') ||
    lower.includes('service_unavailable')
  ) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'El servicio de autenticación no está disponible temporalmente.',
      safeCode: 'PROVIDER_UNAVAILABLE',
    };
  }

  // 10. Errores de concurrencia y límites
  if (code === '409' || lower.includes('409') || lower.includes('conflict')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Conflicto de concurrencia al procesar la solicitud. Inténtalo de nuevo.',
      safeCode: 'CONFLICT',
    };
  }

  if (code === '429' || lower.includes('429') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'Demasiados intentos seguidos. Por favor espera unos momentos antes de reintentar.',
      safeCode: 'RATE_LIMIT',
    };
  }

  // 10.5 Mapeos específicos de sesiones de juego (Fase 6)
  if (code === '22p02' || lower.includes('22p02') || lower.includes('session_status_enum') || lower.includes('invalid input value for enum')) {
    console.error('[DATABASE_CONFIG_ERROR] Error de configuración de sesión de base de datos:', rawMsg);
    return {
      category: 'UNKNOWN_ERROR',
      userMessage: 'Error de configuración de sesión.',
      safeCode: 'SESSION_CONFIG_ERROR',
    };
  }

  if (lower.includes('session already started') || lower.includes('partida ya está iniciada') || lower.includes('ya comenzó') || lower.includes('session_already_started') || lower.includes('only_host_can_start')) {
    return {
      category: 'INVALID_OPERATION',
      userMessage: 'La partida ya está iniciada. Sincronizando con la mesa...',
      safeCode: 'SESSION_ALREADY_STARTED',
    };
  }

  if (lower.includes('session_not_found') || lower.includes('sesión no encontrada') || lower.includes('no se encontró la sesión') || lower.includes('table_not_found')) {
    return {
      category: 'NOT_FOUND',
      userMessage: 'No se encontró la sesión de esta mesa.',
      safeCode: 'SESSION_NOT_FOUND',
    };
  }

  if (lower.includes('conexión perdida') || lower.includes('connection lost') || lower.includes('websocket') || lower.includes('disconnected')) {
    return {
      category: 'NETWORK_ERROR',
      userMessage: 'Conexión perdida. Intentando reconectar...',
      safeCode: 'CONNECTION_LOST',
    };
  }

  // 11. Errores de servidor, de esquema y no clasificados (42703, 42P01, PGRST204, PGRST205, 500, 502, 503)
  // NOTA: NUNCA mostrar "El sistema se está actualizando" para estos errores técnicos.
  return {
    category: 'UNKNOWN_ERROR',
    userMessage: 'No fue posible completar la operación. Por favor, inténtalo nuevamente en unos instantes.',
    safeCode: code || 'SERVER_ERROR',
  };
}

/**
 * Traduce cualquier mensaje o código de error técnico a un mensaje amigable para el usuario.
 * Garantiza que nunca se muestren SQLSTATEs, tablas, funciones RPC ni stack traces.
 */
export function sanitizeUserErrorMessage(
  rawError: unknown,
  fallbackMessage = 'No fue posible completar la operación. Por favor, inténtalo nuevamente en unos instantes.'
): string {
  if (!rawError) return fallbackMessage;

  logInternalError('sanitizeUserErrorMessage', rawError);

  const classified = classifyError(rawError);

  // Si se clasificó como error desconocido y se proporcionó un fallback personalizado distinto al default, usar el fallback
  if (
    classified.category === 'UNKNOWN_ERROR' &&
    fallbackMessage &&
    fallbackMessage !== 'No fue posible completar la operación. Por favor, inténtalo nuevamente en unos instantes.' &&
    fallbackMessage !== 'No fue posible completar la operación. Inténtalo nuevamente.'
  ) {
    return fallbackMessage;
  }

  return classified.userMessage;
}

