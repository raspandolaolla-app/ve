// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE MESAS DE JUEGO (FASE 24)
// ==============================================================================
// Capa de abstracción para mesas públicas y privadas (Trancaíto).
// Entrada a mesa gobernada por la función segura join_table_transaction().
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
import { getGameDisplayName } from '../../utils/formatters';
import { GameRepository } from './GameRepository';
import { ProfileRepository } from './ProfileRepository';
import type { GameTable, TablePlayer, CreateTablePayload, JoinTableResult } from '../../types/tables';
import type { GameType } from '../../types/games';

export class TableRepository {
  /**
   * Obtiene la lista de mesas públicas activas en el Lobby.
   */
  public static async getPublicTables(gameType?: GameType): Promise<GameTable[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    let query = supabase
      .from('game_tables')
      .select('*')
      .eq('visibility', 'PUBLIC')
      .in('status', ['OPEN', 'STARTING', 'ACTIVE'])
      .order('created_at', { ascending: false });

    if (gameType) {
      const dbGameType = GameRepository.mapGameTypeToDbEnum(gameType);
      query = query.eq('game_type', dbGameType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[TableRepository] Error al obtener mesas públicas:', error.message);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Verificación de sesiones finalizadas para excluir mesas fantasma en el Lobby
    const tableIds = data.map((t) => t.id);
    const { data: activeSessions } = await supabase
      .from('game_sessions')
      .select('table_id, status')
      .in('table_id', tableIds);

    const finishedTableIds = new Set<string>();
    if (activeSessions && activeSessions.length > 0) {
      for (const s of activeSessions) {
        if (['FINISHED', 'SETTLED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(s.status)) {
          finishedTableIds.add(s.table_id);
          // Auto-cerrar mesa en segundo plano si quedó marcada como OPEN
          supabase
            .from('game_tables')
            .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
            .eq('id', s.table_id)
            .then(() => {});
        }
      }
    }

    return data
      .filter((t) => !finishedTableIds.has(t.id))
      .map((t) => ({
        id: t.id,
        gameType: GameRepository.mapDbEnumToGameType(t.game_type),
        name: t.name || `Mesa de ${getGameDisplayName(GameRepository.mapDbEnumToGameType(t.game_type))}`,
        mode: (t.mode as any) || (t.max_players === 4 ? '2v2' : '1v1'),
        entryFee: Number(t.entry_fee || 0),
        currency: t.currency || 'VES',
        minPlayers: t.min_players,
        maxPlayers: t.max_players,
        currentPlayersCount: t.current_players_count || 0,
        status: t.status,
        hostUserId: t.host_user_id || t.created_by,
        isPrivate: t.visibility === 'PRIVATE' || Boolean(t.is_private),
        joinCode: t.invite_code || t.join_code,
        shareToken: t.share_token || t.invite_code,
        createdAt: t.created_at,
        startedAt: t.started_at,
        finishedAt: t.closed_at || t.finished_at,
        config: t.config || {},
      }));
  }

  /**
   * Busca una mesa privada por código de acceso "Trancaíto".
   */
  public static async getTableByJoinCode(code: string): Promise<GameTable | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const normalizedCode = code.trim().toUpperCase();
    const { data, error } = await supabase
      .from('game_tables')
      .select('*')
      .or(`invite_code.eq.${normalizedCode},join_code.eq.${normalizedCode}`)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      gameType: GameRepository.mapDbEnumToGameType(data.game_type),
      name: data.name || `Mesa de ${getGameDisplayName(GameRepository.mapDbEnumToGameType(data.game_type))}`,
      mode: (data.mode as any) || (data.max_players === 4 ? '2v2' : '1v1'),
      entryFee: Number(data.entry_fee || 0),
      currency: data.currency || 'VES',
      minPlayers: data.min_players,
      maxPlayers: data.max_players,
      currentPlayersCount: data.current_players_count || 0,
      status: data.status,
      hostUserId: data.host_user_id || data.created_by,
      isPrivate: data.visibility === 'PRIVATE' || Boolean(data.is_private),
      joinCode: data.invite_code || data.join_code,
      shareToken: data.share_token || data.invite_code,
      createdAt: data.created_at,
      startedAt: data.started_at,
      finishedAt: data.closed_at || data.finished_at,
      config: data.config || {},
    };
  }

  /**
   * Obtiene los jugadores conectados a una mesa con sus perfiles completos.
   */
  public static async getTablePlayers(tableId: string): Promise<TablePlayer[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('game_table_players')
      .select('*, profiles:user_id(display_name, first_name, last_name, avatar_url)')
      .eq('table_id', tableId)
      .order('seat_number', { ascending: true });

    if (error) {
      console.error('[TableRepository] Error al obtener jugadores de mesa:', error.message);
      return [];
    }

    return (data || []).map((p) => {
      const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
      const seatNum = p.seat_number ?? p.seat_index ?? 1;
      
      let displayName = '';
      if (profile?.display_name && profile.display_name.trim().length > 0) {
        displayName = profile.display_name.trim();
      } else if (profile?.first_name || profile?.last_name) {
        displayName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
      } else {
        displayName = `Jugador ${seatNum}`;
      }

      return {
        id: p.id,
        tableId: p.table_id,
        userId: p.user_id,
        seatNumber: seatNum,
        seatIndex: seatNum,
        teamIndex: p.team_index,
        status: p.status,
        isReady: p.status === 'READY',
        isOnline: p.status !== 'DISCONNECTED' && p.status !== 'LEFT',
        joinedAt: p.joined_at,
        displayName,
        avatarUrl: profile?.avatar_url || undefined,
      };
    });
  }

  /**
   * Procesa el abandono voluntario o cancelación atómica de una mesa mediante RPC de Supabase.
   */
  public static async abandonTable(
    tableId: string,
    sessionId?: string,
    idempotencyKey?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Conexión a base de datos no disponible' };

    const effectiveKey =
      idempotencyKey || `abandon_${tableId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const { data, error } = await supabase.rpc('abandon_game_table_secure', {
      p_table_id: tableId,
      p_session_id: sessionId || null,
      p_idempotency_key: effectiveKey,
    });

    if (error) {
      console.error('[TableRepository] Error procesando abandono de mesa:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al procesar salida de la mesa') };
    }

    return { success: true, data };
  }

  /**
   * Une un usuario a una mesa ejecutando la función segura join_table_transaction.
   */
  public static async joinTable(
    tableId: string,
    seatNumber: number,
    idempotencyKey: string
  ): Promise<JoinTableResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'El servicio no está disponible temporalmente' };
    }

    const { data, error } = await supabase.rpc('join_table_transaction', {
      p_table_id: tableId,
      p_seat_number: seatNumber,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error('[TableRepository] Error al unirse a mesa:', error.message);
      return { success: false, error: sanitizeUserErrorMessage(error, 'Error al unirse a la mesa.') };
    }

    return {
      success: true,
      tablePlayerId: data?.table_player_id,
      seatNumber: data?.seat_number ?? seatNumber,
      message: 'Unión exitosa a la mesa con retención contable registrada',
    };
  }

  /**
   * Obtiene la lista de montos de entrada activos para selección en mesas.
   */
  public static async getAvailableEntryFees(gameType?: GameType): Promise<number[]> {
    const defaultFees = [25, 50, 100, 250, 500, 1000, 2000, 5000];
    const supabase = getSupabaseClient();
    if (!supabase) {
      return defaultFees;
    }

    try {
      let query = supabase
        .from('entry_fees')
        .select('amount')
        .eq('is_active', true)
        .gte('amount', 25)
        .lte('amount', 5000)
        .order('display_order', { ascending: true })
        .order('amount', { ascending: true });

      if (gameType) {
        const dbGameType = GameRepository.mapGameTypeToDbEnum(gameType);
        query = query.or(`game_type.is.null,game_type.eq.${dbGameType}`);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return defaultFees;
      }

      const filtered = data
        .map((d: any) => Number(d.amount))
        .filter((amt: number) => amt >= 25 && amt <= 5000);

      return filtered.length > 0 ? filtered : defaultFees;
    } catch {
      return defaultFees;
    }
  }

  /**
   * Crea una nueva mesa pública o privada de forma segura.
   */
  public static async createTable(payload: CreateTablePayload): Promise<GameTable | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      console.warn('[TableRepository] CREATE_TABLE_ERROR: No authenticated session found', authError);
      throw new Error('AUTH_REQUIRED: Debes iniciar sesión para crear una mesa.');
    }

    // Asegurar que el perfil esté conciliado en public.profiles
    await ProfileRepository.ensureCurrentUserProfile();

    const dbGameType = GameRepository.mapGameTypeToDbEnum(payload.gameType);
    const tableName = payload.name?.trim() || `Mesa de ${getGameDisplayName(payload.gameType)}`;

    const entryFeeNum = Number(payload.entryFee || 0);
    if (entryFeeNum < 25 || entryFeeNum > 5000) {
      throw new Error('INVALID_ENTRY_FEE: El monto de participación debe estar entre 25 Bs. y 5.000 Bs.');
    }

    // Invocar exclusivamente la RPC segura create_game_table_secure
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_game_table_secure', {
      p_game_type: dbGameType,
      p_name: tableName,
      p_visibility: payload.isPrivate ? 'PRIVATE' : 'PUBLIC',
      p_entry_fee: entryFeeNum,
      p_max_players: Number(payload.maxPlayers || 2),
      p_config: payload.config || {},
    });

    if (rpcError) {
      console.error('[CREATE_TABLE_REAL_ERROR]', {
        code: rpcError?.code,
        message: rpcError?.message,
        details: rpcError?.details,
        hint: rpcError?.hint,
        raw: rpcError
      });
      console.error('[TableRepository] CREATE_TABLE_ERROR', {
        operation: 'create_game_table_secure',
        userId: authData.user.id,
        gameType: payload.gameType,
        dbGameType,
        entryFee: payload.entryFee,
        maxPlayers: payload.maxPlayers,
        isPrivate: payload.isPrivate,
        error: {
          message: rpcError.message,
          code: rpcError.code,
          details: rpcError.details,
          hint: rpcError.hint,
        },
      });
      throw new Error(rpcError.message || 'No fue posible crear la mesa en este momento.');
    }

    if (!rpcData?.success) {
      throw new Error('No fue posible crear la mesa en este momento.');
    }

    return {
      id: rpcData.table_id,
      gameType: payload.gameType,
      name: rpcData.name || tableName,
      mode: payload.mode || (payload.maxPlayers === 4 ? '2v2' : '1v1'),
      entryFee: Number(rpcData.entry_fee ?? payload.entryFee),
      currency: 'VES',
      minPlayers: payload.maxPlayers === 4 ? 2 : payload.maxPlayers,
      maxPlayers: payload.maxPlayers,
      currentPlayersCount: 0,
      status: 'OPEN',
      hostUserId: authData.user.id,
      isPrivate: payload.isPrivate,
      joinCode: rpcData.invite_code,
      shareToken: rpcData.invite_code,
      createdAt: rpcData.created_at || new Date().toISOString(),
      config: payload.config || {},
    };
  }
}
