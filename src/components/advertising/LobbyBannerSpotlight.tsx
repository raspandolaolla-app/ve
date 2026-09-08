// ==============================================================================
// RASPANDO LA OLLA — BANNER PUBLICITARIO DESTACADO (LOBBY BANNER SPOTLIGHT)
// ==============================================================================
// Ubicación: Inmediatamente debajo del Video Publicitario Oficial.
// Muestra anuncios gráficos de alta calidad (SVG, PNG, JPG, WebP) con rotación.
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { AdService } from '../../services/advertising/AdService';
import { AdvertisingAssetProvider } from '../../services/advertising/AdvertisingAssetProvider';
import { useGameAvailability } from '../../context/GameAvailabilityContext';
import { Sparkles, ArrowRight, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AdvertisingCampaign } from '../../types/advertising';

interface LobbyBannerSpotlightProps {
  onNavigateTab?: (tab: string) => void;
  className?: string;
}

export const LobbyBannerSpotlight: React.FC<LobbyBannerSpotlightProps> = ({
  onNavigateTab,
  className = '',
}) => {
  const { isGameEnabled } = useGameAvailability();
  const [banners, setBanners] = useState<AdvertisingCampaign[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Cargar campañas de tipo imagen para la zona HOME
  useEffect(() => {
    let isMounted = true;
    const loadBanners = () => {
      try {
        const adService = AdService.getInstance();
        const allAds = adService.getAdsForPlacement('HOME_TOP', { isGameEnabled });

        // Filtrar exclusivamente banners de tipo imagen
        const imageAds = allAds.filter(
          (ad) =>
            ad.asset?.assetType === 'image' ||
            (ad.asset?.filePath && !ad.asset.filePath.endsWith('.mp4') && !ad.asset.filePath.endsWith('.webm'))
        );

        if (isMounted) {
          setBanners(imageAds);
        }
      } catch (err) {
        console.error('[LobbyBannerSpotlight] Error cargando banners:', err);
      }
    };

    loadBanners();
    const unsubscribe = AdService.getInstance().subscribe(() => {
      loadBanners();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isGameEnabled]);

  // Rotación automática cada 7 segundos para banners estáticos
  useEffect(() => {
    if (banners.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [banners.length, isPaused]);

  const currentBanner = banners[currentIndex] || null;

  const rawImagePath = currentBanner?.asset?.filePath || currentBanner?.asset?.publicUrl;
  const bannerImageUrl = rawImagePath
    ? AdvertisingAssetProvider.getAssetUrl(rawImagePath)
    : 'ads/banners/default_banner.svg';

  const bannerTitle =
    currentBanner?.name ||
    currentBanner?.asset?.title ||
    'Raspando La Olla 🇻🇪';

  const bannerDesc =
    currentBanner?.asset?.description ||
    '¡Juegos tradicionales en tiempo real con pagos inmediatos por Pago Móvil!';

  const bannerCta =
    currentBanner?.ctaText ||
    currentBanner?.asset?.ctaText ||
    'JUGAR AHORA';

  const targetUrl = currentBanner?.targetUrl || 'tables';

  const handleClick = () => {
    if (onNavigateTab) {
      onNavigateTab(targetUrl);
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  return (
    <section
      id="lobby-banner-spotlight-section"
      aria-label="Banner Publicitario Oficial"
      className={`w-full max-w-5xl mx-auto ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        onClick={handleClick}
        className="group relative w-full h-[95px] sm:h-[115px] md:h-[135px] max-h-[160px] rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-amber-500/25 hover:border-amber-400/50 bg-[#0A0E18] shadow-xl shadow-black/60 transition-all duration-300 cursor-pointer flex items-center justify-between"
      >
        {/* Imagen del Banner de Fondo */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={bannerImageUrl}
            alt={bannerTitle}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-500"
            onError={(e) => {
              // Fallback a default banner
              (e.currentTarget as HTMLImageElement).src = 'ads/banners/default_banner.svg';
            }}
          />
          {/* Sombra y gradiente para contraste del texto */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/70 to-slate-950/30" />
        </div>

        {/* Badge de Patrocinio */}
        <div className="absolute top-2 left-3 z-10 flex items-center gap-1.5 rounded-full bg-slate-950/80 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-400 backdrop-blur-md border border-amber-500/30 shadow-md select-none">
          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
          <span>Publicidad</span>
        </div>

        {/* Contenido Informativo */}
        <div className="relative z-10 p-3.5 sm:p-5 flex items-center justify-between gap-4 w-full">
          <div className="min-w-0 max-w-xl space-y-0.5 sm:space-y-1">
            <h3 className="text-sm sm:text-base md:text-lg font-black text-white tracking-wide uppercase truncate drop-shadow-md group-hover:text-amber-300 transition-colors">
              {bannerTitle}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-200 line-clamp-1 font-medium drop-shadow">
              {bannerDesc}
            </p>
          </div>

          {/* Botón CTA */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              className="px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 group-hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <span>{bannerCta}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Flechas de navegación para múltiples banners en Desktop */}
        {banners.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Banner anterior"
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white items-center justify-center transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Banner siguiente"
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 text-white items-center justify-center transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </section>
  );
};
