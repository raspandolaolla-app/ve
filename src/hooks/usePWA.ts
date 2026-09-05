// ==============================================================================
// PULSOPLAY — HOOK PWA (BEFOREINSTALLPROMPT & INSTALACIÓN MULTIPLATAFORMA)
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);

  useEffect(() => {
    // 1. Detectar si ya está ejecutándose como PWA standalone
    const checkInstalled = () => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isStandaloneNav = (navigator as any).standalone === true;
      const isAndroidApp = document.referrer.includes('android-app://');
      setIsInstalled(isStandaloneMedia || isStandaloneNav || isAndroidApp);
    };

    checkInstalled();

    // Listener para cambios de modo de visualización (por si se instala mientras la app está abierta)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    // 2. Detectar si el dispositivo es iOS (iPhone/iPad/iPod en Safari)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // 3. Capturar el evento oficial beforeinstallprompt para Chrome / Android / PC (Windows, Mac, Linux)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 4. Capturar evento de app instalada con éxito
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.log('[PWA] PulsoPLAY fue instalada exitosamente.');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, []);

  // Función gatillo para la instalación
  const promptInstall = useCallback(async () => {
    if (isInstalled) {
      return;
    }

    // Si es un navegador Chromium/Android/PC con prompt disponible
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          console.log('[PWA] El usuario aceptó la instalación.');
          setIsInstalled(true);
        } else {
          console.log('[PWA] El usuario rechazó la instalación.');
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('[PWA] Error al invocar prompt de instalación:', err);
      }
      return;
    }

    // Si es un dispositivo iOS (Safari no admite beforeinstallprompt)
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    // Si no hay prompt activo ni es iOS, mostrar guía alternativa
    setShowInfoModal(true);
  }, [deferredPrompt, isInstalled, isIOS]);

  return {
    isInstalled,
    canInstall: !isInstalled && (Boolean(deferredPrompt) || isIOS),
    isIOS,
    showIOSModal,
    setShowIOSModal,
    showInfoModal,
    setShowInfoModal,
    promptInstall,
  };
}
