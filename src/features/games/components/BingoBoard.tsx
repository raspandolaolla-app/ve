// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: BINGO ONLINE
// ==============================================================================
// • Bombo virtual animado con balota gigante y historial del sorteo
// • Gestor de hasta 20 CARTONES: vista "TODOS" (cuadrícula) o "UNO" (grande)
// • Auto-resaltado de números cantados en todos los cartones
// • Tablero de números colapsable (75 / 90 bolas auto-detectado)
// • 3 temas de sala • Mobile-first • Compatible 100% con Supabase
// ==============================================================================

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Palette, ChevronLeft, ChevronRight, LayoutGrid, Square, Trophy,
  Sparkles, Dices, Grid3X3, Eye,
} from 'lucide-react';

interface BingoBoardProps {
  state: any;
  currentUserId: string;
  onMarkNumber: (row: number, col: number) => void;
  onClaimBingo: () => void;
  onDrawBall: () => void;
}

// ==============================================================================
// 3 TEMAS DE SALA
// ==============================================================================
type ThemeKey = 'fiesta' | 'neon' | 'verde';

const THEMES: Record<ThemeKey, any> = {
  fiesta: {
    label: 'Fiesta Caracas',
    swatch: ['#C62828', '#FFC94B', '#FAF0E1'],
    bg: 'radial-gradient(ellipse at 50% 20%, #4A1420 0%, #33101A 50%, #1C0A10 100%)',
    accent: '#FFC94B',
    text: '#F5EFDD',
    sub: '#C9A0A8',
    panel: 'linear-gradient(145deg, rgba(40,12,20,0.92) 0%, rgba(25,7,12,0.92) 100%)',
    border: '#6B2432',
  },
  neon: {
    label: 'Neón Noche',
    swatch: ['#FFD100', '#00E0FF', '#FF2D55'],
    bg: 'radial-gradient(ellipse at 50% 20%, #101A45 0%, #0A1030 50%, #030512 100%)',
    accent: '#FFD100',
    text: '#EAF2FF',
    sub: '#7C8DB5',
    panel: 'linear-gradient(145deg, #0A1030 0%, #05081A 100%)',
    border: '#1B2A5E',
  },
  verde: {
    label: 'Sala Verde',
    swatch: ['#0E5A34', '#FAF0E1', '#FFC94B'],
    bg: 'radial-gradient(ellipse at 50% 20%, #147A46 0%, #0E5A34 50%, #052A18 100%)',
    accent: '#FFC94B',
    text: '#F5EFDD',
    sub: '#9CC4A8',
    panel: 'linear-gradient(145deg, rgba(5,25,15,0.92) 0%, rgba(3,18,10,0.92) 100%)',
    border: '#147A46',
  },
};

// Colores de balota por letra (75) o por decena (90)
const ballColor = (n: number, max: number): string => {
  if (max <= 75) {
    if (n <= 15) return 'linear-gradient(145deg,#42A5F5,#0D47A1)';
    if (n <= 30) return 'linear-gradient(145deg,#EF5350,#B71C1C)';
    if (n <= 45) return 'linear-gradient(145deg,#AB47BC,#6A1B9A)';
    if (n <= 60) return 'linear-gradient(145deg,#66BB6A,#1B5E20)';
    return 'linear-gradient(145deg,#FFA726,#E65100)';
  }
  const palette = [
    'linear-gradient(145deg,#42A5F5,#0D47A1)',
    'linear-gradient(145deg,#EF5350,#B71C1C)',
    'linear-gradient(145deg,#66BB6A,#1B5E20)',
    'linear-gradient(145deg,#FFA726,#E65100)',
    'linear-gradient(145deg,#AB47BC,#6A1B9A)',
  ];
  return palette[Math.min(4, Math.floor((n - 1) / 10) % 5)];
};

const ballLetter = (n: number, max: number): string => {
  if (max > 75) return '';
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
};

// ==============================================================================
// BALOTA DE BINGO
// ==============================================================================
const Ball: React.FC<{ n: number; max: number; size?: 'xs' | 'sm' | 'xl'; pulse?: boolean }> = ({ n, max, size = 'sm', pulse }) => {
  const dims = size === 'xl' ? 'w-24 h-24 sm:w-28 sm:h-28' : size === 'sm' ? 'w-9 h-9' : 'w-7 h-7';
  const letter = ballLetter(n, max);
  return (
    <motion.div
      initial={size === 'xl' ? { y: -80, scale: 0.4, opacity: 0 } : { scale: 0 }}
      animate={size === 'xl' ? { y: 0, scale: 1, opacity: 1 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 16 }}
      className={`relative ${dims} rounded-full flex flex-col items-center justify-center shrink-0 ${pulse ? 'animate-pulse' : ''}`}
      style={{
        background: ballColor(n, max),
        boxShadow: '0 6px 14px rgba(0,0,0,0.55), inset 0 3px 6px rgba(255,255,255,0.45), inset 0 -3px 6px rgba(0,0,0,0.4)',
      }}
    >
      <div className="absolute top-[12%] left-[22%] right-[22%] h-[22%] rounded-full"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.7), transparent)' }} />
      <div className="relative w-[62%] h-[62%] rounded-full bg-white flex flex-col items-center justify-center leading-none">
        {letter && (
          <span className="font-black text-[0.5em]" style={{ color: '#6B7280', fontSize: size === 'xl' ? 12 : 7 }}>
            {letter}
          </span>
        )}
        <span className="font-black text-slate-900" style={{ fontSize: size === 'xl' ? 26 : size === 'sm' ? 12 : 9 }}>
          {n}
        </span>
      </div>
    </motion.div>
  );
};

// ==============================================================================
// UTILIDADES DE NORMALIZACIÓN (lectura defensiva del estado)
// ==============================================================================
const toNum = (b: any): number => {
  if (typeof b === 'number') return b;
  const v = Number(b?.number ?? b?.value ?? b?.ball ?? b?.n);
  return isNaN(v) ? -1 : v;
};

const chunk = (arr: any[], size: number): any[][] => {
  const out: any[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ==============================================================================
// COMPONENTE PRINCIPAL
// ==============================================================================
export const BingoBoard: React.FC<BingoBoardProps> = ({
  state,
  currentUserId,
  onMarkNumber,
  onClaimBingo,
  onDrawBall,
}) => {
  const s: any = state || {};

  // ----- Tema -----
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_bingo_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'fiesta';
  });
  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => {
    setThemeKey(k);
    try { localStorage.setItem('rlo_bingo_theme', k); } catch {}
  };

  // ----- Vista de cartones -----
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showBoard, setShowBoard] = useState(false);
  const [autoGlow, setAutoGlow] = useState(true);

  // ----- Balotas cantadas -----
  const drawn: number[] = useMemo(() => {
    const src = Array.isArray(s.drawnBalls) ? s.drawnBalls
      : Array.isArray(s.calledNumbers) ? s.calledNumbers
      : Array.isArray(s.calledBalls) ? s.calledBalls
      : Array.isArray(s.balls) ? s.balls
      : [];
    return src.map(toNum).filter((n) => n > 0);
  }, [s]);

  const lastBall = toNum(s.currentBall ?? s.lastBall) > 0 ? toNum(s.currentBall ?? s.lastBall) : drawn[drawn.length - 1];
  const calledSet = useMemo(() => new Set(drawn), [drawn]);

  // ----- Mis cartones -----
  const myCards: any[] = useMemo(() => {
    const src = Array.isArray(s.cards?.[currentUserId]) ? s.cards[currentUserId]
      : Array.isArray(s.playerCards?.[currentUserId]) ? s.playerCards[currentUserId]
      : Array.isArray(s.myCards) ? s.myCards
      : Array.isArray(s.cards) ? s.cards
      : [];
    return src.map((raw: any, idx: number) => {
      let grid: (number | null)[][] = [];
      if (Array.isArray(raw?.grid) && Array.isArray(raw.grid[0])) grid = raw.grid;
      else if (Array.isArray(raw?.rows) && Array.isArray(raw.rows[0])) grid = raw.rows;
      else if (Array.isArray(raw?.cells)) grid = chunk(raw.cells, raw.cells.length === 27 ? 9 : 5);
      else if (Array.isArray(raw?.numbers)) grid = chunk(raw.numbers, raw.numbers.length === 15 ? 9 : 5);

      // Marcados (defensivo)
      const markedSrc = raw?.marked || s.marked?.[raw?.id ?? idx] || s.markedCells?.[raw?.id ?? idx] || [];
      const markedSet = new Set<string>();
      if (Array.isArray(markedSrc)) {
        markedSrc.forEach((m: any) => {
          if (Array.isArray(m)) markedSet.add(`${m[0]}_${m[1]}`);
          else if (typeof m === 'string') markedSet.add(m);
          else if (m && m.row !== undefined) markedSet.add(`${m.row}_${m.col}`);
        });
      } else if (Array.isArray(markedSrc) === false && typeof markedSrc === 'object') {
        // matriz booleana
      }
      return { id: raw?.id ?? `card_${idx}`, grid, markedSet, raw };
    });
  }, [s, currentUserId]);

  // Modo 75 u 90 según el cartón
  const maxBall = useMemo(() => {
    const has90 = myCards.some((c) => c.grid.some((r: any[]) => r.some((v: any) => Number(v) > 75)));
    const drawn90 = drawn.some((n) => n > 75);
    return has90 || drawn90 ? 90 : 75;
  }, [myCards, drawn]);

  const status = s.status || 'playing';
  const isPlaying = status === 'playing' || status === 'PLAYING' || status === 'ACTIVE';

  // Progreso de un cartón (números cantados presentes)
  const cardProgress = (card: any): { hit: number; total: number } => {
    let hit = 0, total = 0;
    card.grid.forEach((row: any[]) =>
      row.forEach((v: any) => {
        const n = Number(v);
        if (n > 0) {
          total++;
          if (calledSet.has(n)) hit++;
        }
      })
    );
    return { hit, total };
  };

  const safeActive = Math.min(activeIndex, Math.max(0, myCards.length - 1));

  // ============================================================================
  // RENDER DE UN CARTÓN
  // ============================================================================
  const renderCard = (card: any, index: number, compact: boolean) => {
    const prog = cardProgress(card);
    const cols = card.grid[0]?.length || 9;
    return (
      <motion.div
        key={card.id}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: compact ? index * 0.03 : 0 }}
        className="rounded-xl border-2 overflow-hidden"
        style={{
          background: T.panel,
          borderColor: viewMode === 'single' || !compact ? T.accent : T.border,
          boxShadow: '0 6px 16px rgba(0,0,0,0.45)',
        }}
      >
        {/* Encabezado del cartón */}
        <div className="flex items-center justify-between px-2 py-1"
          style={{ background: `linear-gradient(90deg, ${T.accent}33, transparent)` }}>
          <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: T.accent }}>
            Cartón #{index + 1}
          </span>
          <span className="text-[9px] font-mono font-bold" style={{ color: T.sub }}>
            {prog.hit}/{prog.total}
          </span>
        </div>
        {/* Barra de progreso */}
        <div className="h-1 w-full" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="h-full transition-all duration-500"
            style={{ width: `${prog.total ? (prog.hit / prog.total) * 100 : 0}%`, background: T.accent }} />
        </div>

        {/* Rejilla del cartón */}
        <div className="p-1.5 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {card.grid.map((row: any[], r: number) =>
            row.map((v: any, c: number) => {
              const n = Number(v);
              const empty = !(n > 0);
              const called = !empty && calledSet.has(n);
              const marked = card.markedSet.has(`${r}_${c}`);
              const clickable = !empty && called && isPlaying;
              return (
                <button
                  key={`${r}_${c}`}
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onMarkNumber(r, c)}
                  className={`relative flex items-center justify-center rounded-[4px] font-black transition-all ${
                    compact ? 'h-5 text-[8px] sm:h-6 sm:text-[9px]' : 'h-8 text-xs sm:h-10 sm:text-sm'
                  } ${clickable ? 'cursor-pointer active:scale-90' : ''}`}
                  style={{
                    background: marked
                      ? `linear-gradient(145deg, ${T.accent}, ${T.accent}BB)`
                      : empty
                      ? 'rgba(0,0,0,0.35)'
                      : called && autoGlow
                      ? 'rgba(255,255,255,0.14)'
                      : 'rgba(255,255,255,0.06)',
                    color: marked ? '#1A120C' : empty ? 'transparent' : called ? T.accent : T.text,
                    boxShadow: called && autoGlow && !marked ? `inset 0 0 0 1.5px ${T.accent}AA` : 'none',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {empty ? '★' : n}
                  {marked && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <span className="rounded-full" style={{
                        width: '70%', height: '70%',
                        background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.5), rgba(26,18,12,0.9))',
                      }} />
                    </motion.span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col items-center p-2 sm:p-4 max-w-5xl mx-auto w-full space-y-2.5"
      style={{ background: T.bg, minHeight: '100%' }}>

      {/* ===== BARRA SUPERIOR: TEMAS + CONTROLES ===== */}
      <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl border"
        style={{ background: T.panel, borderColor: T.border }}>
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
        <div className="flex items-center gap-1.5">
          <button onClick={() => setAutoGlow(!autoGlow)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black uppercase"
            style={{
              borderColor: autoGlow ? T.accent : T.border,
              color: autoGlow ? T.accent : T.sub,
              background: autoGlow ? `${T.accent}22` : 'transparent',
            }}>
            <Eye className="w-3 h-3" /> Auto
          </button>
          <button onClick={() => setShowBoard(!showBoard)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black uppercase"
            style={{ borderColor: showBoard ? T.accent : T.border, color: showBoard ? T.accent : T.sub }}>
            <Grid3X3 className="w-3 h-3" /> Tablero
          </button>
        </div>
      </div>

      {/* ===== BOMBO VIRTUAL + BALOTA GIGANTE ===== */}
      <div className="w-full relative overflow-hidden rounded-3xl border-2 p-4"
        style={{ background: T.panel, borderColor: T.border, boxShadow: '0 14px 40px rgba(0,0,0,0.5)' }}>
        {/* Jaula giratoria decorativa */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
          className="absolute -right-10 -top-10 w-40 h-40 rounded-full border-4 border-dashed opacity-15 pointer-events-none"
          style={{ borderColor: T.accent }}
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute -left-12 -bottom-12 w-44 h-44 rounded-full border-4 border-dashed opacity-10 pointer-events-none"
          style={{ borderColor: T.accent }}
        />

        <div className="relative z-10 flex items-center justify-between gap-3">
          {/* Balota actual */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: T.sub }}>
              Balota actual
            </span>
            <AnimatePresence mode="wait">
              <motion.div key={lastBall || 'none'}>
                {lastBall ? <Ball n={lastBall} max={maxBall} size="xl" /> : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-dashed flex items-center justify-center"
                    style={{ borderColor: T.border }}>
                    <Dices className="w-8 h-8" style={{ color: T.sub }} />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Historial reciente */}
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: T.sub }}>
              Últimas balotas ({drawn.length})
            </div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {drawn.length === 0 ? (
                <span className="text-[10px] font-mono" style={{ color: T.sub }}>Esperando sorteo...</span>
              ) : (
                [...drawn].reverse().slice(0, 14).map((n, i) => (
                  <Ball key={`${n}-${i}`} n={n} max={maxBall} size="sm" />
                ))
              )}
            </div>
            {/* Botón sacar balota */}
            <button
              type="button"
              onClick={onDrawBall}
              disabled={!isPlaying}
              className="mt-2 w-full py-3 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
              style={{
                background: `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`,
                color: '#1A120C',
                boxShadow: `0 6px 18px ${T.accent}55, inset 0 2px 3px rgba(255,255,255,0.4)`,
              }}
            >
              <Dices className="w-4 h-4" /> Sacar Balota
            </button>
          </div>
        </div>
      </div>

      {/* ===== TABLERO DE NÚMEROS (colapsable) ===== */}
      <AnimatePresence>
        {showBoard && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full overflow-hidden"
          >
            <div className="p-2.5 rounded-2xl border grid gap-1"
              style={{
                background: T.panel, borderColor: T.border,
                gridTemplateColumns: 'repeat(10, 1fr)',
              }}>
              {Array.from({ length: maxBall }, (_, i) => i + 1).map((n) => {
                const called = calledSet.has(n);
                return (
                  <div key={n}
                    className="h-6 sm:h-7 rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-black"
                    style={{
                      background: called ? ballColor(n, maxBall) : 'rgba(255,255,255,0.05)',
                      color: called ? '#FFF' : T.sub,
                      boxShadow: called ? '0 2px 6px rgba(0,0,0,0.4)' : 'none',
                    }}>
                    {n}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== GESTOR DE CARTONES ===== */}
      <div className="w-full">
        {/* Controles de vista */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setViewMode('all')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase"
              style={{
                borderColor: viewMode === 'all' ? T.accent : T.border,
                color: viewMode === 'all' ? T.accent : T.sub,
                background: viewMode === 'all' ? `${T.accent}22` : 'transparent',
              }}>
              <LayoutGrid className="w-3.5 h-3.5" /> Todos ({myCards.length})
            </button>
            <button onClick={() => setViewMode('single')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase"
              style={{
                borderColor: viewMode === 'single' ? T.accent : T.border,
                color: viewMode === 'single' ? T.accent : T.sub,
                background: viewMode === 'single' ? `${T.accent}22` : 'transparent',
              }}>
              <Square className="w-3.5 h-3.5" /> Uno
            </button>
          </div>

          {/* Navegación en modo Uno */}
          {viewMode === 'single' && myCards.length > 0 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setActiveIndex(Math.max(0, safeActive - 1))}
                className="p-1.5 rounded-lg border" style={{ borderColor: T.border }}>
                <ChevronLeft className="w-4 h-4" style={{ color: T.accent }} />
              </button>
              <span className="text-[10px] font-black font-mono" style={{ color: T.text }}>
                {safeActive + 1}/{myCards.length}
              </span>
              <button onClick={() => setActiveIndex(Math.min(myCards.length - 1, safeActive + 1))}
                className="p-1.5 rounded-lg border" style={{ borderColor: T.border }}>
                <ChevronRight className="w-4 h-4" style={{ color: T.accent }} />
              </button>
            </div>
          )}
        </div>

        {/* Selector rápido de cartón (chips) */}
        {myCards.length > 1 && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1.5 mb-2">
            {myCards.map((_, i) => (
              <button key={i}
                onClick={() => { setActiveIndex(i); setViewMode('single'); }}
                className="shrink-0 w-7 h-7 rounded-lg border text-[9px] font-black"
                style={{
                  borderColor: i === safeActive && viewMode === 'single' ? T.accent : T.border,
                  background: i === safeActive && viewMode === 'single' ? T.accent : 'rgba(255,255,255,0.05)',
                  color: i === safeActive && viewMode === 'single' ? '#1A120C' : T.sub,
                }}>
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* Vista TODOS: cuadrícula de cartones compactos */}
        {viewMode === 'all' ? (
          <div className="grid grid-cols-1 min-[430px]:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[46vh] overflow-y-auto no-scrollbar pr-0.5">
            {myCards.length > 0 ? (
              myCards.map((card, i) => renderCard(card, i, true))
            ) : (
              <div className="col-span-full text-center text-[10px] font-mono py-6" style={{ color: T.sub }}>
                Aún no tienes cartones. ¡Compra hasta 20 en la mesa!
              </div>
            )}
          </div>
        ) : (
          /* Vista UNO: cartón grande */
          <div className="max-w-md mx-auto w-full">
            {myCards[safeActive] ? renderCard(myCards[safeActive], safeActive, false) : (
              <div className="text-center text-[10px] font-mono py-6" style={{ color: T.sub }}>Sin cartones.</div>
            )}
          </div>
        )}
      </div>

      {/* ===== BOTÓN BINGO ===== */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.94 }}
        onClick={onClaimBingo}
        disabled={!isPlaying}
        className="w-full py-4 rounded-2xl font-black text-lg uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #E53935 0%, #B71C1C 60%, #8B1E2D 100%)',
          color: '#FFF',
          border: '2px solid #FFC94B',
          boxShadow: '0 10px 30px rgba(229,57,53,0.5), inset 0 2px 4px rgba(255,255,255,0.35)',
        }}
      >
        <motion.div
          animate={{ x: [-200, 800] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)' }}
        />
        <Trophy className="relative z-10 w-6 h-6 text-amber-300" />
        <span className="relative z-10">¡BINGO!</span>
        <Sparkles className="relative z-10 w-5 h-5 text-amber-300" />
      </motion.button>

      {/* ===== BANNER DE GANADOR ===== */}
      <AnimatePresence>
        {(status === 'finished' || status === 'FINISHED' || s.winnerUserId) && (
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full p-4 rounded-2xl text-center font-black text-sm flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`,
              color: '#1A120C',
              boxShadow: `0 8px 24px ${T.accent}66`,
            }}
          >
            <Trophy className="w-5 h-5" />
            ¡BINGO CANTADO! GANADOR: {(s.players?.find?.((p: any) => p.userId === s.winnerUserId)?.name || s.winnerName || '—')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pie */}
      <div className="flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: T.sub }}>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.accent})` }} />
        <span>🇻 Bingo Online 🇻</span>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.accent})` }} />
      </div>
    </div>
  );
};
