// ==============================================================================
// RASPANDO LA OLLA — COMPONENTE DE TEMPORIZADOR DE TURNO SINCRONIZADO
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Clock, AlertTriangle } from 'lucide-react';

interface TurnTimerProps {
  turnExpiresAt?: string;
  durationSeconds?: number; // Default 30s
  isMyTurn: boolean;
  activePlayerName?: string;
  status?: string;
  onTimeout?: () => void;
  className?: string;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({
  turnExpiresAt,
  durationSeconds = 30,
  isMyTurn,
  activePlayerName = 'Opónente',
  status = 'playing',
  onTimeout,
  className = '',
}) => {
  const [remaining, setRemaining] = useState<number>(durationSeconds);
  const timedOutRef = React.useRef(false);

  useEffect(() => {
    timedOutRef.current = false;
  }, [turnExpiresAt]);

  useEffect(() => {
    const normalizedStatus = String(status || '').toLowerCase();
    // No consumir tiempo competitivo durante fases previas a jugar o fases terminales
    const isPausedOrInactive = [
      'starting',
      'ready',
      'waiting',
      'finished',
      'cancelled',
      'settled',
      'completed',
      'abandoned',
      'match_ended',
    ].includes(normalizedStatus);

    if (isPausedOrInactive) {
      setRemaining(durationSeconds);
      return;
    }

    if (!turnExpiresAt) {
      setRemaining(durationSeconds);
      return;
    }

    const deadline = new Date(turnExpiresAt).getTime();
    if (isNaN(deadline)) {
      setRemaining(durationSeconds);
      return;
    }

    const now = Date.now();
    const initialTimeLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
    setRemaining(initialTimeLeft);

    // Si ya expiró al montar, disparar timeout inmediatamente
    if (initialTimeLeft === 0 && !timedOutRef.current) {
      timedOutRef.current = true;
      console.warn('[TURN_TIMER] Tiempo ya expirado al montar, disparando timeout');
      onTimeout?.();
      return;
    }

    const interval = setInterval(() => {
      const currentTime = Date.now();
      const left = Math.max(0, Math.ceil((deadline - currentTime) / 1000));
      setRemaining(left);

      if (left === 0 && !timedOutRef.current) {
        timedOutRef.current = true;
        clearInterval(interval);
        console.warn('[TURN_TIMER] Tiempo agotado, disparando timeout');
        onTimeout?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [turnExpiresAt, durationSeconds, status, onTimeout]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isWarning = remaining <= 5 && remaining > 0;
  const isTimeOut = remaining === 0;

  const formattedPlayerName = activePlayerName.trim().toUpperCase();

  return (
    <div
      id="turn-timer-container"
      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
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
