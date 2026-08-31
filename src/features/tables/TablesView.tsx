// ==============================================================================
// RASPANDO LA OLLA — VISTA DE MESAS Y MODO TRANCAÍTO (INTEGRACIÓN COMPLETA FASE 4)
// ==============================================================================
// Interfaz interactiva conectada a Supabase:
// - Listado de mesas públicas en tiempo real
// - Búsqueda y unión por código privado "Trancaíto"
// - Creación de mesas con validación de parámetros
// - Asignación de asiento y retención de entrada mediante join_table_transaction()
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../hooks/useAuth';
import { TableRepository } from '../../services/repositories/TableRepository';
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
} from 'lucide-react';
import { MediaBanner } from '../../components/common/MediaBanner';

export function TablesView() {
  const { state, user, profile, isSigningIn, signInWithGoogle } = useAuth();
  const [selectedGameFilter, setSelectedGameFilter] = useState<GameType | 'all'>('all');
  const [publicTables, setPublicTables] = useState<GameTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  // Unirse por código
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [searchingCode, setSearchingCode] = useState(false);

  // Mesa activa / Modal de sala de espera
  const [activeTable, setActiveTable] = useState<GameTable | null>(null);
  const [tablePlayers, setTablePlayers] = useState<TablePlayer[]>([]);
  const [joiningSeat, setJoiningSeat] = useState<number | null>(null);
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

  // Modal de Reglas Oficiales
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesGameId, setRulesGameId] = useState<string>('domino_venezolano');

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

  // Cargar mesas públicas
  const loadPublicTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const filter = selectedGameFilter === 'all' ? undefined : selectedGameFilter;
      const tables = await TableRepository.getPublicTables(filter);
      setPublicTables(tables);
    } catch (err: any) {
      console.error('Error cargando mesas:', err);
    } finally {
      setLoadingTables(false);
    }
  }, [selectedGameFilter]);

  useEffect(() => {
    loadPublicTables();

    // Suscripción en tiempo real a las mesas públicas del lobby
    const unsubscribeLobby = RealtimeManager.subscribeToLobby(() => {
      loadPublicTables();
    });

    return () => {
      unsubscribeLobby();
    };
  }, [loadPublicTables]);

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

    loadTablePlayers(activeTable.id);

    // Suscripción en tiempo real a la mesa y sus jugadores
    const unsubscribeTable = RealtimeManager.subscribeToTable(
      activeTable.id,
      (tablePayload) => {
        if (tablePayload.new) {
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

            // Si el anfitrión inició la partida (estado ACTIVE/IN_PROGRESS), transferir automáticamente a los jugadores sentados a la Arena
            if (newStatus === 'ACTIVE' || newStatus === 'IN_PROGRESS') {
              TableRepository.getTablePlayers(activeTable.id).then((freshPlayers) => {
                const isSeated = freshPlayers.some((p) => p.userId === user?.id && p.status !== 'LEFT');
                if (isSeated) {
                  setInGameData({
                    table: updatedTable,
                    players: freshPlayers,
                  });
                  setActiveTable(null);
                }
              });
            }
          }
        }
      },
      () => {
        loadTablePlayers(activeTable.id);
      }
    );

    return () => {
      unsubscribeTable();
    };
  }, [activeTable?.id, loadTablePlayers]);

  // Unirse por código Trancaíto (Flujo atómico e idempotente con asignación de asiento)
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCode = joinCodeInput.trim();

    console.log('[TRANCAITO_JOIN] Código recibido:', rawCode);

    if (!rawCode) {
      console.warn('[TRANCAITO_JOIN_ERROR] Código vacío');
      setJoinError('Introduce el código de la mesa.');
      return;
    }

    if (!user) {
      console.warn('[TRANCAITO_JOIN_ERROR] Usuario no autenticado');
      setJoinError('Debes iniciar sesión para unirte a una mesa.');
      return;
    }

    setJoinError(null);
    setSearchingCode(true);

    try {
      console.log('[TRANCAITO_JOIN] Buscando mesa');
      console.log('[TRANCAITO_JOIN] Validando estado');
      console.log('[TRANCAITO_JOIN] Validando jugador');
      console.log('[TRANCAITO_JOIN] Buscando asiento');

      const result = await TableRepository.joinTableByCode(rawCode);

      if (!result.success || !result.table) {
        console.warn('[TRANCAITO_JOIN_ERROR]', {
          code: rawCode,
          error: result.error,
          userId: user.id,
        });
        setJoinError(result.error || 'Código de Trancaíto no encontrado.');
        return;
      }

      console.log('[TRANCAITO_JOIN] Mesa encontrada:', result.table.id);
      console.log('[TRANCAITO_JOIN] Asiento asignado:', result.seatNumber);
      console.log('[TRANCAITO_JOIN] Jugador registrado');

      // Obtener lista completa de jugadores de la mesa
      const players = await TableRepository.getTablePlayers(result.table.id);

      console.log('[TRANCAITO_JOIN] Realtime emitido');

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

      console.log('[TRANCAITO_JOIN] JOIN COMPLETADO');
    } catch (err: any) {
      console.error('[TRANCAITO_JOIN_ERROR]', {
        code: rawCode,
        userId: user?.id,
        error: err,
      });
      setJoinError(sanitizeUserErrorMessage(err, 'No fue posible unirte a la mesa.'));
    } finally {
      setSearchingCode(false);
    }
  };

  // Tomar asiento en la mesa mediante RPC join_table_transaction
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
    if (!isAuthenticated) {
      setCreateError('Debes iniciar sesión para crear una mesa.');
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
      {/* Zona Publicitaria de Juegos */}
      <MediaBanner location="GAMES" />

      {/* Encabezado */}
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

        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <Button
              id="btn-open-create-table-modal"
              variant="primary"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              leftIcon={<PlusCircle className="w-4 h-4" />}
            >
              Crear Nueva Mesa
            </Button>
          )}
        </div>
      </div>

      {/* Grid: Unirse por Código & Banner Trancaíto */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Unirse con Código */}
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
                className="w-full text-xs font-semibold shadow-md shadow-amber-950/40"
                onClick={signInWithGoogle}
                disabled={isSigningIn}
                leftIcon={isSigningIn ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : undefined}
              >
                {isSigningIn ? 'Conectando con Google...' : 'Continuar con Google para unirte'}
              </Button>
            )}
          </form>
        </Card>

        {/* Información y Garantías */}
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
                onClick={signInWithGoogle}
                disabled={isSigningIn}
                leftIcon={isSigningIn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
              >
                {isSigningIn ? 'Conectando...' : 'Iniciar Sesión'}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Explorador de Mesas Públicas */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-100">Mesas Públicas Disponibles</h2>
            <button
              onClick={loadPublicTables}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refrescar mesas"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTables ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Filtros por Juego */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              onClick={() => setSelectedGameFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedGameFilter === 'all'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos los juegos
            </button>
            {SUPPORTED_GAMES_METADATA.map((game) => (
              <button
                key={game.id}
                onClick={() => setSelectedGameFilter(game.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedGameFilter === game.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {game.name}
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Mesas */}
        {publicTables.length === 0 ? (
          <div className="py-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-slate-400 text-xs">
              {loadingTables ? 'Cargando mesas disponibles...' : 'No hay mesas públicas abiertas en este momento.'}
            </div>
            {isAuthenticated && !loadingTables && (
              <Button
                variant="outline"
                size="sm"
                className="text-amber-300 border-amber-500/30"
                onClick={() => {
                  setCreateIsPrivate(false);
                  setShowCreateModal(true);
                }}
              >
                Abrir la primera mesa
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicTables.map((table) => {
              const gameMeta = SUPPORTED_GAMES_METADATA.find((g) => g.id === table.gameType);
              const isFull = table.currentPlayersCount >= table.maxPlayers;

              return (
                <Card
                  key={table.id}
                  id={`table-card-${table.id}`}
                  className="hover:border-amber-500/30 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-100 text-sm">{table.name || gameMeta?.name || table.gameType}</h3>
                        <span className="text-[11px] text-slate-400">{gameMeta?.name}</span>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                          isFull
                            ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                            : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        }`}
                      >
                        {isFull ? 'Completa' : 'Abierta'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {table.currentPlayersCount} / {table.maxPlayers} jug.
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 font-mono font-semibold text-amber-300">
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                        <span>{formatBolivares(table.entryFee)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-2">
                    <Button
                      id={`btn-view-table-${table.id}`}
                      variant={isFull ? 'secondary' : 'primary'}
                      size="sm"
                      className="w-full text-xs font-semibold"
                      onClick={() => setActiveTable(table)}
                    >
                      {isFull ? 'Ver Mesa (Espectador)' : 'Ingresar a la Sala'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal / Sala de Mesa Activa */}
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

            {/* Asientos de la Mesa */}
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

                    {/* Acciones de la Sala */}
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
                            disabled={!canStart}
                            onClick={async () => {
                              if (!user || !canStart) return;
                              try {
                                await TableRepository.startGameSession(activeTable.id);
                              } catch (e) {
                                console.warn('Session already started or host auto-start:', e);
                              }
                              setInGameData({
                                table: activeTable,
                                players: uniquePlayers,
                              });
                              setActiveTable(null);
                            }}
                          >
                            {canStart
                              ? 'INICIAR PARTIDA'
                              : `Esperando Jugadores (${uniquePlayers.length}/${minRequired})`}
                          </Button>
                        ) : (
                          <Button
                            id="btn-enter-game-arena"
                            variant="primary"
                            size="sm"
                            leftIcon={
                              activeTable.status === 'ACTIVE' || activeTable.status === 'IN_PROGRESS' ? (
                                <Play className="w-4 h-4 fill-current" />
                              ) : (
                                <Clock className="w-4 h-4 animate-pulse" />
                              )
                            }
                            disabled={
                              !userAlreadySeated ||
                              (activeTable.status !== 'ACTIVE' && activeTable.status !== 'IN_PROGRESS')
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
                              : activeTable.status === 'ACTIVE' || activeTable.status === 'IN_PROGRESS'
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

      {/* Modal Crear Mesa */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between sticky top-0 bg-slate-900 pt-1 pb-2 border-b border-slate-800/80 z-10">
              <h2 className="text-base sm:text-lg font-black text-slate-100 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>{createIsPrivate ? 'Crear Mesa Privada ("Trancaíto")' : 'Crear Mesa Pública'}</span>
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTableSubmit} className="space-y-4 text-xs">
              {/* Selección de Juego */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Seleccionar Juego</label>
                <select
                  value={createGameType}
                  onChange={(e) => {
                    const g = e.target.value as GameType;
                    setCreateGameType(g);
                    const meta = SUPPORTED_GAMES_METADATA.find((m) => m.id === g);
                    if (meta) {
                      setCreateEntryFee(meta.minEntryFee);
                      setCreateMaxPlayers(meta.maxPlayers);
                      setCreateMode(meta.allowedModes[0]);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  {SUPPORTED_GAMES_METADATA.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.name} ({game.minPlayers}-{game.maxPlayers} jug.)
                    </option>
                  ))}
                </select>
              </div>

              {/* Nombre Opcional */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Nombre de la Mesa (Opcional)</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ej: Mesa de los panas"
                  maxLength={40}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Costo de Entrada con Montos Oficiales Dinámicos */}
              <div>
                <label className="block font-medium text-slate-300 mb-1 flex items-center justify-between">
                  <span>Monto de participación</span>
                  <span className="text-[10px] text-amber-400 font-mono font-bold">90% al Ganador / 10% Plataforma</span>
                </label>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Mínimo: <strong className="text-slate-200 font-mono">25 Bs.</strong> | Máximo: <strong className="text-slate-200 font-mono">5.000 Bs.</strong></span>
                  <span className="text-slate-400 font-mono text-[11px]">{formatUsd(createEntryFee)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {availableFees.map((fee) => (
                    <button
                      key={fee}
                      type="button"
                      onClick={() => setCreateEntryFee(fee)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition ${
                        createEntryFee === fee
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {fee} Bs.
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Monto Personalizado (Bs.)</label>
                    <input
                      type="number"
                      value={createEntryFee}
                      min={25}
                      max={5000}
                      onChange={(e) => setCreateEntryFee(Number(e.target.value))}
                      className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-xl text-slate-100 font-mono focus:outline-none ${
                        createEntryFee < 25 || createEntryFee > 5000
                          ? 'border-red-500 text-red-300'
                          : 'border-slate-700 focus:border-amber-500'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Máx Jugadores</label>
                    <input
                      type="number"
                      value={createMaxPlayers}
                      min={2}
                      max={100}
                      onChange={(e) => setCreateMaxPlayers(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                {(createEntryFee < 25 || createEntryFee > 5000) && (
                  <p className="mt-1.5 text-xs text-red-400 font-medium">
                    El monto de participación debe estar entre 25 Bs. y 5.000 Bs.
                  </p>
                )}
              </div>

              {/* Privacidad */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Mesa Privada ("Trancaíto")</div>
                  <div className="text-[11px] text-slate-400">Sólo jugadores con el código podrán acceder</div>
                </div>
                <input
                  type="checkbox"
                  checked={createIsPrivate}
                  onChange={(e) => setCreateIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
              </div>

              {createError && (
                <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={creating || createEntryFee < 25 || createEntryFee > 5000}>
                  {creating ? 'Creando Mesa...' : 'Publicar Mesa'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Reglas Oficiales */}
      <GameRulesModal
        isOpen={showRulesModal}
        defaultGameId={rulesGameId}
        onClose={() => setShowRulesModal(false)}
      />

      {/* Regla de Seguridad */}
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
