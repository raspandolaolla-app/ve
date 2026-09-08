// ==============================================================================
// RASPANDO LA OLLA — ADAPTADOR UNIFICADO DE REPRODUCTOR DE VIDEO PUBLICITARIO
// ==============================================================================
// Delega al componente central GameVideoAd garantizando:
// 1. Estado normal 100% LIMPIO (sin textos, badges ni overlays permanentes).
// 2. Hover en Desktop y Touch en Móvil con temporizador de autohide.
// 3. Persistencia de audio global y compatibilidad playsInline/autoplay.
// ==============================================================================

import React from 'react';
import { GameVideoAd } from '../advertising/GameVideoAd';
import { getAssetUrl } from '../../utils/assetUtils';

export interface VideoAdPlayerProps {
  src: string;
  posterUrl?: string;
  title?: string;
  description?: string | null;
  buttonText?: string | null;
  onNavigate?: () => void;
  onEnded?: () => void;
  className?: string;
  showAdBadge?: boolean;
  adBadgeText?: string;
  loop?: boolean;
}

export const VideoAdPlayer: React.FC<VideoAdPlayerProps> = ({
  src,
  posterUrl,
  title,
  description,
  buttonText,
  onNavigate,
  onEnded,
  className = '',
  showAdBadge = true,
  adBadgeText = 'PUBLICIDAD',
  loop = true,
}) => {
  const isInvalidPoster = !posterUrl || posterUrl.includes('unsplash') || posterUrl.includes('photo-1518709268805');
  const effectivePosterUrl = isInvalidPoster ? getAssetUrl('logo.svg') : getAssetUrl(posterUrl);
  const [aspectRatio, setAspectRatio] = React.useState<string>('16 / 9');

  return (
    <div
      style={{ aspectRatio }}
      className={`relative overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 shadow-2xl w-full max-h-[70vh] ${className}`}
    >
      <GameVideoAd
        videoUrl={src}
        posterUrl={effectivePosterUrl}
        title={title}
        description={description}
        ctaText={buttonText}
        onNavigate={onNavigate}
        onEnded={onEnded}
        autoPlay={true}
        loop={loop}
        showAdBadge={showAdBadge}
        adBadgeText={adBadgeText}
        videoFit="contain"
        onMetadataLoaded={(meta) => {
          if (meta.aspectRatio) {
            setAspectRatio(`${meta.aspectRatio}`);
          }
        }}
        className="w-full h-full"
      />
    </div>
  );
};
