// ==============================================================================
// RASPANDO LA OLLA — SISTEMA COMPLETO DE TORNEOS EN VIVO (LOBBY CAROUSEL)
// ==============================================================================
// - Se oculta automáticamente cuando no hay torneos activos (renderiza null).
// - Conectado en tiempo real con Supabase (RPC get_active_tournaments).
// - Soporta inscripción directa de jugadores mediante RPC register_for_tournament.
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { Trophy, Calendar, Users, Zap, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '../../components/common/Button';

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  game_type: string;
  game_variant?: string | null;
  entry_fee: number;
  prize_pool: number;
  max_participants: number;
  current_participants: number;
  start_date: string;
  end_date: string;
  registration_deadline: string;
  status: string;
  prize_distribution?: any;
}

interface TournamentsCarouselProps {
  onJoinTournament?: (tournament: any) => void;
}

export const TournamentsCarousel: React.FC<TournamentsCarouselProps> = ({
  onJoinTournament,
}) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; type: 'success' | 'error'; message: string } | null>(null);

  const loadTournaments = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_active_tournaments');
      if (!error && data?.success) {
        setTournaments((data.tournaments as Tournament[]) || []);
      } else if (error) {
        // Fallback a consulta directa si la función RPC está cargando
        const { data: directData } = await supabase
          .from('tournaments')
          .select('*')
          .in('status', ['REGISTRATION', 'ACTIVE'])
          .order('start_date', { ascending: true });

        if (directData) {
          setTournaments(directData as Tournament[]);
        }
      }
    } catch (err) {
      console.error('[TournamentsCarousel] Error al cargar torneos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('tournaments-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments' },
        () => {
          loadTournaments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTournaments]);

  const handleRegister = async (tournament: Tournament) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setFeedback({
        id: tournament.id,
        type: 'error',
        message: 'Debes iniciar sesión para inscribirte en este torneo.',
      });
      return;
    }

    setRegisteringId(tournament.id);
    setFeedback(null);

    try {
      const { data, error } = await supabase.rpc('register_for_tournament', {
        p_tournament_id: tournament.id,
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setFeedback({
          id: tournament.id,
          type: 'success',
          message: '¡Inscripción exitosa! Prepárate para la primera ronda.',
        });
        loadTournaments();
        if (onJoinTournament) {
          onJoinTournament(tournament);
        }
      } else {
        setFeedback({
          id: tournament.id,
          type: 'error',
          message: data?.message || 'Error al procesar la inscripción.',
        });
      }
    } catch (err: any) {
      console.error('[TournamentsCarousel] Error al inscribirse:', err);
      setFeedback({
        id: tournament.id,
        type: 'error',
        message: err?.message || 'Error al registrarte en el torneo.',
      });
    } finally {
      setRegisteringId(null);
    }
  };

  // REGLA CLAVE: Si ya no está cargando y no hay torneos activos, NO RENDERIZAR NADA (cero espacio ocupado).
  if (!loading && tournaments.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div id="tournaments-loading" className="mb-6">
        <div className="h-28 bg-[#131926]/60 border border-slate-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  const getGameLabel = (gameType: string) => {
    const map: Record<string, string> = {
      chess: 'Ajedrez Criollo',
      domino: 'Dominó Venezolano',
      truco: 'Truco Venezolano',
      bingo: 'Bingo Virtual',
      polla: 'Gran Polla Venezolana',
      atrapaito: 'Atrapaíto',
      checkers: 'Damas',
      una_olla: 'UNA-OLLA',
      rock_paper_scissors: 'Piedra, Papel o Tijera',
      tictactoe: 'Tic-Tac-Toe',
    };
    return map[gameType] || gameType.toUpperCase();
  };

  return (
    <div id="tournaments-active-section" className="mb-6">
      {/* Encabezado del Módulo */}
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Trophy className="w-4 h-4" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-white tracking-wide uppercase flex items-center gap-2">
            <span>Torneos Oficiales</span>
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-black rounded-full uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          {tournaments.length} ACTIVO{tournaments.length !== 1 ? 'S' : ''}
        </span>
      </div>

      {/* Cuadrícula de Torneos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {tournaments.map((tournament) => {
          const isRegistration = tournament.status === 'REGISTRATION';
          const isFull = tournament.current_participants >= tournament.max_participants;
          const currentFeedback = feedback?.id === tournament.id ? feedback : null;

          return (
            <div
              key={tournament.id}
              id={`tournament-card-${tournament.id}`}
              className="bg-gradient-to-br from-[#1c1926] via-[#141824] to-[#0d1017] border border-amber-500/30 hover:border-amber-500/60 rounded-xl p-4 transition-all shadow-lg hover:shadow-amber-500/10 flex flex-col justify-between relative overflow-hidden"
            >
              {/* Insignia de Estado */}
              <div className="flex justify-between items-start mb-2 gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider block truncate">
                    {getGameLabel(tournament.game_type)}
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-white truncate mt-0.5">
                    {tournament.name}
                  </h3>
                </div>

                <span
                  className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                    isRegistration
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {isRegistration ? 'Inscripciones Abiertas' : 'En Curso'}
                </span>
              </div>

              {tournament.description && (
                <p className="text-[11px] text-slate-400 line-clamp-1 mb-2.5">
                  {tournament.description}
                </p>
              )}

              {/* Métricas: Pozo, Participantes, Fecha */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5 mb-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Premio:</span>
                  </div>
                  <strong className="text-amber-300 font-mono font-bold">
                    +{Number(tournament.prize_pool || 0).toLocaleString()} Bs
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Jugadores:</span>
                  </div>
                  <strong className="text-slate-200 font-mono">
                    {tournament.current_participants}/{tournament.max_participants}
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Inicio:</span>
                  </div>
                  <span className="text-slate-300 font-mono text-[11px]">
                    {new Date(tournament.start_date).toLocaleDateString('es-VE', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              {/* Mensaje de Feedback local */}
              {currentFeedback && (
                <div
                  className={`p-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5 mb-2.5 ${
                    currentFeedback.type === 'success'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  {currentFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                  <span className="truncate">{currentFeedback.message}</span>
                </div>
              )}

              {/* Botón de Inscripción */}
              {isRegistration && (
                <Button
                  id={`btn-register-tournament-${tournament.id}`}
                  disabled={isFull || registeringId === tournament.id}
                  isLoading={registeringId === tournament.id}
                  onClick={() => handleRegister(tournament)}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black py-2 rounded-lg text-xs uppercase tracking-wide cursor-pointer active:scale-98 transition-transform"
                >
                  {isFull
                    ? 'Torneo Lleno'
                    : `Inscribirme (${tournament.entry_fee > 0 ? `${tournament.entry_fee} Bs` : 'Gratis'})`}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
