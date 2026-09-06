import { useState, useEffect, useCallback } from 'react';
import type { GameTable } from '../../../types/tables';
import type { GameSession } from '../../../types/games';
import { TableRepository } from '../../../services/repositories/TableRepository';
import { getSupabaseClient } from '../../../lib/supabase/client';

interface UseGameAbandonmentParams {
  table: GameTable;
  session: GameSession | null;
  onExit: () => void;
  onError?: (msg: string) => void;
}

export function useGameAbandonment({
  table,
  session,
  onExit,
  onError,
}: UseGameAbandonmentParams) {
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [abandonNotice, setAbandonNotice] = useState<string | null>(null);

  // NOTA CRÍTICA: NO ejecutar abandono de mesa en el cleanup de desmontaje.
  // El desmontaje de componentes puede ocurrir por re-render, recarga accidental,
  // cambio de pestaña o latencia en móvil. El abandono SÓLO debe ejecutarse mediante
  // confirmación explícita del usuario a través de handleConfirmAbandon().

  const handleConfirmAbandon = useCallback(async () => {
    if (isAbandoning) return;
    setIsAbandoning(true);

    try {
      if (session?.id) {
        const client = getSupabaseClient();
        if (client) {
          const { data: univData, error: univErr } = await client.rpc('abandon_game_secure', {
            p_session_id: session.id,
          });
          if (!univErr && univData?.success) {
            setShowAbandonModal(false);
            onExit();
            return;
          }
        }
      }

      await TableRepository.abandonTable(table.id, session?.id);
      setShowAbandonModal(false);
      onExit();
    } catch (err: unknown) {
      console.error('[GameAbandonment] Error al abandonar mesa:', err);
      onError?.('No se pudo procesar el abandono de la mesa');
    } finally {
      setIsAbandoning(false);
    }
  }, [isAbandoning, session?.id, table.id, onExit, onError]);

  return {
    isAbandoning,
    showAbandonModal,
    setShowAbandonModal,
    abandonNotice,
    setAbandonNotice,
    handleConfirmAbandon,
  };
}
