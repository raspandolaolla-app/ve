// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: DOMINÓ VENEZOLANO
// ==============================================================================
// Dominó tradicional con tren de juego, paso, trancaíto y conteo de puntos.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { DominoState, DominoTile, DominoPlacedTile, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

const ALL_28_TILES: DominoTile[] = [
  [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
  [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
  [3, 3], [3, 4], [3, 5], [3, 6],
  [4, 4], [4, 5], [4, 6],
  [5, 5], [5, 6],
  [6, 6],
];

export class DominoEngine implements IGameEngine<DominoState> {
  public readonly gameType = 'domino_venezolano';

  public initialize(table: GameTable, players: TablePlayer[]): DominoState {
    const sortedPlayers = [...players].sort((a, b) => a.seatNumber - b.seatNumber);
    const playerOrder = sortedPlayers.map((p) => p.userId);

    // Barajar fichas
    const shuffled = [...ALL_28_TILES].sort(() => Math.random() - 0.5);

    const hands: Record<string, DominoTile[]> = {};
    const playerNames: Record<string, string> = {};
    const cumulativeScores: Record<string, number> = {};

    sortedPlayers.forEach((p, idx) => {
      hands[p.userId] = shuffled.slice(idx * 7, (idx + 1) * 7);
      playerNames[p.userId] = p.displayName || `Jugador ${idx + 1}`;
      cumulativeScores[p.userId] = 0;
    });

    // Encontrar quién tiene la cochina (6-6) para salir en la primera mano
    let startingUserId = playerOrder[0];
    for (const [uId, hand] of Object.entries(hands)) {
      if (hand.some(([a, b]) => a === 6 && b === 6)) {
        startingUserId = uId;
        break;
      }
    }

    const lives: Record<string, number> = {};
    sortedPlayers.forEach((p) => {
      lives[p.userId] = 3;
    });

    return {
      hands,
      board: [],
      leftEnd: null,
      rightEnd: null,
      turnUserId: startingUserId,
      playerOrder,
      playerNames,
      lives,
      targetScore: 50,
      cumulativeScores,
      round: 1,
      passesInRow: 0,
      status: 'playing',
      winnerUserId: null,
      roundWinnerUserId: null,
      isTranca: false,
    };
  }

  public validateAction(state: DominoState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status !== 'playing') {
      return { valid: false, reason: 'La partida no está activa.' };
    }

    if (action.userId !== state.turnUserId) {
      return { valid: false, reason: 'No es tu turno de jugar.' };
    }

    const playerHand = state.hands[action.userId] || [];

    if (action.actionType === 'PLAY_TILE') {
      const tile = action.actionData.tile as DominoTile;
      const side = action.actionData.side as 'left' | 'right' | 'initial';

      if (!tile || tile.length !== 2) {
        return { valid: false, reason: 'Ficha inválida.' };
      }

      // Verificar que el jugador posee la ficha
      const hasTile = playerHand.some(
        ([a, b]) => (a === tile[0] && b === tile[1]) || (a === tile[1] && b === tile[0])
      );
      if (!hasTile) {
        return { valid: false, reason: 'No tienes esta ficha en tu mano.' };
      }

      // Si el tablero está vacío, cualquier ficha es válida
      if (state.board.length === 0) {
        return { valid: true };
      }

      // Validar coincidencia con extremos
      if (side === 'left') {
        if (tile[0] !== state.leftEnd && tile[1] !== state.leftEnd) {
          return { valid: false, reason: `La ficha no empareja con la punta izquierda (${state.leftEnd}).` };
        }
      } else if (side === 'right') {
        if (tile[0] !== state.rightEnd && tile[1] !== state.rightEnd) {
          return { valid: false, reason: `La ficha no empareja con la punta derecha (${state.rightEnd}).` };
        }
      }

      return { valid: true };
    }

    if (action.actionType === 'PASS_TURN') {
      // El jugador solo puede pasar si no tiene NINGUNA ficha jugable
      if (state.board.length === 0) {
        return { valid: false, reason: 'Debes iniciar la mano jugando una ficha.' };
      }

      const hasPlayableTile = playerHand.some(
        ([a, b]) =>
          a === state.leftEnd ||
          b === state.leftEnd ||
          a === state.rightEnd ||
          b === state.rightEnd
      );

      if (hasPlayableTile) {
        return { valid: false, reason: 'No puedes pasar: tienes al menos una ficha que juega en el tablero.' };
      }

      return { valid: true };
    }

    return { valid: false, reason: `Acción no soportada: ${action.actionType}` };
  }

  public applyAction(state: DominoState, action: GameActionPayload): ActionResult<DominoState> {
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

    const currentIdx = state.playerOrder.indexOf(action.userId);
    const nextTurnUserId = state.playerOrder[(currentIdx + 1) % state.playerOrder.length];

    if (action.actionType === 'PLAY_TILE') {
      const tile = action.actionData.tile as DominoTile;
      const requestedSide = (action.actionData.side as 'left' | 'right') || 'right';

      // Remover ficha de la mano
      const newHand = state.hands[action.userId].filter(
        ([a, b]) => !( (a === tile[0] && b === tile[1]) || (a === tile[1] && b === tile[0]) )
      );

      const updatedHands = {
        ...state.hands,
        [action.userId]: newHand,
      };

      let newLeftEnd = state.leftEnd;
      let newRightEnd = state.rightEnd;
      let placedSide: 'left' | 'right' | 'initial' = 'initial';
      let finalTile: DominoTile = [...tile];

      if (state.board.length === 0) {
        newLeftEnd = tile[0];
        newRightEnd = tile[1];
        placedSide = 'initial';
      } else if (requestedSide === 'left') {
        placedSide = 'left';
        if (tile[1] === state.leftEnd) {
          newLeftEnd = tile[0];
          finalTile = [tile[0], tile[1]];
        } else {
          newLeftEnd = tile[1];
          finalTile = [tile[1], tile[0]];
        }
      } else {
        placedSide = 'right';
        if (tile[0] === state.rightEnd) {
          newRightEnd = tile[1];
          finalTile = [tile[0], tile[1]];
        } else {
          newRightEnd = tile[0];
          finalTile = [tile[1], tile[0]];
        }
      }

      const placed: DominoPlacedTile = {
        tile: finalTile,
        side: placedSide,
        flipped: false,
        playedByUserId: action.userId,
      };

      const newBoard = [...state.board, placed];

      // Victoria normal por vaciar mano ("¡Dominó!")
      if (newHand.length === 0) {
        // Sumar puntos restantes de todos los demás jugadores
        let roundPoints = 0;
        for (const [uId, h] of Object.entries(updatedHands)) {
          if (uId !== action.userId) {
            roundPoints += h.reduce((sum, [a, b]) => sum + a + b, 0);
          }
        }

        const newScores = {
          ...state.cumulativeScores,
          [action.userId]: (state.cumulativeScores[action.userId] || 0) + roundPoints,
        };

        const isMatchWon = newScores[action.userId] >= state.targetScore;

        const updatedState: DominoState = {
          ...state,
          hands: updatedHands,
          board: newBoard,
          leftEnd: newLeftEnd,
          rightEnd: newRightEnd,
          passesInRow: 0,
          cumulativeScores: newScores,
          status: isMatchWon ? 'game_won' : 'round_won',
          winnerUserId: isMatchWon ? action.userId : null,
          roundWinnerUserId: action.userId,
          isTranca: false,
        };

        return {
          newState: updatedState,
          isValid: true,
          isGameOver: isMatchWon,
          winnerUserId: isMatchWon ? action.userId : null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      // Continuar juego
      const updatedState: DominoState = {
        ...state,
        hands: updatedHands,
        board: newBoard,
        leftEnd: newLeftEnd,
        rightEnd: newRightEnd,
        turnUserId: nextTurnUserId,
        passesInRow: 0,
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

    if (action.actionType === 'PASS_TURN') {
      const newPasses = state.passesInRow + 1;

      // Si todos los jugadores pasaron consecutivamente -> Trancaíto / Tranca
      if (newPasses >= state.playerOrder.length) {
        // Contar pintas de cada jugador
        const pipCounts: Record<string, number> = {};
        let minPips = Infinity;
        let trancaWinnerId: string | null = null;
        let totalPipsInGame = 0;

        for (const [uId, h] of Object.entries(state.hands)) {
          const pips = h.reduce((sum, [a, b]) => sum + a + b, 0);
          pipCounts[uId] = pips;
          totalPipsInGame += pips;
          if (pips < minPips) {
            minPips = pips;
            trancaWinnerId = uId;
          }
        }

        const newScores = { ...state.cumulativeScores };
        if (trancaWinnerId) {
          newScores[trancaWinnerId] = (newScores[trancaWinnerId] || 0) + totalPipsInGame;
        }

        const isMatchWon = trancaWinnerId !== null && newScores[trancaWinnerId] >= state.targetScore;

        const updatedState: DominoState = {
          ...state,
          passesInRow: newPasses,
          cumulativeScores: newScores,
          status: isMatchWon ? 'game_won' : 'tranca_won',
          winnerUserId: isMatchWon ? trancaWinnerId : null,
          roundWinnerUserId: trancaWinnerId,
          isTranca: true,
        };

        return {
          newState: updatedState,
          isValid: true,
          isGameOver: isMatchWon,
          winnerUserId: isMatchWon ? trancaWinnerId : null,
          winnerTeamIndex: null,
          isDraw: false,
        };
      }

      const updatedState: DominoState = {
        ...state,
        turnUserId: nextTurnUserId,
        passesInRow: newPasses,
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

  public getSanitizedStateForPlayer(state: DominoState, userId: string): DominoState {
    const sanitizedHands: Record<string, DominoTile[]> = {};

    for (const [pId, hand] of Object.entries(state.hands)) {
      if (pId === userId || state.status === 'round_won' || state.status === 'tranca_won' || state.status === 'game_won') {
        sanitizedHands[pId] = hand;
      } else {
        // Ocultar las fichas del rival (reemplazar con fichas boca abajo genéricas)
        sanitizedHands[pId] = hand.map(() => [-1, -1] as DominoTile);
      }
    }

    return {
      ...state,
      hands: sanitizedHands,
    };
  }

  public getBotMove(state: DominoState, userId: string): GameActionPayload | null {
    if (state.turnUserId !== userId || state.status !== 'playing') return null;
    const hand = state.hands[userId] || [];

    if (state.board.length === 0 && hand.length > 0) {
      return {
        sessionId: '',
        userId,
        actionType: 'PLAY_TILE',
        actionData: { tile: hand[0], end: 'left' },
        clientTimestamp: Date.now(),
      };
    }

    for (const tile of hand) {
      const [a, b] = tile;
      if (a === state.leftEnd || b === state.leftEnd) {
        return {
          sessionId: '',
          userId,
          actionType: 'PLAY_TILE',
          actionData: { tile, end: 'left' },
          clientTimestamp: Date.now(),
        };
      }
      if (a === state.rightEnd || b === state.rightEnd) {
        return {
          sessionId: '',
          userId,
          actionType: 'PLAY_TILE',
          actionData: { tile, end: 'right' },
          clientTimestamp: Date.now(),
        };
      }
    }

    return {
      sessionId: '',
      userId,
      actionType: 'PASS_TURN',
      actionData: {},
      clientTimestamp: Date.now(),
    };
  }
}
