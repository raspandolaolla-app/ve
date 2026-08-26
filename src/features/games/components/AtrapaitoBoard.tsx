// ==============================================================================
// RASPANDO LA OLLA — TABLERO DE JUEGO: ATRAPAÍTO
// ==============================================================================

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Hand, Sparkles } from 'lucide-react';
import type { AtrapaitoState } from '../../../types/games';

interface AtrapaitoBoardProps {
  state: AtrapaitoState;
  currentUserId: string;
  onPlayCard: (cardId: string) => void;
  onSlapTable: () => void;
}

export const AtrapaitoBoard: React.FC<AtrapaitoBoardProps> = ({
  state,
  currentUserId,
  onPlayCard,
  onSlapTable,
}) => {
  const myHand = state.playerHands[currentUserId] || [];
  const middleSum = state.currentCardsInMiddle.reduce((sum, c) => sum + c.value, 0);

  return (
    <div id="atrapaito-board-container" className="flex flex-col items-center justify-between p-4 max-w-xl mx-auto w-full min-h-[460px]">
      {/* Marcador Superior */}
      <div id="atrapaito-scoreboard" className="grid grid-cols-2 gap-3 w-full mb-3">
        {Object.entries(state.playerNames).map(([uId, name]) => (
          <div
            key={uId}
            className={`p-3 rounded-xl border ${
              uId === currentUserId
                ? 'bg-amber-500/10 border-amber-500/50'
                : 'bg-neutral-900/60 border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-200 truncate max-w-[110px]">
                {name} {uId === currentUserId && '(Tú)'}
              </span>
              <span className="text-xl font-black text-white font-mono">
                {state.playerScores[uId] || 0}
                <span className="text-xs text-neutral-500 font-normal">/{state.targetScore}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Arena Central con Número Objetivo */}
      <div
        id="atrapaito-arena"
        className="w-full bg-neutral-900 border-2 border-amber-500/30 rounded-2xl p-5 flex flex-col items-center justify-center relative shadow-2xl overflow-hidden"
      >
        {/* Banner de Meta */}
        <div className="flex items-center space-x-2 px-4 py-1.5 rounded-full bg-amber-500 text-neutral-950 font-black text-sm mb-4 shadow-lg">
          <Zap className="w-4 h-4" />
          <span>NÚMERO OBJETIVO: {state.targetNumber}</span>
        </div>

        {/* Cartas en el centro */}
        <div className="flex flex-wrap gap-2 justify-center min-h-[90px] items-center mb-3">
          {state.currentCardsInMiddle.map((card, idx) => (
            <motion.div
              key={card.id || idx}
              initial={{ scale: 0.5, rotate: Math.random() * 20 - 10 }}
              animate={{ scale: 1, rotate: 0 }}
              className="w-14 h-20 rounded-xl bg-white border-2 border-neutral-900 shadow-xl flex flex-col items-center justify-center font-black text-2xl text-neutral-950"
            >
              <span>{card.value}</span>
            </motion.div>
          ))}
        </div>

        {/* Suma actual visible */}
        <span className="text-xs font-mono text-neutral-400">
          Suma actual en mesa: <strong className="text-amber-400 text-sm">{middleSum}</strong>
        </span>

        {/* Mensaje de última reacción */}
        <AnimatePresence>
          {state.lastReaction && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-3 text-xs font-semibold px-3 py-1 rounded-lg border ${
                state.lastReaction.success
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-red-500/20 text-red-300 border-red-500/40'
              }`}
            >
              {state.lastReaction.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Botón de Manotazo (¡ATRAPAÍTO!) */}
      <div className="w-full my-3">
        <motion.button
          id="atrapaito-slap-btn"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={onSlapTable}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-600 via-amber-600 to-yellow-500 hover:from-red-500 hover:to-yellow-400 text-white font-black text-xl tracking-wider uppercase shadow-2xl flex items-center justify-center space-x-2 border border-red-400/40 cursor-pointer"
        >
          <Hand className="w-6 h-6 animate-bounce" />
          <span>¡ATRAPAÍTO! (MANOTAZO)</span>
        </motion.button>
      </div>

      {/* Mano de Cartas del Jugador */}
      <div id="atrapaito-hand" className="w-full bg-neutral-900/80 border border-neutral-800 rounded-2xl p-3">
        <span className="text-xs font-bold text-neutral-400 block mb-2">
          Haz clic en una carta para tirarla a la mesa:
        </span>
        <div className="flex gap-2 justify-center">
          {myHand.map((card) => (
            <motion.button
              key={card.id}
              whileHover={{ y: -6, scale: 1.05 }}
              onClick={() => onPlayCard(card.id)}
              className="w-14 h-20 rounded-xl bg-white border-2 border-neutral-800 shadow-lg flex flex-col items-center justify-center font-black text-xl text-neutral-950 hover:border-amber-500 transition-all cursor-pointer"
            >
              <span>{card.value}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};
