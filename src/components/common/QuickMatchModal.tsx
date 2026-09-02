// ==============================================================================
// RASPANDO LA OLLA — MODAL DE PARTIDA RÁPIDA (FLUJO 3 PASOS)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  X, Zap, Users, Banknote, ArrowLeft, Loader2,
  Clock, Trophy, Sparkles, ChevronRight
} from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../../hooks/useAuth';
import { useAudio } from '../../hooks/useAudio';

interface QuickMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTable?: (tableId: string) => void;
}

interface AvailableTable {
  id: string;
  game_type: string;
  entry_fee_bs: number;
  max_players: number;
  current_players: number;
  is_private: boolean;
  created_at: string;
}

type Step = 'SELECT_GAME' | 'SELECT_AMOUNT' | 'SELECT_TABLE';

// Catálogo completo de 10 juegos
const GAMES_CATALOG = [
  { id: 'tic_tac_toe', name: 'La Vieja', emoji: '❌⭕', shortName: '3 en Raya' },
  { id: 'rock_paper_scissors', name: 'Piedra Papel Tijera', emoji: '✊', shortName: 'PPT' },
  { id: 'checkers', name: 'Damas', emoji: '♟️', shortName: 'Damas' },
  { id: 'domino_venezolano', name: 'Dominó Venezolano', emoji: '🁣', shortName: 'Dominó' },
  { id: 'truco_venezolano', name: 'Truco', emoji: '🃏', shortName: 'Truco' },
  { id: 'bingo', name: 'Bingo', emoji: '🎱', shortName: 'Bingo' },
  { id: 'polla_venezolana', name: 'Polla Venezolana', emoji: '🐾', shortName: 'Polla' },
  { id: 'atrapaito', name: 'Atrapaíto', emoji: '🎲', shortName: 'Parchís' },
  { id: 'una_olla', name: 'Una-Olla', emoji: '🃏', shortName: 'Cartas' },
  { id: 'chess', name: 'Ajedrez', emoji: '♚', shortName: 'Ajedrez' },
];

// Montos de entrada disponibles (Moneda oficial: Bs)
const ENTRY_AMOUNTS = [
  { value: 25, label: '25 Bs', color: 'emerald' },
  { value: 50, label: '50 Bs', color: 'cyan' },
  { value: 100, label: '100 Bs', color: 'blue' },
  { value: 250, label: '250 Bs', color: 'indigo' },
  { value: 500, label: '500 Bs', color: 'purple' },
  { value: 1000, label: '1.000 Bs', color: 'pink' },
  { value: 2500, label: '2.500 Bs', color: 'rose' },
  { value: 5000, label: '5.000 Bs', color: 'red' },
];

export const QuickMatchModal: React.FC<QuickMatchModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTable,
}) => {
  const { user } = useAuth();
  const { playSound } = useAudio();
  const [currentStep, setCurrentStep] = useState<Step>('SELECT_GAME');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [tables, setTables] = useState<AvailableTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [joiningTableId, setJoiningTableId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset al abrir/cerrar
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('SELECT_GAME');
      setSelectedGame(null);
      setSelectedAmount(null);
      setTables([]);
      setError(null);
    }
  }, [isOpen]);

  // Cargar mesas filtradas cuando se elige juego + monto
  useEffect(() => {
    if (currentStep === 'SELECT_TABLE' && selectedGame && selectedAmount !== null) {
      fetchFilteredTables();
    }
  }, [currentStep, selectedGame, selectedAmount]);

  const fetchFilteredTables = async () => {
    setLoadingTables(true);
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Sin conexión con el servidor');
      setLoadingTables(false);
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
        .eq('game_type', selectedGame)
        .eq('entry_fee_bs', selectedAmount)
        .order('created_at', { ascending: false })
        .limit(30);

      if (fetchError) throw fetchError;

      const mapped = (data || []).map((t: any) => ({
        id: t.id,
        game_type: t.game_type,
        entry_fee_bs: Number(t.entry_fee_bs || 0),
        max_players: t.max_players,
        current_players: t.game_table_players?.length || 0,
        is_private: t.is_private,
        created_at: t.created_at,
      }));

      setTables(mapped);
    } catch (err: any) {
      console.error('[QuickMatch] Error cargando mesas:', err);
      setError('No se pudieron cargar las mesas. Intenta de nuevo.');
    } finally {
      setLoadingTables(false);
    }
  };

  const handleJoinTable = async (tableId: string) => {
    if (!user) {
      setError('Debes iniciar sesión para unirte');
      return;
    }
    setJoiningTableId(tableId);
    setError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Sin conexión');
      setJoiningTableId(null);
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
        setJoiningTableId(null);
        return;
      }
      try { playSound('match'); } catch {}
      if (onNavigateToTable) {
        onNavigateToTable(tableId);
      }
      onClose();
      // Forzar navegación a la vista de mesas vía evento personalizado
      window.location.hash = '';
      setTimeout(() => {
        const evt = new CustomEvent('quick-match-joined', { detail: { tableId } });
        window.dispatchEvent(evt);
      }, 200);
    } catch (err: any) {
      setError('Error al unirse: ' + (err?.message || String(err)));
      setJoiningTableId(null);
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStep === 'SELECT_AMOUNT') {
      setCurrentStep('SELECT_GAME');
      setSelectedGame(null);
    } else if (currentStep === 'SELECT_TABLE') {
      setCurrentStep('SELECT_AMOUNT');
      setTables([]);
    }
  };

  if (!isOpen) return null;

  const selectedGameInfo = GAMES_CATALOG.find(g => g.id === selectedGame);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#080B12]/95 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl bg-gradient-to-br from-[#111722] to-[#080B12] border border-[#FF8A00]/30 rounded-3xl shadow-2xl shadow-[#FF8A00]/20 overflow-hidden max-h-[92vh] flex flex-col">
        
        {/* HEADER FIJO */}
        <div className="bg-gradient-to-r from-[#FF8A00]/20 via-[#F5B942]/20 to-[#FF8A00]/20 border-b border-[#FF8A00]/30 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {currentStep !== 'SELECT_GAME' && (
              <button
                onClick={handleBack}
                className="p-2 rounded-xl hover:bg-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] transition"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF8A00] to-[#F5B942] flex items-center justify-center text-2xl shadow-lg shadow-[#FF8A00]/30">
              ⚡
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[#F8FAFC] tracking-tight flex items-center gap-2">
                PARTIDA RÁPIDA
              </h2>
              <p className="text-[11px] text-[#94A3B8] font-semibold uppercase tracking-wider">
                {currentStep === 'SELECT_GAME' && 'Paso 1 · Elige tu juego'}
                {currentStep === 'SELECT_AMOUNT' && `Paso 2 · Monto para ${selectedGameInfo?.shortName || ''}`}
                {currentStep === 'SELECT_TABLE' && 'Paso 3 · Mesas disponibles'}
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

        {/* PROGRESS BAR */}
        <div className="px-5 py-2 bg-[#080B12]/60 border-b border-[#1E2938] shrink-0">
          <div className="flex items-center gap-2">
            <div className={`flex-1 h-1.5 rounded-full ${currentStep === 'SELECT_GAME' || currentStep === 'SELECT_AMOUNT' || currentStep === 'SELECT_TABLE' ? 'bg-[#FF8A00]' : 'bg-[#1E2938]'}`} />
            <div className={`flex-1 h-1.5 rounded-full ${currentStep === 'SELECT_AMOUNT' || currentStep === 'SELECT_TABLE' ? 'bg-[#FF8A00]' : 'bg-[#1E2938]'}`} />
            <div className={`flex-1 h-1.5 rounded-full ${currentStep === 'SELECT_TABLE' ? 'bg-[#FF8A00]' : 'bg-[#1E2938]'}`} />
          </div>
        </div>

        {/* CONTENIDO DINÁMICO */}
        <div className="flex-1 overflow-y-auto p-5">
          
          {/* ========== PASO 1: ELEGIR JUEGO ========== */}
          {currentStep === 'SELECT_GAME' && (
            <div className="space-y-3">
              <p className="text-sm text-[#94A3B8] text-center mb-4">
                Selecciona el juego que quieres jugar
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {GAMES_CATALOG.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => {
                      setSelectedGame(game.id);
                      setCurrentStep('SELECT_AMOUNT');
                    }}
                    className="group relative bg-[#171E2A] hover:bg-[#1E2938] border border-[#1E2938] hover:border-[#FF8A00]/50 rounded-2xl p-4 transition-all active:scale-95 text-left"
                  >
                    <div className="text-5xl mb-2 group-hover:scale-110 transition-transform">
                      {game.emoji}
                    </div>
                    <h3 className="text-sm font-black text-[#F8FAFC] leading-tight">
                      {game.name}
                    </h3>
                    <p className="text-[10px] text-[#94A3B8] mt-0.5">
                      {game.shortName}
                    </p>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="w-4 h-4 text-[#FF8A00]" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ========== PASO 2: ELEGIR MONTO ========== */}
          {currentStep === 'SELECT_AMOUNT' && selectedGame && (
            <div className="space-y-4">
              <div className="bg-[#171E2A] border border-[#FF8A00]/30 rounded-2xl p-4 flex items-center gap-3">
                <div className="text-4xl">{selectedGameInfo?.emoji}</div>
                <div>
                  <p className="text-xs text-[#94A3B8] uppercase tracking-wider">Juego seleccionado</p>
                  <p className="text-lg font-black text-[#F8FAFC]">{selectedGameInfo?.name}</p>
                </div>
              </div>

              <p className="text-sm text-[#94A3B8] text-center">
                ¿Con cuánto quieres entrar?
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ENTRY_AMOUNTS.map((amount) => (
                  <button
                    key={amount.value}
                    onClick={() => {
                      setSelectedAmount(amount.value);
                      setCurrentStep('SELECT_TABLE');
                    }}
                    className="group relative bg-[#171E2A] hover:bg-[#1E2938] border-2 border-[#1E2938] hover:border-[#FF8A00] rounded-2xl p-5 transition-all active:scale-95"
                  >
                    <Banknote className="w-5 h-5 text-[#F5B942] mx-auto mb-2 group-hover:scale-110 transition" />
                    <p className="text-xl sm:text-2xl font-black text-[#F8FAFC]">
                      {amount.label}
                    </p>
                    {amount.value === 25 && (
                      <span className="inline-block mt-2 text-[9px] bg-[#22C55E] text-[#080B12] font-black px-2 py-0.5 rounded-full uppercase">
                        Entrada mínima
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center">
                <p className="text-[11px] text-amber-200 flex items-center justify-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" />
                  <span className="font-semibold">90% del pozo para el ganador · 10% plataforma</span>
                </p>
              </div>
            </div>
          )}

          {/* ========== PASO 3: MOSTRAR MESAS ========== */}
          {currentStep === 'SELECT_TABLE' && selectedGame && selectedAmount !== null && (
            <div className="space-y-3">
              {/* Resumen */}
              <div className="bg-[#171E2A] border border-[#FF8A00]/30 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{selectedGameInfo?.emoji}</div>
                  <div>
                    <p className="text-sm font-black text-[#F8FAFC]">{selectedGameInfo?.name}</p>
                    <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider">
                      Entrada: <span className="text-[#F5B942] font-bold">{`${selectedAmount} Bs`}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchFilteredTables}
                  className="text-[11px] font-bold text-[#FF8A00] hover:text-[#F5B942] flex items-center gap-1 transition"
                >
                  🔄 Actualizar
                </button>
              </div>

              {/* Loading */}
              {loadingTables && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-12 h-12 text-[#FF8A00] animate-spin mb-3" />
                  <p className="text-[#F8FAFC] font-bold">Buscando mesas...</p>
                </div>
              )}

              {/* Error */}
              {!loadingTables && error && (
                <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 text-center">
                  <p className="text-red-300 font-bold mb-2">⚠️ {error}</p>
                  <button
                    onClick={fetchFilteredTables}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-sm font-bold text-red-200 transition"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {/* Sin mesas */}
              {!loadingTables && !error && tables.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="text-6xl mb-4">🎮</div>
                  <p className="text-[#F8FAFC] font-bold text-lg mb-2">
                    No hay mesas con entrada de {selectedAmount} Bs
                  </p>
                  <p className="text-[#94A3B8] text-sm max-w-xs mb-4">
                    Prueba con otro monto o crea tu propia mesa
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleBack}
                      className="px-4 py-2 bg-[#1E2938] hover:bg-[#171E2A] text-[#F8FAFC] rounded-xl text-sm font-bold transition"
                    >
                      Cambiar monto
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de mesas */}
              {!loadingTables && tables.map((table) => {
                const availableSeats = table.max_players - table.current_players;
                const isFull = availableSeats <= 0;
                const isJoining = joiningTableId === table.id;

                return (
                  <div
                    key={table.id}
                    className="bg-[#171E2A] hover:bg-[#1E2938] border border-[#1E2938] hover:border-[#FF8A00]/50 rounded-2xl p-4 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-[#22C55E]" />
                          <span className="text-sm font-bold text-[#F8FAFC]">
                            {table.current_players} / {table.max_players} jugadores
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            Creada hace {Math.floor((Date.now() - new Date(table.created_at).getTime()) / 60000)} min
                          </span>
                        </div>
                        {/* Barra de ocupación */}
                        <div className="mt-2 h-2 bg-[#080B12] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#22C55E] to-[#10B981] transition-all"
                            style={{ width: `${(table.current_players / table.max_players) * 100}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-[#94A3B8] mt-1 font-semibold">
                          {isFull ? '❌ Mesa llena' : `✨ ${availableSeats} puesto${availableSeats > 1 ? 's' : ''} disponible${availableSeats > 1 ? 's' : ''}`}
                        </p>
                      </div>

                      <button
                        onClick={() => !isFull && handleJoinTable(table.id)}
                        disabled={isFull || isJoining}
                        className={`shrink-0 px-6 py-4 rounded-2xl font-black text-base transition-all flex items-center gap-2 ${
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
                            <Zap className="w-5 h-5" />
                            <span className="text-lg">UNIRSE</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER FIJO */}
        <div className="border-t border-[#1E2938] bg-[#080B12]/80 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-[#94A3B8]">
            <Sparkles className="w-3.5 h-3.5 text-[#F5B942]" />
            <span>Juego Responsable · +18</span>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] font-bold text-[#94A3B8] hover:text-[#F8FAFC] transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
