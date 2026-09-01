// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: LA VIEJA (3 EN RAYA CRIOLLO)
// ==============================================================================
// • 3 TEMAS con fondos alusivos animados (Criollo / Neón / Paño Verde)
// • X y O rediseñadas como símbolos 3D animados (barras y anillo con glow)
// • TABLERO ESTABLE: casillas con aspect-square fijo, nunca se distorsionan
// • Compatible 100% con Supabase y GameContainer (SIN sonidos)
// ==============================================================================

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RefreshCw, Sparkles, Star, Flame, Zap, Palette } from 'lucide-react';
import type { TicTacToeState } from '../../../types/games';
import { PlayerLives } from './PlayerLives';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';

interface TicTacToeBoardProps {
  state: TicTacToeState;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onPlaceSymbol: (cellIndex: number) => void;
  onNextRound?: () => void;
}

// ==============================================================================
// SISTEMA DE TEMAS (3 DISEÑOS CON FONDO ALUSIVO)
// ==============================================================================
type ThemeKey = 'criollo' | 'neon' | 'verde';

const THEMES: Record<ThemeKey, any> = {
  criollo: {
    label: 'Criollo Clásico',
    swatch: ['#FFC94B', '#EF3340', '#003DA5'],
    base: 'radial-gradient(ellipse at 50% 30%, #3A2A14 0%, #2B1D14 55%, #1C120C 100%)',
    frame: 'linear-gradient(145deg, #8B5A2B 0%, #6B4423 50%, #4E2E17 100%)',
    cellBg: 'linear-gradient(145deg, rgba(255, 236, 200, 0.10) 0%, rgba(120, 85, 45, 0.18) 100%)',
    cellBorder: 'rgba(139, 90, 43, 0.5)',
    cellHover: 'rgba(255, 201, 75, 0.7)',
    xGrad: 'linear-gradient(145deg, #FF7A59 0%, #E53935 55%, #B71C1C 100%)',
    xGlow: '0 0 16px rgba(239, 68, 68, 0.75)',
    oColor: '#42A5F5',
    oGlow: '0 0 16px rgba(66, 165, 245, 0.75)',
    accent: '#FFC94B',
    text: '#F0E2C8',
    sub: '#A8865A',
    panel: 'linear-gradient(145deg, #2B1D14 0%, #1C120C 100%)',
    border: '#3E2B1F',
  },
  neon: {
    label: 'Neón Tricolor',
    swatch: ['#FFD100', '#00E0FF', '#FF2D55'],
    base: 'radial-gradient(ellipse at 50% 30%, #0A1030 0%, #060A20 55%, #030512 100%)',
    frame: 'linear-gradient(145deg, #1B2A5E 0%, #0A1030 100%)',
    cellBg: 'linear-gradient(145deg, rgba(0, 224, 255, 0.06) 0%, rgba(10, 16, 48, 0.6) 100%)',
    cellBorder: 'rgba(27, 42, 94, 0.9)',
    cellHover: 'rgba(255, 209, 0, 0.8)',
    xGrad: 'linear-gradient(145deg, #FF6B8A 0%, #FF2D55 55%, #B3123A 100%)',
    xGlow: '0 0 18px rgba(255, 45, 85, 0.85)',
    oColor: '#00E0FF',
    oGlow: '0 0 18px rgba(0, 224, 255, 0.85)',
    accent: '#FFD100',
    text: '#EAF2FF',
    sub: '#7C8DB5',
    panel: 'linear-gradient(145deg, #0A1030 0%, #05081A 100%)',
    border: '#1B2A5E',
  },
  verde: {
    label: 'Paño Verde Pro',
    swatch: ['#0E5A34', '#FAF0E1', '#FFC94B'],
    base: 'radial-gradient(ellipse at 50% 30%, #147A46 0%, #0E5A34 55%, #052A18 100%)',
    frame: 'linear-gradient(145deg, #6B4423 0%, #4E2E17 50%, #3A2010 100%)',
    cellBg: 'linear-gradient(145deg, rgba(255, 255, 255, 0.08) 0%, rgba(5, 42, 24, 0.5) 100%)',
    cellBorder: 'rgba(20, 122, 70, 0.6)',
    cellHover: 'rgba(255, 201, 75, 0.8)',
    xGrad: 'linear-gradient(145deg, #FFE08A 0%, #FFC94B 55%, #D9A400 100%)',
    xGlow: '0 0 16px rgba(255, 201, 75, 0.8)',
    oColor: '#F5EFDD',
    oGlow: '0 0 16px rgba(245, 239, 221, 0.7)',
    accent: '#FFC94B',
    text: '#F5EFDD',
    sub: '#9CC4A8',
    panel: 'linear-gradient(145deg, rgba(10,40,25,0.92) 0%, rgba(5,25,15,0.92) 100%)',
    border: '#147A46',
  },
};

const CHOICE_IDS = ['rock', 'paper', 'scissors']; // (no usado aquí, reservado)

// ==============================================================================
// FONDO ALUSIVO ANIMADO
// ==============================================================================
const ThemeBackdrop: React.FC<{ themeKey: ThemeKey }> = ({ themeKey }) => {
  if (themeKey === 'criollo') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
          className="absolute -inset-[60%]"
          style={{ background: 'repeating-conic-gradient(rgba(255, 201, 75, 0.09) 0deg 9deg, transparent 9deg 18deg)' }}
        />
        <motion.div
          animate={{ x: [-25, 25, -25] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-36 h-36 rounded-full blur-3xl"
          style={{ background: 'rgba(0, 61, 165, 0.25)', top: '8%', left: '4%' }}
        />
        <motion.div
          animate={{ x: [25, -25, 25] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-36 h-36 rounded-full blur-3xl"
          style={{ background: 'rgba(239, 68, 68, 0.22)', bottom: '6%', right: '4%' }}
        />
      </div>
    );
  }
  if (themeKey === 'neon') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background:
              'linear-gradient(rgba(0,224,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(0,224,255,0.14) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'radial-gradient(ellipse at 50% 55%, black 20%, transparent 75%)',
          }}
        />
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.85, 0.4] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute w-28 h-28 rounded-full blur-3xl"
          style={{ background: 'rgba(255, 209, 0, 0.3)', top: '6%', left: '8%' }}
        />
        <motion.div
          animate={{ scale: [1.25, 1, 1.25], opacity: [0.35, 0.75, 0.35] }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute w-28 h-28 rounded-full blur-3xl"
          style={{ background: 'rgba(255, 45, 85, 0.3)', bottom: '8%', right: '8%' }}
        />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
      <div
        className="absolute inset-0 opacity-30"
        style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, transparent 2px, transparent 6px)' }}
      />
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -55, 0], opacity: [0, 0.8, 0] }}
          transition={{ duration: 5 + i, repeat: Infinity, delay: i * 0.9, ease: 'easeInOut' }}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{ background: '#FFC94B', boxShadow: '0 0 8px rgba(255, 201, 75, 0.9)', left: `${12 + i * 15}%`, bottom: '8%' }}
        />
      ))}
    </div>
  );
};

// ==============================================================================
// SÍMBOLOS ANIMADOS (tamaño proporcional: NUNCA distorsionan la casilla)
// ==============================================================================
const XSymbol: React.FC<{ theme: any; ghost?: boolean }> = ({ theme, ghost }) => (
  <motion.div
    initial={ghost ? false : { scale: 0, rotate: -90 }}
    animate={{ scale: 1, rotate: 0 }}
    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    className="relative w-[72%] h-[72%]"
  >
    <motion.div
      animate={ghost ? {} : { opacity: [0.75, 1, 0.75] }}
      transition={{ duration: 2, repeat: Infinity }}
      className="absolute inset-0"
    >
      <div
        className="absolute top-1/2 left-1/2 w-[92%] h-[20%] rounded-full -translate-x-1/2 -translate-y-1/2"
        style={{ background: theme.xGrad, boxShadow: theme.xGlow, transform: 'translate(-50%, -50%) rotate(45deg)' }}
      />
      <div
        className="absolute top-1/2 left-1/2 w-[92%] h-[20%] rounded-full"
        style={{ background: theme.xGrad, boxShadow: theme.xGlow, transform: 'translate(-50%, -50%) rotate(-45deg)' }}
      />
    </motion.div>
  </motion.div>
);

const OSymbol: React.FC<{ theme: any; ghost?: boolean }> = ({ theme, ghost }) => (
  <motion.div
    initial={ghost ? false : { scale: 0 }}
    animate={{ scale: 1 }}
    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    className="relative w-[72%] h-[72%]"
  >
    {/* Anillo giratorio decorativo */}
    <motion.div
      animate={ghost ? {} : { rotate: 360 }}
      transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
      className="absolute inset-[-6%] rounded-full border-2 border-dashed opacity-30"
      style={{ borderColor: theme.oColor }}
    />
    {/* Anillo principal */}
    <motion.div
      animate={ghost ? {} : { opacity: [0.8, 1, 0.8] }}
      transition={{ duration: 2, repeat: Infinity }}
      className="absolute inset-0 rounded-full"
      style={{
        background: `radial-gradient(circle, transparent 50%, ${theme.oColor} 52% 72%, transparent 74%)`,
        filter: `drop-shadow(0 0 8px ${theme.oColor})`,
      }}
    />
  </motion.div>
);

// ==============================================================================
// COMPONENTE PRINCIPAL
// ==============================================================================
export const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  onPlaceSymbol,
  onNextRound,
}) => {
  // ----- Tema (persistente) -----
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_tictactoe_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'criollo';
  });
  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => {
    setThemeKey(k);
    try { localStorage.setItem('rlo_tictactoe_theme', k); } catch {}
  };

  const playerSymbols = state?.playerSymbols || {};
  const playerNames = state?.playerNames || {};
  const scores = state?.scores || {};
  const lives = state?.lives || {};
  const board = Array.isArray(state?.board) ? state.board : Array(9).fill(null);
  const round = state?.round || 1;
  const status = state?.status || 'playing';
  const turnUserId = state?.turnUserId || currentUserId;
  const isMyTurn = turnUserId === currentUserId && status === 'playing';
  const mySymbol = playerSymbols[currentUserId] || 'X';
  const playerIds = Object.keys(playerSymbols);
  const p1Id = playerIds[0] || currentUserId;
  const p2Id = playerIds[1] || '';

  const handleTimeout = () => {
    if (isMyTurn && sessionId) {
      GameRepository.expireTurn(sessionId);
    }
  };

  const activeTurnName = (playerNames[turnUserId] || 'OPONENTE').toUpperCase();

  return (
    <div id="tictactoe-board-container" className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-xl mx-auto w-full">

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

      {/* ===== HEADER DE RONDA ===== */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        id="tictactoe-round-header"
        className="w-full mb-2.5 flex items-center justify-between px-4 py-2.5 rounded-xl border"
        style={{ background: T.panel, borderColor: T.border }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: `linear-gradient(135deg, ${T.accent}, #FF8A00)`, boxShadow: `0 4px 12px ${T.accent}66` }}
          >
            <Flame className="w-5 h-5 text-white" />
          </motion.div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.sub }}>Ronda</div>
            <div className="text-xl font-black font-mono leading-none" style={{ color: T.text }}>{round}</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg border" style={{ borderColor: T.border, background: 'rgba(255,255,255,0.05)' }}>
            <Star className="w-3.5 h-3.5" style={{ color: T.accent }} />
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider" style={{ color: T.text }}>
              Al Mejor de 5
            </span>
          </div>
          <div className="text-[9px] font-mono mt-0.5" style={{ color: T.sub }}>(3 victorias para ganar)</div>
        </div>
      </motion.div>

      {/* ===== MARCADOR ===== */}
      <div id="tictactoe-scoreboard" className="grid grid-cols-2 gap-2 sm:gap-3 w-full mb-3">
        {[p1Id, p2Id].map((pid, index) => {
          if (!pid) return null;
          const sym = playerSymbols[pid] || (index === 0 ? 'X' : 'O');
          const isActive = turnUserId === pid && status === 'playing';
          const pLives = lives[pid] !== undefined ? lives[pid] : 3;
          return (
            <motion.div
              key={pid}
              initial={{ x: index === 0 ? -50 : 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              id={`tictactoe-player-${index + 1}-card`}
              className="relative p-3 rounded-2xl border-2 overflow-hidden"
              style={{
                background: T.panel,
                borderColor: isActive ? T.accent : T.border,
                boxShadow: isActive ? `0 6px 20px ${T.accent}40` : '0 4px 14px rgba(0,0,0,0.4)',
              }}
            >
              {isActive && (
                <motion.div
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: `linear-gradient(to right, transparent, ${T.accent}, transparent)` }}
                />
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate min-w-0">
                  {/* Miniatura del símbolo */}
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(0,0,0,0.35)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)' }}
                  >
                    <div className="w-6 h-6 sm:w-7 sm:h-7 relative">
                      {sym === 'X' ? <XSymbol theme={T} ghost /> : <OSymbol theme={T} ghost />}
                    </div>
                  </div>
                  <div className="truncate min-w-0">
                    <div className="text-xs sm:text-sm font-black truncate max-w-[80px] sm:max-w-[100px]" style={{ color: T.text }}>
                      {(playerNames[pid] || `JUGADOR ${index + 1}`).toUpperCase()}
                    </div>
                    {pid === currentUserId && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-mono font-black uppercase" style={{ color: T.accent }}>
                        <Zap className="w-2.5 h-2.5" /> TÚ
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
              <div className="pt-2 mt-2 border-t" style={{ borderColor: T.border }}>
                <PlayerLives lives={pLives} size="sm" showText={false} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ===== TIMER ===== */}
      <div className="w-full mb-3">
        <TurnTimer
          turnExpiresAt={turnExpiresAt}
          durationSeconds={30}
          isMyTurn={isMyTurn}
          activePlayerName={activeTurnName}
          status={state.status}
          onTimeout={handleTimeout}
        />
      </div>

      {/* ===== BANNERS DE ESTADO ===== */}
      <AnimatePresence mode="wait">
        {state.status === 'round_won' && (
          <motion.div
            key="round-won"
            initial={{ scale: 0.8, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            id="tictactoe-status-banner"
            className="mb-3 text-center"
          >
            <div className="inline-flex items-center space-x-2 px-5 py-3 rounded-2xl border-2 font-black text-sm relative overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.4)', borderColor: T.accent, color: T.text, boxShadow: `0 0 20px ${T.accent}55` }}
            >
              <Trophy className="w-5 h-5" style={{ color: T.accent }} />
              <span>¡RONDA GANADA POR {(state.playerNames[state.roundWinnerUserId || ''] || 'GANADOR').toUpperCase()}!</span>
            </div>
          </motion.div>
        )}
        {state.status === 'draw' && (
          <motion.div
            key="draw"
            initial={{ scale: 0.8, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            id="tictactoe-status-banner"
            className="mb-3 text-center"
          >
            <div className="inline-flex items-center space-x-2 px-5 py-3 rounded-2xl border-2 font-black text-sm"
              style={{ background: 'rgba(0,0,0,0.4)', borderColor: T.border, color: T.text }}
            >
              <span>¡EMPATE EN EL TABLERO!</span>
            </div>
          </motion.div>
        )}
        {state.status === 'game_won' && (
          <motion.div
            key="game-won"
            initial={{ scale: 0.5, opacity: 0, y: -30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 30 }}
            id="tictactoe-status-banner"
            className="mb-3 text-center"
          >
            <div className="inline-flex items-center space-x-2 px-6 py-4 rounded-2xl font-black text-base relative overflow-hidden"
              style={{ background: `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`, color: '#1A120C', boxShadow: `0 8px 30px ${T.accent}80` }}
            >
              <motion.div
                animate={{ x: [-100, 500] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)' }}
              />
              <Sparkles className="w-6 h-6 relative z-10" />
              <span className="relative z-10">
                ¡PARTIDA CONCLUIDA! GANADOR: {(state.playerNames[state.winnerUserId || ''] || 'GANADOR').toUpperCase()}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== TABLERO 3x3 ESTABLE (SIN DISTORSIÓN) ===== */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="relative w-full max-w-[340px] sm:max-w-[400px] rounded-3xl p-3 sm:p-4"
        style={{
          background: T.frame,
          boxShadow: '0 20px 50px rgba(0,0,0,0.7), inset 0 2px 3px rgba(255,220,150,0.25), inset 0 -2px 4px rgba(0,0,0,0.5)',
        }}
      >
        <div className="relative rounded-2xl overflow-hidden p-2 sm:p-3" style={{ background: T.base }}>
          <ThemeBackdrop themeKey={themeKey} />

          <div id="tictactoe-grid" className="relative z-10 grid grid-cols-3 gap-2 sm:gap-3 w-full">
            {board.map((symbol, index) => {
              const isWinningCell = state.winningLine?.includes(index);
              const isCellEmpty = symbol === null;
              const canClick = isMyTurn && isCellEmpty;

              return (
                <motion.button
                  key={index}
                  id={`tictactoe-cell-${index}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={canClick ? { scale: 1.04 } : {}}
                  whileTap={canClick ? { scale: 0.94 } : {}}
                  onClick={() => canClick && onPlaceSymbol(index)}
                  disabled={!canClick}
                  className="group relative w-full aspect-square rounded-xl sm:rounded-2xl border-2 select-none"
                  style={{
                    background: isWinningCell ? `linear-gradient(145deg, ${T.accent}40, ${T.accent}1A)` : T.cellBg,
                    borderColor: isWinningCell ? T.accent : T.cellBorder,
                    boxShadow: isWinningCell
                      ? `0 0 20px ${T.accent}99, inset 0 1px 0 rgba(255,255,255,0.2)`
                      : 'inset 0 2px 8px rgba(0,0,0,0.4)',
                    cursor: canClick ? 'pointer' : 'default',
                  }}
                >
                  {/* Contenido en capa fija: el tamaño NUNCA cambia */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    {symbol === 'X' && <XSymbol theme={T} />}
                    {symbol === 'O' && <OSymbol theme={T} />}

                    {/* Vista previa fantasma al pasar el dedo/mouse */}
                    {isCellEmpty && canClick && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-40 transition-opacity">
                        {mySymbol === 'X' ? <XSymbol theme={T} ghost /> : <OSymbol theme={T} ghost />}
                      </div>
                    )}
                  </div>

                  {/* Borde luminoso en hover */}
                  {canClick && (
                    <div
                      className="absolute inset-0 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{ boxShadow: `inset 0 0 0 2px ${T.cellHover}, 0 0 14px ${T.cellHover}66` }}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ===== SIGUIENTE RONDA ===== */}
      <AnimatePresence>
        {(state.status === 'round_won' || state.status === 'draw') && onNextRound && (
          <motion.button
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            onClick={onNextRound}
            className="mt-4 flex items-center space-x-2 px-8 py-3.5 rounded-2xl font-black text-base relative overflow-hidden group"
            style={{
              background: `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`,
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

      {/* ===== PIE ===== */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-4 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest"
        style={{ color: T.sub }}
      >
        <div className="w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.accent})` }} />
        <span>🇻🇪 3 en Raya Criollo 🇻</span>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.accent})` }} />
      </motion.div>
    </div>
  );
};
