// ==============================================================================
// RASPANDO LA OLLA — MÓDULO ADMINISTRATIVO: CONTENIDO DEL LOBBY (IMÁGENES Y VIDEOS)
// ==============================================================================

import React, { useState, useEffect, useCallback, ChangeEvent, FormEvent } from 'react';
import {
  BannerRepository,
  type ContentBannerItem,
  type ContentBannerLocation,
} from '../../../services/repositories/BannerRepository';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Plus,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  Upload,
  Link as LinkIcon,
  Sparkles,
  RefreshCw,
  Play,
  PlayCircle,
  Filter,
  Layers,
  HelpCircle,
} from 'lucide-react';

const LOCATION_OPTIONS: Array<{ value: ContentBannerLocation; label: string; icon: string }> = [
  { value: 'HOME', label: '🏠 Lobby Principal (Destacados)', icon: '🏠' },
  { value: 'LOBBY_MAIN', label: '🌟 Cabecera Principal', icon: '🌟' },
  { value: 'GAMES', label: '🎮 Sección de Juegos', icon: '🎮' },
  { value: 'ATRAPAITO', label: '🟡 Atrapaíto (Parchís)', icon: '🟡' },
  { value: 'BINGO', label: '🎱 Bingo 90 Bolas', icon: '🎱' },
  { value: 'POLLA', label: '🎟️ Polla Venezolana', icon: '🎟️' },
  { value: 'PROMOTIONS', label: '📢 Promociones Especiales', icon: '📢' },
  { value: 'INFO', label: '📖 Información y Tutoriales', icon: '📖' },
  { value: 'GENERAL', label: '⚙️ General (Todas las pantallas)', icon: '⚙️' },
];

const TARGET_ACTION_OPTIONS = [
  { value: 'polla', label: '🎟️ Ir a Polla Venezolana' },
  { value: 'bingo', label: '🎱 Ir a Bingo' },
  { value: 'atrapaito', label: '🟡 Ir a Atrapaíto' },
  { value: 'games', label: '🎮 Catálogo de Juegos' },
  { value: 'wallet', label: '💰 Billetera / Recargar' },
  { value: 'promotions', label: '📢 Ver Promociones' },
  { value: 'info', label: '📖 Ver Reglas / Tutoriales' },
];

export function AdminLobbyContentTab() {
  const [banners, setBanners] = useState<ContentBannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Filtros
  const [filterLocation, setFilterLocation] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'IMAGE' | 'VIDEO'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Formulario Modal / Drawer
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Partial<ContentBannerItem> | null>(null);

  // Modos de entrada multimedia: upload o URL
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');

  // Preview Modal
  const [previewBanner, setPreviewBanner] = useState<ContentBannerItem | null>(null);
  const [activeVideoModalUrl, setActiveVideoModalUrl] = useState<string | null>(null);

  const loadBanners = useCallback(async () => {
    setLoading(true);
    const data = await BannerRepository.getAllBannersForAdmin();
    setBanners(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  // Manejador de Carga de Archivos a Supabase Storage
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(`Subiendo ${file.name} a Supabase Storage...`);

    const isVideo = file.type.startsWith('video/') || ['mp4', 'webm', 'mov'].some((ext) => file.name.toLowerCase().endsWith(ext));

    const result = await BannerRepository.uploadMediaFile(file);

    setUploading(false);
    setUploadProgress(null);

    if (result.success && result.publicUrl) {
      setEditingBanner((prev) => ({
        ...prev,
        imageUrl: isVideo
          ? prev?.imageUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80'
          : result.publicUrl,
        videoUrl: isVideo ? result.publicUrl : prev?.videoUrl || null,
        mediaType: isVideo ? 'video' : 'image',
      }));
    } else {
      alert(`Error subiendo archivo: ${result.error || 'No se pudo cargar a Supabase Storage.'}`);
    }
  };

  const handleOpenCreate = () => {
    setEditingBanner({
      title: '',
      description: '',
      imageUrl: '',
      videoUrl: '',
      mediaType: 'image',
      buttonText: 'VER MÁS',
      targetAction: 'polla',
      priority: banners.length > 0 ? Math.max(...banners.map((b) => b.priority)) + 1 : 10,
      isActive: true,
      location: 'HOME',
      startDate: new Date().toISOString().substring(0, 16),
    });
    setUploadMode('file');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (banner: ContentBannerItem) => {
    setEditingBanner({
      ...banner,
      startDate: banner.startDate ? banner.startDate.substring(0, 16) : new Date().toISOString().substring(0, 16),
    });
    setUploadMode(banner.imageUrl.startsWith('data:') || banner.imageUrl.includes('supabase') ? 'file' : 'url');
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBanner?.title?.trim()) {
      alert('Por favor introduce un título para el contenido.');
      return;
    }

    if (!editingBanner.imageUrl?.trim()) {
      alert('Por favor proporciona una imagen de portada o imagen del banner.');
      return;
    }

    setLoading(true);
    const result = await BannerRepository.saveBanner(editingBanner);
    setLoading(false);

    if (result.success) {
      setIsFormOpen(false);
      setEditingBanner(null);
      await loadBanners();
    } else {
      alert(`Error al guardar en Supabase: ${result.error}`);
    }
  };

  const handleToggleActive = async (banner: ContentBannerItem) => {
    const newStatus = !banner.isActive;
    const res = await BannerRepository.toggleBannerActive(banner.id, newStatus);
    if (res.success) {
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, isActive: newStatus } : b)));
    } else {
      alert(`Error actualizando estado: ${res.error}`);
    }
  };

  const handlePriorityChange = async (banner: ContentBannerItem, delta: number) => {
    const newPriority = Math.max(1, banner.priority + delta);
    const res = await BannerRepository.updateBannerPriority(banner.id, newPriority);
    if (res.success) {
      await loadBanners();
    } else {
      alert(`Error actualizando orden: ${res.error}`);
    }
  };

  const handleDelete = async (banner: ContentBannerItem) => {
    if (!window.confirm(`¿Estás seguro de eliminar el contenido "${banner.title}"?`)) return;
    setLoading(true);
    const res = await BannerRepository.deleteBanner(banner.id);
    setLoading(false);
    if (res.success) {
      await loadBanners();
    } else {
      alert(`Error eliminando contenido: ${res.error}`);
    }
  };

  // Filtrado de lista
  const filteredBanners = banners.filter((b) => {
    if (filterLocation !== 'ALL' && b.location !== filterLocation) return false;
    if (filterType === 'IMAGE' && b.videoUrl) return false;
    if (filterType === 'VIDEO' && !b.videoUrl) return false;
    if (filterStatus === 'ACTIVE' && !b.isActive) return false;
    if (filterStatus === 'INACTIVE' && b.isActive) return false;
    return true;
  });

  // Métricas
  const totalCount = banners.length;
  const activeCount = banners.filter((b) => b.isActive).length;
  const inactiveCount = totalCount - activeCount;
  const imagesCount = banners.filter((b) => !b.videoUrl).length;
  const videosCount = banners.filter((b) => Boolean(b.videoUrl)).length;

  return (
    <div id="admin-lobby-content-tab" className="space-y-6">
      {/* Banner de Título y Métricas */}
      <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/40 border border-amber-500/30 p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Sparkles className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-black text-slate-100 tracking-tight">
                🎨 GESTIÓN DE CONTENIDO DEL LOBBY
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl">
              Carga, organiza y publica imágenes y videos promocionales que se muestran en vivo en el Lobby de los jugadores. Guardado directo en Supabase Storage.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadBanners}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              <span>Refrescar</span>
            </button>

            <button
              id="btn-admin-add-content"
              type="button"
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cargar Imagen / Video</span>
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas Rápida */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] text-slate-400 uppercase font-bold">Total Items</div>
            <div className="text-lg font-black text-slate-100">{totalCount}</div>
          </div>
          <div className="bg-slate-950/80 border border-emerald-500/30 p-3 rounded-xl">
            <div className="text-[11px] text-emerald-400 uppercase font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> 🟢 Activos
            </div>
            <div className="text-lg font-black text-emerald-300">{activeCount}</div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
            <div className="text-[11px] text-slate-400 uppercase font-bold flex items-center gap-1">
              <XCircle className="w-3 h-3" /> ⚪ Inactivos
            </div>
            <div className="text-lg font-black text-slate-400">{inactiveCount}</div>
          </div>
          <div className="bg-slate-950/80 border border-sky-500/30 p-3 rounded-xl">
            <div className="text-[11px] text-sky-400 uppercase font-bold flex items-center gap-1">
              <ImageIcon className="w-3 h-3" /> 📸 Imágenes
            </div>
            <div className="text-lg font-black text-sky-300">{imagesCount}</div>
          </div>
          <div className="bg-slate-950/80 border border-purple-500/30 p-3 rounded-xl">
            <div className="text-[11px] text-purple-400 uppercase font-bold flex items-center gap-1">
              <VideoIcon className="w-3 h-3" /> 🎬 Videos
            </div>
            <div className="text-lg font-black text-purple-300">{videosCount}</div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase">
            <Filter className="w-4 h-4 text-amber-400" />
            <span>Filtros:</span>
          </div>

          {/* Filtro Ubicación */}
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
          >
            <option value="ALL">📍 Todas las Ubicaciones</option>
            {LOCATION_OPTIONS.map((loc) => (
              <option key={loc.value} value={loc.value}>
                {loc.label}
              </option>
            ))}
          </select>

          {/* Filtro Tipo */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
          >
            <option value="ALL">📁 Todos los Tipos (Imágenes/Videos)</option>
            <option value="IMAGE">📸 Solo Imágenes</option>
            <option value="VIDEO">🎬 Solo Videos</option>
          </select>

          {/* Filtro Estado */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
          >
            <option value="ALL">⚡ Todos los Estados</option>
            <option value="ACTIVE">🟢 Solo Activos</option>
            <option value="INACTIVE">⚪ Solo Inactivos</option>
          </select>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Mostrando <span className="text-amber-400 font-bold">{filteredBanners.length}</span> de {banners.length} elementos
        </div>
      </div>

      {/* Lista / Grid de Contenidos */}
      {filteredBanners.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
          <Layers className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">No se encontró contenido publicado</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Aún no hay banners ni videos que coincidan con los filtros seleccionados. Haz clic en "Cargar Imagen / Video" para comenzar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBanners.map((banner) => {
            const locObj = LOCATION_OPTIONS.find((l) => l.value === banner.location);
            return (
              <div
                key={banner.id}
                className={`relative group rounded-2xl border transition-all overflow-hidden flex flex-col justify-between ${
                  banner.isActive
                    ? 'bg-slate-900/90 border-slate-800 hover:border-amber-500/50 shadow-lg'
                    : 'bg-slate-950/80 border-slate-800/60 opacity-75'
                }`}
              >
                {/* Header de la tarjeta */}
                <div className="relative aspect-video w-full bg-slate-950 overflow-hidden border-b border-slate-800">
                  <img
                    src={banner.imageUrl}
                    alt={banner.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />

                  {/* Insignia de Estado */}
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase backdrop-blur-md shadow-md">
                    {banner.isActive ? (
                      <span className="bg-emerald-500/90 text-slate-950 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> 🟢 ACTIVO
                      </span>
                    ) : (
                      <span className="bg-slate-800/90 text-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1 border border-slate-700">
                        <XCircle className="w-3 h-3" /> ⚪ INACTIVO
                      </span>
                    )}

                    <span className="bg-slate-950/80 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                      Prioridad #{banner.priority}
                    </span>
                  </div>

                  {/* Insignia de Tipo (Video u Imagen) */}
                  <div className="absolute top-2 right-2 z-10">
                    {banner.videoUrl ? (
                      <span className="px-2 py-1 rounded-lg bg-purple-900/90 text-purple-200 border border-purple-500/50 text-[10px] font-bold flex items-center gap-1 shadow-md">
                        <VideoIcon className="w-3 h-3 text-purple-300" /> VIDEO
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-lg bg-sky-900/90 text-sky-200 border border-sky-500/50 text-[10px] font-bold flex items-center gap-1 shadow-md">
                        <ImageIcon className="w-3 h-3 text-sky-300" /> IMAGEN
                      </span>
                    )}
                  </div>

                  {/* Botón de Reproducción si es Video */}
                  {banner.videoUrl && (
                    <button
                      type="button"
                      onClick={() => setActiveVideoModalUrl(banner.videoUrl || null)}
                      className="absolute inset-0 z-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-all group/btn"
                    >
                      <div className="p-3 bg-amber-500 text-slate-950 rounded-full shadow-2xl group-hover/btn:scale-110 transition-transform">
                        <Play className="w-6 h-6 fill-current ml-0.5" />
                      </div>
                    </button>
                  )}
                </div>

                {/* Contenido de la tarjeta */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono text-amber-400/90 flex items-center gap-1">
                      <span>{locObj?.icon || '📍'}</span>
                      <span className="uppercase font-bold tracking-wider">{locObj?.label || banner.location}</span>
                    </div>

                    <h3 className="text-sm font-black text-slate-100 line-clamp-1">{banner.title}</h3>
                    {banner.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{banner.description}</p>
                    )}
                  </div>

                  {/* Botón de Acción predeterminado */}
                  {banner.buttonText && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-slate-500 font-mono">Acción: {banner.targetAction}</span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold text-[11px]">
                        {banner.buttonText}
                      </span>
                    </div>
                  )}

                  {/* Controles de Orden y Acciones */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    {/* Controles de Prioridad */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePriorityChange(banner, 1)}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
                        title="Aumentar prioridad (subir orden)"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePriorityChange(banner, -1)}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 transition-colors"
                        title="Disminuir prioridad (bajar orden)"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Botones de Operación */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewBanner(banner)}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-amber-300 transition-colors flex items-center gap-1 text-[11px]"
                        title="Vista Previa"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(banner)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
                          banner.isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {banner.isActive ? '🟢 Desactivar' : '⚪ Activar'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEdit(banner)}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(banner)}
                        className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL FORMULARIO: CREAR / EDITAR CONTENIDO */}
      {isFormOpen && editingBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h3 className="text-base font-black text-slate-100">
                  {editingBanner.id ? '✏️ Editar Contenido del Lobby' : '➕ Cargar Nuevo Contenido (Imagen / Video)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Selección de Tipo de Medio: Imagen vs Video */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Tipo de Contenido Multimedia
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingBanner((prev) => ({ ...prev, mediaType: 'image' }))}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      editingBanner.mediaType !== 'video'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>📸 Imagen Destacada</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingBanner((prev) => ({ ...prev, mediaType: 'video' }))}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      editingBanner.mediaType === 'video'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <VideoIcon className="w-4 h-4" />
                    <span>🎬 Video Promocional</span>
                  </button>
                </div>
              </div>

              {/* Selector Cargar Archivo vs URL */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-300">Fuente del Archivo (Supabase Storage)</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadMode('file')}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        uploadMode === 'file' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      <Upload className="w-3 h-3 inline mr-1" />
                      Subir Archivo
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode('url')}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                        uploadMode === 'url' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      <LinkIcon className="w-3 h-3 inline mr-1" />
                      URL Directa
                    </button>
                  </div>
                </div>

                {uploadMode === 'file' ? (
                  <div className="p-4 rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/80 text-center space-y-2">
                    <Upload className="w-8 h-8 text-amber-400 mx-auto animate-bounce" />
                    <div className="text-xs font-semibold text-slate-300">
                      Arrastra o selecciona una imagen o video
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Formatos soportados: JPG, PNG, WEBP, MP4, WEBM. Guardado automático en Supabase Storage.
                    </p>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="input-media-upload"
                    />
                    <label
                      htmlFor="input-media-upload"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
                    >
                      <span>Seleccionar Archivo</span>
                    </label>

                    {uploadProgress && (
                      <div className="text-xs text-amber-300 font-mono animate-pulse">{uploadProgress}</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="https://ejemplo.com/imagen.jpg o https://ejemplo.com/video.mp4"
                      value={editingBanner.mediaType === 'video' ? editingBanner.videoUrl || '' : editingBanner.imageUrl || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (editingBanner.mediaType === 'video') {
                          setEditingBanner((prev) => ({
                            ...prev,
                            videoUrl: val,
                            imageUrl: prev?.imageUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
                          }));
                        } else {
                          setEditingBanner((prev) => ({ ...prev, imageUrl: val }));
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Vista Previa de Imagen o Video Seleccionado */}
              {(editingBanner.imageUrl || editingBanner.videoUrl) && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="text-[10px] uppercase font-mono text-amber-400">Previsualización del Archivo</div>
                  <div className="aspect-video w-full rounded-lg overflow-hidden bg-black flex items-center justify-center">
                    {editingBanner.mediaType === 'video' && editingBanner.videoUrl ? (
                      <video src={editingBanner.videoUrl} controls className="w-full h-full object-contain" />
                    ) : (
                      <img src={editingBanner.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    )}
                  </div>
                </div>
              )}

              {/* Título y Ubicación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Título del Contenido *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 🐾 COMPRA TU POLLA VENEZOLANA"
                    value={editingBanner.title || ''}
                    onChange={(e) => setEditingBanner((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Ubicación / Categoría *</label>
                  <select
                    value={editingBanner.location || 'HOME'}
                    onChange={(e) =>
                      setEditingBanner((prev) => ({ ...prev, location: e.target.value as ContentBannerLocation }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    {LOCATION_OPTIONS.map((loc) => (
                      <option key={loc.value} value={loc.value}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Descripción corta</label>
                <textarea
                  rows={2}
                  placeholder="Detalles de la promoción, reglas del evento o instrucciones para el jugador..."
                  value={editingBanner.description || ''}
                  onChange={(e) => setEditingBanner((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Botón de Acción y Destino */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Texto del Botón</label>
                  <input
                    type="text"
                    placeholder="Ej: JUGAR AHORA, COMPRAR TICKET"
                    value={editingBanner.buttonText || ''}
                    onChange={(e) => setEditingBanner((prev) => ({ ...prev, buttonText: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Acción / Pantalla de Destino</label>
                  <select
                    value={editingBanner.targetAction || 'polla'}
                    onChange={(e) => setEditingBanner((prev) => ({ ...prev, targetAction: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    {TARGET_ACTION_OPTIONS.map((act) => (
                      <option key={act.value} value={act.value}>
                        {act.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Prioridad y Estado Activo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Prioridad u Orden (#)</label>
                  <input
                    type="number"
                    min="1"
                    value={editingBanner.priority || 1}
                    onChange={(e) => setEditingBanner((prev) => ({ ...prev, priority: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Un número mayor aparece primero.</span>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingBanner.isActive ?? true}
                      onChange={(e) => setEditingBanner((prev) => ({ ...prev, isActive: e.target.checked }))}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 accent-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-slate-100">
                        {editingBanner.isActive ? '🟢 ACTIVO' : '⚪ INACTIVO'}
                      </span>
                      <p className="text-[10px] text-slate-400">
                        {editingBanner.isActive ? 'Visible de inmediato en el Lobby' : 'Oculto para los jugadores'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Botones del Formulario */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  id="btn-save-banner-submit"
                  type="submit"
                  disabled={uploading || loading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20"
                >
                  {loading ? 'Guardando en Supabase...' : 'Guardar Contenido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VISTA PREVIA (VISTA PREVIA DEL JUGADOR) */}
      {previewBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-amber-500/40 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-wide">
                  👁️ Vista Previa en Vivo (Lobby del Jugador)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBanner(null)}
                className="text-slate-400 hover:text-white font-bold"
              >
                Cerrar ✕
              </button>
            </div>

            {/* Simulación del Banner tal como se ve en el Lobby */}
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 p-6 shadow-xl">
              <div className="flex flex-col md:flex-row items-stretch gap-5">
                <div className="relative w-full md:w-64 aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black shrink-0">
                  <img src={previewBanner.imageUrl} alt={previewBanner.title} className="w-full h-full object-cover" />
                  {previewBanner.videoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-amber-400">
                      <div className="p-3 bg-amber-500 text-slate-950 rounded-full shadow-lg">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-300">
                      Ubicación: {previewBanner.location}
                    </span>
                    <h3 className="text-lg font-black text-slate-100 mt-2">{previewBanner.title}</h3>
                    {previewBanner.description && (
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{previewBanner.description}</p>
                    )}
                  </div>

                  {previewBanner.buttonText && (
                    <div className="pt-3">
                      <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg">
                        {previewBanner.buttonText}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REPRODUCTOR DE VIDEO */}
      {activeVideoModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-amber-400 uppercase">🎬 Reproductor de Video Promocional</span>
              <button
                type="button"
                onClick={() => setActiveVideoModalUrl(null)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                Cerrar ✕
              </button>
            </div>
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
              <video src={activeVideoModalUrl} controls autoPlay className="w-full h-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
