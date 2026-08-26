// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: TRUCO VENEZOLANO
// ==============================================================================
// Baraja española de 40 cartas, vira, perico, perica, cantos y bazas.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { TrucoState, TrucoCard, TrucoSuit, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

const SUITS: TrucoSuit[] = ['espadas', 'bastos', 'oros', 'copas'];
const NUMBERS: TrucoCard['number'][] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export class TrucoEngine implements IGameEngine<TrucoState> {
  public readonly gameType = 'truco_venezolano';

  public initialize(table: GameTable, players: TablePlayer[]): TrucoState {
    const sortedPlayers = [...players].sort((a, b) => a.seatNumber - b.seatNumber);
    const playerOrder = sortedPlayers.map((p) => p.userId);

    // Generar baraja
    const deck: TrucoCard[] = [];
    SUITS.forEach((suit) => {
      NUMBERS.forEach((number) => {
        deck.push({
          number,
          suit,
          id: `${suit}_${number}`,
        });
      });
    });

    // Barajar
    const shuffled = [...deck].sort(() => Math.random() - 0.5);

    // Sacar Vira
    const vira = shuffled.pop()!;

    // Identificar Perico (11 del palo de la vira) y Perica (10 del palo de la vira)
    shuffled.forEach((c) => {
      if (c.suit === vira.suit && c.number === 11) c.isPerico = true;
      if (c.suit === vira.suit && c.number === 10) c.isPerica = true;
    });

    const hands: Record<string, TrucoCard[]> = {};
    const playerNames: Record<string, string> = {};
    const points: Record<string, number> = {};

    sortedPlayers.forEach((p, idx) => {
      hands[p.userId] = shuffled.slice(idx * 3, (idx + 1) * 3);
      playerNames[p.userId] = p.displayName || `Jugador ${idx + 1}`;
      points[p.userId] = 0;
    });

    return {
      vira,
      hands,
      playedTricks: [
        { trickNumber: 1, cards: [], winnerUserId: null },
      ],
      trickWinners: [],
      turnUserId: playerOrder[0],
      playerOrder,
      playerNames,
      points,
      targetPoints: 12,
      cantoState: {
        envidoPoints: 0,
        envidoAccepted: null,
        trucoPoints: 1, // Punto base de la mano
        trucoAccepted: null,
        florCalledBy: [],
      },
      status: 'playing',
      winnerUserId: null,
    };
  }

  public validateAction(state: TrucoState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status !== 'playing') {
      return { valid: false, reason: 'La partida no está activa.' };
    }

    if (action.userId !== state.turnUserId) {
      return { valid: false, reason: 'No es tu turno de cantar o tirar carta.' };
    }

    if (action.actionType === 'PLAY_CARD') {
      const cardId = action.actionData.cardId as string;
      const playerHand = state.hands[action.userId] || [];
      const hasCard = playerHand.some((c) => c.id === cardId);

      if (!hasCard) {
        return { valid: false, reason: 'No tienes esta carta en la mano.' };
      }

      return { valid: true };
    }

    if (action.actionType === 'CANTO') {
      const cantoType = action.actionData.cantoType as string;
      if (!['ENVIDO', 'REAL_ENVIDO', 'TRUCO', 'RETRUCO', 'VALE_CUATRO', 'FLOR'].includes(cantoType)) {
        return { valid: false, reason: 'Canto no reconocido en Truco Venezolano.' };
      }
      return { valid: true };
    }

    return { valid: false, reason: `Acción desconocida: ${action.actionType}` };
  }

  public applyAction(state: TrucoState, action: GameActionPayload): ActionResult<TrucoState> {
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

    const currentTrickIndex = state.playedTricks.length - 1;
    const currentTrick = state.playedTricks[currentTrickIndex];

    if (action.actionType === 'PLAY_CARD') {
      const cardId = action.actionData.cardId as string;
      const playedCard = state.hands[action.userId].find((c) => c.id === cardId)!;

      const newHand = state.hands[action.userId].filter((c) => c.id !== cardId);
      const updatedHands = {
        ...state.hands,
        [action.userId]: newHand,
      };

      const updatedTrickCards = [
        ...currentTrick.cards,
        { userId: action.userId, card: playedCard },
      ];

      const currentIdx = state.playerOrder.indexOf(action.userId);
      const nextTurnUserId = state.playerOrder[(currentIdx + 1) % state.playerOrder.length];

      // Si todos los jugadores han tirado su carta en esta baza
      if (updatedTrickCards.length >= state.playerOrder.length) {
        const trickWinnerId = this.evaluateTrickWinner(updatedTrickCards, state.vira);
        const updatedTrick = {
          ...currentTrick,
          cards: updatedTrickCards,
          winnerUserId: trickWinnerId,
        };

        const updatedPlayedTricks = [...state.playedTricks.slice(0, -1), updatedTrick];
        const newTrickWinners = [...state.trickWinners, trickWinnerId];

        // Verificar si alguien ganó 2 de las 3 bazas
        const userWins = newTrickWinners.filter((id) => id === action.userId).length;
        const opponentWins = newTrickWinners.filter((id) => id !== null && id !== action.userId).length;

        if (userWins >= 2 || opponentWins >= 2 || newTrickWinners.length >= 3) {
          const handWinnerId = userWins >= 2 ? action.userId : (opponentWins >= 2 ? nextTurnUserId : action.userId);
          const handPointsEarned = state.cantoState.trucoPoints;

          const newPoints = {
            ...state.points,
            [handWinnerId]: (state.points[handWinnerId] || 0) + handPointsEarned,
          };

          const isGameWon = newPoints[handWinnerId] >= state.targetPoints;

          const updatedState: TrucoState = {
            ...state,
            hands: updatedHands,
            playedTricks: updatedPlayedTricks,
            trickWinners: newTrickWinners,
            points: newPoints,
            status: isGameWon ? 'game_won' : 'round_won',
            winnerUserId: isGameWon ? handWinnerId : null,
          };

          return {
            newState: updatedState,
            isValid: true,
            isGameOver: isGameWon,
            winnerUserId: isGameWon ? handWinnerId : null,
            winnerTeamIndex: null,
            isDraw: false,
          };
        }

        // Nueva baza
        const nextTrickNumber = state.playedTricks.length + 1;
        const updatedState: TrucoState = {
          ...state,
          hands: updatedHands,
          playedTricks: [
            ...updatedPlayedTricks,
            { trickNumber: nextTrickNumber, cards: [], winnerUserId: null },
          ],
          trickWinners: newTrickWinners,
          turnUserId: trickWinnerId || nextTurnUserId,
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

      // Continuar la baza actual con el siguiente jugador
      const updatedTrick = {
        ...currentTrick,
        cards: updatedTrickCards,
      };

      const updatedState: TrucoState = {
        ...state,
        hands: updatedHands,
        playedTricks: [...state.playedTricks.slice(0, -1), updatedTrick],
        turnUserId: nextTurnUserId,
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

    if (action.actionType === 'CANTO') {
      const cantoType = action.actionData.cantoType as string;
      const updatedCanto = { ...state.cantoState };

      if (cantoType === 'TRUCO') updatedCanto.trucoPoints = 2;
      if (cantoType === 'RETRUCO') updatedCanto.trucoPoints = 3;
      if (cantoType === 'VALE_CUATRO') updatedCanto.trucoPoints = 4;
      if (cantoType === 'ENVIDO') updatedCanto.envidoPoints = 2;
      if (cantoType === 'REAL_ENVIDO') updatedCanto.envidoPoints = 3;

      const currentIdx = state.playerOrder.indexOf(action.userId);
      const nextTurnUserId = state.playerOrder[(currentIdx + 1) % state.playerOrder.length];

      const updatedState: TrucoState = {
        ...state,
        cantoState: updatedCanto,
        turnUserId: nextTurnUserId,
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

  public getSanitizedStateForPlayer(state: TrucoState, userId: string): TrucoState {
    const sanitizedHands: Record<string, TrucoCard[]> = {};

    for (const [pId, hand] of Object.entries(state.hands)) {
      if (pId === userId || state.status === 'game_won') {
        sanitizedHands[pId] = hand;
      } else {
        // Ocultar cartas del rival (boca abajo)
        sanitizedHands[pId] = hand.map((c) => ({
          id: `hidden_${c.id}`,
          number: 1,
          suit: 'espadas',
        }));
      }
    }

    return {
      ...state,
      hands: sanitizedHands,
    };
  }

  private evaluateTrickWinner(cards: { userId: string; card: TrucoCard }[], vira: TrucoCard): string | null {
    let highestPower = -1;
    let winnerId: string | null = null;
    let isTied = false;

    cards.forEach(({ userId, card }) => {
      const power = this.getCardPower(card, vira);
      if (power > highestPower) {
        highestPower = power;
        winnerId = userId;
        isTied = false;
      } else if (power === highestPower) {
        isTied = true;
      }
    });

    return isTied ? null : winnerId;
  }

  private getCardPower(card: TrucoCard, vira: TrucoCard): number {
    if (card.suit === vira.suit && card.number === 11) return 100; // Perico
    if (card.suit === vira.suit && card.number === 10) return 99;  // Perica
    if (card.suit === 'espadas' && card.number === 1) return 90;  // Espadilla
    if (card.suit === 'bastos' && card.number === 1) return 89;   // Bastillo
    if (card.suit === 'espadas' && card.number === 7) return 88;  // 7 de espadas
    if (card.suit === 'oros' && card.number === 7) return 87;     // 7 de oros

    if (card.number === 3) return 70;
    if (card.number === 2) return 60;
    if (card.number === 1) return 50;
    if (card.number === 12) return 40;
    if (card.number === 11) return 30;
    if (card.number === 10) return 20;
    if (card.number === 7) return 15;
    if (card.number === 6) return 10;
    if (card.number === 5) return 5;
    return 1; // 4s
  }
}
