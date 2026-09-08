// ==============================================================================
// RASPANDO LA OLLA — LOBBY PRINCIPAL RESTAURADO
// Multijugador venezolano: Dominó, Truco, Bingo, Polla, Atrapaíto, Damas, etc.
// ==============================================================================

import React, { useState, useMemo } from 'react';
import { GameCard } from './GameCard';
import { TournamentsCarousel } from './TournamentsCarousel';
import { BingoLiveViewer } from './BingoLiveViewer';
import { BingoLobbySection } from './BingoLobbySection';
import { PublicMatchHistorySection } from './PublicMatchHistorySection';
import { FAQAccordion } from './FAQAccordion';
import { LobbyMainActionButtons } from './LobbyMainActionButtons';
import { LobbyVideoSpotlight } from '../../components/advertising/LobbyVideoSpotlight';
import { LobbyBannerSpotlight } from '../../components/advertising/LobbyBannerSpotlight';
import { SUPPORTED_GAMES_METADATA } from '../../utils/constants';
import { useAuth } from '../auth/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useGameAvailability } from '../../context/GameAvailabilityContext';
import {
  Flame,
  Gamepad2,
  Sparkles,
  Search,
  Filter,
  Users,
  Trophy,
  Zap,
  Play,
  ShieldCheck,
  ChevronRight,
  BookOpen,
  Headphones,
} from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface LobbyViewProps {
  onSelectGame: (game: GameMetadata) => void;
  onJoinTrancaito?: () => void;
  onNavigateTab?: (tab: string) => void;
  onSelectBingoVariant?: (variant: '75' | '80' | '90', tableId: string) => void;
  onOpenRules?: (gameId?: string) => void;
  onOpenSupport?: () => void;
}

type GameCategory = 'all' | 'traditional' | 'cards' | 'board' | 'casual';

export const LobbyView: React.FC<LobbyViewProps> = ({
  onSelectGame,
  onJoinTrancaito,
  onNavigateTab,
  onSelectBingoVariant,
  onOpenRules,
  onOpenSupport,
}) => {
  const { user } = useAuth();
  const { balance } = useWallet();
  const { isGameEnabled } = useGameAvailability();
  const [selectedCategory, setSelectedCategory] = useState<GameCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtro dinámico de juegos: excluye automáticamente cualquier juego deshabilitado por el admin
  const filteredGames = useMemo(() => {
    return SUPPORTED_GAMES_METADATA.filter((game) => {
      // 1. Control Central: Si está deshabilitado en backend/admin, NO se muestra
      if (!isGameEnabled(game.id)) {
        return false;
      }

      // 2. Búsqueda por texto
      const matchesSearch =
        game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.shortDescription.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // 3. Filtro por categoría
      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'traditional') {
        return ['domino_venezolano', 'truco_venezolano', 'bingo', 'atrapaito'].includes(game.id);
      }
      if (selectedCategory === 'cards') {
        return ['truco_venezolano', 'una_olla'].includes(game.id);
      }
      if (selectedCategory === 'board') {
        return ['domino_venezolano', 'checkers', 'chess', 'atrapaito'].includes(game.id);
      }
      if (selectedCategory === 'casual') {
        return ['tic_tac_toe', 'rock_paper_scissors'].includes(game.id);
      }
      return true;
    });
  }, [selectedCategory, searchQuery, isGameEnabled]);

  const safeNavigate = onNavigateTab || ((tab: string) => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab } })));

  return (
    <div id="lobby-view" data-testid="lobby-main-view" className="space-y-6 sm:space-y-8 pb-12">
      {/* 1. BOTONES PRINCIPALES: MESA / POLLA (ZONA SUPERIOR PRIORITARIA) */}
      <section id="lobby-main-actions-section" aria-label="Accesos Principales">
        <LobbyMainActionButtons onNavigateTab={safeNavigate} />
      </section>

      {/* 2. VÍDEO PUBLICITARIO OFICIAL (INMEDIATAMENTE DEBAJO DE LOS BOTONES — 100% VISIBLE SIN RECORTES) */}
      <section id="lobby-video-spotlight-section" aria-label="Video Publicitario Destacado">
        <LobbyVideoSpotlight onNavigateTab={safeNavigate} />
      </section>

      {/* 3. BANNER PUBLICITARIO OFICIAL (INMEDIATAMENTE DEBAJO DEL VÍDEO) */}
      <section id="lobby-banner-spotlight-section" aria-label="Banner Publicitario">
        <LobbyBannerSpotlight onNavigateTab={safeNavigate} />
      </section>

      {/* 2. PANTALLA GIGANTE DE BINGO EN VIVO (VISTA DE ESPECTADOR EN TIEMPO REAL) */}
      <section id="lobby-bingo-live-viewer-section" aria-label="Pantalla Gigante de Bingo en Vivo">
        <BingoLiveViewer
          onSelectBingoVariant={onSelectBingoVariant}
          onNavigateTab={onNavigateTab}
        />
      </section>

      {/* 3. CARRUSEL DE TORNEOS Y POTES EN VIVO (Se oculta automáticamente si no hay torneos) */}
      <TournamentsCarousel
        onJoinTournament={(tournament) => {
          const gType = tournament?.game_type || tournament?.gameId;
          if ((gType === 'polla' || gType === 'polla_venezolana') && onNavigateTab) {
            onNavigateTab('polla');
          } else if (onNavigateTab) {
            onNavigateTab('tables');
          }
        }}
      />

      {/* 3. SECCIÓN DESTACADA DE BINGO: MESAS EN VIVO Y GANADORES (SOLO SI ESTÁ HABILITADO) */}
      {isGameEnabled('bingo') && (
        <section id="lobby-bingo-showcase-section" aria-label="Mesas de Bingo Disponibles">
          <BingoLobbySection
            onSelectBingoVariant={onSelectBingoVariant}
            onNavigateTab={onNavigateTab}
          />
        </section>
      )}

      {/* 4. CATÁLOGO COMPLETO DE JUEGOS DISPONIBLES */}
      <section id="lobby-games-catalog" className="pt-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-[#FF8A00]" />
              <h2 className="text-lg sm:text-xl font-black text-white tracking-wide uppercase">
                Juegos Disponibles
              </h2>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
              Selecciona tu juego o participa en mesas públicas o crea tu propia sala
            </p>
          </div>

          {/* Buscador de Juegos y Botón de Manual */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            {onOpenRules && (
              <button
                onClick={() => onOpenRules('atrapaito')}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer"
                title="Consultar reglamento oficial y cómo jugar"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Manual & Reglas</span>
              </button>
            )}

            <div className="relative w-full sm:w-60 md:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                id="lobby-search-games-input"
                type="text"
                placeholder="Buscar juego..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#131926] border border-slate-800 rounded-lg text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Pestañas / Filtros de Categorías Compactas */}
        <div id="lobby-categories-filters" className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
          {[
            { id: 'all', label: 'Todos los Juegos', icon: Sparkles },
            { id: 'traditional', label: 'Tradicionales', icon: Flame },
            { id: 'cards', label: 'Cartas', icon: Trophy },
            { id: 'board', label: 'Tablero', icon: Users },
            { id: 'casual', label: 'Duelos Rápidos', icon: Zap },
          ].map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                id={`filter-cat-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id as GameCategory)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-sm shadow-amber-500/20'
                    : 'bg-[#131926] border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Cuadrícula de Juegos Compactada */}
        {filteredGames.length === 0 ? (
          <div
            id="lobby-no-games-found"
            className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center mt-4"
          >
            <Filter className="w-7 h-7 text-slate-600 mx-auto mb-2" />
            <p className="text-xs sm:text-sm font-bold text-slate-400">No se encontraron juegos para esta búsqueda.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-2.5 text-xs font-bold text-[#FF8A00] hover:underline"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div
            id="lobby-games-grid"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4 mt-4"
          >
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onlinePlayersCount={game.id === 'domino_venezolano' ? 28 : game.id === 'bingo' ? 45 : 12}
                onSelectGame={onSelectGame}
                onOpenRules={onOpenRules}
              />
            ))}
          </div>
        )}
      </section>

      {/* 5. HISTORIAL PÚBLICO DE PARTIDAS AUDITADAS (REALTIME) */}
      <section id="lobby-match-history-section" aria-label="Historial Público de Partidas">
        <PublicMatchHistorySection />
      </section>

      {/* 6. ACORDEÓN DE PREGUNTAS FRECUENTES (FAQ & SEGURIDAD) */}
      <section id="lobby-faq-section" aria-label="Preguntas Frecuentes">
        <FAQAccordion onOpenSupport={onOpenSupport} />
      </section>

      {/* 7. AYUDA Y SOPORTE CENTRALIZADO (PREVIO AL FOOTER) */}
      <section id="lobby-help-support-section" aria-label="Ayuda y Soporte">
        <div className="rounded-2xl sm:rounded-3xl border border-[#1E2938] bg-gradient-to-br from-[#0D1524] to-[#0A0E18] p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3.5 text-center sm:text-left min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-[#2496FF] to-[#22C55E] p-0.5 flex items-center justify-center shrink-0 shadow-md shadow-[#2496FF]/20">
              <div className="w-full h-full bg-[#080B12] rounded-2xl flex items-center justify-center">
                <Headphones className="w-5 h-5 sm:w-6 sm:h-6 text-[#2496FF]" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <h3 className="text-sm sm:text-base font-black text-white tracking-tight">
                  ¿Necesitas Ayuda o Atención Personalizada?
                </h3>
                <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>24/7 En Vivo</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Chatea en tiempo real con un operador oficial de Raspando La Olla o consulta tus tickets.
              </p>
            </div>
          </div>

          <button
            type="button"
            id="lobby-support-center-btn"
            onClick={() => {
              if (onOpenSupport) {
                onOpenSupport();
              } else {
                safeNavigate('support');
              }
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
          >
            <Headphones className="w-4 h-4" />
            <span>Abrir Soporte al Jugador</span>
          </button>
        </div>
      </section>
    </div>
  );
};

export default LobbyView;
