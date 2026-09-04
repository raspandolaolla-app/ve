import { useCallback, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase/client';

export interface UseGameAbandonmentOptions {
  tableId?: string | null;
  onAbandonSuccess?: () => void;
}

export const useGameAbandonment = (
  sessionId: string | null,
  options?: UseGameAbandonmentOptions | (() => void)
) => {
  const [isAbandoning, setIsAbandoning] = useState(false);

  // Normalizar opciones (acepta callback directo o objeto con opciones)
  const onAbandonSuccess = typeof options === 'function' ? options : options?.onAbandonSuccess;
  const tableId = typeof options === 'object' ? options?.tableId : null;

  const abandonGame = useCallback(async (): Promise<boolean> => {
    if (!sessionId && !tableId) return false;

    // Advertencia clara para el usuario
    const confirmed = window.confirm(
      '⚠️ ¿Estás seguro de que quieres abandonar?\n\nPerderás tu entrada y la victoria será otorgada a tu oponente.'
    );
    if (!confirmed) {
      return false;
    }

    setIsAbandoning(true);
    const client = getSupabaseClient();
    if (!client) {
      alert('No se pudo conectar al servidor. Verifica tu conexión.');
      setIsAbandoning(false);
      return false;
    }

    try {
      let succeeded = false;

      // 1. Intentar RPC universal por session_id
      if (sessionId) {
        const { data, error } = await client.rpc('abandon_game_secure', {
          p_session_id: sessionId,
        });

        if (!error && data?.success) {
          succeeded = true;
        } else if (error) {
          console.warn('[useGameAbandonment] Error en abandon_game_secure, intentando fallback:', error.message);
        }
      }

      // 2. Fallback: intentar por mesa con abandon_game_table_secure
      if (!succeeded && tableId) {
        const { data: tableData, error: tableError } = await client.rpc('abandon_game_table_secure', {
          p_table_id: tableId,
          p_session_id: sessionId || null,
        });

        if (!tableError && (tableData?.success || tableData?.already_left)) {
          succeeded = true;
        }
      }

      if (succeeded) {
        if (onAbandonSuccess) {
          onAbandonSuccess();
        }
        return true;
      } else {
        alert('No se pudo procesar el abandono. Por favor intenta nuevamente.');
        return false;
      }
    } catch (err: any) {
      console.error('[useGameAbandonment] Excepción al abandonar:', err);
      alert('Ocurrió un error inesperado al intentar salir: ' + (err?.message || 'Error de red'));
      return false;
    } finally {
      setIsAbandoning(false);
    }
  }, [sessionId, tableId, onAbandonSuccess]);

  return { abandonGame, isAbandoning };
};

export default useGameAbandonment;
