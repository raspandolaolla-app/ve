// ==============================================================================
// RASPANDO LA OLLA — SUITE DE PRUEBAS FASE 25.1
// Validación controlada de Sanitización y Clasificación de Errores
// ==============================================================================

import {
  sanitizeUserErrorMessage,
  classifyError,
  scrubSensitiveData,
  type ErrorCategory,
} from '../utils/errorSanitizer';

export interface TestCaseResult {
  id: number;
  name: string;
  passed: boolean;
  details?: string;
}

export function runPhase251ValidationTests(): { allPassed: boolean; results: TestCaseResult[] } {
  const results: TestCaseResult[] = [];

  const addTest = (id: number, name: string, fn: () => boolean, details?: string) => {
    try {
      const passed = fn();
      results.push({ id, name, passed, details });
    } catch (e: any) {
      results.push({ id, name, passed: false, details: e?.message });
    }
  };

  // 1. Error 42703 (undefined_column) NO muestra mensaje de actualización/mantenimiento
  addTest(1, 'Error 42703 (SQL undefined_column) no muestra mantenimiento', () => {
    const error = { code: '42703', message: 'column profiles.unknown_col does not exist' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return !sanitized.includes('actualizando') &&
      !sanitized.includes('mantenimiento') &&
      classified.category === 'UNKNOWN_ERROR' &&
      sanitized === 'No se pudo iniciar la partida. Estamos sincronizando la mesa.';
  });

  // 2. Error 42P01 (undefined_table) NO muestra mantenimiento
  addTest(2, 'Error 42P01 (undefined_table) no muestra mantenimiento', () => {
    const error = { code: '42P01', message: 'relation public.non_existent_table does not exist' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return !sanitized.includes('actualizando') &&
      !sanitized.includes('mantenimiento') &&
      classified.category === 'UNKNOWN_ERROR';
  });

  // 3. Error 42501 / RLS (insufficient_privilege) muestra PERMISSION_DENIED
  addTest(3, 'Error 42501 (insufficient_privilege / RLS) muestra mensaje de permisos', () => {
    const error = { code: '42501', message: 'new row violates row-level security policy for table "wallets"' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return classified.category === 'PERMISSION_DENIED' &&
      sanitized === 'No tienes permisos para realizar esta operación.';
  });

  // 4. Error PGRST204 (columna no encontrada en schema cache) NO muestra mantenimiento
  addTest(4, 'Error PGRST204 (schema cache / column missing) no muestra mantenimiento', () => {
    const error = { code: 'PGRST204', message: "Could not find the 'avatar_url' column of 'profiles' in the schema cache" };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return !sanitized.includes('actualizando') &&
      !sanitized.includes('mantenimiento') &&
      classified.category === 'UNKNOWN_ERROR';
  });

  // 5. Error PGRST205 (tabla no encontrada en schema cache) NO muestra mantenimiento
  addTest(5, 'Error PGRST205 no muestra mantenimiento', () => {
    const error = { code: 'PGRST205', message: "Could not find the table in schema cache" };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return !sanitized.includes('actualizando') &&
      !sanitized.includes('mantenimiento') &&
      classified.category === 'UNKNOWN_ERROR';
  });

  // 6. Error HTTP 400 Bad Request
  addTest(6, 'Error HTTP 400 no muestra mantenimiento', () => {
    const error = { status: 400, message: 'Bad request payload' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return !sanitized.includes('actualizando') &&
      !sanitized.includes('mantenimiento') &&
      classified.category === 'UNKNOWN_ERROR';
  });

  // 7. Error HTTP 401 Unauthorized -> AUTH_REQUIRED
  addTest(7, 'Error HTTP 401 muestra AUTH_REQUIRED', () => {
    const error = { status: 401, message: 'Invalid JWT or unauthorized' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return classified.category === 'AUTH_REQUIRED' &&
      sanitized === 'Debes iniciar sesión para continuar.';
  });

  // 8. Error HTTP 403 Forbidden -> PERMISSION_DENIED
  addTest(8, 'Error HTTP 403 muestra PERMISSION_DENIED', () => {
    const error = { status: 403, message: 'Forbidden resource' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return classified.category === 'PERMISSION_DENIED' &&
      sanitized === 'No tienes permisos para realizar esta operación.';
  });

  // 9. Error HTTP 404 Not Found -> NOT_FOUND
  addTest(9, 'Error HTTP 404 muestra NOT_FOUND', () => {
    const error = { status: 404, message: 'Item not found' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return classified.category === 'NOT_FOUND' &&
      sanitized === 'No encontramos la información solicitada.';
  });

  // 10. Error HTTP 500 Internal Server Error NO muestra mantenimiento
  addTest(10, 'Error HTTP 500 no muestra mantenimiento', () => {
    const error = { status: 500, message: 'Internal Server Error' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return !sanitized.includes('actualizando') &&
      !sanitized.includes('mantenimiento') &&
      classified.category === 'UNKNOWN_ERROR';
  });

  // 11. Error con palabra "column" o "schema cache" NO activa falso positivo
  addTest(11, 'Palabras "column" y "schema cache" en mensajes no activan mantenimiento', () => {
    const err1 = 'Invalid column reference in query';
    const err2 = 'Refreshing schema cache in background';
    const sanitized1 = sanitizeUserErrorMessage(err1);
    const sanitized2 = sanitizeUserErrorMessage(err2);
    return !sanitized1.includes('actualizando') &&
      !sanitized1.includes('mantenimiento') &&
      !sanitized2.includes('actualizando') &&
      !sanitized2.includes('mantenimiento');
  });

  // 12. Mantenimiento explícito del sistema SÍ produce MAINTENANCE
  addTest(12, 'Señal explícita de mantenimiento del sistema produce MAINTENANCE', () => {
    const error = { message: 'SYSTEM_MAINTENANCE_ACTIVE: Plataforma en mantenimiento programado' };
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return classified.category === 'MAINTENANCE' &&
      sanitized === 'El sistema se encuentra temporalmente en mantenimiento.';
  });

  // 13. Mantenimiento de juego específico produce GAME_MAINTENANCE
  addTest(13, 'Mantenimiento de juego produce mensaje amigable de juego inactivo', () => {
    const error = 'GAME_INACTIVE: Este juego se encuentra en mantenimiento temporal';
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return classified.category === 'MAINTENANCE' &&
      sanitized === 'El juego seleccionado se encuentra en mantenimiento temporal.';
  });

  // 14. Saldo insuficiente produce INSUFFICIENT_BALANCE
  addTest(14, 'Error de saldo insuficiente clasifica como INSUFFICIENT_BALANCE', () => {
    const error = 'INSUFFICIENT_BALANCE: Saldo insuficiente en la billetera';
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return classified.category === 'INSUFFICIENT_BALANCE' &&
      sanitized === 'Saldo disponible insuficiente para completar esta operación.';
  });

  // 15. Error de red produce NETWORK_ERROR
  addTest(15, 'Error de red clasifica como NETWORK_ERROR', () => {
    const error = 'TypeError: Failed to fetch';
    const sanitized = sanitizeUserErrorMessage(error);
    const classified = classifyError(error);
    return classified.category === 'NETWORK_ERROR' &&
      sanitized === 'No se pudo conectar temporalmente con el servidor.';
  });

  // 16. Scrubbing de datos sensibles limpia JWTs, Bearer tokens y contraseñas
  addTest(16, 'Depuración segura remueve JWTs, passwords y Bearer tokens', () => {
    const dirtyObj = {
      message: 'Auth error with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID and password=SuperSecret123',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID',
      service_role: 'secret_admin_role',
      cedula: 'V-12345678',
      safeParam: 'public_game_table_123',
    };
    const cleaned = scrubSensitiveData(dirtyObj);
    return (
      cleaned.token === '[REDACTED]' &&
      cleaned.service_role === '[REDACTED]' &&
      cleaned.cedula === '[REDACTED]' &&
      cleaned.safeParam === 'public_game_table_123' &&
      !cleaned.message.includes('SuperSecret123') &&
      !cleaned.message.includes('eyJhbGciOiJIUzI1Ni')
    );
  });

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}
