// ==============================================================================
// RASPANDO LA OLLA — BARRA DE NAVEGACIÓN INFERIOR FIJA (MOBILE FIRST)
// ==============================================================================

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home,
  Headphones,
  Play,
  ArrowUpRight,
  Menu,
  Wallet,
  X,
  Zap,
  Users,
  Trophy,
  DollarSign,
} from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { useAuth } from '../../hooks/useAuth';
import { TableRepository } from '../../services/repositories/TableRepository';
import { getSupabaseClient } from '../../lib/supabase/client';
import { formatBolivares } from '../../utils/formatters';

interface BottomNavigationProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenExplore: () => void;
  onOpenSupport: () => void;
  onOpenGiraLaOlla?: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  onNavigate,
  onOpenExplore,
  onOpenSupport,
  onOpenGiraLaOlla,
}) => {
  const { openDepositModal, openWithdrawModal } = useWallet();
  const { user } = useAuth();
  const [showQuickMatchModal, setShowQuickMatchModal] = useState(false);
  const [quickMatchAmount, setQuickMatchAmount] = useState<number>(25);
  const [quickMatchGame, setQuickMatchGame] = useState<string>('bingo');
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [quickMatchError, setQuickMatchError] = useState<string | null>(null);

  const handleDepositClick = () => {
    onNavigate('wallet');
    openDepositModal();
  };

  const handleWithdrawClick = () => {
    onNavigate('wallet');
    openWithdrawModal();
  };

  // ✅ NUEVO: Abrir modal de Partida Rápida
  const handleQuickMatchClick = () => {
    if (!user) {
      alert('Debes iniciar sesión para crear una partida rápida');
      return;
    }
    setQuickMatchError(null);
    setShowQuickMatchModal(true);
  };

  // ✅ NUEVO: Crear partida rápida conectada a Supabase
  const handleCreateQuickMatch = async () => {
    if (!user || quickMatchAmount < 10) {
      setQuickMatchError('El monto mínimo por cartón es 10 Bs');
      return;
    }

    setCreatingMatch(true);
    setQuickMatchError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setQuickMatchError('Servicio no disponible');
        setCreatingMatch(false);
        return;
      }

      // Crear mesa rápida con el monto como COSTO POR CARTÓN
      const { data, error } = await supabase.rpc('create_quick_match_table', {
        p_host_user_id: user.id,
        p_game_type: quickMatchGame,
        p_entry_fee: quickMatchAmount, // Este es el costo por cartón
        p_max_players: quickMatchGame === 'bingo' ? 10 : 2,
        p_is_private: false,
      });

      if (error || !data?.success) {
        const errorMsg = data?.error || error?.message || 'Error al crear partida';
        setQuickMatchError(errorMsg);
        setCreatingMatch(false);
        return;
      }

      console.log('[QUICK_MATCH_CREATED]', {
        tableId: data.table_id,
        gameType: quickMatchGame,
        cardPrice: quickMatchAmount,
        hostUserId: user.id,
      });

      // Navegar a la mesa recién creada
      setShowQuickMatchModal(false);
      onNavigate('tables');
      
      // Pequeño delay para que la tabla se cargue
      setTimeout(() => {
        window.location.href = `/ve/table/${data.table_id}`;
      }, 500);

    } catch (err: any) {
      console.error('[QUICK_MATCH_ERROR]', err);
      setQuickMatchError('Error al crear la partida. Intenta nuevamente.');
    } finally {
      setCreatingMatch(false);
    }
  };

  const presetAmounts = [10, 25, 50, 100, 250];

  return (
    <>
      {/* Botón Flotante Opcional 'Gira la Olla' encima de la barra inferior en móvil */}
      {onOpenGiraLaOlla && (
        <div className="fixed bottom-20 right-4 z-30 sm:hidden">
          <button
            id="floating-gira-olla-btn"
            onClick={onOpenGiraLaOlla}
            className="w-13 h-13 rounded-full bg-gradient-to-tr from-[#FF8A00] via-[#F5B942] to-[#FF8A00] p-0.5 shadow-xl shadow-[#FF8A00]/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer group"
            aria-label="Gira la Olla Bonus"
            title="Gira la Olla"
          >
            <div className="w-full h-full bg-[#111722] rounded-full flex items-center justify-center group-hover:bg-[#171E2A] transition-colors">
              <span className="text-xl select-none animate-spin-slow">🌀</span>
            </div>
          </button>
        </div>
      )}

      {/* Barra de Navegación Fija */}
      <nav
        id="app-bottom-navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#111722]/95 backdrop-blur-lg border-t border-[#1E2938] pb-safe select-none"
        role="navigation"
        aria-label="Navegación principal inferior"
      >
        <div className="max-w-md mx-auto px-2 h-16 flex items-center justify-around">
          {/* 1. Inicio */}
          <button
            id="bottom-nav-home"
            onClick={() => onNavigate('home')}
            className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 transition-all relative ${
              currentTab === 'home'
                ? 'text-[#FF8A00] font-bold'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            {currentTab === 'home' && (
              <span className="absolute top-0 w-8 h-1 rounded-full bg-[#FF8A00] shadow-sm shadow-[#FF8A00]/50" />
            )}
            <Home className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight">Inicio</span>
          </button>

          {/* 2. Soporte */}
          <button
            id="bottom-nav-support"
            onClick={onOpenSupport}
            className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 text-[#94A3B8] hover:text-[#F8FAFC] transition-all"
          >
            <Headphones className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight">Soporte</span>
          </button>

          {/* 3. ✅ MODIFICADO: Jugar (antes Abonar) */}
          <button
            id="bottom-nav-quick-match"
            onClick={handleQuickMatchClick}
            className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 group"
          >
            <div className="w-10 h-10 -mt-3 rounded-full bg-gradient-to-tr from-[#FF8A00] to-[#F5B942] flex items-center justify-center text-[#080B12] shadow-lg shadow-[#FF8A00]/30 group-hover:scale-105 active:scale-95 transition-all">
              <Play className="w-5 h-5 fill-current" />
            </div>
            <span className="text-[11px] font-bold text-[#FF8A00] mt-0.5 tracking-tight">
              Jugar
            </span>
          </button>

          {/* 4. Retirar */}
          <button
            id="bottom-nav-withdraw"
            onClick={handleWithdrawClick}
            className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 transition-all relative ${
              currentTab === 'wallet'
                ? 'text-[#2496FF] font-bold'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            {currentTab === 'wallet' && (
              <span className="absolute top-0 w-8 h-1 rounded-full bg-[#2496FF] shadow-sm shadow-[#2496FF]/50" />
            )}
            <Wallet className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight">Retirar</span>
          </button>

          {/* 5. Explorar */}
          <button
            id="bottom-nav-explore"
            onClick={onOpenExplore}
            className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 text-[#94A3B8] hover:text-[#FF8A00] transition-all"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight">Explorar</span>
          </button>
        </div>
      </nav>

      {/* ✅ NUEVO: Modal de Partida Rápida */}
      <AnimatePresence>
        {showQuickMatchModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
            onClick={() => !creatingMatch && setShowQuickMatchModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md bg-gradient-to-b from-[#171E2A] to-[#111722] border-2 border-[#FF8A00]/40 rounded-3xl shadow-2xl shadow-[#FF8A00]/20 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header del Modal */}
              <div className="relative bg-gradient-to-r from-[#FF8A00] to-[#F5B942] p-5 text-center">
                <button
                  onClick={() => setShowQuickMatchModal(false)}
                  disabled={creatingMatch}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Zap className="w-8 h-8 text-white drop-shadow-lg" />
                  <h2 className="text-3xl font-black text-white uppercase tracking-wider drop-shadow-lg">
                    Partida Rápida
                  </h2>
                </div>
                <p className="text-white/90 text-sm font-semibold">
                  Crea una mesa al instante y comienza a jugar
                </p>
              </div>

              {/* Contenido del Formulario */}
              <div className="p-5 space-y-5">
                {/* Selección de Juego */}
                <div>
                  <label className="block text-sm font-bold text-slate-200 mb-2 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-[#FF8A00]" />
                    Tipo de Juego
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'bingo', label: 'Bingo', emoji: '🎱' },
                      { id: 'domino_venezolano', label: 'Dominó', emoji: '🁣' },
                      { id: 'truco_venezolano', label: 'Truco', emoji: '🃏' },
                    ].map((game) => (
                      <button
                        key={game.id}
                        onClick={() => setQuickMatchGame(game.id)}
                        disabled={creatingMatch}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          quickMatchGame === game.id
                            ? 'bg-[#FF8A00]/20 border-[#FF8A00] text-white shadow-lg shadow-[#FF8A00]/30'
                            : 'bg-[#1E2938] border-[#2A3544] text-slate-400 hover:border-[#FF8A00]/50'
                        }`}
                      >
                        <div className="text-2xl mb-1">{game.emoji}</div>
                        <div className="text-xs font-bold uppercase tracking-wider">
                          {game.label}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ✅ Selección de Monto por Cartón (MEJORADO) */}
                <div>
                  <label className="block text-base font-black text-slate-100 mb-3 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-[#FF8A00]" />
                    Costo por Cartón
                    <span className="text-xs text-slate-400 font-normal">(Bs)</span>
                  </label>
                  
                  {/* Botones de montos predefinidos */}
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {presetAmounts.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setQuickMatchAmount(amount)}
                        disabled={creatingMatch}
                        className={`py-3 rounded-xl font-black text-sm transition-all ${
                          quickMatchAmount === amount
                            ? 'bg-gradient-to-tr from-[#FF8A00] to-[#F5B942] text-[#080B12] shadow-lg shadow-[#FF8A00]/40 scale-105'
                            : 'bg-[#1E2938] border border-[#2A3544] text-slate-300 hover:border-[#FF8A00]/50'
                        }`}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>

                  {/* Input personalizado */}
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#FF8A00]" />
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      step={5}
                      value={quickMatchAmount}
                      onChange={(e) => setQuickMatchAmount(Number(e.target.value))}
                      disabled={creatingMatch}
                      className="w-full pl-12 pr-4 py-4 bg-[#0B0F17] border-2 border-[#2A3544] rounded-xl text-2xl font-black text-center text-white focus:outline-none focus:border-[#FF8A00] transition-colors"
                      placeholder="25"
                    />
                  </div>

                  <p className="text-xs text-slate-400 mt-2 text-center">
                    💡 Cada cartón costará <strong className="text-[#FF8A00]">{formatBolivares(quickMatchAmount)}</strong>
                  </p>
                </div>

                {/* Info de la mesa */}
                <div className="bg-[#0B0F17] border border-[#2A3544] rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      Jugadores máximos:
                    </span>
                    <span className="font-bold text-slate-200">
                      {quickMatchGame === 'bingo' ? '10' : '2'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Trophy className="w-4 h-4" />
                      Premio al ganador:
                    </span>
                    <span className="font-bold text-emerald-400">90%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4" />
                      Comisión plataforma:
                    </span>
                    <span className="font-bold text-slate-300">10%</span>
                  </div>
                </div>

                {/* Error */}
                {quickMatchError && (
                  <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-sm text-red-300 flex items-start gap-2">
                    <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{quickMatchError}</span>
                  </div>
                )}

                {/* Botón de Crear */}
                <button
                  onClick={handleCreateQuickMatch}
                  disabled={creatingMatch || quickMatchAmount < 10}
                  className="w-full py-4 rounded-xl bg-gradient-to-tr from-[#FF8A00] to-[#F5B942] text-[#080B12] font-black text-base uppercase tracking-wider shadow-lg shadow-[#FF8A00]/40 hover:shadow-xl hover:shadow-[#FF8A00]/50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creatingMatch ? (
                    <>
                      <div className="w-5 h-5 border-2 border-[#080B12] border-t-transparent rounded-full animate-spin" />
                      <span>Creando mesa...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      <span>Crear Mesa y Jugar</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
