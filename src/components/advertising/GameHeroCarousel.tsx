// ==============================================================================
// RASPANDO LA OLLA — CARRUSEL HERO PRINCIPAL DE JUEGOS Y ANUNCIOS (HERO CAROUSEL)
// ==============================================================================
// Ubicación: Parte superior del Lobby / Inicio (público para todos los usuarios).
// Soporta:
// - Banners, ilustraciones y videos (/public/ads/)
// - Autoplay configurable con pausa al interactuar o botón manual
// - Deslizamiento táctil (swipe) para smartphones y tablets
// - Acceso directo a reglas ("¿Cómo jugar?")
// - Botón CTA inteligente integrado con GameRegistry y useCapabilities
// - Filtro en tiempo real según disponibilidad de juegos (isGameEnabled)
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Flame,
  Trophy,
  Users,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { GameRegistry } from '../../services/games/GameRegistry';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useGameAvailability } from '../../context/GameAvailabilityContext';
import { GameVideoAd } from './GameVideoAd';
import { AdService } from '../../services/advertising/AdService';
import type { AdvertisingCampaign } from '../../types/advertising';

interface HeroSlideItem {
  id: string;
  gameId?: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor?: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  posterUrl?: string;
  ctaText?: string;
  gradient: string;
}

interface GameHeroCarouselProps {
  onNavigateTab: (tab: string) => void;
  onOpenRules?: (gameId: string) => void;
  className?: string;
}

export const GameHeroCarousel: React.FC<GameHeroCarouselProps> = ({
  onNavigateTab,
  onOpenRules,
  className = '',
}) => {
  const { isGameEnabled } = useGameAvailability();
  const { executeOrPromptLogin, isAuthenticated } = useCapabilities();

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [isVideoInteracting, setIsVideoInteracting] = useState<boolean>(false);
  const heroHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHeroHideTimer = useCallback(() => {
    if (heroHideTimerRef.current) {
      clearTimeout(heroHideTimerRef.current);
      heroHideTimerRef.current = null;
    }
    heroHideTimerRef.current = setTimeout(() => {
      setIsVideoInteracting(false);
    }, 3500);
  }, []);

  const showVideoOverlay = useCallback(() => {
    setIsVideoInteracting(true);
    resetHeroHideTimer();
  }, [resetHeroHideTimer]);

  const hideVideoOverlay = useCallback(() => {
    if (heroHideTimerRef.current) {
      clearTimeout(heroHideTimerRef.current);
      heroHideTimerRef.current = null;
    }
    setIsVideoInteracting(false);
  }, []);

  useEffect(() => {
    return () => {
      if (heroHideTimerRef.current) {
        clearTimeout(heroHideTimerRef.current);
      }
    };
  }, []);

  // Al cambiar de diapositiva, si es video regresa al estado limpio normal
  useEffect(() => {
    setIsVideoInteracting(false);
    if (heroHideTimerRef.current) {
      clearTimeout(heroHideTimerRef.current);
      heroHideTimerRef.current = null;
    }
  }, [currentIndex]);

  const [campaignSlides, setCampaignSlides] = useState<AdvertisingCampaign[]>([]);

  // Cargar campañas activas de AdService para inyectar promociones
  useEffect(() => {
    try {
      const active = AdService.getInstance().getAdsForPlacement('HOME_TOP');
      if (active && active.length > 0) {
        setCampaignSlides(active);
      }
    } catch (err) {
      console.warn('[GameHeroCarousel] Error cargando campañas adicionales:', err);
    }
  }, []);

  // Diapositivas base estructuradas de juegos populares y nuevos
  const defaultSlides: HeroSlideItem[] = [
    {
      id: 'slide-domino',
      gameId: 'domino_venezolano',
      title: 'DOMINÓ CLÁSICO VENEZOLANO',
      subtitle: 'Partidas 1v1 y en parejas a 100 puntos. Con tranca oficial, paso y capicúa.',
      badge: '⭐ POPULAR • SALAS 24/7',
      badgeColor: 'from-amber-500 to-yellow-400',
      mediaType: 'image',
      mediaUrl: '/ads/domino_hero.png',
      gradient: 'from-[#0B132B] via-[#1C2541] to-[#0A0E1A]',
    },
    {
      id: 'slide-truco',
      gameId: 'truco_venezolano',
      title: 'TRUCO CRIOLLO ORIENTAL',
      subtitle: 'Envite, Flor y Truco a 24 puntos. Grita ¡Retruco! y ¡Vale Cuatro! en mesas vivas.',
      badge: '🔥 100% CRIOLLO',
      badgeColor: 'from-orange-500 to-red-500',
      mediaType: 'image',
      mediaUrl: '/ads/truco_hero.png',
      gradient: 'from-[#1A0B2E] via-[#2A1B4E] to-[#0F0826]',
    },
    {
      id: 'slide-polla',
      gameId: 'polla_venezolana',
      title: 'LA POLLA VENEZOLANA',
      subtitle: 'Acierta 6 animalitos en los turnos oficiales de 00 a 76 y llévate el pozo acumulado.',
      badge: '💰 POZO EN JUEGO',
      badgeColor: 'from-emerald-500 to-teal-400',
      mediaType: 'image',
      mediaUrl: '/ads/polla_hero.png',
      gradient: 'from-[#062c1e] via-[#0b4231] to-[#041a12]',
    },
    {
      id: 'slide-una-olla',
      gameId: 'una_olla',
      title: 'UNA-OLLA VENEZOLANO',
      subtitle: 'El emocionante juego de cartas por rondas. Lleva la cuenta y vacía la olla del rival.',
      badge: '🆕 NUEVO JUEGO',
      badgeColor: 'from-yellow-400 to-amber-500',
      mediaType: 'image',
      mediaUrl: '/ads/banner_principal.png',
      gradient: 'from-[#2e1d05] via-[#452b09] to-[#1a0f02]',
    },
    {
      id: 'slide-atrapaito',
      gameId: 'atrapaito',
      title: 'ATRAPAÍTO CRIOLLO',
      subtitle: 'Velocidad y reflejos puros al estilo de las mesas populares. ¡Reacciona a tiempo!',
      badge: '⚡ AGILIDAD MENTAL',
      badgeColor: 'from-sky-500 to-indigo-500',
      mediaType: 'image',
      mediaUrl: '/ads/promo_general.png',
      gradient: 'from-[#092238] via-[#0f3456] to-[#061828]',
    },
    {
      id: 'slide-bingo',
      gameId: 'bingo_venezolano',
      title: 'BINGO CRIOLLO DE 75 BOLAS',
      subtitle: 'Cartones automáticos con línea, cuatro esquinas y pozo completo multijugador.',
      badge: '🎟️ SALAS MASIVAS',
      badgeColor: 'from-purple-500 to-pink-500',
      mediaType: 'image',
      mediaUrl: '/ads/anuncio_general.png',
      gradient: 'from-[#2a0845] via-[#43106d] to-[#170326]',
    },
  ];

  // Convertir campañas adicionales en diapositivas si aplican
  const extraSlides: HeroSlideItem[] = campaignSlides
    .filter((c) => c.asset && (c.asset.publicUrl || c.asset.filePath))
    .map((c) => ({
      id: `campaign-${c.id}`,
      gameId: c.game_id || c.gameType || undefined,
      title: c.name || c.asset?.title || 'Raspando La Olla',
      subtitle: c.asset?.description || 'Promoción especial en Raspando La Olla.',
      badge: c.badge || 'PROMO',
      badgeColor: 'from-amber-400 to-orange-500',
      mediaType: c.asset?.assetType === 'video' ? 'video' : 'image',
      mediaUrl: c.asset?.publicUrl || c.asset?.filePath || '/ads/banner_principal.png',
      posterUrl: c.asset?.posterUrl || c.asset?.posterPath || undefined,
      ctaText: c.ctaText || undefined,
      gradient: 'from-[#111827] via-[#1F2937] to-[#0F172A]',
    }));

  // Filtrar diapositivas cuyos juegos estén activos en el sistema
  const allSlides = [...defaultSlides, ...extraSlides].filter((slide) => {
    if (!slide.gameId) return true;
    return isGameEnabled(slide.gameId);
  });

  const totalSlides = allSlides.length;

  // Manejo de cambio automático (Autoplay)
  useEffect(() => {
    if (!isPlaying || totalSlides <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % totalSlides);
    }, 6000);
    return () => clearInterval(interval);
  }, [isPlaying, totalSlides]);

  const handlePrev = useCallback(() => {
    if (totalSlides <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  const handleNext = useCallback(() => {
    if (totalSlides <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  // Gestos táctiles para móviles
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const diff = touchStartX - touchEndX;
    if (diff > 50) {
      handleNext();
    } else if (diff < -50) {
      handlePrev();
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  if (totalSlides === 0) {
    return null;
  }

  const currentSlide = allSlides[currentIndex] || allSlides[0];
  const canonicalGameId = currentSlide.gameId || 'domino_venezolano';
  const ctaConfig = GameRegistry.getCtaConfig(canonicalGameId);
  const displayCta = currentSlide.ctaText || (isAuthenticated ? ctaConfig.label : ctaConfig.guestLabel);

  // Ejecutar acción del CTA principal
  const handleCtaClick = () => {
    if (ctaConfig.action === 'OPEN_POLLA') {
      onNavigateTab('polla');
      return;
    }

    if (ctaConfig.action === 'PLAY_GAME' && canonicalGameId === 'atrapaito') {
      onNavigateTab('atrapaito');
      return;
    }

    // Creación de mesa con validación de visitante
    executeOrPromptLogin(
      {
        type: 'CREATE_TABLE',
        gameId: canonicalGameId,
        tab: 'tables',
      },
      () => {
        onNavigateTab('tables');
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('open-create-table', {
              detail: { gameType: canonicalGameId, gameId: canonicalGameId },
            })
          );
        }, 150);
      }
    );
  };

  const isVideoSlide = currentSlide.mediaType === 'video';
  const showOverlay = !isVideoSlide || isVideoInteracting;

  return (
    <section
      id="game-hero-carousel"
      aria-label="Juegos destacados y promociones"
      onMouseEnter={() => {
        setIsPlaying(false);
        if (isVideoSlide) showVideoOverlay();
      }}
      onMouseMove={isVideoSlide ? resetHeroHideTimer : undefined}
      onMouseLeave={() => {
        setIsPlaying(true);
        if (isVideoSlide) hideVideoOverlay();
      }}
      onTouchStart={(e) => {
        handleTouchStart(e);
        if (isVideoSlide) showVideoOverlay();
      }}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onFocus={isVideoSlide ? showVideoOverlay : undefined}
      onBlur={isVideoSlide ? hideVideoOverlay : undefined}
      className={`relative w-full rounded-3xl overflow-hidden border border-slate-700/70 bg-slate-950 shadow-2xl transition-all select-none ${className}`}
    >
      {/* Contenedor del Slide Activo (Reducido a la mitad para proporción y balance óptimo en PC y móviles) */}
      <div
        className={`relative min-h-[160px] sm:min-h-[180px] md:min-h-[200px] lg:min-h-[220px] xl:min-h-[235px] flex flex-col justify-between p-3.5 sm:p-5 md:p-6 lg:p-7 bg-gradient-to-r ${currentSlide.gradient}`}
      >
        {/* FONDO MULTIMEDIA: VIDEO O IMAGEN */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {isVideoSlide ? (
            <GameVideoAd
              videoUrl={currentSlide.mediaUrl}
              posterUrl={currentSlide.posterUrl}
              title={currentSlide.title}
              gameId={currentSlide.gameId}
              autoPlay={true}
              loop={true}
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={currentSlide.mediaUrl}
              alt={currentSlide.title}
              className="w-full h-full object-cover object-center opacity-30 mix-blend-luminosity scale-105 transition-transform duration-1000"
              onError={(e) => {
                // Si la imagen falla, mantener fondo gradiente limpio sin romper la UI
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
              referrerPolicy="no-referrer"
            />
          )}
          {/* Degradados de fondo (solo visibles cuando el overlay está activo en video, o siempre en imagen) */}
          <div
            className={`absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent transition-opacity duration-300 motion-reduce:transition-none ${
              showOverlay ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent transition-opacity duration-300 motion-reduce:transition-none ${
              showOverlay ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>

        {/* CONTENIDO Y CONTROLES DEL OVERLAY (LIMPIO POR DEFECTO EN VIDEO; VISIBLE EN HOVER/TOUCH) */}
        <div
          className={`relative z-10 flex flex-col justify-between flex-1 gap-2 transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
            showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* PARTE SUPERIOR: BADGE Y CONTROLES DE REPRODUCCIÓN */}
          <div className="flex items-center justify-between gap-3 w-full">
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r ${currentSlide.badgeColor} text-slate-950 text-[9px] sm:text-[10px] font-black uppercase tracking-wider shadow-md`}
            >
              <Sparkles className="w-3 h-3 fill-current" />
              <span>{currentSlide.badge}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? 'Pausar carrusel automático' : 'Reanudar carrusel automático'}
                className="p-1.5 rounded-full bg-black/40 hover:bg-black/60 border border-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* PARTE CENTRAL: TITULAR Y DESCRIPCIÓN */}
          <div className="my-auto max-w-xl space-y-1 sm:space-y-1.5 py-1">
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight leading-tight uppercase drop-shadow-md">
              {currentSlide.title}
            </h1>
            <p className="text-[11px] sm:text-xs md:text-sm text-slate-200 font-medium leading-snug line-clamp-1 sm:line-clamp-2 drop-shadow">
              {currentSlide.subtitle}
            </p>
          </div>

          {/* PARTE INFERIOR: BOTONES CTA Y "¿CÓMO JUGAR?" */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
            <button
              id={`hero-cta-${canonicalGameId}`}
              type="button"
              onClick={handleCtaClick}
              className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-yellow-500/25 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>{displayCta}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-950" />
            </button>

            {onOpenRules && (
              <button
                type="button"
                onClick={() => onOpenRules(canonicalGameId)}
                className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-700/80 text-slate-200 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-md active:scale-95"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>¿Cómo jugar?</span>
              </button>
            )}
          </div>
        </div>

        {/* FLECHAS DE NAVEGACIÓN LATERALES (DESKTOP) */}
        {totalSlides > 1 && (
          <div
            className={`transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
              showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Diapositiva anterior"
              className="hidden md:flex absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 text-white items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-sm"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Diapositiva siguiente"
              className="hidden md:flex absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 text-white items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-sm"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* INDICADORES DE PUNTOS INFERIORES */}
        {totalSlides > 1 && (
          <div
            className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 transition-opacity duration-300 ease-in-out motion-reduce:transition-none ${
              showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            {allSlides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Ir a diapositiva ${idx + 1}: ${slide.title}`}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  currentIndex === idx
                    ? 'w-5 h-1.5 bg-amber-400'
                    : 'w-1.5 h-1.5 bg-slate-500/70 hover:bg-slate-300'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
