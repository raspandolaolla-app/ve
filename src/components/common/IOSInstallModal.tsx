// ==============================================================================
// PULSOPLAY — MODAL GUIADO DE INSTALACIÓN PWA PARA IPHONE / IPAD (IOS)
// ==============================================================================

import React from 'react';
import { X, Share, PlusSquare, CheckCircle, Smartphone } from 'lucide-react';

interface IOSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IOSInstallModal: React.FC<IOSInstallModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Encabezado */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-100 text-base">Instalar PulsoPLAY</h3>
              <p className="text-xs text-slate-400">Instrucciones para iPhone y iPad</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pasos */}
        <div className="p-6 space-y-4 text-slate-200 text-xs">
          <p className="text-slate-300 leading-relaxed font-medium">
            Para instalar <strong className="text-amber-400">PulsoPLAY</strong> como aplicación independiente en tu pantalla de inicio de iOS:
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 shrink-0 mt-0.5">
                <Share className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-100 block mb-0.5">Paso 1</span>
                <span>
                  Pulsa el botón <strong className="text-slate-100">Compartir</strong> (icono con flecha hacia arriba) en la barra inferior de Safari.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                <PlusSquare className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-100 block mb-0.5">Paso 2</span>
                <span>
                  Desplázate en las opciones del menú y selecciona <strong className="text-amber-300">"Añadir a pantalla de inicio"</strong>.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-100 block mb-0.5">Paso 3</span>
                <span>
                  Toca <strong className="text-emerald-300">"Añadir"</strong> en la esquina superior derecha para confirmar la instalación.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
