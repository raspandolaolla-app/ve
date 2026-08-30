// ==============================================================================
// RASPANDO LA OLLA — HISTORIAL PÚBLICO DE PARTIDAS FINALIZADAS (REALTIME)
// Especificación de Arquitectura Secciones 17, 26, 28 & Prompt Maestro
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { Trophy, Flame, User, Clock, Radio, ShieldCheck } from 'lucide-react';
import { formatBolivares } from '../../utils/formatters';

interface MatchRecord {
  id: string;
  game_type: string;
  table_id: string;
  session_id: string;
  winner_user_id: string | null;
  winner_name_snapshot: string;
  winner_avatar_snapshot: string | null;
  players_snapshot: any[];
  final_score: Record<string, number>;
  victories: Record<string, number>;
  result_summary: string;
  finished_at: string;
}

export const PublicMatchHistorySection: React.FC = () => {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    // 1. Cargar historial inicial de partidas públicas
    const fetchMatches = async () => {
      try {
        const { data, error } = await supabase
          .from('public_match_history')
          .select('*')
          .order('finished_at', { ascending: false })
          .limit(10);

        if (!error && data) {
          setMatches(data as MatchRecord[]);
        }
      } catch (err) {
        console.error('Error al cargar historial público de partidas:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();

    // 2. Suscripción en Tiempo Real para recibir notificaciones instantáneas de ganadores
    const channel = supabase
      .channel('public_match_history_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'public_match_history',
        },
        (payload) => {
          if (payload.new) {
            setMatches((prev) => [payload.new as MatchRecord, ...prev.slice(0, 9)]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diffSec < 60) return 'Hace instantes';
      if (diffSec < 3600) return `Hace ${Math.floor(diffSec / 60)} min`;
      if (diffSec < 86400) return `Hace ${Math.floor(diffSec / 3600)} horas`;
      return new Date(isoString).toLocaleDateString('es-VE');
    } catch {
      return 'Reciente';
    }
  };

  const getGameLabel = (type: string) => {
    switch (type) {
      case 'domino_venezolano': return 'Dominó Venezolano';
      case 'truco_venezolano': return 'Truco Venezolano';
      case 'tic_tac_toe': return 'La Vieja (Tic-Tac-Toe)';
      case 'rock_paper_scissors': return 'Piedra, Papel o Tijera';
      case 'checkers': return 'Damas Españolas';
      case 'bingo': return 'Bingo Criollo';
      case 'polla_venezolana': return 'Polla Deportiva';
      case 'atrapaito': return 'Atrapaíto';
      case 'una_olla': return 'UNA-OLLA';
      default: return type.replace(/_/g, ' ');
    }
  };

  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-slate-400 text-xs">
        <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Cargando historial de partidas públicas...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-base sm:text-lg font-black text-slate-100 uppercase tracking-tight">
            Últimas Partidas Finalizadas
          </h2>
        </div>
        <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
          <Radio className="w-3 h-3 animate-pulse" />
          <span>REALTIME VIVO</span>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs space-y-1">
          <Flame className="w-6 h-6 text-slate-600 mx-auto mb-1" />
          <p>No se han registrado partidas completadas aún.</p>
          <p className="text-[11px] text-slate-500">Sé el primero en ganar una mesa para figurar en la lista pública.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {matches.map((match) => (
            <div
              key={match.id}
              className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/90 hover:border-amber-500/40 transition-all flex items-center justify-between gap-3 shadow-md"
            >
              <div className="flex items-center space-x-3 min-w-0">
                {/* Foto del Ganador */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-800 border border-amber-500/50 flex items-center justify-center">
                    {match.winner_avatar_snapshot ? (
                      <img
                        src={match.winner_avatar_snapshot}
                        alt={match.winner_name_snapshot}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-500 to-amber-700 text-slate-950 font-black flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-950" />
                      </div>
                    )}
                  </div>
                  <span className="absolute -top-1 -right-1 text-xs">👑</span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5 truncate">
                    <span className="text-xs font-black text-white uppercase truncate">
                      {match.winner_name_snapshot}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                      GANADOR
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {getGameLabel(match.game_type)} • <span className="text-slate-300 font-medium">{match.result_summary}</span>
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0 space-y-0.5">
                <div className="flex items-center justify-end space-x-1 text-[10px] text-slate-400 font-mono">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>{formatRelativeTime(match.finished_at)}</span>
                </div>
                <div className="flex items-center justify-end space-x-1 text-[10px] text-emerald-400 font-mono font-bold">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Liquidado 90/10</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
