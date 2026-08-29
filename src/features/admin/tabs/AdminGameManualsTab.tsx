import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Edit,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Gamepad2,
  Users,
  Award,
  ShieldAlert,
  Clock,
  Sparkles
} from 'lucide-react';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import type { GameConfigItem, GameManualItem } from '../../../types/admin';

export const AdminGameManualsTab: React.FC = () => {
  const [configs, setConfigs] = useState<GameConfigItem[]>([]);
  const [manuals, setManuals] = useState<GameManualItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [selectedGameId, setSelectedGameId] = useState<string>('domino_venezolano');
  const [editingManual, setEditingManual] = useState<GameManualItem | null>(null);
  const [editingConfig, setEditingConfig] = useState<GameConfigItem | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgs, mans] = await Promise.all([
        AdminRepository.getGameConfigsList(),
        AdminRepository.getGameManualsList(),
      ]);
      setConfigs(cfgs);
      setManuals(mans);

      const curManual = mans.find((m) => m.gameId === selectedGameId);
      const curConfig = cfgs.find((c) => c.gameId === selectedGameId);
      if (curManual) setEditingManual({ ...curManual });
      if (curConfig) setEditingConfig({ ...curConfig });
    } catch (err: any) {
      setError('Error al cargar manuales y configuraciones de juegos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectGame = (gameId: string) => {
    setSelectedGameId(gameId);
    const man = manuals.find((m) => m.gameId === gameId);
    const cfg = configs.find((c) => c.gameId === gameId);
    if (man) {
      setEditingManual({ ...man });
    } else {
      setEditingManual({
        gameId,
        title: `Manual Oficial de ${gameId}`,
        objective: 'Objetivo del juego...',
        playersInfo: '2 a 4 jugadores',
        preparation: 'Preparación de la partida...',
        turnRules: 'Reglas de turnos...',
        winningRules: 'Condiciones de victoria...',
        scoringRules: 'Puntuación...',
        disconnectionRules: '60 segundos de gracia...',
        cancellationRules: '100% de reembolso si se cancela antes de iniciar...',
        fullContentMarkdown: '# Reglas Oficiales\n\n...',
        updatedAt: new Date().toISOString(),
      });
    }

    if (cfg) {
      setEditingConfig({ ...cfg });
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingManual || !editingConfig) return;

    setSaving(true);
    setError(null);
    try {
      const [resMan, resCfg] = await Promise.all([
        AdminRepository.saveGameManual(editingManual),
        AdminRepository.saveGameConfig(editingConfig),
      ]);

      if (resMan.success && resCfg.success) {
        setSuccessMsg('Manual y configuración del juego guardados exitosamente.');
        await loadData();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(resMan.error || resCfg.error || 'Error al guardar.');
      }
    } catch (err: any) {
      setError(err.message || 'Excepción al guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="admin-game-manuals-tab" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Manuales Oficiales y Reglas ("¿Cómo Jugar?")</h2>
          </div>
          <p className="text-sm text-slate-400">
            Administra los 8 juegos tradicionales venezolanos, sus reglas oficiales, condiciones de desconexión y parámetros operativos.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm flex items-center gap-2 border border-slate-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Selector de Juegos a la izquierda, Editor a la derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Selector de Juegos */}
        <div className="lg:col-span-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2 mb-2">
            8 Juegos Tradicionales
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-2 space-y-1.5">
            {configs.map((game) => {
              const isSelected = game.gameId === selectedGameId;
              return (
                <button
                  key={game.gameId}
                  onClick={() => handleSelectGame(game.gameId)}
                  className={`w-full text-left p-3.5 rounded-xl transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                      : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                      <Gamepad2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{game.name}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[180px]">{game.shortDescription}</div>
                    </div>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${game.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor de Manual y Configuración */}
        <div className="lg:col-span-8">
          {editingConfig && editingManual ? (
            <form onSubmit={handleSaveAll} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Edit className="w-5 h-5 text-amber-400" />
                    Editando: {editingConfig.name}
                  </h3>
                  <p className="text-xs text-slate-400">ID del Juego: <code className="font-mono text-amber-400/80">{editingConfig.gameId}</code></p>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-amber-600/20 disabled:opacity-50 transition"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Guardando...' : 'Guardar Todo'}
                </button>
              </div>

              {/* Parámetros Operativos del Juego */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Estado Operativo
                  </label>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="checkbox"
                      id="game-active-toggle"
                      checked={editingConfig.isActive}
                      onChange={(e) => setEditingConfig({ ...editingConfig, isActive: e.target.checked })}
                      className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="game-active-toggle" className="text-sm font-medium text-slate-200 cursor-pointer">
                      Juego Habilitado en Lobby
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Mensaje de Mantenimiento
                  </label>
                  <input
                    type="text"
                    value={editingConfig.maintenanceMessage || ''}
                    onChange={(e) => setEditingConfig({ ...editingConfig, maintenanceMessage: e.target.value })}
                    placeholder="Ej: En actualización de reglas..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Jugadores (Mín - Máx)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={editingConfig.minPlayers}
                      onChange={(e) => setEditingConfig({ ...editingConfig, minPlayers: parseInt(e.target.value, 10) || 2 })}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      min={2}
                    />
                    <input
                      type="number"
                      value={editingConfig.maxPlayers}
                      onChange={(e) => setEditingConfig({ ...editingConfig, maxPlayers: parseInt(e.target.value, 10) || 4 })}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      min={2}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Límites de Entrada (Bs.)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={editingConfig.minEntryFee}
                      onChange={(e) => setEditingConfig({ ...editingConfig, minEntryFee: parseFloat(e.target.value) || 20 })}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      placeholder="Mín"
                    />
                    <input
                      type="number"
                      value={editingConfig.maxEntryFee}
                      onChange={(e) => setEditingConfig({ ...editingConfig, maxEntryFee: parseFloat(e.target.value) || 2000 })}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      placeholder="Máx"
                    />
                  </div>
                </div>
              </div>

              {/* Secciones del Manual Oficial */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Título Oficial del Manual
                  </label>
                  <input
                    type="text"
                    value={editingManual.title}
                    onChange={(e) => setEditingManual({ ...editingManual, title: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 font-semibold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Objetivo Principal
                    </label>
                    <textarea
                      rows={3}
                      value={editingManual.objective}
                      onChange={(e) => setEditingManual({ ...editingManual, objective: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Preparación de Partida
                    </label>
                    <textarea
                      rows={3}
                      value={editingManual.preparation}
                      onChange={(e) => setEditingManual({ ...editingManual, preparation: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Reglas de Turnos y Jugabilidad
                    </label>
                    <textarea
                      rows={3}
                      value={editingManual.turnRules}
                      onChange={(e) => setEditingManual({ ...editingManual, turnRules: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Condiciones de Victoria
                    </label>
                    <textarea
                      rows={3}
                      value={editingManual.winningRules}
                      onChange={(e) => setEditingManual({ ...editingManual, winningRules: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Reglas de Desconexión / Abandono
                    </label>
                    <textarea
                      rows={2}
                      value={editingManual.disconnectionRules}
                      onChange={(e) => setEditingManual({ ...editingManual, disconnectionRules: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Políticas de Cancelación y Reembolso
                    </label>
                    <textarea
                      rows={2}
                      value={editingManual.cancellationRules}
                      onChange={(e) => setEditingManual({ ...editingManual, cancellationRules: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
              Selecciona un juego para editar sus reglas oficiales.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
