import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos de inactividad activa
const WARNING_BEFORE_MS = 60 * 1000; // 1 minuto antes de advertencia (29 min)

export function useInactivityTimeout() {
  const { user, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);
  const lastActivityRef = useRef<number>(Date.now());
  const showWarningRef = useRef<boolean>(false);

  // Sincronizar ref de advertencia activa
  showWarningRef.current = showWarning;

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarningRef.current) {
      setShowWarning(false);
      setSecondsRemaining(60);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setShowWarning(false);
      return;
    }

    // Resetear marca de tiempo inmediatamente al detectar usuario activo
    lastActivityRef.current = Date.now();

    const handleUserInteraction = () => {
      resetActivity();
    };

    const handleVisibilityOrFocus = () => {
      // Cuando la pestaña recupera foco o se hace visible, resetear actividad para evitar logout al regresar
      if (document.visibilityState === 'visible') {
        resetActivity();
      }
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach((evt) => window.addEventListener(evt, handleUserInteraction, { passive: true }));
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    const checkInterval = setInterval(() => {
      // Si la pestaña está en segundo plano, mantenemos el reloj actualizado para no desloguear al cambiar de pestaña
      if (document.visibilityState !== 'visible') {
        lastActivityRef.current = Date.now();
        return;
      }

      const elapsed = Date.now() - lastActivityRef.current;
      const remainingTotal = INACTIVITY_LIMIT_MS - elapsed;

      if (remainingTotal <= 0) {
        console.log('[AUTH] Inactividad prolongada alcanzada en pestaña activa (30 min). Cerrando sesión.');
        setShowWarning(false);
        signOut();
      } else if (remainingTotal <= WARNING_BEFORE_MS) {
        setShowWarning(true);
        setSecondsRemaining(Math.ceil(remainingTotal / 1000));
      } else {
        if (showWarningRef.current) {
          setShowWarning(false);
        }
      }
    }, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserInteraction));
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
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

