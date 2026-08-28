// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE POLLA VENEZOLANA (ANIMALITOS)
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { PollaBlockType, PollaTicket, PollaDrawResultItem, PollaBlockWinner } from '../../types/games';

export interface BlockSalesStatus {
  block: PollaBlockType;
  drawDate: string;
  isOpen: boolean;
  statusText: 'VENTA ABIERTA' | 'VENTA CERRADA' | 'TRANSICIÓN DE TURNO' | 'FINALIZADO';
  closingTimeVET: string; // HH:MM AM/PM
  secondsUntilClose: number;
}

export interface ShiftScheduleInfo {
  currentShift: {
    block: PollaBlockType;
    drawDate: string;
    isOpen: boolean;
    statusText: 'VENTA ABIERTA' | 'VENTA CERRADA' | 'TRANSICIÓN DE TURNO';
    closeTimeFormatted: string;
    secondsUntilClose: number;
    title: string;
  };
  nextShift: {
    block: PollaBlockType;
    drawDate: string;
    openTimeFormatted: string;
    secondsUntilOpen: number;
    title: string;
  };
}

export class PollaRepository {
  /**
   * Obtiene la hora actual en zona horaria de Venezuela (VET - UTC-4)
   */
  public static getVenezuelaTime(): Date {
    const now = new Date();
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
   * Obtiene la fecha del día siguiente en Venezuela formateada en YYYY-MM-DD
   */
  public static getTomorrowVenezuelaString(): string {
    const vet = this.getVenezuelaTime();
    vet.setDate(vet.getDate() + 1);
    const year = vet.getFullYear();
    const month = String(vet.getMonth() + 1).padStart(2, '0');
    const day = String(vet.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Calcula el estado operativo dinámico de los turnos de venta según el horario oficial (Caracas VET)
   */
  public static getShiftSchedule(): ShiftScheduleInfo {
    const vet = this.getVenezuelaTime();
    const todayStr = this.getTodayVenezuelaString();
    const tomorrowStr = this.getTomorrowVenezuelaString();

    const currentMinutes = vet.getHours() * 60 + vet.getMinutes();
    const currentSecondsOfDay = currentMinutes * 60 + vet.getSeconds();

    // 1. Madrugada hasta 07:55 AM (0 - 475 min): Turno Mañana de Hoy
    if (currentMinutes <= 475) {
      const closeSeconds = 475 * 60;
      const openNextSeconds = 485 * 60;
      return {
        currentShift: {
          block: 'MAÑANA',
          drawDate: todayStr,
          isOpen: true,
          statusText: 'VENTA ABIERTA',
          closeTimeFormatted: '07:55 AM',
          secondsUntilClose: Math.max(0, closeSeconds - currentSecondsOfDay),
          title: `Polla Turno Mañana — Hoy (${todayStr})`,
        },
        nextShift: {
          block: 'TARDE',
          drawDate: todayStr,
          openTimeFormatted: '08:05 AM',
          secondsUntilOpen: Math.max(0, openNextSeconds - currentSecondsOfDay),
          title: `Turno Tarde — Hoy (${todayStr})`,
        },
      };
    }

    // 2. Intervalo de Cierre 1 (07:55 AM - 08:05 AM / 475 - 485 min)
    if (currentMinutes < 485) {
      const openNextSeconds = 485 * 60;
      return {
        currentShift: {
          block: 'MAÑANA',
          drawDate: todayStr,
          isOpen: false,
          statusText: 'TRANSICIÓN DE TURNO',
          closeTimeFormatted: '07:55 AM',
          secondsUntilClose: 0,
          title: `Cierre Turno Mañana — Hoy (${todayStr})`,
        },
        nextShift: {
          block: 'TARDE',
          drawDate: todayStr,
          openTimeFormatted: '08:05 AM',
          secondsUntilOpen: Math.max(0, openNextSeconds - currentSecondsOfDay),
          title: `Turno Tarde — Hoy (${todayStr})`,
        },
      };
    }

    // 3. Mañana/Mediodía (08:05 AM - 01:55 PM / 485 - 835 min): Turno Tarde de Hoy
    if (currentMinutes <= 835) {
      const closeSeconds = 835 * 60;
      const openNextSeconds = 840 * 60;
      return {
        currentShift: {
          block: 'TARDE',
          drawDate: todayStr,
          isOpen: true,
          statusText: 'VENTA ABIERTA',
          closeTimeFormatted: '01:55 PM',
          secondsUntilClose: Math.max(0, closeSeconds - currentSecondsOfDay),
          title: `Polla Turno Tarde — Hoy (${todayStr})`,
        },
        nextShift: {
          block: 'MAÑANA',
          drawDate: tomorrowStr,
          openTimeFormatted: '02:00 PM (Hoy)',
          secondsUntilOpen: Math.max(0, openNextSeconds - currentSecondsOfDay),
          title: `Turno Mañana — Mañana (${tomorrowStr})`,
        },
      };
    }

    // 4. Intervalo de Cierre 2 (01:55 PM - 02:00 PM / 835 - 840 min)
    if (currentMinutes < 840) {
      const openNextSeconds = 840 * 60;
      return {
        currentShift: {
          block: 'TARDE',
          drawDate: todayStr,
          isOpen: false,
          statusText: 'TRANSICIÓN DE TURNO',
          closeTimeFormatted: '01:55 PM',
          secondsUntilClose: 0,
          title: `Cierre Turno Tarde — Hoy (${todayStr})`,
        },
        nextShift: {
          block: 'MAÑANA',
          drawDate: tomorrowStr,
          openTimeFormatted: '02:00 PM',
          secondsUntilOpen: Math.max(0, openNextSeconds - currentSecondsOfDay),
          title: `Turno Mañana — Mañana (${tomorrowStr})`,
        },
      };
    }

    // 5. Tarde / Noche (02:00 PM - 11:59 PM / 840 - 1439 min): Turno Mañana del Día Siguiente
    const secondsLeftToday = 86400 - currentSecondsOfDay;
    const closeSecondsTomorrow = secondsLeftToday + 475 * 60; // Hasta las 07:55 AM de mañana
    const openSecondsTomorrow = secondsLeftToday + 485 * 60;  // Hasta las 08:05 AM de mañana

    return {
      currentShift: {
        block: 'MAÑANA',
        drawDate: tomorrowStr,
        isOpen: true,
        statusText: 'VENTA ABIERTA',
        closeTimeFormatted: '07:55 AM (Mañana)',
        secondsUntilClose: closeSecondsTomorrow,
        title: `Polla Turno Mañana — Mañana (${tomorrowStr})`,
      },
      nextShift: {
        block: 'TARDE',
        drawDate: tomorrowStr,
        openTimeFormatted: '08:05 AM (Mañana)',
        secondsUntilOpen: openSecondsTomorrow,
        title: `Turno Tarde — Mañana (${tomorrowStr})`,
      },
    };
  }

  /**
   * Obtiene el estado operativo para un bloque y fecha específico
   */
  public static getBlockSalesStatus(block: PollaBlockType, targetDateStr?: string): BlockSalesStatus {
    const schedule = this.getShiftSchedule();
    const targetDate = targetDateStr || schedule.currentShift.drawDate;

    if (schedule.currentShift.block === block && schedule.currentShift.drawDate === targetDate) {
      return {
        block,
        drawDate: targetDate,
        isOpen: schedule.currentShift.isOpen,
        statusText: schedule.currentShift.statusText,
        closingTimeVET: schedule.currentShift.closeTimeFormatted,
        secondsUntilClose: schedule.currentShift.secondsUntilClose,
      };
    }

    if (schedule.nextShift.block === block && schedule.nextShift.drawDate === targetDate) {
      return {
        block,
        drawDate: targetDate,
        isOpen: false,
        statusText: 'VENTA CERRADA',
        closingTimeVET: schedule.nextShift.openTimeFormatted,
        secondsUntilClose: schedule.nextShift.secondsUntilOpen,
      };
    }

    // Si es del pasado
    const todayStr = this.getTodayVenezuelaString();
    if (targetDate < todayStr) {
      return {
        block,
        drawDate: targetDate,
        isOpen: false,
        statusText: 'FINALIZADO',
        closingTimeVET: block === 'MAÑANA' ? '07:55 AM' : '01:55 PM',
        secondsUntilClose: 0,
      };
    }

    return {
      block,
      drawDate: targetDate,
      isOpen: false,
      statusText: 'VENTA CERRADA',
      closingTimeVET: block === 'MAÑANA' ? '07:55 AM' : '01:55 PM',
      secondsUntilClose: 0,
    };
  }

  /**
   * Compra atómica de ticket de Polla
   */
  public static async buyPollaTicket(
    block: PollaBlockType,
    drawDate: string,
    animalitos: string[]
  ): Promise<{
    success: boolean;
    ticketId?: string;
    ticketNumber?: string;
    verificationCode?: string;
    balanceAfter?: number;
    message?: string;
    error?: string;
  }> {
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
          ticketNumber: data.ticket_number,
          verificationCode: data.verification_code,
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
   * Obtiene los tickets del usuario autenticado ("Mis Pollas") con numeración y estado
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
        ticketNumber: row.ticket_number || `POLLA #${row.id.substring(0, 8).toUpperCase()}`,
        verificationCode: row.verification_code || `PL-${row.id.substring(0, 6).toUpperCase()}`,
        validationStatus: row.validation_status || 'PENDING',
        validatedBy: row.validated_by,
        validatedAt: row.validated_at,
        creditedAt: row.credited_at,
        rejectionReason: row.rejection_reason,
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

  /**
   * Ejecuta la detección automática de posibles ganadores para un turno (Admin)
   */
  public static async detectPotentialWinners(
    drawDate: string,
    block: PollaBlockType
  ): Promise<{ success: boolean; detectedCount?: number; message?: string; error?: string }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('detect_polla_potential_winners', {
        p_draw_date: drawDate,
        p_block: block,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: data?.success || false,
        detectedCount: data?.detected_count || 0,
        message: data?.message || 'Detección completada.',
        error: data?.error,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error ejecutando detección.' };
    }
  }

  /**
   * Obtiene todos los tickets pendientes de validación o ya auditados por administradores
   */
  public static async getPendingValidationTickets(drawDate?: string): Promise<(PollaTicket & { userName?: string })[]> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('polla_tickets')
        .select('*, user:profiles!user_id(username, full_name)')
        .order('created_at', { ascending: false });

      if (drawDate) {
        query = query.eq('draw_date', drawDate);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[PollaRepository] Error obteniendo tickets para validación:', error.message);
        return [];
      }

      return (data || []).map((row: any) => {
        const userName = row.user?.full_name || row.user?.username || 'JUGADOR DESCONOCIDO';
        return {
          id: row.id,
          userId: row.user_id,
          userName,
          block: row.block,
          drawDate: row.draw_date,
          animalitos: row.animalitos || [],
          costBs: Number(row.cost_bs || 250),
          hits: row.hits || 0,
          status: row.status || 'PENDING',
          prizeBs: Number(row.prize_bs || 0),
          createdAt: row.created_at,
          ticketNumber: row.ticket_number || `POLLA #${row.id.substring(0, 8).toUpperCase()}`,
          verificationCode: row.verification_code || `PL-${row.id.substring(0, 6).toUpperCase()}`,
          validationStatus: row.validation_status || 'PENDING',
          validatedBy: row.validated_by,
          validatedAt: row.validated_at,
          creditedAt: row.credited_at,
          rejectionReason: row.rejection_reason,
        };
      });
    } catch (err) {
      console.error('[PollaRepository] Excepción obteniendo tickets para validación:', err);
      return [];
    }
  }

  /**
   * Realiza la revisión humana y cambia estado a VALIDATED o REJECTED
   */
  public static async validateWinner(
    ticketId: string,
    action: 'VALIDATE' | 'REJECT',
    reason: string = ''
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('validate_polla_winner_secure', {
        p_ticket_id: ticketId,
        p_action: action,
        p_reason: reason,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: data?.success || false,
        message: data?.message || 'Operación realizada.',
        error: data?.error,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error validando ticket.' };
    }
  }

  /**
   * Acredita el premio del ganador validado en su billetera de forma segura
   */
  public static async creditPrize(
    ticketId: string,
    prizeBs: number
  ): Promise<{ success: boolean; balanceAfter?: number; message?: string; error?: string }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('credit_polla_prize_secure', {
        p_ticket_id: ticketId,
        p_prize_bs: prizeBs,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && data.success) {
        return {
          success: true,
          balanceAfter: data.balance_after,
          message: data.message || 'PREMIO ACREDITADO CON ÉXITO.',
        };
      }

      return {
        success: false,
        error: data?.error || 'No se pudo acreditar el premio.',
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error acreditando premio.' };
    }
  }
}

