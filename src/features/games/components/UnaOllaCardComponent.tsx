// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE VISUAL DE CARTA UNA-OLLA
// ==============================================================================
// Renderizado 3D de cartas frontales (Números, Salto, +2, +4, Cambio, Comodín)
// y reverso original (Fondo oscuro, borde blanco, óvalo rojo, texto amarillo).
// ==============================================================================

import type { UnaOllaCard, UnaOllaColor } from '../../../types/games';

interface UnaOllaCardProps {
  card?: UnaOllaCard;
  isBack?: boolean;
  onClick?: () => void;
  isPlayable?: boolean;
  isSelected?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function UnaOllaCardComponent({
  card,
  isBack = false,
  onClick,
  isPlayable = true,
  isSelected = false,
  size = 'md',
  className = '',
}: UnaOllaCardProps) {
  const sizeClasses = {
    sm: 'w-10 h-16 text-xs rounded-lg border',
    md: 'w-16 h-24 text-sm rounded-xl border-2',
    lg: 'w-24 h-36 text-base rounded-2xl border-2',
  }[size];

  // Reverso de la carta
  if (isBack || !card) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`relative select-none flex flex-col items-center justify-center bg-slate-950 border-2 border-slate-100 shadow-xl transition-all duration-200 ${sizeClasses} ${className}`}
        style={{
          boxShadow: '0 8px 16px -2px rgba(0, 0, 0, 0.6), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
        }}
      >
        {/* Óvalo Rojo Central */}
        <div className="w-[85%] h-[65%] bg-gradient-to-br from-red-600 to-red-800 rounded-full border border-amber-300 flex items-center justify-center shadow-inner transform -rotate-12">
          <span className="font-black text-amber-300 tracking-tighter text-[10px] sm:text-xs uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            UNA-OLLA
          </span>
        </div>
      </button>
    );
  }

  // Color de fondo
  const getColorClasses = (color: UnaOllaColor | 'wild') => {
    switch (color) {
      case 'red':
        return 'bg-gradient-to-b from-red-500 to-red-700 border-red-300 text-white shadow-red-950/60';
      case 'blue':
        return 'bg-gradient-to-b from-blue-500 to-blue-700 border-blue-300 text-white shadow-blue-950/60';
      case 'green':
        return 'bg-gradient-to-b from-emerald-500 to-emerald-700 border-emerald-300 text-white shadow-emerald-950/60';
      case 'yellow':
        return 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-200 text-slate-950 shadow-amber-950/60';
      case 'wild':
      default:
        return 'bg-gradient-to-tr from-red-600 via-amber-400 via-emerald-500 to-blue-600 border-slate-100 text-white shadow-purple-950/80';
    }
  };

  // Contenido visual del centro
  const renderCardContent = () => {
    if (card.type === 'number') {
      return <span className="font-black text-lg sm:text-2xl tracking-tighter">{card.number}</span>;
    }
    switch (card.type) {
      case 'skip':
        return <span className="font-black text-base sm:text-xl">🚫</span>;
      case 'reverse':
        return <span className="font-black text-base sm:text-xl">🔄</span>;
      case 'draw2':
        return <span className="font-black text-sm sm:text-lg">+2</span>;
      case 'wild':
        return <span className="font-black text-base sm:text-xl">🌈</span>;
      case 'wild_draw4':
        return <span className="font-black text-sm sm:text-lg">+4</span>;
      default:
        return null;
    }
  };

  const colorStyle = getColorClasses(card.color);
  const playabilityClass = isPlayable
    ? 'cursor-pointer hover:-translate-y-2 hover:shadow-2xl hover:scale-105 active:translate-y-0 ring-amber-400'
    : 'opacity-60 cursor-not-allowed grayscale-[20%]';
  const selectedClass = isSelected ? 'ring-4 ring-amber-400 -translate-y-3 shadow-2xl scale-105' : '';

  return (
    <button
      type="button"
      onClick={isPlayable ? onClick : undefined}
      disabled={!isPlayable}
      className={`relative select-none flex flex-col items-center justify-between p-1.5 transition-all duration-200 shadow-xl ${colorStyle} ${sizeClasses} ${playabilityClass} ${selectedClass} ${className}`}
      style={{
        boxShadow: isPlayable
          ? '0 10px 20px -3px rgba(0, 0, 0, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.4)'
          : 'none',
      }}
    >
      {/* Esquina Superior Izquierda */}
      <div className="self-start text-[10px] sm:text-xs font-black leading-none px-0.5">
        {card.type === 'number' ? card.number : card.type === 'skip' ? '🚫' : card.type === 'reverse' ? '🔄' : card.type === 'draw2' ? '+2' : card.type === 'wild' ? '🌈' : '+4'}
      </div>

      {/* Óvalo Blanco Interior Central */}
      <div className="w-[85%] h-[60%] bg-slate-50 rounded-full border border-slate-300 flex items-center justify-center text-slate-900 shadow-inner my-0.5">
        <div className="transform -rotate-6">{renderCardContent()}</div>
      </div>

      {/* Esquina Inferior Derecha (Invertida) */}
      <div className="self-end text-[10px] sm:text-xs font-black leading-none px-0.5 transform rotate-180">
        {card.type === 'number' ? card.number : card.type === 'skip' ? '🚫' : card.type === 'reverse' ? '🔄' : card.type === 'draw2' ? '+2' : card.type === 'wild' ? '🌈' : '+4'}
      </div>
    </button>
  );
}
