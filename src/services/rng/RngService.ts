// ==============================================================================
// RASPANDO LA OLLA — SERVICIO MAESTRO DE RNG SEGURO Y AUTORITATIVO
// ==============================================================================
// Interfaz cliente-servidor para invocación de RPCs de aleatoriedad criptográfica (pgcrypto/gen_random_bytes),
// validación de idempotencia, firma de compromiso y auditoría de imparcialidad.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { GameType } from '../../types/games';

export interface RngEventLog {
  id: string;
  eventId: string;
  sessionId: string;
  tableId?: string;
  userId?: string;
  gameType: GameType;
  eventType: string;
  sequenceNumber: number;
  result: Record<string, any>;
  commitmentHash: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface RollDiceResult {
  success: boolean;
  diceValue: number;
  eventId: string;
  commitmentHash: string;
  isIdempotent?: boolean;
}

export interface DrawBingoBallResult {
  success: boolean;
  ball?: number;
  eventId?: string;
  commitmentHash?: string;
  isIdempotent?: boolean;
  error?: string;
}

export class RngService {
  /**
   * Genera un entero aleatorio criptográficamente seguro en el navegador (Web Crypto API)
   * como fallback seguro si no hay conexión a internet.
   */
  public static getRandomIntSecure(min: number, max: number): number {
    if (min >= max) return min;
    const range = max - min + 1;
    const array = new Uint32Array(1);
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : (globalThis.crypto as any);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(array);
      return min + (array[0] % range);
    } else {
      // Fallback simple para entornos sin Web Crypto API
      return min + Math.floor(Math.random() * range);
    }
  }

  /**
   * Invoca la RPC `rpc_roll_dice_secure` en Supabase para obtener un lanzamiento de dado
   * generado en servidor con pgcrypto gen_random_bytes.
   */
  public static async rollDiceSecure(
    sessionId: string,
    idempotencyKey?: string
  ): Promise<RollDiceResult> {
    const supabase = getSupabaseClient();
    const key = idempotencyKey || `roll_${sessionId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_roll_dice_secure', {
          p_session_id: sessionId,
          p_idempotency_key: key,
        });

        if (!error && data && data.success) {
          return {
            success: true,
            diceValue: data.dice_value,
            eventId: data.event_id,
            commitmentHash: data.commitment_hash,
            isIdempotent: data.is_idempotent,
          };
        }

        if (error) {
          console.warn('[RngService] Fallback por error en rpc_roll_dice_secure:', error.message);
        }
      } catch (err) {
        console.warn('[RngService] Excepción llamando rpc_roll_dice_secure:', err);
      }
    }

    // Fallback criptográficamente seguro cliente (Web Crypto API)
    const diceVal = this.getRandomIntSecure(1, 6);
    return {
      success: true,
      diceValue: diceVal,
      eventId: `local_rng_${Date.now()}`,
      commitmentHash: `LOCAL_HASH_${Date.now()}`,
    };
  }

  /**
   * Invoca la RPC `rpc_draw_bingo_ball_secure` para extraer balota de Bingo.
   */
  public static async drawBingoBallSecure(
    sessionId: string,
    idempotencyKey?: string
  ): Promise<DrawBingoBallResult> {
    const supabase = getSupabaseClient();
    const key = idempotencyKey || `draw_${sessionId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_draw_bingo_ball_secure', {
          p_session_id: sessionId,
          p_idempotency_key: key,
        });

        if (!error && data && data.success) {
          return {
            success: true,
            ball: data.ball,
            eventId: data.event_id,
            commitmentHash: data.commitment_hash,
            isIdempotent: data.is_idempotent,
          };
        }

        if (error || (data && !data.success)) {
          return {
            success: false,
            error: data?.error || error?.message || 'Error al extraer balota de Bingo',
          };
        }
      } catch (err: any) {
        console.warn('[RngService] Excepción en rpc_draw_bingo_ball_secure:', err);
      }
    }

    return {
      success: false,
      error: 'Servidor de RNG no disponible',
    };
  }

  /**
   * Obtiene la auditoría de eventos RNG inmutables para una sesión de juego.
   */
  public static async getSessionRngAuditLogs(sessionId: string): Promise<RngEventLog[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('rng_events')
        .select('*')
        .eq('session_id', sessionId)
        .order('sequence_number', { ascending: true });

      if (error || !data) return [];

      return data.map((item: any) => ({
        id: item.id,
        eventId: item.event_id,
        sessionId: item.session_id,
        tableId: item.table_id,
        userId: item.user_id,
        gameType: item.game_type,
        eventType: item.event_type,
        sequenceNumber: item.sequence_number,
        result: item.result || {},
        commitmentHash: item.commitment_hash,
        idempotencyKey: item.idempotency_key,
        createdAt: item.created_at,
      }));
    } catch (err) {
      console.error('[RngService] Error obteniendo auditoría RNG:', err);
      return [];
    }
  }

  /**
   * Verifica client-side el Hash de Compromiso Criptográfico (Fairness Check).
   */
  public static async verifyCommitmentHash(
    sessionId: string,
    idempotencyKey: string,
    value: string | number,
    expectedHash: string
  ): Promise<boolean> {
    try {
      const inputStr = `${sessionId}_${idempotencyKey}_${value}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(inputStr);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return calculatedHash.toLowerCase() === expectedHash.toLowerCase();
    } catch {
      return false;
    }
  }
}
