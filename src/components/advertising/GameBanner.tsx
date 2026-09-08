// ==============================================================================
// RASPANDO LA OLLA — BANNER CENTRAL DE JUEGO (GAME BANNER)
// ==============================================================================
// Componente reutilizable para banners estáticos o enriquecidos de juegos.
// Conecta directamente el CTA con el flujo real de creación de mesas o juego,
// gestionando permisos de visitantes con retorno contextual automático.
// ==============================================================================

import React from 'react';
import { Sparkles, ArrowRight, Play, Trophy, Users } from 'lucide-react';
import { GameRegistry } from '../../services/games/GameRegistry';
import { useCapabilities } from '../../hooks/useCapabilities';
import { useGameAvailability } from '../../context/GameAvailabilityContext';

interface GameBannerProps {
  gameId: string;
  assetUrl?: string;
  title?: string;
  description?: string;
  badge?: string;
  ctaText?: string;
  onNavigateTab?: (tab: string) => void;
  className?: string;
}

export const GameBanner: React.FC<GameBannerProps> = ({
  gameId,
  assetUrl,
  title,
  description,
  badge,
  ctaText,
  onNavigateTab,
  className = '',
}) => {
  const { isGameEnabled } = useGameAvailability();
  const { executeOrPromptLogin, isAuthenticated } = useCapabilities();

  // Si el juego está deshabilitado por administración central, no renderizar
  if (gameId && !isGameEnabled(gameId)) {
    return null;
  }

  const game = GameRegistry.getGameById(gameId);
  const canonicalId = game ? game.id : gameId;
  const ctaConfig = GameRegistry.getCtaConfig(canonicalId);

  const displayTitle = title || (game ? game.name : 'Juego Tradicional');
  const displayDesc = description || (game ? game.shortDescription : 'Partidas multijugador en tiempo real.');
  const displayBadge = badge || GameRegistry.getGameBadge(canonicalId);
  const displayCta = ctaText || (isAuthenticated ? ctaConfig.label : ctaConfig.guestLabel);

  const handleCtaClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // 1. Caso Sorteo Global: Polla
    if (ctaConfig.action === 'OPEN_POLLA') {
      if (onNavigateTab) {
        onNavigateTab('polla');
      } else {
        window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab: 'polla' } }));
      }
      return;
    }

    // 2. Caso Juego Casual o Dedicado (Atrapaíto)
    if (ctaConfig.action === 'PLAY_GAME' && canonicalId === 'atrapaito') {
      if (onNavigateTab) {
        onNavigateTab('atrapaito');
      } else {
        window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab: 'atrapaito' } }));
      }
      return;
    }

    // 3. Caso Creación de Mesa (Dominó, Truco, Bingo, Damas, Una-Olla, etc.)
    executeOrPromptLogin(
      {
        type: 'CREATE_TABLE',
        gameId: canonicalId,
        tab: 'tables',
      },
      () => {
        // Usuario autorizado: navegar a mesas y abrir modal del juego exacto
        if (onNavigateTab) {
          onNavigateTab('tables');
        } else {
          window.dispatchEvent(new CustomEvent('navigate-tab', { detail: { tab: 'tables' } }));
        }

        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('open-create-table', {
              detail: { gameType: canonicalId, gameId: canonicalId },
            })
          );
        }, 120);
      }
    );
  };

  return (
    <div
      id={`game-banner-${canonicalId}`}
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-700/60 bg-gradient-to-r from-[#0C121E] via-[#111827] to-[#0A0F19] shadow-xl ${className}`}
    >
      {/* Fondo ilustrado o imagen del asset */}
      {assetUrl && (
        <div className="absolute inset-0 z-0 opacity-25">
          <img
            src={assetUrl}
            alt={displayTitle}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0C121E] via-[#0C121E]/80 to-transparent" />
        </div>
      )}

      <div className="relative z-10 p-5 sm:p-7 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-2 max-w-xl">
          {displayBadge && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{displayBadge}</span>
            </div>
          )}

          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tight">
            {displayTitle}
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 leading-relaxed">
            {displayDesc}
          </p>
        </div>

        <button
          type="button"
          onClick={handleCtaClick}
          className="shrink-0 px-6 py-3 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-yellow-500/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
        >
          <span>{displayCta}</span>
          <ArrowRight className="w-4 h-4 text-slate-950" />
        </button>
      </div>
    </div>
  );
};
