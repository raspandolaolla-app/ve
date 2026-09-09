/**
 * Diagnóstico y trazabilidad para eventos de ciclo de vida, abandono y salida de mesas en RASPANDO LA OLLA 🇻🇪.
 * Permite auditar en tiempo real y en logs de depuración las causas de salida o transición de estado.
 */

import { logger } from './logger';

export interface TableExitDiagnosticParams {
  tableId?: string | null;
  currentUserId?: string | null;
  seatNumber?: number | string | null;
  isHost?: boolean | null;
  tableStatus?: string | null;
  sessionId?: string | null;
  sessionStatus?: string | null;
  gameType?: string | null;
  playersCount?: number | null;
  reason?: string | null;
  sourceComponent?: string | null;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export type TableExitDiagnosticPayload = TableExitDiagnosticParams;

export interface TableDiagnosticEvent {
  event: 'TABLE_EXIT' | 'TABLE_TRANSITION' | 'MATCHMAKING_EVENT' | 'ABANDONMENT';
  timestamp: string;
  details: TableExitDiagnosticParams;
}

/**
 * Registra un diagnóstico estructurado cuando un usuario abandona, cierra o sale de una mesa/partida.
 */
export function logTableExitDiagnostic(params: TableExitDiagnosticParams): void {
  try {
    const timestamp = params.timestamp || new Date().toISOString();
    const reason = params.reason || 'UNSPECIFIED_REASON';
    const source = params.sourceComponent || 'UnknownComponent';
    const tableId = params.tableId || 'NO_TABLE';
    const userId = params.currentUserId || 'NO_USER';
    const status = params.tableStatus || 'UNKNOWN_STATUS';

    const logMessage = `[TABLE_EXIT_DIAGNOSTIC] ${reason} | source=${source} | table=${tableId} | user=${userId} | status=${status}`;

    logger.info(
      logMessage,
      {
        ...params,
        timestamp,
      },
      'TableDiagnostics'
    );
  } catch (err) {
    // Protección a nivel de UI: no debe interrumpir la experiencia de usuario
    console.warn('[TABLE_EXIT_DIAGNOSTIC_FAIL]', err);
  }
}

/**
 * Registra eventos generales de mesa para auditoría y depuración.
 */
export function logTableDiagnostic(
  event: string,
  params: Record<string, unknown>,
  context = 'TableDiagnostics'
): void {
  try {
    logger.debug(`[TABLE_DIAGNOSTIC] ${event}`, params, context);
  } catch {
    // Fallback seguro
  }
}

export default {
  logTableExitDiagnostic,
  logTableDiagnostic,
};
