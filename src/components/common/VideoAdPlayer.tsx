// ==============================================================================
// RASPANDO LA OLLA — REPRODUCTOR DE VIDEO PUBLICITARIO AUTOMÁTICO
// ==============================================================================
// Cumple con todas las especificaciones de publicidad webapp:
// - Reproducción automática (autoplay)
// - Sin sonido por defecto (muted inicial)
// - Bucle continuo (loop)
// - Sin controles nativos de reproducción (no play, no pause, no seekbar, no speed)
// - Botón flotante discreto de audio (🔇 / 🔊)
// - Etiqueta externa de "PUBLICIDAD"
// - Video original 100% limpio sin modificaciones internas
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Sparkles, ArrowRight } from 'lucide-react';
import { adAudioPreference } from '../../utils/adAudioPreference';

interface VideoAdPlayerProps {
  src: string;
  posterUrl?: string;
  title?: string;
  description?: string | null;
  buttonText?: string | null;
  onNavigate?: () => void;
  onEnded?: () => void;
  className?: string;
  showAdBadge?: boolean;
  adBadgeText?: string;
  loop?: boolean;
}

export const VideoAdPlayer: React.FC<VideoAdPlayerProps> = ({
  src,
  posterUrl,
  title,
  description,
  buttonText,
  onNavigate,
  onEnded,
  className = '',
  showAdBadge = true,
  adBadgeText = 'PUBLICIDAD',
  loop = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(adAudioPreference.getMuted());
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  // Suscribir al estado de preferencia de audio global
  useEffect(() => {
    const unsubscribe = adAudioPreference.subscribe((mutedState) => {
      setIsMuted(mutedState);
      if (videoRef.current) {
        videoRef.current.muted = mutedState;
      }
    });
    return unsubscribe;
  }, []);

  // Forzar reproducción automática sin interrupción al cambiar la fuente o cargar
  useEffect(() => {
    setHasError(false);
    const vid = videoRef.current;
    if (!vid) return;

    vid.muted = isMuted;

    const promise = vid.play();
    if (promise !== undefined) {
      promise
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('[VideoAdPlayer] Autoplay prevenido o diferido por el navegador, forzando modo silencio:', err);
          // Si el navegador bloquea audio con sonido, aseguramos muted y volvemos a intentar
          vid.muted = true;
          adAudioPreference.setMuted(true);
          vid.play().catch(() => {
            setIsPlaying(false);
          });
        });
    }
  }, [src]);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = adAudioPreference.toggleMuted();
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl group ${className}`}
    >
      {/* ETIQUETA EXTERNA DE PUBLICIDAD (Requisito 5) */}
      {showAdBadge && (
        <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-3 py-1 rounded-md bg-black/85 border border-amber-500/40 backdrop-blur-md shadow-lg pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-mono">
            {adBadgeText}
          </span>
        </div>
      )}

      {/* BOTÓN DISCRETO DE AUDIO (🔇 / 🔊) (Requisito 4 & 13) */}
      <button
        type="button"
        onClick={toggleSound}
        className="absolute top-3 right-3 z-30 p-2.5 rounded-full bg-slate-950/80 border border-amber-500/40 text-amber-400 hover:text-white hover:bg-amber-500/20 backdrop-blur-md transition-all shadow-xl cursor-pointer transform active:scale-90"
        title={isMuted ? 'Activar Sonido (🔊)' : 'Silenciar Video (🔇)'}
        aria-label={isMuted ? 'Activar sonido de publicidad' : 'Silenciar publicidad'}
      >
        {isMuted ? (
          <VolumeX className="w-5 h-5 text-amber-400" />
        ) : (
          <Volume2 className="w-5 h-5 text-emerald-400 animate-pulse" />
        )}
      </button>

      {/* REPRODUCTOR DE VIDEO SIN CONTROLES NATIVOS (Requisito 2, 3, 6, 7) */}
      <div className="relative w-full aspect-video sm:aspect-[21/9] bg-black flex items-center justify-center overflow-hidden">
        {hasError ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-xs text-amber-400 font-semibold">No se pudo cargar el video publicitario</p>
            {posterUrl && (
              <img src={posterUrl} alt={title || 'Publicidad'} className="w-full h-full object-cover rounded-xl" />
            )}
          </div>
        ) : (
          <video
            ref={videoRef}
            src={src}
            poster={posterUrl}
            autoPlay
            muted={isMuted}
            loop={loop}
            playsInline
            controls={false}
            disablePictureInPicture
            controlsList="nofullscreen noremoteplayback nodownload noplaybackrate"
            onEnded={() => {
              if (onEnded) onEnded();
            }}
            onError={() => setHasError(true)}
            className="w-full h-full object-cover pointer-events-none select-none"
          />
        )}

        {/* Capa Gradiente Inferior para Título y Acción sin alterar el Video */}
        {(title || buttonText) && (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
            <div className="space-y-1 max-w-xl pointer-events-none">
              {title && (
                <h3 className="text-base sm:text-xl font-black text-white tracking-tight leading-snug drop-shadow-md">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed drop-shadow">
                  {description}
                </p>
              )}
            </div>

            {buttonText && onNavigate && (
              <button
                type="button"
                onClick={onNavigate}
                className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-xl shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
              >
                <span>{buttonText}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
