// ==============================================================================
// RASPANDO LA OLLA — BANNER DE BINGO EN VIVO CON LUZ NEÓN BRILLANTE
// Soporta salas en vivo para 90 Bolas y 75 Bolas (25 Bs c/u)
// Contador agrandado, pozo neto sin el 10%, datos reales y vista separada para mesa activa
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Users, Ticket, Zap, Clock, Trophy, Plus, Sparkles } from 'lucide-react';

export interface BingoLiveRoomCardProps {
  variant: '90' | '75';
  title: string;
  subtitle: string;
  entryFee?: number;
  table?: any;
  session?: any;
  onJoinTable?: (tableId: string) => void;
  onCreateTable?: (variant: '90' | '75') => void;
}

export const BingoLiveRoomCard: React.FC<BingoLiveRoomCardProps> = ({
  variant,
  title,
  subtitle,
  entryFee = 25,
  table,
  session,
  onJoinTable,
  onCreateTable,
}) => {
  const [minutes, setMinutes] = useState('--');
  const [seconds, setSeconds] = useState('--');
  const [hasActiveCountdown, setHasActiveCountdown] = useState(false);

  // Detección de cuenta regresiva real de Supabase
  useEffect(() => {
    const countdownTarget = session?.countdown_ends_at || table?.config?.scheduled_start_at;

    if (countdownTarget) {
      const updateRealTimer = () => {
        const now = Date.now();
        const target = new Date(countdownTarget).getTime();
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
      setHasActiveCountdown(false);
      setMinutes('--');
      setSeconds('--');
    }
  }, [session?.countdown_ends_at, table?.config?.scheduled_start_at]);

  // Verificar si existe una mesa pública activa real para ingresar
  const isTableActive = Boolean(
    table?.id &&
    table.status !== 'FINISHED' &&
    table.status !== 'finished' &&
    table.status !== 'CLOSED' &&
    table.status !== 'closed'
  );

  // Estadísticas reales de jugadores y cartones
  const purchases = session?.bingo_card_purchases || [];
  const playersCount = purchases.length > 0
    ? new Set(purchases.map((p: any) => p.user_id)).size
    : Number(table?.players_count || table?.current_players_count || 0);

  const cardsCount = purchases.length > 0
    ? purchases.reduce((acc: number, p: any) => acc + (Number(p.card_count) || 1), 0)
    : Number(table?.cards_sold || 0);

  // Cálculo del Pozo Neto SIN contar el 10% (90% directo al ganador)
  const actualEntryFee = Number(table?.entry_fee || entryFee);
  const grossCollected = cardsCount * actualEntryFee;
  const recordedPrize = Number(session?.winner_prize_amount || 0);
  const netPrize = recordedPrize > 0
    ? recordedPrize
    : (grossCollected > 0 ? Math.round(grossCollected * 0.90 * 100) / 100 : 0);

  // Temas Neón según la variante
  const is90 = variant === '90';
  const neonBorderClass = is90
    ? 'border-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:border-amber-400'
    : 'border-cyan-400/60 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:border-cyan-400';

  const neonTitleGradient = is90
    ? 'from-amber-200 via-yellow-300 to-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.85)]'
    : 'from-cyan-200 via-sky-300 to-blue-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.85)]';

  const neonLedText = is90
    ? 'text-amber-300 drop-shadow-[0_0_16px_rgba(251,191,36,0.95)]'
    : 'text-cyan-300 drop-shadow-[0_0_16px_rgba(34,211,238,0.95)]';

  const neonLedBorder = is90
    ? 'border-amber-400/50 shadow-[inset_0_0_15px_rgba(0,0,0,0.85),0_0_15px_rgba(245,158,11,0.3)]'
    : 'border-cyan-400/50 shadow-[inset_0_0_15px_rgba(0,0,0,0.85),0_0_15px_rgba(6,182,212,0.3)]';

  const buttonGradient = is90
    ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 shadow-[0_0_18px_rgba(245,158,11,0.4)]'
    : 'bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 shadow-[0_0_18px_rgba(6,182,212,0.4)]';

  return (
    <div
      id={`bingo-live-room-${variant}`}
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-b from-[#130E22] via-[#0A0815] to-[#080611] p-3.5 sm:p-4 transition-all duration-300 flex flex-col justify-between ${neonBorderClass}`}
    >
      {/* Resplandores ambientales de fondo */}
      <div
        className={`absolute -top-10 -left-10 w-28 h-28 rounded-full blur-3xl pointer-events-none ${
          is90 ? 'bg-amber-500/15' : 'bg-cyan-500/15'
        }`}
      />
      <div
        className={`absolute -bottom-10 -right-10 w-28 h-28 rounded-full blur-3xl pointer-events-none ${
          is90 ? 'bg-purple-600/15' : 'bg-blue-600/15'
        }`}
      />

      {/* CABECERA: TÍTULO NEÓN BRILLANTE Y ESTADO */}
      <div className="relative z-10 mb-2.5 sm:mb-3">
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full animate-ping ${
                  isTableActive ? (hasActiveCountdown ? 'bg-red-400' : 'bg-emerald-400') : 'bg-slate-500'
                }`}
              />
              <h3 className={`text-sm sm:text-base font-black uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r ${neonTitleGradient}`}>
                {title}
              </h3>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium mt-0.5">
              {subtitle}
            </p>
          </div>

          {/* Badge de Estado */}
          {isTableActive ? (
            hasActiveCountdown ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-[9px] font-black text-red-300 uppercase tracking-tight animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                EN CONTEO
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-black text-emerald-300 uppercase tracking-tight shadow-[0_0_8px_rgba(16,185,129,0.4)] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                SALA ABIERTA
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700 text-[9px] font-black text-slate-400 uppercase tracking-tight shrink-0">
              SIN MESA ACTIVA
            </span>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VISTA A: CUANDO SE DETECTA UNA MESA PÚBLICA ACTIVA                     */}
      {/* ===================================================================== */}
      {isTableActive ? (
        <div className="relative z-10 flex flex-col gap-3">
          {/* Fila Central: Reloj Digital LED Agrandado + Pozo Neto 90% */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
            {/* Display LED Digital Compacto */}
            <div className={`bg-[#05040B] border-2 rounded-xl px-3 py-2 sm:py-2.5 text-center flex flex-col items-center justify-center ${neonLedBorder}`}>
              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">
                {hasActiveCountdown ? 'Tiempo para Sorteo' : 'Cuenta Regresiva'}
              </span>
              <span className={`text-2xl sm:text-3xl lg:text-4xl font-mono font-black tracking-widest ${neonLedText}`}>
                {minutes}:{seconds}
              </span>
              <span className="text-[8px] font-mono tracking-widest text-slate-500 mt-0.5">
                {hasActiveCountdown ? 'MINUTOS : SEGUNDOS' : 'Inicia 3 min con 2 jugadores'}
              </span>
            </div>

            {/* Tarjeta de Pozo Neto (90% directo al ganador) */}
            <div className="bg-[#0B0915] border border-amber-500/40 rounded-xl p-2.5 flex flex-col justify-between shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-400/90 flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  Pozo Neto (90%)
                </span>
                <span className="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                  Sin el 10%
                </span>
              </div>
              <div className="my-1">
                <div className="text-xl sm:text-2xl font-black font-mono text-white tracking-tight">
                  {netPrize.toFixed(2)}{' '}
                  <span className="text-xs font-bold text-amber-400">Bs</span>
                </div>
              </div>
              <p className="text-[9px] text-slate-400 font-medium">
                {cardsCount > 0
                  ? `Acumulado por ${cardsCount} cartones vendidos`
                  : 'Se acumula con cada cartón comprado'}
              </p>
            </div>
          </div>

          {/* Estadísticas Reales de la Mesa */}
          <div className="grid grid-cols-3 gap-1.5 bg-[#090712]/80 border border-slate-800/80 rounded-lg p-2 text-center">
            <div>
              <div className="text-[9px] text-slate-400 uppercase font-bold flex items-center justify-center gap-1">
                <Users className="w-2.5 h-2.5 text-purple-400" />
                Jugadores
              </div>
              <p className="text-xs sm:text-sm font-mono font-black text-white mt-0.5">
                {playersCount}
              </p>
            </div>
            <div className="border-x border-slate-800">
              <div className="text-[9px] text-slate-400 uppercase font-bold flex items-center justify-center gap-1">
                <Ticket className="w-2.5 h-2.5 text-purple-400" />
                Cartones
              </div>
              <p className="text-xs sm:text-sm font-mono font-black text-white mt-0.5">
                {cardsCount}
              </p>
            </div>
            <div>
              <div className="text-[9px] text-slate-400 uppercase font-bold flex items-center justify-center gap-1">
                <Zap className="w-2.5 h-2.5 text-amber-400" />
                Entrada
              </div>
              <p className="text-xs sm:text-sm font-mono font-black text-amber-400 mt-0.5">
                {actualEntryFee} Bs
              </p>
            </div>
          </div>

          {/* Botón de Ingreso a la Mesa Activa */}
          <button
            id={`btn-join-bingo-${variant}-live`}
            onClick={() => table?.id && onJoinTable && onJoinTable(table.id)}
            className={`w-full py-2 sm:py-2.5 px-3 rounded-lg text-slate-950 font-bold text-xs uppercase tracking-wider transition-all transform active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${buttonGradient}`}
          >
            <Zap className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
            <span>¡Ingresar a la Sala ({variant} Bolas)!</span>
          </button>
        </div>
      ) : (
        /* ===================================================================== */
        /* VISTA B: CUANDO NO SE DETECTA NINGUNA MESA PÚBLICA ACTIVA             */
        /* ===================================================================== */
        <div className="relative z-10 flex flex-col justify-between gap-3 py-0.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
            {/* Display Standby Compacto */}
            <div className="bg-[#05040B] border-2 border-slate-800 rounded-xl px-3 py-2 sm:py-2.5 text-center flex flex-col items-center justify-center shadow-inner">
              <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-0.5">
                Temporizador
              </span>
              <span className="text-2xl sm:text-3xl lg:text-4xl font-mono font-black tracking-widest text-slate-600">
                03:00
              </span>
              <span className="text-[8px] font-mono tracking-widest text-slate-500 mt-0.5">
                LISTO PARA INICIAR
              </span>
            </div>

            {/* Información de apertura */}
            <div className="bg-[#0B0915] border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Sala en Espera
              </span>
              <div className="my-0.5">
                <p className="text-[11px] text-slate-300 font-medium leading-relaxed">
                  No hay una mesa pública activa en este momento.
                </p>
                <p className="text-[10px] text-amber-400/90 font-bold mt-0.5">
                  Cartón: {entryFee} Bs • Pozo Neto: 90%
                </p>
              </div>
              <span className="text-[9px] text-slate-500 font-medium">
                La cuenta regresiva iniciará al haber 2 jugadores.
              </span>
            </div>
          </div>

          {/* Botón para Abrir la Sala */}
          <button
            id={`btn-create-bingo-${variant}-lobby`}
            onClick={() => onCreateTable && onCreateTable(variant)}
            className="w-full py-2 sm:py-2.5 px-3 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all transform active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(147,51,234,0.35)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Abrir Sala {variant} Bolas ({entryFee} Bs)</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ==============================================================================
// CONTENEDOR PRINCIPAL: RENDERIZA AMBAS SALAS EN PARALELO (90 Y 75 BOLAS)
// ==============================================================================
interface BingoCountdownBannerProps {
  session?: any;
  activeTable?: any;
  tables?: any[];
  sessions?: any[];
  onJoinTable?: (tableId: string) => void;
  onJoin?: (tableId: string) => void;
  onCreateTable?: (variant: '90' | '75') => void;
  onOpenBingo?: () => void;
}

export const BingoCountdownBanner: React.FC<BingoCountdownBannerProps> = ({
  session,
  activeTable,
  tables = [],
  sessions = [],
  onJoinTable,
  onJoin,
  onCreateTable,
  onOpenBingo,
}) => {
  const handleJoin = (tableId: string) => {
    if (onJoin) {
      onJoin(tableId);
    } else if (onJoinTable) {
      onJoinTable(tableId);
    } else if (onOpenBingo) {
      onOpenBingo();
    }
  };

  // Encontrar mesa activa de 90 bolas
  const table90 = tables.find(
    (t) => (t.game_variant === '90' || t.config?.variant === '90') && t.status !== 'FINISHED' && t.status !== 'finished'
  ) || (activeTable?.game_variant === '90' ? activeTable : null);

  // Encontrar mesa activa de 75 bolas
  const table75 = tables.find(
    (t) => (t.game_variant === '75' || t.config?.variant === '75') && t.status !== 'FINISHED' && t.status !== 'finished'
  ) || (activeTable?.game_variant === '75' ? activeTable : null);

  // Encontrar sesión correspondiente a 90 bolas
  const session90 = sessions.find(
    (s) => s.table_id === table90?.id || s.game_tables?.game_variant === '90'
  ) || (table90?.game_sessions?.[0] || table90?.game_sessions || (session?.game_tables?.game_variant === '90' ? session : null));

  // Encontrar sesión correspondiente a 75 bolas
  const session75 = sessions.find(
    (s) => s.table_id === table75?.id || s.game_tables?.game_variant === '75'
  ) || (table75?.game_sessions?.[0] || table75?.game_sessions || (session?.game_tables?.game_variant === '75' ? session : null));

  return (
    <section
      id="bingo-live-rooms-container"
      aria-label="Salas de Bingo en Vivo"
      className="mb-5 sm:mb-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
        {/* ELEMENTO 1: SALA BINGO 90 BOLAS (25 BS) */}
        <BingoLiveRoomCard
          variant="90"
          title="⚡ BINGO EN VIVO 90 BOLAS"
          subtitle="SALA TRADICIONAL • CARTÓN LLENO"
          entryFee={25}
          table={table90}
          session={session90}
          onJoinTable={handleJoin}
          onCreateTable={onCreateTable}
        />

        {/* ELEMENTO 2: SALA BINGO 75 BOLAS (25 BS) */}
        <BingoLiveRoomCard
          variant="75"
          title="🔥 BINGO EN VIVO 75 BOLAS"
          subtitle="SALA PATRONES Y LÍNEAS • 2 PREMIOS"
          entryFee={25}
          table={table75}
          session={session75}
          onJoinTable={handleJoin}
          onCreateTable={onCreateTable}
        />
      </div>
    </section>
  );
};
