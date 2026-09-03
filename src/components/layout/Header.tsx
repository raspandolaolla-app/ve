// ==============================================================================
// RASPANDO LA OLLA — CABECERA CON BOTÓN INGRESAR DESTACADO
// ==============================================================================

import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../context/WalletContext';
import { ConnectionBadge } from '../common/ConnectionBadge';
import { InstallPWAButton } from '../common/InstallPWAButton';
import { getAssetUrl } from '../../utils/assetUtils';
import { formatBolivares } from '../../utils/formatters';
import {
  LogIn,
  LogOut,
  Shield,
  Wallet,
  Grid,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  Bell,
  Plus,
} from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  hasUnreadNotifications?: boolean;
}

export function Header({
  currentTab,
  onNavigate,
  onOpenNotifications,
  onOpenProfile,
  hasUnreadNotifications = true,
}: HeaderProps) {
  const { state, user, profile, role, isSigningIn, signInWithGoogle, signOut } = useAuth();
  const { balance, isBalanceVisible, toggleBalanceVisibility, openDepositModal } = useWallet();

  const isAuthenticated = state === 'authenticated' && user !== null;
  const userAvatar = profile?.avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const displayName = (profile?.firstName && profile?.lastName
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : profile?.firstName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.given_name || user?.email?.split('@')[0] || 'Jugador');

  const formattedBalance = isBalanceVisible
    ? formatBolivares(balance?.availableBalance ?? 0)
    : 'Bs. ••••••';

  return (
    <header
      id="app-header"
      className="bg-[#080B12]/95 border-b border-[#1E2938] sticky top-0 z-40 backdrop-blur-md select-none shadow-lg"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">

          {/* SECCIÓN IZQUIERDA: LOGO + SALDO */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div
              id="brand-logo"
              onClick={() => onNavigate('home')}
              className="flex items-center gap-2 cursor-pointer group shrink-0"
              title="Raspando La Olla - Inicio"
            >
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-[#FF8A00] via-[#F5B942] to-[#FF8A00] p-0.5 shadow-lg shadow-[#FF8A00]/30 flex items-center justify-center overflow-hidden">
                <div className="w-full h-full bg-[#080B12] rounded-[10px] flex items-center justify-center group-hover:bg-[#111722] transition-colors p-0.5">
                  <img
                    src={getAssetUrl('logo.svg')}
                    alt="Logo Raspando La Olla"
                    className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                  />
                </div>
              </div>
              <div className="hidden xs:flex flex-col justify-center">
                <div className="flex items-center gap-2 leading-none">
                  <span className="font-black tracking-tight text-sm sm:text-base text-[#F8FAFC] uppercase">
                    Raspando <span className="text-[#FF8A00]">La Olla</span>
                  </span>
                  <span className="text-3xl sm:text-[34px] leading-none select-none inline-flex items-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transform hover:scale-110 transition-transform" title="Venezuela">
                    🇻🇪
                  </span>
                </div>
                <span className="hidden sm:block text-[9px] text-[#94A3B8] font-medium tracking-wider uppercase mt-0.5">
                  Mesas & Sorteos en Vivo
                </span>
              </div>
            </div>

            <div className="xs:hidden flex items-center text-3xl select-none drop-shadow-md" title="Venezuela">
              🇻🇪
            </div>

            {isAuthenticated && (
              <div
                id="header-balance-pill"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-[#111722] border border-[#1E2938] hover:border-[#FF8A00]/40 transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider hidden sm:block">
                    Saldo Disponible
                  </span>
                  <span className="text-xs sm:text-sm font-black font-mono text-[#22C55E] tracking-tight">
                    {formattedBalance}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBalanceVisibility();
                  }}
                  className="p-1 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors ml-0.5"
                  title={isBalanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
                >
                  {isBalanceVisible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-[#FF8A00]" />
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate('wallet');
                    openDepositModal();
                  }}
                  className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FF8A00] hover:bg-[#FF8A00]/90 text-[#080B12] text-[11px] font-black transition-colors ml-1"
                  title="Abonar fondos"
                >
                  <Plus className="w-3 h-3 stroke-[3]" />
                  <span>Abonar</span>
                </button>
              </div>
            )}
          </div>

          {/* SECCIÓN CENTRAL: NAVEGACIÓN DESKTOP */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              id="nav-home"
              onClick={() => onNavigate('home')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                currentTab === 'home'
                  ? 'bg-[#FF8A00]/10 text-[#FF8A00] border border-[#FF8A00]/30'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111722]'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Lobby</span>
            </button>
            <button
              id="nav-polla"
              onClick={() => onNavigate('polla')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                currentTab === 'polla'
                  ? 'bg-[#FF8A00]/10 text-[#FF8A00] border border-[#FF8A00]/30'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111722]'
              }`}
            >
              <span>🐾</span>
              <span>Polla Venezolana</span>
            </button>
            <button
              id="nav-trancaito"
              onClick={() => onNavigate('tables')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                currentTab === 'tables'
                  ? 'bg-[#FF8A00]/10 text-[#FF8A00] border border-[#FF8A00]/30'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111722]'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-[#F5B942]" />
              <span>Mesas & Salas</span>
            </button>
            <button
              id="nav-wallet"
              onClick={() => onNavigate('wallet')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                currentTab === 'wallet'
                  ? 'bg-[#FF8A00]/10 text-[#FF8A00] border border-[#FF8A00]/30'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111722]'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Billetera</span>
            </button>
            {role === 'ADMIN' || role === 'SUPER_ADMIN' ? (
              <button
                id="nav-admin"
                onClick={() => onNavigate('admin')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  currentTab === 'admin'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                    : 'text-[#94A3B8] hover:text-red-300 hover:bg-[#111722]'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-red-400" />
                <span>Admin</span>
              </button>
            ) : null}
          </nav>

          {/* SECCIÓN DERECHA: NOTIFICACIONES + INGRESAR/PERFIL */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden sm:block">
              <InstallPWAButton variant="header" />
            </div>
            <div className="hidden md:block">
              <ConnectionBadge />
            </div>

            <button
              onClick={onOpenNotifications}
              className="relative p-2 rounded-xl bg-[#111722] hover:bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2938] transition-colors"
              title="Notificaciones"
            >
              <Bell className="w-4 h-4" />
              {hasUnreadNotifications && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF8A00] animate-pulse" />
              )}
            </button>

            {state === 'loading' ? (
              <div className="w-10 h-10 rounded-full bg-[#111722] animate-pulse" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-1.5">
                <button
                  id="header-user-profile-btn"
                  onClick={onOpenProfile}
                  className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-[#111722] border border-[#1E2938] hover:border-[#FF8A00]/50 transition-all text-xs text-[#F8FAFC]"
                  title="Ver perfil de usuario"
                >
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={displayName}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border-2 border-[#FF8A00] shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#171E2A] border-2 border-[#FF8A00] flex items-center justify-center text-xs font-bold text-[#FF8A00] shrink-0">
                      {displayName.charAt(0)}
                    </div>
                  )}
                  <span className="hidden md:block font-bold max-w-[120px] truncate text-[11px]">
                    {displayName}
                  </span>
                </button>
                <button
                  id="header-signout-btn"
                  onClick={() => signOut()}
                  className="p-2 rounded-xl bg-[#111722] hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-[#1E2938] hover:border-red-500/30 transition-colors"
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              // BOTÓN INGRESAR GRANDE Y DESTACADO
              <button
                id="header-signin-google-btn"
                onClick={signInWithGoogle}
                disabled={isSigningIn}
                className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#FF8A00] via-[#F5B942] to-[#FF8A00] hover:brightness-110 text-[#080B12] font-black text-xs sm:text-sm transition-all flex items-center gap-2 shadow-xl shadow-[#FF8A00]/40 hover:scale-105 active:scale-95 animate-pulse-glow"
              >
                {isSigningIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" strokeWidth={3} />
                )}
                <span className="tracking-wide hidden sm:inline">Continuar con Google</span>
                <span className="tracking-wide sm:hidden">INGRESAR</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}