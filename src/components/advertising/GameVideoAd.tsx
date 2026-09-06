// ==============================================================================
// RASPANDO LA OLLA — REPRODUCTOR CENTRAL DE VIDEO PUBLICITARIO (GAME VIDEO AD)
// ==============================================================================
// Cumple estrictamente con la especificación de video limpio y profesional:
// 1. ESTADO NORMAL: Video 100% LIMPIO, sin textos, mensajes, botones ni overlays.
// 2. DESKTOP: Al hacer hover o focus, el overlay con controles/CTA aparece suavemente.
//    Al salir el cursor (mouse leave), se oculta de inmediato.
// 3. MÓVIL Y PWA: Al tocar (touch), el overlay aparece durante OVERLAY_AUTO_HIDE_MS
//    (3.5s) y se oculta automáticamente si no hay interacción.
// 4. AISLAMIENTO: La aparición/desaparición del overlay NUNCA reinicia el video,
//    no cambia el src, no desmonta el elemento ni provoca layout shift.
// 5. GAME_ID: Integrado con GameRegistry y useCapabilities para flujos reales.
// 6. VÍDEOS SIN CTA: No muestran overlay artificial, solo controles indispensables.
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, VolumeX, AlertCircle, Sparkles, ArrowRight, Play } from 'lucide-react';
import { GameRegistry } from '../../services/games/GameRegistry';
import { useCapabilities } from '../../hooks/useCapabilities';
import { adAudioPreference } from '../../utils/adAudioPreference';

export interface GameVideoAdProps {
  videoUrl?: string;
  src?: string;
  posterUrl?: string;
  title?: string;
  description?: string | null;
  gameId?: string | null;
  game_id?: string | null;
  ctaText?: string | null;
  ctaAction?: string | null;
  targetUrl?: string | null;
  badge?: string | null;
  autoPlay?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  onNavigate?: () => void;
  className?: string;
  showAdBadge?: boolean;
  adBadgeText?: string;
  videoFit?: 'cover' | 'contain' | 'fill';
  onMetadataLoaded?: (meta: { width: number; height: number; aspectRatio: number; orientation: 'horizontal' | 'vertical' | 'square' }) => void;
}

const OVERLAY_AUTO_HIDE_MS = 3500;

export const GameVideoAd: React.FC<GameVideoAdProps> = ({
  videoUrl,
  src,
  posterUrl,
  title,
  description,
  gameId,
  game_id,
  ctaText,
  ctaAction,
  targetUrl,
  badge,
  autoPlay = true,
  loop = true,
  onEnded,
  onNavigate,
  className = '',
  showAdBadge = false,
  adBadgeText = 'PUBLICIDAD',
  videoFit = 'contain',
  onMetadataLoaded,
}) => {
  const effectiveSrc = videoUrl || src || '';
  const effectiveGameId = gameId || game_id || null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isMuted, setIsMuted] = useState<boolean>(adAudioPreference.getMuted());
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isOverlayVisible, setIsOverlayVisible] = useState<boolean>(false);

  const { executeOrPromptLogin, isAuthenticated } = useCapabilities();

  // Resolver metadatos de juego si aplica
  const canonicalGameId = effectiveGameId ? GameRegistry.getCanonicalId(effectiveGameId) : null;
  const gameMeta = canonicalGameId ? GameRegistry.getGameById(canonicalGameId) : null;

  const displayTitle = gameMeta ? gameMeta.name : title;
  const displayDescription = gameMeta ? gameMeta.shortDescription : description;
  const displayBadge = badge || (canonicalGameId ? GameRegistry.getGameBadge(canonicalGameId) : null);
  const displayCta =
    ctaText ||
    (canonicalGameId
      ? GameRegistry.getGameCtaLabel(canonicalGameId, isAuthenticated)
      : targetUrl
      ? 'VER MÁS'
      : null);

  // Sincronizar preferencia global de audio
  useEffect(() => {
    const unsubscribe = adAudioPreference.subscribe((mutedState) => {
      setIsMuted(mutedState);
      if (videoRef.current) {
        videoRef.current.muted = mutedState;
      }
    });
    return unsubscribe;
  }, []);

  // Manejo de cambio de fuente de video
  useEffect(() => {
    setHasError(false);
    setIsPlaying(false);
    if (videoRef.current && effectiveSrc) {
      videoRef.current.load();
      if (autoPlay) {
        videoRef.current.play().catch(() => {
          // Si autoplay falla por política del navegador, forzar muted y reintentar
          if (videoRef.current) {
            videoRef.current.muted = true;
            adAudioPreference.setMuted(true);
            videoRef.current.play().catch(() => {});
          }
        });
      }
    }
  }, [effectiveSrc, autoPlay]);

  // Limpieza del temporizador al desmontar
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // Reiniciar temporizador de autohide
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    hideTimerRef.current = setTimeout(() => {
      setIsOverlayVisible(false);
    }, OVERLAY_AUTO_HIDE_MS);
  }, []);

  // Mostrar overlay y programar autohide
  const showOverlay = useCallback(() => {
    setIsOverlayVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

  // Ocultar overlay inmediatamente (ej. al salir el mouse)
  const hideOverlay = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsOverlayVisible(false);
  }, []);

  // Alternar sonido sin interrumpir reproducción
  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = adAudioPreference.toggleMuted();
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
    resetHideTimer();
  };

  // Clic en el video (reproduce/pausa y muestra controles transitorios)
  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-ad-control="true"]')) {
      return;
    }

    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }

    // Al interactuar mediante toque o clic, desplegar controles temporalmente
    showOverlay();
  };

  // Clic en la llamada a la acción (CTA)
  const handleCtaClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigate) {
      onNavigate();
      return;
    }

    if (canonicalGameId) {
      executeOrPromptLogin(
        {
          type: 'CREATE_TABLE',
          gameId: canonicalGameId,
          reason: `Inicia sesión para jugar a ${gameMeta?.name || canonicalGameId}`,
        },
        () => {
          // Reanudación o ejecución directa
          window.dispatchEvent(
            new CustomEvent('navigate-tab', { detail: { tab: 'mesas' } })
          );
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('open-create-table', {
                detail: { gameId: canonicalGameId },
              })
            );
          }, 80);
        }
      );
    } else if (targetUrl) {
      if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.dispatchEvent(
          new CustomEvent('navigate-tab', { detail: { tab: targetUrl } })
        );
      }
    }
  };

  if (hasError || !effectiveSrc) {
    return (
      <div
        className={`w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6 ${className}`}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={displayTitle || 'Anuncio'}
            className="w-full h-full object-cover rounded-xl"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-amber-500/80" />
            <span className="text-xs font-semibold text-slate-300">
              {displayTitle || 'Contenido Multimedia'}
            </span>
          </div>
        )}
      </div>
    );
  }

  const hasBottomInfo = Boolean(displayTitle || displayCta || displayDescription);

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      onMouseEnter={showOverlay}
      onMouseMove={resetHideTimer}
      onMouseLeave={hideOverlay}
      onTouchStart={showOverlay}
      onFocus={showOverlay}
      onBlur={hideOverlay}
      tabIndex={0}
      role="region"
      aria-label={displayTitle ? `Video publicitario: ${displayTitle}` : 'Video publicitario'}
      className={`group/video relative w-full h-full overflow-hidden select-none bg-black cursor-pointer outline-none focus:ring-1 focus:ring-amber-500/40 ${className}`}
    >
      {/* 1. ELEMENTO NATIVO DE VIDEO — TOTALMENTE LIMPIO Y AISLADO */}
      <video
        ref={videoRef}
        src={effectiveSrc}
        poster={posterUrl}
        autoPlay={autoPlay}
        muted={isMuted}
        playsInline
        loop={loop}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (width && height && onMetadataLoaded) {
            const aspectRatio = width / height;
            const orientation = aspectRatio < 0.85 ? 'vertical' : aspectRatio > 1.2 ? 'horizontal' : 'square';
            onMetadataLoaded({ width, height, aspectRatio, orientation });
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        onError={() => setHasError(true)}
        className={`w-full h-full ${
          videoFit === 'contain' ? 'object-contain' : videoFit === 'fill' ? 'object-fill' : 'object-cover'
        } object-center pointer-events-none transition-none`}
      />

      {/* 2. OVERLAY TRANSITORIO — VISIBLE ÚNICAMENTE DURANTE INTERACCIÓN (HOVER / TOUCH) */}
      <div
        aria-hidden={!isOverlayVisible}
        className={`absolute inset-0 z-20 flex flex-col justify-between p-3 sm:p-5 pointer-events-none transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
          isOverlayVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* PARTE SUPERIOR DEL OVERLAY: BADGES Y BOTÓN DE AUDIO */}
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-2">
            {displayBadge && (
              <span
                data-ad-control="true"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-amber-500/40 text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-400 shadow-md"
              >
                <Sparkles className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{displayBadge}</span>
              </span>
            )}
            {showAdBadge && (
              <span
                data-ad-control="true"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-white/20 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 shadow-md"
              >
                {adBadgeText}
              </span>
            )}
          </div>

          {/* Botón Flotante de Audio (🔇 / 🔊) */}
          <button
            type="button"
            data-ad-control="true"
            onClick={toggleSound}
            aria-label={isMuted ? 'Activar sonido del video' : 'Silenciar video'}
            title={isMuted ? 'Activar sonido' : 'Silenciar'}
            className="pointer-events-auto p-2.5 rounded-full bg-slate-950/80 hover:bg-black/95 backdrop-blur-md border border-white/20 text-white shadow-xl transition-transform active:scale-90 cursor-pointer"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-amber-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* CENTRO: INDICADOR DISCRETO SI ESTÁ EN PAUSA */}
        {!isPlaying && (
          <div className="self-center p-3 sm:p-4 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-2xl pointer-events-none animate-pulse">
            <Play className="w-6 h-6 sm:w-8 sm:h-8 fill-white" />
          </div>
        )}

        {/* PARTE INFERIOR: TÍTULO, DESCRIPCIÓN Y BOTÓN CTA (SOLO SI TIENE CONTENIDO O ACCIÓN) */}
        {hasBottomInfo ? (
          <div className="relative -mx-3 -mb-3 sm:-mx-5 sm:-mb-5 p-3.5 sm:p-5 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-transparent flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 pt-8">
            <div className="min-w-0 flex-1 space-y-0.5">
              {displayTitle && (
                <h3 className="text-sm sm:text-base md:text-lg font-black text-white tracking-wide truncate drop-shadow-md">
                  {displayTitle}
                </h3>
              )}
              {displayDescription && (
                <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-2 leading-relaxed drop-shadow">
                  {displayDescription}
                </p>
              )}
            </div>

            {displayCta && (
              <button
                type="button"
                data-ad-control="true"
                onClick={handleCtaClick}
                className="pointer-events-auto shrink-0 w-full sm:w-auto px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{displayCta}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-950" />
              </button>
            )}
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};
