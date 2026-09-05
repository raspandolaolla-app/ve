// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: TRUCO VENEZOLANO
// ==============================================================================
// • Baraja española REALISTA (marfil, índices, oros/copas/espadas/bastos, figuras)
// • Mesa HORIZONTAL 16:9 con pantalla completa obligatoria en móviles
// • 3 temas de mesa con fondos alusivos animados
// • Animaciones de lanzamiento de cartas y botones de CANTOS (Truco/Envido/Flor)
// • Compatible con GameContainer: onPlayCard(cardId) y onCanto(cantoType)
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, RotateCw, Maximize2, Flame, Zap, Trophy, Swords, Sparkles } from 'lucide-react';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';

interface TrucoBoardProps {
  state: any;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onPlayCard: (cardId: string) => void;
  onCanto: (cantoType: string) => void;
  onTimeout?: () => void;
}

// ==============================================================================
// 3 TEMAS DE MESA
// ==============================================================================
type ThemeKey = 'taberna' | 'neon' | 'llano';

const THEMES: Record<ThemeKey, any> = {
  taberna: {
    label: 'Taberna Criolla',
    swatch: ['#8B5A2B', '#F5E9CE', '#C62828'],
    felt: 'radial-gradient(ellipse at 50% 45%, #4E342E 0%, #3E2B1F 50%, #241811 82%, #1C120C 100%)',
    frame: 'linear-gradient(145deg, #8B5A2B 0%, #6B4423 45%, #4E2E17 100%)',
    accent: '#FFC94B',
    text: '#F0E2C8',
    sub: '#A8865A',
    panel: 'linear-gradient(145deg, #2B1D14 0%, #1C120C 100%)',
    border: '#3E2B1F',
  },
  neon: {
    label: 'Neón Tricolor',
    swatch: ['#FFD100', '#00E0FF', '#FF2D55'],
    felt: 'radial-gradient(ellipse at 50% 45%, #101A45 0%, #0A1030 50%, #030512 100%)',
    frame: 'linear-gradient(145deg, #1B2A5E 0%, #0A1030 100%)',
    accent: '#FFD100',
    text: '#EAF2FF',
    sub: '#7C8DB5',
    panel: 'linear-gradient(145deg, #0A1030 0%, #05081A 100%)',
    border: '#1B2A5E',
  },
  llano: {
    label: 'Llano Verde',
    swatch: ['#0E5A34', '#FAF0E1', '#FFC94B'],
    felt: 'radial-gradient(ellipse at 50% 45%, #147A46 0%, #0E5A34 50%, #052A18 100%)',
    frame: 'linear-gradient(145deg, #6B4423 0%, #4E2E17 100%)',
    accent: '#FFC94B',
    text: '#F5EFDD',
    sub: '#9CC4A8',
    panel: 'linear-gradient(145deg, rgba(5,25,15,0.92) 0%, rgba(3,18,10,0.92) 100%)',
    border: '#147A46',
  },
};

// ==============================================================================
// UTILIDADES DE CARTAS (lectura defensiva del estado)
// ==============================================================================
const normalizeSuit = (s: any): string => {
  const v = (s || '').toString().toLowerCase();
  if (['oro', 'oros', 'coins', 'gold', 'o'].includes(v)) return 'oro';
  if (['copa', 'copas', 'cups', 'c'].includes(v)) return 'copa';
  if (['espada', 'espadas', 'swords', 'e'].includes(v)) return 'espada';
  if (['basto', 'bastos', 'bastos', 'clubs', 'b'].includes(v)) return 'basto';
  return 'oro';
};

const getRank = (card: any): number => {
  const r = card?.rank ?? card?.number ?? card?.value ?? card?.num;
  return Number(r) || 1;
};

const SUIT_COLOR: Record<string, string> = {
  oro: '#D4A017',
  copa: '#C62828',
  espada: '#3949AB',
  basto: '#2E7D32',
};

const FACE_NAMES: Record<number, string> = { 10: 'SOTA', 11: 'CABALLO', 12: 'REY' };

// ==============================================================================
// SVG DE PALOS ESPAÑOLES (realistas y estilizados)
// ==============================================================================
const SuitSVG: React.FC<{ suit: string; className?: string }> = ({ suit, className = '' }) => {
  const s = normalizeSuit(suit);
  if (s === 'oro') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <circle cx="12" cy="12" r="9" fill="#F2B705" stroke="#8B6914" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="4.5" fill="#FFE082" stroke="#8B6914" strokeWidth="1" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1="12" y1="4" x2="12" y2="6" stroke="#8B6914" strokeWidth="1" transform={`rotate(${a} 12 12)`} />
        ))}
      </svg>
    );
  }
  if (s === 'copa') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M5 3h14v4c0 4-3 6-5 7v4h3v3H7v-3h3v-4c-2-1-5-3-5-7z" fill="#C62828" stroke="#7F1010" strokeWidth="1" />
        <path d="M6 4h12v2H6z" fill="#EF9A9A" opacity="0.6" />
      </svg>
    );
  }
  if (s === 'espada') {
    return (
      <svg viewBox="0 0 24 24" className={className}>
        <path d="M12 1l2.5 5v9h-5V6z" fill="#90A4AE" stroke="#37474F" strokeWidth="1" />
        <rect x="7" y="15" width="10" height="2.4" rx="1" fill="#3949AB" stroke="#1A237E" strokeWidth="0.8" />
        <rect x="10.8" y="17.4" width="2.4" height="5" rx="1" fill="#3949AB" stroke="#1A237E" strokeWidth="0.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        d="M10 2h4c1.2 3 1.2 5 0 7 2.2 1 2.2 4 0 5 1.2 2 1.2 5 0 8h-4c-1.2-3-1.2-6 0-8-2.2-1-2.2-4 0-5-1.2-2-1.2-4 0-7z"
        fill="#2E7D32"
        stroke="#1B5E20"
        strokeWidth="1"
      />
    </svg>
  );
};

// Posiciones de palos en el centro (como cartas reales)
const PIP_MAP: Record<number, number[]> = {
  1: [4], 2: [1, 7], 3: [1, 4, 7], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8], 7: [0, 2, 3, 4, 5, 6, 8],
};

// ==============================================================================
// CARTA ESPAÑOLA REALISTA
// ==============================================================================
const SpanishCard: React.FC<{
  card: any;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  playable?: boolean;
  selected?: boolean;
  disabled?: boolean;
}> = ({ card, size = 'md', onClick, playable, selected, disabled }) => {
  const rank = getRank(card);
  const suit = normalizeSuit(card?.suit ?? card?.palo);
  const isFace = rank >= 10;

  const dims = size === 'lg' ? 'w-24 h-36 rounded-lg' : size === 'md' ? 'w-16 h-24 rounded-md' : 'w-10 h-16 rounded';
  const cornerText = size === 'lg' ? 'text-sm' : size === 'md' ? 'text-[11px]' : 'text-[8px]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative select-none ${dims} border-2 transition-all duration-200 ${
        playable ? 'cursor-pointer hover:-translate-y-3 hover:scale-105' : ''
      } ${selected ? '-translate-y-3 scale-105' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      style={{
        background: 'linear-gradient(160deg, #FFFBEE 0%, #F7EDD3 55%, #EFE2C0 100%)',
        borderColor: selected ? '#FFC94B' : '#C9B896',
        boxShadow: selected
          ? '0 0 0 3px #FFC94B, 0 14px 26px rgba(0,0,0,0.6)'
          : playable
          ? '0 8px 18px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.8)'
          : '0 4px 10px rgba(0,0,0,0.45)',
      }}
    >
      {/* Marco interior español */}
      <div className="absolute inset-[6%] border pointer-events-none rounded-sm" style={{ borderColor: 'rgba(139,107,67,0.45)' }} />

      {/* Esquina superior izquierda */}
      <div className="absolute top-[4%] left-[7%] flex flex-col items-center leading-none">
        <span className={`font-black ${cornerText}`} style={{ color: '#3E2B1F' }}>{rank}</span>
        <SuitSVG suit={suit} className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} />
      </div>

      {/* Esquina inferior derecha (invertida) */}
      <div className="absolute bottom-[4%] right-[7%] flex flex-col items-center leading-none transform rotate-180">
        <span className={`font-black ${cornerText}`} style={{ color: '#3E2B1F' }}>{rank}</span>
        <SuitSVG suit={suit} className={size === 'lg' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} />
      </div>

      {/* Centro */}
      <div className="absolute inset-[18%] flex items-center justify-center">
        {isFace ? (
          <div
            className="w-full h-full rounded-sm border flex flex-col items-center justify-center gap-0.5"
            style={{ background: `linear-gradient(160deg, ${SUIT_COLOR[suit]}22, ${SUIT_COLOR[suit]}44)`, borderColor: `${SUIT_COLOR[suit]}88` }}
          >
            <SuitSVG suit={suit} className={size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'} />
            <span className="font-black tracking-tight" style={{ color: SUIT_COLOR[suit], fontSize: size === 'lg' ? 9 : 6 }}>
              {FACE_NAMES[rank]}
            </span>
          </div>
        ) : (
          <div className="w-full h-full grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex items-center justify-center">
                {PIP_MAP[rank]?.includes(i) && (
                  <SuitSVG suit={suit} className={size === 'lg' ? 'w-5 h-5' : size === 'md' ? 'w-3.5 h-3.5' : 'w-2 h-2'} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
};

// Reverso español (azul con rombos dorados)
const CardBack: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dims = size === 'lg' ? 'w-24 h-36 rounded-lg' : size === 'md' ? 'w-16 h-24 rounded-md' : 'w-8 h-12 rounded';
  return (
    <div
      className={`${dims} border-2 border-white/80 relative overflow-hidden`}
      style={{
        background: 'linear-gradient(160deg, #1A237E 0%, #0D1442 100%)',
        boxShadow: '0 6px 14px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.25)',
      }}
    >
      <div
        className="absolute inset-[8%] rounded-sm border border-amber-300/50"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(255,201,75,0.25) 0px, rgba(255,201,75,0.25) 2px, transparent 2px, transparent 8px), repeating-linear-gradient(-45deg, rgba(255,201,75,0.25) 0px, rgba(255,201,75,0.25) 2px, transparent 2px, transparent 8px)',
        }}
      />
    </div>
  );
};

// ==============================================================================
// CANTOS DEL TRUCO VENEZOLANO
// ==============================================================================
const CANTOS = [
  { id: 'ENVIDO', label: 'ENVIDO', grad: 'linear-gradient(145deg,#43A047,#1B5E20)' },
  { id: 'REAL_ENVIDO', label: 'REAL ENVIDO', grad: 'linear-gradient(145deg,#2E7D32,#0D3D10)' },
  { id: 'FALTA_ENVIDO', label: 'FALTA ENVIDO', grad: 'linear-gradient(145deg,#1B5E20,#052A18)' },
  { id: 'TRUCO', label: '¡TRUCO!', grad: 'linear-gradient(145deg,#E53935,#8B1E2D)' },
  { id: 'RETRUCO', label: 'RETRUCO', grad: 'linear-gradient(145deg,#C62828,#6B1420)' },
  { id: 'VALE_NUEVE', label: 'VALE 9', grad: 'linear-gradient(145deg,#B71C1C,#4A0D16)' },
  { id: 'VALE_JUEGO', label: 'VALE JUEGO', grad: 'linear-gradient(145deg,#8B1E2D,#2A050B)' },
  { id: 'FLOR', label: '¡FLOR!', grad: 'linear-gradient(145deg,#F2B705,#B8860B)' },
];

const RESPUESTAS = [
  { id: 'QUIERO', label: '¡QUIERO!', grad: 'linear-gradient(145deg,#43A047,#1B5E20)' },
  { id: 'NO_QUIERO', label: 'NO QUIERO', grad: 'linear-gradient(145deg,#757575,#424242)' },
];

// ==============================================================================
// COMPONENTE PRINCIPAL
// ==============================================================================
export const TrucoBoard: React.FC<TrucoBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  onPlayCard,
  onCanto,
  onTimeout,
}) => {
  const s: any = state || {};

  const handleTimeout = () => {
    if (isMyTurn) {
      if (onTimeout) onTimeout();
      else if (sessionId) GameRepository.expireTurn(sessionId);
    }
  };

  // ----- Tema -----
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_truco_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'taberna';
  });
  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => {
    setThemeKey(k);
    try { localStorage.setItem('rlo_truco_theme', k); } catch {}
  };

  // ----- Pantalla completa obligatoria en móvil -----
  const isTouch = typeof window !== 'undefined' && (navigator as any).maxTouchPoints > 0;
  const [fsPrompt, setFsPrompt] = useState<boolean>(isTouch);
  const goFullscreen = async () => {
    try {
      await (document.documentElement as any).requestFullscreen?.();
    } catch {}
    try {
      (screen.orientation as any)?.lock?.('landscape').catch(() => {});
    } catch {}
    setFsPrompt(false);
  };

  // ----- Lectura defensiva -----
  const players: any[] = Array.isArray(s.players) ? s.players : [];
  const opponents = players.filter((p) => p.userId !== currentUserId);
  const me = players.find((p) => p.userId === currentUserId);
  const turnUserId = s.turnUserId || s.currentTurnUserId || '';
  const status = s.status || 'playing';
  const isMyTurn = turnUserId === currentUserId && status === 'playing';

  const getHand = (uid: string): any[] => {
    if (Array.isArray(s.hands?.[uid])) return s.hands[uid];
    if (Array.isArray(s.playerHands?.[uid])) return s.playerHands[uid];
    const p = players.find((pl) => pl.userId === uid);
    if (Array.isArray(p?.hand)) return p.hand;
    return [];
  };
  const myHand: any[] = getHand(currentUserId);

  // Cartas jugadas en la mesa
  const played: any[] = Array.isArray(s.playedCards) ? s.playedCards
    : Array.isArray(s.tableCards) ? s.tableCards
    : Array.isArray(s.roundCards) ? s.roundCards
    : Array.isArray(s.trickCards) ? s.trickCards
    : [];

  // Canto pendiente de respuesta (del rival)
  const pendingCanto = s.pendingCanto || s.awaitingCanto || s.lastCantoPending || null;

  // Puntajes (nosotros/ellos o por jugador)
  const myScore = s.scores?.[currentUserId] ?? s.myScore ?? s.teamAScore ?? 0;
  const rivalScore = opponents[0] ? (s.scores?.[opponents[0].userId] ?? s.teamBScore ?? 0) : (s.teamBScore ?? 0);

  const getDisplayName = (p: any): string => p?.displayName || p?.name || 'JUGADOR';

  return (
    <div className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-6xl mx-auto w-full max-w-full overflow-x-hidden">

      {/* ===== OVERLAY: PANTALLA COMPLETA OBLIGATORIA (MÓVIL) ===== */}
      <AnimatePresence>
        {fsPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <div className="max-w-sm w-full text-center space-y-5 p-6 rounded-3xl border-2"
              style={{ background: T.panel, borderColor: T.accent }}>
              <motion.div
                animate={{ rotate: [0, 90, 90, 0] }}
                transition={{ duration: 2.5, repeat: Infinity }}
                className="mx-auto w-14 h-14 rounded-2xl border-2 flex items-center justify-center"
                style={{ borderColor: T.accent }}
              >
                <RotateCw className="w-7 h-7" style={{ color: T.accent }} />
              </motion.div>
              <div>
                <div className="text-lg font-black uppercase tracking-wider" style={{ color: T.text }}>
                  Truco Venezolano
                </div>
                <p className="text-xs mt-1" style={{ color: T.sub }}>
                  Gira el dispositivo a <strong style={{ color: T.accent }}>HORIZONTAL</strong> y activa pantalla completa para la mejor experiencia de mesa.
                </p>
              </div>
              <button
                onClick={goFullscreen}
                className="w-full py-4 rounded-2xl font-black uppercase tracking-wider text-base flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`,
                  color: '#1A120C',
                  boxShadow: `0 8px 26px ${T.accent}66`,
                }}
              >
                <Maximize2 className="w-5 h-5" /> Jugar en Pantalla Completa
              </button>
              <button onClick={() => setFsPrompt(false)} className="text-[10px] underline" style={{ color: T.sub }}>
                continuar sin pantalla completa
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== BARRA DE TEMAS + MARCADOR ===== */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full mb-2.5 flex items-center justify-between px-3 py-2 rounded-xl border"
        style={{ background: T.panel, borderColor: T.border }}
      >
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4" style={{ color: T.accent }} />
          <div className="flex items-center gap-1.5">
            {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
              <button key={k} onClick={() => changeTheme(k)} title={THEMES[k].label}
                className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg border transition-all"
                style={{
                  borderColor: themeKey === k ? THEMES[k].accent : T.border,
                  background: themeKey === k ? 'rgba(255,255,255,0.1)' : 'transparent',
                }}>
                {THEMES[k].swatch.map((c: string, i: number) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full border border-black/30" style={{ background: c }} />
                ))}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={goFullscreen} className="p-1.5 rounded-lg border" style={{ borderColor: T.border }} title="Pantalla completa">
            <Maximize2 className="w-3.5 h-3.5" style={{ color: T.accent }} />
          </button>
          <div className="flex items-center gap-2 text-xs font-black font-mono">
            <span style={{ color: '#34D399' }}>NOSOTROS {Number(myScore)}</span>
            <span style={{ color: T.sub }}>—</span>
            <span style={{ color: '#F87171' }}>{Number(rivalScore)} ELLOS</span>
          </div>
        </div>
      </motion.div>

      {/* ===== TEMPORIZADOR Y ESTADO DE TURNO ===== */}
      <div className="w-full mb-3 flex flex-col items-center gap-1.5">
        <TurnTimer
          turnExpiresAt={turnExpiresAt}
          durationSeconds={20}
          isMyTurn={isMyTurn}
          activePlayerName={players.find((p: any) => p.userId === turnUserId)?.displayName || 'RIVAL'}
          status={status}
          onTimeout={handleTimeout}
        />
        <div>
          {isMyTurn ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs border border-emerald-500/40 animate-pulse">
              <Zap className="w-3.5 h-3.5" /> 🎯 Tu turno — Tira una carta o canta
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-neutral-900/80 text-neutral-400 text-xs border border-neutral-800">
              ⏳ Esperando jugada del rival...
            </span>
          )}
        </div>
      </div>

      {/* ===== MESA HORIZONTAL 16:9 ===== */}
      <div
        className="relative w-full rounded-[36px] border-[10px] sm:border-[14px] overflow-hidden"
        style={{
          aspectRatio: '16 / 9',
          borderColor: '#3a2012',
          background: T.felt,
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9), inset 0 4px 24px rgba(0,0,0,0.6)',
        }}
      >
        {/* Textura del paño */}
        <div className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, transparent 2px, transparent 6px)' }}
        />

        {/* Logo en relieve */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08]">
          <div className="px-10 py-4 rounded-full border-4 border-amber-400/60 transform -rotate-12">
            <span className="text-4xl sm:text-6xl font-black tracking-tighter uppercase" style={{ color: T.accent }}>TRUCO</span>
          </div>
        </div>

        {/* ===== RIVALES (arriba) ===== */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-start gap-3 z-10">
          {opponents.slice(0, 3).map((p: any, i: number) => {
            const isActive = turnUserId === p.userId && status === 'playing';
            return (
              <motion.div
                key={p.userId}
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.08 }}
                className="flex flex-col items-center gap-1 p-2 rounded-2xl border-2"
                style={{
                  background: T.panel,
                  borderColor: isActive ? T.accent : T.border,
                  boxShadow: isActive ? `0 0 22px ${T.accent}66` : '0 6px 14px rgba(0,0,0,0.45)',
                }}
              >
                <div className="text-[10px] font-black uppercase truncate max-w-[80px]" style={{ color: T.text }}>
                  {getDisplayName(p).toUpperCase()}
                </div>
                <div className="flex">
                  {Array.from({ length: Math.min(getHand(p.userId).length, 3) }).map((_, j) => (
                    <div key={j} className={j > 0 ? '-ml-3' : ''} style={{ transform: `rotate(${(j - 1) * 6}deg)` }}>
                      <CardBack size="sm" />
                    </div>
                  ))}
                </div>
                <span className="text-[9px] font-mono font-bold" style={{ color: T.sub }}>{getHand(p.userId).length} cartas</span>
              </motion.div>
            );
          })}
        </div>

        {/* ===== CENTRO: CARTAS JUGADAS CON ANIMACIÓN ===== */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 sm:gap-8 z-10">
          {played.length === 0 ? (
            <motion.span
              animate={{ opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-xs sm:text-sm font-bold uppercase tracking-widest"
              style={{ color: T.text }}
            >
              {isMyTurn ? 'Lanza tu carta al centro' : 'Esperando jugadas...'}
            </motion.span>
          ) : (
            played.map((entry: any, i: number) => {
              const card = entry?.card || entry;
              const owner = players.find((p: any) => p.userId === (entry?.userId || entry?.playerId));
              return (
                <motion.div
                  key={`${entry?.userId || i}-${i}`}
                  initial={{ scale: 0.3, rotate: -160, y: 60, opacity: 0 }}
                  animate={{ scale: 1, rotate: (i % 2 === 0 ? -6 : 6), y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  className="flex flex-col items-center gap-1"
                >
                  <SpanishCard card={card} size="lg" />
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(0,0,0,0.55)', color: T.accent }}>
                    {owner ? getDisplayName(owner).toUpperCase() : 'CARTA'}
                  </span>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Banner de canto */}
        <AnimatePresence>
          {s.lastCanto && (
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              className="absolute left-1/2 top-[24%] -translate-x-1/2 z-20 px-6 py-2 rounded-2xl font-black text-xl uppercase tracking-widest"
              style={{
                background: 'linear-gradient(145deg, #E53935, #8B1E2D)',
                color: '#FFF',
                boxShadow: '0 0 30px rgba(229,57,53,0.7)',
                transform: 'rotate(-6deg)',
              }}
            >
              ¡{String(s.lastCanto).replace(/_/g, ' ')}!
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== MI PERFIL (abajo izquierda) ===== */}
        {me && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-2xl border-2"
            style={{
              background: T.panel,
              borderColor: isMyTurn ? T.accent : T.border,
              boxShadow: isMyTurn ? `0 0 22px ${T.accent}66` : '0 6px 14px rgba(0,0,0,0.45)',
            }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-black"
              style={{ background: 'linear-gradient(145deg,#4A5568,#2D3748)', color: '#F7FAFC', border: `2px solid ${isMyTurn ? T.accent : 'rgba(255,255,255,0.25)'}` }}>
              {getDisplayName(me).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-[10px] font-black uppercase" style={{ color: T.text }}>
                {getDisplayName(me).toUpperCase()} <span style={{ color: T.accent }}>(TÚ)</span>
              </div>
              {isMyTurn && (
                <div className="text-[9px] font-black uppercase animate-pulse" style={{ color: '#34D399' }}>¡Tu turno!</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== ZONA DE CANTOS ===== */}
      <div className="w-full mt-2.5 p-2.5 rounded-2xl border" style={{ background: T.panel, borderColor: T.border }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Swords className="w-3.5 h-3.5" style={{ color: T.accent }} />
          <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: T.sub }}>
            {pendingCanto ? 'El rival cantó — responde:' : 'Tus cantos:'}
          </span>
        </div>
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1">
          {(pendingCanto ? RESPUESTAS : CANTOS).map((canto, i) => (
            <motion.button
              key={canto.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onCanto(canto.id)}
              disabled={!isMyTurn && !pendingCanto}
              className="shrink-0 px-3.5 sm:px-5 py-2.5 rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-wider text-white border border-white/30 disabled:opacity-40"
              style={{
                background: canto.grad,
                boxShadow: `0 5px 14px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.3)${pendingCanto ? `, 0 0 16px ${T.accent}88` : ''}`,
              }}
            >
              {canto.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* ===== MI MANO ===== */}
      <div className="w-full mt-2.5 p-3 rounded-2xl border" style={{ background: T.panel, borderColor: T.border }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: T.text }}>
            🃏 Tu mano ({myHand.length})
          </span>
          {isMyTurn && (
            <span className="flex items-center gap-1 text-[10px] font-black uppercase animate-pulse" style={{ color: '#34D399' }}>
              <Zap className="w-3 h-3" /> Toca una carta para lanzar
            </span>
          )}
        </div>
        <div className="flex items-end justify-center gap-1.5 sm:gap-3 pt-4 pb-1 overflow-x-auto no-scrollbar">
          {myHand.length > 0 ? (
            myHand.map((c: any, i: number) => (
              <motion.div
                key={c.id || i}
                initial={{ y: 60, opacity: 0, rotate: 0 }}
                animate={{ y: 0, opacity: 1, rotate: (i - (myHand.length - 1) / 2) * 3 }}
                transition={{ delay: i * 0.08 }}
                className="shrink-0"
              >
                <SpanishCard
                  card={c}
                  size="md"
                  playable={isMyTurn}
                  onClick={() => isMyTurn && onPlayCard(c.id)}
                />
              </motion.div>
            ))
          ) : (
            <div className="text-[10px] py-3 font-mono" style={{ color: T.sub }}>Esperando reparto de cartas...</div>
          )}
        </div>
      </div>

      {/* ===== BANNER FINAL ===== */}
      <AnimatePresence>
        {status !== 'playing' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mt-3 w-full p-4 rounded-2xl text-center font-black text-sm flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`,
              color: '#1A120C',
              boxShadow: `0 8px 24px ${T.accent}66`,
            }}
          >
            <Trophy className="w-5 h-5" />
            ¡MANO CONCLUIDA! {s.roundWinnerUserId ? `GANADOR: ${(players.find((p: any) => p.userId === s.roundWinnerUserId)?.name || '').toUpperCase()}` : ''}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pie */}
      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: T.sub }}>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.accent})` }} />
        <span>🇻🇪 Truco Venezolano 🇻🇪</span>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.accent})` }} />
      </div>
    </div>
  );
};
