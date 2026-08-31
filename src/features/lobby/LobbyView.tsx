// ==============================================================================
// RASPANDO LA OLLA — VISTA PRINCIPAL (LOBBY REDISEÑADO MOBILE-FIRST)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { SUPPORTED_GAMES_METADATA, GLOBAL_DRAWS_METADATA } from '../../utils/constants';
import { PresenceService } from '../../services/PresenceService';
import { MediaBanner } from '../../components/common/MediaBanner';
import { InstallPWAButton } from '../../components/common/InstallPWAButton';
import { PublicMatchHistorySection } from './PublicMatchHistorySection';
import { BingoLobbySection } from './BingoLobbySection';
import { TournamentsCarousel } from './TournamentsCarousel';
import { GameCard } from './GameCard';
import { FAQAccordion } from './FAQAccordion';
import { AdPlacementContainer } from '../../components/advertising/AdPlacementContainer';
import {
  Sparkles,
  Play,
  Award,
  Sun,
  Moon,
  ArrowRight,
  Flame,
  Zap,
  Lock,
  Trophy,
  Users,
} from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface LobbyViewProps {
  onSelectGame: (game: GameMetadata) => void;
  onJoinTrancaito: () => void;
  onNavigateTab?: (tab: string) => void;
  onSelectBingoVariant?: (variant: '75' | '80' | '90', tableId: string) => void;
}

export function LobbyView({
  onSelectGame,
  onJoinTrancaito,
  onNavigateTab,
  onSelectBingoVariant,
}: LobbyViewProps) {
  const [onlineCount, setOnlineCount] = useState<number>(
    PresenceService.getOnlineUserIds().length
  );

  useEffect(() => {
    return PresenceService.subscribeToOnlineUsers((ids) => {
      setOnlineCount(ids.length);
    });
  }, []);

  const scrollToGames = () => {
    const el = document.getElementById('section-table-games');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToTournaments = () => {
    const el = document.getElementById('tournaments-carousel-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div id="lobby-view" className="space-y-6 sm:space-y-8 select-none">
      {/* ========================================================= */}
      {/* 1. BANNER DE CONTENIDO ADMINISTRABLE (MEDIA BANNER)       */}
      {/* ========================================================= */}
      <MediaBanner location="HOME" onNavigateTab={onNavigateTab} />

      {/* Publicidad de Cabecera Superior */}
      <AdPlacementContainer
        placement="HOME_TOP"
        onNavigate={onNavigateTab}
        showBadge={true}
        className="my-1"
      />

      {/* ========================================================= */}
      {/* 2. HERO / BANNER PRINCIPAL "¡LA OLLA ESTÁ CALIENTE!"      */}
      {/* ========================================================= */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#171E2A] via-[#111722] to-[#080B12] border border-[#FF8A00]/30 p-5 sm:p-8 shadow-2xl">
        {/* Fondo con brillo sutil */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#FF8A00]/15 via-[#F5B942]/10 to-transparent rounded-bl-full pointer-events-none" />

        <div className="relative z-10 max-w-2xl space-y-3 sm:space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF8A00]/15 border border-[#FF8A00]/30 text-[#FF8A00] text-xs font-black tracking-wide">
              <span>🔥</span>
              <span>¡LA OLLA ESTÁ CALIENTE!</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
              <span>
                {onlineCount} {onlineCount === 1 ? 'Jugador Online' : 'Jugadores Online'}
              </span>
            </div>
          </div>

          <h1 className="text-xl sm:text-3xl lg:text-4xl font-black text-[#F8FAFC] tracking-tight leading-tight">
            Juega, compite y disfruta tus <span className="text-[#FF8A00]">juegos venezolanos</span> favoritos.
          </h1>

          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed max-w-xl">
            Mesas públicas con emparejamiento automático o partidas privadas <strong className="text-[#F5B942]">"Trancaíto"</strong> con tus panas. Sorteos diarios de Polla y Bingo auditados con la regla 90/10.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              id="hero-btn-games"
              onClick={scrollToGames}
              className="px-5 py-2.5 rounded-xl bg-[#FF8A00] hover:bg-[#FF8A00]/90 text-[#080B12] font-black text-xs transition-all flex items-center gap-2 shadow-lg shadow-[#FF8A00]/20 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Ver Juegos</span>
            </button>

            <button
              id="hero-btn-tournaments"
              onClick={scrollToTournaments}
              className="px-5 py-2.5 rounded-xl bg-[#171E2A] hover:bg-[#1E2938] text-[#F8FAFC] border border-[#1E2938] hover:border-[#F5B942] font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-[#F5B942]" />
              <span>Ver Torneos</span>
            </button>

            <button
              id="hero-btn-trancaito"
              onClick={onJoinTrancaito}
              className="px-4 py-2.5 rounded-xl bg-[#111722] hover:bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2938] font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-[#FF8A00]" />
              <span>Unirse a Trancaíto</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. CARRUSEL DE TORNEOS & POTES EN VIVO                    */}
      {/* ========================================================= */}
      <TournamentsCarousel
        onJoinTournament={(t) => {
          if (t.gameId === 'polla_venezolana' && onNavigateTab) {
            onNavigateTab('polla');
          } else {
            const meta = SUPPORTED_GAMES_METADATA.find((g) => g.id === t.gameId);
            if (meta) onSelectGame(meta);
            else if (onNavigateTab) onNavigateTab('tables');
          }
        }}
      />

      {/* ========================================================= */}
      {/* 4. SORTEO GLOBAL PERMANENTE — POLLA VENEZOLANA            */}
      {/* ========================================================= */}
      <div id="section-global-draws" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/30 flex items-center justify-center text-[#22C55E]">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#F8FAFC] tracking-tight">
                Sorteo Diario — Polla Venezolana
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                Quiniela diaria de 6 animalitos (00 a 76 sin repetir) con pozo acumulado
              </p>
            </div>
          </div>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('polla')}
              className="text-xs font-bold text-[#FF8A00] hover:text-[#F5B942] flex items-center gap-1 cursor-pointer"
            >
              <span className="hidden sm:inline">Pantalla Completa</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-[#F5B942]/30 bg-gradient-to-r from-[#171E2A] via-[#111722] to-[#080B12] p-4 sm:p-6 shadow-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#F5B942]/10 border border-[#F5B942]/30 flex items-center justify-center text-2xl shadow-inner shrink-0">
                  🐾
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#F8FAFC]">
                    Polla Venezolana (Animalitos)
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8] mt-0.5">
                    <span className="font-mono text-[#F5B942] font-bold">Ticket: 250 Bs</span>
                    <span>•</span>
                    <span className="text-[#22C55E] font-bold">Premio: 90% del Pozo Acumulado</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs">
                <div className="p-2.5 sm:p-3 bg-[#080B12]/80 border border-[#1E2938] rounded-xl flex items-center gap-2.5">
                  <Sun className="w-4 h-4 text-[#F5B942] shrink-0" />
                  <div>
                    <div className="font-bold text-[#F8FAFC]">Turno Mañana</div>
                    <div className="text-[10px] text-[#94A3B8] font-mono">Sorteo: 07:55 AM</div>
                  </div>
                </div>
                <div className="p-2.5 sm:p-3 bg-[#080B12]/80 border border-[#1E2938] rounded-xl flex items-center gap-2.5">
                  <Moon className="w-4 h-4 text-[#2496FF] shrink-0" />
                  <div>
                    <div className="font-bold text-[#F8FAFC]">Turno Tarde</div>
                    <div className="text-[10px] text-[#94A3B8] font-mono">Sorteo: 05:55 PM</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full md:w-auto flex flex-col items-stretch md:items-end gap-2 shrink-0">
              <button
                id="btn-buy-polla-lobby"
                onClick={() => {
                  if (onNavigateTab) onNavigateTab('polla');
                }}
                className="w-full sm:w-auto py-3 px-6 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#F5B942] hover:brightness-110 text-[#080B12] font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#FF8A00]/20 cursor-pointer"
              >
                <span>🐾 Comprar Polla Venezolana</span>
              </button>
              <span className="text-[10px] text-[#94A3B8] text-center md:text-right font-mono">
                Sorteo automático permanente. Sin límite de jugadores.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 5. BINGO CRIOLLO ONLINE (75, 80 Y 90 BOLAS)               */}
      {/* ========================================================= */}
      <BingoLobbySection
        onlineCount={onlineCount}
        onSelectBingoVariant={(variant, tableId) => {
          if (onSelectBingoVariant) {
            onSelectBingoVariant(variant, tableId);
          } else {
            const bingoMeta = SUPPORTED_GAMES_METADATA.find((g) => g.id === 'bingo');
            if (bingoMeta) onSelectGame(bingoMeta);
          }
        }}
      />

      {/* ========================================================= */}
      {/* 6. CATÁLOGO DE JUEGOS CON MESAS Y SALAS                   */}
      {/* ========================================================= */}
      <div id="section-table-games" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#FF8A00]/10 border border-[#FF8A00]/30 flex items-center justify-center text-[#FF8A00]">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#F8FAFC] tracking-tight">
                Juegos con Mesas & Salas en Vivo
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                8 juegos multijugador por turnos en tiempo real con validación server-side
              </p>
            </div>
          </div>
        </div>

        {/* Grid Responsive de Juegos */}
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {SUPPORTED_GAMES_METADATA.map((game, index) => (
            <GameCard
              key={game.id}
              game={game}
              onlinePlayersCount={Math.max(4, (index * 3 + 7) % 25)}
              onSelectGame={onSelectGame}
            />
          ))}
        </div>
      </div>

      {/* Publicidad Intermedia del Lobby */}
      <AdPlacementContainer
        placement="HOME_MIDDLE"
        onNavigate={onNavigateTab}
        showBadge={true}
        className="my-3"
      />

      {/* ========================================================= */}
      {/* 7. VICTORIAS RECIENTES (FEED EN TIEMPO REAL)              */}
      {/* ========================================================= */}
      <PublicMatchHistorySection />

      {/* ========================================================= */}
      {/* 8. PREGUNTAS FRECUENTES (FAQ ACORDEÓN)                    */}
      {/* ========================================================= */}
      <FAQAccordion />

      {/* Publicidad Inferior del Lobby */}
      <AdPlacementContainer
        placement="HOME_BOTTOM"
        onNavigate={onNavigateTab}
        showBadge={true}
        className="my-3"
      />

      {/* ========================================================= */}
      {/* 9. BANNERS PROMOCIONALES INFERIORES                       */}
      {/* ========================================================= */}
      <MediaBanner location="PROMOTIONS" onNavigateTab={onNavigateTab} />
      <MediaBanner location="INFO" onNavigateTab={onNavigateTab} />
    </div>
  );
}
