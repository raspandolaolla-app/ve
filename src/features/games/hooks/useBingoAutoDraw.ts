import { useEffect, useRef } from 'react';
import { getSupabaseClient } from '../../../lib/supabase/client';

export const useBingoAutoDraw = (
  sessionId: string | null | undefined,
  gameType: string | undefined,
  gameStateStatus: string | undefined,
  userId: string | null | undefined
) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 1. Solo activar el intervalo si es Bingo y el juego está en progreso
    const normalizedStatus = String(gameStateStatus || '').toLowerCase();
    const isPlaying =
      normalizedStatus === 'playing' ||
      normalizedStatus === 'in_progress' ||
      normalizedStatus === 'active';

    if (gameType !== 'bingo' || !isPlaying || !sessionId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 2. Configurar el intervalo de 4 segundos
    intervalRef.current = setInterval(async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { data, error } = await supabase.rpc('server_bingo_operation', {
          p_operation: 'draw_ball',
          p_session_id: sessionId,
          p_user_id: userId || null,
        });

        if (error) {
          // ✅ IGNORAR SILENCIOSAMENTE EL ERROR "TOO_FAST"
          // Es comportamiento normal hasta que el servidor autoriza la siguiente bola.
          if (error.message?.includes('TOO_FAST') || error.message?.includes('4 segundos')) {
            return;
          }

          // Si el juego finalizó o la sesión concluyó, limpiar intervalo
          if (
            error.message?.includes('BINGO_COMPLETE') ||
            error.message?.includes('GAME_ALREADY_FINISHED') ||
            error.message?.includes('SESSION_NOT_ACTIVE')
          ) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return;
          }

          // Loguear solo errores reales (ej. sesión no encontrada, sin permisos)
          console.error('[BINGO_DRAW_ERROR]', error);
        } else if (data?.success) {
          console.log(`🎱 Servidor cantó la bola: ${data.ball_number} (Restantes: ${data.remaining_balls})`);
          // Nota: El listener de Realtime en GameContainer / BingoGame se encarga
          // de actualizar el estado local en la interfaz de todos los jugadores simultáneamente.
        }
      } catch (err) {
        console.error('[BINGO_INTERVAL_CRASH]', err);
      }
    }, 4000); // Intenta cada 4000ms (4 segundos)

    // 3. Limpieza al desmontar o cambiar de estado
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, gameType, gameStateStatus, userId]);
};
