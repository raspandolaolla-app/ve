// ==============================================================================
// RASPANDO LA OLLA — ZONA PUBLICITARIA AUTOMÁTICA (VIDEOS Y BANNER IMÁGENES)
// ==============================================================================
// Sistema de publicidad automatizada con soporte completo para videos de Supabase:
// - Reproducción automática inmediata (autoplay)
// - Inicialización sin sonido (muted) con persistencia de audio global
// - Bucle continuo y rotación automática entre anuncios activos
// - Sin controles nativos de reproducción (imposible pausar/adelantar por el jugador)
// - Botón flotante de audio independiente (🔇 / 🔊)
// - Etiqueta flotante de "PUBLICIDAD" sobre el reproductor
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { BannerRepository, type ContentBannerItem } from '../../services/repositories/BannerRepository';
import { VideoAdPlayer } from './VideoAdPlayer';

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
  autoSlideIntervalMs = 7000,
}) => {
  const [banners, setBanners] = useState<ContentBannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

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

  const current = banners[currentIndex];
  const isVideoAd = Boolean(current?.videoUrl) || current?.mediaType === 'video';

  // Rotación automática de anuncios cuando hay varios activos (SOLO PARA BANNER DE IMAGEN)
  useEffect(() => {
    // NOTA CRÍTICA: Para anuncios de video, la transición debe ser impulsada EXCLUSIVAMENTE
    // por el evento 'ended' del reproductor. Se deshabilita cualquier temporizador setInterval.
    if (loading || banners.length <= 1 || isPaused || isVideoAd) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, autoSlideIntervalMs);

    return () => clearInterval(timer);
  }, [loading, banners.length, isPaused, autoSlideIntervalMs, isVideoAd]);

  if (loading || banners.length === 0 || !current) return null;

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
  };

  const handleActionClick = () => {
    if (onNavigateTab && current.targetAction) {
      onNavigateTab(current.targetAction);
    }
  };

  return (
    <div
      id={`ad-zone-${location.toLowerCase()}`}
      className={`relative space-y-3 ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* SI ES ANUNCIO DE VIDEO -> REPRODUCTOR AUTOMÁTICO INTEGRADO */}
      {isVideoAd && current.videoUrl ? (
        <div className="relative">
          <VideoAdPlayer
            src={current.videoUrl}
            posterUrl={current.imageUrl}
            title={current.title}
            description={current.description}
            buttonText={current.buttonText}
            onNavigate={handleActionClick}
            onEnded={() => {
              if (banners.length > 1) {
                handleNext();
              }
            }}
            showAdBadge={true}
            adBadgeText="PUBLICIDAD"
            loop={banners.length === 1}
          />

          {/* Flechas de cambio si hay múltiples anuncios */}
          {banners.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-slate-950/80 border border-slate-700 text-slate-300 hover:text-white hover:border-amber-500 transition-all cursor-pointer shadow-lg"
                title="Anuncio Anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-slate-950/80 border border-slate-700 text-slate-300 hover:text-white hover:border-amber-500 transition-all cursor-pointer shadow-lg"
                title="Siguiente Anuncio"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Indicadores de rotación */}
          {banners.length > 1 && (
            <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 bg-slate-950/85 px-3 py-1 rounded-full border border-slate-800 backdrop-blur-md">
              {banners.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentIndex ? 'w-6 bg-amber-400' : 'w-2 bg-slate-600 hover:bg-slate-400'
                  }`}
                  title={`Ir al anuncio ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* SI ES ANUNCIO DE IMAGEN / BANNER TRADICIONAL */
        <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-slate-900/90 shadow-2xl transition-all hover:border-amber-500/50">
          {/* Fondo difuminado */}
          <div className="absolute inset-0 z-0 opacity-20">
            <img
              src={current.imageUrl}
              alt={current.title}
              className="h-full w-full object-cover filter blur-sm scale-110"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* ETIQUETA EXTERNA DE PUBLICIDAD */}
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1 rounded-md bg-black/85 border border-amber-500/40 backdrop-blur-md shadow-lg pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-300 font-mono">
              PUBLICIDAD
            </span>
          </div>

          <div className="relative z-10 flex flex-col md:flex-row items-stretch gap-6 p-6 sm:p-8 min-h-[220px]">
            {/* Contenedor de Imagen */}
            <div className="relative w-full md:w-80 h-48 sm:h-52 shrink-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-inner group">
              <img
                src={current.imageUrl}
                alt={current.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Texto y Botón de Acción */}
            <div className="flex-1 flex flex-col justify-between space-y-4 pt-4 md:pt-0">
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

              {current.buttonText && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleActionClick}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all cursor-pointer transform active:scale-95"
                  >
                    <span>{current.buttonText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Flechas de Navegación Manual */}
          {banners.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-950/80 border border-slate-700 text-slate-300 hover:text-white hover:border-amber-500 transition-all cursor-pointer shadow-lg"
                title="Anuncio Anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-slate-950/80 border border-slate-700 text-slate-300 hover:text-white hover:border-amber-500 transition-all cursor-pointer shadow-lg"
                title="Siguiente Anuncio"
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
                  title={`Ir al anuncio ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
