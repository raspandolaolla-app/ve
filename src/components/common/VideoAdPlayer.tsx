// ==============================================================================
// RASPANDO LA OLLA — REPRODUCTOR DE VIDEO PUBLICITARIO AUTOMÁTICO
// ==============================================================================
// Cumple con todas las especificaciones de publicidad webapp:
// - Reproducción completa del video sin cortes por temporizador
// - Transición impulsada EXCLUSIVAMENTE por el evento nativo HTML5 'ended'
// - Sin atributo HTML 'loop' en la etiqueta <video> para garantizar el evento 'ended'
// - Carga y reproducción limpia al cambiar de fuente
// - Botón flotante discreto de audio (🔇 / 🔊)
// - Etiqueta externa de "PUBLICIDAD"
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
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

  // Forzar reproducción y carga limpia al cambiar la fuente (src)
  useEffect(() => {
    setHasError(false);
    const vid = videoRef.current;
    if (!vid) return;

    let isSubscribed = true;

    // 1. Detener correctamente el video anterior
    try {
      vid.pause();
      vid.currentTime = 0;
    } catch {
      // Ignorar errores de pausa previo
    }

    // 2. Establecer nueva fuente y ejecutar load()
    vid.src = src;
    vid.muted = isMuted;
    vid.load();

    // 3. Iniciar reproducción cuando esté listo
    const handleCanPlay = async () => {
      if (!isSubscribed) return;
      try {
        await vid.play();
        if (isSubscribed) setIsPlaying(true);
      } catch (err) {
        console.warn('[VideoAdPlayer] Autoplay prevenido con sonido, intentando en silencio:', err);
        try {
          vid.muted = true;
          adAudioPreference.setMuted(true);
          await vid.play();
          if (isSubscribed) setIsPlaying(true);
        } catch (fallbackErr) {
          console.warn('[VideoAdPlayer] Autoplay bloqueado por el navegador:', fallbackErr);
          if (isSubscribed) setIsPlaying(false);
        }
      }
    };

    vid.addEventListener('canplay', handleCanPlay, { once: true });

    return () => {
      isSubscribed = false;
      vid.removeEventListener('canplay', handleCanPlay);
    };
  }, [src, isMuted]);

  // Manejador del evento nativo 'ended'
  const handleVideoEnded = useCallback(() => {
    console.log('[VideoAdPlayer] Evento NATIVO "ended" recibido. El video finalizó completamente.');

    // Notificar al componente padre para avanzar en la playlist si existen múltiples anuncios
    if (onEnded) {
      onEnded();
    }

    // Si es un video único o la fuente no cambia, reiniciar reproducción desde el segundo 0
    const vid = videoRef.current;
    if (vid) {
      vid.currentTime = 0;
      vid.play().catch(() => {});
    }
  }, [onEnded]);

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
      {/* ETIQUETA EXTERNA DE PUBLICIDAD (Oculta sobre el canvas del video en móviles) */}
      {showAdBadge && (
        <div className="hidden sm:flex absolute top-3 left-3 z-30 items-center gap-1.5 px-3 py-1 rounded-md bg-black/85 border border-amber-500/40 backdrop-blur-md shadow-lg pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-mono">
            {adBadgeText}
          </span>
        </div>
      )}

      {/* BOTÓN DISCRETO DE AUDIO (🔇 / 🔊) — Único elemento sobre el video en móvil */}
      <button
        type="button"
        onClick={toggleSound}
        className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-30 p-2 sm:p-2.5 rounded-full bg-slate-950/80 border border-amber-500/40 text-amber-400 hover:text-white hover:bg-amber-500/20 backdrop-blur-md transition-all shadow-xl cursor-pointer transform active:scale-90 flex items-center justify-center shrink-0 min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px]"
        title={isMuted ? 'Activar Sonido (🔊)' : 'Silenciar Video (🔇)'}
        aria-label={isMuted ? 'Activar sonido de publicidad' : 'Silenciar publicidad'}
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
        ) : (
          <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 animate-pulse" />
        )}
      </button>

      {/* REPRODUCTOR DE VIDEO SIN CONTROLES NATIVOS Y SIN OVERLAYS SOBRE EL VIDEO EN MÓVIL */}
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
            // NOTA: NO colocar el atributo 'loop' para asegurar que el evento 'ended' sea emitido por el navegador
            playsInline
            controls={false}
            disablePictureInPicture
            controlsList="nofullscreen noremoteplayback nodownload noplaybackrate"
            onEnded={handleVideoEnded}
            onError={() => setHasError(true)}
            className="w-full h-full object-contain sm:object-cover pointer-events-none select-none"
          />
        )}

        {/* Capa Gradiente Inferior para Título y Acción (SOLO DESKTOP: sm y superior) */}
        {(title || buttonText) && (
          <div className="hidden sm:flex absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-4 sm:p-6 flex-col sm:flex-row items-start sm:items-end justify-between gap-3 pointer-events-none">
            <div className="space-y-1 max-w-xl">
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
                className="pointer-events-auto shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-xl shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
              >
                <span>{buttonText}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* INFORMACIÓN Y ACCIÓN UBICADAS DEBAJO DEL VIDEO EN MÓVILES (< sm) */}
      {(title || description || (buttonText && onNavigate)) && (
        <div className="sm:hidden p-3.5 bg-slate-950 border-t border-slate-900/80 flex flex-col gap-2.5">
          {(title || description) && (
            <div className="space-y-0.5">
              {title && (
                <h3 className="text-sm font-extrabold text-white leading-snug tracking-tight">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          )}

          {buttonText && onNavigate && (
            <button
              type="button"
              onClick={onNavigate}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <span>{buttonText}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
