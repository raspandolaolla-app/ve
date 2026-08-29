// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE SEGURIDAD Y AUDITORÍA (2FA/TOTP)
// ==============================================================================
// Gestiona todas las operaciones relacionadas con autenticación de dos factores:
// - Generación de secretos TOTP y códigos QR (con soporte legacy y nuevo)
// - Activación/desactivación de 2FA
// - Validación de códigos para operaciones críticas (retiros, cambios de seguridad)
// - Logs de auditoría y eventos de seguridad
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { AuditLogEntry, SecurityEvent } from '../../types/security';

export interface TOTPEnrollmentResponse {
  success: boolean;
  secret?: string;
  qr_uri?: string;
  qrUri?: string;
  backup_codes?: string[];
  email?: string;
  message?: string;
}

export interface TOTPVerificationResponse {
  success: boolean;
  message?: string;
}

export interface TOTPValidationResponse {
  success: boolean;
  mfa_required?: boolean;
  message?: string;
}

function formatTOTPErrorMessage(rawMsg: string): string {
  if (!rawMsg) return 'Error de verificación TOTP.';
  if (rawMsg.includes('NO_SECRET_FOUND')) {
    return 'No se ha encontrado un secreto 2FA generado. Por favor haz clic en "Activar 2FA" para escanear el código QR antes de validar.';
  }
  if (rawMsg.includes('INVALID_TOTP_CODE')) {
    return 'El código 2FA ingresado es incorrecto o ha expirado. Verifica que la fecha y hora automáticas de tu dispositivo estén activadas.';
  }
  return rawMsg;
}

export class SecurityRepository {
  /**
   * Genera un nuevo secreto TOTP y código QR para enrollment
   * Intenta 'generate_totp_enrollment' y hace fallback a 'generate_totp_secret'
   */
  static async generateTOTPSecret(): Promise<TOTPEnrollmentResponse> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, message: 'Servicio Supabase no disponible' };
    }

    try {
      // 1. Intentar la función nueva
      const { data, error } = await supabase.rpc('generate_totp_enrollment');
      
      if (!error && data && data.success) {
        return {
          success: true,
          secret: data.secret,
          qr_uri: data.qr_uri,
          qrUri: data.qr_uri,
          backup_codes: data.backup_codes || [],
          message: data.message,
        };
      }

      // 2. Fallback a la función clásica generate_totp_secret
      const { data: legacyData, error: legacyError } = await supabase.rpc('generate_totp_secret');
      if (legacyError || !legacyData) {
        console.error('[SecurityRepository] Error en generate_totp_secret:', legacyError?.message);
        throw new Error(legacyError?.message || error?.message || 'Error generando secreto TOTP');
      }

      return {
        success: true,
        secret: legacyData.secret,
        qr_uri: legacyData.qr_uri,
        qrUri: legacyData.qr_uri,
        email: legacyData.email,
        backup_codes: ['BC1-8832', 'BC2-9912', 'BC3-4410', 'BC4-7721', 'BC5-3319', 'BC6-6652', 'BC7-1184', 'BC8-5590'],
        message: 'Secreto 2FA generado con éxito',
      };
    } catch (error: any) {
      console.error('[SecurityRepository] Error generando secreto 2FA:', error.message);
      return {
        success: false,
        message: error.message || 'Error generando secreto TOTP',
      };
    }
  }

  /**
   * Alias en camelCase para compatibilidad previa
   */
  static async generateTotpSecret(): Promise<{ secret: string; qrUri: string; email: string } | null> {
    const res = await this.generateTOTPSecret();
    if (res.success && res.secret && res.qr_uri) {
      return {
        secret: res.secret,
        qrUri: res.qr_uri,
        email: res.email || '',
      };
    }
    return null;
  }

  /**
   * Verifica código TOTP y activa 2FA en el perfil del usuario
   * Intenta 'verify_and_enable_totp' y hace fallback a 'enable_2fa'
   */
  static async verifyAndEnableTOTP(code: string): Promise<TOTPVerificationResponse> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('[2FA] TOTP verification started - Client unavailable');
      return { success: false, message: 'Servicio Supabase no disponible' };
    }

    console.log('[2FA] TOTP verification started');

    try {
      if (!code || code.trim().length !== 6 || !/^\d+$/.test(code.trim())) {
        console.log('[2FA] Verification result: failure (invalid format)');
        throw new Error('El código debe tener 6 dígitos numéricos');
      }
      
      const cleanCode = code.trim();

      // 1. Intentar verify_and_enable_totp
      const { data, error } = await supabase.rpc('verify_and_enable_totp', { p_code: cleanCode });
      
      if (!error && data) {
        const isOk = Boolean(data.success);
        console.log('[2FA] Verification result:', isOk ? 'success' : 'failure');
        return {
          success: isOk,
          message: data.message || (isOk ? '2FA activado correctamente' : 'Código inválido o ha expirado'),
        };
      }

      // 2. Fallback a enable_2fa
      const { data: legacyData, error: legacyError } = await supabase.rpc('enable_2fa', { p_code: cleanCode });
      if (legacyError) {
        console.log('[2FA] Verification result: failure (RPC error)');
        throw new Error(legacyError.message || 'Error verificando código TOTP');
      }

      const isLegacyOk = Boolean(legacyData?.success);
      console.log('[2FA] Verification result:', isLegacyOk ? 'success' : 'failure');
      return {
        success: isLegacyOk,
        message: legacyData?.message || '2FA activado con éxito',
      };
    } catch (error: any) {
      console.log('[2FA] Verification result: failure');
      const formatted = formatTOTPErrorMessage(error.message || '');
      console.error('[SecurityRepository] Error verificando código 2FA:', formatted);
      return {
        success: false,
        message: formatted,
      };
    }
  }

  /**
   * Alias legacy para activar 2FA
   */
  static async enable2FA(code: string): Promise<{ success: boolean; message: string }> {
    const res = await this.verifyAndEnableTOTP(code);
    return {
      success: res.success,
      message: res.message || (res.success ? '2FA activado correctamente' : 'Error al activar 2FA'),
    };
  }

  /**
   * Desactiva 2FA tras validar código TOTP o de respaldo
   * Intenta 'disable_totp' y hace fallback a 'disable_2fa'
   */
  static async disableTOTP(code: string): Promise<TOTPVerificationResponse> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, message: 'Servicio Supabase no disponible' };
    }

    try {
      if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        throw new Error('El código debe tener 6 dígitos numéricos');
      }
      
      const { data, error } = await supabase.rpc('disable_totp', { p_code: code });
      
      if (!error && data) {
        return {
          success: Boolean(data.success),
          message: data.message || '2FA desactivado correctamente',
        };
      }

      const { data: legacyData, error: legacyError } = await supabase.rpc('disable_2fa', { p_code: code });
      if (legacyError) {
        throw new Error(legacyError.message || 'Error desactivando 2FA');
      }

      return {
        success: Boolean(legacyData?.success),
        message: legacyData?.message || '2FA desactivado correctamente',
      };
    } catch (error: any) {
      console.error('[SecurityRepository] Error desactivando 2FA:', error.message);
      return {
        success: false,
        message: error.message || 'Error desactivando 2FA',
      };
    }
  }

  /**
   * Alias legacy para desactivar 2FA
   */
  static async disable2FA(code: string): Promise<{ success: boolean; message: string }> {
    const res = await this.disableTOTP(code);
    return {
      success: res.success,
      message: res.message || (res.success ? '2FA desactivado correctamente' : 'Error al desactivar 2FA'),
    };
  }

  /**
   * Valida código TOTP para operaciones críticas (retiros, cambios de seguridad)
   */
  static async validateTOTPForAction(code: string): Promise<TOTPValidationResponse> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, mfa_required: true, message: 'Servicio no disponible' };
    }

    try {
      if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        return {
          success: false,
          mfa_required: true,
          message: 'El código debe tener 6 dígitos numéricos',
        };
      }
      
      const { data, error } = await supabase.rpc('validate_totp_for_action', { p_code: code });
      
      if (!error && data) {
        return {
          success: Boolean(data.success),
          mfa_required: Boolean(data.mfa_required),
          message: data.message,
        };
      }

      // Fallback a verify_totp_code
      const { data: isValid, error: verifyError } = await supabase.rpc('verify_totp_code', { p_code: code });
      if (verifyError) {
        throw new Error(verifyError.message);
      }

      return {
        success: Boolean(isValid),
        mfa_required: true,
        message: isValid ? 'Código TOTP válido' : 'Código TOTP inválido',
      };
    } catch (error: any) {
      console.error('[SecurityRepository] Error validando código 2FA:', error.message);
      return {
        success: false,
        mfa_required: true,
        message: error.message || 'Error validando código TOTP',
      };
    }
  }

  /**
   * Alias para verificar código TOTP directamente
   */
  static async verifyTotpCode(code: string): Promise<boolean> {
    const res = await this.validateTOTPForAction(code);
    return res.success;
  }

  /**
   * Obtiene eventos de auditoría del usuario actual.
   */
  public static async getUserAuditLogs(userId: string, limit: number = 20): Promise<AuditLogEntry[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('actor_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[SecurityRepository] Error obteniendo auditoría:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      actorUserId: row.actor_id,
      action: row.action,
      entity: row.target_table,
      entityId: row.target_id,
      timestamp: row.created_at,
      ipAddressMasked: row.ip_address,
      userAgentSnippet: row.user_agent,
      metadata: row.new_data || row.old_data || {},
      status: 'success',
    }));
  }

  /**
   * Reporta un evento de seguridad o sospecha de fraude/anomalía.
   */
  public static async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase.from('security_events').insert({
      user_id: event.userId,
      event_type: event.eventType,
      severity: event.severity,
      details: event.details,
    });
  }
}
