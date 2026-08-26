// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: ATRAPAÍTO
// ==============================================================================
// Juego de reflejos y rapidez mental con suma objetivo y cartas centrales.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { AtrapaitoState, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

export class AtrapaitoEngine implements IGameEngine<AtrapaitoState> {
  public readonly gameType = 'atrapaito';

  public initialize(table: GameTable, players: TablePlayer[]): AtrapaitoState {
    const playerNames: Record<string, string> = {};
    const playerHands: AtrapaitoState['playerHands'] = {};
    const playerScores: Record<string, number> = {};

    players.forEach((p) => {
      playerNames[p.userId] = p.displayName || `Jugador ${p.seatNumber}`;
      playerScores[p.userId] = 0;
      playerHands[p.userId] = this.generateHand(5);
    });

    const targetNumber = Math.floor(Math.random() * 15) + 5; // Objetivo entre 5 y 20

    return {
      targetNumber,
      currentCardsInMiddle: this.generateMiddleCards(3),
      playerHands,
      playerNames,
      playerScores,
      targetScore: 30,
      turnUserId: players[0]?.userId || '',
      status: 'playing',
      winnerUserId: null,
      lastReaction: null,
    };
  }

  public validateAction(state: AtrapaitoState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status === 'game_won') {
      return { valid: false, reason: 'La partida ya ha finalizado.' };
    }

    if (action.actionType === 'PLAY_CARD') {
      const cardId = action.actionData.cardId as string;
      const hand = state.playerHands[action.userId] || [];
      const hasCard = hand.some((c) => c.id === cardId);
      if (!hasCard) return { valid: false, reason: 'No tienes esta carta en la mano.' };
      return { valid: true };
    }

    if (action.actionType === 'SLAP_TABLE') {
      return { valid: true };
    }

    return { valid: false, reason: `Acción no reconocida: ${action.actionType}` };
  }

  public applyAction(state: AtrapaitoState, action: GameActionPayload): ActionResult<AtrapaitoState> {
    const validation = this.validateAction(state, action);
    if (!validation.valid) {
      return {
        newState: state,
        isValid: false,
        errorMessage: validation.reason,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    if (action.actionType === 'PLAY_CARD') {
      const cardId = action.actionData.cardId as string;
      const playedCard = state.playerHands[action.userId].find((c) => c.id === cardId)!;

      const newHand = state.playerHands[action.userId].filter((c) => c.id !== cardId);
      // Reponer carta
      newHand.push(this.generateSingleCard());

      const updatedHands = {
        ...state.playerHands,
        [action.userId]: newHand,
      };

      const updatedMiddle = [...state.currentCardsInMiddle, playedCard].slice(-5); // Máximo 5 en mesa

      const updatedState: AtrapaitoState = {
        ...state,
        playerHands: updatedHands,
        currentCardsInMiddle: updatedMiddle,
      };

      return {
        newState: updatedState,
        isValid: true,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    if (action.actionType === 'SLAP_TABLE') {
      // Sumar valores de las cartas del medio
      const middleSum = state.currentCardsInMiddle.reduce((sum, c) => sum + c.value, 0);
      const isMatch = middleSum === state.targetNumber;

      const currentScore = state.playerScores[action.userId] || 0;
      const delta = isMatch ? +10 : -5;
      const newScore = Math.max(0, currentScore + delta);

      const updatedScores = {
        ...state.playerScores,
        [action.userId]: newScore,
      };

      const isWon = newScore >= state.targetScore;
      const newTarget = Math.floor(Math.random() * 15) + 5;

      const updatedState: AtrapaitoState = {
        ...state,
        targetNumber: newTarget,
        currentCardsInMiddle: this.generateMiddleCards(2),
        playerScores: updatedScores,
        status: isWon ? 'game_won' : 'playing',
        winnerUserId: isWon ? action.userId : null,
        lastReaction: {
          userId: action.userId,
          success: isMatch,
          delta,
          message: isMatch
            ? `¡Atrapado con éxito! Suma exacta = ${middleSum} (+10 pts)`
            : `¡Manotazo en falso! Suma actual era ${middleSum} vs ${state.targetNumber} (-5 pts)`,
        },
      };

      return {
        newState: updatedState,
        isValid: true,
        isGameOver: isWon,
        winnerUserId: isWon ? action.userId : null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    return {
      newState: state,
      isValid: false,
      errorMessage: 'Acción no procesada',
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  public getSanitizedStateForPlayer(state: AtrapaitoState, userId: string): AtrapaitoState {
    const sanitizedHands: AtrapaitoState['playerHands'] = {};
    for (const [pId, hand] of Object.entries(state.playerHands)) {
      if (pId === userId) {
        sanitizedHands[pId] = hand;
      } else {
        sanitizedHands[pId] = hand.map((c) => ({
          id: `hidden_${c.id}`,
          value: 0,
          label: '🂠',
        }));
      }
    }
    return { ...state, playerHands: sanitizedHands };
  }

  private generateHand(count: number): { id: string; value: number; label: string }[] {
    const hand = [];
    for (let i = 0; i < count; i++) {
      hand.push(this.generateSingleCard());
    }
    return hand;
  }

  private generateMiddleCards(count: number): { id: string; value: number; label: string }[] {
    const cards = [];
    for (let i = 0; i < count; i++) {
      cards.push(this.generateSingleCard());
    }
    return cards;
  }

  private generateSingleCard(): { id: string; value: number; label: string } {
    const value = Math.floor(Math.random() * 9) + 1; // 1 a 9
    return {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      value,
      label: `${value}`,
    };
  }
}
