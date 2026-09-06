// ==============================================================================
// RASPANDO LA OLLA — BARRA DE NAVEGACIÓN INFERIOR CON BOTÓN JUGAR YA
// ==============================================================================

import React from 'react';
import { Home, Headphones, Zap, Menu, Wallet, Gamepad2 } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useWallet } from '../../context/WalletContext';

interface BottomNavigationProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenExplore: () => void;
  onOpenSupport: () => void;
  onOpenGiraLaOlla?: () => void;
  onOpenQuickMatch?: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  onNavigate,
  onOpenExplore,
  onOpenSupport,
  onOpenGiraLaOlla,
  onOpenQuickMatch,
}) => {
  const { user, state } = useAuth();
  const isAuthenticated = state === 'authenticated' && user !== null;
  const { openWithdrawModal } = useWallet();

  const handleWithdrawClick = () => {
    onNavigate('wallet');
    setTimeout(() => openWithdrawModal(), 100);
  };

  return (
    <>
      {/* Botón Flotante 'Gira la Olla' (opcional, se mantiene) */}
      {onOpenGiraLaOlla && (
        <div className="fixed bottom-20 right-4 z-30 sm:hidden">
          <button
            id="floating-gira-olla-btn"
            onClick={onOpenGiraLaOlla}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#FF8A00] via-[#F5B942] to-[#FF8A00] p-0.5 shadow-xl shadow-[#FF8A00]/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer group"
            aria-label="Gira la Olla Bonus"
            title="Gira la Olla"
          >
            <div className="w-full h-full bg-[#111722] rounded-full flex items-center justify-center group-hover:bg-[#171E2A] transition-colors">
              <span className="text-2xl select-none animate-spin-slow">🌀</span>
            </div>
          </button>
        </div>
      )}

      {/* Barra de Navegación Flotante Dock (Idéntica a Captura 1) */}
      <nav
        id="app-bottom-navigation"
        className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-md bg-[#0E1420]/95 backdrop-blur-xl border border-slate-700/60 rounded-full px-4 sm:px-6 py-1.5 select-none shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
        role="navigation"
        aria-label="Navegación principal inferior"
      >
        <div className="flex items-center justify-between relative h-12">

          {/* 1. Inicio */}
          <button
            id="bottom-nav-home"
            onClick={() => onNavigate('home')}
            className={`flex flex-col items-center justify-center min-w-[52px] transition-all active:scale-90 cursor-pointer ${
              currentTab === 'home' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px] mt-0.5 font-bold uppercase tracking-wider">Inicio</span>
          </button>

          {/* 2. Soporte */}
          <button
            id="bottom-nav-support"
            onClick={onOpenSupport}
            className="flex flex-col items-center justify-center min-w-[52px] text-slate-400 hover:text-slate-200 transition-all active:scale-90 cursor-pointer"
          >
            <Headphones className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px] mt-0.5 font-bold uppercase tracking-wider">Soporte</span>
          </button>

          {/* 3. JUGAR YA — Botón central elevado con resplandor dorado */}
          <div className="relative -top-5 flex flex-col items-center">
            <button
              id="bottom-nav-quick-match"
              onClick={() => {
                if (onOpenQuickMatch) {
                  onOpenQuickMatch();
                } else {
                  onNavigate('tables');
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('open-quick-match'));
                  }, 100);
                }
              }}
              className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 w-12 h-12 sm:w-14 sm:h-14 rounded-full border-4 border-[#0E1420] shadow-[0_0_20px_rgba(245,158,11,0.7)] text-slate-950 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer flex items-center justify-center"
              aria-label="Jugar Ya"
            >
              <Zap className="w-6 h-6 sm:w-7 sm:h-7" fill="currentColor" strokeWidth={2.5} />
            </button>
            <span className="text-[8px] sm:text-[9px] font-black text-amber-400 uppercase tracking-widest mt-0.5 whitespace-nowrap">
              JUGAR YA
            </span>
          </div>

          {/* 4. Billetera (Autenticado) o Mesas (Visitante) */}
          {isAuthenticated ? (
            <button
              id="bottom-nav-wallet"
              onClick={() => onNavigate('wallet')}
              className={`flex flex-col items-center justify-center min-w-[52px] transition-all active:scale-90 cursor-pointer ${
                currentTab === 'wallet' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[9px] sm:text-[10px] mt-0.5 font-bold uppercase tracking-wider">Billetera</span>
            </button>
          ) : (
            <button
              id="bottom-nav-tables"
              onClick={() => onNavigate('tables')}
              className={`flex flex-col items-center justify-center min-w-[52px] transition-all active:scale-90 cursor-pointer ${
                currentTab === 'tables' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              <span className="text-[9px] sm:text-[10px] mt-0.5 font-bold uppercase tracking-wider">Mesas</span>
            </button>
          )}

          {/* 5. Explorar */}
          <button
            id="bottom-nav-explore"
            onClick={onOpenExplore}
            className="flex flex-col items-center justify-center min-w-[52px] text-slate-400 hover:text-slate-200 transition-all active:scale-90 cursor-pointer"
          >
            <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-[9px] sm:text-[10px] mt-0.5 font-bold uppercase tracking-wider">Explorar</span>
          </button>

        </div>
      </nav>
    </>
  );
};
