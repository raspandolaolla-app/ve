// ==============================================================================
// RASPANDO LA OLLA — SECCIÓN DESTACADA: MESAS DE BINGO DISPONIBLES EN VIVO
// Mesas Reales en Supabase (75 y 90 Bolas), Realtime, Creación y Conexión Directa
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Plus, Users, Ticket, Zap, Play, X, Trophy, Loader2 } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { TableRepository } from '../../services/repositories/TableRepository';
import { useWallet } from '../../context/WalletContext';
import { CreateBingoTableForm, type CreateBingoTableParams } from '../tables/components/CreateBingoTableForm';

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bingoWinnersHistory, setBingoWinnersHistory] = useState<any[]>([]);

  const { balance } = useWallet();
  const userBalance = balance?.availableBalance ?? 0;

  // Cargar mesas disponibles
  useEffect(() => {
    loadBingoTables();
    loadBingoWinnersHistory();

    const client = getSupabaseClient();
    if (!client) return;

    // Suscribirse a cambios en tiempo real en mesas de bingo
    const subscription = client
      .channel('bingo_tables_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_tables', filter: 'game_type=eq.bingo' },
        () => {
          loadBingoTables();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_tables', filter: 'game_type=eq.BINGO' },
        () => {
          loadBingoTables();
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
      client.removeChannel(subscription);
    };
  }, []);

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
    <div id="section-bingo-virtual" className="mb-12">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl sm:text-4xl select-none">🎱</span>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
                Mesas de Bingo Disponibles
              </h2>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black rounded-full tracking-wider uppercase shadow-sm shadow-emerald-500/10">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Partidas en tiempo real de 75 y 90 bolas con pozos acumulados en bolívares
            </p>
          </div>
        </div>

        <button
          id="btn-create-bingo-table-lobby"
          onClick={() => {
            setCreateError(null);
            setShowCreateModal(true);
          }}
          className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg transform transition active:scale-95 flex items-center gap-2 cursor-pointer text-sm"
        >
          <Plus className="w-4 h-4" />
          Crear Mesa
        </button>
      </div>

      {/* Grid de Mesas Disponibles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && availableBingoTables.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-slate-900/40 rounded-2xl border-2 border-dashed border-slate-800">
            <Loader2 className="w-8 h-8 text-[#FF8A00] animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-400">
              Sincronizando mesas de Bingo en vivo...
            </p>
          </div>
        ) : availableBingoTables.length > 0 ? (
          availableBingoTables.map((table: any) => {
            const isDrawing = table.status === 'DRAWING' || table.status === 'drawing';
            const isOpen = table.status === 'ACTIVE' || table.status === 'WAITING' || table.status === 'OPEN' || table.status === 'active' || table.status === 'waiting';

            return (
              <div
                key={table.id}
                id={`bingo-lobby-table-${table.id}`}
                className={`relative bg-gradient-to-br from-[#171E2A] to-[#111722] rounded-2xl border p-5 transition-all hover:shadow-xl ${
                  isDrawing
                    ? 'border-amber-500/50 opacity-85'
                    : 'border-slate-800 hover:border-purple-500/60 cursor-pointer shadow-lg hover:shadow-purple-500/10'
                }`}
                onClick={() => !isDrawing && handleJoinTable(table.id)}
              >
                {/* Badge de Estado */}
                <div className="absolute top-4 right-4">
                  {isDrawing ? (
                    <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-full flex items-center gap-1">
                      <Zap className="w-3 h-3 animate-pulse text-amber-400" />
                      SORTEO EN CURSO
                    </span>
                  ) : isOpen ? (
                    <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold rounded-full">
                      ABIERTO
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold rounded-full">
                      LLENO
                    </span>
                  )}
                </div>

                {/* Información de la Mesa */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl select-none">{table.game_variant === '75' ? '🎯' : '🎱'}</span>
                    <div>
                      <h3 className="font-black text-lg text-white">
                        Bingo {table.game_variant} Bolas
                      </h3>
                      <p className="text-xs text-slate-400">
                        {table.game_variant === '75' ? '2 Ganadores (Línea + Bingo)' : '1 Ganador (Bingo)'}
                      </p>
                    </div>
                  </div>

                  {/* Precio y Pozo */}
                  <div className="flex items-center justify-between bg-slate-950/70 border border-slate-800/80 p-3 rounded-xl">
                    <div>
                      <p className="text-xs text-slate-400">Costo por cartón</p>
                      <p className="text-xl font-black text-emerald-400 font-mono">
                        {table.entry_fee} BS
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Pozo Actual</p>
                      <p className="text-xl font-black text-purple-400 font-mono">
                        {table.current_prize || 0} BS
                      </p>
                    </div>
                  </div>

                  {/* Jugadores */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Users className="w-4 h-4 text-purple-400" />
                      <span className="font-semibold">
                        {table.players_count || 0} / {table.max_players === 99 ? '∞' : table.max_players}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <Ticket className="w-4 h-4 text-purple-400" />
                      <span className="font-semibold">{table.cards_sold || 0} cartones</span>
                    </div>
                  </div>

                  {/* Botón de Acción */}
                  {isDrawing ? (
                    <button
                      disabled
                      className="w-full py-3 bg-slate-800/80 border border-amber-500/30 text-amber-300/90 font-bold rounded-xl cursor-not-allowed flex items-center justify-center gap-2 text-xs sm:text-sm"
                    >
                      <Zap className="w-4 h-4 animate-pulse text-amber-400" />
                      Sorteo en curso - No se permiten ingresos
                    </button>
                  ) : (
                    <button
                      id={`btn-join-bingo-table-${table.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJoinTable(table.id);
                      }}
                      className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md transform transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-5 h-5" />
                      Unirse a la Mesa
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          /* Estado Vacío */
          <div className="col-span-full text-center py-12 bg-slate-900/40 rounded-2xl border-2 border-dashed border-slate-800">
            <div className="text-6xl mb-4 select-none">🎱</div>
            <h3 className="text-xl font-black text-white mb-2">
              No hay mesas de Bingo disponibles
            </h3>
            <p className="text-slate-400 mb-6 text-sm">
              ¡Sé el primero en crear una mesa y empezar el juego!
            </p>
            <button
              id="btn-create-first-bingo-table"
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-lg rounded-xl shadow-lg transform transition hover:scale-105 flex items-center gap-3 mx-auto cursor-pointer"
            >
              <Plus className="w-6 h-6" />
              Crear Primera Mesa de Bingo
            </button>
          </div>
        )}
      </div>

      {/* Modal de Crear Mesa de Bingo (Conectar con Formulario Mejorado) */}
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

            {/* Formulario ultra-compacto de Bingo */}
            <CreateBingoTableForm
              onCreateTable={handleCreateTable}
              userBalance={userBalance}
              isSubmitting={isCreating}
              onCancel={() => setShowCreateModal(false)}
            />
          </div>
        </div>
      )}

      {/* SECCIÓN: HISTORIAL DE GANADORES BINGO LA OLLA */}
      <div id="bingo-la-olla-history" className="mt-12 pt-6 border-t border-slate-800/60">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400 animate-pulse" />
              <h3 className="text-lg font-black text-slate-100 uppercase tracking-wide">
                🏆 HISTORIAL DE GANADORES “BINGO LA OLLA”
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Fotos, nombres y premios en tiempo real de los últimos 7 días (máx. 100)
            </p>
          </div>
        </div>

        {bingoWinnersHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center text-slate-400 text-xs">
            <Trophy className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            No hay ganadores registrados en los últimos 7 días.<br />
            ¡Sé el primero en reclamar Bingo y tomar tu foto de victoria!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {bingoWinnersHistory.map((w) => (
              <div
                key={w.id}
                className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden"
              >
                {/* Visualizador de la foto o avatar del ganador */}
                <div className="w-full h-44 rounded-xl bg-slate-950 overflow-hidden relative border border-slate-800">
                  {w.photoUrl ? (
                    <img
                      src={w.photoUrl}
                      alt={w.winnerName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-600">
                      <Trophy className="w-12 h-12 text-slate-800 mb-1 animate-pulse" />
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Foto pendiente</span>
                    </div>
                  )}
                  {/* Badge de Premio en la foto */}
                  <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-emerald-500/90 text-slate-950 text-xs font-black font-mono shadow-md">
                    +{Number(w.prizeBs || 0).toFixed(2)} Bs
                  </div>
                </div>

                {/* Info del Ganador */}
                <div className="mt-3 flex flex-col justify-between flex-1">
                  <div>
                    <div className="text-sm font-extrabold text-slate-100 truncate uppercase">
                      {w.winnerName}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {new Date(w.createdAt).toLocaleDateString('es-VE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
