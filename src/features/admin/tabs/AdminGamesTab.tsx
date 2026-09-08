// ==============================================================================
// RASPANDO LA OLLA — TAB 8: CONTROL CENTRAL DE DISPONIBILIDAD DE JUEGOS
// ==============================================================================
// Panel Administrativo para Habilitar y Deshabilitar Motores de Juego.
// Persistencia en Supabase, auditoría obligatoria y propagación en Realtime.
// ==============================================================================

import React, { useState } from 'react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { formatBolivares } from '../../../utils/formatters';
import { useGameAvailability, normalizeCanonicalGameId } from '../../../context/GameAvailabilityContext';
import type { AdminGameItem } from '../../../types/admin';
import {
  Gamepad2,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  TrendingUp,
  Table,
  ShieldAlert,
  AlertTriangle,
  X,
  Clock,
  Search,
  Filter,
  RefreshCw,
} from 'lucide-react';

interface AdminGamesTabProps {
  games: AdminGameItem[];
  onRefresh: () => void;
}

export function AdminGamesTab({ games, onRefresh }: AdminGamesTabProps) {
  const { setGameEnabled, getGameState, isGameEnabled, getGameDisabledReason } = useGameAvailability();

  // Estados para búsqueda y filtrado
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ENABLED' | 'DISABLED'>('ALL');

  // Estado del modal de confirmación
  const [selectedGame, setSelectedGame] = useState<AdminGameItem | null>(null);
  const [actionType, setActionType] = useState<'ENABLE' | 'DISABLE' | null>(null);
  const [disableReason, setDisableReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Abrir modal para deshabilitar
  const handleOpenDisableModal = (game: AdminGameItem) => {
    setSelectedGame(game);
    setActionType('DISABLE');
    setDisableReason('');
    setActionFeedback(null);
  };

  // Abrir modal para habilitar
  const handleOpenEnableModal = (game: AdminGameItem) => {
    setSelectedGame(game);
    setActionType('ENABLE');
    setActionFeedback(null);
  };

  // Cerrar cualquier modal
  const handleCloseModal = () => {
    if (isSubmitting) return;
    setSelectedGame(null);
    setActionType(null);
    setDisableReason('');
  };

  // Ejecutar cambio de estado
  const handleConfirmAction = async () => {
    if (!selectedGame || !actionType) return;

    if (actionType === 'DISABLE' && (!disableReason || disableReason.trim().length < 3)) {
      setActionFeedback({
        type: 'error',
        message: 'Debes ingresar un motivo válido (mínimo 3 caracteres) para deshabilitar el juego.',
      });
      return;
    }

    setIsSubmitting(true);
    setActionFeedback(null);

    const targetEnabled = actionType === 'ENABLE';
    const canonicalId = normalizeCanonicalGameId(selectedGame.id);

    try {
      const result = await setGameEnabled(
        canonicalId,
        targetEnabled,
        targetEnabled ? undefined : disableReason.trim()
      );

      if (result.success) {
        setActionFeedback({
          type: 'success',
          message: targetEnabled
            ? `¡El juego "${selectedGame.name}" ha sido habilitado exitosamente en toda la plataforma!`
            : `¡El juego "${selectedGame.name}" ha sido deshabilitado correctamente y ocultado de la interfaz!`,
        });

        setTimeout(() => {
          handleCloseModal();
          onRefresh();
        }, 1200);
      } else {
        setActionFeedback({
          type: 'error',
          message: result.error || 'No se pudo actualizar la disponibilidad del juego.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionFeedback({
        type: 'error',
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtrado de juegos
  const filteredGames = games.filter((game) => {
    const canonicalId = normalizeCanonicalGameId(game.id);
    const contextState = getGameState(canonicalId);

    // Estado efectivo (priorizando el contexto en tiempo real)
    const effectiveEnabled = contextState !== undefined ? contextState.enabled : (game.enabled !== false && game.isActive !== false);

    // Filtro de texto
    const matchesSearch =
      game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      game.shortDescription.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Filtro de estado
    if (statusFilter === 'ENABLED') return effectiveEnabled;
    if (statusFilter === 'DISABLED') return !effectiveEnabled;
    return true;
  });

  const totalEnabled = games.filter((g) => {
    const s = getGameState(normalizeCanonicalGameId(g.id));
    return s !== undefined ? s.enabled : (g.enabled !== false && g.isActive !== false);
  }).length;

  const totalDisabled = games.length - totalEnabled;

  return (
    <div className="space-y-6" id="tab-admin-games">
      {/* 1. CABECERA Y RESUMEN GENERAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Gamepad2 className="w-5 h-5 text-amber-400" />
            <h3 className="font-black text-slate-100 text-base sm:text-lg tracking-wide">
              Control Central de Disponibilidad de Juegos ({games.length})
            </h3>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Habilita o deshabilita juegos en tiempo real. Al desactivar un juego, desaparecerá automáticamente de la interfaz visual para los jugadores y quedará protegido a nivel de backend.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-refresh-admin-games"
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700"
            title="Refrescar catálogo y estados"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span>Refrescar</span>
          </button>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS Y ESTADÍSTICAS RÁPIDAS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Chips de Estado */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos ({games.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ENABLED')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ENABLED'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'bg-slate-900 border border-slate-800 text-emerald-400 hover:bg-emerald-500/10'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Habilitados ({totalEnabled})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('DISABLED')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'DISABLED'
                ? 'bg-red-500 text-white shadow-md font-black'
                : 'bg-slate-900 border border-slate-800 text-red-400 hover:bg-red-500/10'
            }`}
          >
            <PauseCircle className="w-3.5 h-3.5" />
            <span>Deshabilitados ({totalDisabled})</span>
          </button>
        </div>

        {/* Buscador de Juego */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      {/* 3. GRID DE TARJETAS DE JUEGOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredGames.map((game) => {
          const canonicalId = normalizeCanonicalGameId(game.id);
          const contextState = getGameState(canonicalId);
          const isEnabled = contextState !== undefined ? contextState.enabled : (game.enabled !== false && game.isActive !== false);
          const reason = contextState?.disabledReason || game.disabledReason;
          const disabledAt = contextState?.disabledAt || game.disabledAt;

          return (
            <Card
              key={game.id}
              id={`card-admin-game-${game.id}`}
              className={`flex flex-col justify-between transition-all duration-200 ${
                isEnabled
                  ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  : 'bg-red-950/20 border-red-500/30'
              }`}
              header={
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-sm text-slate-100 truncate">{game.name}</span>
                  {isEnabled ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      HABILITADO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30 shrink-0">
                      <PauseCircle className="w-3 h-3" />
                      DESHABILITADO
                    </span>
                  )}
                </div>
              }
            >
              <div className="space-y-3 text-xs flex-1 flex flex-col justify-between">
                <p className="text-slate-400 text-[11px] line-clamp-2">{game.shortDescription}</p>

                {/* Parámetros Operativos */}
                <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-850">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Jugadores</span>
                    <span className="font-semibold text-slate-200">
                      {game.minPlayers} a {game.maxPlayers}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Entradas</span>
                    <span className="font-mono font-semibold text-amber-300">
                      {formatBolivares(game.minEntryFee)} - {formatBolivares(game.maxEntryFee)}
                    </span>
                  </div>
                </div>

                {/* Métricas de Partidas */}
                <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-850">
                  <span className="flex items-center gap-1">
                    <Table className="w-3.5 h-3.5 text-indigo-400" />
                    {game.activeTables} mesas
                  </span>
                  <span className="flex items-center gap-1 font-mono text-emerald-400 font-semibold">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {formatBolivares(game.totalVolume)}
                  </span>
                </div>

                {/* Motivo de desactivación si está inactivo */}
                {!isEnabled && (
                  <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/40 text-[11px] text-red-300 space-y-1">
                    <div className="flex items-center gap-1 font-bold text-red-400 uppercase text-[10px]">
                      <ShieldAlert className="w-3 h-3" />
                      Motivo de suspensión:
                    </div>
                    <p className="italic text-slate-300 line-clamp-2">
                      {reason || 'Mantenimiento preventivo por el administrador.'}
                    </p>
                    {disabledAt && (
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{new Date(disabledAt).toLocaleString('es-VE')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Botón de Acción Administrativa Directo */}
                <div className="pt-2">
                  {isEnabled ? (
                    <Button
                      id={`btn-disable-game-${game.id}`}
                      variant="outline"
                      onClick={() => handleOpenDisableModal(game)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-red-300 hover:text-red-100 hover:bg-red-500/20 border-red-500/40 cursor-pointer rounded-xl transition-all"
                    >
                      <PauseCircle className="w-4 h-4 text-red-400" />
                      <span>Deshabilitar Juego</span>
                    </Button>
                  ) : (
                    <Button
                      id={`btn-enable-game-${game.id}`}
                      variant="primary"
                      onClick={() => handleOpenEnableModal(game)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 border-emerald-500 cursor-pointer rounded-xl transition-all shadow-md shadow-emerald-500/20"
                    >
                      <PlayCircle className="w-4 h-4" />
                      <span>Habilitar Juego</span>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 4. MODAL DE CONFIRMACIÓN PARA DESHABILITAR JUEGO */}
      {selectedGame && actionType === 'DISABLE' && (
        <div
          id="modal-disable-game"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-slate-900 border border-red-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-red-400">
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-slate-100 text-base">Deshabilitar Juego</h4>
                  <p className="text-[11px] text-slate-400">{selectedGame.name}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p className="leading-relaxed">
                Al deshabilitar este juego, <strong>desaparecerá inmediatamente de toda la interfaz pública</strong> para los jugadores (Lobby, catálogo, selector de creación de mesas y drawer lateral).
              </p>
              <p className="text-amber-300/90 text-[11px] bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl">
                ⚠️ Las RPCs de creación de mesas y unión de partidas rechazarán cualquier intento de jugar mientras esté inactivo. Los saldos e historiales permanecen intactos.
              </p>

              {/* Campo obligatorio para el motivo */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-slate-200">
                  Motivo de desactivación <span className="text-red-400">* (Obligatorio)</span>:
                </label>
                <textarea
                  id="input-disable-reason"
                  rows={3}
                  value={disableReason}
                  onChange={(e) => setDisableReason(e.target.value)}
                  placeholder="Ej: Mantenimiento del motor, balance de reglas, actualización..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500 transition-colors"
                />
                <span className="text-[10px] text-slate-500">
                  {disableReason.trim().length} / 3 caracteres mínimos requeridos
                </span>
              </div>
            </div>

            {/* Retroalimentación de error o éxito */}
            {actionFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  actionFeedback.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}
              >
                {actionFeedback.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                id="btn-confirm-disable-game"
                variant="danger"
                onClick={handleConfirmAction}
                disabled={isSubmitting || disableReason.trim().length < 3}
                className="px-4 py-2 text-xs rounded-xl flex items-center gap-1.5 font-bold"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deshabilitando...</span>
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>Confirmar Deshabilitación</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL DE CONFIRMACIÓN PARA HABILITAR JUEGO */}
      {selectedGame && actionType === 'ENABLE' && (
        <div
          id="modal-enable-game"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <PlayCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-slate-100 text-base">Habilitar Juego</h4>
                  <p className="text-[11px] text-slate-400">{selectedGame.name}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p className="leading-relaxed">
                ¿Deseas volver a habilitar <strong>{selectedGame.name}</strong> para todos los jugadores?
              </p>
              <p className="text-emerald-300/90 text-[11px] bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl">
                ✓ El juego reaparecerá de inmediato en el Lobby, catálogo, ExploreDrawer y menú de creación de mesas.
              </p>
            </div>

            {/* Retroalimentación */}
            {actionFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-bold ${
                  actionFeedback.type === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}
              >
                {actionFeedback.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                id="btn-confirm-enable-game"
                variant="primary"
                onClick={handleConfirmAction}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs rounded-xl flex items-center gap-1.5 font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 border-emerald-500"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Habilitando...</span>
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Habilitar Juego</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
