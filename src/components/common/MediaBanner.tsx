// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE CARRUSEL Y PROMO BANNER MULTIMEDIA (IMÁGENES Y VIDEOS)
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Play, ArrowRight, ChevronLeft, ChevronRight, Pause, Volume2, VolumeX } from 'lucide-react';
import { BannerRepository, type ContentBannerItem } from '../../services/repositories/BannerRepository';

interface MediaBannerProps {
  location?: string;
  onNavigateTab?: (tab: string) => void;
  className?: string;
  autoSlideIntervalMs?: number;
}

export const MediaBanner: React.FC<MediaBannerProps> = ({
  location = 'HOME',
  onNavigateTab,
  className = '',
  autoSlideIntervalMs = 6000,
}) => {
  const [banners, setBanners] = useState<ContentBannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadBanners = async () => {
      setLoading(true);
      const list = await BannerRepository.getActiveBanners(location);
      if (isMounted) {
        setBanners(list);
        setLoading(false);
        setCurrentIndex(0);
      }
    };
    loadBanners();
    return () => {
      isMounted = false;
    };
  }, [location]);

  // Cambio automático de diapositivas (Auto-slide)
  useEffect(() => {
    if (banners.length <= 1 || isPaused || activeVideoUrl) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, autoSlideIntervalMs);

    return () => clearInterval(timer);
  }, [banners.length, isPaused, activeVideoUrl, autoSlideIntervalMs]);

  if (loading || banners.length === 0) return null;

  const current = banners[currentIndex];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  return (
    <div
      id={`media-carousel-${location.toLowerCase()}`}
      className={`relative space-y-3 ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Carrusel Principal */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-slate-900/90 shadow-2xl transition-all hover:border-amber-500/50">
        {/* Banner Image Background overlay */}
        <div className="absolute inset-0 z-0 opacity-20">
          <img
            src={current.imageUrl}
            alt={current.title}
            className="h-full w-full object-cover filter blur-sm scale-110"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-stretch gap-6 p-6 sm:p-8 min-h-[220px]">
          {/* Thumbnail / Image / Video Box */}
          <div className="relative w-full md:w-80 h-48 sm:h-52 shrink-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-inner group">
            <img
              src={current.imageUrl}
              alt={current.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />

            {/* Si contiene video, mostrar botón de reproducción grande */}
            {current.videoUrl && (
              <button
                type="button"
                onClick={() => setActiveVideoUrl(current.videoUrl || null)}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 hover:bg-black/20 transition-all text-amber-400 group/vid"
                title="Reproducir video promocional"
              >
                <div className="p-4 bg-amber-500 text-slate-950 rounded-full shadow-2xl group-hover/vid:scale-110 transition-transform">
                  <Play className="w-7 h-7 fill-current ml-1" />
                </div>
                <span className="mt-2 text-[11px] font-black uppercase text-white bg-slate-950/80 px-2.5 py-1 rounded-full border border-amber-500/30 shadow-md">
                  Ver Video
                </span>
              </button>
            )}

            {/* Insignia de Tipo */}
            <div className="absolute top-2 left-2 z-10">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-950/90 border border-amber-500/40 text-amber-300 shadow-md">
                {current.videoUrl ? '🎬 Video' : '📸 Promoción'}
              </span>
            </div>
          </div>

          {/* Banner Text & Action Content */}
          <div className="flex-1 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {current.location}
                </span>
                {banners.length > 1 && (
                  <span className="text-[10px] font-mono text-slate-400">
                    {currentIndex + 1} / {banners.length}
                  </span>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                {current.title}
              </h2>

              {current.description && (
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                  {current.description}
                </p>
              )}
            </div>

            {/* Action Button */}
            {current.buttonText && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateTab && current.targetAction) {
                      onNavigateTab(current.targetAction);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all cursor-pointer transform active:scale-95"
                >
                  <span>{current.buttonText}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Flechas de Navegación Manual (si hay más de 1 banner) */}
        {banners.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-950/80 border border-slate-700 text-slate-300 hover:text-white hover:border-amber-500 transition-all cursor-pointer shadow-lg"
              title="Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-950/80 border border-slate-700 text-slate-300 hover:text-white hover:border-amber-500 transition-all cursor-pointer shadow-lg"
              title="Siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Indicadores de Puntos (Dots) */}
        {banners.length > 1 && (
          <div className="absolute bottom-3 right-4 z-20 flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-full border border-slate-800">
            {banners.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentIndex ? 'w-6 bg-amber-400' : 'w-2 bg-slate-600 hover:bg-slate-400'
                }`}
                title={`Ir a diapositiva ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* MODAL PARA REPRODUCIR VIDEO */}
      {activeVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-amber-500/40 rounded-3xl overflow-hidden shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-black text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                <Play className="w-4 h-4 fill-current" /> Reproductor de Video Promocional
              </span>
              <button
                type="button"
                onClick={() => setActiveVideoUrl(null)}
                className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Cerrar ✕
              </button>
            </div>

            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center">
              {activeVideoUrl.includes('youtube.com') || activeVideoUrl.includes('vimeo.com') ? (
                <iframe
                  src={activeVideoUrl}
                  title="Video Promocional"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  src={activeVideoUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                >
                  Tu navegador no soporta la reproducción directa de video.
                </video>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
