// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE SESIONES DE JUEGO Y SETTLEMENT
// ==============================================================================
// Gobernanza de reglas 90/10 mediante Security Definer RPCs en Supabase.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import type { GameSession, GameActionPayload, GameType } from '../../types/games';

export class GameRepository {
  /**
   * Mapea GameType del frontend al enum de base de datos PostgreSQL
   */
  public static mapGameTypeToDbEnum(gameType: GameType): string {
    const map: Record<GameType, string> = {
      tic_tac_toe: 'TRES_EN_RAYA',
      rock_paper_scissors: 'PIEDRA_PAPEL_TIJERA',
      checkers: 'DAMAS',
      domino_venezolano: 'DOMINO_VENEZOLANO',
      truco_venezolano: 'TRUCO_VENEZOLANO',
      bingo: 'BINGO',
      polla_venezolana: 'POLLA_VENEZOLANA',
      atrapaito: 'ATRAPAITO',
    };
    return map[gameType] || gameType.toUpperCase();
  }

  /**
   * Mapea el enum de base de datos PostgreSQL al GameType del frontend
   */
  public static mapDbEnumToGameType(dbType: string): GameType {
    const map: Record<string, GameType> = {
      TRES_EN_RAYA: 'tic_tac_toe',
      PIEDRA_PAPEL_TIJERA: 'rock_paper_scissors',
      DAMAS: 'checkers',
      DOMINO_VENEZOLANO: 'domino_venezolano',
      TRUCO_VENEZOLANO: 'truco_venezolano',
      BINGO: 'bingo',
      POLLA_VENEZOLANA: 'polla_venezolana',
      ATRAPAITO: 'atrapaito',
    };
    return map[dbType] || (dbType.toLowerCase() as GameType);
  }

  /**
   * Obtiene la sesión de juego activa asociada a una mesa.
   */
  public static async getActiveSession(tableId: string): Promise<GameSession | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('table_id', tableId)
      .in('status', ['WAITING', 'READY', 'STARTING', 'ACTIVE', 'IN_PROGRESS', 'WAITING_PLAYERS', 'in_progress', 'initializing', 'settling'])
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      tableId: data.table_id,
      gameType: this.mapDbEnumToGameType(data.game_type),
      roundNumber: data.session_number || data.current_round || 1,
      currentTurnUserId: data.current_turn_user_id || data.turn_user_id,
      turnExpiresAt: data.turn_deadline_at || data.turn_expires_at,
      status: (data.status === 'ACTIVE' ? 'in_progress' : data.status.toLowerCase()) as any,
      grossPool: Number(data.gross_pool || 0),
      winnerPrizeAmount: Number(data.prize_pool || data.winner_prize_amount || 0),
      serviceFeeAmount: Number(data.platform_fee || data.service_fee_amount || 0),
      winnerUserId: data.winner_user_id,
      winnerTeamIndex: data.winner_team,
      isSettled: data.status === 'SETTLED' || Boolean(data.is_settled),
      settledAt: data.ended_at || data.settled_at,
      currentState: (data.current_state as Record<string, unknown>) || {},
    };
  }

  /**
   * Crea o recupera la sesión de juego para una mesa.
   */
  public static async createOrGetSession(
    tableId: string,
    gameType: GameType,
    initialState: Record<string, unknown>,
    firstTurnUserId?: string
  ): Promise<GameSession | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    // Verificar si ya existe una activa
    const existing = await this.getActiveSession(tableId);
    if (existing) return existing;

    const dbGameType = this.mapGameTypeToDbEnum(gameType);

    const { data, error } = await supabase
      .from('game_sessions')
      .insert({
        table_id: tableId,
        game_type: dbGameType,
        session_number: 1,
        status: 'ACTIVE',
        current_state: initialState,
        current_turn_user_id: firstTurnUserId || null,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[GameRepository] Error creando sesión de juego:', error?.message);
      return null;
    }

    return {
      id: data.id,
      tableId: data.table_id,
      gameType: this.mapDbEnumToGameType(data.game_type),
      roundNumber: data.session_number || 1,
      currentTurnUserId: data.current_turn_user_id,
      turnExpiresAt: data.turn_deadline_at,
      status: 'in_progress',
      grossPool: Number(data.gross_pool || 0),
      winnerPrizeAmount: Number(data.prize_pool || 0),
      serviceFeeAmount: Number(data.platform_fee || 0),
      winnerUserId: data.winner_user_id,
      winnerTeamIndex: data.winner_team,
      isSettled: false,
      settledAt: data.ended_at,
      currentState: data.current_state || {},
    };
  }

  /**
   * Actualiza el estado público de la partida en tiempo real.
   */
  public static async updateSessionState(
    sessionId: string,
    newState: Record<string, unknown>,
    currentTurnUserId?: string | null,
    status?: string,
    winnerUserId?: string | null
  ): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const updatePayload: Record<string, unknown> = {
      current_state: newState,
    };

    if (currentTurnUserId !== undefined) {
      updatePayload.current_turn_user_id = currentTurnUserId;
    }

    if (status) {
      updatePayload.status = status;
    }

    if (winnerUserId !== undefined) {
      updatePayload.winner_user_id = winnerUserId;
    }

    const { error } = await supabase
      .from('game_sessions')
      .update(updatePayload)
      .eq('id', sessionId);

    if (error) {
      console.error('[GameRepository] Error actualizando estado de sesión:', error.message);
      return false;
    }

    return true;
  }

  /**
   * Envía una acción de juego validada por el motor.
   */
  public static async submitAction(payload: GameActionPayload): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const idempotencyKey =
      payload.idempotencyKey ||
      `act_${payload.sessionId}_${payload.userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { error } = await supabase.from('game_actions').insert({
      session_id: payload.sessionId,
      user_id: payload.userId,
      sequence_number: payload.sequenceNumber || 1,
      action_type: payload.actionType,
      payload: payload.actionData,
      is_valid: true,
      server_state_hash: 'HASH_' + Date.now(),
      idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('[GameRepository] Error registrando acción de juego:', error.message);
      return false;
    }

    return true;
  }

  /**
   * Ejecuta la liquidación de partida aplicando la regla estricta 90% ganador / 10% plataforma.
   */
  public static async settleSession(
    sessionId: string,
    winnerUserIds: string[],
    winnerTeam: number | null,
    idempotencyKey: string
  ): Promise<{ success: boolean; grossPool?: number; prizePool?: number; platformFee?: number; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase no inicializado' };

    const { data, error } = await supabase.rpc('settle_game_session', {
      p_session_id: sessionId,
      p_winner_user_ids: winnerUserIds,
      p_winner_team: winnerTeam,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('[GameRepository] Error liquidando partida:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al liquidar partida.') };
    }

    return {
      success: true,
      grossPool: Number(data?.gross_pool || 0),
      prizePool: Number(data?.prize_pool || 0),
      platformFee: Number(data?.platform_fee || 0),
    };
  }

  /**
   * Ejecuta el reembolso íntegro de entradas en caso de cancelación o empate técnico.
   */
  public static async refundSession(
    sessionId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<{ success: boolean; refundedCount?: number; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase no inicializado' };

    const { data, error } = await supabase.rpc('refund_game_session', {
      p_session_id: sessionId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('[GameRepository] Error reembolsando partida:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al procesar reembolso de partida.') };
    }

    return {
      success: true,
      refundedCount: Number(data?.refunded_count || 0),
    };
  }
}

