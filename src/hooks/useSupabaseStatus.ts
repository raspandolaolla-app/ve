// ==============================================================================
// RASPANDO LA OLLA — HOOK DE ESTADO DEL SERVIDOR SUPABASE
// ==============================================================================

import { useState, useEffect } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase/client';

export type BackendConnectionStatus = 'CONNECTED' | 'NOT_CONFIGURED' | 'CONNECTING' | 'ERROR';

export function useSupabaseStatus() {
  const [status, setStatus] = useState<BackendConnectionStatus>(
    isSupabaseConfigured ? 'CONNECTING' : 'NOT_CONFIGURED'
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus('NOT_CONFIGURED');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('NOT_CONFIGURED');
      return;
    }

    // Comprobación de estado sin inventar datos
    supabase.auth.getSession()
      .then(({ error }) => {
        if (error) {
          setStatus('ERROR');
        } else {
          setStatus('CONNECTED');
        }
      })
      .catch(() => {
        setStatus('ERROR');
      });
  }, []);

  return {
    status,
    isConfigured: isSupabaseConfigured,
  };
}
