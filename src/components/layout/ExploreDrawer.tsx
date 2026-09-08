// ==============================================================================
// RASPANDO LA OLLA — PANEL LATERAL / DRAWER DE EXPLORAR JUEGOS Y SECCIONES
// ==============================================================================

import React, { useEffect } from 'react';
import {
  X,
  Trophy,
  Users,
  Award,
  MessageSquare,
  HelpCircle,
  Headphones,
  Shield,
  Sparkles,
  ChevronRight,
  Zap,
  Flame,
  BookOpen,
} from 'lucide-react';
import { SUPPORTED_GAMES_METADATA, GLOBAL_DRAWS_METADATA } from '../../utils/constants';
import { useGameAvailability } from '../../context/GameAvailabilityContext';
import type { GameMetadata } from '../../types/games';

interface ExploreDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGame: (game: GameMetadata) => void;
  onNavigateTab: (tab: string) => void;
  onOpenSupport: () => void;
  onOpenRules?: (gameId?: string) => void;
}

export const ExploreDrawer: React.FC<ExploreDrawerProps> = ({
  isOpen,
  onClose,
  onSelectGame,
  onNavigateTab,
  onOpenSupport,
  onOpenRules,
}) => {
  const { isGameEnabled } = useGameAvailability();

  // Filtrar juegos habilitados
  const enabledGames = React.useMemo(() => {
    return SUPPORTED_GAMES_METADATA.filter((game) => isGameEnabled(game.id));
  }, [isGameEnabled]);

  // Bloquear scroll de la ventana principal cuando el drawer está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const getGameIcon = (id: string) => {
    switch (id) {
      case 'domino_venezolano':
        return '🎲';
      case 'truco_venezolano':
        return '🃏';
      case 'bingo':
        return '🎱';
      case 'polla_venezolana':
        return '🐾';
      case 'atrapaito':
        return '🎯';
      case 'checkers':
        return '♟';
      case 'rock_paper_scissors':
        return '✊';
      case 'tic_tac_toe':
        return '⭕';
      case 'chess':
        return '♟️';
      case 'una_olla':
        return '🎴';
      default:
        return '🎮';
    }
  };

  const handleGameClick = (game: GameMetadata) => {
    onSelectGame(game);
    onClose();
  };

  const handleTabClick = (tab: string) => {
    onNavigateTab(tab);
    onClose();
  };

  return (
    <div
      id="explore-drawer-container"
      className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop con Blur y Oscurecimiento */}
      <div
        className="fixed inset-0 bg-[#080B12]/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Panel Lateral Deslizante */}
      <div className="relative w-full max-w-sm bg-[#111722] border-l border-[#1E2938] h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-250">
        {/* Encabezado del Drawer */}
        <div className="p-4 border-b border-[#1E2938] flex items-center justify-between bg-[#080B12]/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF8A00] to-[#F5B942] p-0.5 flex items-center justify-center shadow-md shadow-[#FF8A00]/20">
              <span className="text-base">🔥</span>
            </div>
            <div>
              <h2 className="text-sm font-black text-[#F8FAFC] tracking-tight uppercase">
                Explorar <span className="text-[#FF8A00]">Juegos</span>
              </h2>
              <span className="text-[10px] text-[#94A3B8] font-medium">Catálogo Venezolano</span>
            </div>
          </div>

          <button
            id="close-explore-drawer-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors border border-[#1E2938]"
            aria-label="Cerrar menú explorar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Sorteo Global Permanente (Solo si Polla Venezolana está habilitada) */}
          {isGameEnabled('polla_venezolana') && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#F5B942] flex items-center gap-1.5 px-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Sorteo Comunitario</span>
              </div>
              {GLOBAL_DRAWS_METADATA.map((draw) => (
                <button
                  key={draw.id}
                  onClick={() => handleTabClick('polla')}
                  className="w-full text-left p-3 rounded-2xl bg-gradient-to-r from-[#171E2A] to-[#1E2938] border border-[#F5B942]/30 hover:border-[#F5B942] transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F5B942]/10 border border-[#F5B942]/30 flex items-center justify-center text-xl">
                      🐾
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#F8FAFC] group-hover:text-[#F5B942] transition-colors flex items-center gap-1.5">
                        <span>{draw.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30 font-semibold">
                          Sorteos 2x Día
                        </span>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] line-clamp-1">{draw.shortDescription}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F5B942] transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Juegos de Mesa Multijugador */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5 px-1">
              <Zap className="w-3.5 h-3.5 text-[#FF8A00]" />
              <span>Mesas y Salas en Vivo ({enabledGames.length})</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {enabledGames.map((game) => (
                <button
                  key={game.id}
                  id={`explore-game-${game.id}`}
                  onClick={() => handleGameClick(game)}
                  className="w-full text-left p-2.5 rounded-xl bg-[#171E2A] hover:bg-[#1E2938] border border-transparent hover:border-[#FF8A00]/40 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#080B12] border border-[#1E2938] flex items-center justify-center text-lg shrink-0">
                      {getGameIcon(game.id)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F8FAFC] group-hover:text-[#FF8A00] transition-colors truncate">
                        {game.name}
                      </div>
                      <div className="text-[10px] text-[#94A3B8] flex items-center gap-2 mt-0.5">
                        <span className="text-[#22C55E] flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                          {game.allowedModes.join(', ')}
                        </span>
                        <span>•</span>
                        <span className="text-[#F5B942]">{game.minEntryFee} - {game.maxEntryFee} Bs</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#FF8A00] transition-colors shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>

          {/* Accesos Rápidos y Secciones de Comunidad */}
          <div className="space-y-2 pt-2 border-t border-[#1E2938]">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] px-1">
              Comunidad & Beneficios
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {onOpenRules && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenRules('atrapaito');
                  }}
                  className="w-full text-left p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-300 border border-amber-500/30 transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <BookOpen className="w-4 h-4 text-amber-400" />
                    <span>📖 Manual & Reglas Oficiales</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-200" />
                </button>
              )}

              <button
                onClick={() => handleTabClick('tables')}
                className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/70 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5">
                  <Trophy className="w-4 h-4 text-[#F5B942]" />
                  <span>🏆 Torneos & Potes en Vivo</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>

              <button
                onClick={() => handleTabClick('profile')}
                className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/70 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-[#2496FF]" />
                  <span>👥 Programa de Referidos</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>

              <button
                onClick={() => handleTabClick('profile')}
                className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/70 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5">
                  <Award className="w-4 h-4 text-[#22C55E]" />
                  <span>🏅 Salón de la Fama</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>

              <button
                onClick={() => {
                  onClose();
                  onNavigateTab('support');
                }}
                className="w-full text-left p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 border border-emerald-500/30 text-xs font-bold text-white transition-colors flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Headphones className="w-4 h-4 text-emerald-400" />
                  <span>🎧 Soporte & Chat en Vivo</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-black">24/7</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenSupport();
                }}
                className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/70 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-[#FF8A00]" />
                  <span>💬 Ayúdanos a Mejorar / Sugerencias</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>
            </div>
          </div>
        </div>

        {/* Pie del Drawer */}
        <div className="p-4 border-t border-[#1E2938] bg-[#080B12]/80 flex items-center justify-between text-[11px] text-[#94A3B8]">
          <span className="flex items-center gap-2">
            <span className="text-3xl select-none leading-none">🇻🇪</span>
            <span className="font-semibold text-white">Venezuela</span>
          </span>
          <span className="text-[#F5B942] font-semibold">Regla 90/10</span>
        </div>
      </div>
    </div>
  );
};
