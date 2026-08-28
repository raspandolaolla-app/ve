// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE PROMO BANNER MULTIMEDIA
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Sparkles, Play, ArrowRight, ExternalLink } from 'lucide-react';
import { BannerRepository, type ContentBannerItem } from '../../services/repositories/BannerRepository';

interface MediaBannerProps {
  location?: 'HOME' | 'GAMES' | 'POLLA' | 'BINGO' | 'PROFILE' | 'MAIN_PANEL' | 'GENERAL';
  onNavigateTab?: (tab: string) => void;
  className?: string;
}

export const MediaBanner: React.FC<MediaBannerProps> = ({
  location = 'HOME',
  onNavigateTab,
  className = '',
}) => {
  const [banners, setBanners] = useState<ContentBannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadBanners = async () => {
      setLoading(true);
      const list = await BannerRepository.getActiveBanners(location);
      if (isMounted) {
        setBanners(list);
        setLoading(false);
      }
    };
    loadBanners();
    return () => {
      isMounted = false;
    };
  }, [location]);

  if (loading || banners.length === 0) return null;

  return (
    <div id={`media-banners-${location.toLowerCase()}`} className={`space-y-4 ${className}`}>
      {banners.map((b) => (
        <div
          key={b.id}
          className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-900/90 shadow-xl transition-all hover:border-amber-500/50"
        >
          {/* Banner Image Background overlay */}
          <div className="absolute inset-0 z-0 opacity-20">
            <img
              src={b.imageUrl}
              alt={b.title}
              className="h-full w-full object-cover filter blur-xs"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="relative z-10 flex flex-col md:flex-row items-stretch gap-4 p-5 md:p-6">
            {/* Thumbnail / Image Preview */}
            <div className="relative w-full md:w-56 h-36 shrink-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <img
                src={b.imageUrl}
                alt={b.title}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                referrerPolicy="no-referrer"
              />
              {b.videoUrl && (
                <button
                  type="button"
                  onClick={() => setActiveVideoUrl(b.videoUrl || null)}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-all text-amber-400 group"
                  title="Reproducir video promocional"
                >
                  <div className="p-3 bg-amber-500 text-slate-950 rounded-full shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </button>
              )}
            </div>

            {/* Banner Text Content */}
            <div className="flex-1 flex flex-col justify-between space-y-2">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Promoción Destacada
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-white tracking-wide">{b.title}</h3>
                {b.description && (
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{b.description}</p>
                )}
              </div>

              {/* Action Button */}
              {b.buttonText && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateTab && b.targetAction) {
                        onNavigateTab(b.targetAction);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <span>{b.buttonText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Video Modal if active */}
      {activeVideoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-amber-400 uppercase">Video Promocional</span>
              <button
                type="button"
                onClick={() => setActiveVideoUrl(null)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                Cerrar ✕
              </button>
            </div>
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
              <iframe
                src={activeVideoUrl}
                title="Video Promocional"
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
