// ==============================================================================
// RASPANDO LA OLLA — HOOK DE CONEXIÓN ONLINE EN TIEMPO REAL: ATRAPAITO CRIOLLO
// ==============================================================================
// Patrón: "Estado Remoto con Reflejo Local"
// Supabase es la única fuente de verdad autoritativa; el Canvas dibuja lo que la DB dicta.
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
  onReconnect?: () => void; // Callback opcional al recuperar conexión
}

export const useAtrapaitoOnline = ({
  sessionId,
  userId,
  playerColor,
  onStateUpdate,
  onTurnTimeout,
  onGameEnd,
  onReconnect,
}: UseAtrapaitoOnlineProps) => {
  const stateRef = useRef<any>(null);
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false);

  // Obtener cliente Supabase disponible
  const getClient = useCallback(() => {
    return getSupabaseClient() || defaultSupabase;
  }, []);

  // 1. TEMPORIZADOR DE TURNO (SERVER-AUTHORITATIVE)
  const updateTurnTimer = useCallback((expiresAtStr?: string) => {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    if (!expiresAtStr) {
      setTimeLeft(0);
      return;
    }

    const expiresAt = new Date(expiresAtStr).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const remainingMs = expiresAt - now;
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(remainingSecs);

      if (remainingSecs <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        onTurnTimeout();
      }
    };

    updateCountdown();
    countdownIntervalRef.current = setInterval(updateCountdown, 500);

    const initialRemaining = expiresAt - Date.now();
    if (initialRemaining > 0) {
      turnTimerRef.current = setTimeout(() => {
        setTimeLeft(0);
        onTurnTimeout();
      }, initialRemaining);
    }
  }, [onTurnTimeout]);

  // 2. CARGAR ESTADO INICIAL DESDE SUPABASE
  const loadInitialState = useCallback(async () => {
    if (!sessionId || !userId) return;
    const client = getClient();
    if (!client) return;

    try {
      // 1. Intentar función RPC dedicada get_atrapaito_state
      const { data: rpcData, error: rpcError } = await client.rpc('get_atrapaito_state', {
        p_session_id: sessionId,
        p_user_id: userId,
      });

      if (!rpcError && rpcData?.success && rpcData.state) {
        const loaded = {
          ...rpcData.state,
          turn_expires_at: rpcData.turnExpiresAt || rpcData.state.turn_expires_at,
          current_turn_user_id: rpcData.currentTurnUserId || rpcData.state.current_turn_user_id,
          status: rpcData.status || rpcData.state.status,
          winner_user_id: rpcData.winner_user_id || rpcData.state.winner_user_id,
        };

        stateRef.current = loaded;
        onStateUpdate(loaded);

        const myTurn =
          loaded.current_turn_user_id === userId ||
          loaded.turn === playerColor;
        setIsMyTurn(Boolean(myTurn));

        if (loaded.turn_expires_at) {
          updateTurnTimer(loaded.turn_expires_at);
        }

        if (loaded.status === 'FINISHED' || loaded.status === 'completed' || loaded.winner) {
          onGameEnd(loaded.winner_user_id || loaded.winner);
        }
        return;
      }
    } catch (err) {
      console.warn('[useAtrapaitoOnline] get_atrapaito_state RPC failed, fallback a select directo:', err);
    }

    // 2. Fallback: consulta directa a game_sessions
    try {
      const { data, error } = await client
        .from('game_sessions')
        .select('current_state, turn_expires_at, current_turn_user_id, status, winner_user_id')
        .eq('id', sessionId)
        .single();

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

        const myTurn =
          loadedState.current_turn_user_id === userId ||
          loadedState.turn === playerColor;
        setIsMyTurn(Boolean(myTurn));

        if (loadedState.turn_expires_at) {
          updateTurnTimer(loadedState.turn_expires_at);
        }

        if (
          loadedState.status === 'FINISHED' ||
          loadedState.status === 'ABANDONED' ||
          loadedState.status === 'completed' ||
          loadedState.winner
        ) {
          onGameEnd(loadedState.winner_user_id || loadedState.winner);
        }
      }
    } catch (dbErr) {
      console.error('[useAtrapaitoOnline] Error al cargar estado inicial de sesión:', dbErr);
    }
  }, [sessionId, userId, playerColor, getClient, onStateUpdate, onGameEnd, updateTurnTimer]);

  // 3. SUSCRIPCIÓN EN TIEMPO REAL
  useEffect(() => {
    if (!sessionId || !userId) return;
    const client = getClient();
    if (!client) return;

    let isMounted = true;

    // Suscripción al canal Realtime
    const channel = client
      .channel(`atrapaito_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload: any) => {
          if (!isMounted) return;
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

          const myTurn =
            newState.current_turn_user_id === userId ||
            newState.turn === playerColor;
          setIsMyTurn(Boolean(myTurn));

          if (newState.turn_expires_at) {
            updateTurnTimer(newState.turn_expires_at);
          }

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
      .on('system' as any, { event: 'connected' }, () => {
        if (!isMounted) return;
        setIsConnected(true);
        if (onReconnect) onReconnect();
      })
      .on('system' as any, { event: 'disconnected' }, () => {
        if (!isMounted) return;
        setIsConnected(false);
      })
      .subscribe((status: string) => {
        if (!isMounted) return;
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          loadInitialState();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setIsConnected(false);
        }
      });

    return () => {
      isMounted = false;
      client.removeChannel(channel);
      if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [sessionId, userId, playerColor, getClient, loadInitialState, onStateUpdate, onGameEnd, onReconnect, updateTurnTimer]);

  // 4. ENVIAR MOVIMIENTO DE CANICA
  // Soporta ambas firmas: submitMove(col, row) o submitMove('MOVE_MARBLE' | 'PLACE_WALL', data)
  const submitMove = useCallback(
    async (
      colOrAction: number | 'MOVE_MARBLE' | 'PLACE_WALL',
      rowOrData?: number | any
    ) => {
      if (!sessionId || !userId) return { success: false, error: 'NO_SESSION' };
      const client = getClient();
      if (!client) return { success: false, error: 'NO_CLIENT' };

      let actionType: 'MOVE_MARBLE' | 'PLACE_WALL' = 'MOVE_MARBLE';
      let data: any = {};

      if (typeof colOrAction === 'number') {
        actionType = 'MOVE_MARBLE';
        data = { col: colOrAction, row: rowOrData as number };
      } else {
        actionType = colOrAction;
        data = rowOrData;
      }

      const curr = stateRef.current;
      const myTurn =
        !curr ||
        curr.current_turn_user_id === userId ||
        curr.turn === playerColor;

      if (!myTurn) {
        console.warn('[useAtrapaitoOnline] No es tu turno para jugar.');
        return { success: false, error: 'NOT_YOUR_TURN' };
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

      // 1. Invocar RPC dedicada submit_atrapaito_action
      try {
        const { data: rpcRes, error: rpcErr } = await client.rpc('submit_atrapaito_action', {
          p_session_id: sessionId,
          p_user_id: userId,
          p_action_type: actionType,
          p_action_data: data,
        });

        if (!rpcErr && rpcRes?.success) {
          stateRef.current = nextState;
          onStateUpdate(nextState);
          return rpcRes;
        }
      } catch (err) {
        console.warn('[useAtrapaitoOnline] submit_atrapaito_action RPC error:', err);
      }

      // 2. Fallback: intentar submit_atrapaito_action_secure
      try {
        const { error: secErr } = await client.rpc('submit_atrapaito_action_secure', {
          p_session_id: sessionId,
          p_user_id: userId,
          p_action_type: actionType,
          p_action_data: data,
        });

        if (!secErr) {
          stateRef.current = nextState;
          onStateUpdate(nextState);
          return { success: true };
        }
      } catch (err) {
        console.warn('[useAtrapaitoOnline] submit_atrapaito_action_secure error:', err);
      }

      // 3. Fallback: sincronización directa a base de datos
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
        return { success: true };
      } catch (dbErr: any) {
        console.error('[useAtrapaitoOnline] Error al sincronizar jugada con Supabase:', dbErr);
        return { success: false, error: dbErr?.message || 'DB_ERROR' };
      }
    },
    [sessionId, userId, playerColor, getClient, onStateUpdate]
  );

  // 5. COLOCAR MURO DIRECTO
  const submitWall = useCallback(
    async (wallData: any) => {
      return submitMove('PLACE_WALL', wallData);
    },
    [submitMove]
  );

  // 6. ABANDONAR LA PARTIDA (Voluntario)
  const abandonGame = useCallback(async () => {
    if (!sessionId) return { success: false, error: 'NO_SESSION' };
    const client = getClient();
    if (!client) return { success: false, error: 'NO_CLIENT' };

    try {
      // 1. Ejecutar RPC universal abandon_game_secure
      const { data: univRes, error: univErr } = await client.rpc('abandon_game_secure', {
        p_session_id: sessionId,
      });

      if (!univErr && univRes?.success) {
        return univRes;
      }

      // 2. Ejecutar RPC específica abandon_atrapaito_game
      const { data: abRes, error: abErr } = await client.rpc('abandon_atrapaito_game', {
        p_session_id: sessionId,
        p_leaving_user_id: userId,
      });

      if (!abErr) {
        return abRes;
      }

      // 3. Fallback: handle_atrapaito_abandon
      const { error: rpcErr } = await client.rpc('handle_atrapaito_abandon', {
        p_session_id: sessionId,
        p_leaving_user_id: userId,
      });

      if (!rpcErr) {
        return { success: true };
      }

      // 4. Fallback: abandon_game_table_secure con table_id
      const { data: sessData } = await client
        .from('game_sessions')
        .select('table_id')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessData?.table_id) {
        await client.rpc('abandon_game_table_secure', {
          p_table_id: sessData.table_id,
          p_session_id: sessionId,
          p_idempotency_key: `abn_atrapaito_${sessionId}_${Date.now()}`,
        });
      }
      return { success: true };
    } catch (err: any) {
      console.error('[useAtrapaitoOnline] Error al procesar abandono:', err);
      return { success: false, error: err?.message };
    }
  }, [sessionId, userId, getClient]);

  return {
    submitMove,
    submitWall,
    abandonGame,
    isConnected,
    timeLeft,
    secondsLeft: timeLeft,
    isMyTurn,
    currentState: stateRef.current,
  };
};
