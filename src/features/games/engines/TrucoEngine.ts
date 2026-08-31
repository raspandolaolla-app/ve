// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: TRUCO VENEZOLANO 2.0
// ==============================================================================
// Baraja española de 40 cartas, vira, perico, perica, cantos y bazas.
// Motor 100% determinista y autoritativo con soporte completo de cantos,
// contraofertas en tiempo real, respuestas y cálculo automático de Envido/Flor.
// ==============================================================================

import { RngService } from '../../../services/rng/RngService';
import type { IGameEngine, ActionResult } from './GameEngine';
import type { TrucoState, TrucoCard, TrucoSuit, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

const SUITS: TrucoSuit[] = ['espadas', 'bastos', 'oros', 'copas'];
const NUMBERS: TrucoCard['number'][] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export class TrucoEngine implements IGameEngine<TrucoState> {
  public readonly gameType = 'truco_venezolano';

  public initialize(table: GameTable, players: TablePlayer[]): TrucoState {
    const uniquePlayers = Array.from(
      new Map(
        players.map((player) => [
          (player as any).user_id || player.userId,
          player,
        ])
      ).values()
    ).sort((a, b) => (a.seatNumber ?? 1) - (b.seatNumber ?? 1));

    if (players.length !== uniquePlayers.length) {
      throw new Error('Un jugador no puede ocupar dos puestos en la misma mesa');
    }

    const playerOrder = uniquePlayers.map((p) => p.userId);

    const initialPoints: Record<string, number> = {};
    const playerNames: Record<string, string> = {};
    uniquePlayers.forEach((p, idx) => {
      initialPoints[p.userId] = 0;
      playerNames[p.userId] = p.displayName || `Jugador ${idx + 1}`;
    });

    // Iniciar la primera ronda
    return this.generateRoundState({
      playerOrder,
      playerNames,
      points: initialPoints,
      targetPoints: 12, // 12 puntos por defecto
    }, playerOrder[0]);
  }

  /**
   * Genera el estado limpio para una nueva ronda/mano de juego.
   */
  private generateRoundState(
    baseState: {
      playerOrder: string[];
      playerNames: Record<string, string>;
      points: Record<string, number>;
      targetPoints: number;
    },
    roundStarterUserId: string
  ): TrucoState {
    // Generar baraja de 40 cartas (sin 8 ni 9)
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

    // Barajar Fisher-Yates con RNG Criptográfico (Web Crypto safe fallback / RngService)
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = RngService.getRandomIntSecure(0, i);
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    // Sacar Vira
    const vira = shuffled.pop()!;

    // Identificar Perico (11 del palo de la vira) y Perica (10 del palo de la vira)
    shuffled.forEach((c) => {
      if (c.suit === vira.suit && c.number === 11) c.isPerico = true;
      if (c.suit === vira.suit && c.number === 10) c.isPerica = true;
    });

    // Repartir 3 cartas a cada jugador
    const hands: Record<string, TrucoCard[]> = {};
    baseState.playerOrder.forEach((userId, idx) => {
      hands[userId] = shuffled.slice(idx * 3, (idx + 1) * 3);
    });

    return {
      vira,
      hands,
      playedTricks: [
        { trickNumber: 1, cards: [], winnerUserId: null },
      ],
      trickWinners: [],
      turnUserId: roundStarterUserId,
      playerOrder: baseState.playerOrder,
      playerNames: baseState.playerNames,
      points: baseState.points,
      targetPoints: baseState.targetPoints,
      cantoState: {
        envidoPoints: 0,
        envidoAccepted: null,
        trucoPoints: 1, // Punto base de la mano
        trucoAccepted: null,
        florCalledBy: [],
        pendingCanto: null,
        envidoStatus: 'NONE',
        trucoStatus: 'NONE',
        florStatus: 'NONE',
      } as any,
      status: 'playing',
      winnerUserId: null,
    };
  }

  public validateAction(state: TrucoState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status !== 'playing') {
      return { valid: false, reason: 'La partida no está activa.' };
    }

    const { pendingCanto } = state.cantoState as any;

    // Si hay un canto pendiente de respuesta, el único jugador que puede actuar es el respondByUserId
    if (pendingCanto) {
      if (action.userId !== pendingCanto.respondByUserId) {
        return { valid: false, reason: 'Espera que el rival responda al canto actual.' };
      }

      if (action.actionType === 'RESPOND_CANTO') {
        const response = action.actionData.response as string;
        if (!response) {
          return { valid: false, reason: 'Debes enviar una respuesta válida al canto.' };
        }
        return { valid: true };
      }

      if (action.actionType === 'CANTO') {
        const escalation = action.actionData.cantoType as string;
        // Permitir contraofertas válidas
        const originalCanto = pendingCanto.cantoType;
        if (originalCanto === 'ENVIDO' && ['REAL_ENVIDO', 'FALTA_ENVIDO'].includes(escalation)) {
          return { valid: true };
        }
        if (originalCanto === 'REAL_ENVIDO' && escalation === 'FALTA_ENVIDO') {
          return { valid: true };
        }
        if (originalCanto === 'TRUCO' && escalation === 'RETRUCO') {
          return { valid: true };
        }
        if (originalCanto === 'RETRUCO' && escalation === 'VALE_CUATRO') {
          return { valid: true };
        }
        if (originalCanto === 'FLOR' && ['CONTRA_FLOR', 'CONTRA_FLOR_AL_RESTO'].includes(escalation)) {
          return { valid: true };
        }
        return { valid: false, reason: `No puedes responder con ${escalation} al canto de ${originalCanto}.` };
      }

      return { valid: false, reason: 'Debes responder o elevar el canto actual.' };
    }

    // Acciones normales cuando no hay cantos bloqueantes
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
      
      // Validaciones para Envido y Flor (sólo válidos en la primera baza antes de tirar más de 1 carta)
      const isFirstTrick = state.playedTricks.length === 1;
      const cardsInTrick = state.playedTricks[0]?.cards.length || 0;
      const isEnvidoOrFlorAllowed = isFirstTrick && cardsInTrick < 2;

      if (['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'].includes(cantoType)) {
        if (!isEnvidoOrFlorAllowed) {
          return { valid: false, reason: 'El Envido sólo puede cantarse en la primera mano antes de jugar las cartas.' };
        }
        const envidoStatus = (state.cantoState as any).envidoStatus || 'NONE';
        if (envidoStatus !== 'NONE') {
          return { valid: false, reason: 'El Envido ya fue cantado o resuelto en esta ronda.' };
        }
        return { valid: true };
      }

      if (cantoType === 'FLOR') {
        if (!isEnvidoOrFlorAllowed) {
          return { valid: false, reason: 'La Flor sólo puede cantarse en la primera mano antes de jugar las cartas.' };
        }
        const hasMyFlor = this.hasFlor(state.hands[action.userId], state.vira);
        if (!hasMyFlor) {
          return { valid: false, reason: '¡Intento de canto falso! No posees una Flor en tu mano.' };
        }
        const florStatus = (state.cantoState as any).florStatus || 'NONE';
        if (florStatus !== 'NONE') {
          return { valid: false, reason: 'La Flor ya fue cantada o resuelta en esta ronda.' };
        }
        return { valid: true };
      }

      // Validaciones para Truco
      if (cantoType === 'TRUCO') {
        const trucoStatus = (state.cantoState as any).trucoStatus || 'NONE';
        if (trucoStatus !== 'NONE') {
          return { valid: false, reason: 'El Truco ya fue cantado en esta ronda.' };
        }
        return { valid: true };
      }

      if (cantoType === 'RETRUCO') {
        const currentLevel = state.cantoState.trucoPoints;
        if (currentLevel !== 3) {
          return { valid: false, reason: 'No puedes cantar Retruco si no se ha aceptado el Truco.' };
        }
        return { valid: true };
      }

      if (cantoType === 'VALE_CUATRO') {
        const currentLevel = state.cantoState.trucoPoints;
        if (currentLevel !== 6) {
          return { valid: false, reason: 'No puedes cantar Vale Cuatro si no se ha aceptado el Retruco.' };
        }
        return { valid: true };
      }

      return { valid: false, reason: 'Canto no reconocido.' };
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

    const { pendingCanto } = state.cantoState as any;

    // ==========================================================================
    // 1. MANEJO DE RESPUESTA A CANTOS (RESPOND_CANTO)
    // ==========================================================================
    if (action.actionType === 'RESPOND_CANTO' && pendingCanto) {
      const response = action.actionData.response as 'QUIERO' | 'NO_QUIERO';
      const cType = pendingCanto.cantoType;
      const opponentUserId = pendingCanto.calledByUserId!;

      if (response === 'QUIERO') {
        // ENVIDO / REAL ENVIDO / FALTA ENVIDO resueltos
        if (['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'].includes(cType)) {
          // Resolver puntos de Envido en el acto
          const calculatedPoints: Record<string, number> = {};
          state.playerOrder.forEach((uId) => {
            calculatedPoints[uId] = this.calculateEnvidoPoints(state.hands[uId], state.vira);
          });

          // Determinar ganador de Envido
          const u1 = state.playerOrder[0];
          const u2 = state.playerOrder[1];
          const pts1 = calculatedPoints[u1];
          const pts2 = calculatedPoints[u2];

          let envidoWinnerUserId = u1;
          if (pts2 > pts1) {
            envidoWinnerUserId = u2;
          } else if (pts1 === pts2) {
            // El que posee el turno / mano original gana los empates
            envidoWinnerUserId = state.playerOrder[0];
          }

          const ptsWon = pendingCanto.pointsIfAccepted;
          const nextPoints = {
            ...state.points,
            [envidoWinnerUserId]: (state.points[envidoWinnerUserId] || 0) + ptsWon,
          };

          const isGameWon = nextPoints[envidoWinnerUserId] >= state.targetPoints;

          let updatedState: TrucoState = {
            ...state,
            points: nextPoints,
            cantoState: {
              ...state.cantoState,
              envidoPoints: ptsWon,
              envidoAccepted: true,
              envidoStatus: 'RESOLVED',
              envidoPointsCalculated: calculatedPoints,
              pendingCanto: null,
              lastCantoBy: action.userId,
            } as any,
            turnUserId: pendingCanto.previousTurnUserId!, // Restaurar turno
          };

          if (isGameWon) {
            updatedState.status = 'game_won';
            updatedState.winnerUserId = envidoWinnerUserId;
          }

          return {
            newState: updatedState,
            isValid: true,
            isGameOver: isGameWon,
            winnerUserId: isGameWon ? envidoWinnerUserId : null,
            winnerTeamIndex: null,
            isDraw: false,
          };
        }

        // FLOR resuelto
        if (cType === 'FLOR') {
          // Si el oponente acepta Flor, ambos revelan puntos de Flor
          const calculatedFlor: Record<string, number> = {};
          state.playerOrder.forEach((uId) => {
            calculatedFlor[uId] = this.calculateFlorPoints(state.hands[uId], state.vira);
          });

          const u1 = state.playerOrder[0];
          const u2 = state.playerOrder[1];
          const pts1 = calculatedFlor[u1];
          const pts2 = calculatedFlor[u2];

          let florWinnerUserId = u1;
          if (pts2 > pts1) {
            florWinnerUserId = u2;
          } else if (pts1 === pts2) {
            florWinnerUserId = state.playerOrder[0];
          }

          const ptsWon = pendingCanto.pointsIfAccepted;
          const nextPoints = {
            ...state.points,
            [florWinnerUserId]: (state.points[florWinnerUserId] || 0) + ptsWon,
          };

          const isGameWon = nextPoints[florWinnerUserId] >= state.targetPoints;

          let updatedState: TrucoState = {
            ...state,
            points: nextPoints,
            cantoState: {
              ...state.cantoState,
              envidoAccepted: true,
              florStatus: 'RESOLVED',
              florPointsCalculated: calculatedFlor,
              pendingCanto: null,
              lastCantoBy: action.userId,
            } as any,
            turnUserId: pendingCanto.previousTurnUserId!,
          };

          if (isGameWon) {
            updatedState.status = 'game_won';
            updatedState.winnerUserId = florWinnerUserId;
          }

          return {
            newState: updatedState,
            isValid: true,
            isGameOver: isGameWon,
            winnerUserId: isGameWon ? florWinnerUserId : null,
            winnerTeamIndex: null,
            isDraw: false,
          };
        }

        // TRUCO / RETRUCO / VALE CUATRO resueltos
        if (['TRUCO', 'RETRUCO', 'VALE_CUATRO'].includes(cType)) {
          const trucoPts = pendingCanto.pointsIfAccepted;
          const nextState: TrucoState = {
            ...state,
            cantoState: {
              ...state.cantoState,
              trucoPoints: trucoPts,
              trucoAccepted: true,
              trucoStatus: 'ACCEPTED',
              pendingCanto: null,
              lastCantoBy: action.userId,
            } as any,
            turnUserId: pendingCanto.previousTurnUserId!, // Restaurar turno para jugar cartas
          };

          return {
            newState: nextState,
            isValid: true,
            isGameOver: false,
            winnerUserId: null,
            winnerTeamIndex: null,
            isDraw: false,
          };
        }
      }

      if (response === 'NO_QUIERO') {
        // ENVIDO declinado -> El que cantó gana el punto base
        if (['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'].includes(cType)) {
          const ptsWon = pendingCanto.pointsIfDeclined;
          const nextPoints = {
            ...state.points,
            [opponentUserId]: (state.points[opponentUserId] || 0) + ptsWon,
          };

          const isGameWon = nextPoints[opponentUserId] >= state.targetPoints;

          let updatedState: TrucoState = {
            ...state,
            points: nextPoints,
            cantoState: {
              ...state.cantoState,
              envidoAccepted: false,
              envidoStatus: 'REJECTED',
              pendingCanto: null,
              lastCantoBy: action.userId,
            } as any,
            turnUserId: pendingCanto.previousTurnUserId!,
          };

          if (isGameWon) {
            updatedState.status = 'game_won';
            updatedState.winnerUserId = opponentUserId;
          }

          return {
            newState: updatedState,
            isValid: true,
            isGameOver: isGameWon,
            winnerUserId: isGameWon ? opponentUserId : null,
            winnerTeamIndex: null,
            isDraw: false,
          };
        }

        // FLOR declinado -> Se asumen los 3 puntos de Flor
        if (cType === 'FLOR') {
          const ptsWon = pendingCanto.pointsIfDeclined;
          const nextPoints = {
            ...state.points,
            [opponentUserId]: (state.points[opponentUserId] || 0) + ptsWon,
          };

          const isGameWon = nextPoints[opponentUserId] >= state.targetPoints;

          let updatedState: TrucoState = {
            ...state,
            points: nextPoints,
            cantoState: {
              ...state.cantoState,
              florStatus: 'REJECTED',
              pendingCanto: null,
              lastCantoBy: action.userId,
            } as any,
            turnUserId: pendingCanto.previousTurnUserId!,
          };

          if (isGameWon) {
            updatedState.status = 'game_won';
            updatedState.winnerUserId = opponentUserId;
          }

          return {
            newState: updatedState,
            isValid: true,
            isGameOver: isGameWon,
            winnerUserId: isGameWon ? opponentUserId : null,
            winnerTeamIndex: null,
            isDraw: false,
          };
        }

        // TRUCO declinado -> La ronda / mano TERMINA INMEDIATAMENTE
        if (['TRUCO', 'RETRUCO', 'VALE_CUATRO'].includes(cType)) {
          const ptsWon = pendingCanto.pointsIfDeclined;
          const nextPoints = {
            ...state.points,
            [opponentUserId]: (state.points[opponentUserId] || 0) + ptsWon,
          };

          const isGameWon = nextPoints[opponentUserId] >= state.targetPoints;

          if (isGameWon) {
            return {
              newState: {
                ...state,
                points: nextPoints,
                status: 'game_won',
                winnerUserId: opponentUserId,
              },
              isValid: true,
              isGameOver: true,
              winnerUserId: opponentUserId,
              winnerTeamIndex: null,
              isDraw: false,
            };
          } else {
            // Rotar el starter de la ronda y barajar de nuevo de forma automática
            const nextStarter = state.playerOrder[(state.playerOrder.indexOf(state.playerOrder[0]) + 1) % state.playerOrder.length];
            const nextRound = this.generateRoundState({
              playerOrder: state.playerOrder,
              playerNames: state.playerNames,
              points: nextPoints,
              targetPoints: state.targetPoints,
            }, nextStarter);

            return {
              newState: nextRound,
              isValid: true,
              isGameOver: false,
              winnerUserId: null,
              winnerTeamIndex: null,
              isDraw: false,
            };
          }
        }
      }
    }

    // ==========================================================================
    // 2. MANEJO DE NUEVOS CANTOS (CANTO)
    // ==========================================================================
    if (action.actionType === 'CANTO') {
      const cantoType = action.actionData.cantoType as string;
      const currentIdx = state.playerOrder.indexOf(action.userId);
      const respondentId = state.playerOrder[(currentIdx + 1) % state.playerOrder.length];

      const newPendingCanto: any = {
        cantoType,
        calledByUserId: action.userId,
        respondByUserId: respondentId,
        previousTurnUserId: state.turnUserId,
        timestamp: Date.now(),
      };

      // Configurar puntos según escala
      if (cantoType === 'ENVIDO') {
        newPendingCanto.pointsIfDeclined = 1;
        newPendingCanto.pointsIfAccepted = 2;
      } else if (cantoType === 'REAL_ENVIDO') {
        const prevCanto = pendingCanto ? pendingCanto.cantoType : null;
        newPendingCanto.pointsIfDeclined = prevCanto === 'ENVIDO' ? 2 : 1;
        newPendingCanto.pointsIfAccepted = prevCanto === 'ENVIDO' ? 5 : 3;
      } else if (cantoType === 'FALTA_ENVIDO') {
        const prevCanto = pendingCanto ? pendingCanto.cantoType : null;
        newPendingCanto.pointsIfDeclined = prevCanto === 'REAL_ENVIDO' ? 5 : prevCanto === 'ENVIDO' ? 2 : 1;
        // La Falta es la diferencia para que gane el que va de líder
        const maxLeaderPoints = Math.max(...Object.values(state.points));
        newPendingCanto.pointsIfAccepted = Math.max(1, state.targetPoints - maxLeaderPoints);
      } else if (cantoType === 'FLOR') {
        newPendingCanto.pointsIfDeclined = 3;
        newPendingCanto.pointsIfAccepted = 3; // Si acepta y el rival tiene, se miden flores
      } else if (cantoType === 'CONTRA_FLOR') {
        newPendingCanto.pointsIfDeclined = 3;
        newPendingCanto.pointsIfAccepted = 6;
      } else if (cantoType === 'CONTRA_FLOR_AL_RESTO') {
        newPendingCanto.pointsIfDeclined = 3;
        const maxLeaderPoints = Math.max(...Object.values(state.points));
        newPendingCanto.pointsIfAccepted = Math.max(1, state.targetPoints - maxLeaderPoints);
      } else if (cantoType === 'TRUCO') {
        newPendingCanto.pointsIfDeclined = 1;
        newPendingCanto.pointsIfAccepted = 3; // Truco Venezolano = 3 pts
      } else if (cantoType === 'RETRUCO') {
        newPendingCanto.pointsIfDeclined = 3; // Truco declinado = 3 pts
        newPendingCanto.pointsIfAccepted = 6;  // Retruco Venezolano = 6 pts
      } else if (cantoType === 'VALE_CUATRO') {
        newPendingCanto.pointsIfDeclined = 6; // Retruco declinado = 6 pts
        newPendingCanto.pointsIfAccepted = 9;  // Vale Cuatro Venezolano = 9 pts
      }

      const nextState: TrucoState = {
        ...state,
        cantoState: {
          ...state.cantoState,
          pendingCanto: newPendingCanto,
          envidoStatus: ['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO'].includes(cantoType) ? 'PENDING' : ((state.cantoState as any).envidoStatus || 'NONE'),
          trucoStatus: ['TRUCO', 'RETRUCO', 'VALE_CUATRO'].includes(cantoType) ? 'PENDING' : ((state.cantoState as any).trucoStatus || 'NONE'),
          florStatus: ['FLOR', 'CONTRA_FLOR', 'CONTRA_FLOR_AL_RESTO'].includes(cantoType) ? 'PENDING' : ((state.cantoState as any).florStatus || 'NONE'),
          lastCantoBy: action.userId,
        } as any,
        turnUserId: respondentId, // Cambiar turno al que debe responder
      };

      return {
        newState: nextState,
        isValid: true,
        isGameOver: false,
        winnerUserId: null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    // ==========================================================================
    // 3. TIRAR CARTA (PLAY_CARD)
    // ==========================================================================
    if (action.actionType === 'PLAY_CARD') {
      const cardId = action.actionData.cardId as string;
      const playedCard = state.hands[action.userId].find((c) => c.id === cardId)!;

      const newHand = state.hands[action.userId].filter((c) => c.id !== cardId);
      const updatedHands = {
        ...state.hands,
        [action.userId]: newHand,
      };

      const currentTrickIndex = state.playedTricks.length - 1;
      const currentTrick = state.playedTricks[currentTrickIndex];

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

        // Calcular si la ronda finaliza (quien gana 2 bazas de las 3, o las bazas parda, etc.)
        const u1 = state.playerOrder[0];
        const u2 = state.playerOrder[1];

        const winsU1 = newTrickWinners.filter((id) => id === u1).length;
        const winsU2 = newTrickWinners.filter((id) => id === u2).length;
        const totalPardas = newTrickWinners.filter((id) => id === null).length;

        let roundWinnerId: string | null = null;
        let isRoundFinished = false;

        if (winsU1 >= 2) {
          roundWinnerId = u1;
          isRoundFinished = true;
        } else if (winsU2 >= 2) {
          roundWinnerId = u2;
          isRoundFinished = true;
        } else if (newTrickWinners.length >= 3) {
          // Si llegamos a 3 bazas, el que ganó más bazas, o en caso de empates el starter de la primera baza
          if (winsU1 > winsU2) roundWinnerId = u1;
          else if (winsU2 > winsU1) roundWinnerId = u2;
          else roundWinnerId = state.playerOrder[0]; // Desempate mano
          isRoundFinished = true;
        } else if (newTrickWinners.length === 2 && winsU1 === 1 && winsU2 === 1 && totalPardas === 0) {
          // Baza 1 y Baza 2 ganadas por distintos, continúa a la Baza 3
        } else if (newTrickWinners.length === 2 && totalPardas === 1) {
          // Si hubo una parda, gana el que gane la otra baza
          const nonPardaWinner = newTrickWinners.find((id) => id !== null);
          if (nonPardaWinner) {
            roundWinnerId = nonPardaWinner;
            isRoundFinished = true;
          }
        } else if (newTrickWinners.length === 1 && totalPardas === 1) {
          // Primera baza parda, el que gane la segunda gana la mano completa
        }

        if (isRoundFinished && roundWinnerId) {
          const handPointsEarned = state.cantoState.trucoPoints;
          const newPoints = {
            ...state.points,
            [roundWinnerId]: (state.points[roundWinnerId] || 0) + handPointsEarned,
          };

          const isGameWon = newPoints[roundWinnerId] >= state.targetPoints;

          if (isGameWon) {
            const finalState: TrucoState = {
              ...state,
              hands: updatedHands,
              playedTricks: updatedPlayedTricks,
              trickWinners: newTrickWinners,
              points: newPoints,
              status: 'game_won',
              winnerUserId: roundWinnerId,
            };

            return {
              newState: finalState,
              isValid: true,
              isGameOver: true,
              winnerUserId: roundWinnerId,
              winnerTeamIndex: null,
              isDraw: false,
            };
          } else {
            // Auto-reset de ronda limpia con el siguiente dealer de mano
            const nextStarter = state.playerOrder[(state.playerOrder.indexOf(state.playerOrder[0]) + 1) % state.playerOrder.length];
            const nextRound = this.generateRoundState({
              playerOrder: state.playerOrder,
              playerNames: state.playerNames,
              points: newPoints,
              targetPoints: state.targetPoints,
            }, nextStarter);

            return {
              newState: nextRound,
              isValid: true,
              isGameOver: false,
              winnerUserId: null,
              winnerTeamIndex: null,
              isDraw: false,
            };
          }
        }

        // Nueva baza intermedia
        const nextTrickNumber = state.playedTricks.length + 1;
        const updatedState: TrucoState = {
          ...state,
          hands: updatedHands,
          playedTricks: [
            ...updatedPlayedTricks,
            { trickNumber: nextTrickNumber, cards: [], winnerUserId: null },
          ],
          trickWinners: newTrickWinners,
          turnUserId: trickWinnerId || nextTurnUserId, // El ganador de la baza anterior sale tirando
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

      // Turno del siguiente jugador en la baza actual
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

    return {
      newState: state,
      isValid: false,
      errorMessage: 'Acción no soportada.',
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
        // Enmascarar las cartas del rival para prevenir espionaje de red
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

  public getBotMove(state: TrucoState, userId: string): GameActionPayload | null {
    if (state.turnUserId !== userId || state.status !== 'playing') return null;
    
    // Si hay un canto pendiente, responder automáticamente de forma defensiva
    const { pendingCanto } = state.cantoState as any;
    if (pendingCanto && pendingCanto.respondByUserId === userId) {
      return {
        sessionId: '',
        userId,
        actionType: 'RESPOND_CANTO',
        actionData: { response: 'QUIERO' },
        clientTimestamp: Date.now(),
      };
    }

    const hand = state.hands[userId] || [];
    if (hand.length > 0) {
      return {
        sessionId: '',
        userId,
        actionType: 'PLAY_CARD',
        actionData: { cardId: hand[0].id },
        clientTimestamp: Date.now(),
      };
    }
    return null;
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

  /**
   * Cálculo determinista server-side de los puntos de Envido venezolanos con Perico y Perica.
   */
  public calculateEnvidoPoints(hand: TrucoCard[], vira: TrucoCard): number {
    const isPerico = (c: TrucoCard) => c.suit === vira.suit && c.number === 11;
    const isPerica = (c: TrucoCard) => c.suit === vira.suit && c.number === 10;

    // Obtener valores individuales de cartas para Envido
    const getEnvidoValue = (c: TrucoCard) => {
      if (isPerico(c)) return 30;
      if (isPerica(c)) return 29;
      if (c.number >= 10) return 0; // Figuras normales valen 0
      return c.number;
    };

    const hasPerico = hand.some(isPerico);
    const hasPerica = hand.some(isPerica);

    // Caso A: Ambas piezas en la mano -> 30 + 29 = 59 puntos fijos
    if (hasPerico && hasPerica) {
      return 59;
    }

    // Caso B: Una sola pieza en la mano
    if (hasPerico || hasPerica) {
      const pieceVal = hasPerico ? 30 : 29;
      const otherCards = hand.filter((c) => !isPerico(c) && !isPerica(c));
      const otherVals = otherCards.map(getEnvidoValue);
      const maxOtherVal = otherVals.length > 0 ? Math.max(...otherVals) : 0;
      return pieceVal + maxOtherVal;
    }

    // Caso C: Sin piezas
    // Agrupar por palo
    const suitGroups: Record<string, TrucoCard[]> = {};
    hand.forEach((c) => {
      if (!suitGroups[c.suit]) suitGroups[c.suit] = [];
      suitGroups[c.suit].push(c);
    });

    let maxEnvido = 0;

    for (const [suit, cards] of Object.entries(suitGroups)) {
      if (cards.length >= 2) {
        // Dos o tres del mismo palo -> 20 + suma de los dos valores más altos de ese palo
        const vals = cards.map(getEnvidoValue).sort((a, b) => b - a);
        const comboVal = 20 + vals[0] + (vals[1] || 0);
        if (comboVal > maxEnvido) maxEnvido = comboVal;
      }
    }

    // Si no hay dos cartas del mismo palo, el Envido es el valor más alto de una sola carta
    if (maxEnvido === 0) {
      const vals = hand.map(getEnvidoValue);
      maxEnvido = vals.length > 0 ? Math.max(...vals) : 0;
    }

    return maxEnvido;
  }

  /**
   * Determina si una mano posee Flor según la variante venezolana.
   */
  public hasFlor(hand: TrucoCard[], vira: TrucoCard): boolean {
    const isPerico = (c: TrucoCard) => c.suit === vira.suit && c.number === 11;
    const isPerica = (c: TrucoCard) => c.suit === vira.suit && c.number === 10;

    const numPieces = hand.filter((c) => isPerico(c) || isPerica(c)).length;

    if (numPieces >= 2) {
      return true; // Dos piezas + cualquier carta es Flor
    }

    if (numPieces === 1) {
      // Una pieza + dos cartas de la misma pinta es Flor
      const normalCards = hand.filter((c) => !isPerico(c) && !isPerica(c));
      return normalCards.length === 2 && normalCards[0].suit === normalCards[1].suit;
    }

    // Sin piezas -> Tres cartas de la misma pinta es Flor
    return hand.length === 3 && hand[0].suit === hand[1].suit && hand[1].suit === hand[2].suit;
  }

  /**
   * Cálculo de los puntos de Flor venezolanos.
   */
  public calculateFlorPoints(hand: TrucoCard[], vira: TrucoCard): number {
    if (!this.hasFlor(hand, vira)) return 0;

    const isPerico = (c: TrucoCard) => c.suit === vira.suit && c.number === 11;
    const isPerica = (c: TrucoCard) => c.suit === vira.suit && c.number === 10;

    const getEnvidoValue = (c: TrucoCard) => {
      if (isPerico(c)) return 30;
      if (isPerica(c)) return 29;
      if (c.number >= 10) return 0;
      return c.number;
    };

    const hasPerico = hand.some(isPerico);
    const hasPerica = hand.some(isPerica);

    if (hasPerico && hasPerica) {
      const thirdCard = hand.find((c) => !isPerico(c) && !isPerica(c))!;
      return 59 + getEnvidoValue(thirdCard);
    }

    if (hasPerico || hasPerica) {
      const pieceVal = hasPerico ? 30 : 29;
      const normalCards = hand.filter((c) => !isPerico(c) && !isPerica(c));
      return pieceVal + getEnvidoValue(normalCards[0]) + getEnvidoValue(normalCards[1]);
    }

    // Tres cartas comunes del mismo palo
    return 20 + getEnvidoValue(hand[0]) + getEnvidoValue(hand[1]) + getEnvidoValue(hand[2]);
  }
}
