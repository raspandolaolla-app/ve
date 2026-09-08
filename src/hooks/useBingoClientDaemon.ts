// ==============================================================================
// RASPANDO LA OLLA — HOOK: CLIENT-SIDE DAEMON PARA BINGO (FALLBACK GITHUB PAGES)
// ==============================================================================
// En entornos de hosting estático (GitHub Pages), no hay un daemon Node.js
// ejecutándose en el servidor para invocar los ticks de extracción cada 2-3s.
// Este hook permite que el cliente del anfitrión (Host) actúe de forma segura
// como despachador del sorteo llamando a la RPC autoritativa de Supabase.
// ==============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase/client';

export interface UseBingoClientDaemonProps {
  sessionId: string | null;
  isHost: boolean;
  gameStatus: string | null;
  onBallDrawn?: (ball: any) => void;
  drawIntervalMs?: number;
}

export interface UseBingoClientDaemonReturn {
  isDrawing: boolean;
  lastError: string | null;
  ballsDrawnCount: number;
  forceStartDraw: () => Promise<{ success: boolean; message?: string }>;
  drawSingleBall: () => Promise<{ success: boolean; ball?: number; message?: string }>;
}

export const useBingoClientDaemon = ({
  sessionId,
  isHost,
  gameStatus,
  onBallDrawn,
  drawIntervalMs = 3000,
}: UseBingoClientDaemonProps): UseBingoClientDaemonReturn => {
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [ballsDrawnCount, setBallsDrawnCount] = useState<number>(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isExecutingRef = useRef<boolean>(false);
  const onBallDrawnRef = useRef(onBallDrawn);

  // Mantener la referencia del callback actualizada
  useEffect(() => {
    onBallDrawnRef.current = onBallDrawn;
  }, [onBallDrawn]);

  // Función para forzar el inicio del sorteo
  const forceStartDraw = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!sessionId) {
      return { success: false, message: 'No hay sesión de juego activa.' };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, message: 'Cliente de base de datos no inicializado.' };
    }

    try {
      const { data, error } = await supabase.rpc('force_start_bingo_draw', {
        p_session_id: sessionId,
      });

      if (error) {
        console.warn('[BINGO_DAEMON] Error al forzar inicio:', error.message);
        setLastError(error.message);
        return { success: false, message: error.message };
      }

      if (data?.success) {
        setLastError(null);
        console.log('[BINGO_DAEMON] Sorteo forzado con éxito:', data.message);
        return { success: true, message: data.message };
      }

      setLastError(data?.message || 'No se pudo iniciar el sorteo.');
      return { success: false, message: data?.message || 'Error desconocido al iniciar sorteo.' };
    } catch (err: any) {
      console.error('[BINGO_DAEMON] Excepción en forceStartDraw:', err);
      const msg = err?.message || 'Excepción al conectar con el servidor.';
      setLastError(msg);
      return { success: false, message: msg };
    }
  }, [sessionId]);

  // Función para extraer una sola balota de forma manual o programada
  const drawSingleBall = useCallback(async (): Promise<{ success: boolean; ball?: number; message?: string }> => {
    if (!sessionId || isExecutingRef.current) {
      return { success: false, message: 'Extracción en progreso o sin sesión.' };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, message: 'Cliente de base de datos no disponible.' };
    }

    isExecutingRef.current = true;
    setIsDrawing(true);

    try {
      const { data, error } = await supabase.rpc('draw_next_bingo_ball_client', {
        p_session_id: sessionId,
      });

      if (error) {
        console.warn('[BINGO_DAEMON] Error al extraer bola:', error.message);
        setLastError(error.message);
        return { success: false, message: error.message };
      }

      if (data?.success) {
        setLastError(null);
        const ballNum = Number(data.ball_number || data.ball);
        setBallsDrawnCount((prev) => prev + 1);
        console.log('[BINGO_DAEMON] ✓ Balota extraída:', ballNum);

        if (onBallDrawnRef.current && ballNum) {
          onBallDrawnRef.current(ballNum);
        }

        if (data.game_over || data.status === 'FINISHED' || data.reason === 'BINGO_COMPLETE') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }

        return { success: true, ball: ballNum };
      }

      if (data?.game_over) {
        console.log('[BINGO_DAEMON] Juego finalizado:', data.message);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return { success: false, message: data.message };
      }

      if (data?.reason === 'TOO_FAST') {
        // Enfriamiento normal de 2 segundos entre balotas
        return { success: false, message: 'Enfriamiento activo.' };
      }

      setLastError(data?.message || 'No se pudo extraer la balota.');
      return { success: false, message: data?.message };
    } catch (err: any) {
      console.error('[BINGO_DAEMON] Excepción en drawSingleBall:', err);
      const msg = err?.message || 'Excepción al extraer balota.';
      setLastError(msg);
      return { success: false, message: msg };
    } finally {
      isExecutingRef.current = false;
      setIsDrawing(false);
    }
  }, [sessionId]);

  // Bucle del daemon: se activa únicamente si el usuario es el anfitrión y el estado es DRAWING
  useEffect(() => {
    const normStatus = (gameStatus || '').toUpperCase();
    const isDrawingActive = normStatus === 'DRAWING';

    // Limpiar intervalo previo si no se cumplen las condiciones
    if (!isHost || !sessionId || !isDrawingActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    console.log('[BINGO_DAEMON] Activando bucle de extracción automática cada', drawIntervalMs, 'ms');

    // Primera extracción tras un breve retardo para asegurar estabilidad de conexión
    const initialTimer = setTimeout(() => {
      drawSingleBall();
    }, 1000);

    // Bucle recurrente cada N milisegundos (mínimo 2.5s para respetar rate limit de DB)
    const effectiveInterval = Math.max(2500, drawIntervalMs);
    intervalRef.current = setInterval(() => {
      drawSingleBall();
    }, effectiveInterval);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, isHost, gameStatus, drawIntervalMs, drawSingleBall]);

  return {
    isDrawing,
    lastError,
    ballsDrawnCount,
    forceStartDraw,
    drawSingleBall,
  };
};
