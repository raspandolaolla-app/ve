// ==============================================================================
// RASPANDO LA OLLA — HOOK DE CONEXIÓN ONLINE EN TIEMPO REAL: ATRAPAITO CRIOLLO
// ==============================================================================
// Patrón: "Estado Remoto con Reflejo Local"
// Supabase es la única fuente de verdad; el Canvas dibuja lo que la DB dicta.
// Incluye suscripción Realtime, temporizador de 15 segundos y gestión de abandono.
// ==============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSupabaseClient, supabase as defaultSupabase } from '../lib/supabase/client';

export interface UseAtrapaitoOnlineProps {
  sessionId: string | null;
  userId: string | null;
  playerColor: 'BLUE' | 'RED'; // El color asignado al unirse a la mesa
  onStateUpdate: (state: any) => void; // Callback para actualizar el Canvas
  onTurnTimeout: () => void; // Callback cuando se acaba el tiempo
  onGameEnd: (winner: string | null) => void; // Callback cuando alguien gana o abandona
}

export const useAtrapaitoOnline = ({
  sessionId,
  userId,
  playerColor,
  onStateUpdate,
  onTurnTimeout,
  onGameEnd,
}: UseAtrapaitoOnlineProps) => {
  const stateRef = useRef<any>(null);
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(15);
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);

  // Obtener cliente Supabase disponible
  const getClient = useCallback(() => {
    return getSupabaseClient() || defaultSupabase;
  }, []);

  // 1. ESCUCHAR EL ESTADO DEL SERVIDOR EN TIEMPO REAL
  useEffect(() => {
    if (!sessionId) return;
    const client = getClient();
    if (!client) return;

    // Cargar estado inicial desde Supabase
    client
      .from('game_sessions')
      .select('current_state, turn_expires_at, current_turn_user_id, status, winner_user_id')
      .eq('id', sessionId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          const loadedState = {
            ...data.current_state,
            turn_expires_at: data.turn_expires_at || data.current_state?.turn_expires_at,
            current_turn_user_id: data.current_turn_user_id || data.current_state?.current_turn_user_id,
            status: data.status || data.current_state?.status,
            winner_user_id: data.winner_user_id,
          };
          stateRef.current = loadedState;
          onStateUpdate(loadedState);

          if (loadedState.status === 'FINISHED' || loadedState.status === 'ABANDONED' || loadedState.status === 'completed') {
            onGameEnd(loadedState.winner_user_id || loadedState.winner);
          }
        }
      });

    // Suscripción al canal Realtime
    const channel = client
      .channel(`atrapaito_session_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload: any) => {
          const newRow = payload.new;
          if (!newRow) return;

          const newState = {
            ...newRow.current_state,
            turn_expires_at: newRow.turn_expires_at || newRow.current_state?.turn_expires_at,
            current_turn_user_id: newRow.current_turn_user_id || newRow.current_state?.current_turn_user_id,
            status: newRow.status || newRow.current_state?.status,
            winner_user_id: newRow.winner_user_id,
          };

          stateRef.current = newState;
          onStateUpdate(newState);

          // Manejar fin de juego por victoria o abandono
          if (
            newState.status === 'FINISHED' ||
            newState.status === 'ABANDONED' ||
            newState.status === 'completed' ||
            newState.winner
          ) {
            onGameEnd(newState.winner_user_id || newState.winner);
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [sessionId, getClient, onStateUpdate, onGameEnd]);

  // 2. TEMPORIZADOR DE 15 SEGUNDOS (SERVER-AUTHORITATIVE)
  useEffect(() => {
    const currentState = stateRef.current;
    if (!currentState?.turn_expires_at) return;

    const myTurn =
      currentState.current_turn_user_id === userId ||
      currentState.turn === playerColor;

    setIsMyTurn(Boolean(myTurn));

    if (myTurn) {
      const expiresAt = new Date(currentState.turn_expires_at).getTime();

      const updateCountdown = () => {
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((expiresAt - now) / 1000));
        setSecondsLeft(diff);

        if (diff <= 0) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          onTurnTimeout();
        }
      };

      updateCountdown();
      countdownIntervalRef.current = setInterval(updateCountdown, 500);

      const timeLeft = expiresAt - Date.now();
      if (timeLeft <= 0) {
        onTurnTimeout();
      } else {
        turnTimerRef.current = setTimeout(() => {
          onTurnTimeout();
        }, timeLeft);
      }
    } else {
      setSecondsLeft(15);
    }

    return () => {
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [stateRef.current?.turn_expires_at, stateRef.current?.turn, stateRef.current?.current_turn_user_id, userId, playerColor, onTurnTimeout]);

  // 3. ENVIAR JUGADAS AL SERVIDOR
  const submitMove = useCallback(
    async (actionType: 'MOVE_MARBLE' | 'PLACE_WALL', data: any) => {
      if (!sessionId || !userId) return;
      const client = getClient();
      if (!client) return;

      const curr = stateRef.current;
      const myTurn =
        !curr ||
        curr.current_turn_user_id === userId ||
        curr.turn === playerColor;

      if (!myTurn) {
        console.warn('[useAtrapaitoOnline] No es tu turno para jugar.');
        return;
      }

      // Preparar estado anticipado para reflejo local
      const nextTurn = playerColor === 'BLUE' ? 'RED' : 'BLUE';
      const expiresAt = new Date(Date.now() + 15000).toISOString();

      let nextState = {
        ...(curr || {}),
        turn: nextTurn,
        turn_expires_at: expiresAt,
      };

      if (actionType === 'MOVE_MARBLE') {
        if (playerColor === 'BLUE') {
          nextState.bluePos = { col: data.col, row: data.row };
        } else {
          nextState.redPos = { col: data.col, row: data.row };
        }
        if (data.row === 0) {
          nextState.winner = playerColor;
          nextState.status = 'FINISHED';
        }
      } else if (actionType === 'PLACE_WALL') {
        const walls = [...(curr?.walls || [])];
        walls.push({
          col: data.col,
          row: data.row,
          isHorizontal: data.isHorizontal,
          placedBy: playerColor,
        });
        nextState.walls = walls;
        if (playerColor === 'BLUE') {
          nextState.blueWalls = Math.max(0, (curr?.blueWalls ?? 10) - 1);
        } else {
          nextState.redWalls = Math.max(0, (curr?.redWalls ?? 10) - 1);
        }
      }

      // 1. Invocar RPC segura especializada
      try {
        const { error: rpcErr } = await client.rpc('submit_atrapaito_action_secure', {
          p_session_id: sessionId,
          p_user_id: userId,
          p_action_type: actionType,
          p_action_data: data,
        });

        if (!rpcErr) {
          stateRef.current = nextState;
          onStateUpdate(nextState);
          return;
        }

        // 2. Intentar submit_game_action_secure general
        const { error: generalErr } = await client.rpc('submit_game_action_secure', {
          p_session_id: sessionId,
          p_user_id: userId,
          p_action_type: actionType,
          p_action_data: data,
        });

        if (!generalErr) {
          stateRef.current = nextState;
          onStateUpdate(nextState);
          return;
        }
      } catch (err) {
        console.warn('[useAtrapaitoOnline] RPC error, aplicando sincronización directa:', err);
      }

      // 3. Fallback de sincronización directa a base de datos
      try {
        await client
          .from('game_sessions')
          .update({
            current_state: nextState,
            turn_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId);

        stateRef.current = nextState;
        onStateUpdate(nextState);
      } catch (dbErr) {
        console.error('[useAtrapaitoOnline] Error al sincronizar jugada con Supabase:', dbErr);
      }
    },
    [sessionId, userId, playerColor, getClient, onStateUpdate]
  );

  // 4. ABANDONAR LA PARTIDA (Voluntario)
  const abandonGame = useCallback(async () => {
    if (!sessionId) return;
    const client = getClient();
    if (!client) return;

    try {
      // 1. Ejecutar RPC específica de Atrapaito con liquidación 90/10 al oponente
      const { error: rpcErr } = await client.rpc('handle_atrapaito_abandon', {
        p_session_id: sessionId,
        p_leaving_user_id: userId,
      });

      if (rpcErr) {
        console.warn('[useAtrapaitoOnline] handle_atrapaito_abandon error, intentando RPC general:', rpcErr);
        await client.rpc('abandon_game_table_secure', { p_session_id: sessionId });
      }
    } catch (err) {
      console.error('[useAtrapaitoOnline] Error al procesar abandono:', err);
    }
  }, [sessionId, userId, getClient]);

  return {
    submitMove,
    abandonGame,
    currentState: stateRef.current,
    secondsLeft,
    isMyTurn,
  };
};
