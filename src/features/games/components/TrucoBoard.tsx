// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: TRUCO VENEZOLANO
// ==============================================================================

import React from 'react';
import { motion } from 'motion/react';
import { Flame, Sparkles } from 'lucide-react';
import type { TrucoState, TrucoCard } from '../../../types/games';

interface TrucoBoardProps {
  state: TrucoState;
  currentUserId: string;
  onPlayCard: (cardId: string) => void;
  onCanto: (cantoType: string) => void;
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

  const getSuitSymbol = (suit: string) => {
    switch (suit) {
      case 'espadas':
        return '🗡️';
      case 'bastos':
        return '🪵';
      case 'oros':
        return '🪙';
      case 'copas':
        return '🍷';
      default:
        return '🃏';
    }
  };

  return (
    <div id="truco-board-container" className="flex flex-col items-center justify-between p-4 max-w-2xl mx-auto w-full min-h-[460px]">
      {/* Marcador Superior de Piedras / Puntos */}
      <div id="truco-scoreboard" className="grid grid-cols-2 gap-3 w-full mb-3">
        {state.playerOrder.map((uId) => (
          <div
            key={uId}
            id={`truco-player-card-${uId}`}
            className={`p-3 rounded-xl border transition-all ${
              state.turnUserId === uId && state.status === 'playing'
                ? 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-400/30'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-neutral-200 truncate block max-w-[120px]">
                  {state.playerNames[uId] || 'Jugador'}
                </span>
                <span className="text-[10px] text-amber-400 font-mono">
                  {state.hands[uId]?.length || 0} cartas en mano
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-white font-mono">
                  {state.points[uId] || 0}
                </span>
                <span className="text-[10px] text-neutral-500 block font-mono">/{state.targetPoints} tantos</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tapete Verde / Mesa Central con la Vira y Baza */}
      <div
        id="truco-table"
        className="w-full flex-1 min-h-[220px] rounded-2xl bg-emerald-950/70 border-4 border-amber-900/40 p-4 flex items-center justify-around relative shadow-2xl"
      >
        {/* Carta Vira */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 mb-1">
            VIRA (Muestra)
          </span>
          <div className="w-16 h-24 rounded-lg bg-neutral-100 border-2 border-amber-500 shadow-xl flex flex-col items-center justify-between p-1.5 text-neutral-950 font-black">
            <span className="text-xs">{state.vira.number}</span>
            <span className="text-2xl">{getSuitSymbol(state.vira.suit)}</span>
            <span className="text-xs capitalize">{state.vira.suit}</span>
          </div>
        </div>

        {/* Cartas jugadas en la Baza Actual */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-wider font-bold text-neutral-300 mb-1">
            Baza {state.playedTricks.length}
          </span>
          <div className="flex space-x-2 min-h-[96px] items-center">
            {currentTrick?.cards.length === 0 ? (
              <span className="text-xs text-emerald-300/60 font-mono">Esperando cartas...</span>
            ) : (
              currentTrick?.cards.map(({ userId, card }, idx) => (
                <motion.div
                  key={idx}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="w-16 h-24 rounded-lg bg-neutral-100 border-2 border-neutral-800 shadow-xl flex flex-col items-center justify-between p-1.5 text-neutral-950 font-black"
                >
                  <span className="text-xs">{card.number}</span>
                  <span className="text-2xl">{getSuitSymbol(card.suit)}</span>
                  <span className="text-[9px] text-neutral-600 truncate max-w-full">
                    {state.playerNames[userId] || 'Jugador'}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Botones de Cantos (Envido, Flor, Truco) */}
      {isMyTurn && (
        <div id="truco-cantos-bar" className="flex flex-wrap gap-2 justify-center my-3">
          <button
            onClick={() => onCanto('ENVIDO')}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold"
          >
            Envido (2 pts)
          </button>
          <button
            onClick={() => onCanto('FLOR')}
            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold"
          >
            ¡Flor! (3 pts)
          </button>
          <button
            onClick={() => onCanto('TRUCO')}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-lg text-xs font-bold flex items-center space-x-1"
          >
            <Flame className="w-3 h-3" />
            <span>¡Truco!</span>
          </button>
        </div>
      )}

      {/* Mis Cartas en Mano */}
      <div id="truco-my-hand" className="w-full bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4">
        <span className="text-xs font-bold text-neutral-300 mb-2 block">
          Tus Cartas {isMyTurn && <span className="text-emerald-400 font-semibold">(¡Tu turno!)</span>}
        </span>
        <div className="flex gap-3 justify-center">
          {myHand.map((card) => (
            <motion.button
              key={card.id}
              whileHover={isMyTurn ? { y: -8, scale: 1.05 } : {}}
              onClick={() => isMyTurn && onPlayCard(card.id)}
              disabled={!isMyTurn}
              className={`w-20 h-28 rounded-xl bg-neutral-100 border-2 flex flex-col items-center justify-between p-2 text-neutral-950 font-black shadow-2xl relative transition-all ${
                isMyTurn
                  ? 'cursor-pointer hover:border-amber-500 ring-2 ring-amber-400/40'
                  : 'opacity-70 cursor-not-allowed'
              } ${card.isPerico || card.isPerica ? 'border-amber-500 bg-amber-50' : 'border-neutral-800'}`}
            >
              {card.isPerico && (
                <span className="absolute -top-2 bg-amber-500 text-neutral-950 text-[9px] px-1.5 rounded-full font-black">
                  PERICO
                </span>
              )}
              {card.isPerica && (
                <span className="absolute -top-2 bg-purple-500 text-white text-[9px] px-1.5 rounded-full font-black">
                  PERICA
                </span>
              )}
              <span className="text-sm">{card.number}</span>
              <span className="text-3xl">{getSuitSymbol(card.suit)}</span>
              <span className="text-[10px] capitalize text-neutral-700">{card.suit}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};
