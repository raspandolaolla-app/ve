// ==============================================================================
// RASPANDO LA OLLA — CONTENEDOR DE PUBLICIDAD PROFESIONAL RESPONSIVE
// ==============================================================================
// - Soporta imágenes (.svg, .png, .jpg, .webp) y videos (.mp4, .webm).
// - Reproducción fluida de video: muted, playsInline, autoPlay, poster image.
// - Control de audio flotante accesible (Silenciar / Activar sonido).
// - Carrusel automático con indicadores visuales y transición suave.
// - Respeto estricto a disponibilidad de juegos (Sección 41).
// - Manejo de fallos con fallback elegante a poster o banner por defecto.
// - Sanitización estricta de URLs de destino.
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAds } from '../../hooks/useAds';
import { AdService } from '../../services/advertising/AdService';
import { AdvertisingAssetProvider } from '../../services/advertising/AdvertisingAssetProvider';
import { GameVideoAd } from './GameVideoAd';
import type { AdPlacement } from '../../types/advertising';
import {
  ExternalLink,
  Sparkles,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';

interface AdPlacementContainerProps {
  placement: AdPlacement;
  gameType?: string | null;
  className?: string;
  onNavigate?: (tab: string) => void;
  showBadge?: boolean;
  autoRotateInterval?: number; // milisegundos (default: 8000ms para banners)
}

export const AdPlacementContainer: React.FC<AdPlacementContainerProps> = ({
  placement,
  gameType,
  className = '',
  onNavigate,
  showBadge = true,
  autoRotateInterval = 8000,
}) => {
  const adOptions = useMemo(() => ({ gameType }), [gameType]);
  const { ad, ads, totalAds, currentIndex, loading, nextAd, prevAd, goToAd, reportFailure } =
    useAds(placement, adOptions);

  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [detectedAspect, setDetectedAspect] = useState<string>('16 / 9');

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset de estados de error al cambiar de anuncio
  useEffect(() => {
    setVideoError(false);
    setImageError(false);
  }, [ad?.id]);

  const isCurrentVideo = Boolean(
    ad?.asset?.assetType === 'video' ||
    ad?.asset?.filePath?.endsWith('.mp4') ||
    ad?.asset?.filePath?.endsWith('.webm')
  );

  // Rotación automática para banners de imagen (si hay más de 1 anuncio elegible)
  useEffect(() => {
    if (totalAds <= 1 || isHovered || isCurrentVideo) return;

    const timer = setInterval(() => {
      nextAd();
    }, autoRotateInterval);

    return () => clearInterval(timer);
  }, [totalAds, isHovered, isCurrentVideo, autoRotateInterval, nextAd]);

  // Intento de reproducción de video seguro
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = isMuted;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Si el navegador bloquea autoplay, se mantiene pausado mostrando poster
          console.debug('[AdPlacementContainer] Autoplay pausado por política del navegador:', err);
        });
      }
    }
  }, [ad?.id, isMuted]);

  // Si no hay anuncio elegible o está cargando y no hay datos previos
  if (!ad && !loading) {
    return null;
  }

  if (!ad) {
    return null;
  }

  const asset = ad.asset;
  const assetUrl = asset?.filePath
    ? AdvertisingAssetProvider.getAssetUrl(asset.filePath)
    : AdvertisingAssetProvider.getFallbackUrl();

  const posterUrl = asset?.posterPath
    ? AdvertisingAssetProvider.getAssetUrl(asset.posterPath)
    : asset?.posterUrl || undefined;

  const isVideo =
    (asset?.assetType === 'video' || assetUrl.endsWith('.mp4') || assetUrl.endsWith('.webm')) &&
    !videoError;

  // Manejo seguro del clic en el anuncio
  const handleClick = (e: React.MouseEvent) => {
    // Evitar disparar navegación si se clickea un control interno (ej. volumen o flechas)
    if ((e.target as HTMLElement).closest('[data-ad-control]')) {
      return;
    }

    const rawUrl = ad.targetUrl || asset?.targetUrl;
    const sanitizedUrl = AdService.sanitizeUrl(rawUrl);
    if (!sanitizedUrl) return;

    if (sanitizedUrl.startsWith('http://') || sanitizedUrl.startsWith('https://')) {
      window.open(sanitizedUrl, '_blank', 'noopener,noreferrer');
    } else if (onNavigate) {
      onNavigate(sanitizedUrl);
    }
  };

  const handleVideoEnded = () => {
    if (totalAds > 1) {
      nextAd();
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleVideoError = () => {
    console.warn(`[AdPlacementContainer] Error cargando video "${assetUrl}". Usando poster/fallback.`);
    setVideoError(true);
    if (ad.id) {
      reportFailure(ad.id);
    }
  };

  const handleImageError = () => {
    console.warn(`[AdPlacementContainer] Error cargando imagen "${assetUrl}".`);
    setImageError(true);
    if (ad.id) {
      reportFailure(ad.id);
    }
  };

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      const newMuted = !videoRef.current.muted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  };

  return (
    <section
      id={`ad-placement-${placement.toLowerCase().replace(/_/g, '-')}`}
      className={`group relative overflow-hidden rounded-2xl border border-amber-500/20 bg-slate-950/80 shadow-xl transition-all duration-300 ${className}`}
      role="complementary"
      aria-label={`Publicidad destacada: ${ad.name}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Badge discreto de patrocinio / publicidad (Solo para imágenes estáticas; los videos lo manejan en hover/touch) */}
      {showBadge && !isVideo && (
        <div
          data-ad-control="true"
          className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-400 backdrop-blur-md border border-amber-500/30 shadow-md select-none pointer-events-none"
        >
          <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
          <span>Publicidad</span>
        </div>
      )}

      {/* Contenedor Multimedia Principal */}
      <div
        style={isVideo ? { aspectRatio: detectedAspect, maxHeight: 'min(65vh, 480px)' } : undefined}
        className={`w-full relative flex items-center justify-center overflow-hidden bg-slate-900 ${
          isVideo
            ? 'w-full'
            : 'aspect-[21/5] sm:aspect-[28/6] min-h-[90px] md:min-h-[115px] lg:min-h-[135px] max-h-[190px]'
        } ${ad.targetUrl && !isVideo ? 'cursor-pointer' : ''}`}
        onClick={!isVideo ? handleClick : undefined}
      >
        {isVideo ? (
          <GameVideoAd
            videoUrl={assetUrl}
            posterUrl={posterUrl}
            title={ad.name || asset?.title || undefined}
            description={asset?.description || undefined}
            gameId={ad.game_id || ad.gameType || undefined}
            ctaText={ad.ctaText || asset?.ctaText || undefined}
            targetUrl={ad.targetUrl || undefined}
            badge={ad.badge || undefined}
            showAdBadge={showBadge}
            autoPlay={true}
            loop={totalAds === 1}
            onEnded={handleVideoEnded}
            onNavigate={onNavigate ? () => onNavigate(ad.targetUrl || 'lobby') : undefined}
            videoFit="contain"
            onMetadataLoaded={(meta) => {
              if (meta.aspectRatio) {
                setDetectedAspect(`${meta.aspectRatio}`);
              }
            }}
            className="w-full h-full rounded-2xl"
          />
        ) : (
          <>
            <img
              src={imageError && posterUrl ? posterUrl : imageError ? AdvertisingAssetProvider.getFallbackUrl() : assetUrl}
              alt={asset?.title || ad.name || 'Publicidad'}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover rounded-2xl transition-transform duration-500 group-hover:scale-[1.01]"
              onError={handleImageError}
            />

            {/* Overlay informativo con degradado y llamada a la acción (SOLO PARA IMÁGENES) */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-transparent p-3 sm:p-4 flex items-end justify-between gap-3 pointer-events-none">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs sm:text-base font-black text-white truncate drop-shadow-md">
                  {ad.name}
                </h3>
                {asset?.description && (
                  <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-1 drop-shadow-sm mt-0.5">
                    {asset.description}
                  </p>
                )}
              </div>

              {(ad.ctaText || asset?.ctaText) && (
                <button
                  type="button"
                  data-ad-control="true"
                  onClick={handleClick}
                  className="pointer-events-auto shrink-0 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 text-xs font-black tracking-wide shadow-lg shadow-amber-500/20 flex items-center gap-1.5 hover:from-amber-400 hover:to-amber-300 active:scale-95 transition-all uppercase cursor-pointer"
                >
                  <span>{ad.ctaText || asset?.ctaText || 'VER MÁS'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </>
        )}

        {/* Flechas de navegación (si hay múltiples anuncios) */}
        {totalAds > 1 && (
          <>
            <button
              type="button"
              data-ad-control="true"
              onClick={(e) => {
                e.stopPropagation();
                prevAd();
              }}
              aria-label="Anuncio anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/70 text-slate-300 border border-white/10 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-900 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              data-ad-control="true"
              onClick={(e) => {
                e.stopPropagation();
                nextAd();
              }}
              aria-label="Siguiente anuncio"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/70 text-slate-300 border border-white/10 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-900 hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Indicadores de paginación (dots) si hay más de 1 anuncio */}
      {totalAds > 1 && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-black/40 backdrop-blur-md">
          {ads.map((item, idx) => (
            <button
              key={item.id || idx}
              type="button"
              data-ad-control="true"
              onClick={(e) => {
                e.stopPropagation();
                goToAd(idx);
              }}
              aria-label={`Ir al anuncio ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-5 bg-amber-400' : 'w-1.5 bg-slate-400/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
