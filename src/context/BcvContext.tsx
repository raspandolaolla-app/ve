// ==============================================================================
// RASPANDO LA OLLA — CONTEXTO UNIFICADO Y CENTRALIZADO DE TASA BCV (VES -> USD)
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BcvRepository, type BcvRateInfo } from '../services/repositories/BcvRepository';

interface BcvContextType {
  rateInfo: BcvRateInfo;
  isLoading: boolean;
  refreshRate: () => Promise<void>;
  formatUsd: (amountBs: number) => string;
  formatUsdCompact: (amountBs: number) => string;
}

const DEFAULT_RATE_INFO: BcvRateInfo = {
  rate: 791.67,
  updatedAt: new Date().toISOString(),
  formattedTimestamp: BcvRepository.formatDate(new Date().toISOString()),
  source: 'Banco Central de Venezuela',
  status: 'UPDATED',
};

const BcvContext = createContext<BcvContextType>({
  rateInfo: DEFAULT_RATE_INFO,
  isLoading: false,
  refreshRate: async () => {},
  formatUsd: (amountBs: number) => BcvRepository.formatUsdEquivalent(amountBs, 791.67),
  formatUsdCompact: (amountBs: number) => BcvRepository.formatUsdCompact(amountBs, 791.67),
});

export const BcvProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rateInfo, setRateInfo] = useState<BcvRateInfo>(DEFAULT_RATE_INFO);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadRate = useCallback(async (forceRefresh: boolean = false) => {
    setIsLoading(true);
    try {
      const info = await BcvRepository.getBcvRate(forceRefresh);
      setRateInfo(info);
    } catch (err) {
      console.warn('[BcvProvider] Error cargando la tasa BCV:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cargar tasa oficial BCV al montar la aplicación
  useEffect(() => {
    loadRate(false);

    // Auto-actualización periódica cada 60 minutos (3.600.000 ms)
    const interval = setInterval(() => {
      loadRate(true);
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [loadRate]);

  const refreshRate = useCallback(async () => {
    await loadRate(true);
  }, [loadRate]);

  const formatUsd = useCallback((amountBs: number): string => {
    return BcvRepository.formatUsdEquivalent(amountBs, rateInfo.rate);
  }, [rateInfo.rate]);

  const formatUsdCompact = useCallback((amountBs: number): string => {
    return BcvRepository.formatUsdCompact(amountBs, rateInfo.rate);
  }, [rateInfo.rate]);

  return (
    <BcvContext.Provider
      value={{
        rateInfo,
        isLoading,
        refreshRate,
        formatUsd,
        formatUsdCompact,
      }}
    >
      {children}
    </BcvContext.Provider>
  );
};

export function useBcvRate(): BcvContextType {
  const context = useContext(BcvContext);
  if (!context) {
    throw new Error('useBcvRate debe ser utilizado dentro de un BcvProvider');
  }
  return context;
}
