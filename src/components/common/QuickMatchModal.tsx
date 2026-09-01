// ==============================================================================
// RASPANDO LA OLLA — MODAL DE PARTIDA RÁPIDA (UNIRSE A MESA ACTIVA)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { X, Zap, Users, DollarSign, Loader2, ArrowRight, Trophy, Clock } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { useAudio } from '../../hooks/useAudio';

interface QuickMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTable: (tableId: string) => void;
}

interface AvailableTable {
  id: string;
  game_type: string;
  entry_fee_bs: number;
  max_players: number;
  current_players: number;
  is_private: boolean;
  host_name?: string;
  created_at: string;
}

const GAME_DISPLAY_NAMES: Record<string, { name: string; emoji: string }> = {
  'domino_venezolano': { name: 'Dominó', emoji: '🁣' },
  'truco_venezolano': { name: 'Truco', emoji: '🃏' },
  'bingo': { name: 'Bingo', emoji: '🎱' },
  'atrapaito': { name: 'Atrapaíto', emoji: '🎲' },
  'una_olla': { name: 'Una-Olla', emoji: '🃏' },
  'chess': { name: 'Ajedrez', emoji: '♟️' },
  'checkers': { name: 'Damas', emoji: '♟️' },
  'tic_tac_toe': { name: 'La Vieja', emoji: '❌' },
  'rock_paper_scissors': { name: 'Piedra Papel Tijera', emoji: '✊' },
  'polla_venezolana': { name: 'Polla', emoji: '🐾' },
};

export const QuickMatchModal: React.FC<QuickMatchModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTable,
}) => {
  const { user } = useAuth();
  const { playSound } = useAudio();
  const [tables, setTables] = useState<AvailableTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    if (isOpen) {
      fetchAvailableTables();
    }
  }, [isOpen]);

  const fetchAvailableTables = async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('No hay conexión con el servidor');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('game_tables')
        .select(`
          id,
          game_type,
          entry_fee_bs,
          max_players,
          is_private,
          created_at,
          game_table_players(user_id)
        `)
        .eq('status', 'WAITING')
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (fetchError) throw fetchError;

      const tablesWithCount = (data || []).map((t: any) => ({
        id: t.id,
        game_type: t.game_type,
        entry_fee_bs: Number(t.entry_fee_bs || 0),
        max_players: t.max_players,
        current_players: t.game_table_players?.length || 0,
        is_private: t.is_private,
        created_at: t.created_at,
      }));

      setTables(tablesWithCount);
    } catch (err: any) {
      console.error('[QuickMatch] Error:', err);
      setError('No se pudieron cargar las mesas');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTable = async (tableId: string) => {
    if (!user) {
      setError('Debes iniciar sesión para unirte');
      return;
    }

    setJoining(tableId);
    setError(null);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('No hay conexión');
      setJoining(null);
      return;
    }

    try {
      const { error: joinError } = await supabase.rpc('join_table_transaction', {
        p_table_id: tableId,
        p_user_id: user.id,
      });

      if (joinError) {
        if (joinError.message?.includes('duplicate') || joinError.message?.includes('ya')) {
          setError('Ya estás en esta mesa');
        } else if (joinError.message?.includes('full') || joinError.message?.includes('llena')) {
          setError('La mesa está llena');
        } else {
          setError('No se pudo unir: ' + joinError.message);
        }
        setJoining(null);
        return;
      }

      try { playSound('match'); } catch {}
      onNavigateToTable(tableId);
      onClose();
    } catch (err: any) {
      setError('Error al unirse: ' + (err?.message || String(err)));
      setJoining(null);
    }
  };

  const filteredTables = filter === 'ALL'
    ? tables
    : tables.filter(t => t.game_type === filter);

  const gameTypes = Array.from(new Set(tables.map(t => t.game_type)));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#080B12]/90 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-gradient-to-br from-[#111722] to-[#080B12] border border-[#FF8A00]/30 rounded-3xl shadow-2xl shadow-[#FF8A00]/20 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF8A00]/20 via-[#F5B942]/20 to-[#FF8A00]/20 border-b border-[#FF8A00]/30 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF8A00] to-[#F5B942] flex items-center justify-center text-2xl shadow-lg shadow-[#FF8A00]/30 animate-pulse-glow">
              ⚡
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[#F8FAFC] tracking-tight flex items-center gap-2">
                PARTIDA RÁPIDA
                <Zap className="w-5 h-5 text-[#F5B942]" />
              </h2>
              <p className="text-xs text-[#94A3B8] font-semibold">
                Únete a una mesa activa y juega ya
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros */}
        {tables.length > 0 && (
          <div className="px-5 py-3 border-b border-[#1E2938] flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition ${
                filter === 'ALL'
                  ? 'bg-[#FF8A00] text-[#080B12] shadow-md'
                  : 'bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              TODOS ({tables.length})
            </button>
            {gameTypes.map(type => {
              const game = GAME_DISPLAY_NAMES[type] || { name: type, emoji: '🎮' };
              const count = tables.filter(t => t.game_type === type).length;
              return (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                    filter === type
                      ? 'bg-[#FF8A00] text-[#080B12] shadow-md'
                      : 'bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <span>{game.emoji}</span>
                  <span>{game.name} ({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-[#FF8A00] animate-spin mb-4" />
              <p className="text-[#F8FAFC] font-bold text-lg">Buscando mesas...</p>
              <p className="text-[#94A3B8] text-sm mt-1">Preparando tu partida</p>
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 text-red-300 text-center">
              <p className="font-bold text-lg mb-1">⚠️ Error</p>
              <p className="text-sm">{error}</p>
              <button
                onClick={fetchAvailableTables}
                className="mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-sm font-bold transition"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && filteredTables.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-20 h-20 rounded-full bg-[#171E2A] flex items-center justify-center text-4xl mb-4">
                🎮
              </div>
              <p className="text-[#F8FAFC] font-bold text-lg mb-2">
                No hay mesas disponibles ahora
              </p>
              <p className="text-[#94A3B8] text-sm max-w-xs">
                Crea tu propia mesa o espera a que otros jugadores inicien una partida
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-3 bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-[#080B12] font-black rounded-xl hover:brightness-110 transition shadow-lg shadow-[#FF8A00]/30"
              >
                Crear Mesa Nueva
              </button>
            </div>
          )}

          {!loading && filteredTables.map((table) => {
            const game = GAME_DISPLAY_NAMES[table.game_type] || { name: table.game_type, emoji: '🎮' };
            const availableSeats = table.max_players - table.current_players;
            const isJoining = joining === table.id;
            const isFull = availableSeats <= 0;

            return (
              <div
                key={table.id}
                className="bg-[#171E2A] hover:bg-[#1E2938] border border-[#1E2938] hover:border-[#FF8A00]/50 rounded-2xl p-4 transition-all group"
              >
                <div className="flex items-center gap-4">
                  {/* Emoji del juego */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#FF8A00]/20 to-[#F5B942]/20 border border-[#FF8A00]/30 flex items-center justify-center text-4xl sm:text-5xl shrink-0 group-hover:scale-110 transition">
                    {game.emoji}
                  </div>

                  {/* Info del juego */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl sm:text-2xl font-black text-[#F8FAFC] mb-1">
                      {game.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="flex items-center gap-1 text-[#94A3B8]">
                        <Users className="w-3.5 h-3.5 text-[#22C55E]" />
                        <span className="font-bold text-lg text-[#22C55E]">{table.current_players}</span>
                        <span>/</span>
                        <span className="font-bold text-lg">{table.max_players}</span>
                      </span>
                      <span className="flex items-center gap-1 text-[#F5B942]">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span className="font-black text-lg">
                          {table.entry_fee_bs === 0 ? 'GRATIS' : `${table.entry_fee_bs} Bs`}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[#94A3B8]">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-[10px]">
                          {new Date(table.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Botón Unirse */}
                  <button
                    onClick={() => !isFull && handleJoinTable(table.id)}
                    disabled={isFull || isJoining}
                    className={`shrink-0 px-5 py-3 sm:px-6 sm:py-4 rounded-2xl font-black text-base sm:text-lg transition-all flex items-center gap-2 ${
                      isFull || isJoining
                        ? 'bg-[#1E2938] text-[#64748B] cursor-not-allowed'
                        : 'bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-[#080B12] hover:brightness-110 shadow-lg shadow-[#FF8A00]/30 hover:scale-105 active:scale-95'
                    }`}
                  >
                    {isJoining ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isFull ? (
                      <>
                        <X className="w-5 h-5" />
                        <span>LLENA</span>
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-5 h-5" />
                        <span>UNIRSE</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Barra de ocupación */}
                <div className="mt-3">
                  <div className="h-2 bg-[#080B12] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#22C55E] to-[#10B981] transition-all duration-500"
                      style={{ width: `${(table.current_players / table.max_players) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[#94A3B8] mt-1 font-semibold">
                    {availableSeats > 0
                      ? `✨ ${availableSeats} ${availableSeats === 1 ? 'puesto disponible' : 'puestos disponibles'}`
                      : '❌ Mesa llena'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-[#1E2938] bg-[#080B12]/60 px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <Trophy className="w-3.5 h-3.5 text-[#F5B942]" />
            <span>90% ganador · 10% plataforma</span>
          </div>
          <button
            onClick={fetchAvailableTables}
            className="text-xs font-bold text-[#FF8A00] hover:text-[#F5B942] flex items-center gap-1 transition"
          >
            🔄 Actualizar
          </button>
        </div>
      </div>
    </div>
  );
};
