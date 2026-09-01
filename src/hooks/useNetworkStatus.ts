// ==============================================================================
// RASPANDO LA OLLA — HOOK DE ESTADO DE CONECTIVIDAD DE RED
// ==============================================================================

import { useState, useEffect } from 'react';

export type NetworkStatus = 'online' | 'offline';

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online'
  );

  useEffect(() => {
    const handleOnline = () => setStatus('online');
    const handleOffline = () => setStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}
