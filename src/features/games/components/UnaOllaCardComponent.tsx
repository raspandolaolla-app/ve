// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE VISUAL DE CARTA UNA-OLLA
// ==============================================================================
// Diseño fiel al UNO real: color sólido, óvalo blanco inclinado, símbolo
// grande coloreado, esquinas blancas, comodines negros cuatricolor.
// ==============================================================================

import React from 'react';
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

const SIZE_CLASSES = {
  sm: 'w-10 h-16 rounded-md border-2',
  md: 'w-16 h-24 rounded-lg border-[3px]',
  lg: 'w-24 h-36 rounded-xl border-4',
};

const COLOR_BG: Record<string, string> = {
  red: 'linear-gradient(160deg, #EF5350 0%, #D32F2F 55%, #B71C1C 100%)',
  blue: 'linear-gradient(160deg, #42A5F5 0%, #1E88E5 55%, #0D47A1 100%)',
  green: 'linear-gradient(160deg, #66BB6A 0%, #43A047 55%, #1B5E20 100%)',
  yellow: 'linear-gradient(160deg, #FFEE58 0%, #FBC02D 55%, #F57F17 100%)',
};

const SYMBOL_COLOR: Record<string, string> = {
  red: '#C62828',
  blue: '#1565C0',
  green: '#2E7D32',
  yellow: '#EF6C00',
};

// Óvalo cuatricolor (comodines) estilo UNO real
const WildOval: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`rounded-[50%/60%] border-2 border-white/90 flex items-center justify-center ${className}`}
    style={{
      background: 'conic-gradient(from 45deg, #D32F2F 0% 25%, #1E88E5 25% 50%, #43A047 50% 75%, #FBC02D 75% 100%)',
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
    }}
  >
    {children}
  </div>
);

const SkipIcon: React.FC<{ color: string; className?: string }> = ({ color, className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round">
    <circle cx="12" cy="12" r="8.5" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ReverseIcon: React.FC<{ color: string; className?: string }> = ({ color, className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} fill={color}>
    <path d="M6 8h9V5l6 5-6 5v-3H6z" />
    <path d="M18 16H9v3l-6-5 6-5v3h9z" transform="translate(0,4)" />
  </svg>
);

export function UnaOllaCardComponent({
  card,
  isBack = false,
  onClick,
  isPlayable = true,
  isSelected = false,
  size = 'md',
  className = '',
}: UnaOllaCardProps) {
  const sizeClasses = SIZE_CLASSES[size];

  // ------------------------------------------------------------------
  // REVERSO DE LA CARTA (negro con óvalo rojo y logo UNA-OLLA amarillo)
  // ------------------------------------------------------------------
  if (isBack || !card) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`relative select-none flex items-center justify-center border-white ${sizeClasses} ${className}`}
        style={{
          background: 'linear-gradient(160deg, #262626 0%, #111111 55%, #000000 100%)',
          boxShadow: '0 8px 16px -2px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.15)',
        }}
      >
        <div
          className="w-[82%] h-[58%] rounded-[50%/60%] border-2 border-amber-300/80 flex items-center justify-center transform -rotate-12"
          style={{
            background: 'linear-gradient(160deg, #FF7043 0%, #E53935 55%, #B71C1C 100%)',
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.5)',
          }}
        >
          <span
            className="font-black text-amber-300 tracking-tighter uppercase"
            style={{
              fontSize: size === 'lg' ? 14 : size === 'md' ? 9 : 6,
              textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            }}
          >
            UNA-OLLA
          </span>
        </div>
        {/* Brillo superior */}
        <div className="absolute top-1 left-2 right-2 h-[12%] rounded-full pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.25), transparent)' }}
        />
      </button>
    );
  }

  // ------------------------------------------------------------------
  // CARTA FRONTAL
  // ------------------------------------------------------------------
  const isWild = card.color === 'wild' || card.type === 'wild' || card.type === 'wild_draw4';
  const cardBg = isWild
    ? 'linear-gradient(160deg, #333333 0%, #1A1A1A 55%, #000000 100%)'
    : COLOR_BG[card.color] || COLOR_BG.red;

  const symbolColor = SYMBOL_COLOR[card.color] || '#C62828';

  // Tamaños de símbolo según size
  const bigDim = size === 'lg' ? 'w-12 h-12' : size === 'md' ? 'w-8 h-8' : 'w-5 h-5';
  const bigText = size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-2xl' : 'text-sm';
  const cornerText = size === 'lg' ? 'text-sm' : size === 'md' ? 'text-[11px]' : 'text-[8px]';

  const renderSymbol = (forCenter: boolean) => {
    const dim = forCenter ? bigDim : 'w-3 h-3';
    const txt = forCenter ? bigText : cornerText;
    switch (card.type) {
      case 'number':
        return (
          <span
            className={`font-black ${txt} leading-none`}
            style={{
              color: forCenter ? symbolColor : '#FFFFFF',
              textShadow: forCenter ? '0 1px 1px rgba(0,0,0,0.25)' : '0 1px 2px rgba(0,0,0,0.8)',
              fontStyle: 'italic',
            }}
          >
            {card.number}
          </span>
        );
      case 'skip':
        return <SkipIcon color={forCenter ? symbolColor : '#FFFFFF'} className={dim} />;
      case 'reverse':
        return <ReverseIcon color={forCenter ? symbolColor : '#FFFFFF'} className={dim} />;
      case 'draw2':
        return (
          <span className={`font-black ${txt} leading-none`}
            style={{ color: forCenter ? symbolColor : '#FFFFFF', textShadow: '0 1px 2px rgba(0,0,0,0.7)', fontStyle: 'italic' }}>
            +2
          </span>
        );
      case 'wild_draw4':
        return (
          <span className={`font-black ${txt} leading-none text-white`}
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)', fontStyle: 'italic' }}>
            +4
          </span>
        );
      case 'wild':
      default:
        return null;
    }
  };

  const playabilityClass = isPlayable
    ? 'cursor-pointer hover:-translate-y-2 hover:scale-105 active:translate-y-0'
    : 'opacity-50 cursor-not-allowed saturate-50';
  const selectedClass = isSelected ? '-translate-y-3 scale-105' : '';

  return (
    <button
      type="button"
      onClick={isPlayable ? onClick : undefined}
      disabled={!isPlayable}
      className={`relative select-none flex flex-col items-center justify-between p-1 transition-all duration-200 border-white ${sizeClasses} ${playabilityClass} ${selectedClass} ${className}`}
      style={{
        background: cardBg,
        boxShadow: isSelected
          ? '0 0 0 3px #FFC94B, 0 14px 26px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.35)'
          : isPlayable
          ? '0 10px 20px -3px rgba(0,0,0,0.55), inset 0 2px 4px rgba(255,255,255,0.35)'
          : '0 4px 8px rgba(0,0,0,0.4)',
      }}
    >
      {/* Esquina superior izquierda */}
      <div className="self-start leading-none px-0.5">{renderSymbol(false)}</div>

      {/* Centro: óvalo (blanco o cuatricolor) */}
      {isWild ? (
        <WildOval className="w-[80%] h-[56%] my-0.5 transform -rotate-12">
          {card.type === 'wild_draw4' && renderSymbol(true)}
        </WildOval>
      ) : (
        <div
          className="w-[80%] h-[56%] bg-white rounded-[50%/60%] flex items-center justify-center transform -rotate-12 my-0.5"
          style={{ boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.25)' }}
        >
          <div className="transform -rotate-6">{renderSymbol(true)}</div>
        </div>
      )}

      {/* Esquina inferior derecha (invertida) */}
      <div className="self-end leading-none px-0.5 transform rotate-180">{renderSymbol(false)}</div>

      {/* Brillo superior */}
      <div className="absolute top-1 left-2 right-2 h-[10%] rounded-full pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.3), transparent)' }}
      />
    </button>
  );
}
