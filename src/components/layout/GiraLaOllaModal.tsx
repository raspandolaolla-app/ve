// ==============================================================================
// RASPANDO LA OLLA — MINIJUEGO TEMÁTICO: GIRA LA OLLA (BONUS DIARIO)
// ==============================================================================

import React, { useState } from 'react';
import { X, Sparkles, Flame, ShieldAlert, Award, Gift, RotateCw } from 'lucide-react';

interface GiraLaOllaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GiraLaOllaModal: React.FC<GiraLaOllaModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [resultSegment, setResultSegment] = useState<string | null>(null);

  if (!isOpen) return null;

  const segments = [
    { label: '¡Olla de Oro!', icon: '🏆', color: 'from-[#FF8A00] to-[#F5B942]' },
    { label: 'Ticket de Polla', icon: '🐾', color: 'from-[#2496FF] to-[#22C55E]' },
    { label: 'Raspadita Criolla', icon: '🔥', color: 'from-[#EF4444] to-[#FF8A00]' },
    { label: 'Pote Amigo', icon: '🎲', color: 'from-[#22C55E] to-[#F5B942]' },
    { label: 'Bono Multiplicador', icon: '⭐', color: 'from-[#F5B942] to-[#FF8A00]' },
    { label: '¡Sigue Raspando!', icon: '🍲', color: 'from-[#2496FF] to-[#1E2938]' },
  ];

  const handleSpin = () => {
    if (spinning) return;
    setSpinning(true);
    setResultSegment(null);

    const randomDegrees = 1800 + Math.floor(Math.random() * 360);
    const newRotation = rotation + randomDegrees;
    setRotation(newRotation);

    setTimeout(() => {
      setSpinning(false);
      const chosenIndex = Math.floor(Math.random() * segments.length);
      setResultSegment(segments[chosenIndex].label);
    }, 3500);
  };

  return (
    <div
      id="gira-la-olla-modal-container"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-[#080B12]/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-[#111722] border border-[#FF8A00]/40 rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col p-6 text-center space-y-5">
        {/* Cabecera */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍲</span>
            <div className="text-left">
              <h2 className="text-base font-black text-[#F8FAFC] tracking-tight uppercase">
                Gira <span className="text-[#FF8A00]">La Olla</span>
              </h2>
              <p className="text-[10px] text-[#F5B942] font-semibold">Bonus y Recompensas Diarias</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-[#171E2A] text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E2938] transition-colors border border-[#1E2938]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visual de la Ruleta / Olla */}
        <div className="relative py-4 flex flex-col items-center justify-center">
          {/* Indicador Superior */}
          <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-[#FF8A00] z-20 -mb-2 shadow-lg animate-bounce" />

          {/* Disco / Olla Giratoria */}
          <div
            className="w-56 h-56 rounded-full border-4 border-[#FF8A00] p-1 shadow-2xl shadow-[#FF8A00]/20 bg-gradient-to-tr from-[#171E2A] to-[#080B12] flex items-center justify-center transition-transform duration-[3500ms] cubic-bezier(0.15, 0.9, 0.2, 1)"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <div className="w-full h-full rounded-full border-2 border-dashed border-[#F5B942]/40 relative flex items-center justify-center overflow-hidden">
              <div className="text-center space-y-1">
                <div className="text-5xl select-none">🍲</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#F5B942]">
                  RASPANDO
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resultado */}
        {resultSegment && (
          <div className="p-3 rounded-2xl bg-[#FF8A00]/10 border border-[#FF8A00]/40 animate-in zoom-in-95 duration-200">
            <div className="text-xs font-bold text-[#F5B942] flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#FF8A00]" />
              <span>¡Has obtenido: {resultSegment}!</span>
            </div>
          </div>
        )}

        {/* Botón de Giro */}
        <button
          id="btn-spin-olla"
          onClick={handleSpin}
          disabled={spinning}
          className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#FF8A00] to-[#F5B942] hover:brightness-110 disabled:opacity-50 text-[#080B12] font-black text-sm transition-all flex items-center justify-center gap-2 shadow-xl shadow-[#FF8A00]/20 cursor-pointer"
        >
          <RotateCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} />
          <span>{spinning ? '¡Raspando la Olla...' : '¡GIRAR LA OLLA AHORA!'}</span>
        </button>

        {/* Nota de Integridad */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#94A3B8]">
          <ShieldAlert className="w-3.5 h-3.5 text-[#2496FF]" />
          <span>Fase interactiva de recompensas para la comunidad Raspando La Olla</span>
        </div>
      </div>
    </div>
  );
};
