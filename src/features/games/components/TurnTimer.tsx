// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE DE TEMPORIZADOR DE TURNO SINCRONIZADO
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

export interface TurnTimerProps {
  sessionId?: string;
  currentTurnUserId?: string;
  turnExpiresAt?: string;
  durationSeconds?: number;
  isMyTurn?: boolean;
  activePlayerName?: string;
  status?: string;
  gameStatus?: string;
  version?: string | number;
  onTimeout?: () => void;
  onOpponentTimeout?: () => void;
  className?: string;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({
  sessionId,
  currentTurnUserId,
  turnExpiresAt,
  durationSeconds = 30,
  isMyTurn = false,
  activePlayerName = 'Rival',
  status,
  gameStatus,
  version,
  onTimeout,
  onOpponentTimeout,
  className = '',
}) => {
  const [remaining, setRemaining] = useState<number>(durationSeconds);
  const timedOutRef = useRef(false);
  const lastFiredExpiresAtRef = useRef<string | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  const onOpponentTimeoutRef = useRef(onOpponentTimeout);
  const lastTurnUserIdRef = useRef<string | null>(null);
  const turnSwitchTimestampRef = useRef<number>(Date.now());

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    onOpponentTimeoutRef.current = onOpponentTimeout;
  }, [onOpponentTimeout]);

  useEffect(() => {
    if (currentTurnUserId && currentTurnUserId !== lastTurnUserIdRef.current) {
      lastTurnUserIdRef.current = currentTurnUserId;
      turnSwitchTimestampRef.current = Date.now();
    }
  }, [currentTurnUserId]);

  // timerKey único conceptual para cancelar y reiniciar ante cualquier cambio de turno o deadline
  const timerKey = `${sessionId || 'session'}_${currentTurnUserId || 'user'}_${turnExpiresAt || 'expires'}_${version || '0'}`;

  useEffect(() => {
    timedOutRef.current = false;
  }, [timerKey]);

  useEffect(() => {
    const normalizedStatus = String(status || '').toLowerCase();
    const normalizedGameStatus = String(gameStatus || '').toLowerCase();
    
    // Solo ejecutar o pausar el temporizador según el estado jugable
    const terminalOrPausedStates = [
      'starting',
      'ready',
      'waiting',
      'finished',
      'cancelled',
      'settled',
      'completed',
      'abandoned',
      'match_ended',
      'round_reveal',
      'round_result',
      'round_won',
      'game_won',
      'draw',
    ];

    const isPausedOrInactive =
      terminalOrPausedStates.includes(normalizedStatus) ||
      terminalOrPausedStates.includes(normalizedGameStatus);

    if (isPausedOrInactive) {
      setRemaining(durationSeconds);
      return;
    }

    if (!turnExpiresAt) {
      setRemaining(durationSeconds);
      return;
    }

    const now = Date.now();
    const storedExpiresAt = new Date(turnExpiresAt).getTime();
    if (isNaN(storedExpiresAt)) {
      setRemaining(durationSeconds);
      return;
    }

    // Comprobar si el deadline es un remanente del turno anterior
    // Si el turno cambió hace menos de 3.5 segundos y el deadline ya venció,
    // se trata de una desincronización transitoria entre la rotación de turno y la llegada del nuevo deadline.
    const timeSinceTurnSwitch = now - turnSwitchTimestampRef.current;
    const isStaleDeadlineFromPreviousTurn = storedExpiresAt <= now && timeSinceTurnSwitch < 3500;

    if (isStaleDeadlineFromPreviousTurn) {
      console.log('[TURN_CLIENT_STALE_IGNORED]', {
        sessionId,
        currentTurnUserId,
        turnExpiresAt,
        serverNow: new Date().toISOString(),
        version: version || '0',
        sessionStatus: status,
        gameStatus,
        timeSinceTurnSwitch,
        reason: 'STALE_DEADLINE_TRANSITION',
        fallbackDuration: durationSeconds,
      });
      setRemaining(durationSeconds);
      return;
    }

    // Calcular segundos restantes reales basados en el timestamp autoritativo del servidor
    const timeLeft = Math.max(0, Math.ceil((storedExpiresAt - now) / 1000));
    setRemaining(timeLeft);

    console.log('[TURN_CLIENT_ARM]', {
      sessionId,
      currentTurnUserId,
      turnExpiresAt,
      serverNow: new Date().toISOString(),
      version: version || '0',
      sessionStatus: status,
      gameStatus,
      isMyTurn,
      timeLeft,
      timerKey,
    });

    // Si ya expiró legítimamente y no ha sido disparado para este timerKey específico
    if (timeLeft === 0) {
      if (!timedOutRef.current && lastFiredExpiresAtRef.current !== timerKey) {
        timedOutRef.current = true;
        lastFiredExpiresAtRef.current = timerKey;
        console.warn('[TURN_TIMEOUT_REQUEST]', {
          sessionId,
          currentTurnUserId,
          turnExpiresAt,
          serverNow: new Date().toISOString(),
          version: version || '0',
          sessionStatus: status,
          gameStatus,
          isMyTurn,
          action: isMyTurn ? 'TRIGGER_TIMEOUT' : 'WAIT_FOR_OPPONENT_TIMEOUT',
        });
        if (isMyTurn) {
          onTimeoutRef.current?.();
        } else {
          onOpponentTimeoutRef.current?.();
        }
      }
      return;
    }

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const left = Math.max(0, Math.ceil((storedExpiresAt - currentTime) / 1000));
      setRemaining(left);

      if (left === 0 && !timedOutRef.current) {
        timedOutRef.current = true;
        lastFiredExpiresAtRef.current = timerKey;
        clearInterval(interval);
        console.warn('[TURN_TIMEOUT_REQUEST]', {
          sessionId,
          currentTurnUserId,
          turnExpiresAt,
          serverNow: new Date().toISOString(),
          version: version || '0',
          sessionStatus: status,
          gameStatus,
          isMyTurn,
          action: isMyTurn ? 'TRIGGER_TIMEOUT' : 'WAIT_FOR_OPPONENT_TIMEOUT',
        });
        if (isMyTurn) {
          onTimeoutRef.current?.();
        } else {
          onOpponentTimeoutRef.current?.();
        }
      }
    }, 1000);

    return () => {
      console.log('[TURN_TIMER_CANCEL]', { timerKey, sessionId, currentTurnUserId });
      clearInterval(interval);
    };
  }, [timerKey, turnExpiresAt, currentTurnUserId, isMyTurn, durationSeconds, status, gameStatus, version, sessionId]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isWarning = remaining <= 5 && remaining > 0;
  const isTimeOut = remaining === 0;
  const formattedPlayerName = activePlayerName.trim().toUpperCase();

  return (
    <div
      id="turn-timer-container"
      className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl border transition-all ${
        isTimeOut
          ? 'bg-red-950/40 border-red-600/60 text-red-400'
          : isWarning
          ? 'bg-red-500/10 border-red-500/50 text-red-300 animate-pulse'
          : isMyTurn
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 shadow-sm'
          : 'bg-neutral-900/80 border-neutral-800 text-neutral-300'
      } ${className}`}
    >
      {/* Indicador de Turno */}
      <div className="flex items-center space-x-2 truncate mr-2">
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isTimeOut
              ? 'bg-red-500'
              : isMyTurn
              ? 'bg-emerald-400 animate-ping'
              : 'bg-amber-400'
          }`}
        />
        <span className="text-xs font-bold uppercase tracking-wider truncate">
          {isTimeOut
            ? '⏰ TIEMPO AGOTADO'
            : isMyTurn
            ? '🟢 TU TURNO'
            : `🔵 TURNO DE: ${formattedPlayerName}`}
        </span>
      </div>

      {/* Reloj Sincronizado */}
      <div
        className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border font-mono text-xs font-bold shrink-0 ${
          isTimeOut || isWarning
            ? 'bg-red-950 border-red-600 text-red-400'
            : 'bg-neutral-950 border-neutral-800 text-amber-400'
        }`}
      >
        {isWarning ? (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 animate-bounce" />
        ) : (
          <Clock className="w-3.5 h-3.5" />
        )}
        <span>{formattedTime}</span>
      </div>
    </div>
  );
};

export default TurnTimer;

