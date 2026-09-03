// ==============================================================================
// RASPANDO LA OLLA — SECCIÓN DESTACADA: MESAS DE BINGO DISPONIBLES EN VIVO
// Mesas Reales en Supabase (75 y 90 Bolas), Realtime, Creación y Conexión Directa
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Plus, Users, Ticket, Zap, Play, X, Trophy, Loader2, Clock, Crown, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { TableRepository } from '../../services/repositories/TableRepository';
import { useWallet } from '../../context/WalletContext';
import { CreateBingoTableForm, type CreateBingoTableParams } from '../tables/components/CreateBingoTableForm';
import { BingoCountdownBanner } from './BingoCountdownBanner';

interface BingoLobbySectionProps {
  onSelectBingoVariant?: (variant: '75' | '80' | '90', tableId: string) => void;
  onlineCount?: number;
  onNavigateTab?: (tab: string) => void;
}

interface CountdownTimerProps {
  session: any;
  onJoinTable: (tableId: string) => void;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ session, onJoinTable }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const target = new Date(session.countdown_ends_at).getTime();
      const distance = target - now;

      if (distance <= 0) {
        setTimeLeft('¡INICIANDO!');
        return;
      }

      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session.countdown_ends_at]);

  const rawTable = Array.isArray(session.game_tables) ? session.game_tables[0] : session.game_tables;
  const tableId = rawTable?.id || session.table_id;
  const variant = rawTable?.game_variant || session.current_state?.gameVariant || '90';
  const entryFee = rawTable?.entry_fee || 25;
  const purchases = session.bingo_card_purchases || [];
  const uniquePlayers = new Set(purchases.map((p: any) => p.user_id)).size;

  return (
    <div
      id={`bingo-countdown-card-${session.id}`}
      className="bg-gradient-to-br from-[#1c1829] via-[#171c2b] to-[#121520] border-2 border-amber-500/50 rounded-2xl p-5 shadow-xl shadow-amber-500/10 flex flex-col justify-between transition-all hover:border-amber-400"
    >
      <div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl select-none">{variant === '75' ? '🎯' : '🎱'}</span>
            <div>
              <p className="font-black text-white text-base">
                Bingo {variant} Bolas
              </p>
              <p className="text-xs text-amber-400 font-medium">
                Entrada: <span className="font-bold font-mono">{entryFee} BS</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl sm:text-3xl font-black text-amber-400 font-mono tracking-wider animate-pulse">
              {timeLeft}
            </p>
            <p className="text-[10px] font-black text-amber-300/80 uppercase tracking-widest flex items-center justify-end gap-1">
              <Clock className="w-3 h-3 text-amber-400" /> INICIA EN
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-300 my-2">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-white">{uniquePlayers || 2} jugadores</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ticket className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-emerald-300 font-mono">{purchases.length || 2} cartones</span>
          </div>
        </div>
      </div>

      <button
        id={`btn-join-countdown-${session.id}`}
        onClick={() => tableId && onJoinTable(tableId)}
        className="w-full mt-3 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black rounded-xl text-sm transition-all transform active:scale-95 shadow-md shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wide"
      >
        <Zap className="w-4 h-4 text-slate-950 fill-slate-950" />
        ¡Unirse Ahora!
      </button>
    </div>
  );
};

export const BingoLobbySection: React.FC<BingoLobbySectionProps> = ({
  onSelectBingoVariant,
  onNavigateTab,
}) => {
  const [availableBingoTables, setAvailableBingoTables] = useState<any[]>([]);
  const [countdownSessions, setCountdownSessions] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bingoWinnersHistory, setBingoWinnersHistory] = useState<any[]>([]);
  const [winnerPageIndex, setWinnerPageIndex] = useState(0);

  const { balance } = useWallet();
  const userBalance = balance?.availableBalance ?? 0;

  // Cargar mesas disponibles y cuentas regresivas
  useEffect(() => {
    loadBingoTables();
    loadBingoWinnersHistory();
    loadCountdowns();

    const client = getSupabaseClient();
    if (!client) return;

    const interval = setInterval(loadCountdowns, 3000);

    // Suscribirse a cambios en tiempo real
    const subscription = client
      .channel('bingo_countdowns_and_tables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions' },
        () => {
          loadCountdowns();
          loadBingoTables();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_tables', filter: 'game_type=eq.bingo' },
        () => {
          loadBingoTables();
          loadCountdowns();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_tables', filter: 'game_type=eq.BINGO' },
        () => {
          loadBingoTables();
          loadCountdowns();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bingo_winner_history' },
        () => {
          loadBingoWinnersHistory();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      client.removeChannel(subscription);
    };
  }, []);

  const loadCountdowns = async () => {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data, error } = await client
        .from('game_sessions')
        .select(`
          id,
          table_id,
          countdown_ends_at,
          status,
          current_state,
          game_tables (
            id,
            game_type,
            game_variant,
            entry_fee,
            name
          ),
          bingo_card_purchases (
            user_id
          )
        `)
        .ilike('game_type', 'bingo')
        .not('countdown_ends_at', 'is', null)
        .in('status', ['WAITING', 'READY', 'SALES', 'waiting', 'ready', 'sales']);

      if (!error && data) {
        setCountdownSessions(data);
      }
    } catch (err) {
      console.warn('Error cargando cuentas regresivas de bingo:', err);
    }
  };

  const loadBingoWinnersHistory = async () => {
    try {
      const data = await TableRepository.getBingoWinnerHistory();
      setBingoWinnersHistory(data || []);
    } catch (err) {
      console.warn('Error cargando historial de ganadores de bingo:', err);
    }
  };

  const loadBingoTables = async () => {
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Consulta relacional con fallback defensivo
      let { data: tables, error } = await client
        .from('game_tables')
        .select(`
          *,
          game_sessions (
            status,
            current_state,
            winner_user_id,
            gross_pool,
            winner_prize_amount
          ),
          game_table_players (
            user_id,
            status
          )
        `)
        .or('game_type.eq.bingo,game_type.eq.BINGO')
        .in('status', ['OPEN', 'WAITING', 'ACTIVE', 'DRAWING', 'waiting', 'active', 'drawing'])
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Fallback a consulta simple de mesas:', error.message);
        const fallback = await client
          .from('game_tables')
          .select('*')
          .or('game_type.eq.bingo,game_type.eq.BINGO')
          .in('status', ['OPEN', 'WAITING', 'ACTIVE', 'DRAWING', 'waiting', 'active', 'drawing'])
          .order('created_at', { ascending: false });
        tables = fallback.data;
      }

      // Procesar datos para mostrar
      const processedTables = (tables || []).map((table: any) => {
        const session = Array.isArray(table.game_sessions) ? table.game_sessions[0] : table.game_sessions;
        const players = (table.game_table_players || []).filter((p: any) => p.status !== 'LEFT');
        const cardsCount = Number(table.cards_sold || table.config?.cards_sold || (players.length > 0 ? players.length * 2 : 0));
        const entryFee = Number(table.entry_fee || table.entryFee || 25);

        // Calcular pozo actual
        const sessionPrize = Number(session?.winner_prize_amount || session?.gross_pool || 0);
        const totalPrize = sessionPrize > 0
          ? sessionPrize
          : (Number(table.config?.current_prize) || (cardsCount * entryFee * 0.90) || 0);

        const variant = String(table.game_variant || table.config?.gameVariant || table.config?.variant || '90');
        const status = session?.status || table.status || 'OPEN';

        return {
          ...table,
          id: table.id,
          status: status,
          game_variant: variant,
          entry_fee: entryFee,
          players_count: players.length || table.current_players_count || 0,
          max_players: table.max_players === 99 ? 99 : (table.max_players || 99),
          cards_sold: cardsCount,
          current_prize: Math.round(totalPrize * 100) / 100,
          canJoin: status !== 'DRAWING' && status !== 'drawing' && status !== 'FINISHED' && status !== 'finished',
        };
      });

      setAvailableBingoTables(processedTables);
    } catch (error) {
      console.error('Error cargando mesas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTable = async (tableId: string) => {
    try {
      const selected = availableBingoTables.find((t) => t.id === tableId);
      const variant = selected?.game_variant === '75' ? '75' : '90';

      if (onSelectBingoVariant) {
        onSelectBingoVariant(variant, tableId);
      }
      if (onNavigateTab) {
        onNavigateTab('tables');
      }

      // Notificar al componente de mesas para abrir inmediatamente la sala
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-table', { detail: { tableId } }));
      }, 50);
    } catch (error) {
      console.error('Error al unirse:', error);
      alert('Error al unirse a la mesa. Intenta nuevamente.');
    }
  };

  const handleCreateTable = async (params: CreateBingoTableParams) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const newTable = await TableRepository.createTable({
        gameType: 'bingo',
        gameVariant: params.gameVariant,
        name: `Bingo ${params.gameVariant} Bolas`,
        mode: '1v1',
        entryFee: params.entryFee,
        maxPlayers: params.maxPlayers,
        isPrivate: params.isPrivate,
        config: {
          gameVariant: params.gameVariant,
          variant: params.gameVariant,
          automated: true,
          callIntervalMs: 4000,
        },
      });

      if (newTable?.id) {
        setShowCreateModal(false);
        await loadBingoTables();
        handleJoinTable(newTable.id);
      } else {
        setCreateError('No fue posible crear la mesa de Bingo.');
      }
    } catch (err: any) {
      setCreateError(err?.message || 'Error al crear la mesa de Bingo. Inténtalo nuevamente.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div id="section-bingo-virtual" className="mb-10">
      {/* 1. BANNER COUNTDOWN BINGO ROYALE (Captura 2) */}
      <BingoCountdownBanner
        session={countdownSessions[0]}
        activeTable={availableBingoTables[0]}
        onJoin={(tableId) => {
          if (tableId) {
            handleJoinTable(tableId);
          } else if (availableBingoTables.length > 0) {
            handleJoinTable(availableBingoTables[0].id);
          } else {
            setShowCreateModal(true);
          }
        }}
      />

      {/* 2. SECCIÓN 2 COLUMNAS (Captura 1): EN VIVO (Mesas) & HISTORIAL DE GANADORES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        
        {/* COLUMNA IZQUIERDA: EN VIVO */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                En Vivo
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black rounded-full uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              EN VIVO
            </span>
          </div>

          {/* Tarjeta Mesas de Bingo con Esfera 3D y Botón Crear */}
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-[#171A29] via-[#121624] to-[#0D101A] p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-5 shadow-xl relative overflow-hidden group min-h-[175px] justify-between">
            {/* Esfera 3D Bingo con letra B resplandeciente */}
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-700 p-1 shadow-[0_0_25px_rgba(6,182,212,0.4)] shrink-0 flex items-center justify-center">
                <div className="w-full h-full rounded-full bg-[#0B0F17] flex items-center justify-center border border-cyan-400/40 text-cyan-300 font-black text-2xl sm:text-3xl font-mono shadow-inner">
                  B
                </div>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white group-hover:text-amber-400 transition-colors">
                  Mesas de Bingo
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                  {availableBingoTables.length > 0
                    ? `${availableBingoTables.length} ${availableBingoTables.length === 1 ? 'mesa activa disponible' : 'mesas activas disponibles'} con sorteos en tiempo real.`
                    : '¡Sé el primero en crear una mesa y empezar el juego!'}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white font-bold text-xs sm:text-sm transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)] active:scale-95 cursor-pointer flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{availableBingoTables.length === 0 ? 'Crear Primera Mesa' : 'Crear Mesa'}</span>
            </button>
          </div>
        </div>

        {/* COLUMNA DERECHA: HISTORIAL DE GANADORES */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                Historial de Ganadores
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setWinnerPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={winnerPageIndex === 0}
                className="w-7 h-7 rounded-lg bg-[#111722] hover:bg-[#1E2938] border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                title="Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setWinnerPageIndex((prev) => prev + 1)}
                disabled={bingoWinnersHistory.length <= (winnerPageIndex + 1)}
                className="w-7 h-7 rounded-lg bg-[#111722] hover:bg-[#1E2938] border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                title="Siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tarjeta de Historial de Ganadores */}
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-[#171A29] via-[#121624] to-[#0D101A] p-5 sm:p-6 flex flex-col items-center justify-center text-center shadow-xl min-h-[175px]">
            {bingoWinnersHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-2">
                <Trophy className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                  No hay ganadores registrados en los últimos 7 días. ¡Sé el primero en reclamar Bingo y tomar el trofeo de victoria!
                </p>
              </div>
            ) : (
              (() => {
                const winner = bingoWinnersHistory[winnerPageIndex] || bingoWinnersHistory[0];
                return (
                  <div className="w-full flex items-center justify-between gap-4 text-left">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                        {winner?.photoUrl ? (
                          <img
                            src={winner.photoUrl}
                            alt={winner.winnerName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Trophy className="w-7 h-7 text-amber-400" />
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                          Ganador de Bingo
                        </span>
                        <h4 className="text-white font-black text-sm uppercase truncate max-w-[160px]">
                          {winner?.winnerName || 'Jugador Ganador'}
                        </h4>
                        <span className="text-xs text-emerald-400 font-mono font-bold">
                          +{Number(winner?.prizeBs || 0).toFixed(2)} Bs
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-slate-500 font-mono">
                      {winner?.createdAt ? new Date(winner.createdAt).toLocaleDateString('es-VE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : ''}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>

      </div>

      {/* Grid de Mesas Disponibles Si Existen */}
      {availableBingoTables.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-slate-300 uppercase tracking-wider">
              Salas de Bingo en Vivo ({availableBingoTables.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableBingoTables.map((table: any) => {
              const isDrawing = table.status === 'DRAWING' || table.status === 'drawing';

              return (
                <div
                  key={table.id}
                  id={`bingo-lobby-table-${table.id}`}
                  className={`bg-gradient-to-b from-[#1A2235] to-[#0F1523] border rounded-2xl p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
                    isDrawing ? 'border-yellow-500/30 opacity-90' : 'border-slate-700/50 hover:border-amber-500/50'
                  }`}
                  onClick={() => !isDrawing && handleJoinTable(table.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white shadow-lg ${
                        table.game_variant === '75' ? 'bg-gradient-to-br from-blue-600 to-blue-800' : 'bg-gradient-to-br from-purple-600 to-purple-800'
                      }`}>
                        {table.game_variant}
                      </div>
                      <div>
                        <h3 className="font-black text-white text-base tracking-wide">Bingo {table.game_variant} Bolas</h3>
                        <p className="text-xs text-slate-400">{table.game_variant === '75' ? '2 Ganadores (Línea + Bingo)' : '1 Ganador (Cartón Lleno)'}</p>
                      </div>
                    </div>

                    {isDrawing ? (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-400 text-[10px] font-black uppercase rounded-full border border-yellow-500/30">
                        <Zap size={12} className="animate-pulse" /> En Juego
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase rounded-full border border-emerald-500/30">
                        Abierto
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-[#0B0F17]/60 rounded-xl p-3 text-center border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Entrada</p>
                      <p className="text-xl font-black text-emerald-400 font-mono">{table.entry_fee} <span className="text-xs text-emerald-600">Bs</span></p>
                    </div>
                    <div className="bg-[#0B0F17]/60 rounded-xl p-3 text-center border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Pozo</p>
                      <p className="text-xl font-black text-purple-400 font-mono">{table.current_prize || table.prize_pool || 0} <span className="text-xs text-purple-600">Bs</span></p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 mb-5 px-1">
                    <div className="flex items-center gap-1.5">
                      <Users size={14} className="text-slate-500" />
                      <span className="font-semibold text-slate-300">{table.players_count || 0}/{table.max_players === 99 ? '∞' : table.max_players}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Ticket size={14} className="text-slate-500" />
                      <span className="font-semibold text-slate-300">{table.cards_sold || 0} cartones</span>
                    </div>
                  </div>

                  {!isDrawing && (
                    <button
                      id={`btn-join-bingo-table-${table.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJoinTable(table.id);
                      }}
                      className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all active:scale-95 flex items-center justify-center gap-2 text-sm uppercase tracking-wide cursor-pointer"
                    >
                      <Crown size={16} /> Unirse Ahora
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Crear Mesa de Bingo */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="relative bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-800 p-2 sm:p-4 text-slate-100">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors z-10 cursor-pointer"
              title="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>

            {createError && (
              <div className="mb-3 mx-2 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-xs font-bold text-red-400">
                {createError}
              </div>
            )}

            <CreateBingoTableForm
              onCreateTable={handleCreateTable}
              userBalance={userBalance}
              isSubmitting={isCreating}
              onCancel={() => setShowCreateModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
