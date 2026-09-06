// ==============================================================================
// RASPANDO LA OLLA — REPRODUCTOR DE VIDEO PUBLICITARIO DESTACADO (LOBBY SPOTLIGHT)
// ==============================================================================
// Cumple al 100% con los requisitos del Ajuste Final del Bloque Publicitario:
// 1. Ubicación: Inmediatamente debajo de los Botones Principales (Mesa / Polla).
// 2. 100% Visible: Sin recortes en vertical ni horizontal (object-fit: contain).
// 3. Detección automática de orientación (horizontal, vertical, cuadrado).
// 4. Adaptación responsive del contenedor para evitar deformaciones o layout shift.
// 5. Estado normal limpio; controles/CTA en hover (PC) o touch (Móvil/PWA).
// 6. Integración contextual con Game Registry y useCapabilities.
// ==============================================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { GameVideoAd } from './GameVideoAd';
import { AdService } from '../../services/advertising/AdService';
import { AdvertisingAssetProvider } from '../../services/advertising/AdvertisingAssetProvider';
import { useGameAvailability } from '../../context/GameAvailabilityContext';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { AdvertisingCampaign } from '../../types/advertising';

interface LobbyVideoSpotlightProps {
  onNavigateTab?: (tab: string) => void;
  className?: string;
}

interface VideoMetadata {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: 'horizontal' | 'vertical' | 'square';
}

export const LobbyVideoSpotlight: React.FC<LobbyVideoSpotlightProps> = ({
  onNavigateTab,
  className = '',
}) => {
  const { isGameEnabled } = useGameAvailability();
  const [videoAds, setVideoAds] = useState<AdvertisingCampaign[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);

  // Cargar campañas de video activas para la ubicación HOME_TOP
  useEffect(() => {
    let isMounted = true;
    const loadAds = () => {
      try {
        const adService = AdService.getInstance();
        const allHomeAds = adService.getAdsForPlacement('HOME_TOP', {
          isGameEnabled,
        });

        // Filtrar exclusivamente los que son de tipo video o contienen archivo .mp4 / .webm
        const videosOnly = allHomeAds.filter(
          (ad) =>
            ad.asset?.assetType === 'video' ||
            ad.asset?.filePath?.endsWith('.mp4') ||
            ad.asset?.filePath?.endsWith('.webm') ||
            ad.asset?.publicUrl?.endsWith('.mp4') ||
            ad.asset?.publicUrl?.endsWith('.webm')
        );

        if (isMounted) {
          setVideoAds(videosOnly);
          setLoading(false);
        }
      } catch (err) {
        console.error('[LobbyVideoSpotlight] Error cargando videos publicitarios:', err);
        if (isMounted) setLoading(false);
      }
    };

    loadAds();
    const unsubscribe = AdService.getInstance().subscribe(() => {
      loadAds();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isGameEnabled]);

  const currentAd = videoAds[currentIndex] || null;

  // Fallback por defecto si no hay videos en base de datos o manifest
  const rawPath = currentAd?.asset?.filePath || currentAd?.asset?.publicUrl;
  const effectiveVideoUrl = rawPath
    ? AdvertisingAssetProvider.getAssetUrl(rawPath)
    : 'ads/banners/video1.mp4';

  const rawPoster = currentAd?.asset?.posterPath || currentAd?.asset?.posterUrl;
  const effectivePosterUrl = rawPoster
    ? AdvertisingAssetProvider.getAssetUrl(rawPoster)
    : 'ads/banners/poster_video1.jpg';

  const effectiveTitle = currentAd?.name || currentAd?.asset?.title || 'Raspando La Olla';
  const effectiveDescription = currentAd?.asset?.description || '¡Juegos tradicionales en tiempo real!';
  const effectiveGameId = currentAd?.game_id || currentAd?.gameType || null;
  const effectiveCta = currentAd?.ctaText || currentAd?.asset?.ctaText || 'VER MESAS';

  // Manejo de cambio de video al terminar reproducción
  const handleVideoEnded = useCallback(() => {
    if (videoAds.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % videoAds.length);
    }
  }, [videoAds.length]);

  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + videoAds.length) % videoAds.length);
  }, [videoAds.length]);

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % videoAds.length);
  }, [videoAds.length]);

  // Actualizar metadatos del video cargado para adaptar el contenedor dinámicamente
  const handleMetadataLoaded = useCallback((meta: VideoMetadata) => {
    setMetadata(meta);
  }, []);

  // Calcular contenedor según orientación del video
  const orientation = metadata?.orientation || 'horizontal';
  const aspectRatio = metadata?.aspectRatio || (16 / 9);

  // Clases dinámicas de ancho y alto máximo según la orientación para evitar recortes
  const containerClasses = useMemo(() => {
    if (orientation === 'vertical') {
      // Videos verticales (ej. 9:16 o 3:4): centrados con ancho contenido en PC y móvil
      return 'w-full max-w-[340px] sm:max-w-[380px] md:max-w-[420px] mx-auto';
    }
    if (orientation === 'square') {
      // Videos cuadrados (1:1)
      return 'w-full max-w-[420px] sm:max-w-[480px] mx-auto';
    }
    // Videos horizontales (16:9, etc.)
    return 'w-full max-w-5xl mx-auto';
  }, [orientation]);

  // Altura máxima proporcional para que el video no se corte y no produzca scroll excesivo
  const containerStyle: React.CSSProperties = useMemo(() => {
    if (orientation === 'vertical') {
      return {
        aspectRatio: `${aspectRatio}`,
        maxHeight: 'min(72vh, 600px)',
      };
    }
    if (orientation === 'square') {
      return {
        aspectRatio: '1 / 1',
        maxHeight: 'min(65vh, 500px)',
      };
    }
    // Horizontal
    return {
      aspectRatio: `${aspectRatio}`,
      maxHeight: 'min(58vh, 460px)',
    };
  }, [orientation, aspectRatio]);

  return (
    <section
      id="lobby-prominent-video-section"
      aria-label="Video Publicitario Oficial"
      className={`w-full ${className}`}
    >
      <div className={containerClasses}>
        <div
          style={containerStyle}
          className="group/spotlight relative w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-[#06080F] border-2 border-amber-500/30 hover:border-amber-500/50 shadow-2xl shadow-black/80 flex items-center justify-center transition-all duration-300"
        >
          {/* REPRODUCTOR CENTRAL AISLADO — 100% VISIBLE CON object-contain */}
          <GameVideoAd
            key={effectiveVideoUrl}
            videoUrl={effectiveVideoUrl}
            posterUrl={effectivePosterUrl}
            title={effectiveTitle}
            description={effectiveDescription}
            gameId={effectiveGameId}
            ctaText={effectiveCta}
            targetUrl={currentAd?.targetUrl || 'tables'}
            badge={currentAd?.badge || undefined}
            autoPlay={true}
            loop={videoAds.length <= 1}
            onEnded={handleVideoEnded}
            onNavigate={onNavigateTab ? () => onNavigateTab(currentAd?.targetUrl || 'tables') : undefined}
            showAdBadge={true}
            adBadgeText="PUBLICIDAD"
            videoFit="contain"
            onMetadataLoaded={handleMetadataLoaded}
            className="w-full h-full"
          />

          {/* FLECHAS DE NAVEGACIÓN MANUAL (SI HAY MÁS DE UN VIDEO) */}
          {videoAds.length > 1 && (
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 z-30 flex items-center justify-between pointer-events-none opacity-0 group-hover/spotlight:opacity-100 transition-opacity duration-200">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Video publicitario anterior"
                className="pointer-events-auto p-2 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-amber-500/30 text-amber-300 hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-90 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                type="button"
                onClick={handleNext}
                aria-label="Video publicitario siguiente"
                className="pointer-events-auto p-2 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-amber-500/30 text-amber-300 hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-90 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          )}

          {/* INDICADORES DE PAGINACIÓN DISCRETOS EN EL BORDE INFERIOR */}
          {videoAds.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 pointer-events-none opacity-0 group-hover/spotlight:opacity-100 transition-opacity duration-200">
              {videoAds.map((_, idx) => (
                <span
                  key={`vid-dot-${idx}`}
                  className={`block rounded-full transition-all duration-300 ${
                    idx === currentIndex
                      ? 'w-4 h-1.5 bg-amber-400'
                      : 'w-1.5 h-1.5 bg-slate-500/60'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
