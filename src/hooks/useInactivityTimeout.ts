import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutos
const WARNING_BEFORE_MS = 60 * 1000; // 1 minuto antes (14 min)

export function useInactivityTimeout() {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);
  const lastActivityRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
      setSecondsRemaining(60);
    }
  }, [showWarning]);

  useEffect(() => {
    if (!user) {
      setShowWarning(false);
      return;
    }

    const handleUserInteraction = () => {
      resetActivity();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleUserInteraction, { passive: true }));

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remainingTotal = INACTIVITY_LIMIT_MS - elapsed;

      if (remainingTotal <= 0) {
        // Cerrar sesión inmediatamente por seguridad
        setShowWarning(false);
        signOut();
      } else if (remainingTotal <= WARNING_BEFORE_MS) {
        setShowWarning(true);
        setSecondsRemaining(Math.ceil(remainingTotal / 1000));
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserInteraction));
      clearInterval(checkInterval);
    };
  }, [user, resetActivity, signOut]);

  const keepSessionAlive = () => {
    resetActivity();
    setShowWarning(false);
  };

  return {
    showWarning,
    secondsRemaining,
    keepSessionAlive,
  };
}
