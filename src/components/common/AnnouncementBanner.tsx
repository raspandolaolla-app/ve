import React, { useState, useEffect } from 'react';
import { Megaphone, AlertTriangle, Info, ShieldAlert, Sparkles, X, ChevronRight } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';

export interface SystemAnnouncement {
  id: string;
  title: string;
  content: string;
  type: 'GENERAL' | 'IMPORTANT' | 'MAINTENANCE' | 'PROMOTION' | 'SECURITY' | 'UPDATE';
  priority: number;
}

export const AnnouncementBanner: React.FC = () => {
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('dismissed_announcements') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const fetchAnnouncements = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        const { data, error } = await supabase
          .from('system_announcements')
          .select('id, title, content, type, priority')
          .eq('is_active', true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('priority', { ascending: false })
          .order('starts_at', { ascending: false })
          .limit(5);

        if (!error && data && data.length > 0) {
          const activeList = data.map((d: any) => ({
            id: d.id,
            title: d.title,
            content: d.content,
            type: d.type,
            priority: Number(d.priority || 0),
          }));
          setAnnouncements(activeList);
        }
      } catch {
        // Fallback silencioso si la tabla no está creada o la red está inaccesible
      }
    };

    fetchAnnouncements();
  }, []);

  const visibleAnnouncements = announcements.filter((a) => !dismissedIds.includes(a.id));

  if (visibleAnnouncements.length === 0) return null;

  const current = visibleAnnouncements[currentIndex % visibleAnnouncements.length];

  const handleDismiss = (id: string) => {
    const newDismissed = [...dismissedIds, id];
    setDismissedIds(newDismissed);
    try {
      sessionStorage.setItem('dismissed_announcements', JSON.stringify(newDismissed));
    } catch {}
  };

  const getStyle = (type: string) => {
    switch (type) {
      case 'IMPORTANT':
        return 'bg-amber-500/15 border-amber-500/40 text-amber-300';
      case 'MAINTENANCE':
        return 'bg-purple-500/15 border-purple-500/40 text-purple-300';
      case 'PROMOTION':
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
      case 'SECURITY':
        return 'bg-rose-500/15 border-rose-500/40 text-rose-300';
      default:
        return 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'IMPORTANT':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'MAINTENANCE':
        return <Info className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'PROMOTION':
        return <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'SECURITY':
        return <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />;
      default:
        return <Megaphone className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
  };

  return (
    <aside aria-label="Avisos del sistema" className={`w-full border-b py-2 px-4 text-xs font-medium backdrop-blur-md transition-all duration-300 ${getStyle(current.type)}`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {getIcon(current.type)}
          <span className="font-bold tracking-wide shrink-0">[{current.title}]</span>
          <span className="truncate text-slate-200">{current.content}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {visibleAnnouncements.length > 1 && (
            <button
              onClick={() => setCurrentIndex((prev) => (prev + 1) % visibleAnnouncements.length)}
              className="text-[10px] uppercase font-bold text-slate-300 hover:text-white flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-900/40 border border-slate-700"
            >
              Siguiente ({currentIndex + 1}/{visibleAnnouncements.length})
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={() => handleDismiss(current.id)}
            className="p-1 hover:bg-slate-900/30 rounded text-slate-400 hover:text-white transition"
            title="Descartar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
