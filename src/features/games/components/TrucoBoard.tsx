// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: TRUCO VENEZOLANO 2.0
// ==============================================================================
// Baraja Española vectorizada de alta fidelidad, sistema completo de cantos
// en tiempo real y panel de toma de decisiones integrado.
// ==============================================================================

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Sparkles, AlertTriangle, Check, X, ShieldAlert, Timer, Users } from 'lucide-react';
import type { TrucoState, TrucoCard, TrucoSuit } from '../../../types/games';
import { TrucoEngine } from '../engines/TrucoEngine';

// ==============================================================================
// COMPONENTES VECTORIALES — PALOS DE LA BARAJA ESPAÑOLA
// ==============================================================================

const EspadaSvg: React.FC<{ className?: string }> = ({ className = "w-14 h-14" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 10L56 32H44L50 10Z" fill="#94A3B8" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M50 32V75" stroke="#475569" strokeWidth="7" strokeLinecap="round" />
    <path d="M30 75H70" stroke="#1E293B" strokeWidth="5" strokeLinecap="round" />
    <path d="M50 75V88" stroke="#0F172A" strokeWidth="8" strokeLinecap="round" />
    <path d="M50 10L52.5 32H47.5L50 10Z" fill="#F1F5F9" />
  </svg>
);

const BastoSvg: React.FC<{ className?: string }> = ({ className = "w-14 h-14" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M44 82L47 18H53L56 82L44 82Z" fill="#854D0E" stroke="#0F172A" strokeWidth="2.5" />
    <circle cx="47" cy="20" r="7" fill="#10B981" stroke="#047857" strokeWidth="1.5" />
    <circle cx="53" cy="45" r="6" fill="#059669" stroke="#047857" strokeWidth="1.5" />
    <circle cx="46" cy="65" r="8" fill="#10B981" stroke="#047857" strokeWidth="1.5" />
    <path d="M40 82H60" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />
  </svg>
);

const OroSvg: React.FC<{ className?: string }> = ({ className = "w-14 h-14" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="34" fill="#F59E0B" stroke="#78350F" strokeWidth="3" />
    <circle cx="50" cy="50" r="26" stroke="#FEF08A" strokeWidth="1.5" strokeDasharray="5 3" />
    <circle cx="50" cy="50" r="16" fill="#D97706" stroke="#78350F" strokeWidth="2" />
    <path d="M50 22L54 36L68 40L55 48L58 62L50 53L42 62L45 48L32 40L46 36Z" fill="#FDE047" />
  </svg>
);

const CopaSvg: React.FC<{ className?: string }> = ({ className = "w-14 h-14" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M32 20H68L62 52H38L32 20Z" fill="#DC2626" stroke="#450A0A" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M45 52V76H55V52" fill="#D97706" stroke="#450A0A" strokeWidth="2.5" />
    <path d="M26 76H74" stroke="#450A0A" strokeWidth="5" strokeLinecap="round" />
    <path d="M38 28H62" stroke="#FBBF24" strokeWidth="2.5" />
    <circle cx="50" cy="40" r="5" fill="#FBBF24" />
  </svg>
);

const SuitSymbol: React.FC<{ suit: TrucoSuit; className?: string }> = ({ suit, className }) => {
  switch (suit) {
    case 'espadas': return <EspadaSvg className={className} />;
    case 'bastos': return <BastoSvg className={className} />;
    case 'oros': return <OroSvg className={className} />;
    case 'copas': return <CopaSvg className={className} />;
  }
};

const getSuitEmoji = (suit: string) => {
  switch (suit) {
    case 'espadas': return '🗡️';
    case 'bastos': return '🪵';
    case 'oros': return '🪙';
    case 'copas': return '🍷';
    default: return '🃏';
  }
};

// ==============================================================================
// COMPONENTE: TRUCO CARD VISUAL (REDISEÑO BARAJA ESPAÑOLA)
// ==============================================================================

interface TrucoCardVisualProps {
  card: TrucoCard;
  isRival?: boolean;
  isSmall?: boolean;
}

const TrucoCardVisual: React.FC<TrucoCardVisualProps> = ({ card, isRival = false, isSmall = false }) => {
  if (isRival || card.id.startsWith('hidden_')) {
    // Reverso decorado tradicional
    return (
      <div className={`rounded-xl border-2 border-neutral-800 shadow-xl bg-gradient-to-br from-red-800 to-rose-950 p-2 flex flex-col items-center justify-between relative ${isSmall ? 'w-14 h-20' : 'w-24 h-36 md:w-28 md:h-40'}`}>
        <div className="absolute inset-1.5 border border-red-500/40 rounded-lg bg-opacity-20 flex items-center justify-center overflow-hidden">
          {/* Patrón reticulado geométrico elegante */}
          <div className="w-full h-full opacity-30 bg-[radial-gradient(#f43f5e_1px,transparent_1px)] [background-size:12px_12px]" />
          <div className="absolute w-8 h-8 md:w-10 md:h-10 border-2 border-amber-500/40 rotate-45 flex items-center justify-center">
            <div className="w-4 h-4 border border-amber-400/30" />
          </div>
        </div>
      </div>
    );
  }

  // Anverso (Bara Española Marfil)
  return (
    <div className={`rounded-xl border-2 border-neutral-800 bg-[#FAF6EE] text-neutral-900 shadow-2xl p-2.5 flex flex-col justify-between relative overflow-hidden select-none transition-all ${
      isSmall ? 'w-14 h-20' : 'w-24 h-36 md:w-28 md:h-40'
    } ${card.isPerico || card.isPerica ? 'ring-4 ring-amber-500 border-amber-600' : ''}`}>
      
      {/* Indicador de Piezas Especiales */}
      {card.isPerico && (
        <span className="absolute top-1 right-1 bg-amber-500 text-neutral-950 text-[8px] md:text-[9px] px-1.5 py-0.5 rounded-full font-black tracking-wider animate-pulse shadow-md z-10">
          PERICO
        </span>
      )}
      {card.isPerica && (
        <span className="absolute top-1 right-1 bg-purple-600 text-white text-[8px] md:text-[9px] px-1.5 py-0.5 rounded-full font-black tracking-wider animate-pulse shadow-md z-10">
          PERICA
        </span>
      )}

      {/* Esquina superior izquierda */}
      <div className="flex flex-col items-start leading-none">
        <span className={`font-black tracking-tight ${isSmall ? 'text-xs' : 'text-lg md:text-xl'}`}>{card.number}</span>
        <span className={`${isSmall ? 'text-[9px]' : 'text-xs md:text-sm'}`}>{getSuitEmoji(card.suit)}</span>
      </div>

      {/* Símbolo central */}
      <div className="flex items-center justify-center flex-1 my-1">
        <SuitSymbol suit={card.suit} className={isSmall ? 'w-8 h-8' : 'w-12 h-12 md:w-16 md:h-16 drop-shadow-md'} />
      </div>

      {/* Esquina inferior derecha (Rotada) */}
      <div className="flex flex-col items-start leading-none rotate-180 self-end">
        <span className={`font-black tracking-tight ${isSmall ? 'text-xs' : 'text-lg md:text-xl'}`}>{card.number}</span>
        <span className={`${isSmall ? 'text-[9px]' : 'text-xs md:text-sm'}`}>{getSuitEmoji(card.suit)}</span>
      </div>
    </div>
  );
};

// ==============================================================================
// COMPONENTE PRINCIPAL: TRUCO BOARD
// ==============================================================================

interface TrucoBoardProps {
  state: TrucoState;
  currentUserId: string;
  onPlayCard: (cardId: string) => void;
  onCanto: (cantoType: string) => void;
  onRespondCanto?: (response: string) => void;
}

export const TrucoBoard: React.FC<TrucoBoardProps> = ({
  state,
  currentUserId,
  onPlayCard,
  onCanto,
}) => {
  const isMyTurn = state.turnUserId === currentUserId && state.status === 'playing';
  const myHand = state.hands[currentUserId] || [];
  const currentTrick = state.playedTricks[state.playedTricks.length - 1];

  // Identificar oponente para visualización
  const opponentUserId = state.playerOrder.find((uId) => uId !== currentUserId) || '';
  const opponentHandCount = state.hands[opponentUserId]?.length || 0;

  // Analizar canto pendiente
  const { pendingCanto, envidoStatus, trucoStatus, florStatus, lastCantoBy } = (state.cantoState as any);
  const isCantoPendingForMe = pendingCanto && pendingCanto.respondByUserId === currentUserId;

  const engine = useMemo(() => new TrucoEngine(), []);

  // Verificar si poseo Flor para habilitar el botón
  const hasMyFlor = useMemo(() => {
    return engine.hasFlor(myHand, state.vira);
  }, [myHand, state.vira, engine]);

  // Manejar respuesta de canto mapeando al llamador de handleGameAction ('RESPOND_CANTO')
  const handleRespond = (response: string) => {
    if (onCanto) {
      onCanto(response); // La callback de onCanto en el GameContainer enruta tanto cantos como respuestas
    }
  };

  return (
    <div id="truco-board-master" className="flex flex-col items-center justify-between p-4 max-w-3xl mx-auto w-full min-h-[550px] space-y-4">
      
      {/* 1. MARCADOR DE PIEDRAS / PUNTOS (PULSOplay Luxury style) */}
      <div id="truco-scoreboard-luxury" className="grid grid-cols-2 gap-4 w-full">
        {state.playerOrder.map((uId) => {
          const isPlayerActive = state.turnUserId === uId && state.status === 'playing';
          const points = state.points[uId] || 0;
          return (
            <div
              key={uId}
              id={`truco-p-card-${uId}`}
              className={`p-3.5 rounded-2xl border transition-all duration-300 relative ${
                isPlayerActive
                  ? 'bg-amber-500/10 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/40'
                  : 'bg-neutral-900/80 border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-neutral-100 truncate block max-w-[120px]">
                      {state.playerNames[uId] || 'Jugador'}
                    </span>
                    {uId === currentUserId && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold border border-amber-500/20">
                        TÚ
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono mt-0.5 block">
                    {state.hands[uId]?.length || 0} cartas en mano
                  </span>
                </div>
                
                {/* Visualización de Piedras / Tantos */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-wrap gap-0.5 max-w-[40px] items-center justify-end">
                    {/* Generar visualizaciones de palitos de 5 puntos (Piedras de Truco) */}
                    {Array.from({ length: Math.min(12, points) }).map((_, i) => (
                      <span key={i} className="w-1.5 h-3.5 bg-amber-500 rounded-sm inline-block shadow-sm" />
                    ))}
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-white font-mono leading-none">
                      {points}
                    </span>
                    <span className="text-[9px] text-neutral-500 block font-mono leading-none mt-1">
                      /{state.targetPoints} Tantos
                    </span>
                  </div>
                </div>
              </div>

              {/* Halo indicador de Turno */}
              {isPlayerActive && (
                <div className="absolute -bottom-1 left-4 right-4 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent rounded-full animate-pulse" />
              )}
            </div>
          );
        })}
      </div>

      {/* 2. MAZO DE CARTAS DEL RIVAL (OCULTAS) */}
      <div id="truco-rival-hand" className="flex items-center justify-center space-x-1.5 opacity-80 scale-90">
        {Array.from({ length: opponentHandCount }).map((_, idx) => (
          <TrucoCardVisual key={idx} card={{ id: `hidden_${idx}`, number: 1, suit: 'espadas' }} isRival={true} isSmall={true} />
        ))}
      </div>

      {/* 3. TAPETE DE FIELTRO MAESTRO (MESA CENTRAL) */}
      <div
        id="truco-felt-table"
        className="w-full flex-1 min-h-[250px] rounded-3xl bg-radial from-emerald-900 to-emerald-950 border-4 border-amber-900/60 p-4 flex flex-col md:flex-row items-center justify-around relative shadow-2xl space-y-4 md:space-y-0"
      >
        {/* Decoración del felt */}
        <div className="absolute inset-2 border border-emerald-500/20 rounded-2xl pointer-events-none" />

        {/* VIRA (Muestra autoritativa) */}
        <div className="flex flex-col items-center z-10">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-400 mb-1.5 drop-shadow">
            VIRA (Muestra)
          </span>
          <div className="relative group">
            <div className="absolute -inset-1 rounded-2xl bg-amber-400/20 blur opacity-60 group-hover:opacity-100 transition duration-500" />
            <TrucoCardVisual card={state.vira} />
          </div>
        </div>

        {/* BAZA DE JUEGO ACTUAL */}
        <div className="flex flex-col items-center justify-center min-w-[200px] z-10">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-neutral-300 mb-2">
            BAZA {state.playedTricks.length} ({state.trickWinners.length} resueltas)
          </span>

          <div className="flex space-x-3 min-h-[110px] items-center justify-center p-3 rounded-2xl bg-black/25 border border-white/5 w-full">
            {currentTrick?.cards.length === 0 ? (
              <div className="text-center py-4 flex flex-col items-center justify-center">
                <Timer className="w-5 h-5 text-emerald-400/50 animate-pulse mb-1" />
                <span className="text-xs text-emerald-300/40 font-mono tracking-tight">Mesa limpia. Esperando jugada...</span>
              </div>
            ) : (
              <AnimatePresence>
                {currentTrick?.cards.map(({ userId, card }) => (
                  <motion.div
                    key={card.id}
                    initial={{ y: 30, scale: 0.8, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="flex flex-col items-center space-y-1"
                  >
                    <TrucoCardVisual card={card} isSmall={true} />
                    <span className="text-[10px] font-bold text-neutral-300 bg-black/40 px-2 py-0.5 rounded-full border border-white/5 truncate max-w-[80px]">
                      {state.playerNames[userId] || 'Jugador'}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Historial rápido de bazas ganadas */}
          {state.trickWinners.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 bg-black/35 px-3 py-1 rounded-full border border-white/5">
              {state.trickWinners.map((wId, i) => (
                <div key={i} className="flex items-center gap-1 text-[9px] font-mono">
                  <span className="text-neutral-400">B{i+1}:</span>
                  <span className={wId === currentUserId ? 'text-amber-400 font-bold' : wId ? 'text-rose-400' : 'text-neutral-400'}>
                    {wId === currentUserId ? 'Tú' : wId ? 'Rival' : 'Parda'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TOAST / ALERTA DE CANTOS RECIENTES */}
        {lastCantoBy && !pendingCanto && (
          <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 bg-black/85 border border-amber-500/30 text-amber-300 text-xs px-4 py-1.5 rounded-full shadow-lg font-bold flex items-center space-x-1.5 z-20">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Última jugada por: {state.playerNames[lastCantoBy]}</span>
          </div>
        )}
      </div>

      {/* 4. PANEL INTERACTIVO DE CANTOS (MÁQUINA DE ESTADOS EN TIEMPO REAL) */}
      <AnimatePresence mode="wait">
        {isCantoPendingForMe ? (
          // ====================================================================
          // RIVAL ME HA CANTADO: PANEL DE DECISIONES SOBERANO (RESPUESTAS)
          // ====================================================================
          <motion.div
            key="response-panel"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full bg-slate-950 border-2 border-red-500/40 rounded-3xl p-5 shadow-[0_0_30px_rgba(239,68,68,0.15)] flex flex-col items-center justify-center space-y-4 z-30"
          >
            <div className="flex items-center gap-2.5 text-red-400">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-bounce" />
              <h3 className="text-sm font-black uppercase tracking-wider">
                Te han cantado: {pendingCanto.cantoType}
              </h3>
            </div>
            
            <p className="text-xs text-neutral-300 text-center leading-relaxed">
              Propuesto por <span className="text-amber-400 font-bold">{state.playerNames[pendingCanto.calledByUserId!]}</span>. 
              Si aceptas, se juegan <span className="text-emerald-400 font-black">{pendingCanto.pointsIfAccepted} puntos</span>. 
              Si te achicas, el rival se lleva <span className="text-red-400 font-black">{pendingCanto.pointsIfDeclined} punto(s)</span>.
            </p>

            {/* BOTONES DE RESPUESTA DIRECTA */}
            <div className="flex flex-wrap gap-3 items-center justify-center w-full">
              <button
                onClick={() => handleRespond('QUIERO')}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs uppercase shadow-lg shadow-emerald-950/40 transition-all active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>¡Quiero!</span>
              </button>

              <button
                onClick={() => handleRespond('NO_QUIERO')}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs uppercase shadow-lg shadow-rose-950/40 transition-all active:scale-95 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>No Quiero</span>
              </button>

              {/* ESCALACIONES / CONTRACANTOS DISPONIBLES */}
              {pendingCanto.cantoType === 'ENVIDO' && (
                <>
                  <button
                    onClick={() => onCanto('REAL_ENVIDO')}
                    className="px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all active:scale-95"
                  >
                    Envido Envido (+3 pts)
                  </button>
                  <button
                    onClick={() => onCanto('FALTA_ENVIDO')}
                    className="px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-black transition-all active:scale-95"
                  >
                    ¡Falta Envido!
                  </button>
                </>
              )}

              {pendingCanto.cantoType === 'REAL_ENVIDO' && (
                <button
                  onClick={() => onCanto('FALTA_ENVIDO')}
                  className="px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-black transition-all active:scale-95"
                >
                  ¡Falta Envido!
                </button>
              )}

              {pendingCanto.cantoType === 'FLOR' && (
                <>
                  <button
                    onClick={() => onCanto('CONTRA_FLOR')}
                    className="px-4 py-2.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded-xl text-xs font-bold transition-all active:scale-95"
                  >
                    Contra-Flor
                  </button>
                  <button
                    onClick={() => onCanto('CONTRA_FLOR_AL_RESTO')}
                    className="px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-black transition-all active:scale-95"
                  >
                    Contra-Flor al Resto
                  </button>
                </>
              )}

              {pendingCanto.cantoType === 'TRUCO' && (
                <button
                  onClick={() => onCanto('RETRUCO')}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-red-400" />
                  <span>Quiero Retruco (6 pts)</span>
                </button>
              )}

              {pendingCanto.cantoType === 'RETRUCO' && (
                <button
                  onClick={() => onCanto('VALE_CUATRO')}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                  <span>Quiero Vale Cuatro (9 pts)</span>
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          // ====================================================================
          // MI TURNO NORMAL: ACCIONES DE CANTO (PROPOSICIÓN)
          // ====================================================================
          isMyTurn && (
            <motion.div
              key="canto-actions"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="flex flex-wrap gap-2.5 justify-center w-full bg-neutral-900/40 p-2.5 rounded-2xl border border-neutral-800"
            >
              {/* Botón de Envido (sólo en 1ra baza antes de jugar cartas) */}
              {state.playedTricks.length === 1 && currentTrick?.cards.length < 2 && envidoStatus === 'NONE' && (
                <>
                  <button
                    onClick={() => onCanto('ENVIDO')}
                    className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-extrabold shadow transition-all active:scale-95 cursor-pointer"
                  >
                    Envido (2 pts)
                  </button>

                  <button
                    onClick={() => onCanto('REAL_ENVIDO')}
                    className="px-4 py-2 bg-amber-600/10 hover:bg-amber-600/20 text-amber-300 border border-amber-600/30 rounded-xl text-xs font-extrabold shadow transition-all active:scale-95 cursor-pointer"
                  >
                    Real Envido (3 pts)
                  </button>

                  <button
                    onClick={() => onCanto('FALTA_ENVIDO')}
                    className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-black shadow transition-all active:scale-95 cursor-pointer"
                  >
                    Falta Envido
                  </button>
                </>
              )}

              {/* Botón de Flor (si califica y es primera baza) */}
              {state.playedTricks.length === 1 && currentTrick?.cards.length < 2 && florStatus === 'NONE' && hasMyFlor && (
                <button
                  onClick={() => onCanto('FLOR')}
                  className="px-4 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow transition-all active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>¡Cantar Flor!</span>
                </button>
              )}

              {/* Botón de Truco (escalado de puntos) */}
              {trucoStatus === 'NONE' && (
                <button
                  onClick={() => onCanto('TRUCO')}
                  className="px-5 py-2 bg-red-600/15 hover:bg-red-600/25 text-red-300 border border-red-500/30 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow transition-all active:scale-95 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-red-400" />
                  <span>¡Truco! (3 pts)</span>
                </button>
              )}

              {state.cantoState.trucoPoints === 3 && (
                <button
                  onClick={() => onCanto('RETRUCO')}
                  className="px-5 py-2 bg-red-700/20 hover:bg-red-700/30 text-red-300 border border-red-600/40 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow transition-all active:scale-95 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                  <span>¡Retruco! (6 pts)</span>
                </button>
              )}

              {state.cantoState.trucoPoints === 6 && (
                <button
                  onClick={() => onCanto('VALE_CUATRO')}
                  className="px-5 py-2 bg-red-800/25 hover:bg-red-800/35 text-red-400 border border-red-600/50 rounded-xl text-xs font-black flex items-center space-x-1.5 shadow transition-all active:scale-95 cursor-pointer"
                >
                  <Flame className="w-4 h-4 text-red-500 animate-pulse" />
                  <span>¡Vale Cuatro! (9 pts)</span>
                </button>
              )}
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* 5. CARTAS EN MANO PROPIAS DEL JUGADOR */}
      <div id="truco-player-hand" className="w-full bg-neutral-900/95 border border-neutral-800 rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-neutral-400" />
            <span>Tus Cartas</span>
          </span>
          {isMyTurn && !pendingCanto && (
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold animate-pulse">
              ¡Tu turno de jugar carta!
            </span>
          )}
        </div>

        <div className="flex gap-4 justify-center items-center">
          {myHand.length === 0 ? (
            <span className="text-xs text-neutral-500 font-mono italic">Mano jugada completa.</span>
          ) : (
            myHand.map((card) => {
              const playable = isMyTurn && !pendingCanto;
              return (
                <motion.button
                  key={card.id}
                  id={`truco-card-btn-${card.id}`}
                  whileHover={playable ? { y: -10, scale: 1.04 } : {}}
                  onClick={() => playable && onPlayCard(card.id)}
                  disabled={!playable}
                  className={`relative focus:outline-none transition-all duration-300 ${
                    playable
                      ? 'cursor-pointer'
                      : 'opacity-65 cursor-not-allowed'
                  }`}
                >
                  <TrucoCardVisual card={card} />
                </motion.button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
