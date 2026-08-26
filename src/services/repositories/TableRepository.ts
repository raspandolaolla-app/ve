// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE MESAS DE JUEGO
// ==============================================================================
// Capa de abstracción para mesas públicas y privadas (Trancaíto).
// Entrada a mesa gobernada por la función segura join_table_transaction().
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';
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
      query = query.eq('game_type', gameType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[TableRepository] Error al obtener mesas públicas:', error.message);
      return [];
    }

    return (data || []).map((t) => ({
      id: t.id,
      gameType: t.game_type,
      name: t.name || `Mesa de ${t.game_type}`,
      mode: t.mode || (t.max_players === 4 ? 'PAREJAS' : 'INDIVIDUAL'),
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
      gameType: data.game_type,
      name: data.name || `Mesa de ${data.game_type}`,
      mode: data.mode || (data.max_players === 4 ? 'PAREJAS' : 'INDIVIDUAL'),
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
   * Obtiene los jugadores conectados a una mesa.
   */
  public static async getTablePlayers(tableId: string): Promise<TablePlayer[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('game_table_players')
      .select('*, profiles:user_id(first_name, last_name, avatar_url)')
      .eq('table_id', tableId);

    if (error) {
      console.error('[TableRepository] Error al obtener jugadores de mesa:', error.message);
      return [];
    }

    return (data || []).map((p) => {
      const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
      const firstName = profile?.first_name || 'Jugador';
      const lastName = profile?.last_name || '';
      return {
        id: p.id,
        tableId: p.table_id,
        userId: p.user_id,
        seatNumber: p.seat_number ?? p.seat_index ?? 0,
        seatIndex: p.seat_number ?? p.seat_index ?? 0,
        teamIndex: p.team_index,
        status: p.status,
        isReady: p.status === 'READY' || Boolean(p.is_ready),
        isOnline: p.status !== 'DISCONNECTED',
        joinedAt: p.joined_at,
        displayName: `${firstName} ${lastName}`.trim(),
        avatarUrl: profile?.avatar_url || undefined,
      };
    });
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
   * Crea una nueva mesa pública o privada.
   */
  public static async createTable(payload: CreateTablePayload): Promise<GameTable | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      console.error('[TableRepository] No se puede crear mesa sin usuario autenticado');
      return null;
    }

    const inviteCode = payload.isPrivate
      ? `TRK-${Math.floor(1000 + Math.random() * 9000)}`
      : `PUB-${Math.floor(1000 + Math.random() * 9000)}`;

    const shareToken = `st_${Math.random().toString(36).substring(2, 12)}`;
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('game_tables')
      .insert({
        game_type: payload.gameType,
        host_user_id: authData.user.id,
        visibility: payload.isPrivate ? 'PRIVATE' : 'PUBLIC',
        invite_code: inviteCode,
        entry_fee: payload.entryFee,
        min_players: payload.maxPlayers === 4 ? 2 : payload.maxPlayers,
        max_players: payload.maxPlayers,
        current_players_count: 1,
        status: 'OPEN',
        config: payload.config || {},
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[TableRepository] Error creando mesa:', error?.message);
      return null;
    }

    return {
      id: data.id,
      gameType: data.game_type,
      name: data.name || `Mesa de ${data.game_type}`,
      mode: data.mode || (data.max_players === 4 ? 'PAREJAS' : 'INDIVIDUAL'),
      entryFee: Number(data.entry_fee || 0),
      currency: data.currency || 'VES',
      minPlayers: data.min_players,
      maxPlayers: data.max_players,
      currentPlayersCount: data.current_players_count || 1,
      status: data.status,
      hostUserId: data.host_user_id,
      isPrivate: data.visibility === 'PRIVATE',
      joinCode: data.invite_code,
      shareToken: shareToken,
      createdAt: data.created_at,
      config: data.config || {},
    };
  }
}
