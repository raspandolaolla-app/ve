// ==============================================================================
// RASPANDO LA OLLA — BANNER MARQUEE INFINITO (GESTIONABLE DESDE ADMIN)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Megaphone, Sparkles, AlertTriangle, X, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';

interface MarqueeAnnouncement {
  id: string;
  title: string;
  content: string;
  type: 'GENERAL' | 'IMPORTANT' | 'PROMOTION' | 'MARQUEE';
  priority: number;
}

export function SafeDevelopmentBanner() {
  const [marquees, setMarquees] = useState<MarqueeAnnouncement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const fetchMarquees = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        const { data, error } = await supabase
          .from('system_announcements')
          .select('id, title, content, type, priority')
          .eq('is_active', true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('priority', { ascending: false })
          .limit(10);

        if (!error && data && data.length > 0) {
          setMarquees(data.map((d: any) => ({
            id: d.id,
            title: d.title,
            content: d.content,
            type: d.type,
            priority: Number(d.priority || 0),
          })));
        }
      } catch {
        // Fallback silencioso
      }
    };

    fetchMarquees();
  }, []);

  // Mensaje oficial por defecto si no hay marquesinas configuradas en la base de datos
  const defaultMarquee: MarqueeAnnouncement = {
    id: 'default-marquee',
    title: 'RASPANDO LA OLLA',
    content: '🇻🇪 BIENVENID@S A RASPANDO LA OLLA / PulsoPLAY — PLATAFORMA OFICIAL MULTIJUGADOR EN TIEMPO REAL — DOMINÓ, TRUCO, BINGO, ATRAPAÍTO Y LA POLLA VENEZOLANA 🎮',
    type: 'PROMOTION',
    priority: 100
  };

  const activeMarquees = marquees.length > 0 ? marquees : [defaultMarquee];
  const current = activeMarquees[currentIndex % activeMarquees.length];

  const getStyle = (type: string) => {
    switch (type) {
      case 'IMPORTANT':
        return 'bg-gradient-to-r from-amber-600/20 via-orange-600/20 to-amber-600/20 border-amber-500/40 text-amber-200';
      case 'PROMOTION':
        return 'bg-gradient-to-r from-[#FF8A00]/15 via-[#F5B942]/15 to-[#FF8A00]/15 border-[#FF8A00]/40 text-[#F8FAFC]';
      case 'MARQUEE':
        return 'bg-gradient-to-r from-emerald-600/20 via-cyan-600/20 to-emerald-600/20 border-emerald-500/40 text-emerald-100';
      default:
        return 'bg-gradient-to-r from-cyan-600/15 via-blue-600/15 to-cyan-600/15 border-cyan-500/40 text-cyan-100';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'IMPORTANT':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'PROMOTION':
        return <Sparkles className="w-4 h-4 text-[#F5B942] shrink-0" />;
      case 'MARQUEE':
        return <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Megaphone className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    try {
      sessionStorage.setItem('marquee_dismissed_' + current.id, 'true');
    } catch {}
  };

  if (!isVisible) return null;

  // Si está desechado en sesión, no mostrar
  try {
    if (sessionStorage.getItem('marquee_dismissed_' + current.id) === 'true') {
      return null;
    }
  } catch {}

  return (
    <div
      id="safe-development-banner"
      className={`relative overflow-hidden border-b ${getStyle(current.type)} py-2`}
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3 px-4">
        {/* Icono */}
        <div className="shrink-0 flex items-center">
          {getIcon(current.type)}
        </div>

        {/* Contenedor del Marquee */}
        <div className="flex-1 overflow-hidden relative">
          <div className="marquee-container flex whitespace-nowrap">
            <span className="marquee-content inline-block px-4 font-bold text-sm sm:text-base tracking-wide uppercase">
              {current.content}
              <span className="mx-8 opacity-60">★</span>
              {current.content}
              <span className="mx-8 opacity-60">★</span>
            </span>
            <span className="marquee-content inline-block px-4 font-bold text-sm sm:text-base tracking-wide uppercase" aria-hidden="true">
              {current.content}
              <span className="mx-8 opacity-60">★</span>
              {current.content}
              <span className="mx-8 opacity-60">★</span>
            </span>
          </div>
        </div>

        {/* Botones de Control */}
        <div className="shrink-0 flex items-center gap-1">
          {activeMarquees.length > 1 && (
            <button
              onClick={() => setCurrentIndex((prev) => (prev + 1) % activeMarquees.length)}
              className="text-[10px] font-bold px-2 py-1 rounded bg-slate-900/40 hover:bg-slate-900/60 border border-slate-700 text-slate-200 transition"
              title="Siguiente anuncio"
            >
              SIG ({currentIndex + 1}/{activeMarquees.length})
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-slate-900/40 rounded text-slate-300 hover:text-white transition"
            title="Cerrar anuncio"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Badge "Juego Responsable" */}
      <div className="absolute bottom-0 right-2 text-[9px] text-emerald-400/80 font-bold uppercase tracking-wider hidden sm:block">
        +18 Juego Responsable
      </div>
    </div>
  );
}


