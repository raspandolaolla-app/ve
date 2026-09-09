// ==============================================================================
// RASPANDO LA OLLA — PANEL LATERAL / DRAWER DE EXPLORAR JUEGOS Y MENÚ DE USUARIO
// ==============================================================================

import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  Trophy,
  Users,
  Award,
  MessageSquare,
  Headphones,
  Shield,
  Sparkles,
  ChevronRight,
  Zap,
  BookOpen,
  User,
  Wallet,
  PlusCircle,
  ArrowUpRight,
  Settings,
  ShieldCheck,
  LogOut,
  LogIn,
  Bell,
  Gamepad2,
} from 'lucide-react';
import { SUPPORTED_GAMES_METADATA, GLOBAL_DRAWS_METADATA } from '../../utils/constants';
import { useGameAvailability } from '../../context/GameAvailabilityContext';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../context/WalletContext';
import { formatBolivares } from '../../utils/formatters';
import type { GameMetadata } from '../../types/games';

interface ExploreDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGame: (game: GameMetadata) => void;
  onNavigateTab: (tab: string) => void;
  onOpenSupport: () => void;
  onOpenRules?: (gameId?: string) => void;
  onOpenNotifications?: () => void;
  initialTab?: 'games' | 'account';
}

export const ExploreDrawer: React.FC<ExploreDrawerProps> = ({
  isOpen,
  onClose,
  onSelectGame,
  onNavigateTab,
  onOpenSupport,
  onOpenRules,
  onOpenNotifications,
  initialTab = 'games',
}) => {
  const { isGameEnabled } = useGameAvailability();
  const { user, profile, role, state, isSigningIn, openLoginModal, signOut } = useAuth();
  const { balance, isBalanceVisible, openDepositModal, openWithdrawModal } = useWallet();

  const [activeDrawerTab, setActiveDrawerTab] = useState<'games' | 'account'>(initialTab);

  // Sincronizar tab si cambia initialTab al abrir
  useEffect(() => {
    if (isOpen) {
      setActiveDrawerTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Filtrar juegos habilitados
  const enabledGames = useMemo(() => {
    return SUPPORTED_GAMES_METADATA.filter((game) => isGameEnabled(game.id));
  }, [isGameEnabled]);

  // Bloquear scroll de la ventana principal cuando el drawer está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isAuthenticated = state === 'authenticated' && user !== null;

  // Datos del perfil
  const userMetadata = user?.user_metadata || {};
  const firstName = (profile?.firstName || userMetadata.given_name || user?.email?.split('@')[0] || 'JUGADOR').toUpperCase();
  const lastName = (profile?.lastName || userMetadata.family_name || '').toUpperCase();
  const fullName = `${firstName} ${lastName}`.trim();
  const avatarUrl = profile?.avatarUrl || userMetadata.avatar_url || userMetadata.picture;

  const getGameIcon = (id: string) => {
    switch (id) {
      case 'domino_venezolano':
        return '🎲';
      case 'truco_venezolano':
        return '🃏';
      case 'bingo':
        return '🎱';
      case 'polla_venezolana':
        return '🐾';
      case 'atrapaito':
        return '🎯';
      case 'checkers':
        return '♟';
      case 'rock_paper_scissors':
        return '✊';
      case 'tic_tac_toe':
        return '⭕';
      case 'chess':
        return '♟️';
      case 'una_olla':
        return '🎴';
      default:
        return '🎮';
    }
  };

  const handleGameClick = (game: GameMetadata) => {
    onSelectGame(game);
    onClose();
  };

  const handleTabClick = (tab: string) => {
    onNavigateTab(tab);
    onClose();
  };

  const handleDeposit = () => {
    onNavigateTab('wallet');
    openDepositModal();
    onClose();
  };

  const handleWithdraw = () => {
    onNavigateTab('wallet');
    openWithdrawModal();
    onClose();
  };

  return (
    <div
      id="explore-drawer-container"
      className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop con Blur y Oscurecimiento */}
      <div
        className="fixed inset-0 bg-[#080B12]/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Panel Lateral Deslizante */}
      <div className="relative w-full max-w-sm bg-[#111722] border-l border-[#1E2938] h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-250">
        
        {/* Encabezado Principal del Drawer */}
        <div className="p-3.5 sm:p-4 border-b border-[#1E2938] flex items-center justify-between bg-[#080B12]/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF8A00] to-[#F5B942] p-0.5 flex items-center justify-center shadow-md shadow-[#FF8A00]/20">
              <span className="text-base select-none leading-none">🇻🇪</span>
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-[#F8FAFC] tracking-tight uppercase">
                EXPLORAR &amp; <span className="text-[#FF8A00]">MENÚ</span>
              </h2>
              <span className="text-[10px] text-[#94A3B8] font-medium">Raspando La Olla</span>
            </div>
          </div>

          <button
            id="close-explore-drawer-btn"
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors border border-[#1E2938] cursor-pointer"
            aria-label="Cerrar menú explorar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ==================================================================== */}
        {/* TARJETA DE PERFIL SUPERIOR (Siempre visible) */}
        {/* ==================================================================== */}
        <div className="p-3 bg-gradient-to-b from-[#171E2A]/90 to-[#111722] border-b border-[#1E2938]">
          {isAuthenticated ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={fullName}
                      className="w-11 h-11 rounded-full object-cover border-2 border-[#FF8A00] shadow-md"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-[#171E2A] border-2 border-[#FF8A00] flex items-center justify-center text-base font-black text-[#FF8A00]">
                      {firstName.charAt(0)}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#22C55E] border-2 border-[#111722]" title="En línea" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs sm:text-sm font-black text-[#F8FAFC] truncate tracking-tight">
                      {fullName}
                    </h3>
                    {role === 'ADMIN' || role === 'SUPER_ADMIN' ? (
                      <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-bold border border-red-500/30 shrink-0">
                        ADMIN
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold mt-0.5">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Verificado • KYC</span>
                  </div>
                </div>

                <button
                  onClick={() => handleTabClick('profile')}
                  className="p-1.5 rounded-lg bg-[#171E2A] hover:bg-[#1E2938] border border-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] text-xs transition-colors shrink-0"
                  title="Ver perfil completo"
                  aria-label="Ver perfil completo"
                >
                  <User className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Saldo y Acciones Rápidas */}
              <div className="p-2 rounded-xl bg-[#080B12]/80 border border-[#1E2938] flex items-center justify-between">
                <div>
                  <div className="text-[9px] uppercase font-bold text-[#94A3B8] tracking-wider">Saldo Disponible</div>
                  <div className="text-xs sm:text-sm font-mono font-black text-[#22C55E]">
                    {isBalanceVisible
                      ? formatBolivares(balance?.availableBalance ?? 0)
                      : 'Bs. ••••••'}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleDeposit}
                    className="px-2 py-1 rounded-lg bg-[#FF8A00] text-[#080B12] text-[11px] font-black hover:bg-[#FF8A00]/90 transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
                    title="Abonar fondos"
                  >
                    <PlusCircle className="w-3 h-3 stroke-[3]" />
                    <span>Abonar</span>
                  </button>
                  <button
                    onClick={handleWithdraw}
                    className="px-2 py-1 rounded-lg bg-[#171E2A] text-[#F8FAFC] border border-[#1E2938] hover:border-[#FF8A00]/50 text-[11px] font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                    title="Retirar ganancias"
                  >
                    <ArrowUpRight className="w-3 h-3 text-[#2496FF]" />
                    <span>Retirar</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-2 space-y-2">
              <div className="text-xs sm:text-sm font-bold text-[#F8FAFC]">Bienvenido a Raspando La Olla 🇻🇪</div>
              <p className="text-[11px] text-[#94A3B8]">Inicia sesión para jugar multijugador, participar en sorteos y retirar ganancias.</p>
              <button
                onClick={() => {
                  onClose();
                  openLoginModal();
                }}
                disabled={isSigningIn}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 hover:from-yellow-300 hover:via-yellow-200 text-slate-950 font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-md ring-1 ring-yellow-400/50 uppercase tracking-wider cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-slate-950" strokeWidth={3} />
                <span>{isSigningIn ? 'Ingresando...' : 'INGRESAR / INICIAR SESIÓN'}</span>
              </button>
            </div>
          )}
        </div>

        {/* ==================================================================== */}
        {/* SELECTOR DE PESTAÑAS (Juegos & Salas vs Menú de Usuario) */}
        {/* ==================================================================== */}
        <div className="px-3 pt-2.5 pb-1 bg-[#080B12]/50 border-b border-[#1E2938]">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#171E2A]/70 border border-[#1E2938]">
            <button
              onClick={() => setActiveDrawerTab('games')}
              className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeDrawerTab === 'games'
                  ? 'bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-[#1E2938]'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Juegos &amp; Salas</span>
            </button>

            <button
              onClick={() => setActiveDrawerTab('account')}
              className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeDrawerTab === 'account'
                  ? 'bg-gradient-to-r from-[#FF8A00] to-[#F5B942] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-[#1E2938]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Mi Menú</span>
            </button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* CONTENIDO SCROLLABLE SEGÚN PESTAÑA */}
        {/* ==================================================================== */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
          {activeDrawerTab === 'games' ? (
            <>
              {/* Sorteo Global Permanente (Solo si Polla Venezolana está habilitada) */}
              {isGameEnabled('polla_venezolana') && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#F5B942] flex items-center gap-1.5 px-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Sorteo Comunitario</span>
                  </div>
                  {GLOBAL_DRAWS_METADATA.map((draw) => (
                    <button
                      key={draw.id}
                      onClick={() => handleTabClick('polla')}
                      className="w-full text-left p-2.5 rounded-xl bg-gradient-to-r from-[#171E2A] to-[#1E2938] border border-[#F5B942]/30 hover:border-[#F5B942] transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#F5B942]/10 border border-[#F5B942]/30 flex items-center justify-center text-lg">
                          🐾
                        </div>
                        <div>
                          <div className="text-xs font-black text-[#F8FAFC] group-hover:text-[#F5B942] transition-colors flex items-center gap-1.5">
                            <span>{draw.name}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30 font-semibold">
                              2x Día
                            </span>
                          </div>
                          <p className="text-[10px] text-[#94A3B8] line-clamp-1">{draw.shortDescription}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F5B942] transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {/* Juegos de Mesa Multijugador */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5 px-1">
                  <Zap className="w-3 h-3 text-[#FF8A00]" />
                  <span>Mesas y Salas en Vivo ({enabledGames.length})</span>
                </div>

                <div className="grid grid-cols-1 gap-1">
                  {enabledGames.map((game) => (
                    <button
                      key={game.id}
                      id={`explore-game-${game.id}`}
                      onClick={() => handleGameClick(game)}
                      className="w-full text-left p-2 rounded-xl bg-[#171E2A] hover:bg-[#1E2938] border border-transparent hover:border-[#FF8A00]/40 transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#080B12] border border-[#1E2938] flex items-center justify-center text-base shrink-0">
                          {getGameIcon(game.id)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#F8FAFC] group-hover:text-[#FF8A00] transition-colors truncate">
                            {game.name}
                          </div>
                          <div className="text-[10px] text-[#94A3B8] flex items-center gap-2 mt-0.5">
                            <span className="text-[#22C55E] flex items-center gap-1 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                              {game.allowedModes.join(', ')}
                            </span>
                            <span>•</span>
                            <span className="text-[#F5B942]">{game.minEntryFee} - {game.maxEntryFee} Bs</span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#FF8A00] transition-colors shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Accesos Rápidos de Comunidad */}
              <div className="space-y-1 pt-2 border-t border-[#1E2938]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] px-1">
                  Comunidad &amp; Guías
                </div>

                {onOpenRules && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenRules('atrapaito');
                    }}
                    className="w-full text-left p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-300 border border-amber-500/30 transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="w-4 h-4 text-amber-400" />
                      <span>📖 Manual &amp; Reglas Oficiales</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-amber-400 group-hover:text-amber-200" />
                  </button>
                )}

                <button
                  onClick={() => handleTabClick('tables')}
                  className="w-full text-left p-2 rounded-xl bg-[#171E2A]/70 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Trophy className="w-4 h-4 text-[#F5B942]" />
                    <span>🏆 Torneos &amp; Potes en Vivo</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
                </button>
              </div>
            </>
          ) : (
            /* ==================================================================== */
            /* PESTAÑA DE MENÚ DE USUARIO */
            /* ==================================================================== */
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] px-1">
                Cuenta &amp; Finanzas
              </div>

              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => handleTabClick('profile')}
                    className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/80 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#FF8A00] border border-[#1E2938]">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-white">Mi Perfil &amp; Datos</div>
                        <div className="text-[10px] text-slate-400">Cédula, apodo y verificación</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
                  </button>

                  <button
                    onClick={() => handleTabClick('wallet')}
                    className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/80 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#22C55E] border border-[#1E2938]">
                        <Wallet className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-white">Billetera &amp; Saldo</div>
                        <div className="text-[10px] text-slate-400">Recargas y cuentas bancarias</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
                  </button>

                  <div className="grid grid-cols-2 gap-2 my-1">
                    <button
                      onClick={handleDeposit}
                      className="p-2 rounded-xl bg-[#FF8A00]/15 hover:bg-[#FF8A00]/25 border border-[#FF8A00]/30 text-xs font-bold text-[#FF8A00] transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Abonar Saldo</span>
                    </button>
                    <button
                      onClick={handleWithdraw}
                      className="p-2 rounded-xl bg-[#2496FF]/15 hover:bg-[#2496FF]/25 border border-[#2496FF]/30 text-xs font-bold text-[#2496FF] transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>Retirar Fondos</span>
                    </button>
                  </div>

                  {onOpenNotifications && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenNotifications();
                      }}
                      className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/80 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-amber-400 border border-[#1E2938]">
                          <Bell className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-white">Notificaciones</div>
                          <div className="text-[10px] text-slate-400">Alertas de partidas y balance</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
                    </button>
                  )}

                  <button
                    onClick={() => handleTabClick('profile')}
                    className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/80 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#2496FF] border border-[#1E2938]">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-white">Programa de Referidos</div>
                        <div className="text-[10px] text-slate-400">Invita amigos y gana comisiones</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
                  </button>

                  <button
                    onClick={() => handleTabClick('tables')}
                    className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/80 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#F5B942] border border-[#1E2938]">
                        <Award className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-white">Salón de la Fama &amp; Logros</div>
                        <div className="text-[10px] text-slate-400">Ranking nacional de campeones</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
                  </button>

                  <button
                    onClick={() => handleTabClick('profile')}
                    className="w-full text-left p-2.5 rounded-xl bg-[#171E2A]/80 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#94A3B8] border border-[#1E2938]">
                        <Settings className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-white">Seguridad 2FA &amp; Verificación</div>
                        <div className="text-[10px] text-slate-400">Protección de cuenta y datos</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
                  </button>

                  {role === 'ADMIN' || role === 'SUPER_ADMIN' ? (
                    <button
                      onClick={() => handleTabClick('admin')}
                      className="w-full text-left p-2.5 rounded-xl bg-red-950/30 hover:bg-red-900/40 text-xs font-medium text-red-300 border border-red-500/30 transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/30">
                          <Shield className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-red-200">Panel de Administración</div>
                          <div className="text-[10px] text-red-400/80">Gestión de mesas, recargas y retiros</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-red-400 group-hover:text-red-200" />
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  onClick={() => {
                    onClose();
                    openLoginModal();
                  }}
                  className="w-full text-left p-3 rounded-xl bg-[#171E2A] hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400 border border-yellow-500/30">
                      <LogIn className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-yellow-300">Iniciar Sesión / Registrarse</div>
                      <div className="text-[10px] text-slate-400">Accede a todas las funciones</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-yellow-400" />
                </button>
              )}

              <div className="pt-2 border-t border-[#1E2938] space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] px-1">
                  Atención &amp; Soporte
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onNavigateTab('support');
                  }}
                  className="w-full text-left p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 border border-emerald-500/30 text-xs font-bold text-white transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Headphones className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-bold text-white">Soporte &amp; Chat en Vivo</div>
                      <div className="text-[10px] text-emerald-300/80">Atención personalizada y FAQ</div>
                    </div>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-black">24/7 EN LÍNEA</span>
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onOpenSupport();
                  }}
                  className="w-full text-left p-2 rounded-xl bg-[#171E2A]/70 hover:bg-[#1E2938] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <MessageSquare className="w-4 h-4 text-[#FF8A00]" />
                    <span>💬 Ayúdanos a Mejorar / Sugerencias</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
                </button>

                {isAuthenticated && (
                  <button
                    onClick={() => {
                      signOut();
                      onClose();
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-red-950/20 hover:bg-red-900/30 border border-red-500/20 text-xs font-bold text-red-400 transition-colors flex items-center justify-between group mt-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <LogOut className="w-4 h-4 text-red-400" />
                      <span>Cerrar Sesión</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-red-400/60 group-hover:text-red-400" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pie del Drawer */}
        <div className="p-3 border-t border-[#1E2938] bg-[#080B12]/90 flex items-center justify-between text-[11px] text-[#94A3B8]">
          <span className="flex items-center gap-1.5">
            <span className="text-xl select-none leading-none">🇻🇪</span>
            <span className="font-bold text-white">Venezuela</span>
          </span>
          <span className="text-[#F5B942] font-semibold text-[10px]">Regla 90/10 • v2.6.4</span>
        </div>
      </div>
    </div>
  );
};
