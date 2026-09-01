// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: PIEDRA, PAPEL O TIJERA
// ==============================================================================
// Duelo 1v1 con selección simultánea protegida (Commit-Reveal).
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { RPSState, RPSChoice, RPSRoundRecord, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

import { normalizeRPSState } from '../utils/gameStateGuard';

export class RockPaperScissorsEngine implements IGameEngine<RPSState> {
  public readonly gameType = 'rock_paper_scissors';

  public initialize(table: GameTable, players: TablePlayer[]): RPSState {
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

    const p1 = uniquePlayers[0];
    const p2 = uniquePlayers[1];

    const p1UserId = p1?.userId || table.hostUserId;
    const p2UserId = p2?.userId && p2.userId !== p1UserId ? p2.userId : '';

    if (p1UserId && p2UserId && p1UserId === p2UserId) {
      throw new Error('Un jugador no puede ocupar dos puestos en la misma mesa');
    }

    const playerNames: Record<string, string> = {
      [p1UserId]: p1?.displayName || 'Jugador 1',
    };
    if (p2UserId) {
      playerNames[p2UserId] = p2?.displayName || 'Jugador 2';
    }

    const scores: Record<string, number> = {
      [p1UserId]: 0,
    };
    if (p2UserId) {
      scores[p2UserId] = 0;
    }

    const playerChoices: Record<string, { choice?: RPSChoice; committed: boolean; hash?: string }> = {
      [p1UserId]: { committed: false },
    };
    if (p2UserId) {
      playerChoices[p2UserId] = { committed: false };
    }

    return {
      round: 1,
      targetWins: 2, // Al mejor de 3 (primero a 2 victorias)
      scores,
      playerNames,
      playerChoices,
      phase: 'selecting',
      status: 'playing',
      winnerUserId: null,
      roundWinnerUserId: null,
      history: [],
    };
  }

  public validateAction(state: RPSState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status === 'game_won') {
      return { valid: false, reason: 'La partida ya ha finalizado.' };
    }

    if (action.actionType === 'SUBMIT_CHOICE') {
      if (state.phase !== 'selecting') {
        return { valid: false, reason: 'No se están recibiendo selecciones en esta fase.' };
      }

      const choice = action.actionData.choice as RPSChoice;
      if (!['rock', 'paper', 'scissors'].includes(choice)) {
        return { valid: false, reason: 'Opción inválida (debe ser piedra, papel o tijera).' };
      }

      if (state.playerChoices[action.userId]?.committed) {
        return { valid: false, reason: 'Ya has seleccionado tu jugada para esta ronda.' };
      }

      return { valid: true };
    }

    if (action.actionType === 'NEXT_ROUND') {
      if (state.phase !== 'round_result') {
        return { valid: false, reason: 'La ronda actual aún no ha mostrado su resultado.' };
      }
      return { valid: true };
    }

    return { valid: false, reason: `Tipo de acción no soportada: ${action.actionType}` };
  }

  public applyAction(state: RPSState, action: GameActionPayload): ActionResult<RPSState> {
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

    if (action.actionType === 'SUBMIT_CHOICE') {
      const choice = action.actionData.choice as RPSChoice;
      const updatedChoices = {
        ...state.playerChoices,
        [action.userId]: {
          choice,
          committed: true,
        },
      };

      const playerIds = Object.keys(updatedChoices);
      const allCommitted = playerIds.length >= 2 && playerIds.every((id) => updatedChoices[id]?.committed);

      // Si aún falta un jugador por elegir
      if (!allCommitted) {
        const updatedState: RPSState = {
          ...state,
          playerChoices: updatedChoices,
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

      // Ambos jugadores han jugado: Evaluar la ronda
      const [id1, id2] = playerIds;
      const c1 = updatedChoices[id1].choice!;
      const c2 = updatedChoices[id2].choice!;

      const roundResult = this.evaluateDuel(id1, c1, id2, c2, state.playerNames);
      const newScores = { ...state.scores };

      if (roundResult.winnerId) {
        newScores[roundResult.winnerId] = (newScores[roundResult.winnerId] || 0) + 1;
      }

      const isMatchWon =
        roundResult.winnerId !== null && newScores[roundResult.winnerId] >= state.targetWins;

      const roundRecord: RPSRoundRecord = {
        roundNumber: state.round,
        choices: {
          [id1]: c1,
          [id2]: c2,
        },
        winnerUserId: roundResult.winnerId,
        summary: roundResult.summary,
      };

      const updatedState: RPSState = {
        ...state,
        playerChoices: updatedChoices,
        scores: newScores,
        phase: isMatchWon ? 'match_ended' : 'round_result',
        status: isMatchWon ? 'game_won' : 'round_won',
        winnerUserId: isMatchWon ? roundResult.winnerId : null,
        roundWinnerUserId: roundResult.winnerId,
        history: [...state.history, roundRecord],
      };

      return {
        newState: updatedState,
        isValid: true,
        isGameOver: isMatchWon,
        winnerUserId: isMatchWon ? roundResult.winnerId : null,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    if (action.actionType === 'NEXT_ROUND') {
      const resetChoices: Record<string, { choice?: RPSChoice; committed: boolean }> = {};
      Object.keys(state.playerChoices).forEach((id) => {
        resetChoices[id] = { committed: false };
      });

      const updatedState: RPSState = {
        ...state,
        round: state.round + 1,
        playerChoices: resetChoices,
        phase: 'selecting',
        status: 'playing',
        roundWinnerUserId: null,
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
      errorMessage: 'Acción desconocida',
      isGameOver: false,
      winnerUserId: null,
      winnerTeamIndex: null,
      isDraw: false,
    };
  }

  public getSanitizedStateForPlayer(state: RPSState, userId: string): RPSState {
    const normalized = normalizeRPSState(state).state;

    // Si estamos en fase de selección, ocultar la elección del oponente para evitar trampas
    if (normalized.phase === 'selecting') {
      const sanitizedChoices: Record<string, { choice?: RPSChoice; committed: boolean }> = {};
      for (const [pId, pData] of Object.entries(normalized.playerChoices || {})) {
        if (pId === userId) {
          sanitizedChoices[pId] = pData;
        } else {
          sanitizedChoices[pId] = {
            committed: pData?.committed ?? false,
            choice: undefined, // Oculto
          };
        }
      }
      return {
        ...normalized,
        playerChoices: sanitizedChoices,
      };
    }
    return normalized;
  }

  public getBotMove(state: RPSState, userId: string): GameActionPayload | null {
    if (state.phase !== 'selecting') return null;
    const choices: ('rock' | 'paper' | 'scissors')[] = ['rock', 'paper', 'scissors'];
    const randomChoice = choices[Math.floor(Math.random() * choices.length)];
    return {
      sessionId: '',
      userId,
      actionType: 'SUBMIT_CHOICE',
      actionData: { choice: randomChoice },
      clientTimestamp: Date.now(),
    };
  }

  private evaluateDuel(
    id1: string,
    c1: RPSChoice,
    id2: string,
    c2: RPSChoice,
    names: Record<string, string>
  ): { winnerId: string | null; summary: string } {
    const name1 = names[id1] || 'Jugador 1';
    const name2 = names[id2] || 'Jugador 2';

    if (c1 === c2) {
      return {
        winnerId: null,
        summary: `Empate técnico: Ambos jugadores sacaron ${this.translateChoice(c1)}.`,
      };
    }

    if (
      (c1 === 'rock' && c2 === 'scissors') ||
      (c1 === 'scissors' && c2 === 'paper') ||
      (c1 === 'paper' && c2 === 'rock')
    ) {
      return {
        winnerId: id1,
        summary: `¡${name1} gana la ronda! ${this.translateChoice(c1)} vence a ${this.translateChoice(c2)}.`,
      };
    }

    return {
      winnerId: id2,
      summary: `¡${name2} gana la ronda! ${this.translateChoice(c2)} vence a ${this.translateChoice(c1)}.`,
    };
  }

  private translateChoice(choice: RPSChoice): string {
    switch (choice) {
      case 'rock':
        return 'Piedra 🪨';
      case 'paper':
        return 'Papel 📄';
      case 'scissors':
        return 'Tijera ✂️';
    }
  }
}
