// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE POLLA VENEZOLANA (ANIMALITOS)
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { PollaBlockType, PollaTicket, PollaDrawResultItem, PollaBlockWinner } from '../../types/games';

export interface BlockSalesStatus {
  block: PollaBlockType;
  isOpen: boolean;
  statusText: 'VENTA ABIERTA' | 'VENTA CERRADA' | 'BLOQUE EN CURSO' | 'FINALIZADO' | 'PRÓXIMAMENTE';
  closingTimeVET: string; // HH:MM AM/PM
  secondsUntilClose: number;
}

export class PollaRepository {
  /**
   * Obtiene la hora actual en zona horaria de Venezuela (VET - UTC-4)
   */
  public static getVenezuelaTime(): Date {
    const now = new Date();
    // Convertir a VET (UTC-4)
    const vetDateString = now.toLocaleString('en-US', { timeZone: 'America/Caracas' });
    return new Date(vetDateString);
  }

  /**
   * Obtiene la fecha actual en Venezuela formateada en YYYY-MM-DD
   */
  public static getTodayVenezuelaString(): string {
    const vet = this.getVenezuelaTime();
    const year = vet.getFullYear();
    const month = String(vet.getMonth() + 1).padStart(2, '0');
    const day = String(vet.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Calcula el estado operativo de las ventanas de venta para los bloques Mañana y Tarde
   */
  public static getBlockSalesStatus(block: PollaBlockType, targetDateStr?: string): BlockSalesStatus {
    const vet = this.getVenezuelaTime();
    const todayStr = this.getTodayVenezuelaString();
    const dateStr = targetDateStr || todayStr;

    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;
    const currentMinutes = vet.getHours() * 60 + vet.getMinutes();

    if (isPast) {
      return {
        block,
        isOpen: false,
        statusText: 'FINALIZADO',
        closingTimeVET: block === 'MAÑANA' ? '07:55 AM' : '01:55 PM',
        secondsUntilClose: 0,
      };
    }

    if (block === 'MAÑANA') {
      // Cierre 07:55 AM (475 minutos)
      const closeMinutes = 7 * 60 + 55;
      if (isToday) {
        if (currentMinutes <= closeMinutes) {
          const secondsUntilClose = (closeMinutes - currentMinutes) * 60 - vet.getSeconds();
          return {
            block: 'MAÑANA',
            isOpen: true,
            statusText: 'VENTA ABIERTA',
            closingTimeVET: '07:55 AM',
            secondsUntilClose: Math.max(0, secondsUntilClose),
          };
        } else {
          return {
            block: 'MAÑANA',
            isOpen: false,
            statusText: 'VENTA CERRADA',
            closingTimeVET: '07:55 AM',
            secondsUntilClose: 0,
          };
        }
      } else {
        // Venta futura abierta
        return {
          block: 'MAÑANA',
          isOpen: true,
          statusText: 'VENTA ABIERTA',
          closingTimeVET: '07:55 AM',
          secondsUntilClose: 86400,
        };
      }
    } else {
      // BLOQUE TARDE: Cierre 13:55 PM (835 minutos)
      const closeMinutes = 13 * 60 + 55;
      if (isToday) {
        if (currentMinutes <= closeMinutes) {
          const secondsUntilClose = (closeMinutes - currentMinutes) * 60 - vet.getSeconds();
          return {
            block: 'TARDE',
            isOpen: true,
            statusText: 'VENTA ABIERTA',
            closingTimeVET: '01:55 PM',
            secondsUntilClose: Math.max(0, secondsUntilClose),
          };
        } else {
          return {
            block: 'TARDE',
            isOpen: false,
            statusText: 'VENTA CERRADA',
            closingTimeVET: '01:55 PM',
            secondsUntilClose: 0,
          };
        }
      } else {
        return {
          block: 'TARDE',
          isOpen: true,
          statusText: 'VENTA ABIERTA',
          closingTimeVET: '01:55 PM',
          secondsUntilClose: 86400,
        };
      }
    }
  }

  /**
   * Ejecuta la RPC buy_polla_ticket_secure para compra atómica de ticket
   */
  public static async buyPollaTicket(
    block: PollaBlockType,
    drawDate: string,
    animalitos: string[]
  ): Promise<{ success: boolean; ticketId?: string; balanceAfter?: number; message?: string; error?: string }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('buy_polla_ticket_secure', {
        p_block: block,
        p_draw_date: drawDate,
        p_animalitos: animalitos,
      });

      if (error) {
        console.error('[PollaRepository] Error RPC buy_polla_ticket_secure:', error.message);
        return { success: false, error: error.message };
      }

      if (data && data.success) {
        return {
          success: true,
          ticketId: data.ticket_id,
          balanceAfter: data.balance_after,
          message: data.message || 'SE DESCONTARON 250 Bs DE TU SALDO.',
        };
      }

      return {
        success: false,
        error: data?.error || 'No se pudo procesar la compra de la polla.',
      };
    } catch (err: any) {
      console.error('[PollaRepository] Excepción comprando polla:', err);
      return { success: false, error: err?.message || 'Error inesperado de red o servidor.' };
    }
  }

  /**
   * Obtiene los tickets del usuario autenticado ("Mis Pollas")
   */
  public static async getUserTickets(drawDate?: string, block?: PollaBlockType): Promise<PollaTicket[]> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('polla_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (drawDate) {
        query = query.eq('draw_date', drawDate);
      }
      if (block) {
        query = query.eq('block', block);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[PollaRepository] Error obteniendo tickets de polla:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        block: row.block,
        drawDate: row.draw_date,
        animalitos: row.animalitos || [],
        costBs: Number(row.cost_bs || 250),
        hits: row.hits || 0,
        status: row.status || 'PENDING',
        prizeBs: Number(row.prize_bs || 0),
        createdAt: row.created_at,
      }));
    } catch (err) {
      console.error('[PollaRepository] Excepción obteniendo tickets de polla:', err);
      return [];
    }
  }

  /**
   * Obtiene los resultados de los sorteos para una fecha
   */
  public static async getDrawResults(drawDate?: string, block?: PollaBlockType): Promise<PollaDrawResultItem[]> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('polla_draw_results')
        .select('*')
        .order('draw_time', { ascending: true });

      if (drawDate) {
        query = query.eq('draw_date', drawDate);
      }
      if (block) {
        query = query.eq('block', block);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[PollaRepository] Error obteniendo resultados de sorteos:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        drawDate: row.draw_date,
        block: row.block,
        drawTime: row.draw_time,
        lotteries: row.lotteries || [],
        createdAt: row.created_at,
      }));
    } catch (err) {
      console.error('[PollaRepository] Excepción obteniendo resultados de sorteos:', err);
      return [];
    }
  }

  /**
   * Obtiene los ganadores oficiales declarados en los cierres de bloque
   */
  public static async getBlockWinners(drawDate?: string): Promise<PollaBlockWinner[]> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('polla_block_closures')
        .select('*, winner_user:profiles!winner_user_id(username, full_name)')
        .order('created_at', { ascending: false });

      if (drawDate) {
        query = query.eq('draw_date', drawDate);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[PollaRepository] Error obteniendo ganadores de bloque:', error.message);
        return [];
      }

      return (data || []).map((row: any) => {
        const name = row.winner_user?.full_name || row.winner_user?.username || 'JUGADOR SIN NOMBRE';
        return {
          block: row.block,
          drawDate: row.draw_date,
          winnerUserId: row.winner_user_id,
          winnerName: name.toUpperCase(),
          winnerTicketId: row.winner_ticket_id,
          hits: row.hits || 6,
          prizeBs: Number(row.closure_event_data?.prize_bs || 0),
        };
      });
    } catch (err) {
      console.error('[PollaRepository] Excepción obteniendo ganadores de bloque:', err);
      return [];
    }
  }

  /**
   * Registra un resultado oficial de sorteo (Admin)
   */
  public static async saveDrawResult(
    drawDate: string,
    block: PollaBlockType,
    drawTime: string,
    lotteries: { lotteryName: string; numbers: string[] }[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('polla_draw_results').upsert(
        {
          draw_date: drawDate,
          block: block,
          draw_time: drawTime,
          lotteries: lotteries,
        },
        { onConflict: 'draw_date,block,draw_time' }
      );

      if (error) {
        console.error('[PollaRepository] Error guardando resultado de sorteo:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      console.error('[PollaRepository] Excepción guardando resultado de sorteo:', err);
      return { success: false, error: err?.message || 'Error guardando resultado.' };
    }
  }
}
