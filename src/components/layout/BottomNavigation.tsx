// ==============================================================================
// RASPANDO LA OLLA — BARRA DE NAVEGACIÓN INFERIOR FIJA (MOBILE FIRST)
// ==============================================================================

import React from 'react';
import {
  Home,
  Headphones,
  PlusCircle,
  ArrowUpRight,
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
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  currentTab,
  onNavigate,
  onOpenExplore,
  onOpenSupport,
  onOpenGiraLaOlla,
}) => {
  const { openDepositModal, openWithdrawModal } = useWallet();

  const handleDepositClick = () => {
    onNavigate('wallet');
    openDepositModal();
  };

  const handleWithdrawClick = () => {
    onNavigate('wallet');
    openWithdrawModal();
  };

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

          {/* 3. Abonar (Acción Destacada Central) */}
          <button
            id="bottom-nav-deposit"
            onClick={handleDepositClick}
            className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 group"
          >
            <div className="w-10 h-10 -mt-3 rounded-full bg-gradient-to-tr from-[#FF8A00] to-[#F5B942] flex items-center justify-center text-[#080B12] shadow-lg shadow-[#FF8A00]/30 group-hover:scale-105 active:scale-95 transition-all">
              <PlusCircle className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold text-[#FF8A00] mt-0.5 tracking-tight">
              Abonar
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
    </>
  );
};
