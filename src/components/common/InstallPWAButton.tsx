// ==============================================================================
// PULSOPLAY — BOTÓN DE INSTALACIÓN PWA INTELEVENTE
// ==============================================================================

import React, { useState } from 'react';
import { Download, CheckCircle2, Smartphone, Monitor, Info, X } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';
import { IOSInstallModal } from './IOSInstallModal';

interface InstallPWAButtonProps {
  variant?: 'header' | 'lobby' | 'card' | 'profile' | 'compact';
  className?: string;
}

export const InstallPWAButton: React.FC<InstallPWAButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const {
    isInstalled,
    isIOS,
    showIOSModal,
    setShowIOSModal,
    showInfoModal,
    setShowInfoModal,
    promptInstall,
  } = usePWA();

  // Si ya está instalada la PWA, ocultar el botón/badge en todos los componentes
  if (isInstalled) {
    return null;
  }

  const renderButtonContent = () => {
    switch (variant) {
      case 'lobby':
        return (
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-950 p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500 text-slate-950 rounded-2xl font-black shadow-lg shrink-0">
                <Download className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  Acceso Directo
                </span>
                <h3 className="text-base font-black text-slate-100 mt-1">
                  📲 Instalar PulsoPLAY en tu Dispositivo
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                  Accede al instante desde tu escritorio o pantalla de inicio sin perder tu sesión ni tu Wallet.
                </p>
              </div>
            </div>
            <button
              onClick={promptInstall}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shrink-0 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Instalar App</span>
            </button>
          </div>
        );

      case 'profile':
        return (
          <button
            onClick={promptInstall}
            className={`w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-amber-500/30 text-slate-100 transition shadow-md ${className}`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                <Download className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="font-bold text-sm block">📲 Instalar App PulsoPLAY</span>
                <span className="text-xs text-slate-400 block">
                  Añade un acceso directo independiente a tu pantalla de inicio
                </span>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider">
              Instalar
            </span>
          </button>
        );

      case 'card':
        return (
          <button
            onClick={promptInstall}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition ${className}`}
          >
            <Download className="w-4 h-4" />
            <span>Instalar PulsoPLAY</span>
          </button>
        );

      case 'compact':
        return (
          <button
            onClick={promptInstall}
            title="Instalar PulsoPLAY"
            className={`p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs transition flex items-center gap-2 ${className}`}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Instalar</span>
          </button>
        );

      case 'header':
      default:
        return (
          <button
            onClick={promptInstall}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg ${className}`}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Instalar App</span>
            <span className="md:hidden">App</span>
          </button>
        );
    }
  };

  return (
    <>
      {renderButtonContent()}

      {/* Modal instruccional para iOS */}
      <IOSInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
      />

      {/* Modal instruccional alternativo para navegadores de escritorio sin PWA directa */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-100 text-base">Instalar PulsoPLAY</h3>
                  <p className="text-xs text-slate-400">Acceso directo en Navegador</p>
                </div>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-slate-200 text-xs">
              <p className="text-slate-300 leading-relaxed font-medium">
                Si tu navegador no muestra el botón automático de instalación, puedes instalar o agregar <strong className="text-amber-400">PulsoPLAY</strong> fácilmente:
              </p>

              <div className="space-y-3 pt-2">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <span className="font-bold text-slate-100 block mb-1">💻 En Chrome / Edge (PC)</span>
                  <span className="text-slate-400">
                    Haz clic en el icono de instalación 💻 en la barra de direcciones superior o selecciona el menú <strong className="text-slate-200">⋮ &gt; Guardar y compartir &gt; Instalar PulsoPLAY</strong>.
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                  <span className="font-bold text-slate-100 block mb-1">📲 En Android (Chrome / Brave)</span>
                  <span className="text-slate-400">
                    Toca el menú superior de tres puntos <strong className="text-slate-200">⋮</strong> y elige <strong className="text-amber-300">"Añadir a pantalla de inicio"</strong>.
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
