import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { AdminRepository } from '../services/repositories/AdminRepository';

const HEARTBEAT_INTERVAL_MS = 25 * 1000; // 25 segundos para alta fidelidad de presencia global

export function useHeartbeat() {
  const { user, state } = useAuth();
  const lastHeartbeatRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = useCallback(async (activityType: string = 'PAGE_ACTIVE', force: boolean = false) => {
    if (!user || state !== 'authenticated') return;

    const now = Date.now();
    // Throttle de 10s salvo que sea forzado (ej. al enfocar pestaña o reconectar internet)
    if (!force && now - lastHeartbeatRef.current < 10000) return;

    lastHeartbeatRef.current = now;
    await AdminRepository.recordHeartbeat(activityType);
  }, [user, state]);

  useEffect(() => {
    if (!user || state !== 'authenticated') return;

    // Heartbeat inicial al cargar / autenticar
    sendHeartbeat('PAGE_LOAD', true);

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
      if (now - lastHeartbeatRef.current >= 20000) {
        sendHeartbeat('USER_INTERACTION');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat('TAB_FOCUSED', true);
      }
    };

    const handleNetworkOnline = () => {
      sendHeartbeat('NETWORK_RECONNECTED', true);
    };

    window.addEventListener('click', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('online', handleNetworkOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('online', handleNetworkOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, state, sendHeartbeat]);

  return {
    triggerHeartbeat: sendHeartbeat,
  };
}
