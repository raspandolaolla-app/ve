// ==============================================================================
// RASPANDO LA OLLA — CONTENEDOR DE PUBLICIDAD RESPONSIVE (AD PLACEMENT)
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { AdvertisingEngine } from '../../services/advertising/AdvertisingEngine';
import { AdvertisingAssetProvider } from '../../services/advertising/AdvertisingAssetProvider';
import type {
  AdPlacement,
  AdvertisingCampaign,
} from '../../types/advertising';
import { ExternalLink, Sparkles } from 'lucide-react';

interface AdPlacementContainerProps {
  placement: AdPlacement;
  gameType?: string | null;
  className?: string;
  onNavigate?: (tab: string) => void;
  showBadge?: boolean;
}

export const AdPlacementContainer: React.FC<AdPlacementContainerProps> = ({
  placement,
  gameType,
  className = '',
  onNavigate,
  showBadge = false,
}) => {
  const [currentAd, setCurrentAd] = useState<AdvertisingCampaign | null>(null);
  const [mediaError, setMediaError] = useState<boolean>(false);

  const engine = AdvertisingEngine.getInstance();

  const updateCurrentAd = useCallback(() => {
    const ad = engine.getAdForPlacement(placement, { gameType });
    setCurrentAd(ad);
    setMediaError(false);
  }, [engine, placement, gameType]);

  useEffect(() => {
    engine.init();
    updateCurrentAd();

    const unsubscribe = engine.subscribe(() => {
      updateCurrentAd();
    });

    return () => {
      unsubscribe();
    };
  }, [engine, updateCurrentAd]);

  if (!currentAd || mediaError) {
    return null;
  }

  const asset = currentAd.asset;
  const assetUrl = asset?.filePath
    ? AdvertisingAssetProvider.getAssetUrl(asset.filePath)
    : AdvertisingAssetProvider.getFallbackUrl();

  const isVideo = asset?.assetType === 'video' || assetUrl.endsWith('.mp4') || assetUrl.endsWith('.webm');

  const handleClick = () => {
    if (!currentAd.targetUrl) return;

    if (
      currentAd.targetUrl.startsWith('http://') ||
      currentAd.targetUrl.startsWith('https://')
    ) {
      window.open(currentAd.targetUrl, '_blank', 'noopener,noreferrer');
    } else if (onNavigate) {
      onNavigate(currentAd.targetUrl);
    }
  };

  return (
    <div
      id={`ad-placement-${placement.toLowerCase().replace(/_/g, '-')}`}
      className={`relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg transition-all duration-300 ${className}`}
      role="complementary"
      aria-label="Publicidad destacada"
    >
      {/* Badge discreto de patrocinio / publicidad */}
      {showBadge && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-slate-300 backdrop-blur-md border border-white/10 select-none">
          <Sparkles className="w-2.5 h-2.5 text-[#FF8A00]" />
          <span>Promoción</span>
        </div>
      )}

      {/* Contenido Multimedia */}
      <div
        className={`w-full relative ${currentAd.targetUrl ? 'cursor-pointer group' : ''}`}
        onClick={handleClick}
      >
        {isVideo ? (
          <video
            src={assetUrl}
            className="w-full h-auto max-h-[360px] object-cover rounded-2xl"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setMediaError(true)}
          />
        ) : (
          <img
            src={assetUrl}
            alt={asset?.title || currentAd.name || 'Publicidad'}
            loading="lazy"
            decoding="async"
            className="w-full h-auto max-h-[360px] object-cover rounded-2xl transition-transform duration-300 group-hover:scale-[1.01]"
            onError={() => setMediaError(true)}
          />
        )}

        {/* Overlay con información o CTA si aplica */}
        {(currentAd.ctaText || currentAd.name) && currentAd.targetUrl && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-white truncate drop-shadow-sm">
                {currentAd.name}
              </p>
              {asset?.description && (
                <p className="text-[11px] text-slate-300 line-clamp-1 drop-shadow-sm">
                  {asset.description}
                </p>
              )}
            </div>

            {currentAd.ctaText && (
              <button
                type="button"
                className="shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-[#080B12] text-xs font-black tracking-wide shadow-md shadow-[#FF8A00]/20 flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <span>{currentAd.ctaText}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
