/**
 * Diagnóstico unificado de abandono/salida/cierre de mesa hacia el Lobby.
 * Registra formalmente el estado de la mesa, jugador, sesión y causa del retorno al lobby.
 */
export interface TableExitDiagnosticPayload {
  tableId?: string | null;
  currentUserId?: string | null;
  seatNumber?: number | string | null;
  isHost?: boolean | null;
  tableStatus?: string | null;
  sessionId?: string | null;
  sessionStatus?: string | null;
  gameType?: string | null;
  playersCount?: number | null;
  reason: string;
  sourceComponent: string;
}

export function logTableExitDiagnostic(payload: TableExitDiagnosticPayload): void {
  console.warn('[TABLE_EXIT_DIAGNOSTIC]', {
    tableId: payload.tableId || 'N/A',
    currentUserId: payload.currentUserId || 'N/A',
    seatNumber: payload.seatNumber ?? 'N/A',
    isHost: Boolean(payload.isHost),
    tableStatus: payload.tableStatus || 'N/A',
    sessionId: payload.sessionId || 'N/A',
    sessionStatus: payload.sessionStatus || 'N/A',
    gameType: payload.gameType || 'N/A',
    playersCount: payload.playersCount ?? 0,
    reason: payload.reason,
    sourceComponent: payload.sourceComponent,
    timestamp: new Date().toISOString(),
  });
}
