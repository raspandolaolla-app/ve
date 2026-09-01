// ==============================================================================
// RASPANDO LA OLLA — BARRA DE NAVEGACIÓN INFERIOR CON PARTIDA RÁPIDA
// ==============================================================================

import React from 'react';
import {
  Home,
  Headphones,
  Zap,
  Menu,
  Wallet,
} from 'lucide-react';
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
  const { openWithdrawModal } = useWallet();

  const handleWithdrawClick = () => {
    onNavigate('wallet');
    setTimeout(() => openWithdrawModal(), 100);
  };

  return (
    <>
      {/* Botón Flotante 'Gira la Olla' */}
      {onOpenGiraLaOlla && (
        <div className="fixed bottom-20 right-4 z-30 sm:hidden">
          <button
            id="floating-gira-olla-btn"
            onClick={onOpenGiraLaOlla}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#FF8A00] via-[#F5B942] to-[#FF8A00] p-0.5 shadow-xl shadow-[#FF8A00]/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer group animate-pulse-glow"
            aria-label="Gira la Olla Bonus"
            title="Gira la Olla"
          >
            <div className="w-full h-full bg-[#111722] rounded-full flex items-center justify-center group-hover:bg-[#171E2A] transition-colors">
              <span className="text-2xl select-none animate-spin-slow">🌀</span>
            </div>
          </button>
        </div>
      )}

      {/* Barra de Navegación Fija */}
      <nav
        id="app-bottom-navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#111722]/95 backdrop-blur-xl border-t border-[#1E2938] pb-safe select-none shadow-2xl shadow-black/50"
        role="navigation"
        aria-label="Navegación principal inferior"
      >
        <div className="max-w-md mx-auto px-2 h-16 flex items-center justify-around">

          {/* 1. Inicio */}
          <button
            id="bottom-nav-home"
            onClick={() => onNavigate('home')}
            className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 transition-all relative active:scale-95 ${
              currentTab === 'home'
                ? 'text-[#FF8A00] font-bold'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            {currentTab === 'home' && (
              <span className="absolute top-0 w-10 h-1 rounded-full bg-gradient-to-r from-[#FF8A00] to-[#F5B942] shadow-md shadow-[#FF8A00]/50" />
            )}
            <Home className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight font-semibold">Inicio</span>
          </button>

          {/* 2. Soporte */}
          <button
            id="bottom-nav-support"
            onClick={onOpenSupport}
            className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 text-[#94A3B8] hover:text-[#F8FAFC] transition-all active:scale-95"
          >
            <Headphones className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight font-semibold">Soporte</span>
          </button>

          {/* 3. PARTIDA RÁPIDA (Acción Destacada Central) */}
          <button
            id="bottom-nav-quick-match"
            onClick={() => onOpenQuickMatch && onOpenQuickMatch()}
            className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 group active:scale-95"
          >
            <div className="w-12 h-12 -mt-4 rounded-full bg-gradient-to-tr from-[#22C55E] to-[#10B981] flex items-center justify-center text-white shadow-lg shadow-[#22C55E]/40 group-hover:scale-110 transition-transform animate-pulse-glow">
              <Zap className="w-6 h-6" strokeWidth={3} />
            </div>
            <span className="text-[11px] font-black text-[#22C55E] mt-1 tracking-tight">
              JUGAR YA
            </span>
          </button>

          {/* 4. Billetera */}
          <button
            id="bottom-nav-wallet"
            onClick={() => onNavigate('wallet')}
            className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 transition-all relative active:scale-95 ${
              currentTab === 'wallet'
                ? 'text-[#2496FF] font-bold'
                : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            {currentTab === 'wallet' && (
              <span className="absolute top-0 w-10 h-1 rounded-full bg-gradient-to-r from-[#2496FF] to-[#60A5FA] shadow-md shadow-[#2496FF]/50" />
            )}
            <Wallet className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight font-semibold">Billetera</span>
          </button>

          {/* 5. Explorar */}
          <button
            id="bottom-nav-explore"
            onClick={onOpenExplore}
            className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 text-[#94A3B8] hover:text-[#FF8A00] transition-all active:scale-95"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[11px] mt-1 tracking-tight font-semibold">Explorar</span>
          </button>

        </div>
      </nav>
    </>
  );
};
