// ==============================================================================
// RASPANDO LA OLLA — CONTENEDOR MAESTRO DE PARTIDA (GAME CONTAINER)
// ==============================================================================
// Orquestación en tiempo real de los 8 motores de juego con liquidación 90/10.
// ==============================================================================

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Users, Shield, Radio, Trophy, AlertTriangle, Wifi, WifiOff, RefreshCw, LogOut } from 'lucide-react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import type { GameSession, GameActionPayload } from '../../../types/games';
import { getGameEngine } from '../engines';
import { GameRepository } from '../../../services/repositories/GameRepository';
import { TableRepository } from '../../../services/repositories/TableRepository';
import { getSupabaseClient } from '../../../lib/supabase/client';
import { formatBolivares, getGameDisplayName } from '../../../utils/formatters';
import { sanitizeUserErrorMessage } from '../../../utils/errorSanitizer';

import { TicTacToeBoard } from './TicTacToeBoard';
import { RockPaperScissorsBoard } from './RockPaperScissorsBoard';
import { CheckersBoard } from './CheckersBoard';
import { DominoBoard } from './DominoBoard';
import { TrucoBoard } from './TrucoBoard';
import { BingoBoard } from './BingoBoard';
import { PollaBoard } from './PollaBoard';
import { AtrapaitoBoard } from './AtrapaitoBoard';
import { SettlementModal } from './SettlementModal';

interface GameContainerProps {
  table: GameTable;
  players: TablePlayer[];
  currentUserId: string;
  onExit: () => void;
}

export const GameContainer: React.FC<GameContainerProps> = ({
  table,
  players: initialPlayers,
  currentUserId,
  onExit,
}) => {
  const [session, setSession] = useState<GameSession | null>(null);
  const [gameState, setGameState] = useState<any>(null);
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
  const isSettledRef = useRef(false);

  // Instancia del motor determinista para este tipo de juego
  const engine = useMemo(() => getGameEngine(table.gameType), [table.gameType]);

  // Recargar dinámicamente los jugadores reales con sus perfiles de Supabase
  const refreshPlayers = useCallback(async () => {
    const updated = await TableRepository.getTablePlayers(table.id);
    if (updated && updated.length > 0) {
      setCurrentPlayers(updated);
    }
  }, [table.id]);

  // Inicialización de la sesión y estado
  useEffect(() => {
    let isMounted = true;

    async function initGame() {
      try {
        setRealtimeStatus('CONNECTING');
        // Limpiar mesas huérfanas en segundo plano
        GameRepository.cleanupOrphanedTables();

        // Asegurar que los perfiles reales de los jugadores estén cargados
        const latestPlayers = await TableRepository.getTablePlayers(table.id);
        const activePlayersList = latestPlayers.length > 0 ? latestPlayers : initialPlayers;
        if (isMounted) {
          setCurrentPlayers(activePlayersList);
        }

        // 1. Obtener o crear sesión en base de datos
        const initialEngineState = engine.initialize(table, activePlayersList);
        const activeSession = await GameRepository.createOrGetSession(
          table.id,
          table.gameType,
          initialEngineState,
          activePlayersList[0]?.userId
        );

        if (!isMounted) return;

        if (activeSession) {
          setSession(activeSession);
          // Si la sesión ya estaba liquidada, preparar modal
          if (activeSession.status === 'completed' || (activeSession.status as any) === 'SETTLED' || activeSession.isSettled) {
            isSettledRef.current = true;
            const winnerPlayer = activePlayersList.find((p) => p.userId === activeSession.winnerUserId);
            const grossPool = table.entryFee * activePlayersList.length;
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
            const grossPool = table.entryFee * activePlayersList.length;
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
          const loadedState: any =
            activeSession.currentState && Object.keys(activeSession.currentState).length > 0
              ? activeSession.currentState
              : initialEngineState;
          
          // Asegurar que playerNames contenga los nombres reales de los perfiles
          const namesMap: Record<string, string> = {};
          activePlayersList.forEach((p, idx) => {
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

          const sanitizedState = engine.getSanitizedStateForPlayer
            ? engine.getSanitizedStateForPlayer(loadedState, currentUserId)
            : loadedState;

          setGameState(sanitizedState);
        } else {
          // Fallback en memoria si la base de datos está en proceso de asignación
          setGameState(initialEngineState);
        }
      } catch (err: any) {
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
        () => {
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
                    turnExpiresAt: updated.turn_deadline_at || prev.turnExpiresAt,
                    currentState: updated.current_state || prev.currentState,
                    status: updated.status || prev.status,
                    winnerUserId: updated.winner_user_id || prev.winnerUserId,
                  }
                : prev
            );
          }

          if (updated?.current_state) {
            const sanitized = engine.getSanitizedStateForPlayer
              ? engine.getSanitizedStateForPlayer(updated.current_state, currentUserId)
              : updated.current_state;
            setGameState(sanitized);
          }

          if (updated?.status === 'SETTLED' && !isSettledRef.current) {
            isSettledRef.current = true;
            const winnerPlayer = currentPlayers.find((p) => p.userId === updated.winner_user_id);
            const grossPool = table.entryFee * currentPlayers.length;
            setSettlementResult({
              grossPool,
              prizePool: grossPool * 0.9,
              platformFee: grossPool * 0.1,
              winnerName: winnerPlayer?.displayName || 'Ganador',
              isWinner: updated.winner_user_id === currentUserId,
              isDraw: false,
            });
          } else if (updated?.status === 'CANCELLED' && !isSettledRef.current) {
            isSettledRef.current = true;
            const grossPool = table.entryFee * currentPlayers.length;
            setSettlementResult({
              grossPool,
              prizePool: 0,
              platformFee: 0,
              winnerName: 'Empate',
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
          if (actionRow && actionRow.user_id !== currentUserId) {
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

  // Manejador central de acciones de juego con anti-double click
  const handleGameAction = useCallback(
    async (actionType: string, actionData: Record<string, unknown>) => {
      if (!gameState || !session || isSubmittingAction) return;

      const payload: GameActionPayload = {
        sessionId: session.id,
        userId: currentUserId,
        actionType,
        actionData,
        clientTimestamp: Date.now(),
      };

      // 1. Validar y procesar con el motor local
      const result = engine.applyAction(gameState, payload);

      if (!result.isValid) {
        setErrorMsg(result.errorMessage || 'Jugada no válida');
        setTimeout(() => setErrorMsg(null), 3000);
        return;
      }

      setIsSubmittingAction(true);

      // 2. Actualizar estado optimista
      const sanitizedNext = engine.getSanitizedStateForPlayer
        ? engine.getSanitizedStateForPlayer(result.newState, currentUserId)
        : result.newState;
      setGameState(sanitizedNext);

      try {
        // 3. Persistir la acción en Supabase (Game Actions)
        await GameRepository.submitAction(payload);

        // 4. Actualizar estado público en Supabase (Game Sessions)
        await GameRepository.updateSessionState(
          session.id,
          result.newState,
          result.newState.turnUserId || null,
          result.isGameOver ? 'FINISHED' : 'ACTIVE',
          result.winnerUserId
        );

        // 5. Liquidación oficial 90/10 en victoria o Reembolso 100% en Empate
        if (result.isGameOver && !isSettledRef.current) {
          isSettledRef.current = true;
          setIsSettling(true);

          if (result.isDraw) {
            // Empate oficial -> Refund RPC
            const idempotencyKey = `refund_${session.id}_${Date.now()}`;
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
            const idempotencyKey = `settle_${session.id}_${Date.now()}`;
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
          <PollaBoard
            state={gameState}
            currentUserId={currentUserId}
            onSubmitPredictions={(predictions) => handleGameAction('SUBMIT_PREDICTIONS', { predictions })}
            onResolveMatches={() => handleGameAction('RESOLVE_MATCHES', {})}
          />
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

  return (
    <div id="game-arena-container" className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Barra de Navegación de la Mesa */}
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-md px-4 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <span>{getGameDisplayName(table.gameType)}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono border border-amber-500/30">
                Mesa #{table.id.substring(0, 6)}
              </span>
            </h1>
            <div className="flex items-center space-x-3 text-xs text-neutral-400 font-mono mt-0.5">
              <span>Entrada: {formatBolivares(table.entryFee)}</span>
              <span>•</span>
              <span className="text-emerald-400">Pozo: {formatBolivares(table.entryFee * currentPlayers.length)}</span>
            </div>
          </div>
        </div>

        {/* Indicador de Conexión en Vivo y Botón Abandonar */}
        <div className="flex items-center space-x-2">
          {realtimeStatus === 'CONNECTED' ? (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>SALA EN VIVO ({onlineUsers.length || 1}/{currentPlayers.length})</span>
            </div>
          ) : realtimeStatus === 'CONNECTING' ? (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>CONECTANDO...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
              <WifiOff className="w-3.5 h-3.5" />
              <span>RECONECTANDO</span>
            </div>
          )}

          <button
            id="abandon-table-btn"
            onClick={() => setShowAbandonModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl text-xs font-bold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ABANDONAR MESA</span>
            <span className="sm:hidden">ABANDONAR</span>
          </button>
        </div>
      </header>

      {/* Alerta de Error Temporal */}
      {errorMsg && (
        <div className="bg-red-500/20 border-b border-red-500/40 text-red-300 px-4 py-2 text-xs font-semibold flex items-center justify-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tablero Principal */}
      <main className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        {renderBoard()}
      </main>

      {/* Modal de Liquidación 90/10 o Reembolso */}
      {settlementResult && (
        <SettlementModal
          isOpen={true}
          winnerName={settlementResult.winnerName}
          isWinner={settlementResult.isWinner}
          isDraw={settlementResult.isDraw}
          grossPool={settlementResult.grossPool}
          prizePool={settlementResult.prizePool}
          platformFee={settlementResult.platformFee}
          onReturnToLobby={onExit}
        />
      )}

      {/* Modal de Confirmación de Abandono de Mesa */}
      <AnimatePresence>
        {showAbandonModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center space-x-3 text-red-400">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-bold text-white">¿Seguro que deseas abandonar la mesa?</h3>
              </div>

              <p className="text-sm text-neutral-300 leading-relaxed">
                Si abandonas voluntariamente una partida activa, perderás tu participación y el premio correspondiente será asignado al jugador que permanece en la partida, según las reglas de abandono.
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
                      <span>ABANDONAR</span>
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
