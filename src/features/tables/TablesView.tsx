// ==============================================================================
// RASPANDO LA OLLA — VISTA DE MESAS Y MODO TRANCAÍTO (INTEGRACIÓN COMPLETA FASE 4)
// ==============================================================================
// Interfaz interactiva conectada a Supabase:
// - Listado de mesas públicas en tiempo real
// - Búsqueda y unión por código privado "Trancaíto"
// - Creación de mesas con validación de parámetros
// - Asignación de asiento y retención de entrada mediante join_table_transaction()
// ==============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type React from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../hooks/useAuth';
import { TableRepository } from '../../services/repositories/TableRepository';
import { GameRepository } from '../../services/repositories/GameRepository';
import { FinancialRepository } from '../../services/repositories/FinancialRepository';
import { RealtimeManager } from '../../services/realtime/RealtimeManager';
import { PresenceService } from '../../services/PresenceService';
import { SUPPORTED_GAMES_METADATA, FINANCIAL_RULES } from '../../utils/constants';
import { formatBolivares, getGameDisplayName } from '../../utils/formatters';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import { useBcvRate } from '../../context/BcvContext';
import type { GameTable, TablePlayer } from '../../types/tables';
import type { GameType, GameMode } from '../../types/games';
import { GameContainer } from '../games/components/GameContainer';
import { GameRulesModal } from '../games/GameRulesModal';
import { getGameEngine } from '../games/engines';
import {
  Lock,
  QrCode,
  Share2,
  PlusCircle,
  ArrowRight,
  ShieldAlert,
  Users,
  Coins,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Play,
  Loader2,
  BookOpen,
  Clock,
  Zap,
  Bot,
  Sparkles,
  Gamepad2,
} from 'lucide-react';
import { MediaBanner } from '../../components/common/MediaBanner';
import { AdPlacementContainer } from '../../components/advertising/AdPlacementContainer';
import { useWallet } from '../../context/WalletContext';
import { CreateBingoTableForm, type CreateBingoTableParams } from './components/CreateBingoTableForm';
import { TableCard } from './components/TableCard';
import { TableList } from './components/TableList';
import { TableFilters } from './components/TableFilters';
import { CreateTableModal } from './components/CreateTableModal';

export function TablesView() {
  const { state, user, profile, isSigningIn, openLoginModal } = useAuth();
  const { balance } = useWallet();
  const userBalance = balance?.availableBalance ?? 0;
  const [selectedGameFilter, setSelectedGameFilter] = useState<GameType | 'all'>('all');
  const [publicTables, setPublicTables] = useState<GameTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Registro de exclusión inmediata de mesas cerradas / en cuarentena para evitar reviviscencia por latencia
  const recentlyClosedTableIds = useRef<Set<string>>(new Set());
  const recentlyClosedTimestamps = useRef<Map<string, number>>(new Map());
  const reconcileTimerRef = useRef<NodeJS.Timeout | null>(null);
  const selectedGameFilterRef = useRef(selectedGameFilter);

  useEffect(() => {
    selectedGameFilterRef.current = selectedGameFilter;
  }, [selectedGameFilter]);

  // Unirse por código
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [searchingCode, setSearchingCode] = useState(false);

  // Mesa activa / Modal de sala de espera
  const [activeTable, setActiveTable] = useState<GameTable | null>(null);
  const [tablePlayers, setTablePlayers] = useState<TablePlayer[]>([]);
  const [joiningSeat, setJoiningSeat] = useState<number | null>(null);
  const [isStartingTable, setIsStartingTable] = useState(false);
  const [seatActionFeedback, setSeatActionFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(PresenceService.getOnlineUserIds());

  useEffect(() => {
    const unsub = PresenceService.subscribeToOnlineUsers((ids) => {
      setOnlineUserIds(ids);
    });
    return () => unsub();
  }, []);

  // Partida en Vivo Activa
  const [inGameData, setInGameData] = useState<{ table: GameTable; players: TablePlayer[] } | null>(null);

  // Modal de Crear Mesa
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createIsPractice, setCreateIsPractice] = useState(false);
  const [createGameType, setCreateGameType] = useState<GameType>('domino_venezolano');
  const [createMode, setCreateMode] = useState<GameMode>('1v1');
  const [createName, setCreateName] = useState('');
  const [createEntryFee, setCreateEntryFee] = useState<number>(50);
  const { formatUsd } = useBcvRate();
  const [createMaxPlayers, setCreateMaxPlayers] = useState<number>(4);
  const [createIsPrivate, setCreateIsPrivate] = useState<boolean>(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [availableFees, setAvailableFees] = useState<number[]>([25, 50, 100, 250, 500, 1000, 2000, 5000]);

  // Modal de Emparejamiento Rápido (Matchmaking)
  const [showMatchmakingModal, setShowMatchmakingModal] = useState(false);
  const [matchmakingGameType, setMatchmakingGameType] = useState<GameType>('domino_venezolano');
  const [matchmakingEntryFee, setMatchmakingEntryFee] = useState<number>(50);
  const [matchmakingMaxPlayers, setMatchmakingMaxPlayers] = useState<number>(2);
  const [matchmakingMode, setMatchmakingMode] = useState<GameMode>('1v1');
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [matchmakingStatusText, setMatchmakingStatusText] = useState('');
  const [matchmakingError, setMatchmakingError] = useState<string | null>(null);

  // Modal de Reglas Oficiales
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesGameId, setRulesGameId] = useState<string>('domino_venezolano');

  // Exponer control del modal de Partida Rápida al padre
  useEffect(() => {
    const handleOpenQuickMatch = () => {
      setShowMatchmakingModal(true);
    };
    window.addEventListener('open-quick-match', handleOpenQuickMatch);
    return () => window.removeEventListener('open-quick-match', handleOpenQuickMatch);
  }, []);

  // Escuchar evento para abrir mesa específica desde el Lobby (Bingo, etc.)
  useEffect(() => {
    const handleOpenTable = async (e: any) => {
      const tableId = e.detail?.tableId;
      if (tableId) {
        const table = await TableRepository.getTableById(tableId);
        if (table) {
          setActiveTable(table);
        }
      }
    };
    window.addEventListener('open-table' as any, handleOpenTable);
    return () => window.removeEventListener('open-table' as any, handleOpenTable);
  }, []);

  // Notificar al padre cuando hay partida activa
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('game-active-change', {
      detail: { isActive: !!activeTable || !!inGameData }
    }));
  }, [activeTable, inGameData]);

  const isAuthenticated = state === 'authenticated' && user !== null;

  // Cargar montos de entrada dinámicos
  useEffect(() => {
    TableRepository.getAvailableEntryFees(createGameType).then((fees) => {
      if (fees && fees.length > 0) {
        setAvailableFees(fees);
        if (!fees.includes(createEntryFee)) {
          setCreateEntryFee(fees[0]);
        }
      }
    });
  }, [createGameType]);

  // Limpiar IDs de cuarentena expirados (> 30s)
  const pruneRecentlyClosed = useCallback(() => {
    const now = Date.now();
    for (const [id, time] of recentlyClosedTimestamps.current.entries()) {
      if (now - time > 30000) {
        recentlyClosedTimestamps.current.delete(id);
        recentlyClosedTableIds.current.delete(id);
      }
    }
  }, []);

  // Cargar mesas públicas con validación canónica estricta
  const loadPublicTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      pruneRecentlyClosed();
      const currentFilter = selectedGameFilterRef.current;
      const filter = currentFilter === 'all' ? undefined : currentFilter;
      const tables = await TableRepository.getPublicTables(filter);
      
      // Filtrar estrictamente contra mesas en cuarentena y validador de disponibilidad
      const sanitized = tables.filter(
        (t) => !recentlyClosedTableIds.current.has(t.id) && TableRepository.isTableAvailable(t)
      );
      setPublicTables(sanitized);
    } catch (err: any) {
      console.error('[LOBBY] Error cargando mesas públicas:', err);
    } finally {
      setLoadingTables(false);
    }
  }, [pruneRecentlyClosed]);

  // Reconciliación debounced para absorber ráfagas de eventos Realtime
  const debouncedReconcile = useCallback(() => {
    if (reconcileTimerRef.current) {
      clearTimeout(reconcileTimerRef.current);
    }
    reconcileTimerRef.current = setTimeout(() => {
      loadPublicTables();
    }, 300);
  }, [loadPublicTables]);

  // Carga inicial y recarga al cambiar filtro
  useEffect(() => {
    loadPublicTables();
  }, [selectedGameFilter, loadPublicTables]);

  // Suscripción Realtime persistente y resiliente al ciclo de vida del Lobby
  useEffect(() => {
    const handleLobbyPayload = (payload: any) => {
      if (!payload) return;

      const sourceTable = payload.sourceTable || payload.table;
      const eventType = payload.eventType;

      if (sourceTable === 'game_tables') {
        const newRecord = payload.new;
        const oldRecord = payload.old;
        const tableId = newRecord?.id || oldRecord?.id;

        if (eventType === 'DELETE') {
          if (tableId) {
            recentlyClosedTableIds.current.add(tableId);
            recentlyClosedTimestamps.current.set(tableId, Date.now());
            setPublicTables((prev) => prev.filter((t) => t.id !== tableId));
          }
        } else if (eventType === 'UPDATE') {
          if (newRecord?.id) {
            const isAvailable = TableRepository.isTableAvailable(newRecord);
            if (!isAvailable) {
              recentlyClosedTableIds.current.add(newRecord.id);
              recentlyClosedTimestamps.current.set(newRecord.id, Date.now());
              setPublicTables((prev) => prev.filter((t) => t.id !== newRecord.id));
            } else {
              if (!recentlyClosedTableIds.current.has(newRecord.id)) {
                const mappedTable = TableRepository.mapDbTableToGameTable(newRecord);
                const currentFilter = selectedGameFilterRef.current;
                const matchesFilter = currentFilter === 'all' || mappedTable.gameType === currentFilter;
                
                setPublicTables((prev) => {
                  if (matchesFilter) {
                    const exists = prev.some((t) => t.id === mappedTable.id);
                    return exists ? prev.map((t) => (t.id === mappedTable.id ? mappedTable : t)) : [mappedTable, ...prev];
                  } else {
                    return prev.filter((t) => t.id !== mappedTable.id);
                  }
                });
              }
            }
          }
        } else if (eventType === 'INSERT') {
          if (newRecord?.id && TableRepository.isTableAvailable(newRecord)) {
            if (!recentlyClosedTableIds.current.has(newRecord.id)) {
              const mappedTable = TableRepository.mapDbTableToGameTable(newRecord);
              const currentFilter = selectedGameFilterRef.current;
              const matchesFilter = currentFilter === 'all' || mappedTable.gameType === currentFilter;
              if (matchesFilter) {
                setPublicTables((prev) => [mappedTable, ...prev.filter((t) => t.id !== mappedTable.id)]);
              }
            }
          }
        }
      } else if (sourceTable === 'game_sessions') {
        const sessionRecord = payload.new;
        const sessionStatus = String(sessionRecord?.status || '').toUpperCase();
        if (
          sessionRecord?.table_id &&
          (sessionRecord.is_settled === true ||
            sessionRecord.ended_at !== null ||
            ['SETTLED', 'FINISHED', 'CANCELLED', 'COMPLETED', 'ABANDONED', 'CLOSED', 'ACTIVE', 'IN_PROGRESS', 'IN_GAME'].includes(sessionStatus))
        ) {
          recentlyClosedTableIds.current.add(sessionRecord.table_id);
          recentlyClosedTimestamps.current.set(sessionRecord.table_id, Date.now());
          setPublicTables((prev) => prev.filter((t) => t.id !== sessionRecord.table_id));
        }
      } else if (sourceTable === 'game_table_players') {
        debouncedReconcile();
      }

      debouncedReconcile();
    };

    const handleStatusChange = (status: string) => {
      if (status === 'SUBSCRIBED') {
        loadPublicTables();
      }
    };

    const unsubscribeLobby = RealtimeManager.subscribeToLobby(handleLobbyPayload, handleStatusChange);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPublicTables();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    const heartbeatTimer = setInterval(() => {
      loadPublicTables();
    }, 30000);

    return () => {
      unsubscribeLobby();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      clearInterval(heartbeatTimer);
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
      }
    };
  }, [loadPublicTables, debouncedReconcile]);

  // Cargar jugadores cuando hay una mesa activa abierta
  const loadTablePlayers = useCallback(async (tableId: string) => {
    try {
      const players = await TableRepository.getTablePlayers(tableId);
      setTablePlayers(players);
    } catch (err) {
      console.error('Error cargando jugadores:', err);
    }
  }, []);

  useEffect(() => {
    if (!activeTable) return;

    let isMounted = true;
    loadTablePlayers(activeTable.id);

    const checkAndEnterGame = async (tableData?: GameTable) => {
      if (!isMounted || !activeTable?.id) return;
      try {
        const targetTable = tableData || activeTable;
        const freshPlayers = await TableRepository.getTablePlayers(targetTable.id);
        if (!isMounted) return;
        const isSeated = freshPlayers.some((p) => p.userId === user?.id && p.status !== 'LEFT');
        if (isSeated) {
          setInGameData({
            table: targetTable,
            players: freshPlayers,
          });
          setActiveTable(null);
        }
      } catch (err) {
        console.warn('[TablesView] Error al transicionar a la partida:', err);
      }
    };

    const unsubscribeTable = RealtimeManager.subscribeToTable(
      activeTable.id,
      (tablePayload) => {
        if (!isMounted || !tablePayload.new) return;
        const newStatus = (tablePayload.new.status || '').toUpperCase();
        if (newStatus === 'CLOSED' || newStatus === 'TERMINATED' || newStatus === 'CANCELLED' || newStatus === 'EXPIRED') {
          setActiveTable(null);
          setInGameData(null);
          setSeatActionFeedback({
            success: false,
            message: 'Esta mesa ha sido cerrada o terminada por la administración.',
          });
        } else {
          const updatedTable = { ...activeTable, ...tablePayload.new };
          setActiveTable((prev) => (prev ? { ...prev, ...tablePayload.new } : null));

          const isPlayable = ['ACTIVE', 'IN_PROGRESS', 'READY', 'STARTING', 'SALES', 'DRAWING'].includes(newStatus);
          if (isPlayable) {
            checkAndEnterGame(updatedTable);
          }
        }
      },
      () => {
        if (isMounted) {
          loadTablePlayers(activeTable.id);
        }
      },
      (sessionPayload) => {
        if (!isMounted || !sessionPayload.new) return;
        const sessStatus = (sessionPayload.new.status || '').toUpperCase();
        const isSessionActive =
          ['ACTIVE', 'IN_PROGRESS', 'READY', 'STARTING', 'SALES', 'DRAWING'].includes(sessStatus) ||
          (sessStatus === 'WAITING' && activeTable.gameType === 'bingo');

        if (isSessionActive) {
          checkAndEnterGame(activeTable);
        }
      }
    );

    // Sondeo de Respaldo Anti-Desconexión (Fallback ligero cada 2.5s)
    // Garantiza que jugadores en dispositivos móviles o con pérdida temporal de WebSockets no se queden atascados
    const pollInterval = setInterval(async () => {
      if (!isMounted || !activeTable?.id) return;
      try {
        const activeSess = await GameRepository.getActiveSession(activeTable.id);
        if (!isMounted) return;
        if (activeSess) {
          const sStatus = (activeSess.status || '').toUpperCase();
          const isPlayableSession =
            ['ACTIVE', 'IN_PROGRESS', 'READY', 'STARTING', 'SALES', 'DRAWING'].includes(sStatus) ||
            (sStatus === 'WAITING' && activeTable.gameType === 'bingo');

          if (isPlayableSession) {
            await checkAndEnterGame(activeTable);
            return;
          }
        }

        // Comprobación secundaria en game_tables
        const freshTable = await TableRepository.getTableById(activeTable.id);
        if (!isMounted) return;
        if (freshTable) {
          const tStatus = (freshTable.status || '').toUpperCase();
          if (['ACTIVE', 'IN_PROGRESS', 'SALES', 'DRAWING'].includes(tStatus)) {
            await checkAndEnterGame(freshTable);
          }
        }
      } catch (err) {
        // Sondeo en segundo plano silencioso
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      unsubscribeTable();
    };
  }, [activeTable?.id, loadTablePlayers, user?.id]);

  // Unirse por código Trancaíto
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCode = joinCodeInput.trim();

    if (!rawCode) {
      setJoinError('Introduce el código de la mesa.');
      return;
    }

    if (!user) {
      setJoinError('Debes iniciar sesión para unirte a una mesa.');
      return;
    }

    setJoinError(null);
    setSearchingCode(true);

    try {
      const result = await TableRepository.joinTableByCode(rawCode);

      if (!result.success || !result.table) {
        setJoinError(result.error || 'Código de Trancaíto no encontrado.');
        return;
      }

      const players = await TableRepository.getTablePlayers(result.table.id);

      setActiveTable(result.table);
      setTablePlayers(players);
      setJoinCodeInput('');

      if (result.alreadyJoined) {
        setSeatActionFeedback({
          success: true,
          message: 'Ya estás dentro de esta mesa.',
        });
      } else {
        setSeatActionFeedback({
          success: true,
          message: `¡Te has unido con éxito! Asiento #${result.seatNumber} reservado. Entrada retenida en el ledger.`,
        });
      }
    } catch (err: any) {
      setJoinError(sanitizeUserErrorMessage(err, 'No fue posible unirte a la mesa.'));
    } finally {
      setSearchingCode(false);
    }
  };

  // Tomar asiento en la mesa
  const handleTakeSeat = async (seatNumber: number) => {
    if (!activeTable || !user) return;

    setJoiningSeat(seatNumber);
    setSeatActionFeedback(null);

    const idempotencyKey = `join_${activeTable.id}_${user.id}_s${seatNumber}_${Date.now()}`;

    try {
      const result = await TableRepository.joinTable(activeTable.id, seatNumber, idempotencyKey);
      if (result.success) {
        setSeatActionFeedback({
          success: true,
          message: `¡Asiento #${seatNumber} reservado con éxito! Entrada retenida en el ledger.`,
        });
        await loadTablePlayers(activeTable.id);
      } else {
        setSeatActionFeedback({
          success: false,
          message: sanitizeUserErrorMessage(result.error, 'No se pudo ocupar el asiento. Verifica tu saldo disponible.'),
        });
      }
    } catch (err: any) {
      setSeatActionFeedback({
        success: false,
        message: sanitizeUserErrorMessage(err, 'Error al procesar la unión a la mesa.'),
      });
    } finally {
      setJoiningSeat(null);
    }
  };

  // Emparejamiento Rápido Inteligente
  const handleQuickMatch = async () => {
    if (!isAuthenticated && matchmakingEntryFee > 0) {
      setMatchmakingError('Debes iniciar sesión para jugar con saldo real.');
      return;
    }

    setIsMatchmaking(true);
    setMatchmakingError(null);
    setMatchmakingStatusText('Buscando mesa pública compatible...');

    try {
      const userDisplayName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : (user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Jugador');
      const userAvatarUrl = profile?.avatarUrl || user?.user_metadata?.avatar_url;

      const res = await TableRepository.findOrCreateMatchmakingTable({
        gameType: matchmakingGameType,
        entryFee: matchmakingEntryFee,
        maxPlayers: matchmakingMaxPlayers,
        mode: matchmakingMode,
        currentUserId: user?.id || `anon_${Date.now()}`,
        userDisplayName,
        userAvatarUrl,
      });

      if (res.action === 'practice') {
        setShowMatchmakingModal(false);
        setInGameData({
          table: res.table,
          players: res.players || [],
        });
      } else if (res.action === 'joined') {
        setMatchmakingStatusText('¡Mesa encontrada! Ingresando a la sala...');
        setTimeout(() => {
          setShowMatchmakingModal(false);
          setActiveTable(res.table);
          if (res.players) setTablePlayers(res.players);
          loadPublicTables();
        }, 500);
      } else if (res.action === 'created') {
        setMatchmakingStatusText('Nueva mesa oficial creada. Esperando oponentes...');
        setTimeout(() => {
          setShowMatchmakingModal(false);
          setActiveTable(res.table);
          if (res.players) setTablePlayers(res.players);
          loadPublicTables();
        }, 500);
      }
    } catch (err: any) {
      setMatchmakingError(sanitizeUserErrorMessage(err, 'Error al emparejar mesa.'));
    } finally {
      setIsMatchmaking(false);
    }
  };

  // Crear mesa
  const handleCreateTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (createIsPractice) {
      const userDisplayName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : (user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Tú (Anfitrión)');
      const userAvatarUrl = profile?.avatarUrl || user?.user_metadata?.avatar_url;

      const practice = TableRepository.createPracticeTable({
        gameType: createGameType,
        maxPlayers: createMaxPlayers,
        currentUserId: user?.id || `anon_${Date.now()}`,
        userDisplayName,
        userAvatarUrl,
      });
      setShowCreateModal(false);
      setInGameData({
        table: practice.table,
        players: practice.players,
      });
      return;
    }

    if (!isAuthenticated) {
      setCreateError('Debes iniciar sesión para crear una mesa con saldo real.');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const newTable = await TableRepository.createTable({
        gameType: createGameType,
        name: createName.trim() || undefined,
        mode: createMode,
        entryFee: Number(createEntryFee),
        maxPlayers: Number(createMaxPlayers),
        isPrivate: createIsPrivate,
      });

      if (newTable) {
        setShowCreateModal(false);
        setActiveTable(newTable);
        loadPublicTables();
      } else {
        setCreateError('No fue posible crear la mesa en este momento.');
      }
    } catch (err: any) {
      setCreateError(sanitizeUserErrorMessage(err, 'No fue posible crear la mesa. Inténtalo nuevamente.'));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBingoTable = async (params: CreateBingoTableParams) => {
    if (!isAuthenticated) {
      setCreateError('Debes iniciar sesión para crear una mesa de Bingo con saldo real.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const newTable = await TableRepository.createTable({
        gameType: 'bingo',
        gameVariant: params.gameVariant,
        name: `Bingo ${params.gameVariant} Bolas`,
        mode: '1v1',
        entryFee: params.entryFee,
        maxPlayers: params.maxPlayers,
        isPrivate: params.isPrivate,
        config: {
          gameVariant: params.gameVariant,
          variant: params.gameVariant,
          automated: true,
          callIntervalMs: 4000,
        },
      });

      if (newTable) {
        setShowCreateModal(false);
        setActiveTable(newTable);
        loadPublicTables();
      } else {
        setCreateError('No fue posible crear la mesa de Bingo.');
      }
    } catch (err: any) {
      setCreateError(sanitizeUserErrorMessage(err, 'No fue posible crear la mesa de Bingo. Inténtalo nuevamente.'));
    } finally {
      setCreating(false);
    }
  };

  const visiblePublicTables = publicTables.filter((table) => {
    if (recentlyClosedTableIds.current.has(table.id)) return false;
    if (!TableRepository.isTableAvailable(table)) return false;
    if (selectedGameFilter !== 'all' && table.gameType !== selectedGameFilter) return false;
    return true;
  });

  if (inGameData) {
    return (
      <GameContainer
        table={inGameData.table}
        players={inGameData.players}
        currentUserId={user?.id || ''}
        onExit={() => setInGameData(null)}
        onPlayAgain={() => {
          const gameType = inGameData.table.gameType;
          const entryFee = inGameData.table.entryFee;
          const maxPlayers = inGameData.table.maxPlayers;
          const isPrivate = inGameData.table.isPrivate || false;
          
          setInGameData(null);
          
          setCreateGameType(gameType);
          setCreateEntryFee(entryFee);
          setCreateMaxPlayers(maxPlayers);
          setCreateIsPrivate(isPrivate);
          setCreateName(`Mesa de ${getGameDisplayName(gameType)}`);
          setShowCreateModal(true);
        }}
      />
    );
  }

  return (
    <div id="tables-view" className="space-y-8 max-w-6xl mx-auto">
      <MediaBanner location="GAMES" />

      <AdPlacementContainer
        placement="GAME_HEADER"
        gameType={selectedGameFilter !== 'all' ? selectedGameFilter : undefined}
        showBadge={true}
        className="my-1"
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-black text-slate-100">Mesas Públicas y Privadas ("Trancaíto")</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Únete a una partida pública o ingresa a una mesa privada mediante código seguro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            id="btn-quick-match"
            variant="secondary"
            size="sm"
            onClick={() => {
              setMatchmakingGameType(selectedGameFilter === 'all' ? 'domino_venezolano' : selectedGameFilter);
              setShowMatchmakingModal(true);
            }}
            leftIcon={<Zap className="w-4 h-4 text-amber-400" />}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            ⚡ Partida Rápida
          </Button>

          <Button
            id="btn-practice-mode"
            variant="secondary"
            size="sm"
            onClick={() => {
              setCreateIsPractice(true);
              setCreateGameType(selectedGameFilter === 'all' ? 'domino_venezolano' : selectedGameFilter);
              setShowCreateModal(true);
            }}
            leftIcon={<Bot className="w-4 h-4 text-cyan-400" />}
            className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
          >
            🎮 Práctica con Bots
          </Button>

          {isAuthenticated && (
            <Button
              id="btn-open-create-table-modal"
              variant="primary"
              size="sm"
              onClick={() => {
                setCreateIsPractice(false);
                if (selectedGameFilter !== 'all') {
                  setCreateGameType(selectedGameFilter);
                }
                setShowCreateModal(true);
              }}
              leftIcon={<PlusCircle className="w-4 h-4" />}
            >
              Crear Mesa
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          id="card-join-trancaito"
          className="md:col-span-1"
          header={
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
              <QrCode className="w-4 h-4 text-amber-400" />
              <span>Unirse con Código Trancaíto</span>
            </div>
          }
        >
          <form onSubmit={handleJoinByCode} className="space-y-4">
            <div>
              <label htmlFor="join-code-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                Código de Mesa Privada
              </label>
              <input
                id="join-code-input"
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Ejemplo: TRK-9842"
                maxLength={12}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 font-mono text-sm uppercase tracking-wider focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {joinError && (
              <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{joinError}</span>
              </div>
            )}

            {isAuthenticated ? (
              <Button
                id="btn-submit-join-code"
                type="submit"
                variant="primary"
                className="w-full font-semibold shadow-md shadow-amber-950/40"
                rightIcon={<ArrowRight className="w-4 h-4" />}
                disabled={!joinCodeInput.trim() || searchingCode}
              >
                {searchingCode ? 'Uniéndose...' : 'Unirse con Código'}
              </Button>
            ) : (
              <Button
                id="btn-login-to-join"
                type="button"
                variant="primary"
                className="w-full text-xs font-black uppercase tracking-wider bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 hover:from-yellow-300 hover:to-yellow-200 text-slate-950 shadow-md shadow-yellow-500/30"
                onClick={openLoginModal}
                disabled={isSigningIn}
                leftIcon={isSigningIn ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : undefined}
              >
                {isSigningIn ? 'Conectando...' : 'INGRESAR PARA UNIRTE'}
              </Button>
            )}
          </form>
        </Card>

        <Card
          id="card-trancaito-info"
          className="md:col-span-2 flex flex-col justify-between"
          header={
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-semibold text-sm flex items-center gap-2">
                <Share2 className="w-4 h-4 text-amber-400" />
                <span>Modalidad "Trancaíto": Partidas Entre Amigos</span>
              </span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                100% Protegido
              </span>
            </div>
          }
        >
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <p>
              Las mesas privadas de <strong>Raspando La Olla</strong> permiten jugar entre amigos compartiendo un código alfanumérico seguro (ej. <code className="text-amber-300 font-mono">TRK-4921</code>) o enlace directo.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px] text-slate-400">
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Entradas Retenidas:</strong> El saldo se bloquea en escrow y no se pierde por desconexión involuntaria.</span>
              </div>
              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Regla 90/10 Inmutable:</strong> El 90% del pozo acumulado va directo al ganador al finalizar la partida.</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-2 border-t border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">¿Deseas organizar una partida privada?</span>
            {isAuthenticated ? (
              <Button
                id="btn-trigger-create-trancaito"
                variant="outline"
                size="sm"
                className="text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                onClick={() => {
                  setCreateIsPrivate(true);
                  setShowCreateModal(true);
                }}
              >
                Crear Mesa Privada
              </Button>
            ) : (
              <Button
                id="btn-login-trancaito"
                variant="secondary"
                size="sm"
                onClick={openLoginModal}
                disabled={isSigningIn}
                leftIcon={isSigningIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
              >
                {isSigningIn ? 'Conectando...' : 'Iniciar Sesión'}
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <TableFilters
          selectedGameFilter={selectedGameFilter}
          onSelectGameFilter={setSelectedGameFilter}
          loadingTables={loadingTables}
          onRefresh={loadPublicTables}
        />

        <AdPlacementContainer
          placement="LOBBY"
          gameType={selectedGameFilter !== 'all' ? selectedGameFilter : undefined}
          showBadge={true}
          className="my-2"
        />

        <TableList
          tables={visiblePublicTables}
          onViewTable={(table) => setActiveTable(table)}
          isLoading={loadingTables}
          isAuthenticated={isAuthenticated}
          onOpenCreateModal={() => {
            setCreateIsPrivate(false);
            setShowCreateModal(true);
          }}
        />
      </div>

      {activeTable && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-4 sticky top-0 bg-slate-900 pt-1 pb-2 border-b border-slate-800/80 z-10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase">
                    {activeTable.isPrivate ? 'Mesa Trancaíto' : 'Mesa Pública'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{activeTable.joinCode}</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-100 mt-1">
                  {activeTable.name || `Mesa de ${activeTable.gameType}`}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Modo: {activeTable.mode} | Entrada:{' '}
                  <strong className="text-amber-300 font-mono">{formatBolivares(activeTable.entryFee)}</strong> | Pozo estimado (90%):{' '}
                  <strong className="text-emerald-400 font-mono">
                    {formatBolivares(activeTable.entryFee * activeTable.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100))}
                  </strong>
                </p>
              </div>

              <button
                onClick={() => {
                  setActiveTable(null);
                  setSeatActionFeedback(null);
                }}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {seatActionFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                  seatActionFeedback.success
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-red-950/40 border-red-800/60 text-red-300'
                }`}
              >
                {seatActionFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <span>{seatActionFeedback.message}</span>
              </div>
            )}

            <div className="space-y-3">
              {(() => {
                const uniquePlayers = Array.from(
                  new Map(tablePlayers.map((p) => [p.userId, p])).values()
                );
                const hasDuplicatePlayers = uniquePlayers.length !== tablePlayers.length;
                const userAlreadySeated = uniquePlayers.some((p) => p.userId === user?.id);
                const minRequired = activeTable.minPlayers || 2;
                const canStart = uniquePlayers.length >= minRequired && !hasDuplicatePlayers;

                return (
                  <>
                    {hasDuplicatePlayers && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Un jugador no puede ocupar dos puestos en la misma mesa</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Asientos de la Mesa ({uniquePlayers.length}/{activeTable.maxPlayers})
                      </h3>
                      {!canStart && !hasDuplicatePlayers && (
                        <span className="text-[11px] text-amber-400 font-medium">
                          Mínimo requerido: {minRequired} jugadores
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Array.from({ length: activeTable.maxPlayers }, (_, i) => i + 1).map((seatNum) => {
                        const playerAtSeat = uniquePlayers.find(
                          (p) => p.seatNumber === seatNum
                        );
                        const isCurrentPlayer = playerAtSeat?.userId === user?.id;
                        const isPlayerOnline = playerAtSeat ? onlineUserIds.includes(playerAtSeat.userId) : false;

                        return (
                          <div
                            key={seatNum}
                            className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                              playerAtSeat
                                ? isCurrentPlayer
                                  ? 'bg-amber-950/20 border-amber-500/50'
                                  : 'bg-slate-950 border-slate-800'
                                : 'bg-slate-950/40 border-dashed border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-mono text-xs font-bold text-slate-300">
                                  #{seatNum}
                                </div>
                                {playerAtSeat && (
                                  <span
                                    className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-950 ${
                                      isPlayerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'
                                    }`}
                                    title={isPlayerOnline ? 'En línea' : 'Desconectado'}
                                  />
                                )}
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                                  <span>{playerAtSeat ? playerAtSeat.displayName : 'Asiento Disponible'}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                  <span>{playerAtSeat ? (isCurrentPlayer ? '(Tú)' : 'Listo') : 'Vacante'}</span>
                                  {playerAtSeat && (
                                    <span className={isPlayerOnline ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                      • {isPlayerOnline ? 'ONLINE' : 'OFFLINE'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div>
                              {playerAtSeat ? (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                                  Ocupado
                                </span>
                              ) : isAuthenticated ? (
                                userAlreadySeated ? (
                                  <span className="text-[10px] text-slate-500 font-medium">Ya sentado</span>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    className="text-xs py-1 px-3"
                                    disabled={joiningSeat !== null}
                                    onClick={() => handleTakeSeat(seatNum)}
                                  >
                                    {joiningSeat === seatNum ? 'Ocupando...' : 'Tomar Asiento'}
                                  </Button>
                                )
                              ) : (
                                <span className="text-[10px] text-slate-500">Inicia sesión</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3">
                      <div className="text-xs text-slate-400">
                        Comparte este código para invitar: <strong className="text-amber-300 font-mono">{activeTable.joinCode}</strong>
                      </div>

                      <div className="flex items-center gap-2">
                        {user && activeTable.hostUserId === user.id ? (
                          <Button
                            id="btn-enter-game-arena"
                            variant="primary"
                            size="sm"
                            leftIcon={<Play className="w-4 h-4 fill-current" />}
                            disabled={!canStart || isStartingTable}
                            onClick={async () => {
                              if (!user || !canStart || isStartingTable) return;
                              try {
                                setIsStartingTable(true);
                                let initialEngineState: any = {};
                                if (activeTable.gameType === 'atrapaito') {
                                  const isOnline = !activeTable.config?.isPractice && !activeTable.id.startsWith('practice_') && activeTable.entryFee > 0;
                                  initialEngineState = {
                                    bluePos: { col: 4, row: 14 },
                                    redPos: { col: 3, row: 14 },
                                    walls: [],
                                    blueWalls: 10,
                                    redWalls: 10,
                                    turn: 'BLUE',
                                    action: 'MOVE',
                                    wallOrientation: 'HORIZONTAL',
                                    pendingWall: null,
                                    winner: null,
                                    mode: isOnline ? 'ONLINE' : 'VS_AI',
                                    isAiThinking: false,
                                    consecutiveDraws: 0,
                                    blueUserId: uniquePlayers[0]?.userId || null,
                                    redUserId: uniquePlayers[1]?.userId || null,
                                    currentTurnUserId: uniquePlayers[0]?.userId || null,
                                    turnUserId: uniquePlayers[0]?.userId || null,
                                    turnDurationSeconds: 15,
                                    boardType: 'CRIOLLO_WALLS',
                                  };
                                } else {
                                  const engine = getGameEngine(activeTable.gameType);
                                  initialEngineState = engine.initialize(activeTable, uniquePlayers);
                                }
                                const turnDuration =
                                  activeTable.gameType === 'chess'
                                    ? 15
                                    : (initialEngineState as any)?.turnDurationSeconds || 30;

                                await TableRepository.startGameSession(
                                  activeTable.id,
                                  initialEngineState,
                                  turnDuration
                                );

                                setInGameData({
                                  table: activeTable,
                                  players: uniquePlayers,
                                });
                                setActiveTable(null);
                              } catch (e: any) {
                                console.error('[TablesView] Error al iniciar sesión en el servidor:', e);
                                const activeSess = await GameRepository.getActiveSession(activeTable.id);
                                if (activeSess) {
                                  setInGameData({
                                    table: activeTable,
                                    players: uniquePlayers,
                                  });
                                  setActiveTable(null);
                                } else {
                                  alert(
                                    e?.message ||
                                      'No se pudo iniciar la partida en el servidor. Por favor verifica tu conexión e intenta nuevamente.'
                                  );
                                }
                              } finally {
                                setIsStartingTable(false);
                              }
                            }}
                          >
                            {isStartingTable
                              ? 'INICIANDO...'
                              : canStart
                              ? 'INICIAR PARTIDA'
                              : `Esperando Jugadores (${uniquePlayers.length}/${minRequired})`}
                          </Button>
                        ) : (
                          <Button
                            id="btn-enter-game-arena"
                            variant="primary"
                            size="sm"
                            leftIcon={
                              ['ACTIVE', 'IN_PROGRESS', 'SALES', 'DRAWING', 'READY'].includes(activeTable.status) ? (
                                <Play className="w-4 h-4 fill-current" />
                              ) : (
                                <Clock className="w-4 h-4 animate-pulse" />
                              )
                            }
                            disabled={
                              !userAlreadySeated ||
                              !['ACTIVE', 'IN_PROGRESS', 'SALES', 'DRAWING', 'READY'].includes(activeTable.status)
                            }
                            onClick={() => {
                              if (!user) return;
                              setInGameData({
                                table: activeTable,
                                players: uniquePlayers,
                              });
                              setActiveTable(null);
                            }}
                          >
                            {!userAlreadySeated
                              ? 'Ocupa un puesto para jugar'
                              : ['ACTIVE', 'IN_PROGRESS', 'SALES', 'DRAWING', 'READY'].includes(activeTable.status)
                              ? 'ENTRAR A LA PARTIDA'
                              : canStart
                              ? 'Esperando inicio del anfitrión...'
                              : `Esperando Jugadores (${uniquePlayers.length}/${minRequired})`}
                          </Button>
                        )}

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setActiveTable(null);
                            setSeatActionFeedback(null);
                          }}
                        >
                          Cerrar Sala
                        </Button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Mesa Oficial / Privada / Práctica */}
      <CreateTableModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        createIsPractice={createIsPractice}
        setCreateIsPractice={setCreateIsPractice}
        createGameType={createGameType}
        setCreateGameType={setCreateGameType}
        createMode={createMode}
        setCreateMode={setCreateMode}
        createName={createName}
        setCreateName={setCreateName}
        createEntryFee={createEntryFee}
        setCreateEntryFee={setCreateEntryFee}
        createMaxPlayers={createMaxPlayers}
        setCreateMaxPlayers={setCreateMaxPlayers}
        createIsPrivate={createIsPrivate}
        setCreateIsPrivate={setCreateIsPrivate}
        creating={creating}
        createError={createError}
        setCreateError={setCreateError}
        availableFees={availableFees}
        userBalance={userBalance}
        formatUsd={formatUsd}
        onSubmit={handleCreateTableSubmit}
        onCreateBingoTable={handleCreateBingoTable}
        onForceLeaveAndRetry={async () => {
          setCreating(true);
          setCreateError('Liberando participaciones previas...');
          try {
            await TableRepository.forceLeaveAllTables();
            await TableRepository.cleanupStaleParticipation();
            setCreateError(null);
            handleCreateTableSubmit(new Event('submit') as any);
          } catch (err: any) {
            setCreateError('No se pudo liberar automáticamente. Intenta de nuevo.');
            setCreating(false);
          }
        }}
      />

      {/* Modal de Emparejamiento Rápido (Matchmaking) */}
      {showMatchmakingModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-100">Partida Rápida</h2>
                  <p className="text-[11px] text-slate-400">Emparejamiento automático inteligente</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isMatchmaking) setShowMatchmakingModal(false);
                }}
                disabled={isMatchmaking}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Juego a Disputar</label>
                <select
                  value={matchmakingGameType}
                  onChange={(e) => {
                    const g = e.target.value as GameType;
                    setMatchmakingGameType(g);
                    const meta = SUPPORTED_GAMES_METADATA.find((m) => m.id === g);
                    if (meta) {
                      setMatchmakingMaxPlayers(meta.maxPlayers);
                      setMatchmakingMode(meta.allowedModes[0]);
                    }
                  }}
                  disabled={isMatchmaking}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500 font-semibold"
                >
                  {SUPPORTED_GAMES_METADATA.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1.5">Monto de Entrada Deseado</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[25, 50, 100, 250, 500, 1000].map((fee) => (
                    <button
                      key={fee}
                      type="button"
                      disabled={isMatchmaking}
                      onClick={() => setMatchmakingEntryFee(fee)}
                      className={`py-2 px-2 rounded-xl text-xs font-mono font-bold border transition text-center ${
                        matchmakingEntryFee === fee
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {fee} Bs.
                    </button>
                  ))}
                </div>
              </div>

              {isMatchmaking && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col items-center justify-center text-center space-y-2 animate-pulse">
                  <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
                  <div className="font-bold text-amber-300 text-sm">Buscando mesa pública abierta...</div>
                  <div className="text-[11px] text-slate-300">{matchmakingStatusText || 'Conectando con la red en tiempo real...'}</div>
                </div>
              )}

              {matchmakingError && (
                <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{matchmakingError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isMatchmaking}
                  onClick={() => setShowMatchmakingModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={isMatchmaking}
                  onClick={handleQuickMatch}
                  leftIcon={<Zap className="w-4 h-4" />}
                >
                  {isMatchmaking ? 'Emparejando...' : 'Buscar o Crear Mesa'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <GameRulesModal
        isOpen={showRulesModal}
        defaultGameId={rulesGameId}
        onClose={() => setShowRulesModal(false)}
      />

      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-slate-300">Garantía de Fondos y Transparencia: </strong>
            Toda validación de acceso, saldo suficiente y deducción transaccional se realiza en servidor seguro.
            El pozo acumulado y los premios se liquidan automáticamente con total transparencia.
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setRulesGameId(selectedGameFilter === 'all' ? 'domino_venezolano' : selectedGameFilter);
            setShowRulesModal(true);
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-semibold flex items-center gap-1.5 shrink-0 transition"
        >
          <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          ¿Cómo Jugar?
        </button>
      </div>
    </div>
  );
}

export { CreateBingoTableForm } from './components/CreateBingoTableForm';
export { TableCard } from './components/TableCard';
export { TableList } from './components/TableList';
export { TableFilters } from './components/TableFilters';
export { CreateTableModal } from './components/CreateTableModal';
