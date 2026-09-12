/**
 * ==============================================================================
 * RASPANDO LA OLLA — MODAL ADMINISTRATIVO DE CONFIGURACIÓN DE VIDEO TUTORIAL
 * ==============================================================================
 * Flujo solicitado: Seleccionar juego → Pegar URL → Elegir orientación → Vista previa → Guardar.
 * Plataformas admitidas: YouTube, TikTok, Instagram Reels.
 * Sin almacenamiento local ni código inseguro.
 * ==============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Video,
  Save,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Monitor,
  Smartphone,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { GAMES_INFO, getGameInfo } from '../../../data/gameInfo';
import { AdminRepository } from '../../../services/repositories/AdminRepository';
import { GameTutorialPlayer } from '../../../components/video/GameTutorialPlayer';
import {
  validateAndParseVideoUrl,
  createEmptyTutorialVideo,
  getPlatformDisplayName,
} from '../../../utils/videoTutorial';
import type { GameTutorialVideo, VideoOrientation, VideoPlatform } from '../../../types/admin';

interface AdminVideoTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialGameId?: string;
  onSuccess?: () => void;
}

export const AdminVideoTutorialModal: React.FC<AdminVideoTutorialModalProps> = ({
  isOpen,
  onClose,
  initialGameId = 'domino_venezolano',
  onSuccess,
}) => {
  const [selectedGameId, setSelectedGameId] = useState<string>(initialGameId);
  const [urlInput, setUrlInput] = useState<string>('');
  const [titleInput, setTitleInput] = useState<string>('');
  const [descriptionInput, setDescriptionInput] = useState<string>('');
  const [orientation, setOrientation] = useState<VideoOrientation>('horizontal');
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [detectedPlatform, setDetectedPlatform] = useState<VideoPlatform>('youtube');
  const [parsedEmbedUrl, setParsedEmbedUrl] = useState<string>('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (initialGameId) {
      setSelectedGameId(initialGameId);
    }
  }, [initialGameId]);

  // Cargar configuración existente al cambiar de juego
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const loadTutorial = async () => {
      setLoading(true);
      setFeedback(null);
      setUrlError(null);

      try {
        const video = await AdminRepository.getGameTutorialVideo(selectedGameId);
        if (!isMounted) return;

        if (video && video.url) {
          setUrlInput(video.url);
          setTitleInput(video.title || '');
          setDescriptionInput(video.description || '');
          setOrientation(video.orientation || 'horizontal');
          setIsEnabled(video.enabled !== false);
          setDetectedPlatform(video.platform || 'youtube');
          setParsedEmbedUrl(video.embedUrl || '');

          // Re-validar por seguridad
          const validation = validateAndParseVideoUrl(video.url);
          if (validation.isValid && validation.embedUrl) {
            setParsedEmbedUrl(validation.embedUrl);
          }
        } else {
          // Valores iniciales limpios
          setUrlInput('');
          setTitleInput('');
          setDescriptionInput('');
          setOrientation('horizontal');
          setIsEnabled(true);
          setDetectedPlatform('youtube');
          setParsedEmbedUrl('');
        }
      } catch {
        if (isMounted) {
          setFeedback({ type: 'error', message: 'No se pudo cargar la configuración actual.' });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadTutorial();
    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedGameId]);

  // Validar y analizar la URL reactivamente
  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    setFeedback(null);

    if (!value.trim()) {
      setUrlError(null);
      setParsedEmbedUrl('');
      return;
    }

    const result = validateAndParseVideoUrl(value);
    if (result.isValid) {
      setUrlError(null);
      setDetectedPlatform(result.platform || 'youtube');
      setParsedEmbedUrl(result.embedUrl || '');
      if (result.orientation) {
        setOrientation(result.orientation);
      }
    } else {
      setUrlError(result.error || 'URL no válida.');
      setParsedEmbedUrl('');
    }
  };

  // Objeto de video tutorial en vivo para la vista previa
  const previewVideo: GameTutorialVideo | null = useMemo(() => {
    if (!urlInput.trim() || urlError || !parsedEmbedUrl) {
      return null;
    }
    return {
      enabled: isEnabled,
      platform: detectedPlatform,
      url: urlInput.trim(),
      embedUrl: parsedEmbedUrl,
      orientation,
      title: titleInput.trim() || undefined,
      description: descriptionInput.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
  }, [urlInput, urlError, parsedEmbedUrl, isEnabled, detectedPlatform, orientation, titleInput, descriptionInput]);

  const activeGame = getGameInfo(selectedGameId);

  // Guardar configuración
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) {
      setUrlError('Debes ingresar un enlace de video de YouTube, TikTok o Instagram.');
      return;
    }

    const validation = validateAndParseVideoUrl(urlInput);
    if (!validation.isValid || !validation.embedUrl) {
      setUrlError(validation.error || 'La URL ingresada no es válida.');
      return;
    }

    setSaving(true);
    setFeedback(null);

    const payload: GameTutorialVideo = {
      enabled: isEnabled,
      platform: validation.platform || detectedPlatform,
      url: validation.normalizedUrl || urlInput.trim(),
      embedUrl: validation.embedUrl,
      orientation,
      title: titleInput.trim() || `Tutorial: ${activeGame?.title || selectedGameId}`,
      description: descriptionInput.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    const res = await AdminRepository.saveGameTutorialVideo(selectedGameId, payload);
    setSaving(false);

    if (res.success) {
      setFeedback({ type: 'success', message: '¡Video tutorial guardado y sincronizado con éxito!' });
      if (onSuccess) onSuccess();
    } else {
      setFeedback({ type: 'error', message: res.error || 'Error al guardar la configuración del video.' });
    }
  };

  // Eliminar / Quitar video
  const handleRemove = async () => {
    if (!window.confirm('¿Seguro que deseas remover el video tutorial de este juego?')) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    const res = await AdminRepository.saveGameTutorialVideo(selectedGameId, null);
    setSaving(false);

    if (res.success) {
      setUrlInput('');
      setTitleInput('');
      setDescriptionInput('');
      setParsedEmbedUrl('');
      setUrlError(null);
      setFeedback({ type: 'success', message: 'Video tutorial removido con éxito.' });
      if (onSuccess) onSuccess();
    } else {
      setFeedback({ type: 'error', message: res.error || 'Error al remover el video.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Encabezado */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-100 flex items-center gap-2">
                <span>Configurador de Videos Tutoriales</span>
                <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] uppercase font-bold tracking-wider">
                  Oficial
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Asocia tutoriales de YouTube, TikTok o Instagram Reels para que los jugadores los vean en las reglas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-sm">
          {/* Mensajes de retroalimentación */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Paso 1: Seleccionar Juego */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
              Paso 1: Selecciona el Juego
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GAMES_INFO.map((g) => {
                const isSelected = selectedGameId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGameId(g.id)}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md scale-[1.02]'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <span className="text-xl shrink-0">{g.icon}</span>
                    <span className="text-xs font-bold truncate">{g.title.split('(')[0].trim()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Formulario Principal */}
          <form onSubmit={handleSave} className="space-y-4">
            {/* Paso 2: Pegar URL */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Paso 2: Pega el Enlace del Video
                </label>
                {detectedPlatform && urlInput && !urlError && (
                  <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Detectado: {getPlatformDisplayName(detectedPlatform)}
                  </span>
                )}
              </div>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... o https://www.tiktok.com/@... o https://www.instagram.com/reel/..."
                disabled={loading || saving}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 transition ${
                  urlError
                    ? 'border-rose-500/80 focus:ring-rose-500/30'
                    : 'border-slate-800 focus:border-amber-500/80 focus:ring-amber-500/20'
                }`}
              />
              {urlError ? (
                <p className="text-[11px] text-rose-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{urlError}</span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 mt-1">
                  Admite videos estándar de YouTube, YouTube Shorts, videos de TikTok y Reels de Instagram.
                </p>
              )}
            </div>

            {/* Paso 3: Elegir Orientación */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                Paso 3: Elige la Orientación del Reproductor
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOrientation('horizontal')}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition cursor-pointer ${
                    orientation === 'horizontal'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-700/60">
                    <Monitor className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold">Horizontal (16:9)</div>
                    <div className="text-[10px] text-slate-400">YouTube tradicional y panorámicos</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOrientation('vertical')}
                  className={`p-3 rounded-xl border flex items-center gap-3 transition cursor-pointer ${
                    orientation === 'vertical'
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-700/60">
                    <Smartphone className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold">Vertical (9:16)</div>
                    <div className="text-[10px] text-slate-400">TikTok, Instagram Reels & Shorts</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Opciones Adicionales (Título y Habilitación) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Título del Tutorial (Opcional)
                </label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder={`Cómo jugar ${activeGame?.title || 'este juego'}`}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/80"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Estado de Publicación
                </label>
                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => setIsEnabled(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-500"
                  />
                  <span className="font-semibold text-slate-200">
                    {isEnabled ? 'Activo (Visible en el manual)' : 'Inactivo (Oculto para jugadores)'}
                  </span>
                </label>
              </div>
            </div>

            {/* Paso 4: Vista Previa en Vivo */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span>Paso 4: Vista Previa en Vivo</span>
                </label>
                {previewVideo && (
                  <span className="text-[11px] text-slate-400">
                    Así lo experimentarán los jugadores
                  </span>
                )}
              </div>

              {previewVideo ? (
                <GameTutorialPlayer
                  video={previewVideo}
                  gameTitle={activeGame?.title}
                  showDetails={true}
                />
              ) : (
                <div className="p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                  <Video className="w-8 h-8 text-slate-600" />
                  <p className="font-medium text-slate-400">Pega un enlace válido para previsualizar el reproductor.</p>
                  <p className="text-[11px] text-slate-600">
                    Soporta: youtube.com, youtu.be, tiktok.com e instagram.com/reel/
                  </p>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Pie del Modal con Acciones */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
          <div>
            {urlInput && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving || loading}
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quitar Video</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !urlInput.trim() || !!urlError}
              className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar Video</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
