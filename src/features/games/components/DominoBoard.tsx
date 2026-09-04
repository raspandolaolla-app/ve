// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DOMINÓ VENEZOLANO
// ==============================================================================
// • SERPIENTE que nace en el CENTRO de la mesa con giros de 90°
// • Barra de acciones: PASAR TURNO + ROBAR DEL MASO (siempre visibles en turno)
// • 3 TEMAS seleccionables en partida
// • Compatible 100% con Supabase y GameContainer
// ==============================================================================

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Trophy, Hand, ArrowLeftRight, Zap, RotateCw, Layers, SkipForward, Download } from 'lucide-react';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';

interface DominoBoardProps {
  state: any;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onPlayTile: (tile: any, side: any) => void;
  onPassTurn: () => void;
  onDrawTile?: () => void; // Opcional: solo si el motor soporta ROBAR (DRAW_TILE)
}

// ==============================================================================
// SISTEMA DE TEMAS (3 DISEÑOS SELECCIONABLES)
// ==============================================================================
type ThemeKey = 'verde' | 'caoba' | 'tricolor';

const THEMES: Record<ThemeKey, any> = {
  verde: {
    label: 'Paño Verde Pro',
    swatch: ['#0E5A34', '#FAF0E1', '#FFC94B'],
    felt: 'radial-gradient(ellipse at 50% 45%, #147A46 0%, #0E5A34 45%, #073B22 80%, #052A18 100%)',
    frame: 'linear-gradient(145deg, #6B4423 0%, #4E2E17 50%, #3A2010 100%)',
    tileFace: 'linear-gradient(145deg, #FFFFFF 0%, #FAF0E1 55%, #E8DCC8 100%)',
    tileEdge: '#C9B896',
    pip: '#1A1A1A',
    divider: 'rgba(0,0,0,0.35)',
    accent: '#FFC94B',
    text: '#F5EFDD',
    sub: '#9CC4A8',
    panel: 'linear-gradient(145deg, rgba(10,40,25,0.92) 0%, rgba(5,25,15,0.92) 100%)',
    border: '#147A46',
  },
  caoba: {
    label: 'Caoba Criolla',
    swatch: ['#8B5A2B', '#E8D5B7', '#5C2626'],
    felt: 'radial-gradient(ellipse at 50% 45%, #4E342E 0%, #3E2B1F 50%, #2B1D14 85%, #1C120C 100%)',
    frame: 'linear-gradient(145deg, #8B5A2B 0%, #6B4423 50%, #4E2E17 100%)',
    tileFace: 'linear-gradient(145deg, #FAF0E1 0%, #E8D5B7 55%, #D7C4A3 100%)',
    tileEdge: '#B89A6A',
    pip: '#3A2010',
    divider: 'rgba(139,107,67,0.55)',
    accent: '#FFC94B',
    text: '#F0E2C8',
    sub: '#A8865A',
    panel: 'linear-gradient(145deg, #2B1D14 0%, #1C120C 100%)',
    border: '#3E2B1F',
  },
  tricolor: {
    label: 'Tricolor Noche',
    swatch: ['#FFD100', '#003DA5', '#EF3340'],
    felt: 'radial-gradient(ellipse at 50% 45%, #123B7A 0%, #0A2A5C 50%, #061A3A 85%, #04102A 100%)',
    frame: 'linear-gradient(145deg, #0A2A5C 0%, #061A3A 100%)',
    tileFace: 'linear-gradient(145deg, #FFFFFF 0%, #F0F4FA 55%, #DCE4F0 100%)',
    tileEdge: '#8FA8CC',
    pip: '#0A2A5C',
    divider: 'rgba(0,61,165,0.4)',
    accent: '#FFD100',
    text: '#EAF2FF',
    sub: '#8FA8CC',
    panel: 'linear-gradient(145deg, #0A2A5C 0%, #061A3A 100%)',
    border: '#123B7A',
  },
};

// ==============================================================================
// UTILIDADES
// ==============================================================================
const getTileValues = (t: any): [number, number] | null => {
  if (!t) return null;
  if (Array.isArray(t) && t.length >= 2) return [Number(t[0]), Number(t[1])];
  if (Array.isArray(t?.values)) return [Number(t.values[0]), Number(t.values[1])];
  if (typeof t?.a === 'number' && typeof t?.b === 'number') return [t.a, t.b];
  if (typeof t?.left === 'number' && typeof t?.right === 'number') return [t.left, t.right];
  return null;
};

const getRawSide = (raw: any): 'left' | 'right' | null => {
  const s = (raw?.side ?? raw?.end ?? raw?.pos ?? raw?.placement ?? '').toString().toLowerCase();
  if (['right', 'r', 'end', 'derecha', 'der'].includes(s)) return 'right';
  if (['left', 'l', 'start', 'izquierda', 'izq'].includes(s)) return 'left';
  return null;
};

const PIP_MAP: Record<number, number[]> = {
  0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

const HalfPips: React.FC<{ value: number; theme: any }> = ({ value, theme }) => (
  <div className="relative grid grid-cols-3 grid-rows-3 w-full h-full p-[10%]">
    {Array.from({ length: 9 }).map((_, i) => (
      <div key={i} className="flex items-center justify-center">
        {PIP_MAP[value]?.includes(i) && (
          <div
            className="w-[70%] h-[70%] rounded-full"
            style={{
              background: `radial-gradient(circle at 32% 28%, ${theme.pip} 0%, ${theme.pip} 55%, rgba(0,0,0,0.75) 100%)`,
              boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.4), 0 1px 1px rgba(255,255,255,0.3)',
            }}
          />
        )}
      </div>
    ))}
  </div>
);

// ==============================================================================
// GEOMETRÍA DE LA SERPIENTE CENTRAL (13 x 7)
// ==============================================================================
const COLS = 13;
const ROWS = 7;
const MIDR = 3;
const MIDC = 6;

type Cell = { r: number; c: number };

const buildRightPath = (): Cell[] => {
  const path: Cell[] = [];
  let r = MIDR, c = MIDC + 2, dir = 1;
  while (path.length < 60 && r < ROWS) {
    path.push({ r, c });
    if (dir === 1) {
      if (c + 1 <= COLS - 1) c++;
      else { r++; dir = -1; }
    } else {
      if (c - 1 >= 0) c--;
      else { r++; dir = 1; }
    }
  }
  return path;
};

const buildLeftPath = (): Cell[] => {
  const path: Cell[] = [];
  let r = MIDR, c = MIDC - 1, dir = -1;
  while (path.length < 60 && r >= 0) {
    path.push({ r, c });
    if (dir === -1) {
      if (c - 1 >= 0) c--;
      else { r--; dir = 1; }
    } else {
      if (c + 1 <= COLS - 1) c++;
      else { r--; dir = -1; }
    }
  }
  return path;
};

const RIGHT_PATH = buildRightPath();
const LEFT_PATH = buildLeftPath();

// ==============================================================================
// COMPONENTE PRINCIPAL
// ==============================================================================
export const DominoBoard: React.FC<DominoBoardProps> = ({
  state,
  currentUserId,
  turnExpiresAt,
  sessionId,
  onPlayTile,
  onPassTurn,
  onDrawTile,
}) => {
  const s: any = state || {};

  // ----- Tema (persistente) -----
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_domino_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'verde';
  });
  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => {
    setThemeKey(k);
    try { localStorage.setItem('rlo_domino_theme', k); } catch {}
  };

  // ----- Estado -----
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
    if (Array.isArray(p?.tiles)) return p.tiles;
    return [];
  };
  const myHand: any[] = getHand(currentUserId);

  // ----- Detección del MASO (boneyard) -----
  const boneyardCount = useMemo((): number => {
    if (typeof s.boneyardCount === 'number') return s.boneyardCount;
    if (typeof s.remainingTiles === 'number') return s.remainingTiles;
    if (typeof s.maso === 'number') return s.maso;
    if (Array.isArray(s.boneyard)) return s.boneyard.length;
    if (Array.isArray(s.maso)) return s.maso.length;
    if (Array.isArray(s.drawPile)) return s.drawPile.length;
    if (Array.isArray(s.pool)) return s.pool.length;
    return 0;
  }, [s]);

  const rawPlayed: any[] = Array.isArray(s.board) ? s.board
    : Array.isArray(s.chain) ? s.chain
    : Array.isArray(s.placedTiles) ? s.placedTiles
    : [];

  // ----- Serpiente desde el centro -----
  const layout = useMemo(() => {
    const placed: { a: Cell; va: number; b: Cell; vb: number; key: number }[] = [];
    let leftEnd: number | null = null;
    let rightEnd: number | null = null;
    let ri = 0, li = 0;

    rawPlayed.forEach((raw, idx) => {
      const vals = getTileValues(raw?.tile) || getTileValues(raw);
      if (!vals) return;

      if (placed.length === 0) {
        placed.push({
          a: { r: MIDR, c: MIDC }, va: vals[0],
          b: { r: MIDR, c: MIDC + 1 }, vb: vals[1],
          key: idx,
        });
        leftEnd = vals[0];
        rightEnd = vals[1];
        return;
      }

      let side = getRawSide(raw);
      if (!side) {
        const fitsR = vals.includes(rightEnd as number);
        const fitsL = vals.includes(leftEnd as number);
        side = fitsR && !fitsL ? 'right' : fitsL && !fitsR ? 'left' : 'right';
      }

      if (side === 'right') {
        const vConn = vals[0] === rightEnd ? vals[0] : vals[1];
        const vOuter = vConn === vals[0] ? vals[1] : vals[0];
        const ca = RIGHT_PATH[ri * 2];
        const cb = RIGHT_PATH[ri * 2 + 1];
        if (!ca || !cb) return;
        placed.push({ a: ca, va: vConn, b: cb, vb: vOuter, key: idx });
        rightEnd = vOuter;
        ri++;
      } else {
        const vConn = vals[0] === leftEnd ? vals[0] : vals[1];
        const vOuter = vConn === vals[0] ? vals[1] : vals[0];
        const ca = LEFT_PATH[li * 2];
        const cb = LEFT_PATH[li * 2 + 1];
        if (!ca || !cb) return;
        placed.push({ a: ca, va: vConn, b: cb, vb: vOuter, key: idx });
        leftEnd = vOuter;
        li++;
      }
    });

    return { placed, leftEnd, rightEnd };
  }, [rawPlayed]);

  const { placed, leftEnd, rightEnd } = layout;

  // ----- Jugabilidad -----
  const validSidesFor = (tile: any): ('left' | 'right')[] => {
    const v = getTileValues(tile);
    if (!v) return [];
    if (placed.length === 0) return ['right'];
    const sides: ('left' | 'right')[] = [];
    if (v.includes(rightEnd as number)) sides.push('right');
    if (v.includes(leftEnd as number)) sides.push('left');
    return sides;
  };

  const playableCount = isMyTurn ? myHand.filter((t) => validSidesFor(t).length > 0).length : 0;
  const hasNoMove = isMyTurn && playableCount === 0;
  const canDraw = hasNoMove && boneyardCount > 0;
  const mustPass = hasNoMove && boneyardCount === 0;

  const [pendingTile, setPendingTile] = useState<any>(null);
  const handleHandClick = (tile: any) => {
    if (!isMyTurn) return;
    const sides = validSidesFor(tile);
    if (sides.length === 0) return;
    if (sides.length === 1) onPlayTile(tile, sides[0]);
    else setPendingTile(tile);
  };

  // ROBAR del maso (o pasar si el motor no soporta robar)
  const handleDraw = () => {
    if (onDrawTile) onDrawTile();
    else onPassTurn();
  };

  const handleTimeout = () => {
    if (isMyTurn && sessionId) GameRepository.expireTurn(sessionId);
  };

  const cw = 100 / COLS;
  const ch = 100 / ROWS;

  return (
    <div id="domino-board-container" className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-3xl mx-auto w-full game-immersive-container select-none">

      {/* Aviso de rotación */}
      <div className="hidden portrait:flex w-full mb-2 items-center justify-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider"
        style={{ background: T.panel, borderColor: T.border, color: T.sub }}
      >
        <RotateCw className="w-3 h-3" style={{ color: T.accent }} />
        Optimizado para horizontal: gira el dispositivo
      </div>

      {/* ===== BARRA SUPERIOR: TEMA + MASO ===== */}
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
        {boneyardCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase" style={{ color: T.sub }}>
            <Layers className="w-3.5 h-3.5" />
            Maso: <strong style={{ color: T.text }}>{boneyardCount}</strong>
          </span>
        )}
      </motion.div>

      {/* ===== OPONENTES ===== */}
      <div className="grid grid-cols-3 gap-2 w-full mb-2.5">
        {opponents.slice(0, 3).map((p: any, i: number) => {
          const isActive = turnUserId === p.userId && status === 'playing';
          return (
            <motion.div
              key={p.userId}
              initial={{ y: -15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.08 }}
              className="relative p-2 rounded-xl border-2 overflow-hidden"
              style={{
                background: T.panel,
                borderColor: isActive ? T.accent : T.border,
                boxShadow: isActive ? `0 6px 18px ${T.accent}44` : '0 4px 10px rgba(0,0,0,0.4)',
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
              <div className="flex items-center justify-between gap-1">
                <div className="truncate min-w-0">
                  <div className="text-[10px] sm:text-xs font-bold truncate" style={{ color: T.text }}>
                    {(p.name || 'RIVAL').toUpperCase()}
                  </div>
                  {p.team !== undefined && (
                    <span className="text-[9px] font-mono uppercase" style={{ color: T.sub }}>EQ {String(p.team)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Hand className="w-3 h-3" style={{ color: T.sub }} />
                  <span className="text-sm font-black font-mono" style={{ color: T.text }}>
                    {getHand(p.userId).length}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ===== TIMER ===== */}
      <div className="w-full mb-2.5">
        <TurnTimer
          turnExpiresAt={turnExpiresAt}
          durationSeconds={30}
          isMyTurn={isMyTurn}
          activePlayerName={(players.find((p: any) => p.userId === turnUserId)?.name || 'OPONENTE')}
          status={status}
          onTimeout={handleTimeout}
        />
      </div>

      {/* ===== MESA CENTRAL (SERPIENTE) ===== */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full rounded-2xl p-2 sm:p-3"
        style={{
          background: T.frame,
          boxShadow: '0 20px 50px rgba(0,0,0,0.7), inset 0 2px 3px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="relative w-full rounded-xl overflow-hidden"
          style={{
            background: T.felt,
            aspectRatio: '13 / 7',
            boxShadow: 'inset 0 4px 24px rgba(0,0,0,0.75)',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.015) 0px, transparent 2px, transparent 4px)',
            }}
          />

          {placed.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.span
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-xs sm:text-sm font-bold uppercase tracking-widest"
                style={{ color: T.text }}
              >
                {isMyTurn ? 'Coloca la ficha del centro' : 'Esperando la primera ficha...'}
              </motion.span>
            </div>
          ) : (
            placed.map((tile, t) => {
              const horizontal = tile.a.r === tile.b.r;
              const leftCell = horizontal ? (tile.a.c < tile.b.c ? tile.a : tile.b) : null;
              const topCell = !horizontal ? (tile.a.r < tile.b.r ? tile.a : tile.b) : null;
              const minC = Math.min(tile.a.c, tile.b.c);
              const minR = Math.min(tile.a.r, tile.b.r);
              const isLast = t === placed.length - 1;

              const vLeft = horizontal ? (leftCell === tile.a ? tile.va : tile.vb) : 0;
              const vRight = horizontal ? (leftCell === tile.a ? tile.vb : tile.va) : 0;
              const vTop = !horizontal ? (topCell === tile.a ? tile.va : tile.vb) : 0;
              const vBottom = !horizontal ? (topCell === tile.a ? tile.vb : tile.va) : 0;

              return (
                <motion.div
                  key={tile.key}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 22 }}
                  className="absolute"
                  style={{
                    left: `${minC * cw}%`,
                    top: `${minR * ch}%`,
                    width: `${horizontal ? cw * 2 : cw}%`,
                    height: `${horizontal ? ch : ch * 2}%`,
                    padding: '0.6%',
                    zIndex: isLast ? 10 : 1,
                  }}
                >
                  <div
                    className={`w-full h-full flex ${horizontal ? 'flex-row' : 'flex-col'} rounded-[4px] overflow-hidden`}
                    style={{
                      background: T.tileFace,
                      border: `1px solid ${T.tileEdge}`,
                      boxShadow: `0 3px 6px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -2px 3px rgba(0,0,0,0.25)${
                        isLast ? `, 0 0 14px ${T.accent}BB` : ''
                      }`,
                    }}
                  >
                    {horizontal ? (
                      <>
                        <div className="w-1/2 h-full"><HalfPips value={vLeft} theme={T} /></div>
                        <div className="w-[2px] h-[68%] self-center" style={{ background: T.divider }} />
                        <div className="w-1/2 h-full"><HalfPips value={vRight} theme={T} /></div>
                      </>
                    ) : (
                      <>
                        <div className="w-full h-1/2"><HalfPips value={vTop} theme={T} /></div>
                        <div className="h-[2px] w-[68%] self-center" style={{ background: T.divider }} />
                        <div className="w-full h-1/2"><HalfPips value={vBottom} theme={T} /></div>
                      </>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>

      {/* ================================================================== */}
      {/* BARRA DE ACCIONES: PASAR TURNO + ROBAR DEL MASO (SIEMPRE VISIBLE)  */}
      {/* ================================================================== */}
      <AnimatePresence>
        {isMyTurn && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="w-full mt-2.5 grid grid-cols-2 gap-2"
          >
            {/* BOTÓN ROBAR DEL MASO */}
            <button
              id="domino-draw-btn"
              onClick={handleDraw}
              disabled={!canDraw}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase tracking-wider text-xs sm:text-sm border-2 transition-all ${
                canDraw ? 'animate-pulse' : 'opacity-40 cursor-not-allowed'
              }`}
              style={{
                background: canDraw ? `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)` : 'transparent',
                color: canDraw ? '#1A120C' : T.sub,
                borderColor: canDraw ? T.accent : T.border,
                boxShadow: canDraw ? `0 6px 18px ${T.accent}55` : 'none',
              }}
            >
              <Download className="w-4 h-4" />
              Robar del Maso
            </button>

            {/* BOTÓN PASAR TURNO */}
            <button
              id="domino-pass-btn"
              onClick={onPassTurn}
              disabled={!hasNoMove}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase tracking-wider text-xs sm:text-sm border-2 transition-all ${
                mustPass ? 'animate-pulse' : 'opacity-40 cursor-not-allowed'
              }`}
              style={{
                background: mustPass ? `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)` : 'transparent',
                color: mustPass ? '#1A120C' : T.sub,
                borderColor: mustPass ? T.accent : T.border,
                boxShadow: mustPass ? `0 6px 18px ${T.accent}55` : 'none',
              }}
            >
              <SkipForward className="w-4 h-4" />
              Pasar Turno
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mensaje de estado de la barra */}
      {isMyTurn && !hasNoMove && (
        <div className="w-full mt-1.5 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: T.sub }}>
          Tienes {playableCount} jugada{playableCount !== 1 ? 's' : ''} disponible{playableCount !== 1 ? 's' : ''} — toca una ficha brillante
        </div>
      )}
      {isMyTurn && hasNoMove && (
        <div className="w-full mt-1.5 text-center text-[10px] font-bold uppercase tracking-wider animate-pulse" style={{ color: T.accent }}>
          {canDraw ? 'Sin jugada: roba del maso' : 'Sin jugada: pasa el turno'}
        </div>
      )}

      {/* ===== MI PANEL + MANO ===== */}
      <div className="w-full mt-2.5">
        <div
          className="flex items-center justify-between px-3 py-1.5 rounded-t-xl border border-b-0"
          style={{ background: T.panel, borderColor: T.border }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] sm:text-xs font-black truncate" style={{ color: T.text }}>
              {(me?.name || 'TÚ').toUpperCase()}
            </span>
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border" style={{ color: T.accent, borderColor: T.accent }}>
              TÚ
            </span>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: T.sub }}>
            <Hand className="w-3 h-3" /> {myHand.length} fichas
          </span>
        </div>

        <div
          className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar p-2.5 rounded-b-xl border"
          style={{ background: T.panel, borderColor: T.border }}
        >
          {myHand.map((tile, i) => {
            const v = getTileValues(tile);
            const playable = isMyTurn && validSidesFor(tile).length > 0;
            return (
              <motion.button
                key={i}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                whileTap={playable ? { scale: 0.92 } : {}}
                onClick={() => handleHandClick(tile)}
                disabled={!playable}
                className="relative shrink-0 w-10 sm:w-12 aspect-[1/2] rounded-md overflow-hidden"
                style={{
                  background: T.tileFace,
                  border: `1.5px solid ${playable ? T.accent : T.tileEdge}`,
                  boxShadow: playable ? `0 4px 10px rgba(0,0,0,0.5), 0 0 12px ${T.accent}66` : '0 3px 6px rgba(0,0,0,0.45)',
                  opacity: isMyTurn && !playable ? 0.45 : 1,
                  cursor: playable ? 'pointer' : 'not-allowed',
                }}
              >
                <div className="w-full h-1/2"><HalfPips value={v?.[0] ?? 0} theme={T} /></div>
                <div className="w-[70%] h-[2px] mx-auto" style={{ background: T.divider }} />
                <div className="w-full h-1/2"><HalfPips value={v?.[1] ?? 0} theme={T} /></div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ===== MODAL ELEGIR LADO ===== */}
      <AnimatePresence>
        {pendingTile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setPendingTile(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="p-5 rounded-2xl border-2 w-full max-w-xs space-y-4"
              style={{ background: T.panel, borderColor: T.accent }}
            >
              <div className="text-center">
                <ArrowLeftRight className="w-5 h-5 mx-auto mb-1" style={{ color: T.accent }} />
                <div className="text-sm font-black uppercase tracking-wider" style={{ color: T.text }}>
                  ¿En cuál extremo?
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { onPlayTile(pendingTile, 'left'); setPendingTile(null); }}
                  className="py-3 rounded-xl font-black text-sm uppercase"
                  style={{ background: T.accent, color: '#1A120C' }}
                >
                  ◀ Izq
                </button>
                <button
                  onClick={() => { onPlayTile(pendingTile, 'right'); setPendingTile(null); }}
                  className="py-3 rounded-xl font-black text-sm uppercase"
                  style={{ background: T.accent, color: '#1A120C' }}
                >
                  Der ▶
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== BANNER VICTORIA ===== */}
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
            ¡PARTIDA CONCLUIDA! GANADOR: {(players.find((p: any) => p.userId === s.winnerUserId)?.name || (s.winnerTeam !== undefined ? `EQUIPO ${s.winnerTeam}` : '—'))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== PIE ===== */}
      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: T.sub }}>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.accent})` }} />
        <span>🇻🇪 Dominó Venezolano 🇻🇪</span>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.accent})` }} />
      </div>
    </div>
  );
};
