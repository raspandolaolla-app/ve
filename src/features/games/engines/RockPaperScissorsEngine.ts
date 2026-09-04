// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: PIEDRA, PAPEL O TIJERA (3 VIDAS)
// ==============================================================================
// Duelo 1v1 con selección simultánea protegida (Commit-Reveal).
// Reglas oficiales de 3 vidas:
// 1. Lógica: Piedra > Tijera, Tijera > Papel, Papel > Piedra.
// 2. Empate: Si ambos eligen lo mismo, nadie pierde vida.
// 3. 3 Vidas: Se resta 1 vida al perdedor. Al llegar a 0 vidas, fin de partida.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { RPSState, RPSChoice, RPSRoundRecord, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';
import { normalizeRPSState } from '../utils/gameStateGuard';

export type { RPSChoice, RPSState };

export function translateChoice(choice: RPSChoice): string {
  switch (choice?.toUpperCase()) {
    case 'ROCK':
      return 'Piedra 🪨';
    case 'PAPER':
      return 'Papel 📄';
    case 'SCISSORS':
      return 'Tijera ✂️';
    default:
      return '❓';
  }
}

export const initializeRPSState = (player1Id: string, player2Id: string): RPSState => {
  return {
    status: 'ROUND_COMMIT',
    player1Id,
    player2Id,
    player1Choice: null,
    player2Choice: null,
    player1Lives: 3, // 3 Vidas iniciales
    player2Lives: 3, // 3 Vidas iniciales
    roundWinner: null,
    matchWinner: null,
    roundNumber: 1,

    // Campos de compatibilidad de plataforma
    round: 1,
    targetWins: 3,
    scores: {
      [player1Id]: 0,
      ...(player2Id ? { [player2Id]: 0 } : {}),
    },
    lives: {
      [player1Id]: 3,
      ...(player2Id ? { [player2Id]: 3 } : {}),
    },
    playerNames: {
      [player1Id]: 'Jugador 1',
      ...(player2Id ? { [player2Id]: 'Jugador 2' } : {}),
    },
    playerChoices: {
      [player1Id]: { committed: false },
      ...(player2Id ? { [player2Id]: { committed: false } } : {}),
    },
    phase: 'selecting',
    winnerUserId: null,
    roundWinnerUserId: null,
    history: [],
  };
};

// Lógica infalible de victoria
export const evaluateRound = (choice1: RPSChoice, choice2: RPSChoice): 'PLAYER1' | 'PLAYER2' | 'DRAW' => {
  if (!choice1 || !choice2) return 'DRAW';
  const c1 = choice1.toUpperCase();
  const c2 = choice2.toUpperCase();
  if (c1 === c2) return 'DRAW'; // EMPATE: Mismas elecciones
  
  // Piedra > Tijera, Papel > Piedra, Tijera > Papel
  if (
    (c1 === 'ROCK' && c2 === 'SCISSORS') ||
    (c1 === 'PAPER' && c2 === 'ROCK') ||
    (c1 === 'SCISSORS' && c2 === 'PAPER')
  ) {
    return 'PLAYER1';
  }
  
  return 'PLAYER2';
};

export const processRPSAction = (state: RPSState, userId: string, choice: RPSChoice): RPSState => {
  if (state.status !== 'ROUND_COMMIT' && state.status !== ('playing' as any)) return state;
  if (state.matchWinner || state.status === 'MATCH_ENDED') return state;

  const isPlayer1 = userId === state.player1Id;
  const isPlayer2 = userId === state.player2Id;

  if (!isPlayer1 && !isPlayer2) return state;

  const newState: RPSState = { ...state };
  const normalizedChoice = choice ? (choice.toUpperCase() as RPSChoice) : null;

  if (isPlayer1) newState.player1Choice = normalizedChoice;
  if (isPlayer2) newState.player2Choice = normalizedChoice;

  // Sincronizar playerChoices para compatibilidad
  const currentChoices = { ...(newState.playerChoices || {}) };
  currentChoices[userId] = { choice: normalizedChoice, committed: true };
  newState.playerChoices = currentChoices;

  // Si ambos han elegido, revelamos y evaluamos
  if (newState.player1Choice && newState.player2Choice) {
    newState.status = 'ROUND_REVEAL';
    newState.phase = 'round_result';
    const roundWinner = evaluateRound(newState.player1Choice, newState.player2Choice);
    newState.roundWinner = roundWinner;

    // Aplicar daño de vidas solo si hay un ganador claro (empates: NADIE pierde vida)
    if (roundWinner === 'PLAYER1') {
      newState.player2Lives = Math.max(0, (newState.player2Lives ?? 3) - 1);
      newState.roundWinnerUserId = newState.player1Id;
    } else if (roundWinner === 'PLAYER2') {
      newState.player1Lives = Math.max(0, (newState.player1Lives ?? 3) - 1);
      newState.roundWinnerUserId = newState.player2Id;
    } else {
      newState.roundWinnerUserId = null;
    }

    if (newState.lives) {
      if (newState.player1Id) newState.lives[newState.player1Id] = newState.player1Lives;
      if (newState.player2Id) newState.lives[newState.player2Id] = newState.player2Lives;
    }

    // Historial descriptivo
    const p1Name = newState.playerNames?.[newState.player1Id] || 'Jugador 1';
    const p2Name = newState.playerNames?.[newState.player2Id] || 'Jugador 2';
    const summary = roundWinner === 'DRAW'
      ? `🤝 Empate: Ambos jugadores sacaron ${translateChoice(newState.player1Choice)}.`
      : roundWinner === 'PLAYER1'
      ? `🎉 ¡${p1Name} gana la ronda! ${translateChoice(newState.player1Choice)} vence a ${translateChoice(newState.player2Choice)}.`
      : `🎉 ¡${p2Name} gana la ronda! ${translateChoice(newState.player2Choice)} vence a ${translateChoice(newState.player1Choice)}.`;

    const roundRecord: RPSRoundRecord = {
      roundNumber: newState.roundNumber || newState.round || 1,
      choices: {
        [newState.player1Id]: newState.player1Choice,
        [newState.player2Id]: newState.player2Choice,
      },
      winnerUserId: newState.roundWinnerUserId,
      summary,
    };
    newState.history = [...(newState.history || []), roundRecord];

    // Verificar condición de victoria del match (al llegar a 0 vidas)
    if (newState.player1Lives <= 0) {
      newState.matchWinner = 'PLAYER2';
      newState.winnerUserId = newState.player2Id;
      newState.status = 'MATCH_ENDED';
      newState.phase = 'match_ended';
    } else if (newState.player2Lives <= 0) {
      newState.matchWinner = 'PLAYER1';
      newState.winnerUserId = newState.player1Id;
      newState.status = 'MATCH_ENDED';
      newState.phase = 'match_ended';
    }
  }

  return newState;
};

// Acción para avanzar a la siguiente ronda (llamada tras 2.5s o por botón)
export const nextRound = (state: RPSState): RPSState => {
  if (state.status !== 'ROUND_REVEAL' && state.phase !== 'round_result') return state;
  if (state.matchWinner || state.status === 'MATCH_ENDED') return state;
  
  const resetChoices: Record<string, { choice?: RPSChoice; committed: boolean }> = {};
  if (state.player1Id) resetChoices[state.player1Id] = { committed: false };
  if (state.player2Id) resetChoices[state.player2Id] = { committed: false };

  const nextRnd = (state.roundNumber || state.round || 1) + 1;

  return {
    ...state,
    status: 'ROUND_COMMIT',
    phase: 'selecting',
    player1Choice: null,
    player2Choice: null,
    playerChoices: resetChoices,
    roundWinner: null,
    roundWinnerUserId: null,
    roundNumber: nextRnd,
    round: nextRnd,
  };
};

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

    const state = initializeRPSState(p1UserId, p2UserId);
    state.playerNames = {
      [p1UserId]: p1?.displayName || 'Jugador 1',
      ...(p2UserId ? { [p2UserId]: p2?.displayName || 'Jugador 2' } : {}),
    };

    return state;
  }

  public validateAction(state: RPSState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status === 'MATCH_ENDED' || state.matchWinner || state.phase === 'match_ended' || state.status === 'game_won') {
      return { valid: false, reason: 'La partida ya ha finalizado.' };
    }

    const actionType = action.actionType;
    if (actionType === 'CHOOSE' || actionType === 'SUBMIT_CHOICE') {
      if (state.status !== 'ROUND_COMMIT' && state.phase !== 'selecting') {
        return { valid: false, reason: 'No se están recibiendo selecciones en esta fase.' };
      }

      const rawChoice = action.actionData?.choice;
      const choice = (rawChoice || '').toString().toUpperCase();
      if (!['ROCK', 'PAPER', 'SCISSORS'].includes(choice)) {
        return { valid: false, reason: 'Opción inválida (debe ser Piedra, Papel o Tijera).' };
      }

      const isP1 = action.userId === state.player1Id;
      const isP2 = action.userId === state.player2Id;
      if (!isP1 && !isP2) {
        return { valid: false, reason: 'No eres jugador de esta mesa.' };
      }

      if ((isP1 && state.player1Choice) || (isP2 && state.player2Choice)) {
        return { valid: false, reason: 'Ya has seleccionado tu jugada para esta ronda.' };
      }

      return { valid: true };
    }

    if (actionType === 'NEXT_ROUND') {
      if (state.status !== 'ROUND_REVEAL' && state.phase !== 'round_result') {
        return { valid: false, reason: 'La ronda actual aún no ha mostrado su resultado.' };
      }
      return { valid: true };
    }

    return { valid: false, reason: `Tipo de acción no soportada: ${actionType}` };
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

    if (action.actionType === 'CHOOSE' || action.actionType === 'SUBMIT_CHOICE') {
      const choice = (action.actionData?.choice || '').toString().toUpperCase() as RPSChoice;
      const newState = processRPSAction(state, action.userId, choice);

      const isGameOver = newState.status === 'MATCH_ENDED' || Boolean(newState.matchWinner);
      const winnerUserId = newState.matchWinner === 'PLAYER1' 
        ? newState.player1Id 
        : newState.matchWinner === 'PLAYER2' 
        ? newState.player2Id 
        : newState.winnerUserId || null;

      return {
        newState,
        isValid: true,
        isGameOver,
        winnerUserId,
        winnerTeamIndex: null,
        isDraw: false,
      };
    }

    if (action.actionType === 'NEXT_ROUND') {
      const newState = nextRound(state);
      return {
        newState,
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

    // Si estamos en fase de selección/commit, ocultar la elección del oponente
    if (normalized.status === 'ROUND_COMMIT' || normalized.phase === 'selecting') {
      const sanitized = { ...normalized };
      if (userId === normalized.player1Id) {
        sanitized.player2Choice = null;
      } else if (userId === normalized.player2Id) {
        sanitized.player1Choice = null;
      }

      if (sanitized.playerChoices) {
        const sanitizedChoices: Record<string, { choice?: RPSChoice; committed: boolean }> = {};
        for (const [pId, pData] of Object.entries(sanitized.playerChoices)) {
          if (pId === userId) {
            sanitizedChoices[pId] = pData;
          } else {
            sanitizedChoices[pId] = {
              committed: pData?.committed ?? false,
              choice: null,
            };
          }
        }
        sanitized.playerChoices = sanitizedChoices;
      }
      return sanitized;
    }
    return normalized;
  }

  public getBotMove(state: RPSState, userId: string): GameActionPayload | null {
    if (state.status !== 'ROUND_COMMIT' && state.phase !== 'selecting') return null;
    const choices: RPSChoice[] = ['ROCK', 'PAPER', 'SCISSORS'];
    const randomChoice = choices[Math.floor(Math.random() * choices.length)];
    return {
      sessionId: '',
      userId,
      actionType: 'CHOOSE',
      actionData: { choice: randomChoice },
      clientTimestamp: Date.now(),
    };
  }
}
