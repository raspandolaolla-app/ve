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
        className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory py-1 px-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tournaments.map((t) => (
          <div
            key={t.id}
            className="snap-start shrink-0 w-[290px] sm:w-[320px] rounded-2xl bg-[#131926] hover:bg-[#1A2235] border border-slate-800 hover:border-amber-500/50 p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between shadow-lg group relative overflow-hidden"
          >
            {/* Header: Badge y Gráfico Visual */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  t.badgeStatus === 'LIVE'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    t.badgeStatus === 'LIVE' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span>{t.badgeStatus === 'LIVE' ? 'POTE EN VIVO' : 'PRÓXIMO'}</span>
              </span>

              {/* Gráfico temático */}
              <div className="w-12 h-10 rounded-lg bg-[#0B0F17] border border-slate-800 flex items-center justify-center text-xl shadow-inner group-hover:scale-110 transition-transform">
                {t.gameId === 'polla_venezolana' ? (
                  <span className="text-amber-400 text-xs font-black tracking-tighter bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/30">
                    TICKET
                  </span>
                ) : t.gameId === 'domino_venezolano' ? (
                  <span>🎲</span>
                ) : t.gameId === 'truco_venezolano' ? (
                  <span>🃏</span>
                ) : (
                  <span>🎱</span>
                )}
              </div>
            </div>

            {/* Contenido Central: Título y Premio */}
            <div className="space-y-1 mb-4">
              <h3 className="text-base font-black text-white group-hover:text-amber-400 transition-colors line-clamp-1">
                {t.gameTitle}
              </h3>
              <p className="text-xs text-amber-400 font-bold font-mono">
                Premio: {t.prizePoolText}
              </p>
            </div>

            {/* Metadatos (Participantes y Tiempo) */}
            <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 mb-4">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">{t.participantsText}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="truncate">{t.timeRemainingText}</span>
              </div>
            </div>

            {/* Botón de Acción Dorado */}
            <button
              onClick={() => onJoinTournament(t)}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.25)] active:scale-95 cursor-pointer uppercase tracking-wider"
            >
              <span>Entrar al Torneo</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
