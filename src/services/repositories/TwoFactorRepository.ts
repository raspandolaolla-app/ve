// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE AUTENTICACIÓN 2FA (TOTP / RECOVERY CODES)
// ==============================================================================
// Arquitectura híbrida y blindada:
// - Generación de secretos y URI TOTP en frontend con 'otpauth' (RFC 6238 estándar)
// - Respaldo y persistencia segura en backend (Supabase RPCs con pgcrypto)
// - Sin silenciamiento de errores: trazabilidad completa en consola y retroalimentación limpia
// - Compatibilidad integral con setup_2fa_for_user, verify_2fa_code y get_2fa_status
// ==============================================================================

import * as OTPAuth from 'otpauth';
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
    if (!supabase) {
      console.warn('[TwoFactorRepository] Supabase client no disponible.');
      return { isEnabled: false, hasSecret: false, isLocked: false };
    }

    try {
      // 1. Intentar RPC get_2fa_status
      const { data, error } = await supabase.rpc('get_2fa_status');
      if (!error && data) {
        const isEnabled = Boolean(data?.is_enabled ?? data?.is_active);
        return {
          isEnabled,
          hasSecret: Boolean(data?.has_secret ?? isEnabled),
          isLocked: Boolean(data?.is_locked),
          lockedUntil: data?.locked_until || null,
        };
      }

      if (error) {
        console.warn('[TwoFactorRepository] RPC get_2fa_status error, ejecutando consulta directa:', error.message);
      }

      // 2. Fallback directo a las tablas user_2fa_secrets y profiles
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData?.user?.id) {
        return { isEnabled: false, hasSecret: false, isLocked: false };
      }

      const userId = userData.user.id;
      const [secretRes, profileRes] = await Promise.all([
        supabase
          .from('user_2fa_secrets')
          .select('is_active, secret, secret_encrypted, locked_until')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('is_mfa_enabled')
          .or(`id.eq.${userId},user_id.eq.${userId}`)
          .maybeSingle(),
      ]);

      const secretRow = secretRes.data;
      const profileRow = profileRes.data;

      const isEnabled = Boolean(secretRow?.is_active || profileRow?.is_mfa_enabled);
      const hasSecret = Boolean(secretRow?.secret || secretRow?.secret_encrypted || isEnabled);
      const isLocked = secretRow?.locked_until ? new Date(secretRow.locked_until) > new Date() : false;

      return {
        isEnabled,
        hasSecret,
        isLocked,
        lockedUntil: secretRow?.locked_until || null,
      };
    } catch (err) {
      console.error('[TwoFactorRepository] Excepción obteniendo estado 2FA:', err);
      return { isEnabled: false, hasSecret: false, isLocked: false };
    }
  }

  /**
   * Genera un nuevo secreto Base32 y URI de código QR compatible con Google Authenticator / Authy.
   */
  public static async generateTOTPSecret(): Promise<TwoFactorSecret | null> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.error('[TwoFactorRepository] Supabase client no inicializado.');
      return null;
    }

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.id) {
        console.error('[TwoFactorRepository] No se pudo obtener el usuario autenticado:', userError?.message);
        return null;
      }

      const user = userData.user;
      const userEmail = user.email || 'usuario@raspandolaolla.com';

      // 1. Llamar primero al RPC canónico del backend (Autoritativo para asegurar coincidencia exacta en calculate_totp)
      const { data: setupData, error: setupError } = await supabase.rpc('setup_2fa_for_user', {
        p_user_id: user.id,
      });

      if (!setupError && setupData && setupData.success) {
        const backendSecret = setupData.secret || setupData.secret_base32;
        const qrUri = setupData.qr_url || `otpauth://totp/RaspandoLaOlla:${encodeURIComponent(userEmail)}?secret=${backendSecret}&issuer=RaspandoLaOlla&algorithm=SHA1&digits=6&period=30`;
        return {
          secret: backendSecret,
          qrUri,
          email: userEmail,
        };
      }

      if (setupError) {
        console.warn('[TwoFactorRepository] setup_2fa_for_user no disponible o falló:', setupError.message);
      }

      // 2. Fallback: Generar secreto con OTPAuth en cliente
      const totp = new OTPAuth.TOTP({
        issuer: 'RaspandoLaOlla',
        label: userEmail,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: new OTPAuth.Secret({ size: 20 }),
      });

      const clientSecret = totp.secret.base32;
      const clientQrUri = totp.toString();

      return {
        secret: clientSecret,
        qrUri: clientQrUri,
        email: userEmail,
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
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.id) {
        return { success: false, error: 'Usuario no autenticado' };
      }

      const userId = userData.user.id;

      // 1. Intentar verificación canónica con verify_2fa_code (pasando p_user_id y p_code)
      const { data: verifyData, error: verifyError } = await supabase.rpc('verify_2fa_code', {
        p_user_id: userId,
        p_code: cleanCode,
      });

      if (!verifyError && verifyData) {
        if (verifyData.success && (verifyData.verified || verifyData.is_active)) {
          const recoveryCodes: string[] = Array.isArray(verifyData.recovery_codes)
            ? verifyData.recovery_codes
            : [];
          return {
            success: true,
            recoveryCodes,
          };
        } else {
          return {
            success: false,
            error: verifyData.message || 'Código de 6 dígitos inválido o expirado.',
          };
        }
      }

      if (verifyError) {
        console.warn('[TwoFactorRepository] verify_2fa_code falló, intentando enable_2fa:', verifyError.message);
      }

      // 2. Fallback a enable_2fa
      const { data: enableData, error: enableError } = await supabase.rpc('enable_2fa', { p_code: cleanCode });
      if (!enableError && enableData) {
        return {
          success: true,
          recoveryCodes: enableData.recovery_codes ? (enableData.recovery_codes as string[]) : [],
        };
      }

      const finalErrorMsg = verifyError?.message || enableError?.message || 'Código de 6 dígitos incorrecto.';
      console.error('[TwoFactorRepository] Fallo final activando 2FA:', finalErrorMsg);
      return {
        success: false,
        error: sanitizeUserErrorMessage(finalErrorMsg, 'Código incorrecto. Verifica la hora de tu dispositivo e intenta de nuevo.'),
      };
    } catch (err: any) {
      console.error('[TwoFactorRepository] Excepción al activar 2FA:', err);
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
      const cleanCode = code.trim();
      const { data, error } = await supabase.rpc('disable_2fa', { p_code: cleanCode });
      if (error) {
        console.error('[TwoFactorRepository] Error desactivando 2FA:', error.message);
        return { success: false, error: sanitizeUserErrorMessage(error, 'No se pudo desactivar el 2FA.') };
      }

      if (data && data.success === false) {
        return { success: false, error: data.message || 'Código incorrecto.' };
      }

      return { success: true };
    } catch (err: any) {
      console.error('[TwoFactorRepository] Excepción al desactivar 2FA:', err);
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
      const cleanCode = code.trim();
      const { data, error } = await supabase.rpc('regenerate_recovery_codes', { p_code: cleanCode });
      if (error) {
        console.error('[TwoFactorRepository] Error regenerando códigos:', error.message);
        return { success: false, error: sanitizeUserErrorMessage(error, 'No se pudieron regenerar los códigos de recuperación.') };
      }

      if (data && data.success === false) {
        return { success: false, error: data.message || 'Código 2FA incorrecto.' };
      }

      return {
        success: true,
        recoveryCodes: data?.recovery_codes ? (data.recovery_codes as string[]) : [],
      };
    } catch (err: any) {
      console.error('[TwoFactorRepository] Excepción al regenerar códigos:', err);
      return { success: false, error: sanitizeUserErrorMessage(err, 'Error al regenerar códigos de recuperación.') };
    }
  }
}
