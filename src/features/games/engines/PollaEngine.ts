// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE JUEGO: POLLA VENEZOLANA (QUINIELA)
// ==============================================================================
// Pronósticos deportivos, puntuación por acierto exacto/resultado y tabla de líderes.
// ==============================================================================

import type { IGameEngine, ActionResult } from './GameEngine';
import type { PollaState, PollaFixture, PollaPrediction, GameActionPayload } from '../../../types/games';
import type { GameTable, TablePlayer } from '../../../types/tables';

const DEFAULT_FIXTURES: PollaFixture[] = [
  { id: 'fix_1', homeTeam: 'Leones del Caracas', awayTeam: 'Navegantes del Magallanes', category: 'LVBP Béisbol', date: 'Hoy 19:00' },
  { id: 'fix_2', homeTeam: 'Tiburones de La Guaira', awayTeam: 'Cardenales de Lara', category: 'LVBP Béisbol', date: 'Hoy 19:30' },
  { id: 'fix_3', homeTeam: 'Caracas FC', awayTeam: 'Deportivo Táchira', category: 'Liga FUTVE', date: 'Mañana 17:00' },
  { id: 'fix_4', homeTeam: 'Venezuela (La Vinotinto)', awayTeam: 'Colombia', category: 'Eliminatorias', date: 'Viernes 18:00' },
];

export class PollaEngine implements IGameEngine<PollaState> {
  public readonly gameType = 'polla_venezolana';

  public initialize(table: GameTable, players: TablePlayer[]): PollaState {
    const playerNames: Record<string, string> = {};
    const predictions: Record<string, PollaPrediction[]> = {};
    const leaderboard: PollaState['leaderboard'] = [];

    players.forEach((p) => {
      playerNames[p.userId] = p.displayName || `Jugador ${p.seatNumber}`;
      predictions[p.userId] = [];
      leaderboard.push({
        userId: p.userId,
        points: 0,
        correctExact: 0,
        correctOutcome: 0,
      });
    });

    return {
      fixtures: DEFAULT_FIXTURES,
      predictions,
      playerNames,
      leaderboard,
      status: 'open_picks',
      winnerUserId: null,
    };
  }

  public validateAction(state: PollaState, action: GameActionPayload): { valid: boolean; reason?: string } {
    if (state.status === 'settled') {
      return { valid: false, reason: 'La polla ya ha sido liquidada.' };
    }

    if (action.actionType === 'SUBMIT_PREDICTIONS') {
      const picks = action.actionData.predictions as PollaPrediction[];
      if (!Array.isArray(picks) || picks.length === 0) {
        return { valid: false, reason: 'Debes enviar al menos un pronóstico.' };
      }
      return { valid: true };
    }

    if (action.actionType === 'RESOLVE_MATCHES') {
      return { valid: true };
    }

    return { valid: false, reason: `Acción no soportada: ${action.actionType}` };
  }

  public applyAction(state: PollaState, action: GameActionPayload): ActionResult<PollaState> {
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

    if (action.actionType === 'SUBMIT_PREDICTIONS') {
      const picks = action.actionData.predictions as PollaPrediction[];
      const updatedPredictions = {
        ...state.predictions,
        [action.userId]: picks,
      };

      const updatedState: PollaState = {
        ...state,
        predictions: updatedPredictions,
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

    if (action.actionType === 'RESOLVE_MATCHES') {
      // Generar resultados oficiales
      const updatedFixtures = state.fixtures.map((f) => {
        const homeScore = Math.floor(Math.random() * 6);
        const awayScore = Math.floor(Math.random() * 6);
        return {
          ...f,
          result: {
            homeScore,
            awayScore,
            status: 'finished' as const,
          },
        };
      });

      // Calcular puntos para cada participante
      const updatedLeaderboard = Object.entries(state.predictions).map(([uId, picks]) => {
        let points = 0;
        let correctExact = 0;
        let correctOutcome = 0;

        picks.forEach((pick) => {
          const fix = updatedFixtures.find((f) => f.id === pick.fixtureId);
          if (fix && fix.result) {
            const actualHome = fix.result.homeScore;
            const actualAway = fix.result.awayScore;

            const actualOutcome = actualHome > actualAway ? 'HOME' : actualHome < actualAway ? 'AWAY' : 'DRAW';

            // Acierto exacto: 3 puntos
            if (pick.predictedHomeScore === actualHome && pick.predictedAwayScore === actualAway) {
              points += 3;
              correctExact++;
            }
            // Acierto de resultado/ganador: 1 punto
            else if (pick.pick === actualOutcome) {
              points += 1;
              correctOutcome++;
            }
          }
        });

        return {
          userId: uId,
          points,
          correctExact,
          correctOutcome,
        };
      });

      updatedLeaderboard.sort((a, b) => b.points - a.points);
      const topWinner = updatedLeaderboard[0]?.userId || null;

      const updatedState: PollaState = {
        ...state,
        fixtures: updatedFixtures,
        leaderboard: updatedLeaderboard,
        status: 'settled',
        winnerUserId: topWinner,
      };

      return {
        newState: updatedState,
        isValid: true,
        isGameOver: true,
        winnerUserId: topWinner,
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

  public getSanitizedStateForPlayer(state: PollaState, _userId: string): PollaState {
    return state;
  }
}
