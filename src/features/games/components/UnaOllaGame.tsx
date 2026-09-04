// ==============================================================================
// RASPANDO LA OLLA — MESA MULTIJUGADOR UNA-OLLA (HORIZONTAL + 3 TEMAS)
// ==============================================================================
// • Cartas UNO realistas agrandadas en el centro (mazo + descarte)
// • Perfiles REALES del usuario (avatar/nombre de Supabase, sin perfiles falsos)
// • Cartas de rivales agrupadas en abanico junto a su perfil
// • Animación de carta VOLANDO desde el jugador que lanza
// • Mesa horizontal 16:9 con jugadores organizados (abajo/izq/arriba/der)
// • 3 temas con fondos muy atractivos
// • Compatible 100% con Supabase, useGameEngine y UnaOllaEngine
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import type { UnaOllaState, UnaOllaCard, UnaOllaColor, UnaOllaPlayerState } from '../../../types/games';
import { useGameEngine } from '../useGameEngine';
import { UnaOllaEngine } from '../engines/UnaOllaEngine';
import { UnaOllaCardComponent } from './UnaOllaCardComponent';
import { Button } from '../../../components/common/Button';
import { Play, AlertTriangle, Flame, Palette, RotateCw, Info } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FinancialRepository } from '../../../services/repositories/FinancialRepository';

interface UnaOllaGameProps {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  onLeave: () => void;
}

// ==============================================================================
// 3 TEMAS CON FONDOS MUY ATRACTIVOS
// ==============================================================================
type ThemeKey = 'casino' | 'neon' | 'caoba';

const THEMES: Record<ThemeKey, any> = {
  casino: {
    label: 'Casino Caracas',
    swatch: ['#0E5A34', '#FFC94B', '#FAF0E1'],
    felt: 'radial-gradient(ellipse at 50% 45%, #147A46 0%, #0E5A34 50%, #073B22 82%, #052A18 100%)',
    frame: 'linear-gradient(145deg, #8B5A2B 0%, #6B4423 45%, #4E2E17 100%)',
    accent: '#FFC94B',
    text: '#F5EFDD',
    sub: '#9CC4A8',
    panel: 'linear-gradient(145deg, rgba(5,25,15,0.92) 0%, rgba(3,18,10,0.92) 100%)',
    border: '#147A46',
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
  caoba: {
    label: 'Caoba Criolla',
    swatch: ['#8B5A2B', '#E8D5B7', '#EF3340'],
    felt: 'radial-gradient(ellipse at 50% 45%, #4E342E 0%, #3E2B1F 50%, #241811 82%, #1C120C 100%)',
    frame: 'linear-gradient(145deg, #8B5A2B 0%, #6B4423 45%, #4E2E17 100%)',
    accent: '#FFC94B',
    text: '#F0E2C8',
    sub: '#A8865A',
    panel: 'linear-gradient(145deg, #2B1D14 0%, #1C120C 100%)',
    border: '#3E2B1F',
  },
};

// ==============================================================================
// FONDOS ANIMADOS DEL FIELTRO (CORREGIDO)
// ==============================================================================
const FeltBackdrop: React.FC<{ themeKey: ThemeKey }> = ({ themeKey }) => {
  if (themeKey === 'neon') {
    const orbs = [
      { color: 'rgba(255,209,0,0.28)', top: '8%', left: '10%', dur: 4 },
      { color: 'rgba(255,45,85,0.28)', top: '60%', left: '75%', dur: 5 },
      { color: 'rgba(0,224,255,0.28)', top: '35%', left: '45%', dur: 6 },
    ];
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background:
              'linear-gradient(rgba(0,224,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(0,224,255,0.14) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
            maskImage: 'radial-gradient(ellipse at 50% 50%, black 25%, transparent 80%)',
          }}
        />
        {orbs.map((o, i) => (
          <motion.div
            key={i}
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.85, 0.4] }}
            transition={{ duration: o.dur, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute w-28 h-28 rounded-full blur-3xl"
            style={{ background: o.color, top: o.top, left: o.left }}
          />
        ))}
      </div>
    );
  }

  if (themeKey === 'caoba') {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -inset-[60%]"
          style={{ background: 'repeating-conic-gradient(rgba(255,201,75,0.07) 0deg 9deg, transparent 9deg 18deg)' }}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0 opacity-30"
        style={{ background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, transparent 2px, transparent 6px)' }}
      />
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{ background: '#FFC94B', boxShadow: '0 0 8px rgba(255,201,75,0.9)', left: `${12 + i * 15}%`, bottom: '12%', opacity: 0.5 }}
        />
      ))}
    </div>
  );
};

// ==============================================================================
// UTILIDADES DE PERFIL REAL (sin perfiles falsos)
// ==============================================================================
const getDisplayName = (p: any): string =>
  p?.displayName || p?.name || p?.username || p?.email?.split('@')[0] || 'JUGADOR';

const getAvatarUrl = (p: any): string | null =>
  p?.avatarUrl || p?.avatar || p?.photoURL || p?.profileImage || p?.imageUrl || null;

const Avatar: React.FC<{ player: any; active: boolean; accent: string; size?: number }> = ({ player, active, accent, size = 44 }) => {
  const url = getAvatarUrl(player);
  const name = getDisplayName(player);
  const initials = name.trim().slice(0, 2).toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img
          src={url}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full rounded-full object-cover"
          style={{ border: `2.5px solid ${active ? accent : 'rgba(255,255,255,0.25)'}`, boxShadow: '0 3px 8px rgba(0,0,0,0.5)' }}
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center font-black"
          style={{
            background: 'linear-gradient(145deg, #4A5568, #2D3748)',
            border: `2.5px solid ${active ? accent : 'rgba(255,255,255,0.25)'}`,
            color: '#F7FAFC',
            fontSize: size * 0.36,
            boxShadow: '0 3px 8px rgba(0,0,0,0.5)',
          }}
        >
          {initials}
        </div>
      )}
      {active && (
        <div
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
          style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
        />
      )}
    </div>
  );
};

// Abanico de reversos junto al perfil del rival
const MiniBacks: React.FC<{ count: number }> = ({ count }) => {
  const shown = Math.min(count, 6);
  return (
    <div className="flex items-center justify-center">
      {Array.from({ length: shown }).map((_, i) => (
        <div
          key={i}
          className={i > 0 ? '-ml-2' : ''}
          style={{ transform: `rotate(${(i - (shown - 1) / 2) * 5}deg)` }}
        >
          <div
            className="w-6 h-9 rounded-md border border-white/80 flex items-center justify-center"
            style={{ background: 'linear-gradient(160deg, #262626, #000)', boxShadow: '0 2px 5px rgba(0,0,0,0.55)' }}
          >
            <div
              className="w-4 h-2.5 rounded-[50%] border border-amber-300/70"
              style={{ background: 'linear-gradient(160deg, #FF7043, #B71C1C)' }}
            />
          </div>
        </div>
      ))}
      <span className="ml-1.5 text-[10px] font-black font-mono">{count}</span>
    </div>
  );
};

// ==============================================================================
// COMPONENTE PRINCIPAL
// ==============================================================================
export function UnaOllaGame({ table, players, currentUserId, onLeave }: UnaOllaGameProps) {
  const isHost = currentUserId === table.hostUserId;

  const initialState = UnaOllaEngine.initGameState(players, table.hostUserId);
  const { gameState, currentTurnUserId, isMyTurn, dispatchAction } = useGameEngine({
    table,
    players,
    currentUserId,
    initialState,
  });

  const state = (gameState as unknown as UnaOllaState) || initialState;
  const isPlaying = state.status === 'PLAYING';
  const isFinished = state.status === 'GAME_FINISHED' || Boolean(state.winnerUserId);

  // ----- Tema (persistente) -----
  const [themeKey, setThemeKey] = useState<ThemeKey>(() => {
    try {
      const saved = localStorage.getItem('rlo_unaolla_theme');
      if (saved && THEMES[saved as ThemeKey]) return saved as ThemeKey;
    } catch {}
    return 'casino';
  });
  const T = THEMES[themeKey];
  const changeTheme = (k: ThemeKey) => {
    setThemeKey(k);
    try { localStorage.setItem('rlo_unaolla_theme', k); } catch {}
  };

  // ----- UI local -----
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  const activeTurnUser = state.currentTurnUserId || currentTurnUserId || '';
  const myPlayerState: UnaOllaPlayerState | undefined = currentUserId ? state.players?.[currentUserId] : undefined;

  // ----- Asientos (organizados en mesa horizontal) -----
  const uniquePlayers = Array.from(new Map(players.map((p) => [p.userId, p])).values()).sort(
    (a, b) => a.seatNumber - b.seatNumber
  );
  const total = uniquePlayers.length;
  const myIndex = Math.max(0, uniquePlayers.findIndex((p) => p.userId === currentUserId));
  const seatAt = (offset: number): TablePlayer | null => (total === 0 ? null : uniquePlayers[(myIndex + offset) % total] || null);

  const bottomPlayer = uniquePlayers[myIndex] || uniquePlayers[0];
  const topPlayer = total === 2 ? seatAt(1) : seatAt(2);
  const leftPlayer = total >= 3 ? seatAt(1) : null;
  const rightPlayer = total === 4 ? seatAt(3) : null;

  // ----- Temporizador -----
  useEffect(() => {
    if (!isPlaying || !state.turnDeadlineAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((state.turnDeadlineAt as unknown as number) - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && (isHost || activeTurnUser === currentUserId)) {
        clearInterval(interval);
        handleTurnTimeout();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying, state.turnDeadlineAt, activeTurnUser, currentUserId, isHost]);

  // ----- Animación de carta volando (detecta quién lanzó) -----
  const [fly, setFly] = useState<{ seat: string; id: number } | null>(null);
  const prevCountsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const seatOf: Record<string, string> = {};
    if (bottomPlayer) seatOf[bottomPlayer.userId] = 'bottom';
    if (topPlayer) seatOf[topPlayer.userId] = 'top';
    if (leftPlayer) seatOf[leftPlayer.userId] = 'left';
    if (rightPlayer) seatOf[rightPlayer.userId] = 'right';
    Object.entries(seatOf).forEach(([uid, seat]) => {
      const count = state.players?.[uid]?.cardCount ?? 0;
      const prev = prevCountsRef.current[uid];
      if (prev !== undefined && count < prev && isPlaying) {
        setFly({ seat, id: Date.now() });
      }
      prevCountsRef.current[uid] = count;
    });
  }, [state]);

  const FLY_FROM: Record<string, { x: number; y: number }> = {
    top: { x: 50, y: 16 },
    left: { x: 16, y: 50 },
    right: { x: 84, y: 50 },
    bottom: { x: 50, y: 84 },
  };

  // ----- Manejadores (lógica intacta) -----
  const handleTurnTimeout = async () => {
    const nextState = UnaOllaEngine.handleTurnTimeout(state);
    await dispatchAction(
      'TURN_TIMEOUT',
      { turnUser: activeTurnUser },
      nextState as any,
      nextState.currentTurnUserId,
      nextState.winnerUserId,
      false
    );
  };

  const handleStartGame = async () => {
    if (!isHost || isPlaying || isFinished || players.length < 2) return;
    const freshState = UnaOllaEngine.initGameState(players, table.hostUserId);
    await dispatchAction('START_GAME', { startedBy: currentUserId }, freshState as any, freshState.currentTurnUserId, null, false);
  };

  const handleSelectCard = (card: UnaOllaCard) => {
    if (!isMyTurn || !isPlaying) return;
    if (!UnaOllaEngine.canPlayCard(card, state.topCard, state.currentColor)) {
      setActionNotice('⚠️ Esa carta no coincide con el color o número activo.');
      setTimeout(() => setActionNotice(null), 3000);
      return;
    }
    if (card.color === 'wild' || card.type === 'wild' || card.type === 'wild_draw4') {
      setPendingWildCardId(card.id);
      setShowColorPicker(true);
      return;
    }
    executePlayCard(card.id);
  };

  const executePlayCard = async (cardId: string, chosenColor?: UnaOllaColor) => {
    if (!currentUserId) return;
    const result = UnaOllaEngine.playCard(state, currentUserId, cardId, chosenColor, undefined);
    if (!result.success) {
      setActionNotice(`⚠️ ${result.error || 'No fue posible jugar esa carta.'}`);
      setTimeout(() => setActionNotice(null), 3000);
      return;
    }
    setSelectedCardId(null);
    setShowColorPicker(false);
    setPendingWildCardId(null);
    await dispatchAction(
      'PLAY_CARD',
      { cardId, chosenColor },
      result.nextState as any,
      result.nextState.currentTurnUserId,
      result.nextState.winnerUserId,
      false
    );
  };

  const handleDrawCard = async () => {
    if (!isMyTurn || !isPlaying || !currentUserId) return;
    const result = UnaOllaEngine.drawCard(state, currentUserId);
    if (!result.success) return;
    await dispatchAction('DRAW_CARD', { drawnCard: result.drawnCard }, result.nextState as any, result.nextState.currentTurnUserId, null, false);
  };

  const handleCallUnaOlla = async () => {
    if (!currentUserId || !myPlayerState) return;
    const result = UnaOllaEngine.callUnaOlla(state, currentUserId);
    if (!result.success) return;
    await dispatchAction('CALL_UNA_OLLA', { userId: currentUserId }, result.nextState as any, state.currentTurnUserId, null, false);
    setActionNotice('🔥 ¡Gritaste UNA-OLLA exitosamente!');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleChallengeUnaOlla = async (targetUserId: string) => {
    if (!currentUserId) return;
    const result = UnaOllaEngine.challengeUnaOlla(state, currentUserId, targetUserId);
    if (!result.success) {
      if (result.message) {
        setActionNotice(result.message);
        setTimeout(() => setActionNotice(null), 3000);
      }
      return;
    }
    await dispatchAction(
      'CHALLENGE_UNA_OLLA',
      { challengerUserId: currentUserId, targetUserId },
      result.nextState as any,
      state.currentTurnUserId,
      null,
      false
    );
    setActionNotice(result.message || '⚠️ Penalización aplicada correctamente.');
    setTimeout(() => setActionNotice(null), 3000);
  };

  // ----- Caja de jugador REAL (avatar + nombre de Supabase) -----
  const renderPlayerSeat = (playerObj: TablePlayer | null) => {
    if (!playerObj) return null;
    const pState = state.players?.[playerObj.userId];
    const isCurrentTurn = activeTurnUser === playerObj.userId;
    const isEliminated = pState?.status === 'eliminated';
    const cardCount = pState?.cardCount ?? 0;
    const lives = pState?.lives ?? 3;
    const hasCalled = pState?.hasCalledUnaOlla;
    const canBeChallenged = cardCount === 1 && !hasCalled && isPlaying;

    return (
      <div
        className="relative flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border-2 backdrop-blur-md transition-all duration-300"
        style={{
          background: T.panel,
          borderColor: isCurrentTurn ? T.accent : T.border,
          boxShadow: isCurrentTurn ? `0 0 24px ${T.accent}66` : '0 6px 16px rgba(0,0,0,0.45)',
          opacity: isEliminated ? 0.45 : 1,
          minWidth: 108,
        }}
      >
        {isCurrentTurn && isPlaying && (
          <div
            className="absolute -top-3 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider animate-bounce"
            style={{ background: T.accent, color: '#1A120C' }}
          >
            Jugando
          </div>
        )}
        {hasCalled && (
          <div className="absolute -top-3 right-1 px-2 py-0.5 rounded-full bg-red-600 text-amber-300 text-[8px] font-black uppercase animate-pulse">
            🔥 UNA-OLLA
          </div>
        )}
        <Avatar player={playerObj} active={isCurrentTurn} accent={T.accent} />
        <div className="text-[10px] font-black uppercase truncate max-w-[90px]" style={{ color: T.text }}>
          {getDisplayName(playerObj).toUpperCase()}
        </div>
        <div className="flex items-center gap-0.5" title={`${lives} vidas`}>
          {[1, 2, 3].map((lvl) => (
            <span key={lvl} className={`text-[10px] ${lvl <= lives ? '' : 'opacity-20 scale-75'}`}>❤️</span>
          ))}
        </div>
        {/* Cartas agrupadas junto al perfil */}
        <div style={{ color: T.sub }}>
          <MiniBacks count={cardCount} />
        </div>
        {canBeChallenged && (
          <button
            type="button"
            onClick={() => handleChallengeUnaOlla(playerObj.userId)}
            className="text-[8px] font-black bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded-full border border-red-400 animate-pulse flex items-center gap-1"
          >
            <AlertTriangle className="w-2.5 h-2.5" /> DESAFIAR
          </button>
        )}
        {isEliminated && (
          <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center text-xl">💀</div>
        )}
      </div>
    );
  };

  const colorDot = (c: string) =>
    c === 'red' ? '#D32F2F' : c === 'blue' ? '#1E88E5' : c === 'green' ? '#43A047' : '#FBC02D';

  return (
    <div className="w-full max-w-6xl mx-auto space-y-3 max-w-full overflow-x-hidden">

      {/* Aviso horizontal */}
      <div
        className="hidden portrait:flex w-full items-center justify-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider"
        style={{ background: T.panel, borderColor: T.border, color: T.sub }}
      >
        <RotateCw className="w-3 h-3" style={{ color: T.accent }} />
        Optimizado para horizontal: gira el dispositivo
      </div>

      {/* Barra de temas + reglas */}
      <div
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border"
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
        <button
          onClick={() => setShowRulesModal(true)}
          className="flex items-center gap-1 text-[10px] font-bold uppercase"
          style={{ color: T.sub }}
        >
          <Info className="w-3.5 h-3.5" style={{ color: T.accent }} /> Reglas
        </button>
      </div>

      {state.lastActionLog && (
        <div
          className="w-full text-center text-xs font-medium px-3 py-1.5 rounded-lg border"
          style={{ background: T.panel, borderColor: T.border, color: T.accent }}
        >
          {state.lastActionLog}
        </div>
      )}
      {actionNotice && (
        <div className="w-full text-center text-xs font-bold px-3 py-1.5 rounded-lg bg-red-950/90 border border-red-800 text-red-200">
          {actionNotice}
        </div>
      )}

      {/* ================= MESA HORIZONTAL 16:9 ================= */}
      <div
        className="relative w-full rounded-[40px] border-[10px] sm:border-[14px] overflow-hidden"
        style={{
          aspectRatio: '16 / 9',
          borderColor: '#3a2012',
          background: T.felt,
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.9), inset 0 4px 24px rgba(0,0,0,0.6)',
        }}
      >
        <FeltBackdrop themeKey={themeKey} />

        {/* Logo central en relieve */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08]">
          <div className="px-10 py-5 rounded-full border-4 border-amber-400/60 transform -rotate-12">
            <span className="text-4xl sm:text-6xl font-black tracking-tighter uppercase" style={{ color: T.accent }}>
              UNA-OLLA
            </span>
          </div>
        </div>

        {/* ===== CENTRO: MAZO + DESCARTE GRANDE ===== */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-5 sm:gap-8 z-10">
          {/* Mazo de robo */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative cursor-pointer group" onClick={handleDrawCard}>
              <div className="group-hover:scale-105 transition-transform">
                <UnaOllaCardComponent isBack size="lg" />
              </div>
              <div
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-black font-mono"
                style={{ background: T.accent, color: '#1A120C' }}
              >
                {state.drawPileCount}
              </div>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: T.sub }}>Mazo</span>
          </div>

          {/* Pila de descarte (carta grande animada) */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative w-24 h-36 flex items-center justify-center">
              <div className="absolute transform -rotate-12 scale-95 opacity-60 pointer-events-none">
                <UnaOllaCardComponent isBack size="lg" />
              </div>
              {state.topCard && (
                <div
                  key={`${state.topCard.id}-${state.topCard.color}-${state.topCard.number}`}
                  className="absolute"
                  style={{ animation: 'topCardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: 'rotate(6deg)' }}
                >
                  <UnaOllaCardComponent card={state.topCard} size="lg" />
                </div>
              )}
              <style>{`
                @keyframes topCardIn {
                  0% { transform: scale(0.3) rotate(-180deg) translateY(-60px); opacity: 0; }
                  100% { transform: scale(1) rotate(6deg) translateY(0); opacity: 1; }
                }
              `}</style>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: T.sub }}>Descarte</span>
          </div>
        </div>

        {/* Indicadores: color activo + dirección + timer */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[30%] sm:bottom-[31%] flex items-center gap-2 z-10">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold"
            style={{ background: 'rgba(0,0,0,0.5)', borderColor: T.border, color: T.text }}
          >
            <span>Color:</span>
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/70"
              style={{ background: colorDot(state.currentColor), boxShadow: `0 0 8px ${colorDot(state.currentColor)}` }}
            />
          </div>
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-mono"
            style={{ background: 'rgba(0,0,0,0.5)', borderColor: T.border, color: T.accent }}
          >
            <span className={`transition-transform ${state.direction === 1 ? '' : 'rotate-180'}`}>🔄</span>
            {state.direction === 1 ? 'Horario' : 'Anti'}
          </div>
          {isPlaying && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold"
              style={{ background: 'rgba(0,0,0,0.5)', borderColor: T.accent, color: T.accent }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: T.accent }} />
              {timeLeft}s
            </div>
          )}
        </div>

        {/* ===== ASIENTOS ORGANIZADOS ===== */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">{renderPlayerSeat(topPlayer)}</div>
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10">{renderPlayerSeat(leftPlayer)}</div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">{renderPlayerSeat(rightPlayer)}</div>

        {/* Mi perfil (abajo centro) */}
        {bottomPlayer && (
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-2xl border-2"
            style={{
              background: T.panel,
              borderColor: activeTurnUser === bottomPlayer.userId ? T.accent : T.border,
              boxShadow: activeTurnUser === bottomPlayer.userId ? `0 0 24px ${T.accent}66` : '0 6px 16px rgba(0,0,0,0.45)',
            }}
          >
            <Avatar player={bottomPlayer} active={activeTurnUser === bottomPlayer.userId} accent={T.accent} size={34} />
            <div>
              <div className="text-[10px] font-black uppercase" style={{ color: T.text }}>
                {getDisplayName(bottomPlayer).toUpperCase()} <span style={{ color: T.accent }}>(TÚ)</span>
              </div>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3].map((lvl) => (
                  <span key={lvl} className={`text-[9px] ${lvl <= (myPlayerState?.lives ?? 3) ? '' : 'opacity-20'}`}>❤️</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== CARTA VOLANDO (animación de lanzamiento) ===== */}
        {fly && (
          <div
            key={fly.id}
            className="absolute z-30 pointer-events-none"
            style={{
              left: `${FLY_FROM[fly.seat].x}%`,
              top: `${FLY_FROM[fly.seat].y}%`,
              animation: 'flyCard 0.7s ease-in-out forwards',
            }}
          >
            <UnaOllaCardComponent isBack size="md" />
            <style>{`
              @keyframes flyCard {
                0% { transform: translate(-50%, -50%) scale(0.7) rotate(-25deg); opacity: 0; }
                25% { opacity: 1; }
                80% { opacity: 1; }
                100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 0; }
              }
            `}</style>
          </div>
        )}
      </div>

      {/* ================= MI MANO + CONTROLES ================= */}
      <div className="w-full p-3 rounded-2xl border" style={{ background: T.panel, borderColor: T.border }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: T.text }}>
            🎴 Tu mano ({myPlayerState?.hand?.length || 0})
          </span>
          <div className="flex items-center gap-2">
            {isMyTurn && isPlaying && (
              <span className="text-[10px] font-black uppercase animate-pulse" style={{ color: '#34D399' }}>
                ¡Tu turno! Juega o roba
              </span>
            )}
            <button
              type="button"
              onClick={handleCallUnaOlla}
              disabled={!isPlaying || !myPlayerState}
              className="flex items-center gap-1 px-4 py-2 rounded-full font-black text-[11px] uppercase tracking-wider text-white border border-amber-400 disabled:opacity-40 hover:scale-105 active:scale-95 transition-all"
              style={{ background: 'linear-gradient(90deg, #F97316, #DC2626, #991B1B)', boxShadow: '0 6px 16px rgba(220,38,38,0.4)' }}
            >
              <Flame className="w-3.5 h-3.5" /> UNA-OLLA
            </button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDrawCard}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold border border-slate-700"
            >
              Robar
            </Button>
          </div>
        </div>

        <div className="flex items-end gap-1.5 overflow-x-auto no-scrollbar pb-2 pt-3 px-1">
          {myPlayerState?.hand && myPlayerState.hand.length > 0 ? (
            myPlayerState.hand.map((c) => {
              const playable = isMyTurn && isPlaying && UnaOllaEngine.canPlayCard(c, state.topCard, state.currentColor);
              return (
                <div key={c.id} className="shrink-0 transition-transform">
                  <UnaOllaCardComponent
                    card={c}
                    size="md"
                    isPlayable={playable}
                    isSelected={selectedCardId === c.id}
                    onClick={() => handleSelectCard(c)}
                  />
                </div>
              );
            })
          ) : (
            <div className="text-[10px] py-3 px-2 font-mono" style={{ color: T.sub }}>
              Esperando inicio de partida...
            </div>
          )}
        </div>
      </div>

      {/* ===== ESPERA / INICIO ===== */}
      {!isPlaying && !isFinished && (
        <div className="p-6 text-center space-y-4 rounded-3xl border" style={{ background: T.panel, borderColor: T.border }}>
          <h3 className="text-lg font-black" style={{ color: T.text }}>Mesa de UNA-OLLA en espera</h3>
          <p className="text-xs" style={{ color: T.sub }}>
            {players.length < 2 ? 'Esperando que ingrese al menos otro jugador...' : 'El anfitrión puede iniciar la partida.'}
          </p>
          {isHost && (
            <Button
              variant="primary"
              size="lg"
              disabled={players.length < 2}
              onClick={handleStartGame}
              leftIcon={<Play className="w-5 h-5" />}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black mx-auto"
            >
              INICIAR PARTIDA
            </Button>
          )}
        </div>
      )}

      {/* ===== MODAL SELECCIÓN DE COLOR ===== */}
      {showColorPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className="p-6 rounded-3xl border-2 max-w-sm w-full space-y-4 text-center"
            style={{ background: T.panel, borderColor: T.accent }}
          >
            <h3 className="text-base font-black" style={{ color: T.text }}>Selecciona el nuevo color</h3>
            <div className="grid grid-cols-2 gap-3 pt-2">
              {(['red', 'blue', 'green', 'yellow'] as UnaOllaColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pendingWildCardId && executePlayCard(pendingWildCardId, c)}
                  className="p-4 rounded-2xl font-black text-sm text-white shadow-lg hover:scale-105 transition-transform"
                  style={{ background: colorDot(c) }}
                >
                  {c === 'red' ? '🔴 ROJO' : c === 'blue' ? '🔵 AZUL' : c === 'green' ? '🟢 VERDE' : '🟡 AMARILLO'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL REGLAS ===== */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div
            className="p-6 rounded-3xl border max-w-sm w-full space-y-4 relative"
            style={{ background: T.panel, borderColor: T.border }}
          >
            <button
              onClick={() => setShowRulesModal(false)}
              className="absolute top-4 right-4 font-bold text-lg"
              style={{ color: T.sub }}
            >
              ✕
            </button>
            <h3 className="text-base font-black border-b pb-2" style={{ color: T.accent, borderColor: T.border }}>
              📜 Reglas de UNA-OLLA
            </h3>
            <div className="text-xs space-y-2 max-h-72 overflow-y-auto pr-1" style={{ color: T.text }}>
              <p>• Juega una carta que coincida en <strong>color</strong> o <strong>número/símbolo</strong> con el descarte.</p>
              <p>• Sin carta válida: <strong>roba del mazo</strong>.</p>
              <p>• <strong>Comodines</strong> eligen color · <strong>Salto</strong> · <strong>Reversa</strong> · <strong>+2/+4</strong>.</p>
              <p>• Al quedar 1 carta, pulsa <strong>UNA-OLLA</strong> o serás penalizado con +2 si te desafían.</p>
            </div>
            <Button
              variant="primary"
              onClick={() => setShowRulesModal(false)}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {/* ===== VICTORIA 90/10 ===== */}
      {isFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div
            className="p-6 sm:p-8 rounded-3xl border-2 max-w-md w-full space-y-5 text-center"
            style={{ background: T.panel, borderColor: T.accent, boxShadow: `0 0 40px ${T.accent}44` }}
          >
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl animate-bounce"
              style={{ background: `${T.accent}22`, border: `2px solid ${T.accent}` }}
            >
              🏆
            </div>
            <h2 className="text-2xl font-black uppercase" style={{ color: T.text }}>¡Partida finalizada!</h2>
            <p className="text-sm font-black uppercase tracking-wider" style={{ color: T.accent }}>
              Ganador: {state.players?.[state.winnerUserId || '']?.name || getDisplayName(players.find((p) => p.userId === state.winnerUserId))}
            </p>
            {(() => {
              const gross = table.entryFee * players.length;
              const breakdown = FinancialRepository.calculatePoolBreakdown(gross);
              return (
                <div className="p-4 rounded-2xl border space-y-2 text-xs" style={{ background: 'rgba(0,0,0,0.35)', borderColor: T.border }}>
                  <div className="flex justify-between" style={{ color: T.sub }}>
                    <span>Pozo bruto:</span>
                    <span className="font-mono" style={{ color: T.text }}>{formatBolivares(gross)}</span>
                  </div>
                  <div className="flex justify-between font-bold" style={{ color: '#34D399' }}>
                    <span>Premio ganador:</span>
                    <span className="font-mono">{formatBolivares(breakdown.prizePool)}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: T.sub }}>
                    <span>Comisión de servicio:</span>
                    <span className="font-mono">{formatBolivares(breakdown.platformFee)}</span>
                  </div>
                </div>
              );
            })()}
            <Button variant="primary" onClick={onLeave} className="w-full font-bold bg-amber-500 hover:bg-amber-400 text-slate-950">
              Volver al Lobby
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
