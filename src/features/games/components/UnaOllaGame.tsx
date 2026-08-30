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

  // Asignar asientos relativos a la mesa (Bottom, Top, Left, Right)
  const totalPlayersCount = players.length;
  const myPlayerIndex = Math.max(0, players.findIndex((p) => p.userId === currentUserId));

  const getPlayerAtRelativeSeat = (offset: number): TablePlayer | null => {
    if (totalPlayersCount === 0) return null;
    const index = (myPlayerIndex + offset) % totalPlayersCount;
    return players[index] || null;
  };

  const bottomPlayer = players[myPlayerIndex] || players[0];
  const topPlayer = totalPlayersCount === 2 ? getPlayerAtRelativeSeat(1) : getPlayerAtRelativeSeat(2);
  const leftPlayer = totalPlayersCount >= 3 ? getPlayerAtRelativeSeat(1) : null;
  const rightPlayer = totalPlayersCount === 4 ? getPlayerAtRelativeSeat(3) : null;

  // Renderizador de caja de jugador (Avatar, Vidas, Cartas, Turno)
  const renderPlayerBox = (
    playerObj: TablePlayer | null,
    position: 'TOP' | 'LEFT' | 'RIGHT' | 'BOTTOM'
  ) => {
    if (!playerObj) return <div className="w-28 h-20 border border-slate-800/40 rounded-2xl bg-slate-950/20" />;

    const pState = state.players?.[playerObj.userId];
    const isCurrentTurn = activeTurnUser === playerObj.userId;
    const isMe = playerObj.userId === currentUserId;
    const isEliminated = pState?.status === 'eliminated';
    const cardCount = pState?.cardCount ?? 7;
    const lives = pState?.lives ?? 3;
    const hasCalled = pState?.hasCalledUnaOlla;
    const canBeChallenged = cardCount === 1 && !hasCalled && !isMe && isPlaying;

    return (
      <div
        className={`relative flex flex-col items-center p-2.5 rounded-2xl border transition-all duration-300 backdrop-blur-md shadow-xl ${
          isCurrentTurn
            ? 'bg-gradient-to-b from-amber-500/20 via-slate-900/90 to-slate-950 border-amber-400 ring-2 ring-amber-400/50 shadow-amber-500/20 scale-105 z-20'
            : isEliminated
            ? 'bg-slate-950/80 border-red-900/40 opacity-50 grayscale'
            : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        {/* Indicador de Turno */}
        {isCurrentTurn && isPlaying && (
          <div className="absolute -top-3 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-md animate-bounce">
            {isMe ? '¡TU TURNO!' : 'JUGANDO'}
          </div>
        )}

        {/* Indicador de UNA-OLLA gritado */}
        {hasCalled && (
          <div className="absolute -top-3 right-0 px-2 py-0.5 rounded-full bg-red-600 text-amber-300 text-[9px] font-black uppercase tracking-wider shadow-md animate-pulse">
            🔥 UNA-OLLA
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Avatar del Jugador */}
          <div className="relative">
            <img
              src={playerObj.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'}
              alt={playerObj.displayName}
              className={`w-10 h-10 rounded-full object-cover border-2 shadow-inner ${
                isCurrentTurn ? 'border-amber-400' : 'border-slate-700'
              }`}
            />
            {isEliminated && (
              <div className="absolute inset-0 bg-red-950/80 rounded-full flex items-center justify-center text-xs font-bold text-red-400">
                💀
              </div>
            )}
          </div>

          <div className="text-left">
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-slate-100 truncate max-w-[90px]">
                {playerObj.displayName}
              </span>
              {isMe && <span className="text-[9px] text-amber-400 font-mono">(Tú)</span>}
            </div>

            {/* Vidas ❤️❤️❤️ */}
            <div className="flex items-center gap-0.5 mt-0.5" title={`${lives} vidas restantes`}>
              {[1, 2, 3].map((lvl) => (
                <span
                  key={lvl}
                  className={`text-xs transition-transform ${lvl <= lives ? 'scale-100' : 'opacity-20 scale-75'}`}
                >
                  ❤️
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Contador y Pilas de Cartas (Para Oponentes) */}
        {!isMe && (
          <div className="mt-2 flex items-center gap-1.5 pt-1 border-t border-slate-800/80 w-full justify-between">
            <div className="flex items-center gap-1 text-[11px] font-mono text-amber-300 font-bold">
              <span>🎴</span>
              <span>{cardCount} {cardCount === 1 ? 'carta' : 'cartas'}</span>
            </div>

            {/* Botón de Desafío de Penalización (+2) */}
            {canBeChallenged && (
              <button
                type="button"
                onClick={() => handleChallengeUnaOlla(playerObj.userId)}
                className="text-[9px] font-black bg-red-600 hover:bg-red-500 text-white px-2 py-0.5 rounded-full border border-red-400 shadow animate-pulse cursor-pointer flex items-center gap-1"
                title="Desafiar por no cantar UNA-OLLA (+2 cartas)"
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>DESAFÍAR</span>
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

      {/* MESA ESTILO 3D (FIELTRO VERDE Y BORDE DE DEPTHTH) */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/9] min-h-[420px] sm:min-h-[500px] rounded-[40px] border-8 border-slate-900 shadow-2xl overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-950 p-4 flex flex-col justify-between">
        {/* Textura y Relevo Fieltro Verde */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.3) 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }}
        />

        {/* LOGO CENTRAL EN RELIEVE: UNA-OLLA */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20">
          <div className="w-64 h-32 rounded-full border-4 border-amber-400/40 flex items-center justify-center transform -rotate-12">
            <h1 className="text-4xl sm:text-6xl font-black text-amber-300 tracking-tighter uppercase drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)]">
              UNA-OLLA
            </h1>
          </div>
        </div>

        {/* JUGADOR SUPERIOR (TOP) */}
        <div className="flex justify-center z-10">
          {renderPlayerBox(topPlayer, 'TOP')}
        </div>

        {/* CENTRO: JUGADOR IZQUIERDO, ZONA CENTRAL (MAZO Y DESCARTE), JUGADOR DERECHO */}
        <div className="flex items-center justify-between gap-2 z-10 px-2 sm:px-8">
          {/* Jugador Izquierdo */}
          <div className="w-32">{renderPlayerBox(leftPlayer, 'LEFT')}</div>

          {/* ZONA CENTRAL: MAZO Y PILA DE DESCARTE */}
          <div className="flex flex-col items-center gap-3 bg-slate-950/60 p-4 rounded-3xl border border-slate-800/80 backdrop-blur-md shadow-2xl">
            {/* Indicador de Color Activo y Dirección */}
            <div className="flex items-center gap-3 text-xs font-bold text-slate-200">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700">
                <span>Color:</span>
                <span
                  className={`w-3.5 h-3.5 rounded-full border border-white shadow ${
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

              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 font-mono text-amber-300">
                <span className={`transform transition-transform ${state.direction === 1 ? 'rotate-0' : 'rotate-180'}`}>
                  🔄
                </span>
                <span>{state.direction === 1 ? 'Horario' : 'Antihorario'}</span>
              </div>
            </div>

            {/* Mazo de Robo y Pila de Descarte */}
            <div className="flex items-center gap-6">
              {/* Mazo de Robo */}
              <div className="flex flex-col items-center gap-1">
                <div className="relative cursor-pointer group" onClick={handleDrawCard}>
                  <UnaOllaCardComponent isBack size="md" className="group-hover:scale-105 transition-transform" />
                  <div className="absolute -bottom-2 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black font-mono shadow">
                    {state.drawPileCount} cartas
                  </div>
                </div>
                <span className="text-[10px] text-slate-300 font-bold uppercase mt-1">MAZO</span>
              </div>

              {/* Pila de Descarte */}
              <div className="flex flex-col items-center gap-1">
                <UnaOllaCardComponent card={state.topCard} size="md" />
                <span className="text-[10px] text-slate-300 font-bold uppercase mt-1">DESCARTE</span>
              </div>
            </div>

            {/* Cronómetro de Turno Activo */}
            {isPlaying && (
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400 bg-slate-900/90 px-3.5 py-1 rounded-full border border-amber-500/30">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Tiempo: {timeLeft}s</span>
              </div>
            )}
          </div>

          {/* Jugador Derecho */}
          <div className="w-32">{renderPlayerBox(rightPlayer, 'RIGHT')}</div>
        </div>

        {/* JUGADOR INFERIOR (BOTTOM / USUARIO ACTUAL) */}
        <div className="flex flex-col items-center gap-2 z-10 w-full">
          {renderPlayerBox(bottomPlayer, 'BOTTOM')}
        </div>
      </div>

      {/* CONTROLES DE MANO PRIVADA DEL JUGADOR ACTUAL */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-2xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <span>🎴 Tu Mano Privada ({myPlayerState?.hand?.length || 0} cartas):</span>
            {isMyTurn && isPlaying && (
              <span className="text-emerald-400 font-bold animate-pulse">
                ¡Es tu turno de jugar! Haz clic en una carta válida.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Botón de Robar Carta */}
            {isMyTurn && isPlaying && (
              <Button size="sm" variant="secondary" onClick={handleDrawCard}>
                Robar Carta del Mazo
              </Button>
            )}
          </div>
        </div>

        {/* Abanico de Cartas Interactivas */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto p-2 pb-4 scrollbar-thin scrollbar-thumb-slate-700">
          {myPlayerState?.hand && myPlayerState.hand.length > 0 ? (
            myPlayerState.hand.map((c) => {
              const isPlayable = isMyTurn && isPlaying && UnaOllaEngine.canPlayCard(c, state.topCard, state.currentColor);
              return (
                <div key={c.id}>
                  <UnaOllaCardComponent
                    card={c}
                    size="md"
                    isPlayable={isPlayable}
                    isSelected={selectedCardId === c.id}
                    onClick={() => handleSelectCard(c)}
                  />
                </div>
              );
            })
          ) : (
            <div className="text-xs text-slate-400 py-4 font-mono">
              Esperando el inicio de la partida para recibir tus cartas...
            </div>
          )}
        </div>
      </div>

      {/* BOTÓN CIRCULAR ROJO 3D: UNA-OLLA (FIJO EN ESQUINA INFERIOR DERECHA) */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={handleCallUnaOlla}
          disabled={!isPlaying || !myPlayerState || myPlayerState.status !== 'active'}
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-red-800 border-4 border-amber-300 text-amber-300 font-black text-sm sm:text-base uppercase tracking-wider shadow-2xl hover:scale-110 active:scale-95 transition-all duration-200 flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
          style={{
            boxShadow: '0 12px 24px -4px rgba(220, 38, 38, 0.6), inset 0 3px 6px rgba(255, 255, 255, 0.4)',
          }}
        >
          <span className="text-lg">🔥</span>
          <span>UNA</span>
          <span className="text-xs text-white">OLLA</span>
        </button>
      </div>

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

      {/* PANALES Y MODALES DE ESTADO (WAITING & GAME FINISHED) */}
      {!isPlaying && !isFinished && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4">
          <h3 className="text-lg font-bold text-slate-100">Mesa de UNA-OLLA en Espera</h3>
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
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black"
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
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 text-3xl mx-auto shadow-inner">
              🏆
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tight">
                ¡PARTIDA FINALIZADA!
              </h2>
              <p className="text-xs text-slate-300">
                Ganador de la Mesa de UNA-OLLA:
              </p>
            </div>

            {/* Ficha del Ganador */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-amber-500/30 flex items-center justify-center gap-3">
              <span className="text-lg font-bold text-amber-300">
                {state.players[state.winnerUserId || '']?.name || 'Jugador Victorioso'}
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
              <Button variant="primary" onClick={onLeave} className="w-full font-bold">
                Volver al Lobby de Juegos
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
