// ==============================================================================
// RASPANDO LA OLLA — PIEZAS VECTORIALES DE AJEDREZ DE ALTA DEFINICIÓN
// ==============================================================================
// Componentes SVG profesionales con borde reforzado, relieve 3D, sombras
// y contraste óptimo sobre cualquier fondo o tema de tablero.
// ==============================================================================

import React from 'react';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

interface ChessPieceSVGProps {
  type: PieceType;
  color: PieceColor;
  className?: string;
}

export const ChessPieceSVG: React.FC<ChessPieceSVGProps> = ({ type, color, className = 'w-full h-full' }) => {
  const isWhite = color === 'w';

  // Estilos de color y sombra para máximo contraste
  // Blancas: Blanco cremoso con brillo interno, relieve y contorno oscuro carbón
  // Negras: Negro carbón mate con relieve satinado y contorno gris perla
  const fillWhite = '#fdfbf7';
  const strokeWhite = '#1e293b';
  const fillBlack = '#18181b';
  const strokeBlack = '#38bdf8'; // Toque sutil o #e2e8f0 para contorno ultra nítido
  const accentBlack = '#27272a';

  switch (type) {
    case 'p': // Peón
      return isWhite ? (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.6))">
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            fill={fillWhite}
            stroke={strokeWhite}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Brillo 3D en la cabeza del peón */}
          <circle cx="21" cy="11.5" r="1.5" fill="#ffffff" opacity="0.9" />
        </svg>
      ) : (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.75))">
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            fill={fillBlack}
            stroke="#94a3b8"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M12 39.5h21" stroke="#cbd5e1" strokeWidth="1" />
        </svg>
      );

    case 'n': // Caballo
      return isWhite ? (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.6))">
          <g fill="none" fillRule="evenodd" stroke={strokeWhite} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18"
              fill={fillWhite}
            />
            <path
              d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10"
              fill={fillWhite}
            />
            <circle cx="14.5" cy="15.5" r="1.2" fill="#0f172a" stroke="none" />
            <path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill="#0f172a" stroke="none" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.75))">
          <g fill="none" fillRule="evenodd" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18"
              fill={fillBlack}
            />
            <path
              d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10"
              fill={fillBlack}
            />
            <circle cx="14.5" cy="15.5" r="1.2" fill="#f8fafc" stroke="none" />
            <path d="M 9.5 25.5 A 0.5 0.5 0 1 1 8.5,25.5 A 0.5 0.5 0 1 1 9.5 25.5 z" fill="#f8fafc" stroke="none" />
          </g>
        </svg>
      );

    case 'b': // Alfil
      return isWhite ? (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.6))">
          <g fill="none" fillRule="evenodd" stroke={strokeWhite} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <g fill={fillWhite}>
              <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.54 9,36 9,36 z" />
              <path d="M 12,36 C 11,32 18.5,27.7 16,21 C 13.5,14.3 22.5,10 22.5,10 C 22.5,10 31.5,14.3 29,21 C 26.5,27.7 34,32 33,36 z" />
              <circle cx="22.5" cy="8" r="2.5" />
            </g>
            <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.75))">
          <g fill="none" fillRule="evenodd" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <g fill={fillBlack}>
              <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.54 9,36 9,36 z" />
              <path d="M 12,36 C 11,32 18.5,27.7 16,21 C 13.5,14.3 22.5,10 22.5,10 C 22.5,10 31.5,14.3 29,21 C 26.5,27.7 34,32 33,36 z" />
              <circle cx="22.5" cy="8" r="2.5" />
            </g>
            <path d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18" stroke="#cbd5e1" />
          </g>
        </svg>
      );

    case 'r': // Torre
      return isWhite ? (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.6))">
          <g fill={fillWhite} stroke={strokeWhite} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,39 L 36,39 L 36,36 L 9,36 z" />
            <path d="M 12,36 L 12,32 L 33,32 L 33,36 z" />
            <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z" />
            <path d="M 34,14 L 31,17 L 14,17 L 11,14 z" />
            <path d="M 14,17 L 14,29.5 L 31,29.5 L 31,17 z" />
            <path d="M 14,29.5 L 12,32 L 33,32 L 31,29.5 z" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.75))">
          <g fill={fillBlack} stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,39 L 36,39 L 36,36 L 9,36 z" />
            <path d="M 12,36 L 12,32 L 33,32 L 33,36 z" />
            <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14 z" />
            <path d="M 34,14 L 31,17 L 14,17 L 11,14 z" />
            <path d="M 14,17 L 14,29.5 L 31,29.5 L 31,17 z" />
            <path d="M 14,29.5 L 12,32 L 33,32 L 31,29.5 z" />
          </g>
        </svg>
      );

    case 'q': // Dama
      return isWhite ? (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.6))">
          <g fill={fillWhite} stroke={strokeWhite} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.5 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.5 L 14,25 L 6.5,13.5 z" />
            <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 L 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 z" />
            <circle cx="6" cy="12" r="2" />
            <circle cx="14" cy="9" r="2" />
            <circle cx="22.5" cy="8" r="2" />
            <circle cx="31" cy="9" r="2" />
            <circle cx="39" cy="12" r="2" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.75))">
          <g fill={fillBlack} stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.5 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.5 L 14,25 L 6.5,13.5 z" />
            <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 L 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 z" />
            <circle cx="6" cy="12" r="2" />
            <circle cx="14" cy="9" r="2" />
            <circle cx="22.5" cy="8" r="2" />
            <circle cx="31" cy="9" r="2" />
            <circle cx="39" cy="12" r="2" />
          </g>
        </svg>
      );

    case 'k': // Rey
      return isWhite ? (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.6))">
          <g fill="none" stroke={strokeWhite} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22.5,11.5 L 22.5,6 M 20,8 L 25,8" strokeWidth="1.8" />
            <path
              d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25"
              fill={fillWhite}
            />
            <path
              d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 36.5,32 38,24.5 38,20 C 38,15.5 30.5,16.5 27.5,19 C 24.5,21.5 20.5,21.5 17.5,19 C 14.5,16.5 7,15.5 7,20 C 7,24.5 8.5,32 11.5,37 z"
              fill={fillWhite}
            />
            <path d="M 11.5,30 C 17,27 28,27 33.5,30" />
            <path d="M 11.5,33.5 C 17,30.5 28,30.5 33.5,33.5" />
            <path d="M 11.5,37 C 17,34 28,34 33.5,37" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 45 45" className={className} filter="drop-shadow(0px 3px 4px rgba(0,0,0,0.75))">
          <g fill="none" stroke="#94a3b8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22.5,11.5 L 22.5,6 M 20,8 L 25,8" stroke="#cbd5e1" strokeWidth="1.8" />
            <path
              d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 24,11.5 21,11.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25"
              fill={fillBlack}
            />
            <path
              d="M 11.5,37 C 17,40.5 28,40.5 33.5,37 C 36.5,32 38,24.5 38,20 C 38,15.5 30.5,16.5 27.5,19 C 24.5,21.5 20.5,21.5 17.5,19 C 14.5,16.5 7,15.5 7,20 C 7,24.5 8.5,32 11.5,37 z"
              fill={fillBlack}
            />
            <path d="M 11.5,30 C 17,27 28,27 33.5,30" stroke="#cbd5e1" />
            <path d="M 11.5,33.5 C 17,30.5 28,30.5 33.5,33.5" stroke="#cbd5e1" />
            <path d="M 11.5,37 C 17,34 28,34 33.5,37" stroke="#cbd5e1" />
          </g>
        </svg>
      );

    default:
      return null;
  }
};
