// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: DOMINÓ VENEZOLANO
// ==============================================================================
// • Colocación de fichas en SERPIENTE (estilo mesa real venezolana)
// • 3 TEMAS seleccionables en partida: Caoba Clásica / Tricolor Criollo / Ébano Real
// • Diseño 3D inmersivo, optimizado para móviles
// • Compatible 100% con Supabase y GameContainer
// ==============================================================================

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Trophy, Hand, ArrowLeftRight, Zap } from 'lucide-react';
import { TurnTimer } from './TurnTimer';
import { GameRepository } from '../../../services/repositories/GameRepository';

interface DominoBoardProps {
  state: any;
  currentUserId: string;
  turnExpiresAt?: string;
  sessionId?: string;
  onPlayTile: (tile: any, side: any) => void;
  onPassTurn: () => void;
}

// ==============================================================================
// SISTEMA DE TEMAS (3 DISEÑOS SELECCIONABLES)
// ==============================================================================
type ThemeKey = 'caoba' | 'tricolor' | 'ebano';

const THEMES: Record<ThemeKey, any> = {
  caoba: {
    label: 'Caoba Clásica',
    swatch: ['#8B5A2B', '#E8D5B7', '#5C2626'],
    felt: 'radial-gradient(ellipse at 50% 40%, #3E2B1F 0%, #2B1D14 55%, #1C120C 100%)',
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
    label: 'Tricolor Criollo',
    swatch: ['#FFD100', '#003DA5', '#EF3340'],
    felt: 'radial-gradient(ellipse at 50% 40%, #123B7A 0%, #0A2A5C 55%, #061A3A 100%)',
    frame: 'linear-gradient(145deg, #0A2A5C 0%, #061A3A 100%)',
    tileFace: 'linear-gradient(145deg, #FFFFFF 0%, #F0F4FA 55%, #DCE4F0 100%)',
    tileEdge: '#8FA8CC',
    pip: '#003DA5',
    divider: 'rgba(0,61,165,0.4)',
    accent: '#FFD100',
    text: '#EAF2FF',
    sub: '#8FA8CC',
    panel: 'linear-gradient(145deg, #0A2A5C 0%, #061A3A 100%)',
    border: '#123B7A',
  },
  ebano: {
    label: 'Ébano Real',
    swatch: ['#111111', '#FFD700', '#3A3A3A'],
    felt: 'radial-gradient(ellipse at 50% 40%, #1E1E1E 0%, #111111 55%, #000000 100%)',
    frame: 'linear-gradient(145deg, #3A3A3A 0%, #1A1A1A 100%)',
    tileFace: 'linear-gradient(145deg, #2E2E2E 0%, #1C1C1C 55%, #101010 100%)',
    tileEdge: '#555555',
    pip: '#FFD700',
    divider: 'rgba(255,215,0,0.35)',
    accent: '#FFD700',
    text: '#F5F5F5',
    sub: '#9A9A9A',
    panel: 'linear-gradient(145deg, #1A1A1A 0%, #0A0A0A 100%)',
    border: '#333333',
  },
};

// ==============================================================================
// UTILIDADES DE FICHAS
// ==============================================================================
const getTileValues = (t: any): [number, number] | null => {
  if (!t) return null;
  if (Array.isArray(t) && t.length >= 2) return [Number(t[0]), Number(t[1])];
  if (Array.isArray(t?.values)) return [Number(t.values[0]), Number(t.values[1])];
  if (typeof t?.a === 'number' && typeof t?.b === 'number') return [t.a, t.b];
  if (typeof t?.left === 'number' && typeof t?.right === 'number') return [t.left, t.right];
  return null;
};

const PIP_MAP: Record<number, number[]> = {
  0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

// Media ficha con pips (punticos) estilo real
const HalfPips: React.FC<{ value: number; theme: any; vertical?: boolean }> = ({ value, theme, vertical }) => (
  <div
    className={`relative grid grid-cols-3 ${vertical ? 'grid-rows-3' : 'grid-rows-3'} w-full h-full p-[12%]`}
  >
    {Array.from({ length: 9 }).map((_, i) => (
      <div key={i} className="flex items-center justify-center">
        {PIP_MAP[value]?.includes(i) && (
          <div
            className="w-[68%] h-[68%] rounded-full"
            style={{
              background: `radial-gradient(circle at 32% 28%, ${theme.pip} 0%, ${theme.pip} 60%, rgba(0,0,0,0.6) 100%)`,
              boxShadow: `inset 0 -1px 2px rgba(0,0,0,0.5), 0 1px 1px rgba(255,255,255,0.25)`,
            }}
          />
        )}
      </div>
    ))}
  </div>
);

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
}) => {
  const s: any = state || {};

  // ----- Tema seleccionado (persistente) -----
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_domino_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'caoba';
  });
  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => {
    setThemeKey(k);
    try { localStorage.setItem('rlo_domino_theme', k); } catch {}
  };

  // ----- Lectura defensiva del estado -----
  const players: any[] = Array.isArray(s.players) ? s.players : [];
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

  const rawChain: any[] = Array.isArray(s.board) ? s.board
    : Array.isArray(s.chain) ? s.chain
    : Array.isArray(s.placedTiles) ? s.placedTiles
    : [];

  // ----- Cadena normalizada (extremos conectados) -----
  const chain = useMemo(() => {
    const out: { values: [number, number]; raw: any }[] = [];
    let open: number | null = null;
    for (const raw of rawChain) {
      // raw puede venir como {tile, side} o directamente la ficha
      const vals = getTileValues(raw?.tile) || getTileValues(raw);
      if (!vals) continue;
      if (out.length === 0) {
        out.push({ values: vals, raw });
        open = vals[1];
      } else {
        if (vals[0] === open) { out.push({ values: vals, raw }); open = vals[1]; }
        else { out.push({ values: [vals[1], vals[0]], raw }); open = vals[0]; }
      }
    }
    return out;
  }, [rawChain]);

  const leftEnd = chain.length ? chain[0].values[0] : null;
  const rightEnd = chain.length ? chain[chain.length - 1].values[1] : null;

  // ----- Lados válidos para una ficha de la mano -----
  const validSidesFor = (tile: any): ('left' | 'right')[] => {
    const v = getTileValues(tile);
    if (!v) return [];
    const sides: ('left' | 'right')[] = [];
    if (chain.length === 0) return ['right'];
    if (v[0] === rightEnd || v[1] === rightEnd) sides.push('right');
    if (v[0] === leftEnd || v[1] === leftEnd) sides.push('left');
    return sides;
  };

  const playableTiles = isMyTurn ? myHand.filter((t) => validSidesFor(t).length > 0) : [];
  const mustPass = isMyTurn && myHand.length > 0 && playableTiles.length === 0;

  // ----- Selector de lado (cuando aplica a ambos extremos) -----
  const [pendingTile, setPendingTile] = useState<any>(null);
  const handleHandClick = (tile: any) => {
    if (!isMyTurn) return;
    const sides = validSidesFor(tile);
    if (sides.length === 0) return;
    if (sides.length === 1) onPlayTile(tile, sides[0]);
    else setPendingTile(tile);
  };

  const handleTimeout = () => {
    if (isMyTurn && sessionId) GameRepository.expireTurn(sessionId);
  };

  // ============================================================================
  // DISPOSICIÓN SERPIENTE (SNAKE) — 12 medias fichas por fila
  // ============================================================================
  const COLS = 12;
  const halves = chain.length * 2;
  const rows = Math.max(3, Math.ceil(halves / COLS));

  const cellPos = (i: number) => {
    const row = Math.floor(i / COLS);
    const pos = i % COLS;
    const col = row % 2 === 0 ? pos : COLS - 1 - pos;
    return { row, col };
  };

  const cellW = 100 / COLS;
  const cellH = 100 / rows;

  return (
    <div id="domino-board-container" className="flex flex-col items-center justify-center p-2 sm:p-4 max-w-2xl mx-auto w-full">

      {/* ===== BARRA SUPERIOR: TEMA + TURNO ===== */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full mb-3 flex items-center justify-between px-3 py-2 rounded-xl border"
        style={{ background: T.panel, borderColor: T.border }}
      >
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4" style={{ color: T.accent }} />
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.sub }}>
            Mesa:
          </span>
          {/* SELECTOR DE 3 TEMAS */}
          <div className="flex items-center gap-1.5">
            {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => changeTheme(k)}
                title={THEMES[k].label}
                className="relative flex items-center gap-0.5 px-1.5 py-1 rounded-lg border transition-all"
                style={{
                  borderColor: themeKey === k ? THEMES[k].accent : T.border,
                  background: themeKey === k ? 'rgba(255,255,255,0.08)' : 'transparent',
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

      {/* ===== MARCADOR DE JUGADORES (EQUIPOS) ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full mb-3">
        {players.map((p: any, i: number) => {
          const isActive = turnUserId === p.userId && status === 'playing';
          const handCount = getHand(p.userId).length;
          return (
            <motion.div
              key={p.userId}
              initial={{ y: -15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.08 }}
              className="relative p-2.5 rounded-xl border-2 overflow-hidden"
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
              <div className="flex items-center justify-between">
                <div className="truncate">
                  <div className="text-[11px] sm:text-xs font-bold truncate max-w-[90px]" style={{ color: T.text }}>
                    {(p.name || 'JUGADOR').toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {p.userId === currentUserId && (
                      <span className="text-[9px] font-mono font-bold uppercase" style={{ color: T.accent }}>(TÚ)</span>
                    )}
                    {p.team !== undefined && (
                      <span className="text-[9px] font-mono uppercase" style={{ color: T.sub }}>
                        EQ {String(p.team)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <Hand className="w-3.5 h-3.5" style={{ color: T.sub }} />
                  <span className="text-lg font-black font-mono leading-none" style={{ color: T.text }}>
                    {p.userId === currentUserId ? myHand.length : handCount}
                  </span>
                </div>
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
          activePlayerName={(players.find((p: any) => p.userId === turnUserId)?.name || 'OPONENTE')}
          status={status}
          onTimeout={handleTimeout}
        />
      </div>

      {/* ===== MESA DE JUEGO (SERPIENTE) ===== */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full rounded-2xl p-2.5 sm:p-3.5"
        style={{
          background: T.frame,
          boxShadow: '0 20px 50px rgba(0,0,0,0.7), inset 0 2px 3px rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="relative w-full rounded-xl overflow-hidden"
          style={{
            background: T.felt,
            aspectRatio: `2.4 / 1`,
            boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.7)',
          }}
        >
          {/* Marca central de la mesa */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <span className="text-3xl sm:text-4xl font-black tracking-widest" style={{ color: T.accent }}>
              🇻🇪
            </span>
          </div>

          {chain.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.span
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-xs sm:text-sm font-bold uppercase tracking-widest"
                style={{ color: T.text }}
              >
                {isMyTurn ? 'Coloca la primera ficha' : 'Esperando primera ficha...'}
              </motion.span>
            </div>
          ) : (
            /* ----- FICHAS COLOCADAS EN SERPIENTE ----- */
            chain.map((tile, t) => {
              const iA = t * 2;
              const iB = t * 2 + 1;
              const a = cellPos(iA);
              const b = cellPos(iB);
              const row = a.row;
              const leftToRight = row % 2 === 0;
              const minCol = Math.min(a.col, b.col);
              const [leftVal, rightVal] = leftToRight ? tile.values : [tile.values[1], tile.values[0]];
              const isLast = t === chain.length - 1;

              return (
                <motion.div
                  key={t}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 22 }}
                  className="absolute"
                  style={{
                    left: `${minCol * cellW}%`,
                    top: `${row * cellH}%`,
                    width: `${cellW * 2}%`,
                    height: `${cellH}%`,
                    padding: '1.5%',
                  }}
                >
                  <div
                    className="w-full h-full flex rounded-[4px] overflow-hidden"
                    style={{
                      background: T.tileFace,
                      boxShadow: `0 3px 6px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.5), inset 0 -2px 3px rgba(0,0,0,0.25)${
                        isLast ? `, 0 0 12px ${T.accent}AA` : ''
                      }`,
                      border: `1px solid ${T.tileEdge}`,
                    }}
                  >
                    <div className="w-1/2 h-full">
                      <HalfPips value={leftVal} theme={T} />
                    </div>
                    <div className="w-[2px] h-[70%] self-center" style={{ background: T.divider }} />
                    <div className="w-1/2 h-full">
                      <HalfPips value={rightVal} theme={T} />
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>

      {/* ===== MI MANO ===== */}
      <div className="w-full mt-3">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: T.sub }}>
            Mis fichas ({myHand.length})
          </span>
          {isMyTurn && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase animate-pulse" style={{ color: T.accent }}>
              <Zap className="w-3 h-3" /> Tu turno
            </span>
          )}
        </div>

        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 px-1">
          {myHand.map((tile, i) => {
            const v = getTileValues(tile);
            const sides = validSidesFor(tile);
            const playable = isMyTurn && sides.length > 0;
            return (
              <motion.button
                key={i}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.04 }}
                whileTap={playable ? { scale: 0.92 } : {}}
                onClick={() => handleHandClick(tile)}
                disabled={!playable}
                className="relative shrink-0 w-10 sm:w-12 aspect-[1/2] rounded-md overflow-hidden transition-all"
                style={{
                  background: T.tileFace,
                  border: `1.5px solid ${playable ? T.accent : T.tileEdge}`,
                  boxShadow: playable
                    ? `0 4px 10px rgba(0,0,0,0.5), 0 0 12px ${T.accent}66`
                    : '0 3px 6px rgba(0,0,0,0.45)',
                  opacity: isMyTurn && !playable ? 0.45 : 1,
                  cursor: playable ? 'pointer' : 'not-allowed',
                }}
              >
                <div className="w-full h-1/2">
                  <HalfPips value={v?.[0] ?? 0} theme={T} vertical />
                </div>
                <div className="w-[70%] h-[2px] mx-auto" style={{ background: T.divider }} />
                <div className="w-full h-1/2">
                  <HalfPips value={v?.[1] ?? 0} theme={T} vertical />
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Botón PASAR */}
        <AnimatePresence>
          {mustPass && (
            <motion.button
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={onPassTurn}
              className="mt-2 w-full py-3 rounded-xl font-black uppercase tracking-wider text-sm"
              style={{
                background: `linear-gradient(145deg, ${T.accent}, ${T.accent}CC)`,
                color: '#1A120C',
                boxShadow: `0 6px 18px ${T.accent}55`,
              }}
            >
              Sin jugada — PASAR TURNO
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ===== MODAL: ELEGIR LADO ===== */}
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

      {/* ===== BANNER DE VICTORIA ===== */}
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
            ¡PARTIDA CONCLUIDA! GANADOR: {(players.find((p: any) => p.userId === s.winnerUserId)?.name || s.winnerTeam !== undefined ? `EQUIPO ${s.winnerTeam}` : '—')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== PIE ===== */}
      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: T.sub }}>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.accent})` }} />
        <span>🇻🇪 Dominó Venezolano 🇻</span>
        <div className="w-10 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.accent})` }} />
      </div>
    </div>
  );
};
