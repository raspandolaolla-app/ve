// ==============================================================================
// RASPANDO LA OLLA — TRUCO VENEZOLANO (1v1)
// ==============================================================================
// Baraja española, Vira, Perico y Perica, jerarquía criolla, cantos (Envido/Truco),
// 3 bazas por mano, marcador de buenas/malas y liquidación de pozo.
// ==============================================================================

import { useState } from 'react';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { useGameEngine } from '../useGameEngine';
import { Button } from '../../../components/common/Button';
import { Trophy, RefreshCw, Flame, Sparkles } from 'lucide-react';
import { formatBolivares } from '../../../utils/formatters';
import { FINANCIAL_RULES } from '../../../utils/constants';

export type Suit = 'ESPADAS' | 'BASTOS' | 'COPAS' | 'OROS';

export interface TrucoCard {
  number: number; // 1, 2, 3, 4, 5, 6, 7, 10, 11, 12
  suit: Suit;
}

interface TrucoState {
  player1UserId: string;
  player2UserId: string;
  player1Hand: TrucoCard[];
  player2Hand: TrucoCard[];
  vira: TrucoCard;
  player1Score: number;
  player2Score: number;
  maxScore: number; // 12 puntos por defecto
  currentTrick: number; // 1, 2, 3
  p1TricksWon: number;
  p2TricksWon: number;
  p1PlayedCards: TrucoCard[];
  p2PlayedCards: TrucoCard[];
  trucoLevel: number; // 1 = Simple, 2 = Truco (3 pts), 3 = Retruco (6 pts), 4 = Vale Cuatro (9 pts)
  winnerUserId: string | null;
}

const DECK_SUITS: Suit[] = ['ESPADAS', 'BASTOS', 'COPAS', 'OROS'];
const DECK_NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

function createShuffledDeck(): TrucoCard[] {
  const deck: TrucoCard[] = [];
  for (const suit of DECK_SUITS) {
    for (const num of DECK_NUMS) {
      deck.push({ number: num, suit });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function getCardPower(card: TrucoCard, vira: TrucoCard): number {
  // Perico = 11 de la pinta de la vira (poder 100)
  if (card.number === 11 && card.suit === vira.suit) return 100;
  // Perica = 10 de la pinta de la vira (poder 90)
  if (card.number === 10 && card.suit === vira.suit) return 90;
  // Espadilla = 1 de Espadas (poder 80)
  if (card.number === 1 && card.suit === 'ESPADAS') return 80;
  // Bastillo = 1 de Bastos (poder 70)
  if (card.number === 1 && card.suit === 'BASTOS') return 70;
  // 7 de Espadas (poder 60)
  if (card.number === 7 && card.suit === 'ESPADAS') return 60;
  // 7 de Oros (poder 50)
  if (card.number === 7 && card.suit === 'OROS') return 50;

  // Cartas comunes por número
  if (card.number === 3) return 30;
  if (card.number === 2) return 20;
  if (card.number === 1) return 15; // 1 de Copas o 1 de Oros
  if (card.number === 12) return 12;
  if (card.number === 11) return 11;
  if (card.number === 10) return 10;
  if (card.number === 7) return 7;
  if (card.number === 6) return 6;
  if (card.number === 5) return 5;
  if (card.number === 4) return 4;

  return 0;
}

export function TrucoGame({
  table,
  players,
  currentUserId,
  onLeave,
}: {
  table: GameTable;
  players: TablePlayer[];
  currentUserId?: string;
  onLeave: () => void;
}) {
  const p1 = players[0]?.userId || table.hostUserId;
  const p2 = players[1]?.userId || '';

  const freshDeck = createShuffledDeck();
  const viraCard = freshDeck[0];
  const p1Cards = freshDeck.slice(1, 4);
  const p2Cards = freshDeck.slice(4, 7);

  const initialTrucoState: TrucoState = {
    player1UserId: p1,
    player2UserId: p2,
    player1Hand: p1Cards,
    player2Hand: p2Cards,
    vira: viraCard,
    player1Score: 0,
    player2Score: 0,
    maxScore: 12,
    currentTrick: 1,
    p1TricksWon: 0,
    p2TricksWon: 0,
    p1PlayedCards: [],
    p2PlayedCards: [],
    trucoLevel: 1,
    winnerUserId: null,
  };

  const {
    gameState,
    currentTurnUserId,
    isMyTurn,
    isSettling,
    dispatchAction,
  } = useGameEngine({
    table,
    players,
    currentUserId,
    initialState: initialTrucoState,
  });

  const state = (gameState as unknown as TrucoState) || initialTrucoState;
  const isP1 = currentUserId === state.player1UserId;

  const myHand = isP1 ? state.player1Hand || [] : state.player2Hand || [];
  const opponentHandCount = (isP1 ? state.player2Hand?.length : state.player1Hand?.length) || 0;

  // Jugar una carta en la baza actual
  const handlePlayCard = async (card: TrucoCard) => {
    if (!isMyTurn || state.winnerUserId || isSettling) return;

    const newMyHand = myHand.filter((c) => !(c.number === card.number && c.suit === card.suit));
    const newP1Hand = isP1 ? newMyHand : state.player1Hand;
    const newP2Hand = isP1 ? state.player2Hand : newMyHand;

    const newP1Played = isP1 ? [...state.p1PlayedCards, card] : state.p1PlayedCards;
    const newP2Played = !isP1 ? [...state.p2PlayedCards, card] : state.p2PlayedCards;

    let nextTrick = state.currentTrick;
    let p1Tricks = state.p1TricksWon;
    let p2Tricks = state.p2TricksWon;
    let p1Score = state.player1Score;
    let p2Score = state.player2Score;
    let winnerId: string | null = null;

    // Si ambos ya jugaron su carta en esta baza
    if (newP1Played.length === newP2Played.length) {
      const p1Card = newP1Played[newP1Played.length - 1];
      const p2Card = newP2Played[newP2Played.length - 1];
      const p1Power = getCardPower(p1Card, state.vira);
      const p2Power = getCardPower(p2Card, state.vira);

      if (p1Power > p2Power) {
        p1Tricks += 1;
      } else if (p2Power > p1Power) {
        p2Tricks += 1;
      } else {
        // Parda (empate en baza): gana la primera baza o la siguiente
        p1Tricks += 1;
        p2Tricks += 1;
      }

      nextTrick += 1;

      // Si se ganaron 2 bazas o se completaron las 3
      if (p1Tricks >= 2 || p2Tricks >= 2 || nextTrick > 3) {
        const handPoints = state.trucoLevel === 1 ? 1 : state.trucoLevel === 2 ? 3 : 6;
        if (p1Tricks > p2Tricks) {
          p1Score += handPoints;
        } else if (p2Tricks > p1Tricks) {
          p2Score += handPoints;
        }

        if (p1Score >= state.maxScore) {
          winnerId = state.player1UserId;
        } else if (p2Score >= state.maxScore) {
          winnerId = state.player2UserId;
        }
      }
    }

    const nextTurn = currentUserId === state.player1UserId ? state.player2UserId : state.player1UserId;

    const nextState: TrucoState = {
      ...state,
      player1Hand: newP1Hand,
      player2Hand: newP2Hand,
      p1PlayedCards: newP1Played,
      p2PlayedCards: newP2Played,
      currentTrick: nextTrick,
      p1TricksWon: p1Tricks,
      p2TricksWon: p2Tricks,
      player1Score: p1Score,
      player2Score: p2Score,
      winnerUserId: winnerId,
    };

    await dispatchAction(
      'PLAY_CARD',
      { card },
      nextState as unknown as Record<string, unknown>,
      winnerId ? null : nextTurn,
      winnerId,
      false
    );
  };

  // Canto de Truco (+puntos en juego)
  const handleCallTruco = async () => {
    if (!isMyTurn || state.winnerUserId || isSettling) return;

    const newLevel = Math.min(4, state.trucoLevel + 1);
    const nextState: TrucoState = {
      ...state,
      trucoLevel: newLevel,
    };

    await dispatchAction(
      'CALL_TRUCO',
      { level: newLevel },
      nextState as unknown as Record<string, unknown>,
      currentTurnUserId
    );
  };

  const isGameOver = Boolean(state.winnerUserId);
  const isWinner = state.winnerUserId === currentUserId;
  const estimatedPrize = table.entryFee * table.maxPlayers * (FINANCIAL_RULES.WINNER_PERCENT / 100);

  const formatSuitIcon = (suit: Suit) => {
    switch (suit) {
      case 'ESPADAS':
        return '⚔️';
      case 'BASTOS':
        return '🪵';
      case 'COPAS':
        return '🍷';
      case 'OROS':
        return '🪙';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-4xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100">Truco Venezolano (1v1)</h2>
              <p className="text-xs text-slate-400">
                Pozo: <strong className="text-emerald-400 font-mono">{formatBolivares(estimatedPrize)}</strong> (90%)
              </p>
            </div>
          </div>

          {/* Marcador Buenas y Malas */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-slate-400 text-[10px] block">Tú</span>
              <span className="text-amber-400 font-bold text-sm">
                {isP1 ? state.player1Score : state.player2Score} / {state.maxScore}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
              <span className="text-slate-400 text-[10px] block">Rival</span>
              <span className="text-slate-200 font-bold text-sm">
                {isP1 ? state.player2Score : state.player1Score} / {state.maxScore}
              </span>
            </div>
          </div>
        </div>

        {/* Turno y Baza */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Turno:</span>
            {isGameOver ? (
              <span className="font-bold text-amber-400">Partida Finalizada</span>
            ) : isMyTurn ? (
              <span className="font-bold text-emerald-400 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                ¡Tu turno de jugar carta o cantar!
              </span>
            ) : (
              <span className="font-medium text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                Esperando al rival...
              </span>
            )}
          </div>

          <div className="text-amber-400 font-mono text-[11px] font-bold">
            Baza {state.currentTrick} de 3
          </div>
        </div>
      </div>

      {/* Tapete Verde / Vira y Cartas en Mesa */}
      <div className="w-full min-h-[220px] bg-gradient-to-br from-emerald-950/90 to-slate-950 border-4 border-emerald-900/60 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-between relative overflow-hidden space-y-4">
        {/* Vira Card */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Vira:</div>
            <div className="w-12 h-16 bg-amber-100 border-2 border-amber-500 rounded-lg flex flex-col items-center justify-between py-1 text-slate-950 font-black shadow-lg">
              <span className="text-xs">{state.vira.number}</span>
              <span className="text-sm">{formatSuitIcon(state.vira.suit)}</span>
            </div>
            <div className="text-[10px] text-emerald-300 font-mono">
              Perico: 11 de {state.vira.suit} | Perica: 10 de {state.vira.suit}
            </div>
          </div>

          {isMyTurn && !isGameOver && (
            <Button size="sm" variant="primary" onClick={handleCallTruco}>
              <Flame className="w-3.5 h-3.5 mr-1" />
              {state.trucoLevel === 1 ? '¡Cantar Truco!' : state.trucoLevel === 2 ? '¡Retruco!' : '¡Vale Cuatro!'}
            </Button>
          )}
        </div>

        {/* Cartas jugadas en mesa */}
        <div className="flex items-center justify-center gap-8 py-2">
          {/* Jugadas P1 */}
          <div className="text-center space-y-1">
            <div className="text-[10px] text-slate-400">Tus cartas jugadas</div>
            <div className="flex gap-1.5">
              {(isP1 ? state.p1PlayedCards : state.p2PlayedCards).map((c, i) => (
                <div
                  key={i}
                  className="w-11 h-16 bg-white border border-slate-300 rounded-lg flex flex-col items-center justify-between py-1 text-slate-900 font-bold shadow"
                >
                  <span className="text-xs">{c.number}</span>
                  <span className="text-xs">{formatSuitIcon(c.suit)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Jugadas P2 */}
          <div className="text-center space-y-1">
            <div className="text-[10px] text-slate-400">Cartas del rival</div>
            <div className="flex gap-1.5">
              {(isP1 ? state.p2PlayedCards : state.p1PlayedCards).map((c, i) => (
                <div
                  key={i}
                  className="w-11 h-16 bg-white border border-slate-300 rounded-lg flex flex-col items-center justify-between py-1 text-slate-900 font-bold shadow"
                >
                  <span className="text-xs">{c.number}</span>
                  <span className="text-xs">{formatSuitIcon(c.suit)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mano de Cartas del Jugador */}
      <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Tus Cartas en Mano ({myHand.length})
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {myHand.map((card, idx) => (
            <button
              key={idx}
              id={`truco-card-${card.number}-${card.suit}`}
              disabled={!isMyTurn || isGameOver || isSettling}
              onClick={() => handlePlayCard(card)}
              className={`w-16 h-24 sm:w-20 sm:h-28 rounded-2xl border-2 flex flex-col items-center justify-between py-2 font-black select-none transition-all ${
                isMyTurn && !isGameOver
                  ? 'bg-slate-100 border-slate-300 text-slate-950 hover:-translate-y-3 hover:shadow-2xl hover:border-amber-500 cursor-pointer active:scale-95'
                  : 'bg-slate-800 border-slate-700 text-slate-500 opacity-60 cursor-not-allowed'
              }`}
            >
              <span className="text-sm sm:text-base">{card.number}</span>
              <span className="text-2xl sm:text-3xl">{formatSuitIcon(card.suit)}</span>
              <span className="text-[10px] text-slate-600 uppercase font-mono">{card.suit}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Overlay de Resultado */}
      {isGameOver && (
        <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
          {isWinner ? (
            <div>
              <div className="text-3xl font-black text-emerald-400 mb-1">¡VICTORIA EN TRUCO! 🏆</div>
              <p className="text-xs text-slate-300">
                Has alcanzado los 12 puntos y ganas:{' '}
                <strong className="text-emerald-400 font-mono text-base">{formatBolivares(estimatedPrize)}</strong>
              </p>
            </div>
          ) : (
            <div>
              <div className="text-3xl font-black text-slate-300 mb-1">PARTIDA FINALIZADA</div>
              <p className="text-xs text-slate-400">El rival alcanzó primero los puntos de victoria.</p>
            </div>
          )}

          {isSettling && (
            <div className="text-xs text-amber-300 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Liquidando premio 90/10 en Supabase...</span>
            </div>
          )}

          <Button variant="primary" onClick={onLeave} className="w-full py-3">
            Volver al Lobby de Mesas
          </Button>
        </div>
      )}
    </div>
  );
}
