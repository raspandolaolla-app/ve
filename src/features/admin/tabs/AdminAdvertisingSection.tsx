// ==============================================================================
// RASPANDO LA OLLA — PANEL ADMINISTRATIVO DE PUBLICIDAD (ADS GITHUB + SUPABASE)
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { AdvertisingLibraryService } from '../../../services/advertising/AdvertisingLibraryService';
import { AdvertisingRepository } from '../../../services/advertising/AdvertisingRepository';
import { AdvertisingAssetProvider } from '../../../services/advertising/AdvertisingAssetProvider';
import type {
  AdvertisingAsset,
  AdvertisingCampaign,
  AdvertisingLibraryScanResult,
  AdPlacement,
  AdDeviceType,
  AdOrientation,
} from '../../../types/advertising';
import {
  Sparkles,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  FileCheck,
  AlertTriangle,
  Play,
  Image as ImageIcon,
  Video as VideoIcon,
  Tv,
  Layers,
  ArrowUp,
  ArrowDown,
  Globe,
  Sliders,
} from 'lucide-react';

const PLACEMENT_OPTIONS: Array<{ value: AdPlacement; label: string }> = [
  { value: 'HOME_TOP', label: '🏠 Lobby - Superior (Home Top)' },
  { value: 'HOME_MIDDLE', label: '🌟 Lobby - Intermedio (Home Middle)' },
  { value: 'HOME_BOTTOM', label: '🔻 Lobby - Inferior (Home Bottom)' },
  { value: 'LOBBY', label: '🎲 Mesas - General (Lobby)' },
  { value: 'GAME_HEADER', label: '🎮 Mesas - Encabezado (Game Header)' },
  { value: 'GAME_RESULT', label: '🏆 Partida - Resultado (Game Result)' },
  { value: 'GAME_DOMINO', label: '🀄 Partida - Dominó' },
  { value: 'GAME_TRUCO', label: '🃏 Partida - Truco' },
  { value: 'GAME_BINGO', label: '🎱 Partida - Bingo' },
  { value: 'GAME_POLLA', label: '🎟️ Partida - Polla' },
];

export function AdminAdvertisingSection() {
  const [assets, setAssets] = useState<AdvertisingAsset[]>([]);
  const [campaigns, setCampaigns] = useState<AdvertisingCampaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<AdvertisingLibraryScanResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Formulario modal de Campaña
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCampaign, setEditingCampaign] = useState<Partial<AdvertisingCampaign> | null>(null);
  const [savingCampaign, setSavingCampaign] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsData, campaignsData] = await Promise.all([
        AdvertisingRepository.getAssets(true),
        AdvertisingRepository.getAllCampaignsForAdmin(),
      ]);
      setAssets(assetsData);
      setCampaigns(campaignsData);
    } catch (err) {
      console.error('[AdminAdvertisingSection] Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Escanear catálogo de manifest.json en GitHub Pages / Local
  const handleScanManifest = async () => {
    setScanning(true);
    setSyncStatus('Leyendo manifest.json de la biblioteca de anuncios...');
    try {
      const result = await AdvertisingLibraryService.scanLibrary();
      setScanResult(result);

      if (result.success && result.validAssetsCount > 0) {
        setSyncStatus(`Sincronizando ${result.validAssetsCount} assets con Supabase...`);
        const syncRes = await AdvertisingLibraryService.syncScanWithSupabase(result);
        if (syncRes.error) {
          setSyncStatus(`Advertencia al sincronizar: ${syncRes.error}`);
        } else {
          setSyncStatus(`¡Éxito! ${syncRes.syncedCount} assets sincronizados correctamente.`);
          await loadData();
        }
      } else {
        setSyncStatus('Escaneo completado. No se encontraron nuevos assets válidos.');
      }
    } catch (err: any) {
      setSyncStatus(`Error en escaneo: ${err?.message || 'Error desconocido'}`);
    } finally {
      setScanning(false);
    }
  };

  // Abrir Modal de Creación
  const handleCreateCampaign = () => {
    setEditingCampaign({
      name: '',
      assetId: assets.length > 0 ? assets[0].id : null,
      active: true,
      priority: campaigns.length > 0 ? Math.max(...campaigns.map((c) => c.priority)) + 1 : 10,
      placement: 'HOME_TOP',
      gameType: null,
      deviceType: 'ALL',
      orientation: 'ANY',
      targetUrl: 'polla',
      ctaText: 'VER MÁS',
      displayDurationSeconds: 10,
    });
    setIsModalOpen(true);
  };

  // Abrir Modal de Edición
  const handleEditCampaign = (campaign: AdvertisingCampaign) => {
    setEditingCampaign({ ...campaign });
    setIsModalOpen(true);
  };

  // Guardar Campaña
  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign?.name?.trim()) {
      alert('Introduce un nombre para la campaña.');
      return;
    }

    setSavingCampaign(true);
    try {
      const res = await AdvertisingRepository.saveCampaign(editingCampaign);
      if (res.success) {
        setIsModalOpen(false);
        setEditingCampaign(null);
        await loadData();
      } else {
        alert(`Error guardando campaña: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message}`);
    } finally {
      setSavingCampaign(false);
    }
  };

  // Alternar Estado Activo
  const handleToggleActive = async (campaign: AdvertisingCampaign) => {
    const newActive = !campaign.active;
    const res = await AdvertisingRepository.toggleCampaignActive(campaign.id, newActive);
    if (res.success) {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaign.id ? { ...c, active: newActive } : c))
      );
    } else {
      alert(`Error cambiando estado: ${res.error}`);
    }
  };

  // Cambiar Prioridad
  const handlePriorityChange = async (campaign: AdvertisingCampaign, delta: number) => {
    const newPriority = Math.max(0, campaign.priority + delta);
    const res = await AdvertisingRepository.updateCampaignPriority(campaign.id, newPriority);
    if (res.success) {
      await loadData();
    } else {
      alert(`Error actualizando prioridad: ${res.error}`);
    }
  };

  // Eliminar Campaña
  const handleDeleteCampaign = async (campaign: AdvertisingCampaign) => {
    if (!window.confirm(`¿Eliminar la campaña "${campaign.name}"?`)) return;
    const res = await AdvertisingRepository.deleteCampaign(campaign.id);
    if (res.success) {
      await loadData();
    } else {
      alert(`Error eliminando campaña: ${res.error}`);
    }
  };

  return (
    <div id="admin-advertising-section" className="space-y-6">
      {/* Cabecera del Módulo */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/40 border border-amber-500/30 p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Tv className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-black text-slate-100 tracking-tight">
                📢 PUBLICIDAD PROGRAMÁTICA (GITHUB + SUPABASE)
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl">
              Motor de banners y spots multimedia optimizados desde GitHub Pages / CDN con control de segmentación en tiempo real (Supabase Realtime).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleScanManifest}
              disabled={scanning}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin text-amber-400' : ''}`} />
              <span>{scanning ? 'Escaneando Manifest...' : 'Escanear Manifest GitHub'}</span>
            </button>

            <button
              id="btn-admin-add-ad-campaign"
              type="button"
              onClick={handleCreateCampaign}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Campaña</span>
            </button>
          </div>
        </div>

        {/* Estado del Escaneo */}
        {syncStatus && (
          <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{syncStatus}</span>
            </div>
            {scanResult && (
              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                {scanResult.validAssetsCount} assets válidos detectados
              </span>
            )}
          </div>
        )}

        {/* Métricas Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] text-slate-400 uppercase font-bold">Assets Registrados</div>
            <div className="text-lg font-black text-slate-100">{assets.length}</div>
          </div>
          <div className="bg-slate-950/80 border border-emerald-500/30 p-3 rounded-xl">
            <div className="text-[11px] text-emerald-400 uppercase font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Campañas Activas
            </div>
            <div className="text-lg font-black text-emerald-300">
              {campaigns.filter((c) => c.active).length}
            </div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] text-slate-400 uppercase font-bold">Total Campañas</div>
            <div className="text-lg font-black text-slate-100">{campaigns.length}</div>
          </div>
          <div className="bg-slate-950/80 border border-amber-500/30 p-3 rounded-xl">
            <div className="text-[11px] text-amber-400 uppercase font-bold">Plataforma Sync</div>
            <div className="text-sm font-bold text-amber-300">Supabase Realtime 0ms</div>
          </div>
        </div>
      </div>

      {/* Lista de Campañas */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Campañas Publicitarias Configuradas</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {campaigns.length} campaña(s)
          </span>
        </div>

        {campaigns.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-2">
            <Tv className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm text-slate-400">No hay campañas publicitarias configuradas.</p>
            <p className="text-xs text-slate-500">
              Haz clic en "Escanear Manifest GitHub" o "Nueva Campaña" para inicializar el motor publicitario.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((camp) => {
              const assetUrl = camp.asset?.filePath
                ? AdvertisingAssetProvider.getAssetUrl(camp.asset.filePath)
                : null;
              const isVideo = camp.asset?.assetType === 'video';

              return (
                <div
                  key={camp.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    camp.active
                      ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-950/60 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Miniatura del Asset */}
                    <div className="w-20 h-20 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                      {assetUrl ? (
                        isVideo ? (
                          <div className="relative w-full h-full flex items-center justify-center bg-black">
                            <VideoIcon className="w-6 h-6 text-purple-400" />
                            <span className="absolute bottom-1 right-1 text-[9px] font-mono bg-black/70 px-1 rounded text-white">
                              VIDEO
                            </span>
                          </div>
                        ) : (
                          <img
                            src={assetUrl}
                            alt={camp.name}
                            className="w-full h-full object-cover"
                          />
                        )
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-600" />
                      )}
                    </div>

                    {/* Información */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-black text-slate-100 truncate">
                          {camp.name}
                        </h4>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            camp.active
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {camp.active ? 'ACTIVO' : 'PAUSADO'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-amber-400 font-bold">
                          {camp.placement}
                        </span>
                        <span>•</span>
                        <span className="font-mono">Prioridad: {camp.priority}</span>
                        {camp.targetUrl && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[120px] text-slate-300">
                              Destino: {camp.targetUrl}
                            </span>
                          </>
                        )}
                      </div>

                      {camp.asset && (
                        <p className="text-[11px] text-slate-400 truncate">
                          Asset: <span className="text-slate-300">{camp.asset.title || camp.asset.assetKey}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Acciones de la Tarjeta */}
                  <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePriorityChange(camp, 1)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="Subir prioridad"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePriorityChange(camp, -1)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="Bajar prioridad"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(camp)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                          camp.active
                            ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        }`}
                      >
                        {camp.active ? 'Pausar' : 'Activar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleEditCampaign(camp)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        title="Editar campaña"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCampaign(camp)}
                        className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 transition-colors"
                        title="Eliminar campaña"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Crear / Editar Campaña */}
      {isModalOpen && editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                <Tv className="w-5 h-5 text-amber-400" />
                <span>{editingCampaign.id ? 'Editar Campaña' : 'Nueva Campaña Publicitaria'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Nombre de la Campaña</label>
                <input
                  type="text"
                  value={editingCampaign.name || ''}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, name: e.target.value })}
                  placeholder="Ej. Promoción Polla Diaria 250 Bs"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Ubicación (Placement)</label>
                  <select
                    value={editingCampaign.placement || 'HOME_TOP'}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, placement: e.target.value as AdPlacement })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    {PLACEMENT_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Prioridad (Mayor = Más visible)</label>
                  <input
                    type="number"
                    value={editingCampaign.priority ?? 10}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, priority: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Recurso Multimedia (Asset)</label>
                <select
                  value={editingCampaign.assetId || ''}
                  onChange={(e) =>
                    setEditingCampaign({ ...editingCampaign, assetId: e.target.value || null })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Sin Asset (Solo CTA/Texto) --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.assetType.toUpperCase()}] {a.title || a.assetKey} ({a.filePath})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Dispositivo Destino</label>
                  <select
                    value={editingCampaign.deviceType || 'ALL'}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, deviceType: e.target.value as AdDeviceType })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="ALL">Todos los dispositivos</option>
                    <option value="MOBILE">Solo Móvil (Smartphones)</option>
                    <option value="TABLET">Solo Tablets</option>
                    <option value="DESKTOP">Solo Computadoras</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Orientación</label>
                  <select
                    value={editingCampaign.orientation || 'ANY'}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, orientation: e.target.value as AdOrientation })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="ANY">Cualquiera</option>
                    <option value="PORTRAIT">Vertical (Portrait)</option>
                    <option value="LANDSCAPE">Horizontal (Landscape)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Destino / Acción (URL o Tab)</label>
                  <input
                    type="text"
                    value={editingCampaign.targetUrl || ''}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, targetUrl: e.target.value })
                    }
                    placeholder="ej. polla, tables, o https://..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Texto del Botón (CTA)</label>
                  <input
                    type="text"
                    value={editingCampaign.ctaText || ''}
                    onChange={(e) =>
                      setEditingCampaign({ ...editingCampaign, ctaText: e.target.value })
                    }
                    placeholder="ej. JUGAR AHORA"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="chk-campaign-active"
                  checked={Boolean(editingCampaign.active)}
                  onChange={(e) =>
                    setEditingCampaign({ ...editingCampaign, active: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500"
                />
                <label htmlFor="chk-campaign-active" className="text-slate-200 font-bold cursor-pointer">
                  Campaña Activa en Producción
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingCampaign}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black tracking-wide shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  {savingCampaign ? 'Guardando...' : 'Guardar Campaña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
