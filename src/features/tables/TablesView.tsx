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
import { useCapabilities } from '../../hooks/useCapabilities';
import { normalizeCanonicalGameId, useGameAvailability } from '../../context/GameAvailabilityContext';
import { QuickMatchModal } from '../../components/common/QuickMatchModal';
import { TableRepository } from '../../services/repositories/TableRepository';
import { GameRepository } from '../../services/repositories/GameRepository';
import { FinancialRepository } from '../../services/repositories/FinancialRepository';
import { RealtimeManager } from '../../services/realtime/RealtimeManager';
import { PresenceService } from '../../services/PresenceService';
import { SUPPORTED_GAMES_METADATA, FINANCIAL_RULES } from '../../utils/constants';
import { formatBolivares, getGameDisplayName } from '../../utils/formatters';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import { useBcvRate } from '../../context/BcvContext';
import { useProtectedGameplay } from '../../context/ProtectedGameplayContext';
import type { GameTable, TablePlayer } from '../../types/tables';
import type { GameType, GameMode, GameSession } from '../../types/games';
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
  const isStartingTableRef = useRef(false);
  isStartingTableRef.current = isStartingTable;
  const [seatActionFeedback, setSeatActionFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>(PresenceService.getOnlineUserIds());

  useEffect(() => {
    const unsub = PresenceService.subscribeToOnlineUsers((ids) => {
      setOnlineUserIds(ids);
    });
    return () => unsub();
  }, []);

  // Partida en Vivo Activa
  const [inGameData, setInGameData] = useState<{ table: GameTable; players: TablePlayer[]; session?: GameSession | null } | null>(null);
  const inGameDataRef = useRef(inGameData);
  inGameDataRef.current = inGameData;

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

  // Hook centralizado de disponibilidad de juegos en tiempo real
  const { isGameEnabled, getDisabledReason, availableGames } = useGameAvailability();

  // Limpiar filtro si el juego seleccionado fue deshabilitado por el administrador
  useEffect(() => {
    if (selectedGameFilter !== 'all' && !isGameEnabled(selectedGameFilter)) {
      setSelectedGameFilter('all');
    }
  }, [selectedGameFilter, isGameEnabled]);

  // Modal de Emparejamiento Rápido (Matchmaking)
  const [showMatchmakingModal, setShowMatchmakingModal] = useState(false);

  // Modal de Reglas Oficiales
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesGameId, setRulesGameId] = useState<string>('domino_venezolano');

  // Control de idempotencia y deduplicación para apertura de mesas (evita dobles eventos o carreras)
  const openingTableIdRef = useRef<string | null>(null);
  const lastOpenedTableRef = useRef<{ id: string; timestamp: number } | null>(null);

  // Exponer control del modal de Partida Rápida al padre
  useEffect(() => {
    const handleOpenQuickMatch = () => {
      console.info('[JUGAR_YA_CLICK]', { source: 'open-quick-match_event', timestamp: new Date().toISOString() });
      setShowMatchmakingModal(true);
    };
    window.addEventListener('open-quick-match', handleOpenQuickMatch);
    return () => window.removeEventListener('open-quick-match', handleOpenQuickMatch);
  }, []);

  // Manejador centralizado y resiliente para abrir mesa por ID
  const handleOpenTableById = useCallback(async (tableId: string) => {
    if (!tableId) return;

    // Deduplicación e idempotencia: evitar aperturas concurrentes o eventos duplicados
    const now = Date.now();
    if (openingTableIdRef.current === tableId) {
      console.info('[TablesView] handleOpenTableById ignorado (ya en curso):', tableId);
      return;
    }
    if (
      lastOpenedTableRef.current &&
      lastOpenedTableRef.current.id === tableId &&
      now - lastOpenedTableRef.current.timestamp < 1200
    ) {
      console.info('[TablesView] handleOpenTableById deduplicado (repetido en <1200ms):', tableId);
      return;
    }

    openingTableIdRef.current = tableId;
    lastOpenedTableRef.current = { id: tableId, timestamp: now };

    console.info('[TABLE_OPEN_EVENT]', { tableId, timestamp: new Date().toISOString() });
    try {
      const table = await TableRepository.getTableById(tableId);
      if (!table) return;

      // Verificación de disponibilidad centralizada del juego
      if (!isGameEnabled(table.gameType)) {
        const reason = getDisabledReason(table.gameType);
        console.warn(`[TablesView] Mesa pertenece a juego deshabilitado (${table.gameType}):`, reason);
        setJoinError(`El juego ${table.gameType} se encuentra temporalmente en mantenimiento${reason ? `: "${reason}"` : '.'}`);
        return;
      }

      console.info('[TABLE_ACTIVATED]', {
        tableId: table.id,
        status: table.status,
        players: table.currentPlayersCount,
        name: table.name,
      });

      const freshPlayers = await TableRepository.getTablePlayers(table.id);
      setTablePlayers(freshPlayers);

      const currentUserId = (user?.id || '').toLowerCase();
      const isSeated =
        !currentUserId ||
        freshPlayers.some(
          (p) => (p.userId || '').toLowerCase() === currentUserId && p.status !== 'LEFT'
        );

      const isHost =
        (table.hostUserId || '').toLowerCase() === currentUserId ||
        ((table as any).createdBy || '').toLowerCase() === currentUserId;

      const minReq = table.minPlayers || 2;
      const activePlayers = freshPlayers.filter((p) => p.status !== 'LEFT');
      const isTableReadyOrFull =
        ['ACTIVE', 'READY', 'SALES', 'DRAWING', 'FULL'].includes((table.status || '').toUpperCase()) ||
        activePlayers.length >= minReq;

      // Comprobar si ya existe una sesión activa para esta mesa
      let activeSess = await GameRepository.getActiveSession(table.id);

      // Si el usuario está sentado y la mesa está lista o completa (2+ jugadores en 1v1):
      if (isSeated && isTableReadyOrFull) {
        // Canónico: Si es invitado (!isHost) y la sesión aún no aparece,
        // esperar activamente la creación de sesión del anfitrión con reintentos controlados.
        if (!activeSess && !isHost) {
          console.info('[TablesView] Invitado esperando sesión activa del anfitrión...', {
            tableId: table.id,
            playersCount: activePlayers.length,
          });
          for (let attempt = 0; attempt < 12; attempt++) {
            await new Promise((r) => setTimeout(r, 300));
            activeSess = await GameRepository.getActiveSession(table.id);
            if (activeSess) {
              console.info('[TablesView] Sesión de anfitrión resuelta para invitado en intento:', attempt + 1, {
                sessionId: activeSess.id,
              });
              break;
            }
          }
        }

        console.info('[TablesView] Transicionando jugador sentado a GameContainer:', {
          tableId: table.id,
          isHost,
          hasSession: Boolean(activeSess),
          sessionId: activeSess?.id,
          playersCount: freshPlayers.length,
        });

        setInGameData({
          table: { ...table, status: 'ACTIVE' },
          players: freshPlayers,
          session: activeSess,
        });
        setActiveTable(null);
        return;
      }

      // Si ya hay sesión activa confirmada aunque el status de mesa sea OPEN
      if (activeSess && isSeated) {
        console.info('[TablesView] Sesión activa confirmada, transicionando directo:', {
          tableId: table.id,
          sessionId: activeSess.id,
        });
        setInGameData({
          table: { ...table, status: 'ACTIVE' },
          players: freshPlayers,
          session: activeSess,
        });
        setActiveTable(null);
        return;
      }

      setActiveTable(table);
    } catch (err) {
      console.error('[TablesView] Error en handleOpenTableById:', err);
    } finally {
      if (openingTableIdRef.current === tableId) {
        openingTableIdRef.current = null;
      }
    }
  }, [user?.id, isGameEnabled, getDisabledReason]);

  // Escuchar evento para abrir mesa específica desde el Lobby (Bingo, Juega Ya, etc.)
  useEffect(() => {
    const handleOpenTable = (e: any) => {
      const tableId = e.detail?.tableId;
      if (tableId) {
        sessionStorage.removeItem('pending_open_table_id');
        handleOpenTableById(tableId);
      }
    };
    window.addEventListener('open-table' as any, handleOpenTable);

    // Recuperar mesa pendiente si se navegó desde QuickMatch / Lobby
    const pendingTableId = sessionStorage.getItem('pending_open_table_id');
    if (pendingTableId) {
      sessionStorage.removeItem('pending_open_table_id');
      handleOpenTableById(pendingTableId);
    }

    return () => window.removeEventListener('open-table' as any, handleOpenTable);
  }, [handleOpenTableById]);

  // Escuchar evento para abrir modal de creación de mesa para un juego específico (desde banners, hero, etc.)
  useEffect(() => {
    const handleOpenCreateTable = (e: any) => {
      const target = e.detail?.gameType || e.detail?.gameId;
      if (target) {
        const canonical = normalizeCanonicalGameId(target) as GameType;
        if (canonical) {
          setCreateGameType(canonical);
          setSelectedGameFilter(canonical);
        }
      }
      setCreateIsPractice(false);
      setShowCreateModal(true);
    };
    window.addEventListener('open-create-table' as any, handleOpenCreateTable);
    return () => window.removeEventListener('open-create-table' as any, handleOpenCreateTable);
  }, []);

  const { protectGameplay, getPersistedActiveGame, clearProtectedGameplay } = useProtectedGameplay();

  // Sincronizar protección de partida y estado activo
  useEffect(() => {
    const isPlaying = !!activeTable || !!inGameData;
    window.dispatchEvent(new CustomEvent('game-active-change', {
      detail: { isActive: isPlaying }
    }));

    if (isPlaying) {
      const current = inGameData?.table || activeTable;
      protectGameplay(true, {
        tableId: current?.id,
        gameType: current?.gameType,
        tableName: current?.name,
      });
    } else {
      protectGameplay(false);
    }
  }, [activeTable, inGameData, protectGameplay]);

  // Recuperación automática de mesa activa tras recarga accidental o reconexión móvil
  useEffect(() => {
    let isMounted = true;
    const restoreSession = async () => {
      if (!user?.id || inGameData || activeTable) return;
      const persisted = getPersistedActiveGame();
      if (!persisted?.tableId) return;

      try {
        const table = await TableRepository.getTableById(persisted.tableId);
        if (!table || !isMounted) return;

        const isPlayable = ['OPEN', 'WAITING', 'SALES', 'ACTIVE', 'READY', 'DRAWING', 'FULL'].includes(table.status);
        if (!isPlayable) {
          clearProtectedGameplay();
          return;
        }

        const freshPlayers = await TableRepository.getTablePlayers(table.id);
        if (!isMounted) return;

        const isSeated = freshPlayers.some((p) => p.userId === user.id && p.status !== 'LEFT');
        if (isSeated) {
          console.log('[TablesView] Sesión protegida previa reanudada con éxito:', table.id);
          if (['ACTIVE', 'READY', 'DRAWING', 'SALES', 'FULL'].includes(table.status)) {
            const activeSess = await GameRepository.getActiveSession(table.id);
            setInGameData({ table, players: freshPlayers, session: activeSess || undefined });
            setActiveTable(null);
          } else {
            setActiveTable(table);
            setTablePlayers(freshPlayers);
          }
        } else {
          clearProtectedGameplay();
        }
      } catch (err) {
        console.warn('[TablesView] No se pudo restaurar la sesión protegida previa:', err);
      }
    };

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, [user?.id, inGameData, activeTable, getPersistedActiveGame, clearProtectedGameplay]);

  const { executeOrPromptLogin } = useCapabilities();
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
      
      // Filtrar estrictamente contra mesas en cuarentena, validador de disponibilidad y juegos deshabilitados
      const sanitized = tables.filter(
        (t) => !recentlyClosedTableIds.current.has(t.id) && TableRepository.isTableAvailable(t) && isGameEnabled(t.gameType)
      );
      setPublicTables(sanitized);
    } catch (err: any) {
      console.error('[LOBBY] Error cargando mesas públicas:', err);
    } finally {
      setLoadingTables(false);
    }
  }, [pruneRecentlyClosed, isGameEnabled]);

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
            ['SETTLED', 'FINISHED', 'CANCELLED', 'COMPLETED', 'ABANDONED', 'CLOSED', 'ACTIVE'].includes(sessionStatus))
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

  // Acción canónica y segura para iniciar la partida como anfitrión (Server-Authoritative e Idempotente)
  const handleStartGameAsHost = useCallback(
    async (tableToStart: GameTable, playersList: TablePlayer[]) => {
      if (isStartingTableRef.current || inGameDataRef.current) return;
      if (!user?.id) return;

      const isHost =
        tableToStart.hostUserId === user.id || (tableToStart as any).createdBy === user.id;
      if (!isHost) return;

      const minRequired = tableToStart.minPlayers || 2;
      const unique = Array.from(
        new Map(
          playersList
            .filter((p) => p.status !== 'LEFT')
            .map((p) => [(p.userId || '').toLowerCase(), p])
        ).values()
      ).sort((a, b) => (a.seatNumber ?? 1) - (b.seatNumber ?? 1));

      if (unique.length < minRequired) return;

      isStartingTableRef.current = true;
      setIsStartingTable(true);

      try {
        console.info('[TablesView] Iniciando partida como anfitrión...', {
          tableId: tableToStart.id,
          gameType: tableToStart.gameType,
          playersCount: unique.length,
        });

        // 1. Idempotencia estricta: Verificar si ya existe sesión activa en DB
        let activeSess = await GameRepository.getActiveSession(tableToStart.id);

        if (!activeSess) {
          // 2. Preparar estado canónico según motor del juego
          let initialEngineState: any = {};
          if (tableToStart.gameType === 'atrapaito') {
            const isOnline =
              !tableToStart.config?.isPractice &&
              !tableToStart.id.startsWith('practice_') &&
              tableToStart.entryFee > 0;
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
              blueUserId: unique[0]?.userId || null,
              redUserId: unique[1]?.userId || null,
              currentTurnUserId: unique[0]?.userId || null,
              turnUserId: unique[0]?.userId || null,
              turnDurationSeconds: 15,
              boardType: 'CRIOLLO_WALLS',
            };
          } else {
            const engine = getGameEngine(tableToStart.gameType);
            initialEngineState = engine.initialize(tableToStart, unique);
          }

          const turnDuration =
            tableToStart.gameType === 'chess'
              ? 15
              : (initialEngineState as any)?.turnDurationSeconds || 30;

          await TableRepository.startGameSession(
            tableToStart.id,
            initialEngineState,
            turnDuration
          );

          activeSess = await GameRepository.getActiveSession(tableToStart.id);
        }

        if (inGameDataRef.current) return;

        console.info('[TablesView] Anfitrión transicionando a GameContainer con sesión:', {
          tableId: tableToStart.id,
          sessionId: activeSess?.id,
          playersCount: unique.length,
        });

        setInGameData({
          table: { ...tableToStart, status: 'ACTIVE' },
          players: unique,
          session: activeSess,
        });
        setActiveTable(null);
      } catch (e: any) {
        console.error('[TablesView] Error al iniciar sesión en el servidor:', e);
        const activeSess = await GameRepository.getActiveSession(tableToStart.id);
        if (activeSess) {
          setInGameData({
            table: { ...tableToStart, status: 'ACTIVE' },
            players: unique,
            session: activeSess,
          });
          setActiveTable(null);
        } else {
          setSeatActionFeedback({
            success: false,
            message: e?.message || 'Error al conectar con la sala de juego.',
          });
        }
      } finally {
        isStartingTableRef.current = false;
        setIsStartingTable(false);
      }
    },
    [user?.id]
  );

  // Auto-inicio de partida cuando la mesa alcanza los jugadores requeridos (Flujo Juega Ya / Sala)
  useEffect(() => {
    if (!activeTable || inGameData || isStartingTable) return;
    if (!user?.id) return;

    const isHost =
      activeTable.hostUserId === user.id || (activeTable as any).createdBy === user.id;
    if (!isHost) return;

    // Bingo y Polla tienen flujos de venta y salas independientes
    if (activeTable.gameType === 'bingo' || (activeTable.gameType as string) === 'polla' || activeTable.gameType === 'polla_venezolana') return;

    const minReq = activeTable.minPlayers || 2;
    const unique = Array.from(
      new Map(
        tablePlayers
          .filter((p) => p.status !== 'LEFT')
          .map((p) => [(p.userId || '').toLowerCase(), p])
      ).values()
    );

    if (unique.length >= minReq) {
      console.log('[TablesView] Mesa lista con jugadores completos, auto-iniciando partida...', {
        tableId: activeTable.id,
        playersCount: unique.length,
      });
      const timer = setTimeout(() => {
        handleStartGameAsHost(activeTable, tablePlayers);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [activeTable, tablePlayers, inGameData, isStartingTable, user?.id, handleStartGameAsHost]);

  useEffect(() => {
    if (!activeTable) return;

    let isMounted = true;
    loadTablePlayers(activeTable.id);

    const checkAndEnterGame = async (tableData?: GameTable, sessionData?: GameSession | null) => {
      if (!isMounted || !activeTable?.id) return;
      if (inGameDataRef.current) return;
      try {
        const targetTable = tableData || activeTable;
        let freshPlayers = await TableRepository.getTablePlayers(targetTable.id);
        if (!freshPlayers || freshPlayers.length === 0) {
          freshPlayers = tablePlayers;
        }
        if (!isMounted || inGameDataRef.current) return;
        const currentUserId = (user?.id || '').toLowerCase();
        const isSeated = !currentUserId || freshPlayers.some((p) => (p.userId || '').toLowerCase() === currentUserId && p.status !== 'LEFT');
        if (isSeated) {
          let effectiveSession = sessionData;
          if (!effectiveSession) {
            effectiveSession = await GameRepository.getActiveSession(targetTable.id);
            if (!effectiveSession) {
              for (let att = 0; att < 8; att++) {
                await new Promise((r) => setTimeout(r, 250 + att * 100));
                if (!isMounted || inGameDataRef.current) return;
                effectiveSession = await GameRepository.getActiveSession(targetTable.id);
                if (effectiveSession) break;
              }
            }
          }
          if (inGameDataRef.current) return;
          console.log('[TablesView] Transicionando a GameContainer:', {
            tableId: targetTable.id,
            playersCount: freshPlayers.length,
            hasSession: Boolean(effectiveSession),
            sessionId: effectiveSession?.id,
          });
          setInGameData({
            table: { ...targetTable, status: 'ACTIVE' },
            players: freshPlayers,
            session: effectiveSession,
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
          // Si el jugador está jugando dentro de GameContainer (inGameData activo),
          // GameContainer maneja la pantalla de juego y el modal de resultados/liquidación.
          // Solo limpiamos si el usuario aún está en la vista del lobby de la mesa.
          if (tablePayload.new.id === activeTable.id && !inGameDataRef.current) {
            setActiveTable(null);
            setInGameData(null);
            setSeatActionFeedback({
              success: false,
              message: 'Esta mesa ha sido cerrada o terminada por la administración.',
            });
          }
        } else {
          const updatedTable = { ...activeTable, ...tablePayload.new };
          setActiveTable((prev) => (prev ? { ...prev, ...tablePayload.new } : null));

          if (newStatus === 'FULL') {
            loadTablePlayers(activeTable.id);
          }

          const isPlayable = ['ACTIVE', 'READY', 'SALES', 'DRAWING', 'FULL'].includes(newStatus);
          if (isPlayable && !inGameDataRef.current) {
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
        if (!isMounted || !sessionPayload.new || inGameDataRef.current) return;
        const sessStatus = (sessionPayload.new.status || '').toUpperCase();
        const isSessionActive =
          ['ACTIVE', 'READY', 'SALES', 'DRAWING'].includes(sessStatus) ||
          (sessStatus === 'WAITING' && activeTable.gameType === 'bingo');

        if (isSessionActive) {
          const raw = sessionPayload.new;
          const mappedSession: GameSession = {
            id: raw.id,
            tableId: raw.table_id,
            gameType: raw.game_type,
            roundNumber: raw.session_number || raw.round_number || 1,
            currentTurnUserId: raw.current_turn_user_id || undefined,
            turnExpiresAt: raw.turn_deadline_at || raw.turn_expires_at || undefined,
            status: raw.status,
            grossPool: raw.gross_pool || 0,
            winnerPrizeAmount: raw.prize_pool || raw.winner_prize_amount || 0,
            serviceFeeAmount: raw.platform_fee || raw.service_fee_amount || 0,
            isSettled: raw.status === 'SETTLED' || Boolean(raw.is_settled),
            winnerUserId: raw.winner_user_id || undefined,
            currentState: raw.current_state || {},
          };
          checkAndEnterGame(activeTable, mappedSession);
        }
      }
    );

    // Sondeo de Respaldo Anti-Desconexión (Fallback rápido cada 1.5s)
    // Garantiza que jugadores en dispositivos móviles o con pérdida temporal de WebSockets no se queden atascados
    const pollInterval = setInterval(async () => {
      if (!isMounted || !activeTable?.id || document.hidden || inGameDataRef.current) return;
      try {
        const activeSess = await GameRepository.getActiveSession(activeTable.id);
        if (!isMounted || inGameDataRef.current) return;
        if (activeSess) {
          const sStatus = (activeSess.status || '').toUpperCase();
          const isPlayableSession =
            ['ACTIVE', 'READY', 'SALES', 'DRAWING'].includes(sStatus) ||
            (sStatus === 'WAITING' && activeTable.gameType === 'bingo');

          if (isPlayableSession) {
            await checkAndEnterGame(activeTable, activeSess);
            return;
          }
        }

        // Comprobación secundaria en game_tables
        const freshTable = await TableRepository.getTableById(activeTable.id);
        if (!isMounted || inGameDataRef.current) return;
        if (freshTable) {
          const tStatus = (freshTable.status || '').toUpperCase();
          if (['ACTIVE', 'SALES', 'DRAWING', 'FULL', 'READY'].includes(tStatus)) {
            await checkAndEnterGame(freshTable);
          }
        }
      } catch (err) {
        // Sondeo en segundo plano silencioso
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      unsubscribeTable();
    };
  }, [activeTable?.id, loadTablePlayers, user?.id]);

  // Unirse por código Trancaíto
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCode = joinCodeInput.trim().toUpperCase();

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
        setJoinError(result.error || 'No encontramos una mesa con ese código. Verifica el código e intenta nuevamente.');
        return;
      }

      // Verificación de disponibilidad del juego
      if (!isGameEnabled(result.table.gameType)) {
        const reason = getDisabledReason(result.table.gameType);
        setJoinError(`Esta mesa pertenece a un juego en mantenimiento${reason ? `: "${reason}"` : '.'}`);
        return;
      }

      const players = await TableRepository.getTablePlayers(result.table.id);

      setActiveTable(result.table);
      setTablePlayers(players);
      setJoinCodeInput('');

      if (result.alreadyJoined) {
        setSeatActionFeedback({
          success: true,
          message: 'Ya perteneces a esta mesa. Te hemos reconectado a la sala.',
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
    if (!isGameEnabled(table.gameType)) return false;
    if (selectedGameFilter !== 'all' && table.gameType !== selectedGameFilter) return false;
    return true;
  });

  if (inGameData) {
    return (
      <GameContainer
        table={inGameData.table}
        players={inGameData.players}
        initialSession={inGameData.session}
        currentUserId={user?.id || ''}
        onExit={() => {
          setInGameData(null);
          clearProtectedGameplay();
        }}
        onPlayAgain={() => {
          clearProtectedGameplay();
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
              console.info('[JUGAR_YA_CLICK]', { source: 'tables_view_header', timestamp: new Date().toISOString() });
              setShowMatchmakingModal(true);
            }}
            leftIcon={<Zap className="w-4 h-4 text-amber-400" />}
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            ⚡ Juega Ya
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

          {isAuthenticated ? (
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
          ) : (
            <Button
              id="btn-open-create-table-modal-guest"
              variant="primary"
              size="sm"
              onClick={() => {
                const targetGame = selectedGameFilter !== 'all' ? selectedGameFilter : 'domino_venezolano';
                executeOrPromptLogin({
                  type: 'CREATE_TABLE',
                  gameId: targetGame,
                  tab: 'tables',
                });
              }}
              leftIcon={<PlusCircle className="w-4 h-4 text-slate-950" />}
              className="bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 hover:from-yellow-300 hover:to-yellow-200 text-slate-950 font-black shadow-md shadow-yellow-500/20"
            >
              Inicia sesión para crear mesa
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
                            onClick={() => {
                              if (!user || !canStart || isStartingTable) return;
                              handleStartGameAsHost(activeTable, uniquePlayers);
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
                              ['ACTIVE', 'SALES', 'DRAWING', 'READY', 'FULL'].includes(activeTable.status) ? (
                                <Play className="w-4 h-4 fill-current" />
                              ) : (
                                <Clock className="w-4 h-4 animate-pulse" />
                              )
                            }
                            disabled={
                              !userAlreadySeated ||
                              (!['ACTIVE', 'SALES', 'DRAWING', 'READY', 'FULL'].includes(activeTable.status) && !canStart)
                            }
                            onClick={async () => {
                              if (!user) return;
                              let activeSess = await GameRepository.getActiveSession(activeTable.id);
                              if (!activeSess) {
                                for (let att = 0; att < 6; att++) {
                                  await new Promise((r) => setTimeout(r, 250));
                                  activeSess = await GameRepository.getActiveSession(activeTable.id);
                                  if (activeSess) break;
                                }
                              }
                              setInGameData({
                                table: { ...activeTable, status: 'ACTIVE' },
                                players: uniquePlayers,
                                session: activeSess || undefined,
                              });
                              setActiveTable(null);
                            }}
                          >
                            {!userAlreadySeated
                              ? 'Ocupa un puesto para jugar'
                              : ['ACTIVE', 'SALES', 'DRAWING', 'READY', 'FULL'].includes(activeTable.status) || canStart
                              ? 'ENTRAR A LA PARTIDA'
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

      {/* Modal Unificado de Emparejamiento Rápido (Juega Ya) */}
      <QuickMatchModal
        isOpen={showMatchmakingModal}
        onClose={() => setShowMatchmakingModal(false)}
        initialGameType={selectedGameFilter === 'all' ? undefined : selectedGameFilter}
        onNavigateToTable={async (tableId) => {
          setShowMatchmakingModal(false);
          const tbl = await TableRepository.getTableById(tableId);
          if (tbl) {
            setActiveTable(tbl);
            const plrs = await TableRepository.getTablePlayers(tableId);
            setTablePlayers(plrs);
          }
        }}
      />

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
