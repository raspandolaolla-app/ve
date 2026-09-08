// ==============================================================================
// RASPANDO LA OLLA — SERVICIO DE GESTIÓN Y AUDITORÍA DE TÉRMINOS Y CONDICIONES
// ==============================================================================
// Registra y valida la aceptación obligatoria de términos y mayoría de edad (+18).
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { CURRENT_TERMS_VERSION } from '../../data/legalDocuments';
import type { TermsAcceptanceRecord, TermsVersion } from '../../types/legal';

const STORAGE_KEY_PREFIX = 'rlo_terms_acceptance_';

export class TermsService {
  /**
   * Clave única de almacenamiento local por usuario
   */
  private static getStorageKey(userId: string): string {
    return `${STORAGE_KEY_PREFIX}${userId}`;
  }

  /**
   * Verifica si el usuario ha aceptado la versión vigente de términos y confirmado ser mayor de 18 años.
   */
  public static hasAcceptedCurrentTerms(userId: string, userMetadata?: Record<string, any> | null): boolean {
    if (!userId) return false;

    // 1. Verificar primero en los metadatos de Supabase Auth
    if (userMetadata) {
      const metaVersion = userMetadata.terms_accepted_version;
      const isAdult = Boolean(userMetadata.is_adult_confirmed);
      if (metaVersion === CURRENT_TERMS_VERSION && isAdult) {
        return true;
      }
    }

    // 2. Verificar en el almacenamiento seguro local
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(this.getStorageKey(userId));
        if (stored) {
          const parsed = JSON.parse(stored) as TermsAcceptanceRecord;
          if (parsed.termsVersion === CURRENT_TERMS_VERSION && parsed.isAdultConfirmed) {
            return true;
          }
        }
      }
    } catch (err) {
      console.warn('[TermsService] Error leyendo almacenamiento local de términos:', err);
    }

    return false;
  }

  /**
   * Obtiene los detalles de la aceptación registrada para un usuario.
   */
  public static getAcceptanceRecord(userId: string): TermsAcceptanceRecord | null {
    if (!userId) return null;

    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(this.getStorageKey(userId));
        if (stored) {
          return JSON.parse(stored) as TermsAcceptanceRecord;
        }
      }
    } catch (err) {
      console.warn('[TermsService] Error al obtener registro de aceptación:', err);
    }

    return null;
  }

  /**
   * Registra formalmente la aceptación de términos v1.0 y confirmación +18 años.
   */
  public static async recordAcceptance(
    userId: string,
    userEmail?: string | null
  ): Promise<{ success: boolean; record: TermsAcceptanceRecord }> {
    const acceptedAt = new Date().toISOString();
    const platformOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://raspando-la-olla.com';

    const record: TermsAcceptanceRecord = {
      userId,
      termsVersion: CURRENT_TERMS_VERSION,
      isAdultConfirmed: true,
      acceptedAt,
      platformOrigin,
      userEmailMasked: userEmail ? this.maskEmail(userEmail) : undefined,
    };

    // 1. Guardar en almacenamiento local
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(this.getStorageKey(userId), JSON.stringify(record));
      }
    } catch (err) {
      console.error('[TermsService] Error guardando registro localmente:', err);
    }

    // 2. Persistir en los metadatos protegidos de Supabase Auth
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.auth.updateUser({
          data: {
            terms_accepted_version: CURRENT_TERMS_VERSION,
            terms_accepted_at: acceptedAt,
            is_adult_confirmed: true,
            terms_platform_origin: platformOrigin,
          },
        });
      }
    } catch (err) {
      console.warn('[TermsService] Advertencia al sincronizar metadatos con Supabase:', err);
    }

    return { success: true, record };
  }

  /**
   * Enmascara el correo para el recibo de auditoría sin exponer datos innecesarios.
   */
  private static maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const name = parts[0];
    const domain = parts[1];
    const maskedName = name.length > 2 ? `${name.substring(0, 2)}***${name.slice(-1)}` : `${name}***`;
    return `${maskedName}@${domain}`;
  }
}
