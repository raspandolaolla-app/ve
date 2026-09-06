// ==============================================================================
// RASPANDO LA OLLA 🇻🇪 — CABECERA PRINCIPAL DE MARCA Y ACCIONES
// Identidad visual venezolana destacada, responsive y sin botones compitiendo
// ==============================================================================

import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../context/WalletContext';
import { ConnectionBadge } from '../common/ConnectionBadge';
import { getAssetUrl } from '../../utils/assetUtils';
import { formatBolivares } from '../../utils/formatters';
import {
  LogIn,
  LogOut,
  Shield,
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
  currentTab: _currentTab,
  onNavigate,
  onOpenNotifications,
  onOpenProfile,
  hasUnreadNotifications = false,
}: HeaderProps) {
  const { state, user, profile, role, isSigningIn, openLoginModal, signOut } = useAuth();
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
      className="bg-[#080B12]/95 border-b border-[#1E2938] sticky top-0 z-40 backdrop-blur-md select-none shadow-lg safe-area-top"
    >
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 md:h-18 gap-2">

          {/* ==================================================================== */}
          {/* IDENTIDAD DE MARCA PRINCIPAL: RASPANDO LA OLLA 🇻🇪 */}
          {/* ==================================================================== */}
          <div
            id="brand-logo"
            role="button"
            tabIndex={0}
            onClick={() => onNavigate('home')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigate('home');
              }
            }}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group shrink-0 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A00] rounded-2xl p-1 -m-1 transition-all"
            title="Raspando La Olla 🇻🇪 - Inicio"
            aria-label="Raspando La Olla 🇻🇪 - Volver al Inicio"
          >
            {/* Isotipo con resplandor dorado sutil */}
            <div className="w-8 h-8 min-[360px]:w-9 min-[360px]:h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-[#FF8A00] via-[#F5B942] to-[#FFB703] p-0.5 shadow-lg shadow-[#FF8A00]/25 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 group-active:scale-95 transition-transform duration-200">
              <div className="w-full h-full bg-[#080B12] rounded-[10px] sm:rounded-[14px] flex items-center justify-center group-hover:bg-[#0E1524] transition-colors p-0.5 sm:p-1">
                <img
                  src={getAssetUrl('logo.svg')}
                  alt="Isotipo Raspando La Olla"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Bloque Tipográfico de Marca Prominente */}
            <div className="flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-1 sm:gap-2 leading-none">
                <span className="font-black tracking-tight text-[13px] min-[360px]:text-[15px] min-[400px]:text-base sm:text-xl md:text-2xl lg:text-[26px] text-white uppercase whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  RASPANDO <span className="bg-gradient-to-r from-[#FF8A00] via-[#F5B942] to-[#FFB703] bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(255,138,0,0.4)]">LA OLLA</span>
                </span>
                <span
                  className="text-lg min-[360px]:text-xl sm:text-2xl md:text-3xl lg:text-[32px] leading-none select-none inline-flex items-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] transform group-hover:scale-110 transition-transform duration-200 shrink-0"
                  title="Venezuela"
                  aria-label="Bandera de Venezuela"
                >
                  🇻🇪
                </span>
              </div>
              {/* Subtítulo lema de identidad venezolana */}
              <div className="hidden min-[380px]:flex items-center gap-1.5 mt-0.5 sm:mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[8px] min-[380px]:text-[9px] sm:text-[10px] md:text-[11px] text-amber-400/90 font-bold tracking-widest uppercase truncate drop-shadow">
                  Juegos & Sorteos en Vivo
                </span>
              </div>
            </div>
          </div>

          {/* ==================================================================== */}
          {/* SECCIÓN DERECHA: ESTADO / AUTENTICACIÓN / ACCIONES */}
          {/* ==================================================================== */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 shrink-0">
            {/* Conexión en vivo (visible en pantallas grandes) */}
            <div className="hidden lg:block">
              <ConnectionBadge />
            </div>

            {/* Acceso rápido a Panel de Admin (solo administradores, discreto) */}
            {(role === 'ADMIN' || role === 'SUPER_ADMIN') && (
              <button
                id="header-admin-quick-btn"
                onClick={() => onNavigate('admin')}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-950/40 text-red-200 border border-red-500/40 hover:bg-red-900/50 hover:border-red-400 text-xs font-black transition-all cursor-pointer shadow-sm"
                title="Panel de Administración"
                aria-label="Panel de Administración"
              >
                <Shield className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>Admin</span>
              </button>
            )}

            {/* Campana de Notificaciones */}
            <button
              id="header-notifications-btn"
              onClick={onOpenNotifications}
              className="relative p-2 rounded-xl bg-[#111722] hover:bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#1E2938] transition-colors active:scale-95 cursor-pointer"
              title="Notificaciones"
              aria-label="Ver notificaciones"
            >
              <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              {hasUnreadNotifications && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF8A00] animate-pulse" />
              )}
            </button>

            {state === 'loading' ? (
              <div className="w-10 h-10 rounded-full bg-[#111722] animate-pulse" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                {/* SALDO DISPONIBLE */}
                <div
                  id="header-balance-pill"
                  onClick={() => onNavigate('wallet')}
                  className="flex items-center gap-1.5 sm:gap-2 px-2 min-[360px]:px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-xl bg-[#111722] border border-[#1E2938] hover:border-[#FF8A00]/40 transition-colors shadow-inner cursor-pointer group"
                  title="Ver mi Billetera"
                >
                  <div className="flex flex-col justify-center">
                    <span className="text-[8px] sm:text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider hidden sm:block">
                      Saldo
                    </span>
                    <span className="text-xs min-[360px]:text-sm sm:text-base md:text-lg font-black font-mono text-[#22C55E] tracking-tight leading-none group-hover:text-emerald-300 transition-colors">
                      {formattedBalance}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 sm:gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBalanceVisibility();
                      }}
                      className="p-1 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors cursor-pointer"
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
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('wallet');
                        openDepositModal();
                      }}
                      className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FF8A00] hover:bg-[#FF8A00]/90 text-[#080B12] text-[11px] font-black transition-all shadow hover:scale-105 active:scale-95 ml-0.5 cursor-pointer"
                      title="Abonar fondos"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                      <span>Abonar</span>
                    </button>
                  </div>
                </div>

                {/* BOTÓN PERFIL / NOMBRE DEL JUGADOR */}
                <button
                  id="header-user-profile-btn"
                  onClick={onOpenProfile}
                  className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-[#111722] border border-[#1E2938] hover:border-[#FF8A00]/50 transition-all text-xs text-[#F8FAFC] cursor-pointer active:scale-95"
                  title="Ver perfil de usuario"
                  aria-label="Abrir menú de perfil"
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
                  <span className="hidden md:block font-bold max-w-[100px] lg:max-w-[130px] truncate text-xs sm:text-sm">
                    {displayName}
                  </span>
                </button>

                {/* CERRAR SESIÓN */}
                <button
                  id="header-signout-btn"
                  onClick={() => signOut()}
                  className="hidden sm:flex p-2 rounded-xl bg-[#111722] hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-[#1E2938] hover:border-red-500/30 transition-colors cursor-pointer"
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              // BOTÓN INGRESAR DESTACADO
              <button
                id="header-signin-google-btn"
                onClick={openLoginModal}
                disabled={isSigningIn}
                className="px-3 min-[360px]:px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 hover:from-yellow-300 hover:via-yellow-200 hover:to-yellow-300 text-slate-950 font-black text-xs min-[360px]:text-sm sm:text-base transition-all flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-yellow-500/25 hover:shadow-yellow-400/40 hover:scale-105 active:scale-95 ring-1 sm:ring-2 ring-yellow-400/60 cursor-pointer shrink-0"
                aria-label="Iniciar sesión"
              >
                {isSigningIn ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-slate-950" />
                ) : (
                  <LogIn className="w-4 h-4 sm:w-5 sm:h-5 text-slate-950" strokeWidth={3} />
                )}
                <span className="tracking-wider uppercase font-black">
                  {isSigningIn ? 'INGRESANDO...' : 'INGRESAR'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
