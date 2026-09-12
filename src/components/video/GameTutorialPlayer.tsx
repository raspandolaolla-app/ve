/**
 * ==============================================================================
 * RASPANDO LA OLLA — REPRODUCTOR OFICIAL DE VIDEO TUTORIAL DE JUEGO
 * ==============================================================================
 * Componente modular, accesible y seguro para la visualización de videos tutoriales
 * oficiales (YouTube, TikTok, Instagram Reels) en orientación horizontal o vertical.
 * Incluye enlace directo oficial como respaldo de compatibilidad y seguridad.
 * ==============================================================================
 */

import React, { useState } from 'react';
import {
  Play,
  ExternalLink,
  Smartphone,
  Monitor,
  AlertCircle,
  Video,
  CheckCircle2,
} from 'lucide-react';
import type { GameTutorialVideo } from '../../types/admin';
import { getPlatformDisplayName } from '../../utils/videoTutorial';

interface GameTutorialPlayerProps {
  video: GameTutorialVideo;
  gameTitle?: string;
  className?: string;
  showDetails?: boolean;
}

export const GameTutorialPlayer: React.FC<GameTutorialPlayerProps> = ({
  video,
  gameTitle,
  className = '',
  showDetails = true,
}) => {
  const [iframeError, setIframeError] = useState(false);

  if (!video || !video.enabled || !video.url) {
    return null;
  }

  const isVertical = video.orientation === 'vertical';
  const platformName = getPlatformDisplayName(video.platform);
  const displayTitle = video.title?.trim() || `Cómo jugar ${gameTitle || 'el juego'}`;

  // Colores distintivos según la plataforma
  const getPlatformStyles = () => {
    switch (video.platform) {
      case 'youtube':
        return {
          badgeBg: 'bg-red-500/10 text-red-400 border-red-500/25',
          dotBg: 'bg-red-500',
        };
      case 'tiktok':
        return {
          badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
          dotBg: 'bg-cyan-400',
        };
      case 'instagram':
        return {
          badgeBg: 'bg-pink-500/10 text-pink-400 border-pink-500/25',
          dotBg: 'bg-pink-500',
        };
      default:
        return {
          badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
          dotBg: 'bg-amber-400',
        };
    }
  };

  const styles = getPlatformStyles();

  return (
    <div className={`flex flex-col bg-slate-950/80 rounded-2xl border border-slate-800/90 p-3 sm:p-4 overflow-hidden ${className}`}>
      {/* Encabezado del Reproductor */}
      {showDetails && (
        <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-850">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                {displayTitle}
              </h4>
              {video.description && (
                <p className="text-[11px] text-slate-400 truncate">
                  {video.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Badge de Plataforma */}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 ${styles.badgeBg}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${styles.dotBg}`} />
              {platformName}
            </span>

            {/* Badge de Orientación */}
            <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
              {isVertical ? (
                <>
                  <Smartphone className="w-3 h-3 text-sky-400" />
                  <span>Vertical</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3 h-3 text-emerald-400" />
                  <span>16:9</span>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Contenedor del Video Adaptativo */}
      <div className="relative w-full flex items-center justify-center my-auto">
        <div
          className={`relative overflow-hidden rounded-xl bg-black border border-slate-800/80 shadow-2xl transition-all ${
            isVertical
              ? 'w-full max-w-[280px] sm:max-w-[310px] aspect-[9/16]'
              : 'w-full aspect-video max-w-2xl'
          }`}
        >
          {video.embedUrl && !iframeError ? (
            <iframe
              src={video.embedUrl}
              title={displayTitle}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
              onError={() => setIframeError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 text-slate-300 space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <div>
                <p className="text-xs font-semibold">Reproductor embebido no disponible en este dispositivo</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Puedes abrir y ver el tutorial directamente en la aplicación oficial.
                </p>
              </div>
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition"
              >
                <span>Abrir en {platformName}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Acciones y Respaldo Oficial */}
      <div className="mt-3 pt-2.5 border-t border-slate-850 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Contenido oficial aprobado por la plataforma</span>
        </div>

        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium transition shrink-0 ml-2"
          title={`Abrir video en ${platformName}`}
        >
          <span>Ver en {platformName}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};
