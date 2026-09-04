// ==============================================================================
// RASPANDO LA OLLA — SECCIÓN DESTACADA: MESAS DE BINGO DISPONIBLES EN VIVO
// Mesas Reales en Supabase (75 y 90 Bolas), Realtime, Creación y Conexión Directa
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Plus, X, Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { TableRepository } from '../../services/repositories/TableRepository';
import { useWallet } from '../../context/WalletContext';
import { CreateBingoTableForm, type CreateBingoTableParams } from '../tables/components/CreateBingoTableForm';
import { FinancialRepository } from '../../services/repositories/FinancialRepository';

interface BingoLobbySectionProps {
  onSelectBingoVariant?: (variant: '75' | '80' | '90', tableId: string) => void;
  onlineCount?: number;
  onNavigateTab?: (tab: string) => void;
}

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

    // Suscribirse a cambios en tiempo real con filtrado y remoción reactiva
    const subscription = client
      .channel('bingo_countdowns_and_tables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_tables' },
        (payload: any) => {
          const isBingo =
            payload.new?.game_type?.toLowerCase() === 'bingo' ||
            payload.old?.game_type?.toLowerCase() === 'bingo';

          if (!isBingo) return;

          if (payload.eventType === 'UPDATE') {
            const updatedTable = payload.new;
            const statusUpper = String(updatedTable.status || '').toUpperCase();

            // Si la mesa pasó a FINISHED, CANCELLED o CLOSED, removerla inmediatamente de la vista
            if (statusUpper === 'FINISHED' || statusUpper === 'CANCELLED' || statusUpper === 'CLOSED') {
              setAvailableBingoTables((prev) => prev.filter((t) => t.id !== updatedTable.id));
            } else {
              loadBingoTables();
            }
          } else if (payload.eventType === 'INSERT') {
            const newTable = payload.new;
            const statusUpper = String(newTable.status || '').toUpperCase();
            if (statusUpper !== 'FINISHED' && statusUpper !== 'CANCELLED' && statusUpper !== 'CLOSED') {
              loadBingoTables();
            }
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (oldId) {
              setAvailableBingoTables((prev) => prev.filter((t) => t.id !== oldId));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_sessions' },
        (payload: any) => {
          if (payload.eventType === 'UPDATE') {
            const updatedSession = payload.new;
            const statusUpper = String(updatedSession?.status || '').toUpperCase();

            // Si la sesión pasó a FINISHED o CANCELLED, removerla de mesas y de conteos regresivos
            if (statusUpper === 'FINISHED' || statusUpper === 'CANCELLED') {
              if (updatedSession.table_id) {
                setAvailableBingoTables((prev) => prev.filter((t) => t.id !== updatedSession.table_id));
              }
              setCountdownSessions((prev) => prev.filter((s) => s.id !== updatedSession.id));
              loadBingoWinnersHistory();
            } else {
              loadCountdowns();
              loadBingoTables();
            }
          } else {
            loadCountdowns();
            loadBingoTables();
          }
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
        .in('status', ['WAITING', 'READY', 'SALES']);

      if (!error && data) {
        const activeCountdowns = data.filter((s: any) => {
          const rawTable = Array.isArray(s.game_tables) ? s.game_tables[0] : s.game_tables;
          const tableStatus = String(rawTable?.status || '').toUpperCase();
          const sessionStatus = String(s.status || '').toUpperCase();
          const isFinished = sessionStatus === 'FINISHED' || tableStatus === 'FINISHED';
          const isCancelled = sessionStatus === 'CANCELLED' || tableStatus === 'CANCELLED';
          const isClosed = sessionStatus === 'CLOSED' || tableStatus === 'CLOSED';
          return !isFinished && !isCancelled && !isClosed;
        });
        setCountdownSessions(activeCountdowns);
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

      // Consulta relacional con filtro estricto de mesas activas
      let { data: tables, error } = await client
        .from('game_tables')
        .select(`
          *,
          game_sessions (
            id,
            status,
            current_state,
            countdown_ends_at,
            winner_user_id
          ),
          game_table_players (
            user_id,
            status
          )
        `)
        .or('game_type.eq.bingo,game_type.eq.BINGO')
        .in('status', ['WAITING', 'READY', 'SALES', 'ACTIVE', 'OPEN', 'DRAWING'])
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Fallback a consulta simple de mesas:', error.message);
        const fallback = await client
          .from('game_tables')
          .select('*')
          .or('game_type.eq.bingo,game_type.eq.BINGO')
          .in('status', ['WAITING', 'READY', 'SALES', 'ACTIVE', 'OPEN', 'DRAWING'])
          .order('created_at', { ascending: false });
        tables = fallback.data;
      }

      // Obtener compras reales de cartones para calcular pozo neto y cartones reales
      const tableIds = (tables || []).map((t: any) => t.id);
      const purchasesByTable: Record<string, any[]> = {};
      if (tableIds.length > 0) {
        try {
          const { data: purchases } = await client
            .from('bingo_card_purchases')
            .select('id, game_table_id, user_id, card_count, total_cost, winner_pool')
            .in('game_table_id', tableIds);

          if (purchases) {
            purchases.forEach((p: any) => {
              if (!purchasesByTable[p.game_table_id]) {
                purchasesByTable[p.game_table_id] = [];
              }
              purchasesByTable[p.game_table_id].push(p);
            });
          }
        } catch (pErr) {
          console.warn('Error obteniendo compras de cartones:', pErr);
        }
      }

      // Procesar datos y aplicar filtro estricto: excluir FINISHED, CANCELLED y CLOSED
      const processedTables = (tables || [])
        .map((table: any) => {
          const session = Array.isArray(table.game_sessions) ? table.game_sessions[0] : table.game_sessions;
          const players = (table.game_table_players || []).filter((p: any) => p.status !== 'LEFT');
          const tablePurchases = purchasesByTable[table.id] || [];

          const realCardsSold = tablePurchases.length > 0
            ? tablePurchases.reduce((acc, p) => acc + (Number(p.card_count) || 1), 0)
            : Number(table.cards_sold || 0);

          const realPlayersCount = tablePurchases.length > 0
            ? new Set(tablePurchases.map((p) => p.user_id)).size
            : (players.length || table.current_players_count || 0);

          const entryFee = Number(table.entry_fee || table.entryFee || 25);

          // Pozo Neto sin contar comisión
          const purchasesPool = tablePurchases.reduce((acc, p) => acc + (Number(p.winner_pool) || 0), 0);
          const sessionPrize = Number(session?.winner_prize_amount || 0);
          const estimatedPrize = FinancialRepository.calculatePoolBreakdown(realCardsSold * entryFee).prizePool;
          const netPrize = sessionPrize > 0
            ? sessionPrize
            : (purchasesPool > 0 ? purchasesPool : estimatedPrize);

          const variant = String(table.game_variant || table.config?.gameVariant || table.config?.variant || '90');
          const status = String(session?.status || table.status || 'OPEN').toUpperCase();
          const tableStatus = String(table.status || 'OPEN').toUpperCase();
          const sessionStatus = session ? String(session.status || '').toUpperCase() : '';

          return {
            ...table,
            id: table.id,
            status: status,
            table_status: tableStatus,
            session_status: sessionStatus,
            game_variant: variant,
            entry_fee: entryFee,
            players_count: realPlayersCount,
            max_players: table.max_players === 99 ? 99 : (table.max_players || 99),
            cards_sold: realCardsSold,
            current_prize: Math.round(netPrize * 100) / 100,
            canJoin: status !== 'DRAWING' && status !== 'FINISHED' && status !== 'CANCELLED' && status !== 'CLOSED',
            game_sessions: session ? [session] : [],
          };
        })
        .filter((t: any) => {
          // Filtro estricto: Descartar inmediatamente salas que hayan finalizado o cancelado
          const isFinished = t.status === 'FINISHED' || t.table_status === 'FINISHED' || t.session_status === 'FINISHED';
          const isCancelled = t.status === 'CANCELLED' || t.table_status === 'CANCELLED' || t.session_status === 'CANCELLED';
          const isClosed = t.status === 'CLOSED' || t.table_status === 'CLOSED' || t.session_status === 'CLOSED';
          return !isFinished && !isCancelled && !isClosed;
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
    <div id="section-bingo-virtual" className="mb-6">
      {/* HISTORIAL DE GANADORES DE BINGO */}
      <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#171A29] via-[#121624] to-[#0D101A] p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white tracking-wide uppercase">
                Historial de Ganadores de Bingo
              </h3>
              <p className="text-[11px] text-slate-400">
                Últimos premios de Bingo adjudicados en tiempo real
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs transition-all shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear Mesa</span>
            </button>

            <div className="flex items-center gap-1 pl-1">
              <button
                onClick={() => setWinnerPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={winnerPageIndex === 0}
                className="w-7 h-7 rounded-lg bg-[#111722] hover:bg-[#1E2938] border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                title="Anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setWinnerPageIndex((prev) => prev + 1)}
                disabled={bingoWinnersHistory.length <= (winnerPageIndex + 1)}
                className="w-7 h-7 rounded-lg bg-[#111722] hover:bg-[#1E2938] border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                title="Siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tarjeta de Ganador Reciente */}
        {bingoWinnersHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Trophy className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              No hay ganadores registrados en los últimos 7 días. ¡Sé el primero en cantar Bingo y tomar el pozo de victoria!
            </p>
          </div>
        ) : (
          (() => {
            const winner = bingoWinnersHistory[winnerPageIndex] || bingoWinnersHistory[0];
            return (
              <div className="w-full flex items-center justify-between gap-4 p-3 bg-[#0B0F17]/60 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center shadow-md">
                    {winner?.photoUrl ? (
                      <img
                        src={winner.photoUrl}
                        alt={winner.winnerName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Trophy className="w-6 h-6 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      Ganador de Bingo
                    </span>
                    <h4 className="text-white font-bold text-sm sm:text-base uppercase truncate max-w-[180px] sm:max-w-xs">
                      {winner?.winnerName || 'Jugador Ganador'}
                    </h4>
                    <span className="text-xs sm:text-sm text-emerald-400 font-mono font-black">
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
