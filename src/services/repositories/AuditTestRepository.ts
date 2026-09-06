// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE AUDITORÍA Y LIMPIEZA DE TEST DE SISTEMA
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { AuditCleanupSummary } from '../../types/auditTest';
import { GameRepository } from './GameRepository';
import type { GameType } from '../../types/games';

export class AuditTestRepository {
  /**
   * Inspecciona la cantidad de registros creados por el runner de auditoría (AUDIT_TEST).
   */
  public static async getAuditTestSummary(prefix = 'AUDIT_TEST'): Promise<{
    testTablesCount: number;
    testActionsCount: number;
    testTicketsCount: number;
    testLogsCount: number;
    realTablesCount: number;
    realWalletsCount: number;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return {
        testTablesCount: 0,
        testActionsCount: 0,
        testTicketsCount: 0,
        testLogsCount: 0,
        realTablesCount: 0,
        realWalletsCount: 0,
      };
    }

    try {
      const { data, error } = await supabase.rpc('admin_get_audit_test_summary', {
        p_test_prefix: prefix,
      });

      if (!error && data && data.success) {
        return {
          testTablesCount: data.test_tables_count || 0,
          testActionsCount: data.test_actions_count || 0,
          testTicketsCount: data.test_tickets_count || 0,
          testLogsCount: data.test_logs_count || 0,
          realTablesCount: data.real_tables_count || 0,
          realWalletsCount: data.real_wallets_count || 0,
        };
      }
    } catch {
      // Fallback manual si el RPC aún no fue migrado en remoto
    }

    // Fallback directo por consulta
    try {
      const [
        { count: testTables },
        { count: testTickets },
        { count: realTables },
        { count: realWallets },
      ] = await Promise.all([
        supabase
          .from('game_tables')
          .select('*', { count: 'exact', head: true })
          .or(`name.like.${prefix}%,invite_code.like.AUDIT%`),
        supabase
          .from('polla_tickets')
          .select('*', { count: 'exact', head: true })
          .like('transaction_id', `${prefix}%`),
        supabase
          .from('game_tables')
          .select('*', { count: 'exact', head: true })
          .not('name', 'like', `${prefix}%`),
        supabase
          .from('wallets')
          .select('*', { count: 'exact', head: true }),
      ]);

      return {
        testTablesCount: testTables || 0,
        testActionsCount: 0,
        testTicketsCount: testTickets || 0,
        testLogsCount: 0,
        realTablesCount: realTables || 0,
        realWalletsCount: realWallets || 0,
      };
    } catch {
      return {
        testTablesCount: 0,
        testActionsCount: 0,
        testTicketsCount: 0,
        testLogsCount: 0,
        realTablesCount: 0,
        realWalletsCount: 0,
      };
    }
  }

  /**
   * Ejecuta la limpieza de datos de prueba etiquetados con AUDIT_TEST.
   */
  public static async cleanupAuditTestData(prefix = 'AUDIT_TEST'): Promise<{
    success: boolean;
    summary?: AuditCleanupSummary;
    error?: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Cliente de Supabase no disponible' };
    }

    try {
      const { data, error } = await supabase.rpc('admin_cleanup_audit_test_data', {
        p_test_prefix: prefix,
      });

      if (!error && data && data.success) {
        return {
          success: true,
          summary: {
            deletedTables: data.deleted_tables || 0,
            deletedActions: data.deleted_actions || 0,
            deletedTickets: data.deleted_tickets || 0,
            deletedLogs: data.deleted_logs || 0,
            remainingRealTables: data.remaining_real_tables || 0,
            remainingRealWallets: data.remaining_real_wallets || 0,
            message:
              data.message ||
              'Limpieza ejecutada exitosamente. Datos reales preservados intactos.',
          },
        };
      }
    } catch {
      // Fallback
    }

    // Fallback por eliminación directa de mesas etiquetadas AUDIT_TEST
    try {
      const { data: testTables } = await supabase
        .from('game_tables')
        .select('id')
        .or(`name.like.${prefix}%,invite_code.like.AUDIT%`);

      let deletedTables = 0;
      if (testTables && testTables.length > 0) {
        const ids = testTables.map((t) => t.id);
        await supabase.from('game_actions').delete().in('table_id', ids);
        await supabase.from('game_table_players').delete().in('table_id', ids);
        await supabase.from('game_sessions').delete().in('table_id', ids);
        const { count } = await supabase
          .from('game_tables')
          .delete({ count: 'exact' })
          .in('id', ids);
        deletedTables = count || 0;
      }

      const [{ count: remainingRealTables }, { count: remainingRealWallets }] =
        await Promise.all([
          supabase.from('game_tables').select('*', { count: 'exact', head: true }),
          supabase.from('wallets').select('*', { count: 'exact', head: true }),
        ]);

      return {
        success: true,
        summary: {
          deletedTables,
          deletedActions: 0,
          deletedTickets: 0,
          deletedLogs: 0,
          remainingRealTables: remainingRealTables || 0,
          remainingRealWallets: remainingRealWallets || 0,
          message:
            'Limpieza de seguridad completada. Todos los registros de usuarios y partidas reales permanecen intactos.',
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Error al ejecutar limpieza de datos de prueba.',
      };
    }
  }

  /**
   * Limpia de forma segura sesiones y mesas de prueba (AUDIT_TEST) de un usuario
   * para un juego específico antes de ejecutar pruebas de auditoría.
   * NUNCA toca ni cierra mesas o partidas reales de usuarios.
   */
  public static async cleanupAuditGameSession(
    userId?: string | null,
    gameType?: string | null
  ): Promise<{
    success: boolean;
    cleanedTables: number;
    realActiveTables: number;
    message?: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, cleanedTables: 0, realActiveTables: 0, message: 'Supabase no inicializado' };
    }

    try {
      const { data, error } = await supabase.rpc('cleanup_audit_game_session', {
        p_user_id: userId || null,
        p_game_type: gameType || null,
      });

      if (!error && data && data.success) {
        return {
          success: true,
          cleanedTables: data.cleaned_tables || 0,
          realActiveTables: data.real_active_tables || 0,
          message: data.message,
        };
      }
    } catch {
      // Fallback directo seguro
    }

    // Fallback directo si la función RPC aún no está cargada en Supabase
    try {
      if (!userId) {
        return { success: true, cleanedTables: 0, realActiveTables: 0 };
      }

      // 1. Detectar si hay mesas reales activas
      let realQuery = supabase
        .from('game_tables')
        .select('id, name, game_type')
        .in('status', ['OPEN', 'FULL', 'STARTING', 'ACTIVE', 'WAITING']);

      if (gameType) {
        const dbEnum = GameRepository.mapGameTypeToDbEnum(gameType as GameType);
        realQuery = realQuery.or(`game_type.eq.${gameType},game_type.eq.${dbEnum}`);
      }

      const { data: activeTables } = await realQuery;
      let realActiveCount = 0;
      const auditTableIds: string[] = [];

      if (activeTables) {
        for (const tbl of activeTables) {
          const isAudit =
            tbl.name?.includes('AUDIT_TEST') ||
            tbl.name?.includes('AUDIT') ||
            tbl.name?.startsWith('Mesa AUDIT');
          if (isAudit) {
            auditTableIds.push(tbl.id);
          } else {
            realActiveCount++;
          }
        }
      }

      let cleaned = 0;
      if (auditTableIds.length > 0) {
        await supabase
          .from('game_table_players')
          .update({ status: 'LEFT' })
          .in('table_id', auditTableIds);

        await supabase
          .from('game_sessions')
          .update({ status: 'SETTLED', ended_at: new Date().toISOString(), is_settled: true })
          .in('table_id', auditTableIds);

        const { count } = await supabase
          .from('game_tables')
          .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
          .in('id', auditTableIds);

        cleaned = count || auditTableIds.length;
      }

      return {
        success: true,
        cleanedTables: cleaned,
        realActiveTables: realActiveCount,
        message:
          realActiveCount > 0
            ? `Usuario participa en partida real de ${gameType || 'juego'}. Auditoría omitida.`
            : `Limpieza de mesas de auditoría completada (${cleaned} mesas).`,
      };
    } catch {
      return { success: true, cleanedTables: 0, realActiveTables: 0 };
    }
  }
}
