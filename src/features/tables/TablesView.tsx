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
import { SUPPORTED_GAMES_METADATA, FINANCIAL_RULES } from '../../utils/constants';
import { formatBolivares } from '../../utils/formatters';
import type { GameTable, TablePlayer } from '../../types/tables';
import type { GameType, GameMode } from '../../types/games';
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
  Play,
} from 'lucide-react';

export function TablesView() {
  const { state, user, signInWithGoogle } = useAuth();
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

  // Modal de Crear Mesa
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createGameType, setCreateGameType] = useState<GameType>('domino_venezolano');
  const [createMode, setCreateMode] = useState<GameMode>('1v1');
  const [createName, setCreateName] = useState('');
  const [createEntryFee, setCreateEntryFee] = useState<number>(25);
  const [createMaxPlayers, setCreateMaxPlayers] = useState<number>(4);
  const [createIsPrivate, setCreateIsPrivate] = useState<boolean>(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isAuthenticated = state === 'authenticated' && user !== null;

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
          setActiveTable((prev) => (prev ? { ...prev, ...tablePayload.new } : null));
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

  // Buscar mesa por código
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;

    setJoinError(null);
    setSearchingCode(true);

    try {
      const table = await TableRepository.getTableByJoinCode(joinCodeInput.trim());
      if (!table) {
        setJoinError(`No se encontró ninguna mesa con el código "${joinCodeInput.trim()}".`);
      } else {
        setActiveTable(table);
        setJoinCodeInput('');
      }
    } catch (err: any) {
      setJoinError(err.message || 'Error al buscar la mesa');
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
          message: result.error || 'No se pudo ocupar el asiento. Verifica tu saldo disponible.',
        });
      }
    } catch (err: any) {
      setSeatActionFeedback({
        success: false,
        message: err.message || 'Error al procesar la unión a la mesa.',
      });
    } finally {
      setJoiningSeat(null);
    }
  };

  // Crear mesa
  const handleCreateTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return;

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
        setCreateError('Error al crear la mesa en la base de datos.');
      }
    } catch (err: any) {
      setCreateError(err.message || 'Error al crear la mesa');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div id="tables-view" className="space-y-8 max-w-6xl mx-auto">
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
                Código de Mesa (Token Público)
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
                className="w-full"
                rightIcon={<ArrowRight className="w-4 h-4" />}
                disabled={!joinCodeInput.trim() || searchingCode}
              >
                {searchingCode ? 'Buscando...' : 'Buscar Mesa'}
              </Button>
            ) : (
              <Button
                id="btn-login-to-join"
                type="button"
                variant="secondary"
                className="w-full text-xs"
                onClick={signInWithGoogle}
              >
                Inicia sesión para unirte
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
              <Button id="btn-login-trancaito" variant="secondary" size="sm" onClick={signInWithGoogle}>
                Iniciar Sesión
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
              {loadingTables ? 'Consultando mesas en Supabase...' : 'No hay mesas públicas abiertas en este momento.'}
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase">
                    {activeTable.isPrivate ? 'Mesa Trancaíto' : 'Mesa Pública'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{activeTable.joinCode}</span>
                </div>
                <h2 className="text-xl font-black text-slate-100 mt-1">
                  {activeTable.name || `Mesa de ${activeTable.gameType}`}
                </h2>
                <p className="text-xs text-slate-400">
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
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
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
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Asientos de la Mesa ({tablePlayers.length}/{activeTable.maxPlayers})
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: activeTable.maxPlayers }, (_, i) => i + 1).map((seatNum) => {
                  const playerAtSeat = tablePlayers.find(
                    (p) => p.seatNumber === seatNum || p.seatIndex === seatNum - 1
                  );
                  const isCurrentPlayer = playerAtSeat?.userId === user?.id;

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
                        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-mono text-xs font-bold text-slate-300">
                          #{seatNum}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-200">
                            {playerAtSeat ? playerAtSeat.displayName : 'Asiento Disponible'}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {playerAtSeat ? (isCurrentPlayer ? '(Tú)' : 'Listo') : 'Vacante'}
                          </div>
                        </div>
                      </div>

                      <div>
                        {playerAtSeat ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                            Ocupado
                          </span>
                        ) : isAuthenticated ? (
                          <Button
                            size="sm"
                            variant="primary"
                            className="text-xs py-1 px-3"
                            disabled={joiningSeat !== null}
                            onClick={() => handleTakeSeat(seatNum)}
                          >
                            {joiningSeat === seatNum ? 'Ocupando...' : 'Tomar Asiento'}
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-500">Inicia sesión</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Acciones de la Sala */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Comparte este código para invitar: <strong className="text-amber-300 font-mono">{activeTable.joinCode}</strong>
              </div>

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
        </div>
      )}

      {/* Modal Crear Mesa */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-amber-400" />
                <span>{createIsPrivate ? 'Crear Mesa Privada ("Trancaíto")' : 'Crear Mesa Pública'}</span>
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
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

              {/* Costo de Entrada */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Costo de Entrada (Bs.)</label>
                  <input
                    type="number"
                    value={createEntryFee}
                    min={1}
                    max={10000}
                    onChange={(e) => setCreateEntryFee(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Máximo de Jugadores</label>
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
                <Button type="submit" variant="primary" disabled={creating}>
                  {creating ? 'Creando Mesa...' : 'Publicar Mesa'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Regla de Seguridad */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3 text-xs text-slate-400">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-300">Seguridad de Mesa y Liquidación: </strong>
          Toda validación de acceso, saldo suficiente y deducción transaccional se realiza de forma atómica en Supabase.
          El cliente jamás calcula pozos ni saldos finales.
        </div>
      </div>
    </div>
  );
}
