/**
 * ==============================================================================
 * RASPANDO LA OLLA — REPOSITORIO DE MESAS Y SALAS MULTIJUGADOR
 * ==============================================================================
 * Extraído de AdminRepository.ts para modularización de Fase 3.
 * Supervisión, cancelación, terminación segura, desconexión de jugadores,
 * limpieza automática y depuración de mesas vacías o expiradas.
 * ==============================================================================
 */

import { getSupabaseClient } from '../../../lib/supabase/client';
import { SUPPORTED_GAMES_METADATA } from '../../../utils/constants';
import { logger } from '../../../utils/logger';
import { AdminAuditRepository } from './AdminAuditRepository';
import type { AdminTableItem } from '../../../types/admin';

export class AdminTablesRepository {
  /**
   * Envía un evento broadcast Realtime vía HTTP REST (httpSend)
   * evitando el aviso de deprecación de fallback automático de send().
   */
  private static async sendBroadcastEvent(tableId: string, event: string, payload: any): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const channel = supabase.channel(`table_${tableId}`);
      if (typeof (channel as any).httpSend === 'function') {
        await (channel as any).httpSend(event, payload);
      } else {
        await channel.send({
          type: 'broadcast',
          event,
          payload,
        });
      }
      await supabase.removeChannel(channel);
    } catch (err: unknown) {
      logger.warn(`[AdminTablesRepository] No se pudo emitir broadcast Realtime (${event}):`, err);
    }
  }

  /**
   * Supervisión de mesas multijugador activas e históricas.
   */
  public static async getTablesList(filters?: {
    status?: string;
    search?: string;
  }): Promise<AdminTableItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      let query = supabase
        .from('game_tables')
        .select(`
          *,
          game_table_players(user_id, seat_number, status, profiles:user_id(first_name, last_name))
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (filters?.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('[AdminTablesRepository] Error obteniendo mesas:', error.message);
        return [];
      }

      let items: AdminTableItem[] = (data || [])
        .filter((row: any) => {
          // Excluir Bingo y Polla Venezolana de la administración de mesas tipo room/match
          const gType = (row.game_type || row.game_id || '').toLowerCase();
          return !gType.includes('bingo') && !gType.includes('polla');
        })
        .map((row: any) => {
          const gameMeta = SUPPORTED_GAMES_METADATA.find((g) => g.id === row.game_type || g.id === row.game_id);
          const rawPlayers = row.game_table_players || [];
          const players = rawPlayers.map((p: any) => {
            const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
            const isDiscon = p.status === 'DISCONNECTED' || p.status === 'LEFT';
            return {
              userId: p.user_id,
              seatNumber: p.seat_number,
              userName: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Jugador',
              isReady: p.status === 'READY' || p.status === 'PLAYING',
              isOnline: !isDiscon,
              lastSeenAt: p.left_at || p.updated_at || p.joined_at,
              status: p.status || 'JOINED',
            };
          });

          // Filtrar jugadores con estatus activo (excluyendo 'LEFT')
          const activePlayers = players.filter(
            (p: any) => p.status === 'JOINED' || p.status === 'READY' || p.status === 'PLAYING'
          );

          // Detección de duplicados por usuario
          const activeUserSeatsMap: Record<string, number[]> = {};
          activePlayers.forEach((p: any) => {
            if (p.userId) {
              if (!activeUserSeatsMap[p.userId]) activeUserSeatsMap[p.userId] = [];
              activeUserSeatsMap[p.userId].push(p.seatNumber);
            }
          });

          const duplicateUserIds = Object.keys(activeUserSeatsMap).filter(
            (uid) => activeUserSeatsMap[uid].length > 1
          );

          const duplicatePlayersList = duplicateUserIds.map((uid) => {
            const pl = activePlayers.find((p: any) => p.userId === uid);
            const seatsStr = activeUserSeatsMap[uid].join(', ');
            return pl ? `${pl.userName} (Asientos ${seatsStr})` : uid;
          });

          // Diagnóstico de problemas en la mesa
          const problemReasons: string[] = [];
          if (duplicateUserIds.length > 0) {
            problemReasons.push(`Jugador duplicado en múltiples asientos (${duplicatePlayersList.join('; ')})`);
          }

          const rawStatus = (row.status || '').toUpperCase();
          const activeCount = activePlayers.length;
          const dbCount = Number(row.current_players_count ?? activeCount);

          if (
            dbCount !== activeCount &&
            !['CLOSED', 'TERMINATED', 'CANCELLED', 'FINISHED', 'EXPIRED'].includes(rawStatus)
          ) {
            problemReasons.push(`Inconsistencia en contador de jugadores (DB: ${dbCount}, Reales: ${activeCount})`);
          }

          if (
            ['IN_GAME', 'FULL', 'WAITING', 'WAITING_PLAYERS', 'OPEN'].includes(rawStatus) &&
            activeCount === 0
          ) {
            problemReasons.push('Mesa fantasma/abandonada sin jugadores activos');
          }

          if (rawStatus === 'FULL' && activeCount < (row.max_players || 4)) {
            problemReasons.push(`Estado marcado FULL con asientos libres (${activeCount}/${row.max_players || 4})`);
          }

          if (rawStatus === 'IN_GAME' && activeCount < 2) {
            problemReasons.push(`Mesa marcándose en juego con solo ${activeCount} jugador(es)`);
          }

          const isProblematic = problemReasons.length > 0;
          const occupiedSeatsList = activePlayers.map((p: any) => p.seatNumber);

          const updatedAt = row.updated_at || row.created_at;
          const lastActivityAt = row.last_activity_at || updatedAt;
          const diffMs = Date.now() - new Date(lastActivityAt).getTime();
          const inactivityMinutes = Math.max(0, Math.floor(diffMs / 60000));

          let mappedStatus: AdminTableItem['status'] = 'WAITING_PLAYERS';
          if (rawStatus === 'OPEN' || rawStatus === 'WAITING' || rawStatus === 'WAITING_PLAYERS') {
            mappedStatus = 'WAITING_PLAYERS';
          } else if (rawStatus === 'IN_GAME' || rawStatus === 'ACTIVE' || rawStatus === 'PLAYING') {
            mappedStatus = 'IN_GAME';
          } else if (rawStatus === 'FULL') {
            mappedStatus = 'FULL';
          } else if (rawStatus === 'PAUSED') {
            mappedStatus = 'PAUSED';
          } else if (rawStatus === 'EXPIRED') {
            mappedStatus = 'EXPIRED';
          } else if (rawStatus === 'TERMINATED') {
            mappedStatus = 'TERMINATED';
          } else if (rawStatus === 'CLOSED') {
            mappedStatus = 'CLOSED';
          } else if (rawStatus === 'FINISHED') {
            mappedStatus = 'FINISHED';
          } else if (rawStatus === 'CANCELLED') {
            mappedStatus = 'CANCELLED';
          }

          return {
            id: row.id,
            gameId: row.game_type || row.game_id,
            gameName: gameMeta?.name || row.game_type || row.game_id,
            trackingCode: row.invite_code || row.tracking_code || `TRK-${row.id.slice(0, 6).toUpperCase()}`,
            status: mappedStatus,
            entryFee: Number(row.entry_fee || 0),
            currentPot: Number(row.entry_fee * (row.current_players_count || activeCount)),
            currentPlayers: activeCount,
            maxPlayers: row.max_players || 4,
            isPrivate: row.visibility === 'PRIVATE' || Boolean(row.is_private),
            creatorId: row.host_user_id || row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastActivityAt,
            inactivityMinutes,
            gameStarted: mappedStatus === 'IN_GAME',
            currentTurn: row.current_turn || null,
            spectatorsCount: Number(row.spectators_count || 0),
            playersList: players,
            isProblematic,
            problemReasons,
            duplicatePlayers: duplicatePlayersList,
            occupiedSeatsList,
          };
        });

      if (filters?.search) {
        const s = filters.search.toLowerCase();
        items = items.filter(
          (t) =>
            t.trackingCode.toLowerCase().includes(s) ||
            t.gameName.toLowerCase().includes(s) ||
            t.id.toLowerCase().includes(s)
        );
      }

      return items;
    } catch (err: unknown) {
      logger.error('[AdminTablesRepository] Excepción obteniendo mesas:', err);
      return [];
    }
  }

  /**
   * Alias para getTablesList.
   */
  public static async getAllTables(filters?: {
    status?: string;
    search?: string;
  }): Promise<AdminTableItem[]> {
    return this.getTablesList(filters);
  }

  /**
   * Cierre o cancelación administrativa tradicional.
   */
  public static async cancelTable(
    tableId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.terminateTable(tableId, reason, true);
  }

  /**
   * Termina una mesa de juego respetando reglas de seguridad server-side.
   */
  public static async terminateTable(
    tableId: string,
    reason: string,
    refundPlayers: boolean = false
  ): Promise<{ success: boolean; error?: string; refundedCount?: number }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    try {
      const { data: authData } = await supabase.auth.getUser();
      const adminId = authData?.user?.id;
      if (!adminId) return { success: false, error: 'Sesión no autenticada.' };

      const { data: tableData, error: tableErr } = await supabase
        .from('game_tables')
        .select('*, game_table_players(*)')
        .eq('id', tableId)
        .maybeSingle();

      if (tableErr || !tableData) {
        return { success: false, error: 'La mesa especificada no fue encontrada o ya no existe.' };
      }

      const prevStatus = tableData.status;
      if (prevStatus === 'CLOSED' || prevStatus === 'TERMINATED') {
        return { success: false, error: 'La mesa ya se encuentra cerrada o terminada.' };
      }

      const players = tableData.game_table_players || [];
      const playersCount = players.length;

      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_terminate_game_table', {
        p_table_id: tableId,
        p_reason: reason || 'Terminación administrativa por operador',
        p_refund_players: refundPlayers,
      });

      if (!rpcErr && rpcData?.success) {
        await this.sendBroadcastEvent(tableId, 'TABLE_CLOSED', {
          tableId,
          status: 'TERMINATED',
          reason: reason || 'Mesa terminada por la administración',
          terminatedAt: new Date().toISOString(),
        });
        return { success: true, refundedCount: rpcData.refunded_count || 0 };
      }

      const newStatus = playersCount === 0 ? 'CLOSED' : 'TERMINATED';
      const { error: updateErr } = await supabase
        .from('game_tables')
        .update({
          status: newStatus,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tableId);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }

      await supabase
        .from('game_table_players')
        .update({ status: 'LEFT', left_at: new Date().toISOString() })
        .eq('table_id', tableId)
        .neq('status', 'LEFT');

      let refundedCount = 0;
      if (refundPlayers && Number(tableData.entry_fee) > 0 && playersCount > 0) {
        for (const p of players) {
          if (p.user_id) {
            try {
              const { data: existingLedger } = await supabase
                .from('ledger_entries')
                .select('id')
                .eq('user_id', p.user_id)
                .eq('reference_table', 'game_tables')
                .eq('reference_id', tableId)
                .eq('entry_type', 'TABLE_ENTRY_REFUND')
                .maybeSingle();

              if (!existingLedger) {
                const { data: walletData } = await supabase
                  .from('wallets')
                  .select('id, available_balance, held_balance, total_balance')
                  .eq('user_id', p.user_id)
                  .maybeSingle();

                if (walletData) {
                  const fee = Number(tableData.entry_fee);
                  const newAvailable = Number(walletData.available_balance || 0) + fee;
                  const newHeld = Math.max(0, Number(walletData.held_balance || 0) - fee);

                  await supabase
                    .from('wallets')
                    .update({
                      available_balance: newAvailable,
                      held_balance: newHeld,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', walletData.id);

                  await supabase.from('ledger_entries').insert({
                    wallet_id: walletData.id,
                    user_id: p.user_id,
                    entry_type: 'TABLE_ENTRY_REFUND',
                    direction: 'CREDIT',
                    amount: fee,
                    balance_after_available: newAvailable,
                    balance_after_held: newHeld,
                    reference_table: 'game_tables',
                    reference_id: tableId,
                    description: `Reembolso por terminación administrativa de mesa #${tableData.invite_code || tableId.slice(0, 6)}`,
                    idempotency_key: `admin_terminate_refund_${tableId}_${p.user_id}`,
                    created_at: new Date().toISOString(),
                  });

                  refundedCount++;
                }
              }
            } catch (errRef: unknown) {
              logger.warn(`[AdminTablesRepository] No se pudo procesar reembolso directo a ${p.user_id}:`, errRef);
            }
          }
        }
      }

      await this.sendBroadcastEvent(tableId, 'TABLE_CLOSED', {
        tableId,
        status: newStatus,
        reason: reason || 'Mesa cerrada por la administración',
        terminatedAt: new Date().toISOString(),
      });

      await AdminAuditRepository.recordAdminAudit({
        action: 'GAME_TABLE_TERMINATED',
        resourceType: 'GAME_TABLE',
        resourceId: tableId,
        severity: playersCount > 0 ? 'CRITICAL' : 'WARNING',
        metadata: {
          table_id: tableId,
          game_type: tableData.game_type,
          admin_id: adminId,
          previous_status: prevStatus,
          new_status: newStatus,
          players_count: playersCount,
          refund_players: refundPlayers,
          refunded_count: refundedCount,
          reason,
          created_at: new Date().toISOString(),
        },
      });

      return { success: true, refundedCount };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AdminTablesRepository] Error al terminar mesa:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Desconecta individualmente a un jugador de una mesa de juego.
   */
  public static async disconnectPlayer(
    tableId: string,
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; refunded?: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_disconnect_player_secure', {
        p_table_id: tableId,
        p_user_id: userId,
        p_reason: reason || 'Desconexión administrativa',
      });

      if (!rpcErr && rpcData?.success) {
        await this.sendBroadcastEvent(tableId, 'PLAYER_DISCONNECTED', {
          tableId,
          userId,
          reason: reason || 'Desconexión por la administración',
        });
        return { success: true, refunded: rpcData.refunded || false };
      }

      await supabase
        .from('game_table_players')
        .update({ status: 'LEFT', left_at: new Date().toISOString() })
        .eq('table_id', tableId)
        .eq('user_id', userId);

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Ejecuta la limpieza de datos temporales de una mesa.
   */
  public static async cleanupTable(tableId: string): Promise<{ success: boolean; cleanedItemsCount?: number; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    try {
      const { data: authData } = await supabase.auth.getUser();
      const adminId = authData?.user?.id;
      if (!adminId) return { success: false, error: 'Sesión no autenticada.' };

      const { data: tableData, error: tableErr } = await supabase
        .from('game_tables')
        .select('*, game_table_players(*)')
        .eq('id', tableId)
        .maybeSingle();

      if (tableErr || !tableData) {
        return { success: false, error: 'Mesa no encontrada.' };
      }

      const { data: probData, error: probErr } = await supabase.rpc('admin_fix_and_cleanup_problematic_table', {
        p_table_id: tableId,
        p_reason: 'Limpieza administrativa de mesa bloqueada',
      });

      if (!probErr && probData?.success) {
        await this.sendBroadcastEvent(tableId, 'TABLE_CLOSED', {
          tableId,
          status: 'TERMINATED',
          reason: 'Mesa con problemas corregida y limpiada por administración',
          cleanedAt: new Date().toISOString(),
        });
        return { success: true, cleanedItemsCount: (probData.cleaned_seats || 0) + (probData.refunded_count || 0) };
      }

      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_cleanup_game_table', {
        p_table_id: tableId,
      });

      if (!rpcErr && rpcData?.success) {
        await this.sendBroadcastEvent(tableId, 'TABLE_CLOSED', {
          tableId,
          status: 'CLOSED',
          reason: 'Mesa limpiada y cerrada por la administración',
          cleanedAt: new Date().toISOString(),
        });
        return { success: true, cleanedItemsCount: (rpcData.cleaned_items_count || 0) + (rpcData.refunded_count || 0) };
      }

      let cleanedCount = 0;
      const isActiveStatus = ['OPEN', 'WAITING_PLAYERS', 'FULL', 'WAITING', 'IN_GAME', 'STARTING', 'PAUSED'].includes(
        (tableData.status || '').toUpperCase()
      );

      if (isActiveStatus) {
        await supabase
          .from('game_tables')
          .update({
            status: 'CLOSED',
            current_players_count: 0,
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', tableId);

        await supabase
          .from('game_sessions')
          .update({ status: 'CANCELLED', ended_at: new Date().toISOString() })
          .eq('table_id', tableId)
          .neq('status', 'SETTLED');

        const players = tableData.game_table_players || [];
        const entryFee = Number(tableData.entry_fee || 0);

        if (entryFee > 0) {
          for (const p of players) {
            if (p.user_id && ['JOINED', 'READY', 'PLAYING'].includes((p.status || '').toUpperCase())) {
              try {
                const { data: existingLedger } = await supabase
                  .from('ledger_entries')
                  .select('id')
                  .eq('user_id', p.user_id)
                  .eq('reference_table', 'game_tables')
                  .eq('reference_id', tableId)
                  .eq('entry_type', 'TABLE_ENTRY_REFUND')
                  .maybeSingle();

                if (!existingLedger) {
                  const { data: walletData } = await supabase
                    .from('wallets')
                    .select('id, available_balance, held_balance')
                    .eq('user_id', p.user_id)
                    .maybeSingle();

                  if (walletData) {
                    const newAvailable = Number(walletData.available_balance || 0) + entryFee;
                    const newHeld = Math.max(0, Number(walletData.held_balance || 0) - entryFee);

                    await supabase
                      .from('wallets')
                      .update({
                        available_balance: newAvailable,
                        held_balance: newHeld,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', walletData.id);

                    await supabase.from('ledger_entries').insert({
                      wallet_id: walletData.id,
                      user_id: p.user_id,
                      entry_type: 'TABLE_ENTRY_REFUND',
                      direction: 'CREDIT',
                      amount: entryFee,
                      balance_after_available: newAvailable,
                      balance_after_held: newHeld,
                      reference_table: 'game_tables',
                      reference_id: tableId,
                      description: `Reembolso por limpieza/cierre de mesa #${tableData.invite_code || tableId.slice(0, 6)}`,
                      idempotency_key: `admin_clean_refund_${tableId}_${p.user_id}`,
                      created_at: new Date().toISOString(),
                    });
                  }
                }
              } catch (errRef: unknown) {
                logger.warn(`[AdminTablesRepository] Error al reembolsar durante limpieza a ${p.user_id}:`, errRef);
              }
            }
          }
        }

        await supabase
          .from('game_table_players')
          .update({ status: 'LEFT', left_at: new Date().toISOString() })
          .eq('table_id', tableId)
          .neq('status', 'LEFT');
      }

      const { data: disconPlayers } = await supabase
        .from('game_table_players')
        .delete()
        .eq('table_id', tableId)
        .in('status', ['LEFT', 'DISCONNECTED'])
        .select('id');

      cleanedCount += (disconPlayers || []).length;

      await this.sendBroadcastEvent(tableId, 'TABLE_CLOSED', {
        tableId,
        status: 'CLOSED',
        reason: 'Mesa limpiada y cerrada por la administración',
        cleanedAt: new Date().toISOString(),
      });

      await AdminAuditRepository.recordAdminAudit({
        action: 'GAME_TABLE_CLEANUP',
        resourceType: 'GAME_TABLE',
        resourceId: tableId,
        severity: 'INFO',
        metadata: {
          table_id: tableId,
          admin_id: adminId,
          cleaned_items_count: cleanedCount,
          reason: 'Limpieza manual de datos temporales de mesa',
          timestamp: new Date().toISOString(),
        },
      });

      return { success: true, cleanedItemsCount: cleanedCount };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AdminTablesRepository] Error al limpiar datos temporales de mesa:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Ejecuta la limpieza atómica masiva de todas las mesas inválidas.
   */
  public static async cleanupAllInvalidTables(): Promise<{ success: boolean; cleanedCount?: number; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) return { success: false, error: 'Sesión no autenticada.' };

      const { data, error } = await supabase.rpc('admin_cleanup_all_invalid_tables');
      if (error) {
        logger.error('[AdminTablesRepository] Error ejecutando admin_cleanup_all_invalid_tables RPC:', error.message);
        return { success: false, error: error.message };
      }

      return {
        success: Boolean(data?.success),
        cleanedCount: data?.cleaned_count || 0,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Ejecuta la limpieza global masiva de mesas vacías o finalizadas.
   */
  public static async cleanupAllEmptyTables(): Promise<{
    success: boolean;
    processedCount?: number;
    error?: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, processedCount: 0, error: 'El servicio no está disponible.' };

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_cleanup_empty_tables');
      if (!rpcErr && rpcData?.success) {
        return { success: true, processedCount: rpcData.processed_count || 0 };
      }

      const { data: emptyTables } = await supabase
        .from('game_tables')
        .select('id')
        .or('current_players_count.eq.0,status.in.(CLOSED,TERMINATED,CANCELLED,EXPIRED,FINISHED)');

      if (!emptyTables || emptyTables.length === 0) {
        return { success: true, processedCount: 0 };
      }

      const tableIds = emptyTables.map((t) => t.id);
      await supabase.from('game_table_players').delete().in('table_id', tableIds);
      const { error: delErr } = await supabase.from('game_tables').delete().in('id', tableIds);

      if (delErr) {
        return { success: false, processedCount: 0, error: delErr.message };
      }

      await AdminAuditRepository.recordAdminAudit({
        action: 'LIMPIEZA_MASIVA',
        resourceType: 'GAME_TABLE_BATCH',
        resourceId: 'GLOBAL_CLEANUP',
        severity: 'INFO',
        metadata: {
          cleaned_count: tableIds.length,
          timestamp: new Date().toISOString(),
        },
      });

      return { success: true, processedCount: tableIds.length };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AdminTablesRepository] Error en limpieza masiva de mesas vacías:', message);
      return { success: false, processedCount: 0, error: message };
    }
  }

  /**
   * Política de limpieza automática para mesas abandonadas o inactivas.
   */
  public static async autoCleanExpiredTables(inactiveMinutes: number = 15): Promise<{
    success: boolean;
    expiredTablesCount: number;
    error?: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, expiredTablesCount: 0, error: 'El servicio no está disponible.' };

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_auto_clean_expired_tables', {
        p_inactive_minutes: inactiveMinutes,
      });

      if (!rpcErr && rpcData?.success) {
        return { success: true, expiredTablesCount: rpcData.expired_tables_count || 0 };
      }

      const { data: authData } = await supabase.auth.getUser();
      const adminId = authData?.user?.id;

      const cutoffTime = new Date(Date.now() - inactiveMinutes * 60 * 1000).toISOString();

      const { data: candidateTables, error: searchErr } = await supabase
        .from('game_tables')
        .select('id, status, current_players_count, game_type')
        .in('status', ['OPEN', 'WAITING'])
        .or(`current_players_count.eq.0,current_players_count.is.null`)
        .lt('created_at', cutoffTime);

      if (searchErr || !candidateTables || candidateTables.length === 0) {
        return { success: true, expiredTablesCount: 0 };
      }

      const tableIdsToExpire = candidateTables.map((t) => t.id);

      const { error: updateErr } = await supabase
        .from('game_tables')
        .update({
          status: 'EXPIRED',
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', tableIdsToExpire);

      if (updateErr) {
        return { success: false, expiredTablesCount: 0, error: updateErr.message };
      }

      await AdminAuditRepository.recordAdminAudit({
        action: 'AUTO_CLEANUP_EXPIRED_TABLES',
        resourceType: 'GAME_TABLE_BATCH',
        resourceId: 'BATCH_CLEANUP',
        severity: 'INFO',
        metadata: {
          admin_id: adminId || 'SYSTEM_DAEMON',
          inactive_minutes_threshold: inactiveMinutes,
          expired_tables_count: tableIdsToExpire.length,
          expired_table_ids: tableIdsToExpire,
          timestamp: new Date().toISOString(),
        },
      });

      return { success: true, expiredTablesCount: tableIdsToExpire.length };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AdminTablesRepository] Error en limpieza automática de mesas:', message);
      return { success: false, expiredTablesCount: 0, error: message };
    }
  }

  /**
   * Limpia mesas de Bingo finalizadas o canceladas con más de 1 hora de antigüedad.
   */
  public static async cleanupFinishedBingoTables(): Promise<{
    success: boolean;
    message: string;
    cleanedCount: number;
    error?: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, message: '', cleanedCount: 0, error: 'Servicio no disponible' };

    try {
      const { data, error } = await supabase.rpc('cleanup_finished_bingo_tables');
      if (error) {
        return { success: false, message: '', cleanedCount: 0, error: error.message };
      }
      return {
        success: Boolean(data?.success),
        message: data?.message || 'Limpieza de mesas de bingo completada.',
        cleanedCount: Number(data?.cleaned_count || 0),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: '', cleanedCount: 0, error: message };
    }
  }
}
