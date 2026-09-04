// ==============================================================================
// RASPANDO LA OLLA — PANTALLA GIGANTE DE BINGO EN VIVO (VISTA DE ESPECTADOR)
// Visualizador interactivo en tiempo real con balotas animadas, pozo y ganador
// ==============================================================================

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy,
  Users,
  Zap,
  Radio,
  TrendingUp,
  Clock,
  ArrowRight,
  Sparkles,
  Ticket,
  ChevronRight,
} from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { FinancialRepository } from '../../services/repositories/FinancialRepository';

interface ActiveBingoSession {
  id: string;
  table_id: string;
  status: string;
  current_state: any;
  countdown_ends_at?: string | null;
  created_at: string;
  table?: {
    id: string;
    entry_fee: number;
    game_variant?: string;
    current_players_count?: number;
    game_table_players?: {
      user_id: string;
      status?: string;
      profiles?: {
        display_name?: string;
        avatar_url?: string;
      };
    }[];
  };
}

interface BingoLiveViewerProps {
  onSelectBingoVariant?: (variant: '75' | '80' | '90', tableId: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export const BingoLiveViewer: React.FC<BingoLiveViewerProps> = ({
  onSelectBingoVariant,
  onNavigateTab,
}) => {
  const [activeSessions, setActiveSessions] = useState<ActiveBingoSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ActiveBingoSession | null>(null);
  const [currentBall, setCurrentBall] = useState<string | number | null>(null);
  const [drawnBalls, setDrawnBalls] = useState<(string | number)[]>([]);
  const [winnerInfo, setWinnerInfo] = useState<{
    name: string;
    prizeBs?: number;
  } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Parsear y formatear balota para representación visual
  const parseBall = (ball: string | number | null | undefined): { letter: string; num: string } => {
    if (ball === null || ball === undefined) return { letter: '', num: '' };
    const str = String(ball).trim();

    // Si viene en formato "B-12" o "B12"
    const match = str.match(/^([BINGO])[-_]?(\d+)$/i);
    if (match) {
      return { letter: match[1].toUpperCase(), num: match[2] };
    }

    const numeric = parseInt(str, 10);
    if (!isNaN(numeric)) {
      if (numeric <= 15) return { letter: 'B', num: String(numeric) };
      if (numeric <= 30) return { letter: 'I', num: String(numeric) };
      if (numeric <= 45) return { letter: 'N', num: String(numeric) };
      if (numeric <= 60) return { letter: 'G', num: String(numeric) };
      if (numeric <= 75) return { letter: 'O', num: String(numeric) };
      return { letter: '', num: String(numeric) };
    }

    return { letter: '', num: str };
  };

  const getBallStyles = (ball: string | number) => {
    const { letter, num } = parseBall(ball);
    const n = parseInt(num, 10);

    if (letter === 'B' || (n >= 1 && n <= 15)) {
      return {
        bg: 'bg-gradient-to-br from-blue-500 to-blue-700',
        border: 'border-blue-400/40',
        glow: 'shadow-[0_0_30px_rgba(59,130,246,0.5)]',
        textColor: 'text-blue-200',
      };
    }
    if (letter === 'I' || (n >= 16 && n <= 30)) {
      return {
        bg: 'bg-gradient-to-br from-purple-500 to-indigo-700',
        border: 'border-purple-400/40',
        glow: 'shadow-[0_0_30px_rgba(168,85,247,0.5)]',
        textColor: 'text-purple-200',
      };
    }
    if (letter === 'N' || (n >= 31 && n <= 45)) {
      return {
        bg: 'bg-gradient-to-br from-amber-500 to-orange-600',
        border: 'border-amber-400/40',
        glow: 'shadow-[0_0_30px_rgba(245,158,11,0.5)]',
        textColor: 'text-amber-200',
      };
    }
    if (letter === 'G' || (n >= 46 && n <= 60)) {
      return {
        bg: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
        border: 'border-emerald-400/40',
        glow: 'shadow-[0_0_30px_rgba(16,185,129,0.5)]',
        textColor: 'text-emerald-200',
      };
    }
    return {
      bg: 'bg-gradient-to-br from-rose-500 to-red-700',
      border: 'border-rose-400/40',
      glow: 'shadow-[0_0_30px_rgba(244,63,94,0.5)]',
      textColor: 'text-rose-200',
    };
  };

  // Actualizar el estado interno de la sesión seleccionada
  const updateSessionState = (session: any) => {
    if (!session) return;
    const currentState = session.current_state || {};
    const drawn = currentState.drawnBalls || [];
    const current = currentState.currentBall !== undefined ? currentState.currentBall : (drawn[drawn.length - 1] || null);

    setDrawnBalls(drawn);
    setCurrentBall(current);

    if (currentState.winnerUserId || currentState.winnerName) {
      setWinnerInfo({
        name: currentState.winnerName || '¡Jugador Afortunado!',
        prizeBs: currentState.winnerPoolBs || undefined,
      });
    } else {
      setWinnerInfo(null);
    }

    // Temporizador de cuenta regresiva
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    const countdownTarget = session.countdown_ends_at || currentState.countdown_ends_at;
    if (countdownTarget) {
      const calcRemaining = () => {
        const diff = Math.max(0, Math.floor((new Date(countdownTarget).getTime() - Date.now()) / 1000));
        setCountdown(diff);
        if (diff <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };

      calcRemaining();
      countdownIntervalRef.current = setInterval(calcRemaining, 1000);
    } else {
      setCountdown(null);
    }
  };

  // Cargar sesiones activas de Bingo
  const loadActiveSessions = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      // 1. Intentar consulta relacional estructurada
      let { data, error } = await supabase
        .from('game_sessions')
        .select(`
          id,
          table_id,
          status,
          current_state,
          countdown_ends_at,
          created_at,
          table:game_tables (
            id,
            entry_fee,
            game_variant,
            current_players_count,
            game_table_players (
              user_id,
              status
            )
          )
        `)
        .eq('game_type', 'bingo')
        .in('status', ['WAITING', 'READY', 'SALES', 'DRAWING', 'ACTIVE'])
        .order('created_at', { ascending: false })
        .limit(6);

      // Fallback si la relación table falla
      if (error || !data) {
        const fallback = await supabase
          .from('game_sessions')
          .select('*')
          .eq('game_type', 'bingo')
          .in('status', ['WAITING', 'READY', 'SALES', 'DRAWING', 'ACTIVE'])
          .order('created_at', { ascending: false })
          .limit(6);
        data = (fallback.data as any) || [];
      }

      // Filtrar estrictamente sesiones y mesas que NO estén finalizadas o canceladas
      const validSessions: ActiveBingoSession[] = (data || [])
        .map((s: any) => {
          const rawTable = Array.isArray(s.table) ? s.table[0] : s.table;
          return {
            ...s,
            table: rawTable || { id: s.table_id, entry_fee: 25 },
          };
        })
        .filter((s: ActiveBingoSession) => {
          const sStatus = String(s.status || '').toUpperCase();
          return sStatus !== 'FINISHED' && sStatus !== 'CANCELLED' && sStatus !== 'CLOSED';
        });

      setActiveSessions(validSessions);

      // Mantener la selección actual o elegir la primera activa (priorizando sorteo en curso)
      if (validSessions.length > 0) {
        setSelectedSession((prev) => {
          if (prev) {
            const stillActive = validSessions.find((s) => s.id === prev.id);
            if (stillActive) {
              updateSessionState(stillActive);
              return stillActive;
            }
          }
          // Priorizar una sesión en sorteo DRAWING
          const drawingSession = validSessions.find((s) => s.status === 'DRAWING' || s.status === 'ACTIVE');
          const chosen = drawingSession || validSessions[0];
          updateSessionState(chosen);
          return chosen;
        });
      } else {
        setSelectedSession(null);
        setCurrentBall(null);
        setDrawnBalls([]);
        setWinnerInfo(null);
      }
    } catch (err) {
      console.warn('[BINGO_LIVE_VIEWER] Error cargando sesiones activas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveSessions();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Suscripción Realtime a game_sessions de Bingo
    const channel = supabase
      .channel('bingo-live-spectator-feed')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
        },
        (payload: any) => {
          const isBingo =
            payload.new?.game_type?.toLowerCase() === 'bingo' ||
            payload.old?.game_type?.toLowerCase() === 'bingo';

          if (!isBingo) return;

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            const statusUpper = String(updated?.status || '').toUpperCase();

            if (statusUpper === 'FINISHED' || statusUpper === 'CANCELLED') {
              // Si la sesión actualmente vista finalizó, mostrar ganador temporalmente y recargar
              if (selectedSession?.id === updated.id) {
                const cState = updated.current_state || {};
                if (cState.winnerUserId || cState.winnerName) {
                  setWinnerInfo({
                    name: cState.winnerName || '¡Ganador de Bingo!',
                    prizeBs: cState.winnerPoolBs,
                  });
                }
                setTimeout(() => {
                  loadActiveSessions();
                  setWinnerInfo(null);
                }, 6000);
              } else {
                loadActiveSessions();
              }
            } else {
              // Actualización de estado en curso (balota extraída, etc.)
              if (selectedSession?.id === updated.id) {
                updateSessionState(updated);
              }
              loadActiveSessions();
            }
          } else if (payload.eventType === 'INSERT') {
            loadActiveSessions();
          } else if (payload.eventType === 'DELETE') {
            loadActiveSessions();
          }
        }
      )
      .subscribe();

    // Polling ligero de respaldo cada 4 segundos para asegurar sincronía de balotas
    const pollInterval = setInterval(() => {
      loadActiveSessions();
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [selectedSession?.id]);

  const formatCountdown = (seconds: number | null) => {
    if (seconds === null || seconds <= 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cálculo del pozo neto usando la regla autoritativa del FinancialRepository
  const stats = useMemo(() => {
    if (!selectedSession) return { playersCount: 0, netPrizeBs: 0, entryFee: 25 };
    const table = selectedSession.table;
    const playersCount =
      table?.game_table_players?.filter((p) => p.status !== 'LEFT').length ||
      table?.current_players_count ||
      1;
    const entryFee = Number(table?.entry_fee || 25);
    const grossPool = playersCount * entryFee;
    const breakdown = FinancialRepository.calculatePoolBreakdown(grossPool);

    return {
      playersCount,
      netPrizeBs: breakdown.prizePool,
      entryFee,
    };
  }, [selectedSession]);

  // Si no hay sesiones activas, mostramos un banner invitando a jugar
  if (loading) {
    return (
      <div className="bg-[#131926]/60 border border-slate-800 rounded-3xl p-8 text-center animate-pulse">
        <div className="w-12 h-12 bg-slate-800 rounded-full mx-auto mb-3" />
        <p className="text-slate-400 text-xs font-semibold">Sintonizando sorteos en vivo...</p>
      </div>
    );
  }

  if (activeSessions.length === 0) {
    return (
      <div
        id="bingo-live-viewer-empty"
        className="relative overflow-hidden bg-gradient-to-br from-[#131926] via-[#101522] to-[#0B0F17] border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-xl"
      >
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-16 h-16 bg-slate-800/80 border border-slate-700/60 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <Radio className="w-8 h-8 text-amber-400/80" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-300 mb-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                PANTALLA DE ESPECTADOR EN VIVO
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white">Sorteos de Bingo en Directo</h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-lg">
                No hay salas transmitiendo en este instante. ¡Abre tu mesa o adquiere tus cartones para encender la pantalla de sorteo!
              </p>
            </div>
          </div>

          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('tables')}
              className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Ticket className="w-4 h-4" />
              <span>Crear Mesa de Bingo</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const isDrawing = selectedSession?.status === 'DRAWING' || selectedSession?.status === 'ACTIVE';
  const parsedCurrentBall = parseBall(currentBall);
  const ballStyles = currentBall !== null ? getBallStyles(currentBall) : null;

  return (
    <div id="bingo-live-viewer" className="space-y-4">
      {/* Encabezado con selector de salas activas */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Radio className="w-5 h-5 animate-pulse text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide uppercase flex items-center gap-2">
                Pantalla Gigante de Bingo en Vivo
              </h2>
              <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                {activeSessions.length} EN DIRECTO
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Vista de espectador en tiempo real: balotas extraídas, pozo acumulado y ganador al instante
            </p>
          </div>
        </div>

        {/* Selector de Mesas si hay más de una */}
        {activeSessions.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 scrollbar-none">
            {activeSessions.map((session, idx) => {
              const isSelected = selectedSession?.id === session.id;
              const isSessDrawing = session.status === 'DRAWING' || session.status === 'ACTIVE';
              return (
                <button
                  key={session.id}
                  onClick={() => {
                    setSelectedSession(session);
                    updateSessionState(session);
                  }}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/50'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSessDrawing ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'
                    }`}
                  />
                  <span>Sala #{idx + 1}</span>
                  <span className="opacity-70 text-[10px]">({session.table?.entry_fee || 25} Bs)</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pantalla principal del Sorteo de Bingo */}
      {selectedSession && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-gradient-to-br from-[#161F33] via-[#101626] to-[#0A0D14] border-2 border-amber-500/40 rounded-3xl p-5 sm:p-7 shadow-2xl"
        >
          {/* Luz de fondo sutil */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Barra superior de estado */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800/80 relative z-10">
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${
                  isDrawing
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                    : countdown !== null && countdown > 0
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isDrawing ? 'bg-rose-400 animate-ping' : 'bg-amber-400'
                  }`}
                />
                <span>
                  {isDrawing
                    ? '🔴 SORTEO EN TRANSMISIÓN'
                    : countdown !== null && countdown > 0
                    ? `⏱️ INICIA EN ${formatCountdown(countdown)}`
                    : '⏳ VENTA DE CARTONES ACTIVA'}
                </span>
              </div>

              <span className="text-xs font-bold text-slate-400">
                Variante:{' '}
                <strong className="text-slate-200">
                  {selectedSession.table?.game_variant || '90'} Bolas
                </strong>
              </span>
            </div>

            {/* Acción para participar directamente en la partida */}
            {onSelectBingoVariant && selectedSession.table_id && (
              <button
                onClick={() => {
                  const variant = (selectedSession.table?.game_variant || '90') as '75' | '80' | '90';
                  onSelectBingoVariant(variant, selectedSession.table_id);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>Entrar a Esta Mesa</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Escenario Central: Balota Gigante y Transmisión */}
          <div className="flex flex-col items-center justify-center my-4 relative z-10">
            <AnimatePresence mode="wait">
              {currentBall !== null && ballStyles ? (
                <motion.div
                  key={String(currentBall)}
                  initial={{ scale: 0.3, rotate: -90, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0.5, rotate: 90, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                  className="flex flex-col items-center"
                >
                  <div
                    className={`relative w-28 h-28 sm:w-36 sm:h-36 rounded-full ${ballStyles.bg} ${ballStyles.glow} border-4 border-white/40 flex flex-col items-center justify-center shadow-2xl`}
                  >
                    {/* Brillo especular superior */}
                    <div className="absolute top-[10%] left-[20%] right-[20%] h-[25%] rounded-full bg-gradient-to-b from-white/70 to-transparent pointer-events-none" />

                    {/* Centro blanco de la balota */}
                    <div className="w-[66%] h-[66%] rounded-full bg-slate-950/90 border border-white/20 flex flex-col items-center justify-center shadow-inner">
                      {parsedCurrentBall.letter && (
                        <span
                          className={`text-xs sm:text-sm font-black tracking-widest ${ballStyles.textColor}`}
                        >
                          {parsedCurrentBall.letter}
                        </span>
                      )}
                      <span className="text-3xl sm:text-4xl font-black text-white leading-none">
                        {parsedCurrentBall.num}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs font-bold text-slate-400 mt-2.5 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Última Balota Cantada
                  </p>
                </motion.div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-24 h-24 rounded-full bg-slate-900/80 border-2 border-dashed border-slate-700/80 flex flex-col items-center justify-center mx-auto mb-2 text-slate-500">
                    <Clock className="w-8 h-8 animate-pulse text-amber-400/60" />
                  </div>
                  <p className="text-sm font-black text-slate-200">
                    {countdown !== null && countdown > 0
                      ? 'Preparando bolillero digital...'
                      : 'Esperando extracción de la primera balota...'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Las balotas aparecerán automáticamente en esta pantalla
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Historial de Balotas Extraídas */}
          <div className="mt-5 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Balotas Extraídas ({drawnBalls.length})
              </span>
              {drawnBalls.length > 0 && (
                <span className="text-[11px] text-slate-500">Últimas a la derecha</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl max-h-32 overflow-y-auto scrollbar-thin">
              {drawnBalls.length === 0 ? (
                <span className="text-slate-600 text-xs italic py-2 px-1">
                  Ninguna balota ha sido extraída aún. Las balotas cantadas se listarán aquí en orden.
                </span>
              ) : (
                drawnBalls.map((b, idx) => {
                  const bStyles = getBallStyles(b);
                  const p = parseBall(b);
                  const isLatest = idx === drawnBalls.length - 1;
                  return (
                    <motion.div
                      key={`${b}-${idx}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full ${bStyles.bg} flex flex-col items-center justify-center text-white border ${
                        isLatest ? 'border-white ring-2 ring-amber-400' : 'border-white/20'
                      } shadow-md shrink-0`}
                    >
                      {p.letter && (
                        <span className="text-[8px] font-black opacity-80 leading-none">
                          {p.letter}
                        </span>
                      )}
                      <span className="text-[11px] sm:text-xs font-black leading-none">{p.num}</span>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>

          {/* Banner de Ganador Declarado */}
          <AnimatePresence>
            {winnerInfo && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border-2 border-amber-500/60 text-center relative z-10 shadow-lg"
              >
                <Trophy className="w-8 h-8 text-amber-400 mx-auto mb-1 animate-bounce" />
                <h4 className="text-base font-black text-amber-300 uppercase tracking-wide">
                  🎉 ¡BINGO CANTADO! ¡HAY GANADOR!
                </h4>
                <p className="text-sm font-bold text-white mt-0.5">{winnerInfo.name}</p>
                {winnerInfo.prizeBs !== undefined && (
                  <p className="text-xs font-black text-emerald-400 mt-0.5">
                    Premio adjudicado: {winnerInfo.prizeBs.toFixed(2)} Bs
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Estadísticas de la Sala en Tiempo Real */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4 mt-5 pt-4 border-t border-slate-800/80 relative z-10">
            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 text-center">
              <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <div className="text-lg sm:text-xl font-black text-white">{drawnBalls.length}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Balotas
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 text-center">
              <Users className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
              <div className="text-lg sm:text-xl font-black text-white">{stats.playersCount}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Jugadores
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-3 text-center">
              <Zap className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <div className="text-lg sm:text-xl font-black text-amber-300">
                {stats.netPrizeBs.toFixed(0)} Bs
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Pozo Neto
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default BingoLiveViewer;
