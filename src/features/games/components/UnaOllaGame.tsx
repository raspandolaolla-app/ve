// ==============================================================================
// RASPANDO LA OLLA — MESA MULTIJUGADOR VIRTUAL UNA-OLLA (3D)
// ==============================================================================
// Mesa estilo 3D con fieltro verde brillante, logo de relieve UNA-OLLA,
// 4 posiciones de jugadores reales (Top, Left, Right, Bottom), manos privadas,
// reversos originales, cronómetro sincronizado con la hora del servidor,
// escalera de 3 vidas (10s -> 20s -> 30s -> 10s -> Eliminado),
// botón circular 3D UNA-OLLA y liquidación 90/10 en Supabase.
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import type { UnaOllaState, UnaOllaCard, UnaOllaColor, UnaOllaPlayerState } from '../../../types/games';
import { useGameEngine } from '../useGameEngine';
import { UnaOllaEngine } from '../engines/UnaOllaEngine';
import { UnaOllaCardComponent } from './UnaOllaCardComponent';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, Flame, Sparkles, ShieldCheck, AlertCircle, Play, UserCheck, AlertTriangle } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

interface UnaOllaGameProps {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  onLeave: () => void;
}

export function UnaOllaGame({
  table,
  players,
  currentUserId,
  onLeave,
}: UnaOllaGameProps) {
  const isHost = currentUserId === table.hostUserId;

  // Estado inicial de la mesa
  const initialState = UnaOllaEngine.initGameState(players, table.hostUserId);

  const {
    gameState,
    setGameState,
    currentTurnUserId,
    isMyTurn,
    loading,
    isSettling,
    settlementResult,
    dispatchAction,
  } = useGameEngine({
    table,
    players,
    currentUserId,
    initialState,
  });

  const state = (gameState as unknown as UnaOllaState) || initialState;
  const isPlaying = state.status === 'PLAYING';
  const isFinished = state.status === 'GAME_FINISHED' || Boolean(state.winnerUserId);

  // Estados locales para UI
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const activeTurnUser = state.currentTurnUserId || currentTurnUserId || '';
  const myPlayerState: UnaOllaPlayerState | undefined = currentUserId ? state.players?.[currentUserId] : undefined;

  // Temporizador de turno sincronizado con el servidor
  useEffect(() => {
    if (!isPlaying || !state.turnDeadlineAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((state.turnDeadlineAt - Date.now()) / 1000));
      setTimeLeft(remaining);

      // Si el tiempo expira en el cliente y este cliente es el Host o le toca el turno, ejecutar timeout
      if (remaining === 0 && (isHost || activeTurnUser === currentUserId)) {
        clearInterval(interval);
        handleTurnTimeout();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, state.turnDeadlineAt, activeTurnUser, currentUserId, isHost]);

  // Manejador de timeout por inactividad
  const handleTurnTimeout = async () => {
    const nextState = UnaOllaEngine.handleTurnTimeout(state);
    const nextTurn = nextState.currentTurnUserId;
    const isOver = nextState.status === 'GAME_FINISHED';
    const winner = nextState.winnerUserId;

    await dispatchAction(
      'TURN_TIMEOUT',
      { turnUser: activeTurnUser },
      nextState as any,
      nextTurn,
      winner,
      false
    );
  };

  // Iniciar partida (Host)
  const handleStartGame = async () => {
    if (!isHost || isPlaying || isFinished || players.length < 2) return;

    const freshState = UnaOllaEngine.initGameState(players, table.hostUserId);
    await dispatchAction(
      'START_GAME',
      { startedBy: currentUserId },
      freshState as any,
      freshState.currentTurnUserId,
      null,
      false
    );
  };

  // Seleccionar carta para jugar
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

  // Ejecutar jugada de carta
  const executePlayCard = async (cardId: string, chosenColor?: UnaOllaColor) => {
    if (!currentUserId) return;

    const result = UnaOllaEngine.playCard(
      state,
      currentUserId,
      cardId,
      chosenColor,
      undefined
    );

    if (!result.success) {
      setActionNotice(`⚠️ ${result.error || 'No fue posible jugar esa carta.'}`);
      setTimeout(() => setActionNotice(null), 3000);
      return;
    }

    const nextState = result.nextState;
    const nextTurn = nextState.currentTurnUserId;
    const isOver = nextState.status === 'GAME_FINISHED';
    const winner = nextState.winnerUserId;

    setSelectedCardId(null);
    setShowColorPicker(false);
    setPendingWildCardId(null);

    await dispatchAction(
      'PLAY_CARD',
      { cardId, chosenColor },
      nextState as any,
      nextTurn,
      winner,
      false
    );
  };

  // Robar carta del mazo
  const handleDrawCard = async () => {
    if (!isMyTurn || !isPlaying || !currentUserId) return;

    const result = UnaOllaEngine.drawCard(state, currentUserId);
    if (!result.success) return;

    const nextState = result.nextState;
    const nextTurn = nextState.currentTurnUserId;

    await dispatchAction(
      'DRAW_CARD',
      { drawnCard: result.drawnCard },
      nextState as any,
      nextTurn,
      null,
      false
    );
  };

  // Anunciar UNA-OLLA
  const handleCallUnaOlla = async () => {
    if (!currentUserId || !myPlayerState) return;

    const result = UnaOllaEngine.callUnaOlla(state, currentUserId);
    if (!result.success) return;

    await dispatchAction(
      'CALL_UNA_OLLA',
      { userId: currentUserId },
      result.nextState as any,
      state.currentTurnUserId,
      null,
      false
    );

    setActionNotice('🔥 ¡Gritaste UNA-OLLA exitosamente!');
    setTimeout(() => setActionNotice(null), 3000);
  };

  // Desafiar/Penalizar UNA-OLLA a un rival
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

  // Estado de modal de reglas
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  // Asignar asientos relativos a la mesa (Bottom, Top, Left, Right)
  const uniquePlayers = Array.from(
    new Map(players.map((p) => [p.userId, p])).values()
  ).sort((a, b) => a.seatNumber - b.seatNumber);
  const totalPlayersCount = uniquePlayers.length;
  const myPlayerIndex = Math.max(0, uniquePlayers.findIndex((p) => p.userId === currentUserId));

  const getPlayerAtRelativeSeat = (offset: number): TablePlayer | null => {
    if (totalPlayersCount === 0) return null;
    const index = (myPlayerIndex + offset) % totalPlayersCount;
    return uniquePlayers[index] || null;
  };

  const bottomPlayer = uniquePlayers[myPlayerIndex] || uniquePlayers[0];
  const topPlayer = totalPlayersCount === 2 ? getPlayerAtRelativeSeat(1) : getPlayerAtRelativeSeat(2);
  const leftPlayer = totalPlayersCount >= 3 ? getPlayerAtRelativeSeat(1) : null;
  const rightPlayer = totalPlayersCount === 4 ? getPlayerAtRelativeSeat(3) : null;

  // Componente interno para renderizar pila de cartas 3D boca abajo con sombra
  const CardPileBack = ({ count, glowColor }: { count: number; glowColor?: string }) => {
    const cards = Array.from({ length: Math.min(3, count) });
    return (
      <div className={`relative w-11 h-16 sm:w-14 sm:h-20 transition-all duration-300 ${glowColor ? 'drop-shadow-[0_0_12px_rgba(34,197,94,0.7)]' : ''}`}>
        {cards.map((_, idx) => (
          <div
            key={idx}
            className="absolute border border-slate-100/90 rounded-lg bg-gradient-to-br from-blue-700 via-blue-800 to-blue-950 shadow-md"
            style={{
              width: '100%',
              height: '100%',
              top: `-${idx * 2}px`,
              left: `${idx * 1.5}px`,
              zIndex: idx,
              boxShadow: '0 4px 8px rgba(0,0,0,0.5), inset 0 1.5px 3px rgba(255, 255, 255, 0.25)',
            }}
          >
            {/* Elipse Central mini */}
            <div className="absolute inset-[15%] bg-gradient-to-br from-orange-500 to-red-600 rounded-[50%/60%] border border-amber-400/40 flex items-center justify-center transform -rotate-12">
              <span className="text-[6px] font-black text-white scale-[0.8] leading-none">UO</span>
            </div>
          </div>
        ))}
        {count > 0 && (
          <div className="absolute -bottom-2 -right-2 bg-slate-950 border border-slate-800 text-amber-400 text-[9px] font-black font-mono rounded-full px-1.5 py-0.5 z-20 shadow">
            {count}
          </div>
        )}
      </div>
    );
  };

  // Renderizador de caja de jugador (Avatar, Vidas, Cartas, Turno)
  const renderPlayerBox = (
    playerObj: TablePlayer | null,
    corner: 'BOTTOM_LEFT' | 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_RIGHT'
  ) => {
    const actualUser = playerObj;
    const pState = actualUser ? state.players?.[actualUser.userId] : undefined;
    const isCurrentTurn = actualUser ? (activeTurnUser === actualUser.userId) : false;
    const isMe = corner === 'BOTTOM_LEFT';
    const isEliminated = pState ? (pState.status === 'eliminated') : false;
    const cardCount = pState ? pState.cardCount : 6;
    const lives = pState ? pState.lives : 3;
    const hasCalled = pState ? pState.hasCalledUnaOlla : false;
    const canBeChallenged = actualUser && cardCount === 1 && !hasCalled && !isMe && isPlaying;

    const profile = {
      BOTTOM_LEFT: {
        name: 'Gust',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
      },
      TOP_LEFT: {
        name: 'Tanuja',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80',
      },
      TOP_RIGHT: {
        name: 'Harsh',
        avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=150&q=80',
      },
      BOTTOM_RIGHT: {
        name: 'Shubho',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=150&q=80',
      }
    }[corner];

    return (
      <div
        className={`relative flex flex-col items-center p-3 rounded-2xl border transition-all duration-300 backdrop-blur-md shadow-xl ${
          isCurrentTurn
            ? 'bg-gradient-to-b from-amber-500/10 via-slate-900/95 to-slate-950 border-amber-400 ring-2 ring-amber-400/40 shadow-amber-500/25 scale-105 z-20'
            : isEliminated
            ? 'bg-slate-950/80 border-red-900/40 opacity-50 grayscale'
            : 'bg-slate-900/90 border-slate-800'
        } ${corner === 'TOP_RIGHT' ? 'shadow-[0_0_20px_rgba(16,185,129,0.15)]' : ''}`}
      >
        {/* Glow halo verde sobre la pila para Harsh (Top-Right) */}
        {corner === 'TOP_RIGHT' && isPlaying && (
          <div className="absolute inset-0 border-2 border-emerald-500/50 rounded-2xl animate-pulse pointer-events-none shadow-[inset_0_0_12px_rgba(16,185,129,0.3)]" />
        )}

        {/* Indicador de Turno */}
        {isCurrentTurn && isPlaying && (
          <div className="absolute -top-3 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black uppercase tracking-wider shadow-md animate-bounce">
            {isMe ? '¡TU TURNO!' : 'JUGANDO'}
          </div>
        )}

        {/* Indicador de UNA-OLLA gritado */}
        {hasCalled && (
          <div className="absolute -top-3 right-0 px-2 py-0.5 rounded-full bg-red-600 text-amber-300 text-[8px] font-black uppercase tracking-wider shadow-md animate-pulse">
            🔥 UNA-OLLA
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Avatar del Jugador fotorrealista */}
          <div className="relative">
            <img
              src={profile.avatar}
              alt={profile.name}
              referrerPolicy="no-referrer"
              className={`w-11 h-11 rounded-full object-cover border-2 shadow-inner ${
                isCurrentTurn ? 'border-amber-400' : 'border-slate-700'
              }`}
            />
            {isEliminated && (
              <div className="absolute inset-0 bg-red-950/80 rounded-full flex items-center justify-center text-xs font-bold text-red-400">
                💀
              </div>
            )}
          </div>

          <div className="text-left min-w-[70px]">
            {/* Nombre del jugador en ROJO */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-black text-red-500 tracking-wide uppercase font-serif truncate max-w-[85px]">
                {profile.name}
              </span>
              {isMe && <span className="text-[9px] text-amber-400 font-mono">(Tú)</span>}
            </div>

            {/* Vidas ❤️❤️❤️ */}
            <div className="flex items-center gap-0.5 mt-1" title={`${lives} vidas restantes`}>
              {[1, 2, 3].map((lvl) => (
                <span
                  key={lvl}
                  className={`text-[10px] transition-transform ${lvl <= lives ? 'scale-100' : 'opacity-20 scale-75'}`}
                >
                  ❤️
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Contador y Pilas de Cartas boca abajo para Oponentes */}
        {!isMe && (
          <div className="mt-3 flex flex-col items-center gap-2 pt-2 border-t border-slate-800/80 w-full">
            <CardPileBack count={cardCount} glowColor={corner === 'TOP_RIGHT' ? 'rgba(16,185,129,0.5)' : undefined} />

            {/* Botón de Desafío de Penalización */}
            {canBeChallenged && (
              <button
                type="button"
                onClick={() => actualUser && handleChallengeUnaOlla(actualUser.userId)}
                className="mt-1 text-[8px] font-black bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded-full border border-red-400 shadow animate-pulse cursor-pointer flex items-center gap-1"
                title="Desafiar por no cantar UNA-OLLA"
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>DESAFIAR</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {/* Notificaciones / Logs de Acción */}
      {state.lastActionLog && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 px-4 text-center text-xs text-amber-300 font-medium shadow-lg flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{state.lastActionLog}</span>
        </div>
      )}

      {actionNotice && (
        <div className="bg-red-950/90 border border-red-800 rounded-2xl p-2.5 px-4 text-center text-xs text-red-200 font-bold shadow-lg animate-in fade-in">
          {actionNotice}
        </div>
      )}

      {/* MESA ESTILO FOTORREALISTA DE MADERA OSCURA Y DAMASCO */}
      <div
        className="relative w-full aspect-[16/10] min-h-[500px] rounded-[48px] border-[14px] border-[#3a2012] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden bg-gradient-to-br from-[#22120b] via-[#140b06] to-[#0a0503] p-6 flex flex-col justify-between"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0.9) 100%),
            repeating-linear-gradient(45deg, rgba(212, 175, 55, 0.015) 0px, rgba(212, 175, 55, 0.015) 1px, transparent 1px, transparent 30px),
            repeating-linear-gradient(-45deg, rgba(212, 175, 55, 0.015) 0px, rgba(212, 175, 55, 0.015) 1px, transparent 1px, transparent 30px)
          `,
        }}
      >
        {/* Luces Ambientales (Spotlights) en el centro y la mano */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.12),transparent_45%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_85%,rgba(245,158,11,0.08),transparent_35%)] pointer-events-none" />

        {/* LOGO CENTRAL EN RELIEVE: UNA-OLLA */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-[0.08]">
          <div className="w-80 h-40 rounded-full border-4 border-amber-400/40 flex items-center justify-center transform -rotate-12">
            <h1 className="text-5xl sm:text-7xl font-black text-amber-300 tracking-tighter uppercase font-serif">
              UNA-OLLA
            </h1>
          </div>
        </div>

        {/* INTERFAZ PERIFÉRICA: BOTONES DE INFORMACIÓN ('i') Y MENÚ (TRES LÍNEAS) EN CÍRCULOS BLANCOS */}
        <div className="absolute top-4 left-4 z-30">
          <button
            type="button"
            onClick={() => setShowRulesModal(true)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-neutral-100 text-slate-800 shadow-xl flex items-center justify-center font-bold text-base sm:text-lg border border-neutral-200 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            title="Información"
          >
            i
          </button>
        </div>

        <div className="absolute top-4 right-4 z-30">
          <button
            type="button"
            onClick={onLeave}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-neutral-100 text-slate-800 shadow-xl flex items-center justify-center font-bold text-lg border border-neutral-200 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            title="Volver al Lobby"
          >
            <div className="flex flex-col space-y-1 w-3.5 sm:w-4 items-center">
              <div className="w-3.5 sm:w-4 h-0.5 bg-slate-800 rounded"></div>
              <div className="w-3.5 sm:w-4 h-0.5 bg-slate-800 rounded"></div>
              <div className="w-3.5 sm:w-4 h-0.5 bg-slate-800 rounded"></div>
            </div>
          </button>
        </div>

        {/* FILA SUPERIOR: TANUJA Y HARSH */}
        <div className="flex items-start justify-between z-10 w-full">
          {/* Tanuja (Arriba a la Izquierda) */}
          {renderPlayerBox(leftPlayer, 'TOP_LEFT')}

          {/* Harsh (Arriba a la Derecha) con halo verde */}
          {renderPlayerBox(topPlayer, 'TOP_RIGHT')}
        </div>

        {/* CENTRO: MAZO Y PILA DE DESCARTE CON HALO AZUL */}
        <div className="flex flex-col items-center gap-2 bg-slate-950/40 p-3 sm:p-4 rounded-[24px] border border-slate-800/60 backdrop-blur-md shadow-2xl self-center">
          {/* Indicador de Color Activo y Dirección */}
          <div className="flex items-center gap-3 text-[10px] sm:text-xs font-bold text-slate-200">
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-900/90 border border-slate-800">
              <span>Color:</span>
              <span
                className={`w-3 h-3 rounded-full border border-white/60 shadow ${
                  state.currentColor === 'red'
                    ? 'bg-red-600'
                    : state.currentColor === 'blue'
                    ? 'bg-blue-600'
                    : state.currentColor === 'green'
                    ? 'bg-emerald-600'
                    : 'bg-amber-400'
                }`}
              />
            </div>

            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-900/90 border border-slate-800 font-mono text-amber-300">
              <span className={`transform transition-transform ${state.direction === 1 ? 'rotate-0' : 'rotate-180'}`}>
                🔄
              </span>
              <span>{state.direction === 1 ? 'Horario' : 'Antihorario'}</span>
            </div>
          </div>

          {/* Mazo de Robo y Pila de Descarte */}
          <div className="flex items-center gap-6 sm:gap-8 mt-1">
            {/* Mazo de Robo */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative cursor-pointer group" onClick={handleDrawCard}>
                <UnaOllaCardComponent isBack size="md" className="group-hover:scale-105 transition-transform" />
                <div className="absolute -bottom-2 px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black font-mono shadow">
                  {state.drawPileCount}
                </div>
              </div>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1 font-mono">MAZO</span>
            </div>

            {/* Pila de Descarte con Halo Azul, mostrando Azul 8 encima de una Verde */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative w-16 h-24 flex items-center justify-center">
                {/* Carta Verde inferior (rotada ligeramente) */}
                <div className="absolute transform -rotate-12 translate-y-1 pointer-events-none scale-95 opacity-60">
                  <UnaOllaCardComponent
                    card={{ id: 'under_green_card', color: 'green', type: 'number', number: 4 }}
                    size="md"
                  />
                </div>
                {/* Azul 8 superior (rotada un poco para fotorrealismo) */}
                <div className="absolute transform rotate-6 drop-shadow-[0_0_15px_rgba(59,130,246,0.85)]">
                  <UnaOllaCardComponent card={state.topCard} size="md" />
                </div>
              </div>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1 font-mono">DESCARTE</span>
            </div>
          </div>

          {/* Cronómetro de Turno Activo */}
          {isPlaying && (
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono font-bold text-amber-400 bg-slate-900/90 px-3 py-0.5 rounded-full border border-amber-500/20 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              <span>Tiempo: {timeLeft}s</span>
            </div>
          )}
        </div>

        {/* FILA INFERIOR: GUST Y SHUBHO CON LA MANO DE JUEGO INTEGRADA */}
        <div className="flex items-end justify-between gap-4 z-10 w-full">
          {/* Gust (Bottom-Left) y mano privada extendiéndose */}
          <div className="flex items-end gap-3 max-w-[70%]">
            {renderPlayerBox(bottomPlayer, 'BOTTOM_LEFT')}

            {/* Mano Privada Interactiva de Gust */}
            <div className="relative flex flex-col gap-1 p-2 rounded-2xl bg-amber-400/[0.02] border border-amber-500/10 shadow-[0_0_30px_rgba(245,158,11,0.04)]">
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-300 px-1 border-b border-slate-800/50 pb-0.5">
                <span>🎴 Tu Mano Privada ({myPlayerState?.hand?.length || 0}):</span>
                {isMyTurn && isPlaying && (
                  <span className="text-emerald-400 font-black animate-pulse">¡Tu turno! Haz clic.</span>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto p-1 max-w-[200px] sm:max-w-[320px] md:max-w-[420px] scrollbar-thin scrollbar-thumb-slate-800">
                {myPlayerState?.hand && myPlayerState.hand.length > 0 ? (
                  myPlayerState.hand.map((c) => {
                    const isPlayable = isMyTurn && isPlaying && UnaOllaEngine.canPlayCard(c, state.topCard, state.currentColor);
                    return (
                      <div key={c.id} className="transition-transform duration-200">
                        <UnaOllaCardComponent
                          card={c}
                          size="sm"
                          isPlayable={isPlayable}
                          isSelected={selectedCardId === c.id}
                          onClick={() => handleSelectCard(c)}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[9px] text-slate-400 py-3 px-2 font-mono">
                    Esperando inicio de partida...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Botón Ovalado Una-Olla y Shubho (Bottom-Right) */}
          <div className="flex items-center gap-3">
            {/* Botón Ovalado Una-Olla */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={handleCallUnaOlla}
                disabled={!isPlaying || !myPlayerState}
                className="px-4 py-2.5 sm:px-5 sm:py-3 rounded-full bg-gradient-to-r from-orange-500 via-red-600 to-red-800 border border-amber-400 text-white font-black text-[11px] sm:text-xs uppercase tracking-wider shadow-[0_6px_16px_rgba(220,38,38,0.4),inset_0_1.5px_3px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Una-Olla
              </button>
              <span className="text-[8px] text-slate-400 uppercase tracking-widest font-mono font-bold">Botón</span>
            </div>

            {/* Shubho (Abajo a la derecha) */}
            {renderPlayerBox(rightPlayer, 'BOTTOM_RIGHT')}
          </div>
        </div>
      </div>

      {/* CONTROLES EXTRA DE MESA / BOTÓN DE ROBAR */}
      {isMyTurn && isPlaying && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-2xl flex items-center justify-between">
          <span className="text-xs text-amber-300 font-bold">⚠️ Es tu turno de juego en la mesa. Puedes jugar una de tus cartas válidas o robar.</span>
          <Button size="sm" variant="secondary" onClick={handleDrawCard} className="bg-slate-800 hover:bg-slate-700 text-white font-bold border border-slate-700">
            Robar Carta del Mazo
          </Button>
        </div>
      )}

      {/* MODAL DE INFORMACIÓN Y REGLAS (Gatillado por botón circular 'i') */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowRulesModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-base font-black text-amber-400 font-serif border-b border-slate-800 pb-2 flex items-center gap-1.5">
              <span>📜</span>
              <span>Reglas de UNA-OLLA</span>
            </h3>
            <div className="text-xs text-slate-300 space-y-3 max-h-80 overflow-y-auto pr-1">
              <p>
                ¡Bienvenido a <strong>UNA-OLLA</strong>! El tradicional juego de cartas competitivo de descarte rápido.
              </p>
              <h4 className="font-bold text-slate-100">Cómo jugar:</h4>
              <ul className="list-disc pl-4 space-y-1.5 text-slate-300">
                <li>Juega una carta que coincida en <strong>color</strong> o <strong>número/símbolo</strong> con la carta en la pila de descarte.</li>
                <li>Si no posees cartas válidas, debes <strong>robar del mazo</strong>.</li>
                <li>Los <strong>Comodines</strong> eligen el próximo color activo.</li>
                <li>La carta <strong>Salto (🚫)</strong> salta al siguiente jugador.</li>
                <li>La carta <strong>Reversa (🔄)</strong> invierte el sentido de juego.</li>
              </ul>
              <h4 className="font-bold text-slate-100">Regla Una-Olla:</h4>
              <p>
                Al quedarte con <strong>una carta restante</strong>, debes presionar inmediatamente el botón <strong>Una-Olla</strong>. Si un rival te descubre antes de gritarlo, ¡te penalizará con +2 cartas!
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => setShowRulesModal(false)}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
            >
              Cerrar y Volver
            </Button>
          </div>
        </div>
      )}

      {/* MODAL DE SELECCIÓN DE COLOR PARA COMODÍN */}
      {showColorPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 text-center shadow-2xl">
            <h3 className="text-base font-bold text-slate-100">Selecciona el nuevo color activo</h3>
            <p className="text-xs text-slate-400">Escoge el color con el que continuará la ronda:</p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => pendingWildCardId && executePlayCard(pendingWildCardId, 'red')}
                className="p-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg cursor-pointer"
              >
                🔴 ROJO
              </button>
              <button
                type="button"
                onClick={() => pendingWildCardId && executePlayCard(pendingWildCardId, 'blue')}
                className="p-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg cursor-pointer"
              >
                🔵 AZUL
              </button>
              <button
                type="button"
                onClick={() => pendingWildCardId && executePlayCard(pendingWildCardId, 'green')}
                className="p-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg cursor-pointer"
              >
                🟢 VERDE
              </button>
              <button
                type="button"
                onClick={() => pendingWildCardId && executePlayCard(pendingWildCardId, 'yellow')}
                className="p-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm shadow-lg cursor-pointer"
              >
                🟡 AMARILLO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PANELES Y MODALES DE ESTADO (WAITING & GAME FINISHED) */}
      {!isPlaying && !isFinished && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4">
          <h3 className="text-lg font-bold text-slate-100 font-serif">Mesa de UNA-OLLA en Espera</h3>
          <p className="text-xs text-slate-400">
            {players.length < 2
              ? 'Esperando que ingrese al menos otro jugador a la mesa...'
              : 'La mesa cuenta con jugadores suficientes. El anfitrión puede iniciar la partida.'}
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
              ENTRAR A LA PARTIDA DE UNA-OLLA
            </Button>
          )}
        </div>
      )}

      {/* MODAL DE VICTORIA Y LIQUIDACIÓN 90/10 */}
      {isFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 text-3xl mx-auto shadow-inner animate-bounce">
              🏆
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tight font-serif">
                ¡PARTIDA FINALIZADA!
              </h2>
              <p className="text-xs text-slate-300">
                Ganador de la Mesa de UNA-OLLA:
              </p>
            </div>

            {/* Ficha del Ganador */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 flex items-center justify-center gap-3">
              <span className="text-base font-black text-amber-400 uppercase tracking-wider font-serif">
                {state.players[state.winnerUserId || '']?.name || 'Gust'}
              </span>
            </div>

            {/* Resumen Financiero 90/10 */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Pozo Bruto Recaudado:</span>
                <span className="font-mono text-slate-200">{formatBolivares(table.entryFee * players.length)}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-400 font-bold border-t border-slate-800 pt-2 text-sm">
                <span>Premio Ganador (90%):</span>
                <span className="font-mono">{formatBolivares(table.entryFee * players.length * 0.9)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>Comisión Plataforma (10%):</span>
                <span className="font-mono">{formatBolivares(table.entryFee * players.length * 0.1)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="primary" onClick={onLeave} className="w-full font-bold bg-amber-500 hover:bg-amber-400 text-slate-950">
                Volver al Lobby de Juegos
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
