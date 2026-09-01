// ==============================================================================
// RASPANDO LA OLLA — BARRA DE NAVEGACIÓN INFERIOR MEJORADA CON ANIMACIONES
// ==============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home,
  Headphones,
  PlusCircle,
  Wallet,
  Menu,
} from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { useAudio } from '../../hooks/useAudio';

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
  const { playSound } = useAudio();

  const handleDepositClick = () => {
    playSound('click');
    onNavigate('wallet');
    setTimeout(() => openDepositModal(), 100);
  };

  const handleWithdrawClick = () => {
    playSound('click');
    onNavigate('wallet');
    setTimeout(() => openWithdrawModal(), 100);
  };

  const handleNavigate = (tab: string) => {
    playSound('click');
    onNavigate(tab);
  };

  const NavButton: React.FC<{
    id: string;
    icon: React.ElementType;
    label: string;
    isActive?: boolean;
    onClick: () => void;
    activeColor?: string;
  }> = ({ id, icon: Icon, label, isActive, onClick, activeColor = '#FF8A00' }) => (
    <motion.button
      id={id}
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      className={`flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 transition-all relative ${
        isActive
          ? 'font-bold'
          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
      }`}
      style={{ color: isActive ? activeColor : undefined }}
    >
      <AnimatePresence>
        {isActive && (
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            exit={{ scaleX: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 w-8 h-1 rounded-full shadow-sm"
            style={{ 
              backgroundColor: activeColor,
              boxShadow: `0 0 8px ${activeColor}40`
            }}
          />
        )}
      </AnimatePresence>
      <motion.div
        whileHover={{ scale: 1.15, rotate: 5 }}
        transition={{ type: 'spring', stiffness: 400, damping: 10 }}
      >
        <Icon className="w-5 h-5" />
      </motion.div>
      <span className="text-[11px] mt-1 tracking-tight font-semibold">
        {label}
      </span>
    </motion.button>
  );

  return (
    <>
      {/* Botón Flotante 'Gira la Olla' con animación mejorada */}
      {onOpenGiraLaOlla && (
        <motion.div
          initial={{ scale: 0, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.3 }}
          className="fixed bottom-20 right-4 z-30 sm:hidden"
        >
          <motion.button
            id="floating-gira-olla-btn"
            onClick={() => {
              playSound('achievement');
              onOpenGiraLaOlla();
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            animate={{ 
              boxShadow: [
                '0 0 20px rgba(255, 138, 0, 0.3)',
                '0 0 30px rgba(255, 138, 0, 0.5)',
                '0 0 20px rgba(255, 138, 0, 0.3)'
              ]
            }}
            transition={{ 
              boxShadow: { duration: 2, repeat: Infinity }
            }}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#FF8A00] via-[#F5B942] to-[#FF8A00] p-0.5 flex items-center justify-center cursor-pointer group"
            aria-label="Gira la Olla Bonus"
            title="Gira la Olla"
          >
            <div className="w-full h-full bg-[#111722] rounded-full flex items-center justify-center group-hover:bg-[#171E2A] transition-colors">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="text-2xl select-none"
              >
                🌀
              </motion.span>
            </div>
          </motion.button>
        </motion.div>
      )}

      {/* Barra de Navegación Fija con Glass Effect */}
      <nav
        id="app-bottom-navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-[#111722]/95 backdrop-blur-xl border-t border-[#1E2938] pb-safe select-none shadow-2xl"
        role="navigation"
        aria-label="Navegación principal inferior"
      >
        <div className="max-w-md mx-auto px-2 h-16 flex items-center justify-around">

          {/* 1. Inicio */}
          <NavButton
            id="bottom-nav-home"
            icon={Home}
            label="Inicio"
            isActive={currentTab === 'home'}
            onClick={() => handleNavigate('home')}
          />

          {/* 2. Soporte */}
          <NavButton
            id="bottom-nav-support"
            icon={Headphones}
            label="Soporte"
            onClick={() => {
              playSound('click');
              onOpenSupport();
            }}
          />

          {/* 3. Abonar (Acción Destacada Central) */}
          <motion.button
            id="bottom-nav-deposit"
            onClick={handleDepositClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1 flex flex-col items-center justify-center h-full min-h-[44px] py-1 group"
          >
            <motion.div
              animate={{
                boxShadow: [
                  '0 4px 12px rgba(255, 138, 0, 0.3)',
                  '0 6px 20px rgba(255, 138, 0, 0.5)',
                  '0 4px 12px rgba(255, 138, 0, 0.3)'
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-12 h-12 -mt-4 rounded-full bg-gradient-to-tr from-[#FF8A00] to-[#F5B942] flex items-center justify-center text-[#080B12] transition-all"
            >
              <PlusCircle className="w-6 h-6" />
            </motion.div>
            <span className="text-[11px] font-black text-[#FF8A00] mt-1 tracking-tight">
              Abonar
            </span>
          </motion.button>

          {/* 4. Retirar */}
          <NavButton
            id="bottom-nav-withdraw"
            icon={Wallet}
            label="Retirar"
            isActive={currentTab === 'wallet'}
            onClick={handleWithdrawClick}
            activeColor="#2496FF"
          />

          {/* 5. Explorar */}
          <NavButton
            id="bottom-nav-explore"
            icon={Menu}
            label="Explorar"
            onClick={() => {
              playSound('click');
              onOpenExplore();
            }}
          />
        </div>
      </nav>
    </>
  );
};
