// ==============================================================================
// RASPANDO LA OLLA — CONTENEDOR MAESTRO DE PARTIDA (GAME CONTAINER)
// ==============================================================================
// Orquestación en tiempo real de los 8 motores de juego con liquidación 90/10.
// ==============================================================================

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Users,
  Shield,
  Radio,
  Trophy,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Clock,
  Maximize2,
  Minimize2,
  Expand,
  Shrink,
  ShieldCheck,
} from 'lucide-react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import type { GameSession, GameActionPayload } from '../../../types/games';
import { getGameEngine } from '../engines';
import { GameRepository } from '../../../services/repositories/GameRepository';
import { RngService } from '../../../services/rng/RngService';
import { TableRepository } from '../../../services/repositories/TableRepository';
import { getSupabaseClient } from '../../../lib/supabase/client';
import { formatBolivares, getGameDisplayName } from '../../../utils/formatters';
import { sanitizeUserErrorMessage } from '../../../utils/errorSanitizer';
import { normalizeGameStateByType, inspectDominoDeck } from '../utils/gameStateGuard';

import { TicTacToeBoard } from './TicTacToeBoard';
import { RockPaperScissorsBoard } from './RockPaperScissorsBoard';
import { CheckersBoard } from './CheckersBoard';
import { DominoBoard } from './DominoBoard';
import { TrucoBoard } from './TrucoBoard';
import { BingoBoard } from './BingoBoard';
import { PollaBoard } from './PollaBoard';
import { AtrapaitoBoard } from './AtrapaitoBoard';
import { UnaOllaGame } from './UnaOllaGame';
import { ChessBoard } from './ChessBoard';
import { SettlementModal } from './SettlementModal';

interface GameContainerProps {
  table: GameTable;
  players: TablePlayer[];
  currentUserId: string;
  onExit: () => void;
  onPlayAgain?: () => void;
}

export const GameContainer: React.FC<GameContainerProps> = ({
  table,
  players: initialPlayers,
  currentUserId,
  onExit,
  onPlayAgain,
}) => {
  const [session, setSession] = useState<GameSession | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [showResults, setShowResults] = useState(true);
  const [currentPlayers, setCurrentPlayers] = useState<TablePlayer[]>(initialPlayers);
  const [isSettling, setIsSettling] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING');
  const [settlementResult, setSettlementResult] = useState<{
    grossPool: number;
    prizePool: number;
    platformFee: number;
    winnerName: string;
    isWinner: boolean;
    isDraw?: boolean;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [botNotice, setBotNotice] = useState<string | null>(null);
  const [abandonNotice, setAbandonNotice] = useState<string | null>(null);
  const [isImmersiveMode, setIsImmersiveMode] = useState<boolean>(true);
  const [isFullscreenNative, setIsFullscreenNative] = useState<boolean>(false);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const isSettledRef = useRef(false);

  // Detección de orientación y soporte Fullscreen API
  useEffect(() => {
    const handleResizeOrOrientation = () => {
      const isLand = window.innerWidth > window.innerHeight && window.innerWidth < 1024;
      setIsLandscape(isLand);
      setIsFullscreenNative(Boolean(document.fullscreenElement));
    };

    handleResizeOrOrientation();
    window.addEventListener('resize', handleResizeOrOrientation);
    window.addEventListener('orientationchange', handleResizeOrOrientation);
    document.addEventListener('fullscreenchange', handleResizeOrOrientation);

    return () => {
      window.removeEventListener('resize', handleResizeOrOrientation);
      window.removeEventListener('orientationchange', handleResizeOrOrientation);
      document.removeEventListener('fullscreenchange', handleResizeOrOrientation);
    };
  }, []);

  // Función para alternar Fullscreen API del navegador
  const toggleNativeFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document.exitFullscreen as any).webkitExitFullscreen) {
          await (document.exitFullscreen as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('[GameContainer] Fullscreen API no disponible o bloqueada:', err);
    }
  };

  // Instancia del motor determinista para este tipo de juego
  const engine = useMemo(() => {
    try {
      return getGameEngine(table.gameType);
    } catch (err) {
      console.error('[GameContainer] Error al instanciar el motor de juego:', err);
      return null;
    }
  }, [table.gameType]);

  // Recargar dinámicamente los jugadores reales con sus perfiles de Supabase
  const refreshPlayers = useCallback(async () => {
    const updated = await TableRepository.getTablePlayers(table.id);
    if (updated && updated.length > 0) {
      const unique = Array.from(new Map(updated.map((p) => [p.userId, p])).values());
      setCurrentPlayers(unique);
    }
  }, [table.id]);

  // Inicialización de la sesión y estado
  useEffect(() => {
    let isMounted = true;

    async function initGame() {
      try {
        setRealtimeStatus('CONNECTING');

        // Asegurar que los perfiles reales de los jugadores estén cargados y deduplicados
        const latestPlayers = await TableRepository.getTablePlayers(table.id);
        const rawPlayersList = latestPlayers.length > 0 ? latestPlayers : initialPlayers;

        // FASE 2: Validación obligatoria de jugadores únicos
        const uniquePlayers = Array.from(
          new Map(
            rawPlayersList.map((player) => [
              (player as any).user_id || player.userId,
              player,
            ])
          ).values()
        );

        if (rawPlayersList.length !== uniquePlayers.length) {
          console.error('[GameContainer] Error: Asientos duplicados detectados en la mesa.');
          setErrorMsg('Un jugador no puede ocupar dos puestos en la misma mesa');
          setRealtimeStatus('DISCONNECTED');
          return;
        }

        if (isMounted) {
          setCurrentPlayers(uniquePlayers);
        }

        // 1. Obtener o crear sesión en base de datos con jugadores deduplicados
        const initialEngineState = engine.initialize(table, uniquePlayers);
        const canonicalInitialTurnId =
          (initialEngineState as any)?.turnUserId ||
          (initialEngineState as any)?.currentTurnUserId ||
          (initialEngineState as any)?.playerWhiteUserId ||
          uniquePlayers[0]?.userId;

        const isPractice = Boolean(table.config?.isPractice) || table.id.startsWith('practice_') || table.entryFee === 0;

        let activeSession: GameSession | null = null;
        if (isPractice) {
          activeSession = {
            id: table.id,
            tableId: table.id,
            gameType: table.gameType,
            roundNumber: 1,
            currentTurnUserId: canonicalInitialTurnId,
            status: 'in_progress',
            grossPool: 0,
            winnerPrizeAmount: 0,
            serviceFeeAmount: 0,
            isSettled: false,
            currentState: initialEngineState,
          };
        } else {
          activeSession = await GameRepository.createOrGetSession(
            table.id,
            table.gameType,
            initialEngineState,
            canonicalInitialTurnId
          );
        }

        console.log('[DEBUG_GAME] uniquePlayers:', uniquePlayers);
        console.log('[DEBUG_GAME] initialEngineState:', initialEngineState);
        console.log('[DEBUG_GAME] activeSession:', activeSession);

        if (!isMounted) return;

        if (activeSession) {
          setSession(activeSession);
          // Si la sesión ya estaba liquidada, preparar modal
          if (activeSession.status === 'completed' || (activeSession.status as any) === 'SETTLED' || activeSession.isSettled) {
            isSettledRef.current = true;
            const winnerPlayer = uniquePlayers.find((p) => p.userId === activeSession.winnerUserId);
            const grossPool = table.entryFee * uniquePlayers.length;
            setSettlementResult({
              grossPool,
              prizePool: grossPool * 0.9,
              platformFee: grossPool * 0.1,
              winnerName: winnerPlayer?.displayName || 'Ganador',
              isWinner: activeSession.winnerUserId === currentUserId,
              isDraw: false,
            });
          } else if (activeSession.status === 'abandoned' || (activeSession.status as any) === 'CANCELLED') {
            isSettledRef.current = true;
            const grossPool = table.entryFee * uniquePlayers.length;
            setSettlementResult({
              grossPool,
              prizePool: 0,
              platformFee: 0,
              winnerName: 'Empate',
              isWinner: false,
              isDraw: true,
            });
          }

          // Si la sesión ya tenía un estado guardado, usarlo; de lo contrario el inicial
          const rawLoadedState: any =
            activeSession.currentState && Object.keys(activeSession.currentState).length > 0
              ? activeSession.currentState
              : initialEngineState;

          // Normalizar estado estrictamente por tipo de juego
          const normalized = normalizeGameStateByType(
            table.gameType,
            rawLoadedState,
            initialEngineState,
            uniquePlayers
          );

          if (!normalized.isValid) {
            console.warn('[GAME_STATE_ERROR]', {
              gameType: table.gameType,
              sessionId: activeSession.id,
              tableId: table.id,
              userId: currentUserId,
              missingProperties: normalized.missingProps,
            });
          }

          const loadedState = normalized.state;
          
          // Asegurar que playerNames contenga los nombres reales de los perfiles
          const namesMap: Record<string, string> = {};
          uniquePlayers.forEach((p) => {
            if (p.displayName && p.displayName.trim().length > 0) {
              namesMap[p.userId] = p.displayName.trim();
            }
          });

          if (loadedState && loadedState.playerNames) {
            loadedState.playerNames = {
              ...loadedState.playerNames,
              ...namesMap,
            };
          }

          // Obtener turno canónico unificado garantizando coincidencia con DB
          const canonicalTurnUserId =
            activeSession.currentTurnUserId ||
            loadedState.currentTurnUserId ||
            loadedState.turnUserId ||
            canonicalInitialTurnId;

          loadedState.turnUserId = canonicalTurnUserId;
          loadedState.currentTurnUserId = canonicalTurnUserId;

          // Determinar si la sesión en base de datos necesita hidratación inicial (únicamente si faltan propiedades)
          const isDbStateIncomplete =
            !activeSession.currentState ||
            Object.keys(activeSession.currentState).length === 0 ||
            normalized.missingProps.length > 0;

          const turnDuration = table.gameType === 'chess' ? 15 : (loadedState.turnDurationSeconds || 30);
          let updatedSession: GameSession = {
            ...activeSession,
            currentTurnUserId: canonicalTurnUserId,
            currentState: loadedState,
          };

          if (isDbStateIncomplete && activeSession.status !== 'completed' && (activeSession.status as any) !== 'SETTLED') {
            console.warn('[GameContainer] Sesión con estado incompleto, invocando reparación autoritativa...');
            const repairResult = await GameRepository.repairInitialSessionState(
              activeSession.id,
              loadedState,
              canonicalTurnUserId,
              turnDuration
            );
            if (repairResult.repaired) {
              updatedSession.turnExpiresAt = new Date(Date.now() + turnDuration * 1000).toISOString();
            }
          }

          // Validación específica y diagnóstico exhaustivo de Dominó Venezolano
          if (table.gameType === 'domino_venezolano') {
            const dominoAudit = inspectDominoDeck(loadedState, uniquePlayers);
            console.log('[DOMINO_RNP_DEBUG]', {
              sessionId: activeSession.id,
              playerOrder: loadedState.playerOrder || uniquePlayers.map((p) => p.userId),
              hands: loadedState.hands,
              tileCount: dominoAudit.tileCount,
              invalidTiles: dominoAudit.invalidTiles,
              duplicateTiles: dominoAudit.duplicateTiles,
              emptyHandsUsers: dominoAudit.emptyHandsUsers,
              errors: dominoAudit.errors,
            });

            if (!dominoAudit.isValid) {
              console.error('[DOMINO_INVALID_DECK]', {
                sessionId: activeSession.id,
                audit: dominoAudit,
              });
              setErrorMsg(`DOMINO_INVALID_DECK: Se detectaron fichas inválidas (${dominoAudit.errors.join(', ')}).`);
              return;
            }
          }

          setSession(updatedSession);

          // Logs de transición Server-Authoritative
          console.log('[GAME_START]', {
            sessionId: activeSession.id,
            tableId: table.id,
            gameType: table.gameType,
          });
          console.log('[GAME_STATE_READY]', {
            sessionId: activeSession.id,
            gameType: table.gameType,
            stateValid: normalized.isValid,
            missingProps: normalized.missingProps,
          });
          console.log('[TURN_ASSIGNED]', {
            sessionId: activeSession.id,
            currentTurnUserId: canonicalTurnUserId,
          });
          console.log('[TURN_DEADLINE]', {
            sessionId: activeSession.id,
            turnDeadlineAt: updatedSession.turnExpiresAt,
          });
          console.log('[GAME_ACTIVE]', {
            sessionId: activeSession.id,
            gameType: table.gameType,
            stateValid: normalized.isValid,
            currentTurnUserId: canonicalTurnUserId,
            turnDeadlineAt: updatedSession.turnExpiresAt,
          });

          const sanitizedState = engine.getSanitizedStateForPlayer
            ? engine.getSanitizedStateForPlayer(loadedState, currentUserId)
            : loadedState;

          console.log('[DEBUG_GAME] Sanitized Game State for Player:', sanitizedState);
          setGameState(sanitizedState);
        } else {
          // CASO C: La base de datos no tiene una sesión activa (esperando al anfitrión o error de RPC)
          console.warn('[GameContainer] No hay sesión activa en el servidor para la mesa:', table.id);
          setSession(null);
          setGameState(null);
          setErrorMsg('Esperando que el anfitrión inicie la partida o sincronizando con el servidor...');
        }
      } catch (err: any) {
        console.error('[DEBUG_GAME] Error inside initGame:', err);
        console.error('[GameContainer] Error inicializando partida:', err);
        setErrorMsg(err?.message || 'Error al conectar con la sala de juego');
      }
    }

    initGame();

    return () => {
      isMounted = false;
    };
  }, [table, initialPlayers, engine, currentUserId]);

  // Suscripción Realtime a cambios en game_table_players (Nombres, Entradas y Abandonos)
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const playersChannel = supabase
      .channel(`table_players_realtime_${table.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_table_players',
          filter: `table_id=eq.${table.id}`,
        },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow && newRow.status === 'LEFT') {
            const playerLeft = currentPlayers.find((p) => p.userId === newRow.user_id);
            const playerName = playerLeft?.displayName || 'Un jugador';
            if (newRow.user_id !== currentUserId) {
              setAbandonNotice(`⚠️ ${playerName} abandonó la partida.`);
              setTimeout(() => setAbandonNotice(null), 6000);
            }
          }
          refreshPlayers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playersChannel);
    };
  }, [table.id, refreshPlayers]);

  // Suscripción Realtime a cambios en la sesión de juego y presencia
  useEffect(() => {
    if (!session?.id) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase.channel(`game_session_${session.id}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const activeIds = Object.keys(state);
        setOnlineUsers(activeIds);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineUsers((prev) => Array.from(new Set([...prev, key])));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUsers((prev) => prev.filter((id) => id !== key));
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (updated) {
            setSession((prev) =>
              prev
                ? {
                    ...prev,
                    currentTurnUserId: updated.current_turn_user_id || prev.currentTurnUserId,
                    turnExpiresAt: updated.turn_deadline_at || prev.turnExpiresAt,
                    currentState: updated.current_state || prev.currentState,
                    status: updated.status || prev.status,
                    winnerUserId: updated.winner_user_id || prev.winnerUserId,
                  }
                : prev
            );
          }

          if (updated?.current_state) {
            const normalized = normalizeGameStateByType(
              table.gameType,
              updated.current_state,
              gameState,
              currentPlayers
            );
            const canonicalTurn = updated.current_turn_user_id || (normalized.state as any)?.currentTurnUserId || (normalized.state as any)?.turnUserId;
            if (canonicalTurn) {
              (normalized.state as any).currentTurnUserId = canonicalTurn;
              (normalized.state as any).turnUserId = canonicalTurn;
            }
            const sanitized = engine.getSanitizedStateForPlayer
              ? engine.getSanitizedStateForPlayer(normalized.state, currentUserId)
              : normalized.state;
            setGameState(sanitized);
          }

          if (updated?.status === 'SETTLED' && !isSettledRef.current) {
            isSettledRef.current = true;
            const winnerPlayer = currentPlayers.find((p) => p.userId === updated.winner_user_id);
            const isWinner = updated.winner_user_id === currentUserId;
            const winnerDisplayName = isWinner ? '¡Tú obtuviste la victoria!' : winnerPlayer?.displayName || 'Ganador';
            const grossPool = table.entryFee * (currentPlayers.length || 2);

            setSettlementResult({
              grossPool,
              prizePool: grossPool * 0.9,
              platformFee: grossPool * 0.1,
              winnerName: winnerDisplayName,
              isWinner,
              isDraw: false,
            });

            if (isWinner) {
              setAbandonNotice(`🏆 ¡Victoria declarada! Premio 90/10 acreditado.`);
            }
          } else if (updated?.status === 'CANCELLED' && !isSettledRef.current) {
            isSettledRef.current = true;
            const grossPool = table.entryFee * (currentPlayers.length || 2);
            setSettlementResult({
              grossPool,
              prizePool: 0,
              platformFee: 0,
              winnerName: 'Empate / Reembolso',
              isWinner: false,
              isDraw: true,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_actions',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const actionRow = payload.new as any;
          if (actionRow) {
            if (actionRow.action_type === 'BOT_MOVE' || actionRow.payload?.executedByBot) {
              setBotNotice('⏱️ Turno expirado - BOT realizó movimiento automático');
              setTimeout(() => setBotNotice(null), 5000);
            }
            if (actionRow.user_id !== currentUserId) {
              // Aplicar la acción recibida del oponente a través del motor
              setGameState((prev: any) => {
                if (!prev) return prev;
                const actionPayload: GameActionPayload = {
                  sessionId: session.id,
                  userId: actionRow.user_id,
                  actionType: actionRow.action_type,
                  actionData: actionRow.payload || {},
                  clientTimestamp: Date.now(),
                };
                const result = engine.applyAction(prev, actionPayload);
                if (result.isValid) {
                  return engine.getSanitizedStateForPlayer
                    ? engine.getSanitizedStateForPlayer(result.newState, currentUserId)
                    : result.newState;
                }
                return prev;
              });
            }
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('CONNECTED');
          await channel.track({
            userId: currentUserId,
            onlineAt: new Date().toISOString(),
          });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeStatus('DISCONNECTED');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id, currentUserId, engine, currentPlayers, table]);

  // Suscripción Realtime para detectar cuando el anfitrión crea/inicia la sesión en la mesa
  useEffect(() => {
    if (session?.id) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const tableSessionChannel = supabase
      .channel(`table_sessions_${table.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `table_id=eq.${table.id}`,
        },
        async (payload) => {
          const newOrUpdated = payload.new as any;
          if (
            newOrUpdated &&
            (newOrUpdated.status === 'ACTIVE' ||
              newOrUpdated.status === 'IN_PROGRESS' ||
              newOrUpdated.status === 'READY')
          ) {
            const activeSess = await GameRepository.getActiveSession(table.id);
            if (activeSess) {
              setSession(activeSess);
              const initialEngineState = engine.initialize(table, currentPlayers);
              const rawState =
                activeSess.currentState && Object.keys(activeSess.currentState).length > 0
                  ? activeSess.currentState
                  : initialEngineState;
              const normalized = normalizeGameStateByType(
                table.gameType,
                rawState,
                initialEngineState,
                currentPlayers
              );
              const canonicalTurn =
                activeSess.currentTurnUserId ||
                (normalized.state as any)?.currentTurnUserId ||
                (normalized.state as any)?.turnUserId;
              if (canonicalTurn) {
                (normalized.state as any).currentTurnUserId = canonicalTurn;
                (normalized.state as any).turnUserId = canonicalTurn;
              }
              const sanitized = engine.getSanitizedStateForPlayer
                ? engine.getSanitizedStateForPlayer(normalized.state, currentUserId)
                : normalized.state;
              setGameState(sanitized);
              setErrorMsg(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tableSessionChannel);
    };
  }, [session?.id, table, engine, currentPlayers, currentUserId]);

  // Ejecución automática de turnos para Bots en Modo Práctica
  useEffect(() => {
    const isPractice = Boolean(table.config?.isPractice) || table.id.startsWith('practice_') || table.entryFee === 0;
    if (!isPractice || !gameState || isSettledRef.current) return;

    const turnUser = (gameState as any)?.currentTurnUserId || (gameState as any)?.turnUserId || (gameState as any)?.activePlayerUserId;
    if (!turnUser || turnUser === currentUserId) return;

    const botTimer = setTimeout(() => {
      if (engine.getBotMove) {
        const botAction = engine.getBotMove(gameState, turnUser);
        if (botAction) {
          const result = engine.applyAction(gameState, botAction);
          if (result.isValid) {
            const sanitizedNext = engine.getSanitizedStateForPlayer
              ? engine.getSanitizedStateForPlayer(result.newState, currentUserId)
              : result.newState;
            setGameState(sanitizedNext);

            if (result.isGameOver && !isSettledRef.current) {
              isSettledRef.current = true;
              const winnerPlayer = currentPlayers.find((p) => p.userId === result.winnerUserId);
              setSettlementResult({
                grossPool: 0,
                prizePool: 0,
                platformFee: 0,
                winnerName: result.isDraw
                  ? 'Empate'
                  : (result.winnerUserId === currentUserId ? '¡Tú Ganaste!' : (winnerPlayer?.displayName || 'Bot Ganador')),
                isWinner: result.winnerUserId === currentUserId,
                isDraw: Boolean(result.isDraw),
              });
            }
          }
        }
      }
    }, 850);

    return () => clearTimeout(botTimer);
  }, [table, gameState, currentUserId, engine, currentPlayers]);

  // Procesar abandono de mesa confirmado
  const handleConfirmAbandon = async () => {
    if (isAbandoning) return;
    setIsAbandoning(true);

    try {
      const result = await TableRepository.abandonTable(table.id, session?.id);
      setShowAbandonModal(false);
      onExit();
    } catch (err: any) {
      console.error('[GameContainer] Error al abandonar mesa:', err);
      setErrorMsg('No se pudo procesar el abandono de la mesa');
    } finally {
      setIsAbandoning(false);
    }
  };

  // Manejador central de acciones de juego con anti-double click y Server-Authoritative RNG
  const handleGameAction = useCallback(
    async (actionType: string, actionData: Record<string, unknown>) => {
      if (!gameState || !session || isSubmittingAction) return;

      const finalActionData = { ...actionData };

      // Si la acción requiere aleatoriedad (RNG), obtener resultado autoritativo de Supabase con pgcrypto
      if (actionType === 'ROLL_DICE' && !finalActionData.diceValue) {
        const rngRes = await RngService.rollDiceSecure(session.id);
        if (rngRes.success) {
          finalActionData.diceValue = rngRes.diceValue;
          finalActionData.rngEventId = rngRes.eventId;
          finalActionData.commitmentHash = rngRes.commitmentHash;
        }
      } else if (actionType === 'DRAW_BALL' && !finalActionData.ball) {
        const rngRes = await RngService.drawBingoBallSecure(session.id);
        if (rngRes.success && rngRes.ball) {
          finalActionData.ball = rngRes.ball;
          finalActionData.rngEventId = rngRes.eventId;
          finalActionData.commitmentHash = rngRes.commitmentHash;
        }
      }

      const payload: GameActionPayload = {
        sessionId: session.id,
        userId: currentUserId,
        actionType,
        actionData: finalActionData,
        clientTimestamp: Date.now(),
      };

      // 1. Validar y procesar con el motor local
      const result = engine.applyAction(gameState, payload);

      if (!result.isValid) {
        setErrorMsg(result.errorMessage || 'Jugada no válida');
        setTimeout(() => setErrorMsg(null), 3000);
        return;
      }

      console.log('[FIRST_MOVE]', {
        sessionId: session.id,
        userId: currentUserId,
        actionType,
        actionData: finalActionData,
        isValid: true,
      });

      setIsSubmittingAction(true);

      // 2. Actualizar estado optimista
      const sanitizedNext = engine.getSanitizedStateForPlayer
        ? engine.getSanitizedStateForPlayer(result.newState, currentUserId)
        : result.newState;
      setGameState(sanitizedNext);

      // Si es Modo Práctica, resolver localmente sin invocar Supabase ni ledger
      const isPractice = Boolean(table.config?.isPractice) || table.id.startsWith('practice_') || table.entryFee === 0;
      if (isPractice) {
        if (result.isGameOver && !isSettledRef.current) {
          isSettledRef.current = true;
          const winnerPlayer = currentPlayers.find((p) => p.userId === result.winnerUserId);
          setSettlementResult({
            grossPool: 0,
            prizePool: 0,
            platformFee: 0,
            winnerName: result.isDraw
              ? 'Empate'
              : (result.winnerUserId === currentUserId ? '¡Tú Ganaste!' : (winnerPlayer?.displayName || 'Bot Ganador')),
            isWinner: result.winnerUserId === currentUserId,
            isDraw: Boolean(result.isDraw),
          });
        }
        setIsSubmittingAction(false);
        return;
      }

      try {
        // 3. Persistir la acción en Supabase (Game Actions)
        await GameRepository.submitAction(payload);

        const nextTurnUserId = (result.newState as any)?.currentTurnUserId || (result.newState as any)?.turnUserId || null;
        const turnDuration = table.gameType === 'chess' ? 15 : ((result.newState as any)?.turnDurationSeconds || 10);

        console.log('[TURN_CHANGED]', {
          sessionId: session.id,
          previousTurnUserId: (gameState as any)?.currentTurnUserId || (gameState as any)?.turnUserId,
          nextTurnUserId,
          isGameOver: Boolean(result.isGameOver),
          winnerUserId: result.winnerUserId || null,
        });

        // 4. Actualizar estado público en Supabase (Game Sessions)
        await GameRepository.updateSessionState(
          session.id,
          result.newState,
          nextTurnUserId,
          result.isGameOver ? 'FINISHED' : 'ACTIVE',
          result.winnerUserId,
          turnDuration
        );

        // 5. Liquidación oficial 90/10 en victoria o Reembolso 100% en Empate
        if (result.isGameOver && !isSettledRef.current) {
          isSettledRef.current = true;
          setIsSettling(true);

          if (result.isDraw) {
            // Empate oficial -> Refund RPC
            const idempotencyKey = `refund_${session.id}`;
            await GameRepository.refundSession(
              session.id,
              'Empate oficial en partida',
              idempotencyKey
            );
            setIsSettling(false);

            const grossPool = table.entryFee * currentPlayers.length;
            setSettlementResult({
              grossPool,
              prizePool: 0,
              platformFee: 0,
              winnerName: 'Empate Técnico',
              isWinner: false,
              isDraw: true,
            });
          } else if (result.winnerUserId) {
            // Victoria oficial -> Settle RPC
            const idempotencyKey = `settle_${session.id}_${result.winnerUserId}`;
            const settlement = await GameRepository.settleSession(
              session.id,
              [result.winnerUserId],
              result.winnerTeamIndex,
              idempotencyKey
            );

            setIsSettling(false);

            const winnerPlayer = currentPlayers.find((p) => p.userId === result.winnerUserId);
            const winnerName = winnerPlayer?.displayName || 'Ganador';

            setSettlementResult({
              grossPool: settlement.grossPool || table.entryFee * currentPlayers.length,
              prizePool: settlement.prizePool || table.entryFee * currentPlayers.length * 0.9,
              platformFee: settlement.platformFee || table.entryFee * currentPlayers.length * 0.1,
              winnerName,
              isWinner: result.winnerUserId === currentUserId,
              isDraw: false,
            });
          }
        }
      } catch (err: any) {
        console.error('[GameContainer] Error ejecutando acción:', err);
        setErrorMsg(sanitizeUserErrorMessage(err, 'No fue posible registrar la jugada. La partida permanece protegida.'));
        setTimeout(() => setErrorMsg(null), 3500);
      } finally {
        setIsSubmittingAction(false);
      }
    },
    [gameState, session, currentUserId, engine, currentPlayers, table, isSubmittingAction]
  );

  // Renderizar el tablero específico según el juego
  const renderBoard = () => {
    if (!gameState) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-neutral-400 font-mono text-sm">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span>Sincronizando estado de la partida...</span>
        </div>
      );
    }

    switch (table.gameType) {
      case 'tic_tac_toe':
        return (
          <TicTacToeBoard
            state={gameState}
            currentUserId={currentUserId}
            turnExpiresAt={session?.turnExpiresAt}
            sessionId={session?.id}
            onPlaceSymbol={(cellIndex) => handleGameAction('PLACE_SYMBOL', { cellIndex })}
            onNextRound={() => handleGameAction('NEXT_ROUND', {})}
          />
        );

      case 'rock_paper_scissors':
        return (
          <RockPaperScissorsBoard
            state={gameState}
            currentUserId={currentUserId}
            onSubmitChoice={(choice) => handleGameAction('SUBMIT_CHOICE', { choice })}
            onNextRound={() => handleGameAction('NEXT_ROUND', {})}
          />
        );

      case 'checkers':
        return (
          <CheckersBoard
            state={gameState}
            currentUserId={currentUserId}
            turnExpiresAt={session?.turnExpiresAt}
            sessionId={session?.id}
            onMovePiece={(move) => handleGameAction('MOVE_PIECE', { move })}
          />
        );

      case 'domino_venezolano':
        return (
          <DominoBoard
            state={gameState}
            currentUserId={currentUserId}
            turnExpiresAt={session?.turnExpiresAt}
            sessionId={session?.id}
            onPlayTile={(tile, side) => handleGameAction('PLAY_TILE', { tile, side })}
            onPassTurn={() => handleGameAction('PASS_TURN', {})}
          />
        );

      case 'truco_venezolano':
        return (
          <TrucoBoard
            state={gameState}
            currentUserId={currentUserId}
            onPlayCard={(cardId) => handleGameAction('PLAY_CARD', { cardId })}
            onCanto={(cantoType) => handleGameAction('CANTO', { cantoType })}
          />
        );

      case 'bingo':
        return (
          <BingoBoard
            state={gameState}
            currentUserId={currentUserId}
            onMarkNumber={(row, col) => handleGameAction('MARK_NUMBER', { row, col })}
            onClaimBingo={() => handleGameAction('CLAIM_BINGO', {})}
            onDrawBall={() => handleGameAction('DRAW_BALL', {})}
          />
        );

      case 'polla_venezolana':
        return (
          <PollaBoard />
        );

      case 'atrapaito':
        return (
          <AtrapaitoBoard
            state={gameState}
            currentUserId={currentUserId}
            turnExpiresAt={session?.turnExpiresAt}
            sessionId={session?.id}
            onRollDice={() => handleGameAction('ROLL_DICE', {})}
            onMovePiece={(pieceId) => handleGameAction('MOVE_PIECE', { pieceId })}
            players={currentPlayers}
          />
        );

      case 'una_olla':
        return (
          <UnaOllaGame
            table={table}
            players={currentPlayers}
            currentUserId={currentUserId}
            onLeave={onExit}
          />
        );

      case 'chess':
        return (
          <ChessBoard
            state={gameState}
            currentUserId={currentUserId}
            turnExpiresAt={session?.turnExpiresAt}
            sessionId={session?.id}
            players={currentPlayers}
            onMovePiece={(from, to, promotion) =>
              handleGameAction('MOVE', { from, to, promotion })
            }
            onResign={() => handleGameAction('RESIGN', {})}
            onOfferDraw={() => handleGameAction('OFFER_DRAW', {})}
            onAcceptDraw={() => handleGameAction('ACCEPT_DRAW', {})}
            onTimeout={() => handleGameAction('TIMEOUT', {})}
          />
        );

      default:
        return (
          <div className="p-8 text-center text-neutral-400">
            Juego no implementado: {table.gameType}
          </div>
        );
    }
  };

  const containerClasses = isImmersiveMode
    ? 'fixed inset-0 z-40 bg-neutral-950 text-neutral-100 flex flex-col w-screen h-screen overflow-hidden select-none'
    : 'min-h-screen bg-neutral-950 text-neutral-100 flex flex-col rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl';

  return (
    <div id="game-arena-container" className={containerClasses}>
      {/* Barra de Navegación de la Mesa */}
      <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur-md px-2.5 sm:px-4 py-2 sm:py-2.5 sticky top-0 z-30 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <button
            onClick={onExit}
            className="p-1.5 sm:p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors shrink-0 touch-manipulation"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-1.5 truncate">
              <span className="truncate">{getGameDisplayName(table.gameType)}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono border border-amber-500/30 shrink-0">
                #{table.id.substring(0, 6)}
              </span>
            </h1>
            <div className="flex items-center space-x-2 text-[10px] sm:text-xs text-neutral-400 font-mono mt-0.5">
              <span>Entrada: {formatBolivares(table.entryFee)}</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold">Pozo: {formatBolivares(table.entryFee * currentPlayers.length)}</span>
            </div>
          </div>
        </div>

        {/* Indicadores de Conexión, Fullscreen y Abandono */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          {realtimeStatus === 'CONNECTED' ? (
            <div className="flex items-center space-x-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] sm:text-xs font-mono">
              <Radio className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-pulse shrink-0" />
              <span className="hidden xs:inline sm:inline">EN VIVO ({onlineUsers.length || 1}/{currentPlayers.length})</span>
              <span className="xs:hidden sm:hidden">VIVO</span>
            </div>
          ) : realtimeStatus === 'CONNECTING' ? (
            <div className="flex items-center space-x-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] sm:text-xs font-mono">
              <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin shrink-0" />
              <span>CONECTANDO</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] sm:text-xs font-mono">
              <WifiOff className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span>RECONECTANDO</span>
            </div>
          )}

          {/* Botón de Pantalla Completa Nativa */}
          <button
            id="fullscreen-toggle-btn"
            onClick={toggleNativeFullscreen}
            className="p-1.5 sm:p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors shrink-0 touch-manipulation"
            title={isFullscreenNative ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreenNative ? (
              <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            )}
          </button>

          {/* Botón Alternar Modo Inmersivo */}
          <button
            id="immersive-toggle-btn"
            onClick={() => setIsImmersiveMode(!isImmersiveMode)}
            className="p-1.5 sm:p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors shrink-0 touch-manipulation hidden xs:flex items-center"
            title={isImmersiveMode ? 'Minimizar a vista regular' : 'Modo Inmersivo'}
          >
            {isImmersiveMode ? (
              <Shrink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            ) : (
              <Expand className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            )}
          </button>

          <button
            id="abandon-table-btn"
            onClick={() => setShowAbandonModal(true)}
            className="flex items-center space-x-1 px-2 py-1 sm:px-3 sm:py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl text-[10px] sm:text-xs font-bold transition-all touch-manipulation"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ABANDONAR MESA</span>
            <span className="sm:hidden">SALIR</span>
          </button>
        </div>
      </header>

      {/* Alerta de Abandono de Jugador */}
      {abandonNotice && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-200 px-4 py-2 text-xs font-bold flex items-center justify-center space-x-2 animate-in slide-in-from-top">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{abandonNotice}</span>
        </div>
      )}

      {/* Alerta de Error Temporal */}
      {errorMsg && (
        <div className="bg-red-500/20 border-b border-red-500/40 text-red-300 px-4 py-2 text-xs font-semibold flex items-center justify-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Alerta de Movimiento Bot por Inactividad */}
      {botNotice && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 px-4 py-2 text-xs font-bold flex items-center justify-center space-x-2 animate-pulse">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>{botNotice}</span>
        </div>
      )}

      {/* Tablero Principal */}
      <main
        className={`flex-1 flex items-center justify-center overflow-y-auto ${
          isLandscape ? 'p-1 sm:p-2 max-h-[calc(100vh-48px)]' : 'p-2 sm:p-4'
        }`}
      >
        <div className="w-full h-full flex items-center justify-center max-w-5xl mx-auto">
          {renderBoard()}
        </div>
      </main>

      {/* Modal de Liquidación 90/10 o Reembolso */}
      {settlementResult && (
        <SettlementModal
          isOpen={showResults}
          winnerName={settlementResult.winnerName}
          isWinner={settlementResult.isWinner}
          isDraw={settlementResult.isDraw}
          grossPool={settlementResult.grossPool}
          prizePool={settlementResult.prizePool}
          platformFee={settlementResult.platformFee}
          onReturnToLobby={onExit}
          onPlayAgain={onPlayAgain}
          onBackToTable={() => setShowResults(false)}
          gameType={table.gameType}
          scoreSummary={(() => {
            if (table.gameType === 'tic_tac_toe' && gameState?.scores) {
              const pIds = Object.keys(gameState.playerSymbols || {});
              if (pIds.length >= 2) {
                const name1 = (gameState.playerNames?.[pIds[0]] || 'X').toUpperCase();
                const score1 = gameState.scores[pIds[0]] || 0;
                const name2 = (gameState.playerNames?.[pIds[1]] || 'O').toUpperCase();
                const score2 = gameState.scores[pIds[1]] || 0;
                return `Marcador Final: ${name1} [${score1}] - [${score2}] ${name2}`;
              }
            }
            return undefined;
          })()}
        />
      )}

      {/* Botón flotante para reabrir resultados */}
      {settlementResult && !showResults && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            onClick={() => setShowResults(true)}
            className="flex items-center space-x-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-2xl transition-all border border-amber-400/40 animate-pulse uppercase tracking-wider"
          >
            <Trophy className="w-4 h-4" />
            <span>Ver Resultados</span>
          </button>
        </div>
      )}

      {/* Modal de Confirmación de Abandono de Mesa */}
      <AnimatePresence>
        {showAbandonModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center space-x-3 text-red-400">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-base sm:text-lg font-bold text-white">¿Está seguro que desea abandonar?</h3>
              </div>

              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                Si abandonas voluntariamente una partida activa, perderás tu participación y el premio será asignado automáticamente al jugador que permanezca en la mesa, según las reglas de abandono.
              </p>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  id="cancel-abandon-btn"
                  onClick={() => setShowAbandonModal(false)}
                  disabled={isAbandoning}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors"
                >
                  CANCELAR
                </button>
                <button
                  id="confirm-abandon-btn"
                  onClick={handleConfirmAbandon}
                  disabled={isAbandoning}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-lg shadow-red-900/30"
                >
                  {isAbandoning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>PROCESANDO...</span>
                    </>
                  ) : (
                    <>
                      <LogOut className="w-3.5 h-3.5" />
                      <span>CONFIRMAR ABANDONO</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
