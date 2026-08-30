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
      una_olla: 'UNA_OLLA',
      chess: 'CHESS',
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
      UNA_OLLA: 'una_olla',
      CHESS: 'chess',
    };
    return map[dbType] || (dbType.toLowerCase() as GameType);
  }

  /**
   * Obtiene la sesión de juego activa asociada a una mesa.
   * Filtra exclusivamente con valores válidos del ENUM session_status_enum de PostgreSQL.
   */
  public static async getActiveSession(tableId: string): Promise<GameSession | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('table_id', tableId)
      .in('status', ['WAITING', 'READY', 'STARTING', 'ACTIVE', 'PAUSED'])
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
      status: (data.status === 'ACTIVE' || data.status === 'STARTING' || data.status === 'READY' || data.status === 'WAITING'
        ? 'in_progress'
        : data.status === 'FINISHED' || data.status === 'SETTLED'
        ? 'completed'
        : data.status === 'CANCELLED' || data.status === 'ABANDONED'
        ? 'abandoned'
        : 'in_progress') as any,
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
    const initialTurnDeadline = new Date(Date.now() + 10000).toISOString();

    const { data, error } = await supabase
      .from('game_sessions')
      .insert({
        table_id: tableId,
        game_type: dbGameType,
        session_number: 1,
        status: 'ACTIVE',
        current_state: initialState,
        current_turn_user_id: firstTurnUserId || null,
        turn_deadline_at: initialTurnDeadline,
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
   * Mapea cualquier estado recibido a los valores estrictos de session_status_enum.
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
      turn_deadline_at: new Date(Date.now() + 10000).toISOString(),
    };

    if (currentTurnUserId !== undefined) {
      updatePayload.current_turn_user_id = currentTurnUserId;
    }

    if (status) {
      // Mapeo seguro a valores estrictos de session_status_enum
      const normalizedStatusMap: Record<string, string> = {
        COMPLETED: 'FINISHED',
        completed: 'FINISHED',
        finished: 'FINISHED',
        FINISHED: 'FINISHED',
        in_progress: 'ACTIVE',
        playing: 'ACTIVE',
        ACTIVE: 'ACTIVE',
        SETTLED: 'SETTLED',
        CANCELLED: 'CANCELLED',
        ABANDONED: 'ABANDONED',
        WAITING: 'WAITING',
        READY: 'READY',
        STARTING: 'STARTING',
        PAUSED: 'PAUSED',
      };
      updatePayload.status = normalizedStatusMap[status] || 'ACTIVE';
    }

    if (winnerUserId !== undefined) {
      updatePayload.winner_user_id = winnerUserId;
    }

    const { data: updatedSession, error } = await supabase
      .from('game_sessions')
      .update(updatePayload)
      .eq('id', sessionId)
      .select('table_id')
      .maybeSingle();

    if (error) {
      console.error('[GameRepository] Error actualizando estado de sesión:', error.message);
      return false;
    }

    // Si la sesión terminó o fue liquidada, asegurar explícitamente que la mesa pase a CLOSED
    if (updatePayload.status === 'FINISHED' || updatePayload.status === 'SETTLED' || updatePayload.status === 'CANCELLED') {
      const tableId = updatedSession?.table_id;
      if (tableId) {
        await supabase
          .from('game_tables')
          .update({
            status: 'CLOSED',
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', tableId);
      }
    }

    return true;
  }

  /**
   * Envía una acción de juego validada por el motor.
   * Utiliza la función RPC atómica submit_game_action_secure para evitar colisiones en uq_game_actions_session_seq.
   */
  public static async submitAction(payload: GameActionPayload): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const idempotencyKey =
      payload.idempotencyKey ||
      `act_${payload.sessionId}_${payload.userId}_${payload.clientTimestamp || Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Inserción atómica mediante RPC transaccional
    const { data: rpcData, error: rpcError } = await supabase.rpc('submit_game_action_secure', {
      p_session_id: payload.sessionId,
      p_action_type: payload.actionType,
      p_payload: payload.actionData || {},
      p_idempotency_key: idempotencyKey,
    });

    if (!rpcError && rpcData?.success) {
      return true;
    }

    if (rpcError) {
      console.warn('[GameRepository] Error en submit_game_action_secure RPC:', rpcError.message);
    }

    // 2. Fallback con cálculo dinámico de secuencia máxima si la RPC no está activa
    const { data: existingActions } = await supabase
      .from('game_actions')
      .select('sequence_number')
      .eq('session_id', payload.sessionId)
      .order('sequence_number', { ascending: false })
      .limit(1);

    const nextSeq = existingActions && existingActions.length > 0 
      ? Number(existingActions[0].sequence_number || 0) + 1 
      : 1;

    const { error: insertError } = await supabase.from('game_actions').insert({
      session_id: payload.sessionId,
      user_id: payload.userId,
      sequence_number: payload.sequenceNumber || nextSeq,
      action_type: payload.actionType,
      payload: payload.actionData,
      is_valid: true,
      server_state_hash: 'HASH_' + Date.now(),
      idempotency_key: idempotencyKey,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        // Ignorar duplicados de idempotencia/secuencia como operaciones idempotentes
        return true;
      }
      console.error('[GameRepository] Error registrando acción de juego:', insertError.message);
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
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

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
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

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

  /**
   * Expira de forma atómica el turno actual si superó la fecha límite (10s o 30s) y deduce vida.
   */
  public static async expireTurn(sessionId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    // Intentar primero con el motor unificado de vidas y timeout
    const { data: genericData, error: genericError } = await supabase.rpc('expire_game_turn_secure', {
      p_session_id: sessionId,
    });

    if (!genericError && genericData?.success) {
      return true;
    }

    // Fallback al motor específico de dominó
    const { data, error } = await supabase.rpc('expire_domino_turn_secure', {
      p_session_id: sessionId,
    });

    if (error) {
      console.warn('[GameRepository] Error expirando turno:', error.message);
      return false;
    }

    return Boolean(data?.success);
  }

  /**
   * Ejecuta un movimiento automático (BOT_MOVE) en servidor cuando se agota el tiempo del turno.
   */
  public static async executeBotMoveOnTimeout(
    sessionId: string,
    userId: string,
    botAction?: Record<string, unknown>
  ): Promise<{ success: boolean; botActionExecuted?: boolean }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false };

    try {
      const { data, error } = await supabase.rpc('execute_bot_move_on_timeout', {
        p_session_id: sessionId,
        p_user_id: userId,
        p_bot_action: botAction ? (botAction as any) : null,
      });

      if (error) {
        console.warn('[GameRepository] Error ejecutando BOT move:', error.message);
        // Fallback a expiración estándar de turno
        await this.expireTurn(sessionId);
        return { success: false };
      }

      return {
        success: Boolean(data?.success),
        botActionExecuted: true,
      };
    } catch (err) {
      console.error('[GameRepository] Error al invocar execute_bot_move_on_timeout:', err);
      return { success: false };
    }
  }

  /**
   * Ejecuta la limpieza de mesas huérfanas sin jugadores activos.
   */
  public static async cleanupOrphanedTables(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      await supabase.rpc('cleanup_orphaned_tables_and_sessions');
    } catch (err) {
      console.warn('[GameRepository] Error en limpieza de mesas huérfanas:', err);
    }
  }

  /**
   * Alias de compatibilidad para inicializar/recuperar sesión en useGameEngine
   */
  public static async getOrCreateSession(
    tableId: string,
    gameType: GameType,
    firstTurnUserId?: string,
    initialState?: Record<string, unknown>
  ): Promise<GameSession | null> {
    return this.createOrGetSession(tableId, gameType, initialState || {}, firstTurnUserId);
  }

  /**
   * Obtiene la secuencia de acciones registradas para una sesión
   */
  public static async getActions(sessionId: string): Promise<any[]> {
    const supabase = getSupabaseClient();
    if (!supabase || !sessionId) return [];
    try {
      const { data, error } = await supabase
        .from('game_actions')
        .select('*')
        .eq('session_id', sessionId)
        .order('sequence_number', { ascending: true });
      if (error || !data) return [];
      return data;
    } catch {
      return [];
    }
  }
}

