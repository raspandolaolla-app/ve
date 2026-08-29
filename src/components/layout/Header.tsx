// ==============================================================================
// RASPANDO LA OLLA — CABECERA PRINCIPAL RESPONSIVE
// ==============================================================================

import { useAuth } from '../../hooks/useAuth';
import { ConnectionBadge } from '../common/ConnectionBadge';
import { InstallPWAButton } from '../common/InstallPWAButton';
import { Button } from '../common/Button';
import { getAssetUrl } from '../../utils/assetUtils';
import { LogIn, LogOut, User, Shield, Wallet, Grid, Lock, Loader2 } from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
}

export function Header({ currentTab, onNavigate }: HeaderProps) {
  const { state, user, profile, role, isSigningIn, signInWithGoogle, signOut } = useAuth();

  const isAuthenticated = state === 'authenticated' && user !== null;

  return (
    <header id="app-header" className="bg-slate-950/90 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Marca */}
          <div
            id="brand-logo"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 p-0.5 shadow-md shadow-amber-950/50 flex items-center justify-center overflow-hidden">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center group-hover:bg-slate-900 transition-colors p-0.5">
                <img src={getAssetUrl('logo.svg')} alt="Logo Raspando La Olla" className="w-full h-full object-contain group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black tracking-tight text-lg text-slate-100 uppercase">
                  Raspando <span className="text-amber-400">La Olla</span>
                </span>
              </div>
              <span className="hidden sm:block text-[10px] text-slate-400 font-medium tracking-wider uppercase">
                Mesas Online Multijugador
              </span>
            </div>
          </div>

          {/* Navegación Principal */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              id="nav-home"
              onClick={() => onNavigate('home')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'home'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Lobby</span>
            </button>

            <button
              id="nav-polla"
              onClick={() => onNavigate('polla')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'polla'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <span className="text-amber-400 text-sm">🐾</span>
              <span>Polla Venezolana</span>
            </button>

            <button
              id="nav-trancaito"
              onClick={() => onNavigate('tables')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'tables'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Trancaíto (Privadas)</span>
            </button>

            <button
              id="nav-wallet"
              onClick={() => onNavigate('wallet')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'wallet'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Billetera</span>
            </button>

            {role === 'ADMIN' || role === 'SUPER_ADMIN' ? (
              <button
                id="nav-admin"
                onClick={() => onNavigate('admin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  currentTab === 'admin'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                    : 'text-slate-300 hover:text-red-300 hover:bg-slate-900'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-red-400" />
                <span>Admin</span>
              </button>
            ) : null}
          </nav>

          {/* Estado de Conexión, PWA & Auth */}
          <div className="flex items-center gap-3">
            <InstallPWAButton variant="header" />
            <ConnectionBadge />

            {state === 'loading' ? (
              <div className="w-8 h-8 rounded-full bg-slate-800 animate-pulse" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-2">
                {(() => {
                  const userAvatar = profile?.avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
                  return (
                    <button
                      id="header-user-profile-btn"
                      onClick={() => onNavigate('profile')}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 transition-all text-xs text-slate-200 touch-manipulation"
                    >
                      {userAvatar ? (
                        <img
                          src={userAvatar}
                          alt="Perfil Google"
                          className="w-5 h-5 rounded-full object-cover border border-amber-400/60 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                      <span className="font-medium max-w-[120px] truncate">
                        {profile?.firstName ? `${profile.firstName} ${profile.lastName}`.trim() : user.email?.split('@')[0]}
                      </span>
                    </button>
                  );
                })()}

                <Button
                  id="header-signout-btn"
                  variant="ghost"
                  size="sm"
                  onClick={signOut}
                  title="Cerrar sesión"
                >
                  <LogOut className="w-4 h-4 text-slate-400 hover:text-red-400" />
                </Button>
              </div>
            ) : (
              <Button
                id="header-signin-google-btn"
                variant="primary"
                size="sm"
                onClick={signInWithGoogle}
                disabled={isSigningIn}
                leftIcon={
                  isSigningIn ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )
                }
                className="font-semibold shadow-md shadow-amber-950/40"
              >
                {isSigningIn ? 'Conectando con Google...' : 'Continuar con Google'}
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden items-center justify-start py-2 border-t border-slate-900 overflow-x-auto gap-1.5 no-scrollbar px-1">
          <button
            id="mobile-nav-home"
            onClick={() => onNavigate('home')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 min-h-[40px] touch-manipulation ${
              currentTab === 'home'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900/40 border border-transparent'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Lobby</span>
          </button>

          <button
            id="mobile-nav-polla"
            onClick={() => onNavigate('polla')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 min-h-[40px] touch-manipulation ${
              currentTab === 'polla'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900/40 border border-transparent'
            }`}
          >
            <span className="text-amber-400 text-sm">🐾</span>
            <span>Polla</span>
          </button>

          <button
            id="mobile-nav-trancaito"
            onClick={() => onNavigate('tables')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 min-h-[40px] touch-manipulation ${
              currentTab === 'tables'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900/40 border border-transparent'
            }`}
          >
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Mesas</span>
          </button>

          <button
            id="mobile-nav-wallet"
            onClick={() => onNavigate('wallet')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 min-h-[40px] touch-manipulation ${
              currentTab === 'wallet'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white bg-slate-900/40 border border-transparent'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Billetera</span>
          </button>

          {isAuthenticated && (
            <button
              id="mobile-nav-profile"
              onClick={() => onNavigate('profile')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 min-h-[40px] touch-manipulation ${
                currentTab === 'profile'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white bg-slate-900/40 border border-transparent'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Perfil</span>
            </button>
          )}

          {(role === 'ADMIN' || role === 'SUPER_ADMIN') && (
            <button
              id="mobile-nav-admin"
              onClick={() => onNavigate('admin')}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 min-h-[40px] touch-manipulation ${
                currentTab === 'admin'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-red-300 bg-slate-900/40 border border-transparent'
              }`}
            >
              <Shield className="w-4 h-4 text-red-400" />
              <span>Admin</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
