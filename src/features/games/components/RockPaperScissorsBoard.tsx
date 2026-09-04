// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: PIEDRA, PAPEL O TIJERA
// ==============================================================================
// • 3 TEMAS con fondos alusivos animados (rayos criollos / neón tricolor / paño verde)
// • Medallones 3D animados para Piedra, Papel y Tijera
// • Compatible 100% con Supabase y GameContainer (SIN sonidos)
// ==============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ShieldCheck, RefreshCw, Flame, Zap, Palette, Swords } from 'lucide-react';
import type { RPSState, RPSChoice } from '../../../types/games';

interface RockPaperScissorsBoardProps {
  state: RPSState;
  currentUserId: string;
  onSubmitChoice: (choice: RPSChoice) => void;
  onNextRound?: () => void;
}

// ==============================================================================
// SISTEMA DE TEMAS (3 FONDOS ALUSIVOS)
// ==============================================================================
type ThemeKey = 'criollo' | 'neon' | 'verde';

const THEMES: Record<ThemeKey, any> = {
  criollo: {
    label: 'Criollo Clásico',
    swatch: ['#FFC94B', '#003DA5', '#EF3340'],
    base: 'radial-gradient(ellipse at 50% 30%, #3A2A14 0%, #2B1D14 50%, #1C120C 100%)',
    accent: '#FFC94B',
    text: '#F0E2C8',
    sub: '#A8865A',
    panel: 'linear-gradient(145deg, #2B1D14 0%, #1C120C 100%)',
    border: '#3E2B1F',
    choices: {
      rock: { grad: 'linear-gradient(145deg, #D97706 0%, #92400E 60%, #78350F 100%)', glow: 'rgba(255, 170, 60, 0.55)' },
      paper: { grad: 'linear-gradient(145deg, #0284C7 0%, #075985 60%, #0C4A6E 100%)', glow: 'rgba(56, 189, 248, 0.55)' },
      scissors: { grad: 'linear-gradient(145deg, #059669 0%, #047857 60%, #065F46 100%)', glow: 'rgba(52, 211, 153, 0.55)' },
    },
  },
  neon: {
    label: 'Neón Tricolor',
    swatch: ['#FFD100', '#00E0FF', '#FF2D55'],
    base: 'radial-gradient(ellipse at 50% 30%, #0A1030 0%, #060A20 50%, #030512 100%)',
    accent: '#FFD100',
    text: '#EAF2FF',
    sub: '#7C8DB5',
    panel: 'linear-gradient(145deg, #0A1030 0%, #05081A 100%)',
    border: '#1B2A5E',
    choices: {
      rock: { grad: 'linear-gradient(145deg, #FF2D55 0%, #B3123A 60%, #7A0C28 100%)', glow: 'rgba(255, 45, 85, 0.6)' },
      paper: { grad: 'linear-gradient(145deg, #00E0FF 0%, #0090C8 60%, #006090 100%)', glow: 'rgba(0, 224, 255, 0.6)' },
      scissors: { grad: 'linear-gradient(145deg, #FFD100 0%, #D9A400 60%, #A87C00 100%)', glow: 'rgba(255, 209, 0, 0.6)' },
    },
  },
  verde: {
    label: 'Paño Verde Pro',
    swatch: ['#0E5A34', '#FAF0E1', '#FFC94B'],
    base: 'radial-gradient(ellipse at 50% 30%, #147A46 0%, #0E5A34 50%, #052A18 100%)',
    accent: '#FFC94B',
    text: '#F5EFDD',
    sub: '#9CC4A8',
    panel: 'linear-gradient(145deg, rgba(10,40,25,0.92) 0%, rgba(5,25,15,0.92) 100%)',
    border: '#147A46',
    choices: {
      rock: { grad: 'linear-gradient(145deg, #8B5A2B 0%, #6B4423 60%, #4E2E17 100%)', glow: 'rgba(255, 201, 75, 0.5)' },
      paper: { grad: 'linear-gradient(145deg, #F5EFDD 0%, #DCC69F 60%, #BFAE8C 100%)', glow: 'rgba(255, 255, 255, 0.45)' },
      scissors: { grad: 'linear-gradient(145deg, #B32430 0%, #8B1E2D 60%, #6B1420 100%)', glow: 'rgba(239, 68, 68, 0.5)' },
    },
  },
};

const CHOICES: { id: RPSChoice; label: string; icon: string; beats: string }[] = [
  { id: 'rock', label: 'Piedra', icon: '🪨', beats: 'Tijera' },
  { id: 'paper', label: 'Papel', icon: '📄', beats: 'Piedra' },
  { id: 'scissors', label: 'Tijera', icon: '✂️', beats: 'Papel' },
];

// ==============================================================================
// FONDO ALUSIVO ANIMADO SEGÚN TEMA
// ==============================================================================
const ThemeBackdrop: React.FC<{ themeKey: ThemeKey; theme: any }> = ({ themeKey, theme }) => {
  if (themeKey === 'criollo') {
    // Rayos de sol criollo girando + brillos tricolor
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
          className="absolute -inset-[60%]"
          style={{
            background: 'repeating-conic-gradient(rgba(255, 201, 75, 0.10) 0deg 9deg, transparent 9deg 18deg)',
          }}
        />
        <motion.div
          animate={{ x: [-30, 30, -30], y: [-15, 15, -15] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-40 h-40 rounded-full blur-3xl"
          style={{ background: 'rgba(0, 61, 165, 0.25)', top: '10%', left: '5%' }}
        />
        <motion.div
          animate={{ x: [30, -30, 30], y: [15, -15, 15] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-40 h-40 rounded-full blur-3xl"
          style={{ background: 'rgba(239, 68, 68, 0.22)', bottom: '5%', right: '5%' }}
        />
      </div>
    );
  }

  if (themeKey === 'neon') {
    // Rejilla neón + orbes brillantes tricolor
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background:
              'linear-gradient(rgba(0,224,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,224,255,0.15) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse at 50% 60%, black 20%, transparent 75%)',
          }}
        />
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute w-32 h-32 rounded-full blur-3xl"
          style={{ background: 'rgba(255, 209, 0, 0.3)', top: '5%', left: '10%' }}
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute w-32 h-32 rounded-full blur-3xl"
          style={{ background: 'rgba(255, 45, 85, 0.3)', bottom: '10%', right: '10%' }}
        />
        <motion.div
          animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 6, repeat: Infinity }}
          className="absolute w-28 h-28 rounded-full blur-3xl"
          style={{ background: 'rgba(0, 224, 255, 0.3)', top: '40%', left: '45%' }}
        />
      </div>
    );
  }

  // verde: paño de casino con polvo dorado flotante
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, transparent 2px, transparent 6px)',
        }}
      />
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -60, 0], opacity: [0, 0.8, 0] }}
          transition={{ duration: 5 + i, repeat: Infinity, delay: i * 0.9, ease: 'easeInOut' }}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{
            background: '#FFC94B',
            boxShadow: '0 0 8px rgba(255, 201, 75, 0.9)',
            left: `${12 + i * 15}%`,
            bottom: '10%',
          }}
        />
      ))}
    </div>
  );
};

// ==============================================================================
// MEDALLÓN 3D ANIMADO POR JUGADA
// ==============================================================================
const ChoiceMedallion: React.FC<{ id: RPSChoice; icon: string; theme: any; size?: 'md' | 'xl' }> = ({
  id,
  icon,
  theme,
  size = 'md',
}) => {
  const st = theme.choices[id];
  const dim = size === 'xl' ? 'w-24 h-24 sm:w-28 sm:h-28' : 'w-16 h-16 sm:w-20 sm:h-20';
  const iconDim = size === 'xl' ? 'text-5xl sm:text-6xl' : 'text-3xl sm:text-4xl';

  // Animación característica de cada jugada
  const anim =
    id === 'rock'
      ? { y: [0, -3, 0], scale: [1, 1.05, 1] }           // Pesada: rebote firme
      : id === 'paper'
      ? { rotate: [0, 7, -7, 0], y: [0, -6, 0] }        // Liviana: ondea
      : { rotate: [0, -12, 12, 0] };                    // Tijera: corta

  return (
    <div className={`relative ${dim} flex items-center justify-center`}>
      {/* Anillo giratorio exterior */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 rounded-full border-2 border-dashed"
        style={{ borderColor: st.glow }}
      />
      {/* Halo pulsante */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute inset-1 rounded-full"
        style={{ boxShadow: `0 0 22px ${st.glow}` }}
      />
      {/* Cuerpo del medallón */}
      <div
        className="absolute inset-1.5 rounded-full flex items-center justify-center"
        style={{
          background: st.grad,
          boxShadow: `0 6px 16px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.35), inset 0 -3px 6px rgba(0,0,0,0.4)`,
        }}
      >
        <motion.span
          animate={anim}
          transition={{ duration: id === 'rock' ? 1.6 : 1.2, repeat: Infinity, ease: 'easeInOut' }}
          className={`${iconDim} drop-shadow-lg`}
        >
          {icon}
        </motion.span>
      </div>
      {/* Brillo superior */}
      <div
        className="absolute top-2 left-1/4 right-1/4 h-[18%] rounded-full pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.5), transparent)', filter: 'blur(1px)' }}
      />
    </div>
  );
};

// ==============================================================================
// PARTÍCULAS DE CHOQUE
// ==============================================================================
const ClashParticles: React.FC<{ color: string }> = ({ color }) => (
  <>
    {[...Array(10)].map((_, i) => (
      <motion.div
        key={i}
        initial={{ scale: 0, x: 0, y: 0 }}
        animate={{
          scale: [0, 1.6, 0],
          x: Math.cos((i * Math.PI) / 5) * 70,
          y: Math.sin((i * Math.PI) / 5) * 70,
        }}
        transition={{ duration: 0.9, delay: i * 0.04 }}
        className="absolute w-2 h-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}` }}
      />
    ))}
  </>
);

// ==============================================================================
// COMPONENTE PRINCIPAL
// ==============================================================================
export const RockPaperScissorsBoard: React.FC<RockPaperScissorsBoardProps> = ({
  state,
  currentUserId,
  onSubmitChoice,
  onNextRound,
}) => {
  // ----- Tema (persistente) -----
  const [themeKey, setThemeKey] = useStateSafe();

  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => {
    setThemeKey(k);
    try { localStorage.setItem('rlo_rps_theme', k); } catch {}
  };

  const playerNames = state?.playerNames || {};
  const playerChoices = state?.playerChoices || {};
  const scores = state?.scores || {};
  const targetWins = state?.targetWins || 3;
  const phase = state?.phase || 'selecting';

  const playerIds = Object.keys(playerNames);
  const p1Id = playerIds[0] || currentUserId;
  const p2Id = playerIds[1] || '';

  const myChoiceData = playerChoices[currentUserId];
  const hasCommitted = Boolean(myChoiceData?.committed);
  const mySelectedChoice = myChoiceData?.choice;

  const opponentId = playerIds.find((id) => id !== currentUserId) || '';
  const opponentChoiceData = playerChoices[opponentId];
  const opponentHasCommitted = Boolean(opponentChoiceData?.committed);
  const opponentRevealedChoice = opponentChoiceData?.choice;

  const isSelecting = phase === 'selecting';
  const isRoundResult = phase === 'round_result' || phase === 'match_ended';

  return (
    <div id="rps-board-container" className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-xl mx-auto w-full max-w-full overflow-x-hidden">

      {/* ===== BARRA DE TEMAS ===== */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full mb-2.5 flex items-center justify-between px-3 py-2 rounded-xl border"
        style={{ background: T.panel, borderColor: T.border }}
      >
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4" style={{ color: T.accent }} />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.sub }}>Arena:</span>
          <div className="flex items-center gap-1.5">
            {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => changeTheme(k)}
                title={THEMES[k].label}
                className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg border transition-all"
                style={{
                  borderColor: themeKey === k ? THEMES[k].accent : T.border,
                  background: themeKey === k ? 'rgba(255,255,255,0.1)' : 'transparent',
                  boxShadow: themeKey === k ? `0 0 10px ${THEMES[k].accent}55` : 'none',
                }}
              >
                {THEMES[k].swatch.map((c: string, i: number) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full border border-black/30" style={{ background: c }} />
                ))}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider" style={{ color: T.accent }}>
          {T.label}
        </span>
      </motion.div>

      {/* ===== MARCADOR ===== */}
      <div id="rps-scoreboard" className="grid grid-cols-2 gap-2 sm:gap-3 w-full mb-3">
        {[p1Id, p2Id].map((pid, index) => {
          if (!pid) return null;
          const isActive = false;
          const isMe = pid === currentUserId;
          const committed = Boolean(playerChoices[pid]?.committed);
          return (
            <motion.div
              key={pid}
              initial={{ x: index === 0 ? -50 : 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              id={`rps-player-${index + 1}-card`}
              className="relative p-3 sm:p-4 rounded-2xl border-2 overflow-hidden"
              style={{
                background: T.panel,
                borderColor: committed && isSelecting ? T.accent : T.border,
                boxShadow: committed && isSelecting ? `0 6px 20px ${T.accent}40` : '0 4px 14px rgba(0,0,0,0.4)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="truncate min-w-0">
                  <div className="text-xs sm:text-sm font-black truncate max-w-[90px] sm:max-w-[110px]" style={{ color: T.text }}>
                    {(playerNames[pid] || `JUGADOR ${index + 1}`).toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {isMe && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-mono font-black uppercase" style={{ color: T.accent }}>
                        <Zap className="w-2.5 h-2.5" /> TÚ
                      </span>
                    )}
                    {committed && isSelecting && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-medium uppercase" style={{ color: '#34D399' }}>
                        <ShieldCheck className="w-2.5 h-2.5" /> LISTO
                      </span>
                    )}
                  </div>
                </div>
                <motion.div
                  key={scores[pid] || 0}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-2xl sm:text-3xl font-black font-mono leading-none"
                  style={{ color: T.text, textShadow: `0 0 12px ${T.accent}80` }}
                >
                  {scores[pid] || 0}
                </motion.div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ===== ARENA DE DUELO CON FONDO ALUSIVO ===== */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        id="rps-arena"
        className="w-full relative overflow-hidden rounded-3xl border-2 p-4 sm:p-6 mb-3"
        style={{
          background: T.base,
          borderColor: T.border,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        <ThemeBackdrop themeKey={themeKey} theme={T} />

        <div className="relative z-10">
          <div className="text-center mb-3 flex items-center justify-center gap-2">
            <Swords className="w-4 h-4" style={{ color: T.accent }} />
            <span className="text-xs font-black tracking-widest uppercase font-mono" style={{ color: T.accent }}>
              Duelo en Vivo • Ronda {state.round}
            </span>
            <Swords className="w-4 h-4" style={{ color: T.accent }} />
          </div>

          {/* Zona de confrontación con medallones XL */}
          <div className="flex items-center justify-around py-3">
            {/* Mi lado */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2" style={{ color: T.accent }}>
                {p1Id === currentUserId ? 'TÚ' : (playerNames[p1Id] || '').toUpperCase()}
              </span>
              <motion.div
                animate={hasCommitted && !mySelectedChoice ? { rotate: [0, -4, 4, 0] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                {mySelectedChoice ? (
                  <ChoiceMedallion id={mySelectedChoice} icon={CHOICES.find((c) => c.id === mySelectedChoice)?.icon || '❓'} theme={T} size="xl" />
                ) : hasCommitted ? (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-dashed flex flex-col items-center justify-center"
                    style={{ borderColor: T.accent, background: 'rgba(0,0,0,0.3)' }}
                  >
                    <ShieldCheck className="w-9 h-9 animate-pulse" style={{ color: '#34D399' }} />
                    <span className="text-[9px] font-bold mt-1" style={{ color: '#34D399' }}>LISTO</span>
                  </div>
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: T.border, background: 'rgba(0,0,0,0.3)' }}
                  >
                    <motion.span
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-3xl font-mono"
                      style={{ color: T.sub }}
                    >
                      ?
                    </motion.span>
                  </div>
                )}
              </motion.div>
            </div>

            {/* VS */}
            <div className="flex flex-col items-center relative">
              <motion.div
                animate={{ scale: [1, 1.25, 1], rotate: [0, 6, -6, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-2xl sm:text-3xl font-black font-mono"
                style={{ color: T.accent, textShadow: `0 0 22px ${T.accent}99` }}
              >
                VS
              </motion.div>
              {hasCommitted && opponentHasCommitted && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <ClashParticles color={T.accent} />
                </div>
              )}
            </div>

            {/* Rival */}
            <div className="flex flex-col items-center">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2" style={{ color: T.sub }}>
                {(playerNames[opponentId] || 'RIVAL').toUpperCase()}
              </span>
              {isRoundResult && opponentRevealedChoice ? (
                <motion.div
                  initial={{ scale: 0, rotate: 180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                >
                  <ChoiceMedallion id={opponentRevealedChoice} icon={CHOICES.find((c) => c.id === opponentRevealedChoice)?.icon || '❓'} theme={T} size="xl" />
                </motion.div>
              ) : opponentHasCommitted ? (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 border-dashed flex flex-col items-center justify-center"
                  style={{ borderColor: T.sub, background: 'rgba(0,0,0,0.3)' }}
                >
                  <ShieldCheck className="w-9 h-9" style={{ color: '#34D399' }} />
                  <span className="text-[9px] font-bold mt-1" style={{ color: '#34D399' }}>OCULTA</span>
                </div>
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: T.border, background: 'rgba(0,0,0,0.3)' }}
                >
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-3xl font-mono"
                    style={{ color: T.sub }}
                  >
                    ?
                  </motion.span>
                </div>
              )}
            </div>
          </div>

          {/* Resumen */}
          <AnimatePresence>
            {isRoundResult && state.history && state.history.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.9 }}
                className="mt-3 p-3.5 rounded-2xl border-2 text-center relative overflow-hidden"
                style={{
                  background: 'rgba(0,0,0,0.45)',
                  borderColor: T.accent,
                  boxShadow: `0 8px 26px rgba(0,0,0,0.5), 0 0 16px ${T.accent}33`,
                }}
              >
                <motion.div
                  animate={{ x: [-200, 600] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `linear-gradient(105deg, transparent 40%, ${T.accent}33 50%, transparent 60%)` }}
                />
                <p className="relative z-10 text-sm sm:text-base font-black" style={{ color: T.text }}>
                  {state.history[state.history.length - 1].summary}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ===== SELECTOR DE JUGADAS CON MEDALLONES ANIMADOS ===== */}
      <AnimatePresence mode="wait">
        {isSelecting && !hasCommitted && (
          <motion.div
            key="choices-panel"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            id="rps-choices-panel"
            className="w-full"
          >
            <div className="text-center text-xs sm:text-sm font-black uppercase tracking-wider mb-3" style={{ color: T.accent }}>
              ⚡ Selecciona tu jugada secreta ⚡
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {CHOICES.map((choice, index) => (
                <motion.button
                  key={choice.id}
                  id={`rps-choice-${choice.id}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.07, y: -6 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onSubmitChoice(choice.id)}
                  className="relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border-2 overflow-hidden cursor-pointer"
                  style={{
                    background: T.choices[choice.id].grad,
                    borderColor: 'rgba(255,255,255,0.3)',
                    boxShadow: `0 8px 26px rgba(0,0,0,0.5), 0 0 18px ${T.choices[choice.id].glow}, inset 0 2px 4px rgba(255,255,255,0.3)`,
                  }}
                >
                  {/* Brillo barrido */}
                  <motion.div
                    animate={{ x: [-120, 300] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'linear', delay: index * 0.4 }}
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)' }}
                  />
                  <ChoiceMedallion id={choice.id} icon={choice.icon} theme={T} />
                  <span className="relative z-10 text-xs sm:text-sm font-black uppercase tracking-wider mt-2 text-white drop-shadow">
                    {choice.label}
                  </span>
                  <span className="relative z-10 text-[9px] sm:text-[10px] text-white/80 mt-0.5 font-mono">
                    Vence a {choice.beats}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Esperando al rival */}
      <AnimatePresence>
        {isSelecting && hasCommitted && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="w-full p-4 rounded-2xl border-2 text-center relative overflow-hidden"
            style={{
              background: T.panel,
              borderColor: '#34D399',
              boxShadow: '0 8px 26px rgba(16, 185, 129, 0.25)',
            }}
          >
            <motion.div
              animate={{ x: [-200, 600] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(52,211,153,0.2) 50%, transparent 60%)' }}
            />
            <div className="relative z-10 flex items-center justify-center gap-2">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                <ShieldCheck className="w-5 h-5" style={{ color: '#34D399' }} />
              </motion.div>
              <span className="text-xs sm:text-sm font-bold" style={{ color: '#6EE7B7' }}>
                ✓ Jugada bloqueada. Esperando al rival...
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Siguiente ronda */}
      <AnimatePresence>
        {state.phase === 'round_result' && onNextRound && (
          <motion.button
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            id="rps-next-round-btn"
            onClick={onNextRound}
            className="mt-4 flex items-center space-x-2 px-8 py-3.5 rounded-2xl font-black text-base relative overflow-hidden group"
            style={{
              background: `linear-gradient(145deg, ${T.accent} 0%, ${T.accent}CC 100%)`,
              color: '#1A120C',
              boxShadow: `0 8px 30px ${T.accent}66, inset 0 2px 4px rgba(255,255,255,0.4)`,
            }}
          >
            <motion.div
              animate={{ x: [-100, 500] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.45) 50%, transparent 60%)' }}
            />
            <RefreshCw className="relative z-10 w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
            <span className="relative z-10 uppercase tracking-wider">Siguiente Ronda</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Fin del duelo */}
      <AnimatePresence>
        {state.phase === 'match_ended' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mt-4 w-full p-5 rounded-2xl font-black text-base flex items-center justify-center space-x-3 relative overflow-hidden"
            style={{
              background: `linear-gradient(145deg, ${T.accent} 0%, ${T.accent}CC 100%)`,
              color: '#1A120C',
              boxShadow: `0 8px 30px ${T.accent}80, inset 0 2px 4px rgba(255,255,255,0.4)`,
            }}
          >
            <motion.div
              animate={{ x: [-200, 800] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.45) 50%, transparent 60%)' }}
            />
            <Trophy className="relative z-10 w-6 h-6" />
            <span className="relative z-10 text-center">
              ¡DUELO CONCLUIDO! GANADOR: {(playerNames[state.winnerUserId || ''] || '—').toUpperCase()}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pie */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-4 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest"
        style={{ color: T.sub }}
      >
        <div className="w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.accent})` }} />
        <span>🇻🇪 Piedra, Papel o Tijera 🇻🇪</span>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.accent})` }} />
      </motion.div>
    </div>
  );
};

// Hook seguro de tema con localStorage
function useStateSafe(): [ThemeKey, React.Dispatch<React.SetStateAction<ThemeKey>>] {
  const [key, setKey] = React.useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_rps_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'criollo';
  });
  return [key, setKey];
}
