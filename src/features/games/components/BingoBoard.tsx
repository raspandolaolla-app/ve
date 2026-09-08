// ==============================================================================
// RASPANDO LA OLLA — BINGO ONLINE (COMPATIBLE CON MOTOR VIEJO Y NUEVO)
// ==============================================================================
// • Modal de resultados visible para TODOS los jugadores (ganador y perdedores)
// • Detalles completos: ganador, premio, pozo, bolas cantadas, cartones
// • Opciones para volver al lobby o jugar de nuevo
// • Cartones 90/75 bolas autodetectados
// • Bombo virtual animado + historial + tablero colapsable
// ==============================================================================

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Palette, ChevronLeft, ChevronRight, LayoutGrid, Square, Trophy, Sparkles,
  Dices, Grid3X3, Eye, Volume2, VolumeX, Clock, Ticket, Play, Pause,
  Minus, Plus, ShoppingCart, Zap, Users, Crown, Home, RotateCcw, X,
} from 'lucide-react';

interface BingoBoardProps {
  state: any;
  currentUserId: string;
  isHost?: boolean;
  onMarkNumber: (row: number, col: number) => void;
  onClaimBingo: () => void;
  onDrawBall?: () => void;
  onStartDraw?: () => void;
  onBuyCards?: (count: number) => void;
  isSalesClosed?: boolean;
  countdownSeconds?: number;
  bcvRate?: number;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

type ThemeKey = 'fiesta' | 'neon' | 'verde';

const THEMES: Record<ThemeKey, any> = {
  fiesta: {
    label: 'Fiesta Caracas',
    swatch: ['#C62828', '#FFC94B', '#FAF0E1'],
    bg: 'radial-gradient(ellipse at 50% 20%, #4A1420 0%, #33101A 50%, #1C0A10 100%)',
    accent: '#FFC94B', text: '#F5EFDD', sub: '#C9A0A8',
    panel: 'linear-gradient(145deg, rgba(40,12,20,0.92) 0%, rgba(25,7,12,0.92) 100%)',
    border: '#6B2432',
  },
  neon: {
    label: 'Neón Noche',
    swatch: ['#FFD100', '#00E0FF', '#FF2D55'],
    bg: 'radial-gradient(ellipse at 50% 20%, #101A45 0%, #0A1030 50%, #030512 100%)',
    accent: '#FFD100', text: '#EAF2FF', sub: '#7C8DB5',
    panel: 'linear-gradient(145deg, #0A1030 0%, #05081A 100%)',
    border: '#1B2A5E',
  },
  verde: {
    label: 'Sala Verde',
    swatch: ['#0E5A34', '#FAF0E1', '#FFC94B'],
    bg: 'radial-gradient(ellipse at 50% 20%, #147A46 0%, #0E5A34 50%, #052A18 100%)',
    accent: '#FFC94B', text: '#F5EFDD', sub: '#9CC4A8',
    panel: 'linear-gradient(145deg, rgba(5,25,15,0.92) 0%, rgba(3,18,10,0.92) 100%)',
    border: '#147A46',
  },
};

const ballColor = (n: number, max: number): string => {
  if (max <= 75) {
    if (n <= 15) return 'linear-gradient(145deg,#42A5F5,#0D47A1)';
    if (n <= 30) return 'linear-gradient(145deg,#EF5350,#B71C1C)';
    if (n <= 45) return 'linear-gradient(145deg,#AB47BC,#6A1B9A)';
    if (n <= 60) return 'linear-gradient(145deg,#66BB6A,#1B5E20)';
    return 'linear-gradient(145deg,#FFA726,#E65100)';
  }
  const p = [
    'linear-gradient(145deg,#42A5F5,#0D47A1)', 'linear-gradient(145deg,#EF5350,#B71C1C)',
    'linear-gradient(145deg,#66BB6A,#1B5E20)', 'linear-gradient(145deg,#FFA726,#E65100)',
    'linear-gradient(145deg,#AB47BC,#6A1B9A)',
  ];
  return p[Math.min(4, Math.floor((n - 1) / 10) % 5)];
};

const ballLetter = (n: number, max: number): string => {
  if (max > 75) return '';
  if (n <= 15) return 'B'; if (n <= 30) return 'I'; if (n <= 45) return 'N';
  if (n <= 60) return 'G'; return 'O';
};

const Ball: React.FC<{ n: number; max: number; size?: 'sm' | 'xl' }> = ({ n, max, size = 'sm' }) => {
  const dims = size === 'xl' ? 'w-16 h-16 sm:w-24 sm:h-24' : 'w-8 h-8 sm:w-9 sm:h-9';
  const letter = ballLetter(n, max);
  return (
    <motion.div
      initial={size === 'xl' ? { y: -40, scale: 0.5, opacity: 0 } : { scale: 0 }}
      animate={size === 'xl' ? { y: 0, scale: 1, opacity: 1 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 16 }}
      className={`relative ${dims} rounded-full flex flex-col items-center justify-center shrink-0`}
      style={{ background: ballColor(n, max), boxShadow: '0 6px 14px rgba(0,0,0,0.55), inset 0 3px 6px rgba(255,255,255,0.45), inset 0 -3px 6px rgba(0,0,0,0.4)' }}
    >
      <div className="absolute top-[12%] left-[22%] right-[22%] h-[22%] rounded-full"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.7), transparent)' }} />
      <div className="relative w-[62%] h-[62%] rounded-full bg-white flex flex-col items-center justify-center leading-none">
        {letter && <span className="font-black" style={{ color: '#6B7280', fontSize: size === 'xl' ? 9 : 7 }}>{letter}</span>}
        <span className="font-black text-slate-900" style={{ fontSize: size === 'xl' ? 20 : 12 }}>{n}</span>
      </div>
    </motion.div>
  );
};

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

const formatBs = (n: number): string => {
  return new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 }).format(n) + ' Bs';
};

export const BingoBoard: React.FC<BingoBoardProps> = ({
  state, currentUserId, isHost: propIsHost, onMarkNumber, onClaimBingo, onDrawBall, onStartDraw, onBuyCards,
  isSalesClosed, countdownSeconds, bcvRate, isMuted, onToggleMute,
}) => {
  const s: any = state || {};

  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_bingo_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'fiesta';
  });
  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => { setThemeKey(k); try { localStorage.setItem('rlo_bingo_theme', k); } catch {} };

  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showBoard, setShowBoard] = useState(false);
  const [autoGlow, setAutoGlow] = useState(true);
  const [buyCount, setBuyCount] = useState(3);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showResultsModal, setShowResultsModal] = useState(true);

  const playerNamesKeys = s.playerNames ? Object.keys(s.playerNames) : [];
  const firstPlayerId = playerNamesKeys.length > 0 ? playerNamesKeys[0] : null;
  const isHost = propIsHost !== undefined ? propIsHost : ((s.hostUserId || s.hostId || '') === currentUserId || (firstPlayerId === currentUserId));

  const [autoDraw, setAutoDraw] = useState(false);
  const [speed, setSpeed] = useState(2);

  const drawn: number[] = useMemo(() => {
    const src = Array.isArray(s.drawnBalls) ? s.drawnBalls
      : Array.isArray(s.calledNumbers) ? s.calledNumbers
      : Array.isArray(s.calledBalls) ? s.calledBalls
      : Array.isArray(s.balls) ? s.balls : [];
    return src.map(toNum).filter((n) => n > 0);
  }, [s]);
  const lastBall = toNum(s.currentBall ?? s.lastBall) > 0 ? toNum(s.currentBall ?? s.lastBall) : drawn[drawn.length - 1];
  const calledSet = useMemo(() => new Set(drawn), [drawn]);

  const myCards: any[] = useMemo(() => {
    const uid = currentUserId;
    if (s.cards && typeof s.cards === 'object' && !Array.isArray(s.cards) && s.cards[uid]) {
      const arr = s.cards[uid];
      if (Array.isArray(arr)) return arr.map((raw: any, idx: number) => normalizeCard(raw, idx, s));
    }
    if (s.players && s.players[uid] && Array.isArray(s.players[uid].cards)) {
      return s.players[uid].cards.map((raw: any, idx: number) => normalizeCard(raw, idx, s));
    }
    const candidates: any = [
      s.playerCards?.[uid], s.cardsByPlayer?.[uid], s.myCards,
      Array.isArray(s.cards) ? s.cards.filter((c: any) => !c?.userId || c.userId === uid) : null,
    ];
    const src = candidates.find((c: any) => Array.isArray(c)) || [];
    return src.map((raw: any, idx: number) => normalizeCard(raw, idx, s));
  }, [s, currentUserId, refreshKey]);

  const totalCardsInTable = useMemo((): number => {
    let total = 0;
    if (s.cardsPurchased && typeof s.cardsPurchased === 'object') {
      for (const key of Object.keys(s.cardsPurchased)) total += Number(s.cardsPurchased[key]) || 0;
    }
    if (s.cards && typeof s.cards === 'object' && !Array.isArray(s.cards)) {
      for (const key of Object.keys(s.cards)) {
        const arr = s.cards[key];
        total += Array.isArray(arr) ? arr.length : 0;
      }
    }
    return total;
  }, [s, refreshKey]);

  // ✅ NUEVO: Detectar fin de partida (visible para TODOS)
  const status = s.status || 'playing';
  const isFinished = status === 'FINISHED' || status === 'finished' || Boolean(s.winnerUserId);
  const winnerUserId = s.winnerUserId;
  const winnerName = winnerUserId ? (s.playerNames?.[winnerUserId] || s.players?.[winnerUserId]?.name || 'Ganador') : null;
  const isWinner = winnerUserId === currentUserId;

  // Cálculos del premio
  const cardPrice = Number(s.cardPrice ?? 0);
  const totalPlayers = playerNamesKeys.length || 1;
  const grossPool = cardPrice * totalCardsInTable;
  const prizePool = grossPool * 0.9;
  const platformFee = grossPool * 0.1;

  function normalizeCard(raw: any, idx: number, s: any) {
    let grid: (number | null)[][] = [];
    if (raw?.b && raw?.i && raw?.n && raw?.g && raw?.o) {
      grid = [];
      for (let r = 0; r < 5; r++) {
        const parseCell = (v: any) => {
          if (v === 'FREE' || v === 'free') return null;
          const num = Number(v);
          return !isNaN(num) && num > 0 ? num : null;
        };
        grid.push([
          parseCell(raw.b[r]),
          parseCell(raw.i[r]),
          parseCell(raw.n[r]),
          parseCell(raw.g[r]),
          parseCell(raw.o[r]),
        ]);
      }
    } else if (Array.isArray(raw) && raw.length && typeof raw[0] === 'number') {
      grid = chunk(raw, raw.length === 15 ? 9 : 5);
    } else if (Array.isArray(raw?.grid) && Array.isArray(raw.grid[0])) grid = raw.grid;
    else if (Array.isArray(raw?.rows) && Array.isArray(raw.rows[0])) grid = raw.rows;
    else if (Array.isArray(raw?.cells)) grid = chunk(raw.cells, raw.cells.length === 27 ? 9 : raw.cells.length === 25 ? 5 : 9);
    else if (Array.isArray(raw?.numbers)) grid = chunk(raw.numbers, raw.numbers.length === 15 ? 9 : 5);

    const markedSrc = raw?.marked || s.marked?.[raw?.id ?? idx] || s.markedCells?.[raw?.id ?? idx] || [];
    const markedSet = new Set<string>();
    if (Array.isArray(markedSrc)) {
      if (Array.isArray(markedSrc[0])) {
        markedSrc.forEach((rowArr: any[], r: number) => {
          if (Array.isArray(rowArr)) {
            rowArr.forEach((val: any, c: number) => {
              if (val === true) markedSet.add(`${r}_${c}`);
            });
          }
        });
      } else {
        markedSrc.forEach((m: any) => {
          if (Array.isArray(m)) markedSet.add(`${m[0]}_${m[1]}`);
          else if (typeof m === 'string') markedSet.add(m);
          else if (m && m.row !== undefined) markedSet.add(`${m.row}_${m.col}`);
        });
      }
    }
    return { id: raw?.id ?? `card_${idx}`, grid, markedSet, raw };
  }

  const allCardsInBoard = useMemo(() => {
    const list: any[] = [];
    const srcCards = s.cards;
    if (srcCards && typeof srcCards === 'object' && !Array.isArray(srcCards)) {
      Object.entries(srcCards).forEach(([uid, cardsArr]) => {
        if (Array.isArray(cardsArr)) {
          cardsArr.forEach((c: any, idx: number) => {
            const userName = s.playerNames?.[uid] || s.players?.[uid]?.name || (uid === currentUserId ? 'Mi Cartón' : `Jugador`);
            list.push({
              ...c,
              id: c.id || `${uid}_${idx}`,
              userId: uid,
              userName,
            });
          });
        }
      });
    }
    if (s.players && typeof s.players === 'object') {
      Object.entries(s.players).forEach(([uid, pData]: [string, any]) => {
        if (Array.isArray(pData?.cards)) {
          pData.cards.forEach((c: any, idx: number) => {
            if (!list.some(item => item.id === (c.id || `${uid}_${idx}`))) {
              list.push({
                ...c,
                id: c.id || `${uid}_${idx}`,
                userId: uid,
                userName: pData.name || s.playerNames?.[uid] || 'Jugador',
              });
            }
          });
        }
      });
    }
    if (list.length === 0 && myCards.length > 0) {
      myCards.forEach((c: any) => {
        list.push({
          ...(c.raw || {}),
          id: c.id,
          grid: c.grid,
          userId: currentUserId,
          userName: s.playerNames?.[currentUserId] || 'Mi Cartón',
        });
      });
    }
    return list;
  }, [s, currentUserId, myCards]);

  const maxBall = useMemo(() => {
    if (s.variant === '90' || s.totalBalls === 90 || s.mode === 90) return 90;
    if (s.variant === '75' || s.totalBalls === 75 || s.mode === 75) return 75;
    const has90 = myCards.some((c) => c.grid.some((r: any[]) => r.some((v: any) => Number(v) > 75)));
    return has90 || drawn.some((n) => n > 75) ? 90 : 75;
  }, [myCards, drawn, s]);

  const hasDrawn = drawn.length > 0;
  const isDrawing = hasDrawn || status === 'DRAWING' || status === 'drawing' || (s.current_state?.status === 'DRAWING');
  const isPlaying = hasDrawn || ['playing', 'PLAYING', 'DRAWING', 'drawing'].includes(status);
  
  // Ventas abiertas si NO ha iniciado la extracción (0 bolas extraídas) y faltan más de 10s (o sin temporizador de bloqueo)
  const isCountdownUnder10 = countdownSeconds !== undefined && countdownSeconds <= 10 && countdownSeconds >= 0;
  const normStatus = String(status || '').toUpperCase();
  const computedSalesClosed = hasDrawn || ['FINISHED', 'COMPLETED', 'CANCELLED', 'ABANDONED'].includes(normStatus) || isCountdownUnder10;
  // REGLA DE ORO: Si isSalesClosed es provisto por el contenedor, es la autoridad definitiva
  const effectiveSalesClosed = isSalesClosed !== undefined ? isSalesClosed : computedSalesClosed;
  const salesClosed = effectiveSalesClosed;
  const salesOpen = !effectiveSalesClosed;
  const isEffectiveSalesClosed = effectiveSalesClosed;

  const cardIsFull = (card: any): boolean => {
    let ok = true, any = false;
    card.grid.forEach((row: any[]) => row.forEach((v: any) => {
      const n = Number(v);
      if (n > 0) { any = true; if (!calledSet.has(n)) ok = false; }
    }));
    return any && ok;
  };

  const cardProgress = (card: any) => {
    let hit = 0, total = 0;
    card.grid.forEach((row: any[]) => row.forEach((v: any) => {
      const n = Number(v);
      if (n > 0) { total++; if (calledSet.has(n)) hit++; }
    }));
    return { hit, total };
  };

  const autoCalledRef = useRef(false);
  useEffect(() => {
    if (!isPlaying || autoCalledRef.current || myCards.length === 0) return;
    if (myCards.some(cardIsFull)) {
      autoCalledRef.current = true;
      onClaimBingo();
    }
  }, [calledSet, myCards, isPlaying]);

  // ✅ PASO 1 (Server-Authoritative): El cliente es un observador pasivo.
  // Se detiene el bucle interval en el frontend; el backend/Edge Function dicta las balotas por Realtime.
  // (Anteriormente un setInterval ejecutaba onDrawBall() causando sobrecarga y errores 404).

  const safeActive = Math.min(activeIndex, Math.max(0, myCards.length - 1));

  const getCardProximity = (card: any) => {
    const is5x5 = card.grid.length === 5 && (card.grid[0]?.length === 5 || card.grid[0]?.length === undefined);
    if (is5x5) {
      let minMissing = 5;
      for (let r = 0; r < 5; r++) {
        const lineNums = (card.grid[r] || []).filter((x: any) => Number(x) > 0).map(Number);
        const missing = lineNums.filter((n: number) => !calledSet.has(n)).length;
        if (missing < minMissing) minMissing = missing;
      }
      for (let c = 0; c < 5; c++) {
        const lineNums: number[] = [];
        for (let r = 0; r < 5; r++) {
          const v = Number(card.grid[r]?.[c]);
          if (v > 0) lineNums.push(v);
        }
        const missing = lineNums.filter((n: number) => !calledSet.has(n)).length;
        if (missing < minMissing) minMissing = missing;
      }
      const diag1 = [card.grid[0]?.[0], card.grid[1]?.[1], card.grid[2]?.[2], card.grid[3]?.[3], card.grid[4]?.[4]].filter((x: any) => Number(x) > 0).map(Number);
      const diag2 = [card.grid[0]?.[4], card.grid[1]?.[3], card.grid[2]?.[2], card.grid[3]?.[1], card.grid[4]?.[0]].filter((x: any) => Number(x) > 0).map(Number);
      const missingD1 = diag1.filter((n: number) => !calledSet.has(n)).length;
      const missingD2 = diag2.filter((n: number) => !calledSet.has(n)).length;
      if (missingD1 < minMissing) minMissing = missingD1;
      if (missingD2 < minMissing) minMissing = missingD2;

      return minMissing;
    }
    const prog = cardProgress(card);
    return Math.max(0, prog.total - prog.hit);
  };

  const renderCard = (card: any, index: number, compact: boolean) => {
    const prog = cardProgress(card);
    const proximity = getCardProximity(card);
    const cols = card.grid[0]?.length || 9;
    const isQuiniela = cols === 9;
    const isBingo75 = cols === 5 || maxBall === 75;

    return (
      <motion.div
        key={card.id}
        id={index === 0 && isBingo75 ? 'bingo-card-75' : `bingo-card-${card.id}`}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: compact ? index * 0.03 : 0 }}
        className="rounded-xl border-2 overflow-hidden"
        style={{ background: T.panel, borderColor: !compact ? T.accent : T.border, boxShadow: '0 6px 16px rgba(0,0,0,0.45)' }}
      >
        <div className="flex items-center justify-between px-2 py-1 gap-2"
          style={{ background: isQuiniela
            ? 'linear-gradient(90deg, #FFC94B33, #EF334033, #003DA533)'
            : `linear-gradient(90deg, ${T.accent}33, transparent)` }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: T.accent }}>
              {isQuiniela ? '🇻🇪 Quiniela' : '🎫 Cartón'} #{index + 1}
            </span>

            {/* Indicador de Proximidad al Ganador (Near Win) */}
            {proximity === 1 && (
              <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase animate-pulse flex items-center gap-1 shadow-md">
                <span>⚠️ A 1 BALOTA</span>
              </span>
            )}
            {proximity > 1 && proximity <= 3 && (
              <span className="text-[9px] font-black bg-amber-500/30 text-amber-300 border border-amber-500/50 px-2 py-0.5 rounded-full uppercase">
                ⚠️ A {proximity} BALOTAS
              </span>
            )}
            {proximity === 0 && (
              <span className="text-[9px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase animate-bounce">
                🎉 ¡BINGO!
              </span>
            )}
          </div>
          <span className="text-[9px] font-mono font-bold shrink-0" style={{ color: T.sub }}>{prog.hit}/{prog.total}</span>
        </div>
        <div className="h-1 w-full" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="h-full transition-all duration-500"
            style={{ width: `${prog.total ? (prog.hit / prog.total) * 100 : 0}%`, background: T.accent }} />
        </div>
        <div className="p-1.5 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {card.grid.map((row: any[], r: number) =>
            row.map((v: any, c: number) => {
              const n = Number(v);
              const empty = !(n > 0);
              const called = !empty && calledSet.has(n);
              const marked = card.markedSet.has(`${r}_${c}`);
              const clickable = !empty && called && isPlaying && !isFinished;
              return (
                <button key={`${r}_${c}`} type="button" disabled={!clickable}
                  onClick={() => clickable && onMarkNumber(r, c)}
                  className={`relative flex items-center justify-center rounded-[4px] font-black transition-all ${
                    compact ? 'h-5 text-[8px] sm:h-6 sm:text-[9px]' : 'h-8 text-xs sm:h-10 sm:text-sm'
                  } ${clickable ? 'cursor-pointer active:scale-90' : ''}`}
                  style={{
                    background: marked ? `linear-gradient(145deg, ${T.accent}, ${T.accent}BB)`
                      : empty ? 'rgba(0,0,0,0.45)'
                      : called && autoGlow ? 'rgba(255,255,255,0.16)'
                      : isQuiniela ? 'linear-gradient(160deg, #FFFBEE, #EFE2C0)'
                      : 'rgba(255,255,255,0.06)',
                    color: marked ? '#1A120C' : empty ? 'rgba(255,255,255,0.15)' : isQuiniela && !called ? '#3E2B1F' : called ? T.accent : T.text,
                    boxShadow: called && autoGlow && !marked ? `inset 0 0 0 1.5px ${T.accent}AA` : 'none',
                    border: `1px solid ${isQuiniela && !empty ? 'rgba(139,107,67,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  {empty ? '★' : n}
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col items-center p-2 sm:p-4 max-w-5xl mx-auto w-full space-y-2 sm:space-y-2.5 relative max-w-full overflow-x-hidden"
      style={{ background: T.bg, minHeight: '100%' }}>

      {/* ===== BARRA SUPERIOR DE CONTROL RESPONSIVA ===== */}
      <div className="w-full rounded-2xl border p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2"
        style={{ background: T.panel, borderColor: T.border }}>
        {/* Izquierda: Temas y Métricas de la sala */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/20 border border-white/5">
            <Palette className="w-3.5 h-3.5 ml-0.5" style={{ color: T.accent }} />
            <div className="flex items-center gap-1">
              {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
                <button key={k} onClick={() => changeTheme(k)} title={THEMES[k].label}
                  className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg border transition-all"
                  style={{ borderColor: themeKey === k ? THEMES[k].accent : 'transparent', background: themeKey === k ? 'rgba(255,255,255,0.12)' : 'transparent' }}>
                  {THEMES[k].swatch.map((c: string, i: number) => (
                    <span key={i} className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-black/30" style={{ background: c }} />
                  ))}
                </button>
              ))}
            </div>
          </div>
          <span className="px-2 py-0.5 sm:py-1 rounded-full border text-[9px] font-black tracking-wider uppercase"
            style={{ borderColor: T.accent, color: T.accent, background: `${T.accent}15` }}>
            {maxBall} BOLAS
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-full border text-[9px] font-black font-mono"
            style={{ borderColor: T.border, color: T.text, background: 'rgba(255,255,255,0.05)' }}>
            <Users className="w-3 h-3" /> {totalCardsInTable}
          </span>
          {isHost && (
            <span className="flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-full border text-[9px] font-black"
              style={{ borderColor: '#34D399', color: '#34D399', background: 'rgba(52,211,153,0.1)' }}>
              👑 Host
            </span>
          )}
        </div>

        {/* Derecha: Botones de Acción Agrupados */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black uppercase transition-colors"
              style={{
                borderColor: T.border,
                color: isMuted ? T.sub : T.accent,
                background: 'rgba(255,255,255,0.04)',
              }}
              title={isMuted ? 'Activar Sonido' : 'Silenciar'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span className="hidden xs:inline">{isMuted ? 'Mute' : 'Audio'}</span>
            </button>
          )}
          <button onClick={() => setAutoGlow(!autoGlow)} className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black uppercase transition-colors"
            style={{ borderColor: autoGlow ? T.accent : T.border, color: autoGlow ? T.accent : T.sub, background: autoGlow ? `${T.accent}22` : 'rgba(255,255,255,0.04)' }}>
            <Eye className="w-3.5 h-3.5" /> <span>Auto</span>
          </button>
          <button onClick={() => setShowBoard(!showBoard)} className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-black uppercase transition-colors"
            style={{ borderColor: showBoard ? T.accent : T.border, color: showBoard ? T.accent : T.sub, background: showBoard ? `${T.accent}22` : 'rgba(255,255,255,0.04)' }}>
            <Grid3X3 className="w-3.5 h-3.5" /> <span>Tablero</span>
          </button>
        </div>
      </div>

      {/* Sub-barra de Estado Operativo */}
      <div className="w-full flex items-center justify-between gap-1.5 flex-wrap text-[10px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border font-black uppercase text-[9px] sm:text-[10px]"
            style={{
              background: isEffectiveSalesClosed ? 'rgba(229,57,53,0.15)' : 'rgba(52,211,153,0.15)',
              borderColor: isEffectiveSalesClosed ? '#E53935' : '#34D399',
              color: isEffectiveSalesClosed ? '#F87171' : '#34D399',
            }}>
            <Ticket className="w-3 h-3" />
            {isEffectiveSalesClosed ? 'Venta cerrada' : 'Venta abierta'}
          </div>
          {!isEffectiveSalesClosed && (countdownSeconds ?? 0) > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border font-black font-mono animate-pulse text-[9px] sm:text-[10px]"
              style={{ background: `${T.accent}22`, borderColor: T.accent, color: T.accent }}>
              <Clock className="w-3 h-3" /> {countdownSeconds}s
            </div>
          )}
        </div>
        {bcvRate !== undefined && bcvRate > 0 && (
          <div className="px-2 py-0.5 rounded-full border font-mono text-[9px] sm:text-[10px] ml-auto"
            style={{ background: 'rgba(255,255,255,0.05)', borderColor: T.border, color: T.sub }}>
            BCV: {Number(bcvRate).toFixed(2)} Bs/$
          </div>
        )}
      </div>

      {/* 👑 Botón Mágico para el Host de la Mesa */}
      {isHost && salesOpen && (onStartDraw || onDrawBall) && (
        <div className="w-full p-3 sm:p-4 rounded-2xl border text-center my-1.5 shadow-lg"
          style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.5)' }}>
          <p className="text-amber-400 font-bold mb-2 text-xs sm:text-sm">👑 Eres el Host de la mesa</p>
          <button
            type="button"
            onClick={async () => {
              console.log("[HOST_ACTION] Iniciando sorteo...");
              if (onStartDraw) {
                await onStartDraw();
              } else if (onDrawBall) {
                await onDrawBall();
              }
            }}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black py-2.5 px-6 sm:py-3 sm:px-8 rounded-xl hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-amber-500/20 text-xs sm:text-sm cursor-pointer inline-flex items-center gap-2 touch-manipulation"
          >
            🎱 INICIAR SORTEO AHORA
          </button>
        </div>
      )}

      <AnimatePresence>
        {salesOpen && onBuyCards && myCards.length < (s.maxCardsPerPlayer || 20) && !isFinished && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="w-full overflow-hidden">
            <div className="p-3 rounded-2xl border-2 flex items-center justify-between gap-3 flex-wrap"
              style={{ background: T.panel, borderColor: '#34D399' }}>
              <div>
                <div className="text-[11px] font-black uppercase" style={{ color: T.text }}>🎫 Compra tus cartones</div>
                <div className="text-[9px]" style={{ color: T.sub }}>Tienes {myCards.length} de {s.maxCardsPerPlayer || 20}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setBuyCount(Math.max(1, buyCount - 1))} className="p-2 rounded-lg border touch-manipulation active:scale-95 transition-transform" style={{ borderColor: T.border }}>
                  <Minus className="w-3.5 h-3.5" style={{ color: T.accent }} />
                </button>
                <span className="text-lg font-black font-mono w-8 text-center" style={{ color: T.accent }}>{buyCount}</span>
                <button onClick={() => setBuyCount(Math.min((s.maxCardsPerPlayer || 20) - myCards.length, buyCount + 1))} className="p-2 rounded-lg border touch-manipulation active:scale-95 transition-transform" style={{ borderColor: T.border }}>
                  <Plus className="w-3.5 h-3.5" style={{ color: T.accent }} />
                </button>
                <button onClick={async () => {
                  await onBuyCards(buyCount);
                  setRefreshKey((k) => k + 1);
                }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase text-white touch-manipulation active:scale-95 transition-transform cursor-pointer"
                  style={{ background: 'linear-gradient(145deg,#43A047,#1B5E20)', boxShadow: '0 5px 14px rgba(27,94,32,0.5)' }}>
                  <ShoppingCart className="w-3.5 h-3.5" /> Comprar
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {!salesOpen && !isFinished && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="w-full overflow-hidden">
            <div className="p-2.5 sm:p-3 rounded-2xl border flex items-center justify-between gap-2 sm:gap-3 flex-wrap"
              style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.35)' }}>
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm bg-amber-500/20 text-amber-300 shrink-0">
                  🔒
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-amber-300 truncate">
                    Compras cerradas
                  </div>
                  <div className="text-[8px] sm:text-[9px] text-amber-200/80 truncate sm:whitespace-normal">
                    {isDrawing || drawn.length > 0
                      ? 'El sorteo ya comenzó. ¡Buena suerte con tus cartones!'
                      : 'Las ventas de cartones han concluido para esta ronda.'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-[9px] sm:text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                  {myCards.length} {myCards.length === 1 ? 'cartón activo' : 'cartones activos'}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isFinished && (
        <div className="w-full relative overflow-hidden rounded-2xl sm:rounded-3xl border-2 p-3 sm:p-4"
          style={{ background: T.panel, borderColor: T.border, boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            className="absolute -right-10 -top-10 w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-dashed opacity-15 pointer-events-none" style={{ borderColor: T.accent }} />
          <div className="relative z-10 flex items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-center" style={{ color: T.sub }}>Balota actual</span>
              <AnimatePresence mode="wait">
                <motion.div key={lastBall || 'none'}>
                  {lastBall ? <Ball n={lastBall} max={maxBall} size="xl" /> : (
                    <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-2 sm:border-4 border-dashed flex items-center justify-center" style={{ borderColor: T.border }}>
                      <Dices className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: T.sub }} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest mb-1 truncate" style={{ color: T.sub }}>
                Últimas balotas ({drawn.length})
              </div>
              <div className="flex gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {drawn.length === 0 ? (
                  <span className="text-[10px] font-mono" style={{ color: T.sub }}>Esperando sorteo...</span>
                ) : (
                  [...drawn].reverse().slice(0, 14).map((n, i) => <Ball key={`${n}-${i}`} n={n} max={maxBall} />)
                )}
              </div>
              <div className="flex gap-1.5 mt-1.5 sm:mt-2">
                {salesOpen && isHost && (onStartDraw || onDrawBall) && (
                  <button type="button" onClick={onStartDraw || onDrawBall}
                    className="flex-1 py-2 sm:py-2.5 rounded-xl font-black text-[10px] sm:text-[11px] uppercase flex items-center justify-center gap-1.5 transition-transform active:scale-95 text-slate-950 shadow-lg"
                    style={{ background: 'linear-gradient(145deg, #F59E0B, #D97706)' }}>
                    <Dices className="w-3.5 h-3.5 text-slate-950" /> 🎱 Iniciar Sorteo Ahora
                  </button>
                )}
                {isPlaying && !salesOpen && (
                  <div className="flex-1 py-1.5 sm:py-2 px-2.5 sm:px-3 rounded-xl font-black text-[9px] sm:text-[10px] uppercase flex items-center justify-center gap-1.5 sm:gap-2 border truncate"
                    style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.35)' }}>
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="truncate">📡 Sorteo Oficial en Vivo</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showBoard && !isFinished && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full overflow-hidden">
            <div className="p-2.5 rounded-2xl border grid gap-1"
              style={{ background: T.panel, borderColor: T.border, gridTemplateColumns: 'repeat(10, 1fr)' }}>
              {Array.from({ length: maxBall }, (_, i) => i + 1).map((n) => (
                <div key={n} className="h-6 sm:h-7 rounded-md flex items-center justify-center text-[9px] sm:text-[10px] font-black"
                  style={{ background: calledSet.has(n) ? ballColor(n, maxBall) : 'rgba(255,255,255,0.05)', color: calledSet.has(n) ? '#FFF' : T.sub }}>
                  {n}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center p-0.5 rounded-xl border bg-black/20" style={{ borderColor: T.border }}>
            <button onClick={() => setViewMode('all')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all"
              style={{
                color: viewMode === 'all' ? T.accent : T.sub,
                background: viewMode === 'all' ? `${T.accent}22` : 'transparent',
              }}>
              <LayoutGrid className="w-3.5 h-3.5" /> Mis cartones ({myCards.length})
            </button>
            <button onClick={() => setViewMode('single')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all"
              style={{
                color: viewMode === 'single' ? T.accent : T.sub,
                background: viewMode === 'single' ? `${T.accent}22` : 'transparent',
              }}>
              <Square className="w-3.5 h-3.5" /> Uno
            </button>
          </div>
          {viewMode === 'single' && myCards.length > 0 && !isFinished && (
            <div className="flex items-center gap-1">
              <button onClick={() => setActiveIndex(Math.max(0, safeActive - 1))} className="p-1 rounded-lg border" style={{ borderColor: T.border }}>
                <ChevronLeft className="w-3.5 h-3.5" style={{ color: T.accent }} />
              </button>
              <span className="text-[10px] font-black font-mono px-1" style={{ color: T.text }}>{safeActive + 1}/{myCards.length}</span>
              <button onClick={() => setActiveIndex(Math.min(myCards.length - 1, safeActive + 1))} className="p-1 rounded-lg border" style={{ borderColor: T.border }}>
                <ChevronRight className="w-3.5 h-3.5" style={{ color: T.accent }} />
              </button>
            </div>
          )}
        </div>
        {myCards.length > 1 && !isFinished && (
          <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1.5 mb-2">
            {myCards.map((_, i) => (
              <button key={i} onClick={() => { setActiveIndex(i); setViewMode('single'); }}
                className="shrink-0 w-7 h-7 rounded-lg border text-[9px] font-black transition-all"
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
        {viewMode === 'all' ? (
          <div className="grid grid-cols-1 min-[430px]:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[46vh] overflow-y-auto no-scrollbar pr-0.5">
            {myCards.length > 0 ? myCards.map((card, i) => renderCard(card, i, true)) : (
              <div className="col-span-full text-center text-[10px] font-mono py-4" style={{ color: T.sub }}>
                {salesOpen ? '🎫 Compra tus cartones arriba' : 'No tienes cartones en esta ronda.'}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-md mx-auto w-full">
            {myCards[safeActive] ? renderCard(myCards[safeActive], safeActive, false) : (
              <div className="text-center text-[10px] font-mono py-4" style={{ color: T.sub }}>Sin cartones.</div>
            )}
          </div>
        )}
      </div>

      {!isFinished && (
        <motion.button
          id="claim-bingo-btn"
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.96 }}
          onClick={onClaimBingo}
          disabled={!isPlaying}
          className="w-full py-3 sm:py-3.5 rounded-2xl font-black text-base sm:text-lg uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40 relative overflow-hidden shadow-lg transition-all touch-manipulation active:scale-95 cursor-pointer"
          style={{ background: 'linear-gradient(145deg,#E53935,#B71C1C 60%,#8B1E2D)', color: '#FFF', border: '2px solid #FFC94B', boxShadow: '0 8px 24px rgba(229,57,53,0.4)' }}>
          <Trophy className="relative z-10 w-5 h-5 text-amber-300" />
          <span className="relative z-10">¡BINGO!</span>
          <Sparkles className="relative z-10 w-4 h-4 text-amber-300" />
        </motion.button>
      )}

      <div className="flex items-center justify-center gap-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-widest py-1" style={{ color: T.sub }}>
        <div className="w-8 sm:w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.accent})` }} />
        <span>🇻🇪 Bingo Criollo 🇻🇪</span>
        <div className="w-8 sm:w-10 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.accent})` }} />
      </div>

      {/* ===== MODAL DE RESULTADOS (visible para TODOS los jugadores) ===== */}
      <AnimatePresence>
        {isFinished && winnerName && showResultsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="relative w-full max-w-lg rounded-3xl border-2 overflow-hidden shadow-2xl"
              style={{
                background: T.panel,
                borderColor: isWinner ? '#FFC94B' : T.border,
                boxShadow: isWinner ? '0 20px 60px rgba(255,201,75,0.4)' : '0 20px 60px rgba(0,0,0,0.7)',
              }}
            >
              {/* Banner superior */}
              <div className="relative overflow-hidden"
                style={{
                  background: isWinner
                    ? 'linear-gradient(135deg, #FFC94B 0%, #EF3340 50%, #003DA5 100%)'
                    : 'linear-gradient(135deg, #1F2937 0%, #374151 100%)',
                }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  className="absolute -right-8 -top-8 w-32 h-32 rounded-full border-4 border-dashed opacity-20"
                  style={{ borderColor: '#FFF' }}
                />
                <div className="relative p-6 text-center">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                    className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/40 mb-3"
                  >
                    {isWinner ? (
                      <Crown className="w-10 h-10 text-white drop-shadow-lg" />
                    ) : (
                      <Trophy className="w-10 h-10 text-white/70" />
                    )}
                  </motion.div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-wider drop-shadow-lg">
                    {isWinner ? '¡GANASTE!' : 'FIN DEL JUEGO'}
                  </h2>
                  <p className="text-white/90 text-sm sm:text-base font-bold mt-1">
                    {isWinner ? '🏆 Cartón lleno confirmado' : `Ganador: ${winnerName}`}
                  </p>
                </div>
              </div>

              {/* Contenido */}
              <div className="p-5 space-y-4">
                {/* Ganador destacado */}
                <div className="rounded-2xl p-4 border-2 text-center"
                  style={{
                    background: isWinner ? 'rgba(255,201,75,0.15)' : 'rgba(255,255,255,0.05)',
                    borderColor: isWinner ? '#FFC94B' : T.border,
                  }}>
                  <div className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: T.sub }}>
                    {isWinner ? '¡Tú eres el campeón!' : 'Ganador de la partida'}
                  </div>
                  <div className="text-2xl font-black flex items-center justify-center gap-2" style={{ color: isWinner ? '#FFC94B' : T.text }}>
                    <Crown className="w-6 h-6" />
                    {winnerName}
                  </div>
                </div>

                {/* Resumen financiero */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: T.sub }}>Pozo Total</div>
                    <div className="text-sm font-black font-mono" style={{ color: T.text }}>{formatBs(grossPool)}</div>
                    <div className="text-[8px] mt-0.5" style={{ color: T.sub }}>{totalCardsInTable} cartones</div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid #34D399' }}>
                    <div className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: '#34D399' }}>Premio (90%)</div>
                    <div className="text-sm font-black font-mono" style={{ color: '#34D399' }}>{formatBs(prizePool)}</div>
                    <div className="text-[8px] mt-0.5" style={{ color: T.sub }}>Ganador</div>
                  </div>
                  <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: T.sub }}>Plataforma (10%)</div>
                    <div className="text-sm font-black font-mono" style={{ color: T.text }}>{formatBs(platformFee)}</div>
                    <div className="text-[8px] mt-0.5" style={{ color: T.sub }}>Comisión</div>
                  </div>
                </div>

                {/* Balotas cantadas */}
                {drawn.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: T.sub }}>
                      <Dices className="w-3 h-3" /> Balotas cantadas ({drawn.length}/{maxBall})
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar p-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.3)' }}>
                      {drawn.map((n, i) => (
                        <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0"
                          style={{ background: ballColor(n, maxBall), boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Participantes */}
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: T.sub }}>
                    <Users className="w-3 h-3" /> Participantes ({totalPlayers})
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto no-scrollbar">
                    {playerNamesKeys.map((uid) => {
                      const isThisWinner = uid === winnerUserId;
                      const isMe = uid === currentUserId;
                      const cardCount = s.cardsPurchased?.[uid] || 0;
                      return (
                        <div key={uid} className="flex items-center justify-between px-3 py-2 rounded-xl"
                          style={{
                            background: isThisWinner ? 'rgba(255,201,75,0.15)' : isMe ? 'rgba(255,255,255,0.05)' : 'transparent',
                            border: `1px solid ${isThisWinner ? '#FFC94B' : isMe ? T.border : 'transparent'}`,
                          }}>
                          <div className="flex items-center gap-2">
                            {isThisWinner && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                            <span className="text-xs font-bold truncate max-w-[180px]" style={{ color: isThisWinner ? '#FFC94B' : T.text }}>
                              {s.playerNames?.[uid] || 'Jugador'}
                              {isMe && <span className="ml-1 text-[8px] text-amber-400">(TÚ)</span>}
                            </span>
                          </div>
                          <span className="text-[9px] font-mono" style={{ color: T.sub }}>
                            {cardCount} {cardCount === 1 ? 'cartón' : 'cartones'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowResultsModal(false);
                      // Navegar al lobby (simula botón Volver)
                      window.history.back();
                    }}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95 touch-manipulation cursor-pointer"
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      color: T.text,
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    <Home className="w-4 h-4" />
                    Lobby
                  </button>
                  <button
                    onClick={() => {
                      setShowResultsModal(false);
                      // Recargar la página para jugar de nuevo (en el mismo lugar)
                      window.location.reload();
                    }}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95 touch-manipulation cursor-pointer"
                    style={{
                      background: isWinner
                        ? 'linear-gradient(145deg, #FFC94B, #E6A817)'
                        : `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`,
                      color: '#1A120C',
                      boxShadow: `0 5px 14px ${T.accent}55`,
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Jugar de nuevo
                  </button>
                </div>
              </div>

              {/* Botón cerrar */}
              <button
                onClick={() => setShowResultsModal(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 active:scale-90 flex items-center justify-center transition-all touch-manipulation cursor-pointer"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botón flotante para reabrir resultados si se cerró */}
      {isFinished && winnerName && !showResultsModal && (
        <motion.button
          initial={{ scale: 0, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          onClick={() => setShowResultsModal(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs shadow-2xl transition-all animate-pulse touch-manipulation active:scale-95 cursor-pointer"
          style={{
            background: isWinner ? 'linear-gradient(145deg, #FFC94B, #E6A817)' : `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`,
            color: '#1A120C',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          }}
        >
          <Trophy className="w-4 h-4" />
          Ver Resultados
        </motion.button>
      )}
    </div>
  );
};
