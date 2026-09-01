// ==============================================================================
// RASPANDO LA OLLA — CABECERA PRINCIPAL RESPONSIVE (MOBILE-FIRST)
// ==============================================================================

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../context/WalletContext';
import { ConnectionBadge } from '../common/ConnectionBadge';
import { InstallPWAButton } from '../common/InstallPWAButton';
import { getAssetUrl } from '../../utils/assetUtils';
import { formatBolivares } from '../../utils/formatters';
import { useAudio } from '../../hooks/useAudio';
import {
  LogIn,
  User,
  Shield,
  Wallet,
  Grid,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  Bell,
  Sparkles,
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
  const { state, user, profile, role, isSigningIn, signInWithGoogle } = useAuth();
  const { balance, isBalanceVisible, toggleBalanceVisibility, openDepositModal } = useWallet();
  const { playSound } = useAudio();

  const isAuthenticated = state === 'authenticated' && user !== null;
  const userAvatar = profile?.avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const userFirstName = (profile?.firstName || user?.user_metadata?.given_name || user?.email?.split('@')[0] || 'Jugador').toUpperCase();

  const formattedBalance = isBalanceVisible
    ? formatBolivares(balance?.availableBalance ?? 0)
    : 'Bs. ••••••';

  const safePlayClick = () => {
    try { playSound('click'); } catch (e) {}
  };

  const handleNavigate = (tab: string) => {
    safePlayClick();
    onNavigate(tab);
  };

  return (
    <header
      id="app-header"
      className="bg-gradient-to-r from-[#080B12]/95 via-[#111722]/95 to-[#080B12]/95 border-b border-[#1E2938] sticky top-0 z-40 backdrop-blur-xl select-none shadow-lg"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
          {/* ========================================================= */}
          {/* SECCIÓN IZQUIERDA: LOGO + BANDERA VENEZUELA + SALDO       */}
          {/* ========================================================= */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Logo & Marca */}
            <div
              id="brand-logo"
              onClick={() => handleNavigate('home')}
              className="flex items-center gap-2 cursor-pointer group shrink-0"
              title="Raspando La Olla - Inicio"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-[#FF8A00] via-[#F5B942] to-[#FF8A00] p-0.5 shadow-lg shadow-[#FF8A00]/30 flex items-center justify-center overflow-hidden animate-pulse-glow">
                <div className="w-full h-full bg-[#080B12] rounded-[10px] flex items-center justify-center group-hover:bg-[#111722] transition-colors p-0.5">
                  <img
                    src={getAssetUrl('logo.svg')}
                    alt="Logo Raspando La Olla"
                    className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                  />
                </div>
              </div>
              <div className="hidden xs:flex flex-col">
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="font-black tracking-tight text-sm sm:text-base text-[#F8FAFC] uppercase">
                    Raspando <span className="text-gradient-orange">La Olla</span>
                  </span>
                  <span className="text-xs select-none" title="Venezuela">🇻🇪</span>
                </div>
                <span className="hidden sm:block text-[9px] text-[#94A3B8] font-medium tracking-wider uppercase mt-0.5">
                  Mesas & Sorteos en Vivo
                </span>
              </div>
            </div>

            {/* Bandera Venezuela en móvil si no cabe el texto */}
            <div className="xs:hidden flex items-center text-sm" title="Venezuela">
              🇻🇪
            </div>

            {/* Pastilla de Saldo (Mobile & Desktop) */}
            {isAuthenticated && (
              <div
                id="header-balance-pill"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-gradient-to-r from-[#111722] to-[#171E2A] border border-[#1E2938] hover:border-[#FF8A00]/40 transition-all shadow-md"
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
                  id="header-toggle-balance-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    safePlayClick();
                    toggleBalanceVisibility();
                  }}
                  className="p-1 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors ml-0.5"
                  title={isBalanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
                  aria-label={isBalanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
                >
                  {isBalanceVisible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-[#FF8A00]" />
                  )}
                </button>
                <button
                  id="header-quick-deposit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    safePlayClick();
                    onNavigate('wallet');
                    openDepositModal();
                  }}
                  className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gradient-to-r from-[#FF8A00] to-[#F5B942] hover:brightness-110 text-[#080B12] text-[11px] font-black transition-all ml-1 shadow-md"
                  title="Abonar fondos"
                >
                  <Plus className="w-3 h-3 stroke-[3]" />
                  <span>Abonar</span>
                </button>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* SECCIÓN CENTRAL: NAVEGACIÓN DESKTOP                       */}
          {/* ========================================================= */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              id="nav-home"
              onClick={() => handleNavigate('home')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                currentTab === 'home'
                  ? 'bg-gradient-to-r from-[#FF8A00]/10 to-[#F5B942]/10 text-[#FF8A00] border border-[#FF8A00]/30 shadow-md shadow-[#FF8A00]/20'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111722]'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Lobby</span>
            </button>
            <button
              id="nav-polla"
              onClick={() => handleNavigate('polla')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                currentTab === 'polla'
                  ? 'bg-gradient-to-r from-[#FF8A00]/10 to-[#F5B942]/10 text-[#FF8A00] border border-[#FF8A00]/30 shadow-md shadow-[#FF8A00]/20'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111722]'
              }`}
            >
              <span>🐾</span>
              <span>Polla Venezolana</span>
            </button>
            <button
              id="nav-trancaito"
              onClick={() => handleNavigate('tables')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                currentTab === 'tables'
                  ? 'bg-gradient-to-r from-[#FF8A00]/10 to-[#F5B942]/10 text-[#FF8A00] border border-[#FF8A00]/30 shadow-md shadow-[#FF8A00]/20'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111722]'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-[#F5B942]" />
              <span>Mesas & Salas</span>
            </button>
            <button
              id="nav-wallet"
              onClick={() => handleNavigate('wallet')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                currentTab === 'wallet'
                  ? 'bg-gradient-to-r from-[#FF8A00]/10 to-[#F5B942]/10 text-[#FF8A00] border border-[#FF8A00]/30 shadow-md shadow-[#FF8A00]/20'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#111722]'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Billetera</span>
            </button>
            {role === 'ADMIN' || role === 'SUPER_ADMIN' ? (
              <button
                id="nav-admin"
                onClick={() => handleNavigate('admin')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  currentTab === 'admin'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/30 shadow-md shadow-red-500/20'
                    : 'text-[#94A3B8] hover:text-red-300 hover:bg-[#111722]'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-red-400" />
                <span>Admin</span>
              </button>
            ) : null}
          </nav>

          {/* ========================================================= */}
          {/* SECCIÓN DERECHA: NOTIFICACIONES + PERFIL / AUTH          */}
          {/* ========================================================= */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="hidden sm:block">
              <InstallPWAButton variant="header" />
            </div>
            <div className="hidden md:block">
              <ConnectionBadge />
            </div>

            {/* Campana de Notificaciones */}
            <button
              id="header-notifications-btn"
              onClick={() => {
                safePlayClick();
                onOpenNotifications();
              }}
              className="relative p-2 rounded-xl bg-gradient-to-br from-[#111722] to-[#171E2A] hover:from-[#171E2A] hover:to-[#1E2938] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2938] transition-all shadow-md"
              title="Notificaciones"
              aria-label="Abrir notificaciones"
            >
              <Bell className="w-4 h-4" />
              {hasUnreadNotifications && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF8A00] animate-pulse shadow-lg shadow-[#FF8A00]/50" />
              )}
            </button>

            {/* Botón / Avatar de Perfil o Login */}
            {state === 'loading' ? (
              <div className="w-8 h-8 rounded-full bg-[#111722] animate-pulse" />
            ) : isAuthenticated ? (
              <button
                id="header-user-profile-btn"
                onClick={() => {
                  safePlayClick();
                  onOpenProfile();
                }}
                className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-gradient-to-r from-[#111722] to-[#171E2A] border border-[#1E2938] hover:border-[#FF8A00]/50 transition-all text-xs text-[#F8FAFC] shadow-md"
                aria-label="Menú de perfil de usuario"
              >
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userFirstName}
                    className="w-7 h-7 sm:w-6 sm:h-6 rounded-full object-cover border-2 border-[#FF8A00] shrink-0 shadow-md"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-[#FF8A00] to-[#F5B942] border-2 border-[#FF8A00] flex items-center justify-center text-xs font-black text-[#080B12] shrink-0">
                    {userFirstName.charAt(0)}
                  </div>
                )}
                <span className="hidden md:block font-bold max-w-[100px] truncate text-[11px]">
                  {userFirstName}
                </span>
              </button>
            ) : (
              <button
                id="header-signin-google-btn"
                onClick={signInWithGoogle}
                disabled={isSigningIn}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF8A00] to-[#F5B942] hover:brightness-110 text-[#080B12] font-black text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-[#FF8A00]/30"
              >
                {isSigningIn ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogIn className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Ingresar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}