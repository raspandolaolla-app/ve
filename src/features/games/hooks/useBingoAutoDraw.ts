// ==============================================================================
// RASPANDO LA OLLA — HOOK DE BINGO (SERVER-AUTHORITATIVE)
// El sorteo es 100% manejado por el servidor/base de datos. El cliente solo escucha por Realtime.
// ==============================================================================

export const useBingoAutoDraw = (
  _sessionId: string | null | undefined,
  _gameType: string | undefined,
  _gameStateStatus: string | undefined,
  _userId: string | null | undefined
) => {
  // El frontend NUNCA solicita bolas por intervalo. El sorteo es exclusivamente Server-Authoritative.
};

