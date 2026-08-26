// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE SESIONES DE JUEGO Y SETTLEMENT
// ==============================================================================
// Gobernanza de reglas 90/10 mediante Security Definer RPCs en Supabase.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { GameSession, GameActionPayload } from '../../types/games';

export class GameRepository {
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
      .in('status', ['IN_PROGRESS', 'WAITING_PLAYERS', 'in_progress', 'initializing', 'settling'])
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      tableId: data.table_id,
      gameType: data.game_type,
      roundNumber: data.current_round || data.round_number || 1,
      currentTurnUserId: data.turn_user_id || data.current_turn_user_id,
      turnExpiresAt: data.turn_expires_at,
      status: data.status,
      grossPool: Number(data.gross_pool || 0),
      winnerPrizeAmount: Number(data.prize_pool || data.winner_prize_amount || 0),
      serviceFeeAmount: Number(data.platform_fee || data.service_fee_amount || 0),
      winnerUserId: data.winner_user_id,
      winnerTeamIndex: data.winner_team_index,
      isSettled: data.status === 'SETTLED' || Boolean(data.is_settled),
      settledAt: data.settled_at,
    };
  }

  /**
   * Envía una acción de juego validada por el backend.
   * El servidor valida turno, reglas y persiste el estado.
   */
  public static async submitAction(payload: GameActionPayload): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const { error } = await supabase.from('game_actions').insert({
      session_id: payload.sessionId,
      action_type: payload.actionType,
      action_payload: payload.actionData,
      server_timestamp: new Date(payload.clientTimestamp).toISOString(),
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
      return { success: false, error: error.message };
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
      return { success: false, error: error.message };
    }

    return {
      success: true,
      refundedCount: Number(data?.refunded_count || 0),
    };
  }
}
