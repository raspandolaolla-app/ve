// ==============================================================================
// RASPANDO LA OLLA — CONTEXTO GLOBAL DE BILLETERA Y CONTROL DE MODALES
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { WalletRepository } from '../services/repositories/WalletRepository';
import { RealtimeManager } from '../services/realtime/RealtimeManager';
import type { WalletBalance } from '../types/wallet';

interface WalletContextType {
  balance: WalletBalance | null;
  isLoading: boolean;
  isBalanceVisible: boolean;
  toggleBalanceVisibility: () => void;
  refreshBalance: () => Promise<void>;
  openDepositModal: () => void;
  openWithdrawModal: () => void;
  closeWalletModals: () => void;
  activeWalletModal: 'deposit' | 'withdraw' | null;
}

const STORAGE_KEY_BALANCE_VISIBLE = 'rlo_balance_visible';

const WalletContext = createContext<WalletContextType>({
  balance: null,
  isLoading: false,
  isBalanceVisible: true,
  toggleBalanceVisibility: () => {},
  refreshBalance: async () => {},
  openDepositModal: () => {},
  openWithdrawModal: () => {},
  closeWalletModals: () => {},
  activeWalletModal: null,
});

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, state } = useAuth();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeWalletModal, setActiveWalletModal] = useState<'deposit' | 'withdraw' | null>(null);

  // Carga y persistencia de visibilidad de saldo
  const [isBalanceVisible, setIsBalanceVisible] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BALANCE_VISIBLE);
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleBalanceVisibility = useCallback(() => {
    setIsBalanceVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_BALANCE_VISIBLE, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!user?.id || state !== 'authenticated') {
      setBalance(null);
      return;
    }
    setIsLoading(true);
    try {
      const bal = await WalletRepository.getBalance(user.id);
      setBalance(bal);
    } catch (err) {
      console.warn('[WalletProvider] Error cargando balance:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, state]);

  useEffect(() => {
    if (state === 'authenticated' && user?.id) {
      refreshBalance();

      // Suscripción Realtime a eventos de billetera del usuario
      const unsubscribe = RealtimeManager.subscribeToUserEvents(
        user.id,
        () => {
          refreshBalance();
        },
        () => {
          refreshBalance();
        }
      );

      return () => {
        unsubscribe();
      };
    } else {
      setBalance(null);
    }
  }, [state, user?.id, refreshBalance]);

  const openDepositModal = useCallback(() => {
    setActiveWalletModal('deposit');
  }, []);

  const openWithdrawModal = useCallback(() => {
    setActiveWalletModal('withdraw');
  }, []);

  const closeWalletModals = useCallback(() => {
    setActiveWalletModal(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        balance,
        isLoading,
        isBalanceVisible,
        toggleBalanceVisibility,
        refreshBalance,
        openDepositModal,
        openWithdrawModal,
        closeWalletModals,
        activeWalletModal,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => useContext(WalletContext);
