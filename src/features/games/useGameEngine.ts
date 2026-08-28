// ==============================================================================
// RASPANDO LA OLLA — MOTOR CENTRAL DE JUEGOS Y SINCRONIZACIÓN REALTIME
// ==============================================================================
// Controla turnos, validación de estado, recepción de jugadas, reconexión
// y ejecución de liquidación 90/10 en Supabase.
// ==============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameRepository } from '../../services/repositories/GameRepository';
import { RealtimeManager } from '../../services/realtime/RealtimeManager';
import type { GameTable, TablePlayer } from '../../types/tables';
import type { GameSession, GameType } from '../../types/games';

export interface UseGameEngineOptions {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  initialState?: any;
  onGameOver?: (winnerUserId: string | null, isTie: boolean) => void;
}

export function useGameEngine({
  table,
  players,
  currentUserId,
  initialState = {},
  onGameOver,
}: UseGameEngineOptions) {
  const [session, setSession] = useState<(GameSession & { currentState?: Record<string, unknown> }) | null>(null);
  const [gameState, setGameState] = useState<Record<string, unknown>>(initialState);
  const [currentTurnUserId, setCurrentTurnUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSettling, setIsSettling] = useState(false);
  const [settlementResult, setSettlementResult] = useState<{
    success: boolean;
    prizePool?: number;
    platformFee?: number;
    refunded?: boolean;
    error?: string;
  } | null>(null);

  const seqNumRef = useRef(1);
  const isSettlingRef = useRef(false);

  const isHost = currentUserId === table.hostUserId;
  const isMyTurn = currentTurnUserId === currentUserId;

  // 1. Inicializar o recuperar sesión
  const initSession = useCallback(async () => {
    setLoading(true);
    try {
      const defaultTurnUser = players[0]?.userId || table.hostUserId;
      const active = await GameRepository.getOrCreateSession(
        table.id,
        table.gameType,
        defaultTurnUser,
        initialState
      );

      if (active) {
        setSession(active);
        if (active.currentState && Object.keys(active.currentState).length > 0) {
          setGameState(active.currentState);
        }
        setCurrentTurnUserId(active.currentTurnUserId || defaultTurnUser);

        // Cargar secuencia actual de acciones
        const actions = await GameRepository.getActions(active.id);
        if (actions.length > 0) {
          seqNumRef.current = actions.length + 1;
        }
      }
    } catch (err) {
      console.error('[useGameEngine] Error al inicializar sesión:', err);
    } finally {
      setLoading(false);
    }
  }, [table.id, table.gameType, table.hostUserId, players, initialState]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  // 2. Suscribirse a Realtime
  useEffect(() => {
    if (!session?.id) return;

    const unsubscribe = RealtimeManager.subscribeToGameSession(
      session.id,
      (sessionPayload) => {
        if (sessionPayload.new) {
          const updated = sessionPayload.new;
          setSession((prev) => (prev ? { ...prev, ...updated } : null));
          if (updated.current_state) {
            setGameState(updated.current_state);
          }
          if (updated.current_turn_user_id !== undefined) {
            setCurrentTurnUserId(updated.current_turn_user_id);
          }
          if (updated.status === 'SETTLED' || updated.status === 'CANCELLED') {
            // Partida finalizada
          }
        }
      },
      (actionPayload) => {
        if (actionPayload.new) {
          const action = actionPayload.new;
          seqNumRef.current = Math.max(seqNumRef.current, (action.sequence_number || 0) + 1);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [session?.id]);

  // 3. Finalizar y Liquidar la partida (90% ganador / 10% tesorería o 100% reembolso en empate)
  const settleGame = useCallback(
    async (winnerUserId: string | null, isTie: boolean) => {
      if (!session?.id || isSettlingRef.current) return;
      isSettlingRef.current = true;
      setIsSettling(true);

      const idempotencyKey = `settle_${session.id}_${Date.now()}`;

      try {
        if (isTie || !winnerUserId) {
          // Reembolso 100%
          const result = await GameRepository.refundSession(
            session.id,
            'Empate técnico en la partida',
            idempotencyKey
          );

          setSettlementResult({
            success: result.success,
            refunded: true,
            error: result.error,
          });

          await GameRepository.updateSessionState(
            session.id,
            gameState,
            null,
            'CANCELLED',
            null
          );
        } else {
          // Liquidación 90/10
          const result = await GameRepository.settleSession(
            session.id,
            [winnerUserId],
            null,
            idempotencyKey
          );

          setSettlementResult({
            success: result.success,
            prizePool: result.prizePool,
            platformFee: result.platformFee,
            error: result.error,
          });

          await GameRepository.updateSessionState(
            session.id,
            gameState,
            null,
            'SETTLED',
            winnerUserId
          );
        }

        if (onGameOver) {
          onGameOver(winnerUserId, isTie);
        }
      } catch (err: any) {
        console.error('[useGameEngine] Error en liquidación:', err);
        setSettlementResult({
          success: false,
          error: err.message || 'Error en liquidación',
        });
      } finally {
        setIsSettling(false);
      }
    },
    [session?.id, gameState, onGameOver]
  );

  // 4. Enviar jugada / acción al backend
  const dispatchAction = useCallback(
    async (
      actionType: string,
      actionData: Record<string, unknown>,
      nextState: Record<string, unknown>,
      nextTurnUserId: string | null,
      winnerUserId?: string | null,
      isTie?: boolean
    ) => {
      if (!session?.id || !currentUserId) return false;

      // Actualizar estado local inmediatamente
      setGameState(nextState);
      if (nextTurnUserId !== undefined) {
        setCurrentTurnUserId(nextTurnUserId);
      }

      const seq = seqNumRef.current;
      seqNumRef.current += 1;
      const idempotencyKey = `act_${session.id}_${currentUserId}_seq${seq}_${Date.now()}`;

      // Persistir la acción
      await GameRepository.submitAction({
        sessionId: session.id,
        userId: currentUserId,
        sequenceNumber: seq,
        actionType,
        actionData,
        idempotencyKey,
        clientTimestamp: Date.now(),
      });

      // Persistir el estado sincronizado de la sesión
      const isOver = Boolean(winnerUserId || isTie);
      const sessionStatus = isOver ? 'COMPLETED' : 'IN_PROGRESS';

      await GameRepository.updateSessionState(
        session.id,
        nextState,
        nextTurnUserId,
        sessionStatus,
        winnerUserId || null
      );

      // Si la partida concluyó, liquidar automáticamente
      if (isOver) {
        await settleGame(winnerUserId || null, Boolean(isTie));
      }

      return true;
    },
    [session?.id, currentUserId, settleGame]
  );

  return {
    session,
    gameState,
    setGameState,
    currentTurnUserId,
    isMyTurn,
    isHost,
    loading,
    isSettling,
    settlementResult,
    dispatchAction,
    settleGame,
  };
}
