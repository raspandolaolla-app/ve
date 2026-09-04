// ==============================================================================
// RASPANDO LA OLLA — MENÚ DE PERFIL DESPLEGABLE / MODAL PREMIUM
// ==============================================================================

import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../context/WalletContext';
import { formatBolivares } from '../../utils/formatters';
import {
  User,
  PlusCircle,
  ArrowUpRight,
  Users,
  Trophy,
  MessageSquare,
  Headphones,
  Settings,
  ShieldCheck,
  LogOut,
  X,
  ChevronRight,
  LogIn,
  Wallet,
  Shield,
} from 'lucide-react';

interface ProfileMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
  onOpenSupport: () => void;
}

export const ProfileMenuModal: React.FC<ProfileMenuModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenSupport,
}) => {
  const { user, profile, role, state, isSigningIn, signInWithGoogle, signOut } = useAuth();
  const { balance, isBalanceVisible, openDepositModal, openWithdrawModal } = useWallet();

  if (!isOpen) return null;

  const isAuthenticated = state === 'authenticated' && user !== null;

  // Obtener nombre real
  const userMetadata = user?.user_metadata || {};
  const firstName = (profile?.firstName || userMetadata.given_name || user?.email?.split('@')[0] || 'JUGADOR').toUpperCase();
  const lastName = (profile?.lastName || userMetadata.family_name || '').toUpperCase();
  const fullName = `${firstName} ${lastName}`.trim();
  const avatarUrl = profile?.avatarUrl || userMetadata.avatar_url || userMetadata.picture;

  const handleNavigate = (tab: string) => {
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
      id="profile-menu-container"
      className="fixed inset-0 z-50 flex items-start justify-end sm:p-4 pt-16 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#080B12]/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Contenedor Modal */}
      <div className="relative w-full max-w-sm bg-[#111722] border border-[#1E2938] sm:rounded-2xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[calc(100vh-5rem)]">
        {/* Cabecera con Nombre Real y Estado */}
        <div className="p-4 bg-gradient-to-b from-[#171E2A] to-[#111722] border-b border-[#1E2938]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FF8A00]/10 border border-[#FF8A00]/30 text-xs font-bold text-[#FF8A00] uppercase tracking-wider">
              <span className="text-2xl select-none leading-none">🇻🇪</span>
              <span>Raspando La Olla</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors"
              aria-label="Cerrar perfil"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <div className="relative">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#FF8A00] shadow-md"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#171E2A] border-2 border-[#FF8A00] flex items-center justify-center text-lg font-black text-[#FF8A00]">
                    {firstName.charAt(0)}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#22C55E] border-2 border-[#111722]" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs text-[#94A3B8] font-medium">¡Hola!</div>
                <h3 className="text-sm font-black text-[#F8FAFC] truncate tracking-tight">
                  {fullName}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                  <span className="text-[#22C55E] font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verificado</span>
                  </span>
                  {role === 'ADMIN' || role === 'SUPER_ADMIN' ? (
                    <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30">
                      ADMIN
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-2 space-y-2">
              <div className="text-sm font-bold text-[#F8FAFC]">Bienvenido a Raspando La Olla</div>
              <p className="text-xs text-[#94A3B8]">Inicia sesión para jugar con amigos y participar en sorteos.</p>
              <button
                onClick={() => {
                  signInWithGoogle();
                  onClose();
                }}
                disabled={isSigningIn}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 hover:from-yellow-300 hover:to-yellow-200 text-slate-950 font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/30 ring-1 ring-yellow-400/50 uppercase tracking-wider"
              >
                <LogIn className="w-4 h-4 text-slate-950" strokeWidth={3} />
                <span>{isSigningIn ? 'Ingresando...' : 'INGRESAR'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Resumen Rápido de Saldo en Modal */}
        {isAuthenticated && (
          <div className="p-3 bg-[#080B12]/80 border-b border-[#1E2938] flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-[#94A3B8] tracking-wider">Saldo Disponible</div>
              <div className="text-sm font-mono font-black text-[#22C55E]">
                {isBalanceVisible
                  ? formatBolivares(balance?.availableBalance ?? 0)
                  : 'Bs. ••••••'}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleDeposit}
                className="px-2.5 py-1.5 rounded-lg bg-[#FF8A00] text-[#080B12] text-xs font-black hover:bg-[#FF8A00]/90 transition-colors flex items-center gap-1 shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Abonar</span>
              </button>
              <button
                onClick={handleWithdraw}
                className="px-2.5 py-1.5 rounded-lg bg-[#171E2A] text-[#F8FAFC] border border-[#1E2938] hover:border-[#FF8A00]/50 text-xs font-bold transition-colors flex items-center gap-1"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[#2496FF]" />
                <span>Retirar</span>
              </button>
            </div>
          </div>
        )}

        {/* Opciones del Menú */}
        <div className="p-2 overflow-y-auto space-y-0.5 flex-1">
          {isAuthenticated && (
            <>
              <button
                onClick={() => handleNavigate('profile')}
                className="w-full text-left p-2.5 rounded-xl hover:bg-[#171E2A] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#FF8A00] border border-[#1E2938]">
                    <User className="w-4 h-4" />
                  </div>
                  <span>Mi Perfil & Datos Personales</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>

              <button
                onClick={() => handleNavigate('wallet')}
                className="w-full text-left p-2.5 rounded-xl hover:bg-[#171E2A] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#22C55E] border border-[#1E2938]">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <span>Billetera & Cuentas Bancarias</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>

              <button
                onClick={() => handleNavigate('profile')}
                className="w-full text-left p-2.5 rounded-xl hover:bg-[#171E2A] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#2496FF] border border-[#1E2938]">
                    <Users className="w-4 h-4" />
                  </div>
                  <span>Referidos & Beneficios</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>

              <button
                onClick={() => handleNavigate('tables')}
                className="w-full text-left p-2.5 rounded-xl hover:bg-[#171E2A] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#F5B942] border border-[#1E2938]">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <span>Salón de la Fama & Torneos</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>

              <button
                onClick={() => handleNavigate('profile')}
                className="w-full text-left p-2.5 rounded-xl hover:bg-[#171E2A] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#94A3B8] border border-[#1E2938]">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span>Seguridad 2FA & Verificación KYC</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
              </button>

              {role === 'ADMIN' || role === 'SUPER_ADMIN' ? (
                <button
                  onClick={() => handleNavigate('admin')}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-red-500/10 text-xs font-medium text-red-400 transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/30">
                      <Shield className="w-4 h-4" />
                    </div>
                    <span>Panel de Administración</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-red-400/60 group-hover:text-red-400" />
                </button>
              ) : null}

              <div className="my-1 border-t border-[#1E2938]" />
            </>
          )}

          <button
            onClick={() => {
              onClose();
              onOpenSupport();
            }}
            className="w-full text-left p-2.5 rounded-xl hover:bg-[#171E2A] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#2496FF] border border-[#1E2938]">
                <Headphones className="w-4 h-4" />
              </div>
              <span>Soporte Técnico en Vivo</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenSupport();
            }}
            className="w-full text-left p-2.5 rounded-xl hover:bg-[#171E2A] text-xs font-medium text-[#F8FAFC] transition-colors flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#171E2A] group-hover:bg-[#1E2938] flex items-center justify-center text-[#FF8A00] border border-[#1E2938]">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span>Tu Opinión & Sugerencias</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#F8FAFC]" />
          </button>

          {isAuthenticated && (
            <button
              onClick={() => {
                signOut();
                onClose();
              }}
              className="w-full text-left p-2.5 rounded-xl hover:bg-red-500/10 text-xs font-medium text-red-400 transition-colors flex items-center justify-between group mt-1"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 border border-red-500/20">
                  <LogOut className="w-4 h-4" />
                </div>
                <span>Cerrar Sesión</span>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
