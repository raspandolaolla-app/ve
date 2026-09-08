import React from 'react';
import { AlertTriangle, Clock, Shield } from 'lucide-react';

interface InactivityWarningModalProps {
  isOpen: boolean;
  secondsRemaining: number;
  onStayLoggedIn: () => void;
}

export const InactivityWarningModal: React.FC<InactivityWarningModalProps> = ({
  isOpen,
  secondsRemaining,
  onStayLoggedIn,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-md p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4 text-amber-400">
          <Clock className="w-8 h-8 animate-pulse" />
        </div>

        <h3 className="text-xl font-bold text-slate-100 mb-2">
          ¿Sigues ahí?
        </h3>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Por razones de seguridad y protección de tus fondos, tu sesión se cerrará automáticamente por inactividad en:
        </p>

        <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 mb-6">
          <span className="text-4xl font-mono font-black text-amber-400 tracking-wider">
            {secondsRemaining}s
          </span>
        </div>

        <button
          onClick={onStayLoggedIn}
          className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-base shadow-lg shadow-amber-500/20 transition cursor-pointer"
        >
          Mantener Sesión Activa
        </button>
      </div>
    </div>
  );
};
