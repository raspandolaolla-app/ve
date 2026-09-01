// ==============================================================================
// RASPANDO LA OLLA — CARRUSEL DE TORNEOS Y POTES EN VIVO (HORIZONTALES)
// ==============================================================================

import React, { useRef } from 'react';
import {
  Trophy,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  Flame,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../../components/common/Button';

interface TournamentItem {
  id: string;
  gameId: string;
  gameTitle: string;
  badgeStatus: 'LIVE' | 'UPCOMING';
  prizePoolText: string;
  participantsText: string;
  timeRemainingText: string;
  icon: string;
}

interface TournamentsCarouselProps {
  onJoinTournament: (tournament: TournamentItem) => void;
}

export const TournamentsCarousel: React.FC<TournamentsCarouselProps> = ({
  onJoinTournament,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const tournaments: TournamentItem[] = [
    {
      id: 'tourn-polla-1',
      gameId: 'polla_venezolana',
      gameTitle: 'Gran Polla Venezolana',
      badgeStatus: 'LIVE',
      prizePoolText: '90% del Pozo Acumulado',
      participantsText: 'Sin límite de jugadores',
      timeRemainingText: 'Turno Tarde (05:55 PM)',
      icon: '🐾',
    },
    {
      id: 'tourn-domino-1',
      gameId: 'domino_venezolano',
      gameTitle: 'Torneo Dominó Criollo',
      badgeStatus: 'LIVE',
      prizePoolText: 'Bs. 40.000',
      participantsText: '24 Participantes',
      timeRemainingText: 'En 1h 25m',
      icon: '🎲',
    },
    {
      id: 'tourn-truco-1',
      gameId: 'truco_venezolano',
      gameTitle: 'Envite & Flor — Copa Truquera',
      badgeStatus: 'UPCOMING',
      prizePoolText: 'Bs. 25.000',
      participantsText: '16 Jugadores',
      timeRemainingText: 'Hoy 08:00 PM',
      icon: '🃏',
    },
    {
      id: 'tourn-bingo-1',
      gameId: 'bingo',
      gameTitle: 'Mega Bingo 90 Bolas',
      badgeStatus: 'LIVE',
      prizePoolText: 'Bs. 50.000',
      participantsText: '100 Cartones',
      timeRemainingText: 'En 35 min',
      icon: '🎱',
    },
    {
      id: 'tourn-atrapaito-1',
      gameId: 'atrapaito',
      gameTitle: 'Atrapaíto Rápido 6 Fichas',
      badgeStatus: 'UPCOMING',
      prizePoolText: 'Bs. 15.000',
      participantsText: '8 Parejas',
      timeRemainingText: 'Mañana 03:00 PM',
      icon: '🎯',
    },
  ];

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 320;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div id="tournaments-carousel-section" className="space-y-3 select-none">
      {/* Cabecera del Carrusel */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#F5B942]/10 border border-[#F5B942]/30 flex items-center justify-center text-[#F5B942]">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#F8FAFC] tracking-tight">
              Torneos & Potes en Vivo
            </h2>
            <p className="text-[11px] text-[#94A3B8]">
              Compite por pozos acumulados con liquidación instantánea 90/10
            </p>
          </div>
        </div>

        {/* Botones de Navegación Desktop */}
        <div className="hidden sm:flex items-center gap-1.5">
          <button
            onClick={() => handleScroll('left')}
            className="p-1.5 rounded-xl bg-[#171E2A] hover:bg-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2938] transition-colors"
            aria-label="Anterior torneo"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleScroll('right')}
            className="p-1.5 rounded-xl bg-[#171E2A] hover:bg-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2938] transition-colors"
            aria-label="Siguiente torneo"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenedor con Scroll Horizontal Snap */}
      <div
        ref={scrollContainerRef}
        className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory py-1 px-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tournaments.map((t) => (
          <div
            key={t.id}
            className="snap-start shrink-0 w-[280px] sm:w-[320px] rounded-2xl bg-[#171E2A] hover:bg-[#1E2938] border border-[#1E2938] hover:border-[#FF8A00]/50 p-4 transition-all duration-200 flex flex-col justify-between shadow-lg group relative overflow-hidden"
          >
            {/* Fondo sutil degradado */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#FF8A00]/10 to-transparent rounded-bl-full pointer-events-none" />

            <div className="space-y-3">
              {/* Badge de Estado y Icono */}
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    t.badgeStatus === 'LIVE'
                      ? 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30'
                      : 'bg-[#F5B942]/10 text-[#F5B942] border border-[#F5B942]/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      t.badgeStatus === 'LIVE'
                        ? 'bg-[#22C55E] animate-ping'
                        : 'bg-[#F5B942]'
                    }`}
                  />
                  <span>{t.badgeStatus === 'LIVE' ? 'POTE EN VIVO' : 'PRÓXIMO'}</span>
                </span>

                <span className="text-2xl">{t.icon}</span>
              </div>

              {/* Título y Premio */}
              <div>
                <h3 className="text-sm font-black text-[#F8FAFC] group-hover:text-[#FF8A00] transition-colors line-clamp-1">
                  {t.gameTitle}
                </h3>
                <div className="text-xs text-[#F5B942] font-black font-mono mt-0.5">
                  Premio: {t.prizePoolText}
                </div>
              </div>

              {/* Datos de Participantes y Tiempo */}
              <div className="pt-2 border-t border-[#1E2938] grid grid-cols-2 gap-2 text-[11px] text-[#94A3B8]">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#2496FF] shrink-0" />
                  <span className="truncate">{t.participantsText}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#F5B942] shrink-0" />
                  <span className="truncate">{t.timeRemainingText}</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-3 mt-2">
              <button
                onClick={() => onJoinTournament(t)}
                className="w-full py-2 px-3 rounded-xl bg-[#111722] hover:bg-[#FF8A00] text-[#F8FAFC] hover:text-[#080B12] border border-[#1E2938] hover:border-[#FF8A00] font-black text-xs transition-all flex items-center justify-center gap-1.5 group-hover:shadow-md cursor-pointer"
              >
                <span>Entrar al Torneo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
