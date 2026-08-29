import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { AdminRepository } from '../services/repositories/AdminRepository';

const HEARTBEAT_INTERVAL_MS = 45 * 1000; // 45 segundos

export function useHeartbeat() {
  const { user, state } = useAuth();
  const lastHeartbeatRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(async (activityType: string = 'PAGE_ACTIVE') => {
    if (!user || state !== 'authenticated') return;

    const now = Date.now();
    // Throttle de al menos 15s entre llamadas
    if (now - lastHeartbeatRef.current < 15000) return;

    lastHeartbeatRef.current = now;
    await AdminRepository.recordHeartbeat(activityType);
  }, [user, state]);

  useEffect(() => {
    if (!user || state !== 'authenticated') return;

    // Heartbeat inicial al cargar / autenticar
    sendHeartbeat('PAGE_LOAD');

    // Intervalo periódico
    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat('PERIODIC_ACTIVE');
      } else {
        sendHeartbeat('BACKGROUND_IDLE');
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Eventos de interacción del usuario
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastHeartbeatRef.current >= 30000) {
        sendHeartbeat('USER_INTERACTION');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat('TAB_FOCUSED');
      }
    };

    window.addEventListener('click', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, state, sendHeartbeat]);

  return {
    triggerHeartbeat: sendHeartbeat,
  };
}
