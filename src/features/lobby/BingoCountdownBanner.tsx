// ==============================================================================
// RASPANDO LA OLLA — BANNER DE CUENTA REGRESIVA BINGO (ULTRA-COMPACTO)
// Datos 100% reales en tiempo real (CERO simulaciones) y altura compacta
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Users, Ticket, Zap, Clock } from 'lucide-react';

interface BingoCountdownBannerProps {
  session?: any;
  activeTable?: any;
  onJoinTable?: (tableId: string) => void;
  onJoin?: (tableId: string) => void;
  onOpenBingo?: () => void;
}

export const BingoCountdownBanner: React.FC<BingoCountdownBannerProps> = ({
  session,
  activeTable,
  onJoinTable,
  onJoin,
  onOpenBingo,
}) => {
  const [minutes, setMinutes] = useState('--');
  const [seconds, setSeconds] = useState('--');
  const [hasActiveCountdown, setHasActiveCountdown] = useState(false);

  useEffect(() => {
    // Si hay una sesión real con timestamp objetivo de fin de cuenta regresiva
    if (session?.countdown_ends_at) {
      const updateRealTimer = () => {
        const now = Date.now();
        const target = new Date(session.countdown_ends_at).getTime();
        const diff = target - now;

        if (diff <= 0) {
          setMinutes('00');
          setSeconds('00');
          setHasActiveCountdown(true);
          return;
        }

        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setMinutes(mins.toString().padStart(2, '0'));
        setSeconds(secs.toString().padStart(2, '0'));
        setHasActiveCountdown(true);
      };

      updateRealTimer();
      const timer = setInterval(updateRealTimer, 1000);
      return () => clearInterval(timer);
    } else {
      // Sin cuenta regresiva activa en este instante: mostrar estado real de espera (CERO simulaciones)
      setHasActiveCountdown(false);
      setMinutes('--');
      setSeconds('--');
    }
  }, [session?.countdown_ends_at]);

  const rawTable = Array.isArray(session?.game_tables) ? session?.game_tables[0] : (session?.game_tables || activeTable);
  const tableId = rawTable?.id || session?.table_id || activeTable?.id;
  const entryFee = rawTable?.entry_fee || activeTable?.entry_fee || 25;

  // DATOS REALES DE BASE DE DATOS (CERO SIMULACIONES)
  const realPurchases = session?.bingo_card_purchases || [];
  const playersCount = realPurchases.length > 0
    ? new Set(realPurchases.map((p: any) => p.user_id)).size
    : (activeTable?.players_count ?? 0);
  const cardsCount = realPurchases.length > 0
    ? realPurchases.length
    : (activeTable?.cards_sold ?? 0);

  const handleAction = () => {
    if (onJoin) {
      onJoin(tableId || '');
    } else if (onJoinTable && tableId) {
      onJoinTable(tableId);
    } else if (onOpenBingo) {
      onOpenBingo();
    } else {
      const el = document.getElementById('section-bingo-virtual');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="bingo-royale-countdown-banner"
      aria-label="Sorteos de Bingo Iniciando Pronto"
      className="relative overflow-hidden rounded-2xl border border-purple-500/40 bg-gradient-to-r from-[#170E28] via-[#0E0C1C] to-[#170E28] px-3.5 py-3 sm:px-5 sm:py-3.5 shadow-lg mb-6 select-none"
    >
      {/* Destellos ambientales sutiles */}
      <div className="absolute -top-10 -left-10 w-32 h-32 bg-purple-600/15 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-3.5 sm:gap-4">
        
        {/* 1. TÍTULO COMPACTO Y ESTADO */}
        <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Clock className={`w-4 h-4 ${hasActiveCountdown ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400">
                  Sorteos Iniciando Pronto
                </h3>
                {hasActiveCountdown ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-[10px] font-black text-red-400 uppercase tracking-tight animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    EN CONTEO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-black text-emerald-400 uppercase tracking-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    SALA ABIERTA
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                {hasActiveCountdown
                  ? 'Sorteo en vivo por iniciar al terminar la cuenta'
                  : 'Cuenta de 2 min activa al unirse mín. 2 jugadores'}
              </p>
            </div>
          </div>
        </div>

        {/* 2. RELOJ DIGITAL LED COMPACTO + MÉTRICAS REALES + BOTÓN DE ACCIÓN */}
        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 flex-wrap w-full md:w-auto">
          {/* Display LED Digital */}
          <div className="bg-[#07050D] border border-amber-500/40 rounded-xl px-2.5 py-1 flex items-center gap-1 shadow-inner">
            <span className="font-mono font-black text-base sm:text-lg text-amber-400 tracking-wider">
              {minutes}:{seconds}
            </span>
          </div>

          {/* Estadísticas Reales (CERO simulaciones) */}
          <div className="flex items-center gap-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-1" title="Jugadores reales en sala">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-bold font-mono text-white">{playersCount}</span>
              <span className="text-[10px] text-slate-400 uppercase">jug.</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1" title="Cartones reales vendidos">
              <Ticket className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-bold font-mono text-white">{cardsCount}</span>
              <span className="text-[10px] text-slate-400 uppercase">cart.</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1" title="Costo de entrada">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold font-mono text-amber-400">{entryFee} Bs</span>
            </div>
          </div>

          {/* Botón Compacto */}
          <button
            id="btn-bingo-banner-join-now"
            onClick={handleAction}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>¡Unirse Ahora!</span>
          </button>
        </div>

      </div>
    </section>
  );
};
