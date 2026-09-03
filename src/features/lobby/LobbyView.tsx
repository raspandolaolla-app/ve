// ==============================================================================
// RASPANDO LA OLLA — LOBBY PRINCIPAL RESTAURADO
// Multijugador venezolano: Dominó, Truco, Bingo, Polla, Atrapaíto, Damas, etc.
// ==============================================================================

import React, { useState, useMemo } from 'react';
import { GameCard } from './GameCard';
import { TournamentsCarousel } from './TournamentsCarousel';
import { BingoLobbySection } from './BingoLobbySection';
import { PublicMatchHistorySection } from './PublicMatchHistorySection';
import { FAQAccordion } from './FAQAccordion';
import { MediaBanner } from '../../components/common/MediaBanner';
import { SUPPORTED_GAMES_METADATA } from '../../utils/constants';
import { useAuth } from '../auth/AuthContext';
import { useWallet } from '../../context/WalletContext';
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
} from 'lucide-react';
import type { GameMetadata } from '../../types/games';

interface LobbyViewProps {
  onSelectGame: (game: GameMetadata) => void;
  onJoinTrancaito?: () => void;
  onNavigateTab?: (tab: string) => void;
  onSelectBingoVariant?: (variant: '75' | '80' | '90', tableId: string) => void;
}

type GameCategory = 'all' | 'traditional' | 'cards' | 'board' | 'casual';

export const LobbyView: React.FC<LobbyViewProps> = ({
  onSelectGame,
  onJoinTrancaito,
  onNavigateTab,
  onSelectBingoVariant,
}) => {
  const { user } = useAuth();
  const { balance } = useWallet();
  const [selectedCategory, setSelectedCategory] = useState<GameCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtro dinámico de juegos
  const filteredGames = useMemo(() => {
    return SUPPORTED_GAMES_METADATA.filter((game) => {
      // Búsqueda por texto
      const matchesSearch =
        game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.shortDescription.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Filtro por categoría
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
  }, [selectedCategory, searchQuery]);

  return (
    <div id="lobby-main-view" className="space-y-8 pb-12">
      {/* 1. ZONA PUBLICITARIA AUTOMÁTICA Y BANNERS MULTIMEDIA */}
      <section id="lobby-media-banner-section" aria-label="Anuncios y Destacados">
        <MediaBanner location="HOME" onNavigateTab={onNavigateTab} />
      </section>

      {/* 2. CARRUSEL DE TORNEOS Y POTES EN VIVO */}
      <section id="lobby-tournaments-section" aria-label="Torneos y Potes">
        <TournamentsCarousel
          onJoinTournament={(tournament) => {
            if (tournament.gameId === 'polla_venezolana' && onNavigateTab) {
              onNavigateTab('polla');
            } else if (onNavigateTab) {
              onNavigateTab('tables');
            }
          }}
        />
      </section>

      {/* 3. SECCIÓN DESTACADA DE BINGO: MESAS EN VIVO Y GANADORES */}
      <section id="lobby-bingo-showcase-section" aria-label="Mesas de Bingo Disponibles">
        <BingoLobbySection
          onSelectBingoVariant={onSelectBingoVariant}
          onNavigateTab={onNavigateTab}
        />
      </section>

      {/* 4. CATÁLOGO COMPLETO DE JUEGOS DISPONIBLES */}
      <section id="lobby-games-catalog" className="pt-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-6 h-6 text-[#FF8A00]" />
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
                Juegos Disponibles
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Selecciona una modalidad para ver las mesas activas o abrir tu propia sala
            </p>
          </div>

          {/* Buscador de Juegos */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="lobby-search-games-input"
              type="text"
              placeholder="Buscar juego..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#FF8A00]/50 transition-colors"
            />
          </div>
        </div>

        {/* Pestañas / Filtros de Categorías */}
        <div id="lobby-categories-filters" className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
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
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-slate-950 shadow-md shadow-[#FF8A00]/20'
                    : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Cuadrícula de Juegos */}
        {filteredGames.length === 0 ? (
          <div
            id="lobby-no-games-found"
            className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center mt-6"
          >
            <Filter className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-400">No se encontraron juegos para esta búsqueda.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-3 text-xs font-bold text-[#FF8A00] hover:underline"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div
            id="lobby-games-grid"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-6"
          >
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onlinePlayersCount={game.id === 'domino_venezolano' ? 28 : game.id === 'bingo' ? 45 : 12}
                onSelectGame={onSelectGame}
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
        <FAQAccordion />
      </section>
    </div>
  );
};

export default LobbyView;
