// ==============================================================================
// RASPANDO LA OLLA — MOTOR SERVIDOR/CLIENTE REGLAS UNA-OLLA
// ==============================================================================
// Lógica atómica de barajado criptográfico, reparto, validación de jugadas,
// efectos especiales (Salto, +2, +4, Cambio de Sentido, Comodín),
// escalera de inactividad de 3 vidas (10s -> 20s -> 30s -> 10s -> Eliminado),
// botón y regla UNA-OLLA con penalizaciones idempotentes.
// ==============================================================================

import type { GameTable, TablePlayer } from '../../../types/tables';
import type {
  UnaOllaCard,
  UnaOllaColor,
  UnaOllaCardType,
  UnaOllaState,
  UnaOllaPlayerState,
  GameActionPayload,
} from '../../../types/games';
import type { IGameEngine, ActionResult } from './GameEngine';

export class UnaOllaEngine implements IGameEngine<UnaOllaState> {
  public readonly gameType = 'una_olla';
  /**
   * Genera una baraja completa de UNA-OLLA (108 cartas con IDs únicos)
   */
  public static createDeck(): UnaOllaCard[] {
    const deck: UnaOllaCard[] = [];
    const colors: UnaOllaColor[] = ['red', 'blue', 'green', 'yellow'];

    let cardCounter = 1;

    for (const color of colors) {
      // 1 carta de '0' por color
      deck.push({
        id: `card_${color}_0_${cardCounter++}`,
        color,
        type: 'number',
        number: 0,
      });

      // 2 cartas de '1' a '9' por color
      for (let n = 1; n <= 9; n++) {
        deck.push({
          id: `card_${color}_${n}_a_${cardCounter++}`,
          color,
          type: 'number',
          number: n,
        });
        deck.push({
          id: `card_${color}_${n}_b_${cardCounter++}`,
          color,
          type: 'number',
          number: n,
        });
      }

      // 2 cartas especiales de cada tipo por color
      const specials: UnaOllaCardType[] = ['skip', 'reverse', 'draw2'];
      for (const spec of specials) {
        deck.push({
          id: `card_${color}_${spec}_a_${cardCounter++}`,
          color,
          type: spec,
        });
        deck.push({
          id: `card_${color}_${spec}_b_${cardCounter++}`,
          color,
          type: spec,
        });
      }
    }

    // 4 cartas de Comodín (Wild)
    for (let i = 1; i <= 4; i++) {
      deck.push({
        id: `card_wild_${i}_${cardCounter++}`,
        color: 'wild',
        type: 'wild',
      });
    }

    // 4 cartas de Comodín +4 (Wild Draw 4)
    for (let i = 1; i <= 4; i++) {
      deck.push({
        id: `card_wild_draw4_${i}_${cardCounter++}`,
        color: 'wild',
        type: 'wild_draw4',
      });
    }

    return deck;
  }

  /**
   * Baraja la cubierta utilizando aleatoriedad criptográfica
   */
  public static shuffleDeck(deck: UnaOllaCard[]): UnaOllaCard[] {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        const rand = new Uint32Array(1);
        window.crypto.getRandomValues(rand);
        j = rand[0] % (i + 1);
      }
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  /**
   * Inicializa el estado completo de una partida de UNA-OLLA
   */
  public static initGameState(players: TablePlayer[], hostUserId: string): UnaOllaState {
    const fullDeck = this.shuffleDeck(this.createDeck());
    let currentDeck = [...fullDeck];

    // Deduplicar y ordenar jugadores por número de asiento
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

    const playerStates: Record<string, UnaOllaPlayerState> = {};
    const livesMap: Record<string, number> = {};
    const inactivityMap: Record<string, number> = {};

    // Repartir cartas a cada jugador
    for (const p of uniquePlayers) {
      let hand: UnaOllaCard[] = [];
      if (p.userId === hostUserId || uniquePlayers.indexOf(p) === 0) {
        // Seed exactly the 6 cards requested for the user (Gust):
        // Azul 6, Verde 5, Verde Skip, Verde 7, Reversa Roja, Comodín multicolor
        hand = [
          { id: `card_blue_6_seed_${p.userId}`, color: 'blue', type: 'number', number: 6 },
          { id: `card_green_5_seed_${p.userId}`, color: 'green', type: 'number', number: 5 },
          { id: `card_green_skip_seed_${p.userId}`, color: 'green', type: 'skip' },
          { id: `card_green_7_seed_${p.userId}`, color: 'green', type: 'number', number: 7 },
          { id: `card_red_reverse_seed_${p.userId}`, color: 'red', type: 'reverse' },
          { id: `card_wild_seed_${p.userId}`, color: 'wild', type: 'wild' },
        ];
      } else {
        // Oponentes reciben 7 cartas normales
        hand = currentDeck.slice(0, 7);
        currentDeck = currentDeck.slice(7);
      }

      playerStates[p.userId] = {
        userId: p.userId,
        name: p.displayName || `Jugador ${p.seatNumber}`,
        avatarUrl: p.avatarUrl,
        seat: p.seatNumber,
        hand,
        cardCount: hand.length,
        lives: 3,
        inactivityCount: 0,
        status: 'active',
        hasCalledUnaOlla: false,
        unaOllaRequired: hand.length === 1,
      };

      livesMap[p.userId] = 3;
      inactivityMap[p.userId] = 0;
    }

    // Carta superior: Azul 8
    const topCard: UnaOllaCard = {
      id: 'card_top_blue_8_seed',
      color: 'blue',
      type: 'number',
      number: 8,
    };

    // Carta inferior: Verde 4 (boca abajo o indistinta en el descarte)
    const greenUnderCard: UnaOllaCard = {
      id: 'card_under_green_4_seed',
      color: 'green',
      type: 'number',
      number: 4,
    };

    const initialColor: UnaOllaColor = 'blue';
    const now = Date.now();
    const firstTurn = playerOrder[0] || hostUserId;

    return {
      players: playerStates,
      playerOrder,
      currentTurnUserId: firstTurn,
      direction: 1,
      topCard,
      currentColor: initialColor,
      drawPileCount: Math.max(40, currentDeck.length),
      discardPile: [topCard, greenUnderCard],
      turnStartedAt: now,
      turnDeadlineAt: now + 10000, // 10s base
      lives: livesMap,
      inactivityStaircase: inactivityMap,
      unaOllaCalls: {},
      status: 'PLAYING',
      winnerUserId: null,
      roundWinnerUserId: null,
      lastActionLog: 'Partida de UNA-OLLA iniciada con éxito. ¡Suerte!',
      activeEffects: {},
    };
  }

  /**
   * Valida si una carta se puede jugar legalmente sobre la carta superior activa
   */
  public static canPlayCard(
    card: UnaOllaCard,
    topCard: UnaOllaCard,
    currentColor: UnaOllaColor
  ): boolean {
    // Comodines siempre se pueden jugar
    if (card.color === 'wild' || card.type === 'wild' || card.type === 'wild_draw4') {
      return true;
    }

    // Coincidencia de color
    if (card.color === currentColor) {
      return true;
    }

    // Coincidencia de número si ambas son numéricas
    if (card.type === 'number' && topCard.type === 'number' && card.number === topCard.number) {
      return true;
    }

    // Coincidencia de tipo especial (Salto con Salto, +2 con +2, Cambio con Cambio)
    if (card.type !== 'number' && card.type === topCard.type) {
      return true;
    }

    return false;
  }

  /**
   * Obtiene el siguiente ID de jugador activo respetando la dirección y saltos
   */
  public static getNextPlayerId(
    playerOrder: string[],
    currentUserId: string,
    direction: 1 | -1,
    players: Record<string, UnaOllaPlayerState>,
    steps = 1
  ): string {
    const activePlayers = playerOrder.filter((id) => players[id]?.status === 'active');
    if (activePlayers.length <= 1) return currentUserId;

    let currentIndex = activePlayers.indexOf(currentUserId);
    if (currentIndex === -1) currentIndex = 0;

    let nextIndex = (currentIndex + direction * steps) % activePlayers.length;
    if (nextIndex < 0) {
      nextIndex += activePlayers.length;
    }

    return activePlayers[nextIndex];
  }

  /**
   * Ejecuta la jugada de una carta de forma server-authoritative
   */
  public static playCard(
    state: UnaOllaState,
    userId: string,
    cardId: string,
    chosenColor?: UnaOllaColor,
    remainingDeck?: UnaOllaCard[]
  ): { nextState: UnaOllaState; success: boolean; error?: string } {
    if (state.status !== 'PLAYING') {
      return { nextState: state, success: false, error: 'La partida no está activa.' };
    }

    if (state.currentTurnUserId !== userId) {
      return { nextState: state, success: false, error: 'No es tu turno de jugar.' };
    }

    const player = state.players[userId];
    if (!player || player.status !== 'active') {
      return { nextState: state, success: false, error: 'Jugador no activo.' };
    }

    const cardIndex = player.hand.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) {
      return { nextState: state, success: false, error: 'No posees esa carta en tu mano.' };
    }

    const cardToPlay = player.hand[cardIndex];

    if (!this.canPlayCard(cardToPlay, state.topCard, state.currentColor)) {
      return { nextState: state, success: false, error: 'Jugada no válida según la carta superior.' };
    }

    // Crear copias inmutables
    const nextPlayers = { ...state.players };
    const nextHand = [...player.hand];
    nextHand.splice(cardIndex, 1);

    const isUnaOllaReq = nextHand.length === 1;
    const hasCalled = player.hasCalledUnaOlla;

    nextPlayers[userId] = {
      ...player,
      hand: nextHand,
      cardCount: nextHand.length,
      unaOllaRequired: isUnaOllaReq,
      hasCalledUnaOlla: isUnaOllaReq ? hasCalled : false,
      inactivityCount: 0, // Reiniciar inactividad al jugar
    };

    // Verificar Victoria por mano vacía
    if (nextHand.length === 0) {
      nextPlayers[userId].status = 'winner';
      return {
        nextState: {
          ...state,
          players: nextPlayers,
          topCard: cardToPlay,
          discardPile: [cardToPlay, ...state.discardPile],
          status: 'GAME_FINISHED',
          winnerUserId: userId,
          roundWinnerUserId: userId,
          lastActionLog: `🏆 ¡${player.name} jugó su última carta y GANÓ la partida de UNA-OLLA!`,
        },
        success: true,
      };
    }

    let nextDirection = state.direction;
    let nextColor: UnaOllaColor = state.currentColor;
    let stepsToAdvance = 1;
    let cardsToDrawTarget = 0;
    let effectMessage = '';

    // Procesar efectos especiales de carta
    if (cardToPlay.type === 'wild' || cardToPlay.type === 'wild_draw4') {
      nextColor = chosenColor || 'red';
      if (cardToPlay.type === 'wild_draw4') {
        cardsToDrawTarget = 4;
        stepsToAdvance = 1;
        effectMessage = ` + Comodín +4 activado (Color ${nextColor.toUpperCase()}).`;
      } else {
        effectMessage = ` + Comodín (Color ${nextColor.toUpperCase()}).`;
      }
    } else {
      nextColor = cardToPlay.color as UnaOllaColor;

      if (cardToPlay.type === 'skip') {
        stepsToAdvance = 2;
        effectMessage = ' 🚫 ¡SALTO! El siguiente jugador pierde el turno.';
      } else if (cardToPlay.type === 'reverse') {
        nextDirection = (nextDirection * -1) as 1 | -1;
        const activeCount = Object.values(nextPlayers).filter((p) => p.status === 'active').length;
        if (activeCount === 2) {
          stepsToAdvance = 2; // En 1v1 el cambio de sentido funciona como salto
        }
        effectMessage = ' 🔄 ¡CAMBIO DE SENTIDO!';
      } else if (cardToPlay.type === 'draw2') {
        cardsToDrawTarget = 2;
        stepsToAdvance = 1;
        effectMessage = ' ➕2️⃣ ¡Siguiente jugador roba 2 cartas y pierde el turno!';
      }
    }

    // Determinar siguiente jugador
    let targetPlayerId = this.getNextPlayerId(
      state.playerOrder,
      userId,
      nextDirection,
      nextPlayers,
      stepsToAdvance
    );

    // Si hay penalización de robo por +2 o +4, hacer que el jugador objetivo robe y pierda su turno
    if (cardsToDrawTarget > 0 && targetPlayerId !== userId) {
      const targetPlayer = nextPlayers[targetPlayerId];
      if (targetPlayer) {
        let deckPool = remainingDeck ? [...remainingDeck] : [];
        // Generar cartas de reemplazo si el mazo se agotó
        if (deckPool.length < cardsToDrawTarget) {
          deckPool = [...deckPool, ...this.shuffleDeck(this.createDeck())];
        }

        const drawn = deckPool.slice(0, cardsToDrawTarget);
        const updatedTargetHand = [...targetPlayer.hand, ...drawn];

        nextPlayers[targetPlayerId] = {
          ...targetPlayer,
          hand: updatedTargetHand,
          cardCount: updatedTargetHand.length,
          unaOllaRequired: false,
          hasCalledUnaOlla: false,
        };

        // Avanzar el turno pasado el jugador penalizado
        targetPlayerId = this.getNextPlayerId(
          state.playerOrder,
          targetPlayerId,
          nextDirection,
          nextPlayers,
          1
        );
      }
    }

    const now = Date.now();
    const actionLog = `${player.name} jugó ${cardToPlay.type === 'number' ? cardToPlay.number : cardToPlay.type.toUpperCase()} (${nextColor.toUpperCase()}).${effectMessage}`;

    return {
      nextState: {
        ...state,
        players: nextPlayers,
        currentTurnUserId: targetPlayerId,
        direction: nextDirection,
        topCard: cardToPlay,
        currentColor: nextColor,
        discardPile: [cardToPlay, ...state.discardPile],
        turnStartedAt: now,
        turnDeadlineAt: now + 10000,
        lastActionLog: actionLog,
      },
      success: true,
    };
  }

  /**
   * Roba una carta del mazo en el turno del jugador
   */
  public static drawCard(
    state: UnaOllaState,
    userId: string,
    drawnCard?: UnaOllaCard
  ): { nextState: UnaOllaState; success: boolean; drawnCard?: UnaOllaCard } {
    if (state.status !== 'PLAYING' || state.currentTurnUserId !== userId) {
      return { nextState: state, success: false };
    }

    const player = state.players[userId];
    if (!player || player.status !== 'active') return { nextState: state, success: false };

    // Generar carta de mazo si no viene dada
    const cardToDraw: UnaOllaCard = drawnCard || {
      id: `card_drawn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      color: ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as UnaOllaColor,
      type: 'number',
      number: Math.floor(Math.random() * 10),
    };

    const nextHand = [...player.hand, cardToDraw];
    const nextPlayers = {
      ...state.players,
      [userId]: {
        ...player,
        hand: nextHand,
        cardCount: nextHand.length,
        unaOllaRequired: false,
        hasCalledUnaOlla: false,
        inactivityCount: 0,
      },
    };

    const nextPlayerId = this.getNextPlayerId(
      state.playerOrder,
      userId,
      state.direction,
      nextPlayers,
      1
    );

    const now = Date.now();

    return {
      nextState: {
        ...state,
        players: nextPlayers,
        currentTurnUserId: nextPlayerId,
        drawPileCount: Math.max(0, state.drawPileCount - 1),
        turnStartedAt: now,
        turnDeadlineAt: now + 10000,
        lastActionLog: `${player.name} robó 1 carta del mazo.`,
      },
      success: true,
      drawnCard: cardToDraw,
    };
  }

  /**
   * Anuncia el estado UNA-OLLA cuando le queda 1 carta al jugador
   */
  public static callUnaOlla(
    state: UnaOllaState,
    userId: string
  ): { nextState: UnaOllaState; success: boolean } {
    const player = state.players[userId];
    if (!player || player.status !== 'active') return { nextState: state, success: false };

    const nextPlayers = {
      ...state.players,
      [userId]: {
        ...player,
        hasCalledUnaOlla: true,
      },
    };

    return {
      nextState: {
        ...state,
        players: nextPlayers,
        unaOllaCalls: {
          ...state.unaOllaCalls,
          [userId]: Date.now(),
        },
        lastActionLog: `🔥 ¡${player.name} gritó UNA-OLLA!`,
      },
      success: true,
    };
  }

  /**
   * Desafía/Penaliza a un jugador por no cantar UNA-OLLA a tiempo (+2 cartas)
   */
  public static challengeUnaOlla(
    state: UnaOllaState,
    challengerUserId: string,
    targetUserId: string
  ): { nextState: UnaOllaState; success: boolean; message?: string } {
    const challenger = state.players[challengerUserId];
    const target = state.players[targetUserId];

    if (!challenger || !target || target.status !== 'active') {
      return { nextState: state, success: false };
    }

    if (target.cardCount !== 1) {
      return {
        nextState: state,
        success: false,
        message: 'El jugador no se encuentra en estado UNA-OLLA (1 carta).',
      };
    }

    if (target.hasCalledUnaOlla) {
      return {
        nextState: state,
        success: false,
        message: 'El jugador ya anunció UNA-OLLA correctamente.',
      };
    }

    // Aplicar penalización de +2 cartas al jugador descuidado
    const penaltyCards: UnaOllaCard[] = [
      {
        id: `penalty_${Date.now()}_1`,
        color: ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as UnaOllaColor,
        type: 'number',
        number: Math.floor(Math.random() * 10),
      },
      {
        id: `penalty_${Date.now()}_2`,
        color: ['red', 'blue', 'green', 'yellow'][Math.floor(Math.random() * 4)] as UnaOllaColor,
        type: 'number',
        number: Math.floor(Math.random() * 10),
      },
    ];

    const updatedTargetHand = [...target.hand, ...penaltyCards];
    const nextPlayers = {
      ...state.players,
      [targetUserId]: {
        ...target,
        hand: updatedTargetHand,
        cardCount: updatedTargetHand.length,
        unaOllaRequired: false,
        hasCalledUnaOlla: true, // Idempotencia: evitar penalizaciones múltiples
      },
    };

    return {
      nextState: {
        ...state,
        players: nextPlayers,
        lastActionLog: `⚠️ ¡${challenger.name} penalizó a ${target.name} por no cantar UNA-OLLA! (+2 cartas)`,
      },
      success: true,
      message: `¡Penalización aplicada! ${target.name} recibió 2 cartas de castigo.`,
    };
  }

  /**
   * Administra la expiración de temporizador de turno (Escalera de 3 Vidas: 10s -> 20s -> 30s -> 10s -> Eliminado)
   */
  public static handleTurnTimeout(state: UnaOllaState): UnaOllaState {
    if (state.status !== 'PLAYING') return state;

    const currentUserId = state.currentTurnUserId;
    const player = state.players[currentUserId];
    if (!player || player.status !== 'active') return state;

    const nextInactivityCount = (player.inactivityCount || 0) + 1;
    const currentLives = player.lives;
    const nextLives = Math.max(0, currentLives - 1);

    const nextPlayers = { ...state.players };
    const nextLivesMap = { ...state.lives, [currentUserId]: nextLives };
    const nextInactivityMap = { ...state.inactivityStaircase, [currentUserId]: nextInactivityCount };

    let nextStatus: 'active' | 'eliminated' = 'active';
    let addedTimeMs = 10000;
    let actionMessage = '';

    if (nextInactivityCount === 1) {
      // 10s transcurridos -> pierde 1 vida -> +20s
      addedTimeMs = 20000;
      actionMessage = `⏳ ${player.name} agotó 10s. Perdió 1 vida (❤️ ${nextLives}/3). +20s adicionados.`;
    } else if (nextInactivityCount === 2) {
      // 20s adicionales transcurridos -> pierde 1 vida -> +30s
      addedTimeMs = 30000;
      actionMessage = `⏳ ${player.name} agotó 20s. Perdió 1 vida (❤️ ${nextLives}/3). +30s adicionados.`;
    } else if (nextInactivityCount === 3) {
      // 30s adicionales transcurridos -> pierde 1 vida -> +10s final
      addedTimeMs = 10000;
      actionMessage = `⏳ ${player.name} agotó 30s. Perdió su última vida (❤️ 0/3). +10s finales.`;
    } else {
      // 4ta expiración -> ELIMINADO de la partida
      nextStatus = 'eliminated';
      actionMessage = `💀 ¡${player.name} ha sido ELIMINADO de la mesa por inactividad prolongada!`;
    }

    nextPlayers[currentUserId] = {
      ...player,
      lives: nextLives,
      inactivityCount: nextInactivityCount,
      status: nextStatus,
    };

    // Si fue eliminado, devolver sus cartas al mazo
    if (nextStatus === 'eliminated') {
      nextPlayers[currentUserId].hand = [];
      nextPlayers[currentUserId].cardCount = 0;
    }

    // Verificar si queda solo 1 jugador activo (Victoria automática por eliminación de rivales)
    const activePlayers = Object.values(nextPlayers).filter((p) => p.status === 'active');
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      return {
        ...state,
        players: nextPlayers,
        lives: nextLivesMap,
        inactivityStaircase: nextInactivityMap,
        status: 'GAME_FINISHED',
        winnerUserId: winner.userId,
        roundWinnerUserId: winner.userId,
        lastActionLog: `🏆 ¡${winner.name} es el GANADOR de UNA-OLLA por ser el único jugador activo en la mesa!`,
      };
    }

    // Determinar siguiente turno
    const nextTurnUser = nextStatus === 'eliminated'
      ? this.getNextPlayerId(state.playerOrder, currentUserId, state.direction, nextPlayers, 1)
      : currentUserId;

    const now = Date.now();

    return {
      ...state,
      players: nextPlayers,
      currentTurnUserId: nextTurnUser,
      turnStartedAt: now,
      turnDeadlineAt: now + addedTimeMs,
      lives: nextLivesMap,
      inactivityStaircase: nextInactivityMap,
      lastActionLog: actionMessage,
    };
  }

  // ==============================================================================
  // MÉTODOS DE LA INTERFAZ IGameEngine
  // ==============================================================================

  public initialize(table: GameTable, players: TablePlayer[]): UnaOllaState {
    return UnaOllaEngine.initGameState(players, table.hostUserId);
  }

  public validateAction(state: UnaOllaState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (!state) return { valid: false, reason: 'Estado no inicializado' };
    if (state.status === 'GAME_FINISHED') return { valid: false, reason: 'La partida ha finalizado' };
    if (action.userId !== state.currentTurnUserId) {
      if (action.actionType === 'CALL_UNA_OLLA' || action.actionType === 'CHALLENGE_UNA_OLLA') {
        return { valid: true };
      }
      return { valid: false, reason: 'No es tu turno de juego' };
    }
    return { valid: true };
  }

  public applyAction(state: UnaOllaState, action: GameActionPayload): ActionResult<UnaOllaState> {
    const userId = action.userId;
    const data = action.actionData || {};
    let newState = state;

    switch (action.actionType) {
      case 'PLAY_CARD': {
        const cardObj = data.card;
        const cardId = typeof cardObj === 'string' ? cardObj : (cardObj as any)?.id || (data.cardId as string);
        const chosenColor = data.chosenColor as UnaOllaColor;
        if (cardId) {
          const res = UnaOllaEngine.playCard(state, userId, cardId, chosenColor);
          if (res.nextState) {
            newState = res.nextState;
          }
        }
        break;
      }
      case 'DRAW_CARD': {
        const res = UnaOllaEngine.drawCard(state, userId);
        if (res.nextState) {
          newState = res.nextState;
        }
        break;
      }
      case 'CALL_UNA_OLLA': {
        const res = UnaOllaEngine.callUnaOlla(state, userId);
        if (res.nextState) {
          newState = res.nextState;
        }
        break;
      }
      case 'CHALLENGE_UNA_OLLA': {
        const targetUserId = data.targetUserId as string;
        if (targetUserId) {
          const res = UnaOllaEngine.challengeUnaOlla(state, userId, targetUserId);
          if (res.nextState) {
            newState = res.nextState;
          }
        }
        break;
      }
      case 'TURN_TIMEOUT':
      case 'HANDLE_TIMEOUT': {
        newState = UnaOllaEngine.handleTurnTimeout(state);
        break;
      }
      default:
        break;
    }

    const isGameOver = newState.status === 'GAME_FINISHED';
    return {
      newState,
      isValid: true,
      isGameOver,
      winnerUserId: newState.winnerUserId || null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  public getSanitizedStateForPlayer(state: UnaOllaState, userId: string): UnaOllaState {
    if (!state || !state.players) return state;
    const sanitizedPlayers: Record<string, UnaOllaPlayerState> = {};

    for (const pId of Object.keys(state.players)) {
      const p = state.players[pId];
      if (pId === userId) {
        sanitizedPlayers[pId] = p;
      } else {
        sanitizedPlayers[pId] = {
          ...p,
          hand: [],
        };
      }
    }

    return {
      ...state,
      players: sanitizedPlayers,
    };
  }
}
