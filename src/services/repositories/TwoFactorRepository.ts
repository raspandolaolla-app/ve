// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE AUTENTICACIÓN 2FA (TOTP / RECOVERY CODES)
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { sanitizeUserErrorMessage } from '../../utils/errorSanitizer';

export interface TwoFactorStatus {
  isEnabled: boolean;
  hasSecret: boolean;
  isLocked: boolean;
  lockedUntil?: string | null;
}

export interface TwoFactorSecret {
  secret: string;
  qrUri: string;
  email: string;
}

export class TwoFactorRepository {
  /**
   * Obtiene el estado actual de la autenticación 2FA del usuario conectado.
   */
  public static async get2FAStatus(): Promise<TwoFactorStatus> {
    const supabase = getSupabaseClient();
    if (!supabase) return { isEnabled: false, hasSecret: false, isLocked: false };

    try {
      const { data, error } = await supabase.rpc('get_2fa_status');
      if (!error && data) {
        return {
          isEnabled: Boolean(data?.is_enabled),
          hasSecret: Boolean(data?.has_secret),
          isLocked: Boolean(data?.is_locked),
          lockedUntil: data?.locked_until || null,
        };
      }

      // Fallback directo a la tabla user_2fa_secrets
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        const { data: secretRow } = await supabase
          .from('user_2fa_secrets')
          .select('is_active, secret, secret_encrypted, locked_until')
          .eq('user_id', userData.user.id)
          .maybeSingle();

        if (secretRow) {
          const isLocked = secretRow.locked_until ? new Date(secretRow.locked_until) > new Date() : false;
          return {
            isEnabled: Boolean(secretRow.is_active),
            hasSecret: Boolean(secretRow.secret || secretRow.secret_encrypted),
            isLocked,
            lockedUntil: secretRow.locked_until || null,
          };
        }
      }

      return { isEnabled: false, hasSecret: false, isLocked: false };
    } catch (err) {
      console.error('[TwoFactorRepository] Excepción obteniendo estado 2FA:', err);
      return { isEnabled: false, hasSecret: false, isLocked: false };
    }
  }

  /**
   * Genera un nuevo secreto Base32 y URI de código QR en Supabase.
   */
  public static async generateTOTPSecret(): Promise<TwoFactorSecret | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      // 1. Intentar con setup_2fa_for_user canónico
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        const { data: setupData, error: setupError } = await supabase.rpc('setup_2fa_for_user', {
          user_id: userData.user.id,
        });

        if (!setupError && setupData && setupData.success) {
          return {
            secret: setupData.secret,
            qrUri: setupData.qr_url,
            email: userData.user.email || 'usuario@raspandolaolla.com',
          };
        }
      }

      // 2. Fallback a generate_totp_secret
      const { data, error } = await supabase.rpc('generate_totp_secret');
      if (error) {
        console.error('[TwoFactorRepository] Error generando secreto 2FA:', error.message);
        return null;
      }

      return {
        secret: data.secret,
        qrUri: data.qr_uri || data.qr_url,
        email: data.email || '',
      };
    } catch (err) {
      console.error('[TwoFactorRepository] Excepción generando secreto 2FA:', err);
      return null;
    }
  }

  /**
   * Verifica el código de 6 dígitos para activar la autenticación 2FA.
   * Retorna el arreglo de códigos de recuperación generados.
   */
  public static async enable2FA(code: string): Promise<{ success: boolean; recoveryCodes?: string[]; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Servicio no disponible' };
    }

    try {
      const cleanCode = code.trim();
      const { data: userData } = await supabase.auth.getUser();

      // 1. Intentar verificación con verify_2fa_code
      if (userData?.user?.id) {
        const { data: verifyData, error: verifyError } = await supabase.rpc('verify_2fa_code', {
          user_id: userData.user.id,
          code: cleanCode,
        });

        if (!verifyError && verifyData && verifyData.success) {
          if (verifyData.verified) {
            return {
              success: true,
              recoveryCodes: [],
            };
          } else {
            return {
              success: false,
              error: 'Código de 6 dígitos inválido o expirado.',
            };
          }
        }
      }

      // 2. Fallback a enable_2fa
      const { data, error } = await supabase.rpc('enable_2fa', { p_code: cleanCode });
      if (error) {
        return { success: false, error: sanitizeUserErrorMessage(error, 'No se pudo activar el 2FA.') };
      }

      return {
        success: true,
        recoveryCodes: data?.recovery_codes ? (data.recovery_codes as string[]) : [],
      };
    } catch (err: any) {
      return { success: false, error: sanitizeUserErrorMessage(err, 'Error al procesar la activación 2FA.') };
    }
  }

  /**
   * Desactiva el 2FA verificando el código TOTP actual o un código de recuperación.
   */
  public static async disable2FA(code: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Servicio no disponible' };
    }

    try {
      const { error } = await supabase.rpc('disable_2fa', { p_code: code.trim() });
      if (error) {
        return { success: false, error: sanitizeUserErrorMessage(error, 'No se pudo desactivar el 2FA.') };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: sanitizeUserErrorMessage(err, 'Error al desactivar 2FA.') };
    }
  }

  /**
   * Regenera un nuevo conjunto de 8 códigos de recuperación de emergencia.
   */
  public static async regenerateRecoveryCodes(code: string): Promise<{ success: boolean; recoveryCodes?: string[]; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Servicio no disponible' };
    }

    try {
      const { data, error } = await supabase.rpc('regenerate_recovery_codes', { p_code: code.trim() });
      if (error) {
        return { success: false, error: sanitizeUserErrorMessage(error, 'No se pudieron regenerar los códigos de recuperación.') };
      }

      return {
        success: true,
        recoveryCodes: data?.recovery_codes ? (data.recovery_codes as string[]) : [],
      };
    } catch (err: any) {
      return { success: false, error: sanitizeUserErrorMessage(err, 'Error al regenerar códigos de recuperación.') };
    }
  }
}
