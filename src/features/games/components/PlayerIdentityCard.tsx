// ==============================================================================
// RASPANDO LA OLLA — TARJETA DE IDENTIDAD DEL JUGADOR (FOTO GOOGLE, NOMBRE, VIDAS)
// Especificación de Arquitectura Secciones 2 & 26
// ==============================================================================

import React from 'react';
import { motion } from 'motion/react';
import { Heart, HeartOff, User, Trophy } from 'lucide-react';

interface PlayerIdentityCardProps {
  displayName: string;
  avatarUrl?: string | null;
  lives?: number; // 0..3
  maxLives?: number;
  victories?: number;
  score?: number;
  isCurrentTurn?: boolean;
  isUser?: boolean;
  isOnline?: boolean;
  seatNumber?: number;
  className?: string;
}

export const PlayerIdentityCard: React.FC<PlayerIdentityCardProps> = ({
  displayName,
  avatarUrl,
  lives = 3,
  maxLives = 3,
  victories = 0,
  score,
  isCurrentTurn = false,
  isUser = false,
  isOnline = true,
  seatNumber,
  className = '',
}) => {
  const currentLives = Math.max(0, Math.min(maxLives, lives));
  const nameToDisplay = displayName?.trim() || 'Jugador';
  const initialLetter = nameToDisplay.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative p-3 rounded-2xl border transition-all ${
        isCurrentTurn
          ? 'bg-amber-950/40 border-amber-500/80 shadow-lg shadow-amber-500/10 ring-2 ring-amber-500/30'
          : isUser
          ? 'bg-slate-900/90 border-slate-700/80'
          : 'bg-slate-950/90 border-slate-800/80'
      } ${className}`}
    >
      {/* Indicador de Turno Activo */}
      {isCurrentTurn && (
        <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider animate-pulse shadow-md">
          Turno Activo
        </span>
      )}

      <div className="flex items-center space-x-3">
        {/* Contenedor de Fotografía de Perfil con Indicador de Estado En Línea */}
        <div className="relative shrink-0">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-slate-800 border-2 border-slate-700/80 flex items-center justify-center shadow-md">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={nameToDisplay}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Fallback si la imagen no carga
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-600 to-amber-800 text-white font-black text-lg flex items-center justify-center font-mono">
                {initialLetter || <User className="w-5 h-5 text-slate-300" />}
              </div>
            )}
          </div>

          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${
              isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
            }`}
            title={isOnline ? 'En línea' : 'Desconectado'}
          />
        </div>

        {/* Datos Identificadores: Nombre Real de Google, Vidas y Victorias */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-1">
            <h4 className="text-xs sm:text-sm font-black text-slate-100 uppercase tracking-tight truncate">
              {nameToDisplay}
            </h4>
            {seatNumber !== undefined && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                #{seatNumber}
              </span>
            )}
          </div>

          {/* Fila de Vidas (3 Corazones) y Victorias */}
          <div className="flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center space-x-1" title={`${currentLives} de ${maxLives} vidas`}>
              {Array.from({ length: maxLives }).map((_, idx) => {
                const isAlive = idx < currentLives;
                return (
                  <motion.div
                    key={idx}
                    animate={isAlive ? { scale: [1, 1.1, 1] } : { scale: 0.85 }}
                    transition={{ duration: 0.3 }}
                  >
                    {isAlive ? (
                      <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500 drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]" />
                    ) : (
                      <HeartOff className="w-3.5 h-3.5 text-slate-600 opacity-40" />
                    )}
                  </motion.div>
                );
              })}
            </div>

            <div className="flex items-center space-x-1 text-amber-400 font-bold">
              <Trophy className="w-3 h-3 text-amber-400" />
              <span>
                {score !== undefined ? `${score} pts` : `Vict. ${victories}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
