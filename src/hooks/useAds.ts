// ==============================================================================
// RASPANDO LA OLLA — HOOK DE REACT PARA PUBLICIDAD (useAds)
// ==============================================================================
// Proporciona acceso reactivo al AdService con:
// - Carga y selección automática de anuncios por ubicación (placement).
// - Filtrado automático por disponibilidad de juegos (isGameEnabled).
// - Soporte para carrusel de múltiples anuncios y rotación fluida.
// - Reporte de fallos y fallback inmediato.
// - Prevención garantizada de bucles infinitos de re-render (memorización profunda).
// ==============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AdService, type AdQueryOptions } from '../services/advertising/AdService';
import { useGameAvailability } from '../context/GameAvailabilityContext';
import type { AdPlacement, AdvertisingCampaign } from '../types/advertising';

function areCampaignArraysEqual(a: AdvertisingCampaign[], b: AdvertisingCampaign[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].asset?.id !== b[i].asset?.id) return false;
    if (a[i].priority !== b[i].priority) return false;
    if (a[i].active !== b[i].active) return false;
  }
  return true;
}

export function useAds(
  placement: AdPlacement,
  options?: Omit<AdQueryOptions, 'isGameEnabled'> & { isGameEnabled?: (gameId: string) => boolean }
) {
  const { isGameEnabled: defaultIsGameEnabled } = useGameAvailability();
  const effectiveIsGameEnabled = options?.isGameEnabled || defaultIsGameEnabled;

  // Extraer valores primitivos para evitar dependencias inestables de objetos
  const gameType = options?.gameType || null;
  const deviceType = options?.deviceType;
  const orientation = options?.orientation;

  // Ref estable para callback de disponibilidad
  const isGameEnabledRef = useRef(effectiveIsGameEnabled);
  isGameEnabledRef.current = effectiveIsGameEnabled;

  const [campaigns, setCampaigns] = useState<AdvertisingCampaign[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const adService = useMemo(() => AdService.getInstance(), []);

  // Ref de longitud para que nextAd / prevAd no cambien de referencia constantemente
  const campaignsLengthRef = useRef(0);
  campaignsLengthRef.current = campaigns.length;

  // Actualizador condicional: si los anuncios son idénticos, no altera la referencia de estado
  const setCampaignsIfChanged = useCallback((nextCampaigns: AdvertisingCampaign[]) => {
    setCampaigns((prev) => (areCampaignArraysEqual(prev, nextCampaigns) ? prev : nextCampaigns));
  }, []);

  const getFilteredAds = useCallback(() => {
    const queryOpts: AdQueryOptions = {
      gameType,
      deviceType,
      orientation,
      isGameEnabled: (gId) => isGameEnabledRef.current(gId),
    };
    return adService.getAdsForPlacement(placement, queryOpts);
  }, [adService, placement, gameType, deviceType, orientation]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await adService.init();
    const ads = getFilteredAds();
    setCampaignsIfChanged(ads);
    setCurrentIndex(0);
    setLoading(false);
  }, [adService, getFilteredAds, setCampaignsIfChanged]);

  useEffect(() => {
    let isMounted = true;

    const runInit = async () => {
      try {
        await adService.init();
        if (isMounted) {
          const ads = getFilteredAds();
          setCampaignsIfChanged(ads);
          setLoading(false);
        }
      } catch (err) {
        console.warn('[useAds] Error inicializando anuncios:', err);
        if (isMounted) setLoading(false);
      }
    };

    runInit();

    const unsubscribe = adService.subscribe(() => {
      if (isMounted) {
        const ads = getFilteredAds();
        setCampaignsIfChanged(ads);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [adService, getFilteredAds, setCampaignsIfChanged]);

  const currentAd: AdvertisingCampaign | null = useMemo(() => {
    if (campaigns.length === 0) return null;
    const safeIdx = currentIndex % campaigns.length;
    return campaigns[safeIdx] || campaigns[0] || null;
  }, [campaigns, currentIndex]);

  const nextAd = useCallback(() => {
    const len = campaignsLengthRef.current;
    if (len <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % len);
  }, []);

  const prevAd = useCallback(() => {
    const len = campaignsLengthRef.current;
    if (len <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + len) % len);
  }, []);

  const goToAd = useCallback((index: number) => {
    const len = campaignsLengthRef.current;
    if (index >= 0 && index < len) {
      setCurrentIndex(index);
    }
  }, []);

  const reportFailure = useCallback(
    (adId: string) => {
      adService.reportAdFailure(adId);
      nextAd();
    },
    [adService, nextAd]
  );

  return {
    ad: currentAd,
    ads: campaigns,
    totalAds: campaigns.length,
    currentIndex,
    loading,
    nextAd,
    prevAd,
    goToAd,
    reportFailure,
    refresh,
  };
}
