/**
 * ==============================================================================
 * RASPANDO LA OLLA — REPOSITORIO DE EXPEDIENTES KYC Y ALMACENAMIENTO SEGURO
 * ==============================================================================
 * Extraído de AdminRepository.ts para modularización de Fase 3.
 * Gestión de verificación KYC, revisión de documentos y generación de URLs firmadas.
 * ==============================================================================
 */

import { getSupabaseClient } from '../../../lib/supabase/client';
import { logger } from '../../../utils/logger';
import type { KYCVerificationItem } from '../../../types/admin';

export class AdminKYCRepository {
  /**
   * Obtiene la lista de expedientes de verificación KYC.
   */
  public static async getKYCVerificationsList(statusFilter?: string): Promise<KYCVerificationItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      let query = supabase
        .from('kyc_verifications')
        .select(`
          *,
          profiles:user_id(first_name, last_name)
        `)
        .order('submitted_at', { ascending: false });

      if (statusFilter && statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error || !data) return [];

      return data.map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Usuario';

        return {
          id: row.id,
          userId: row.user_id,
          userName: name,
          userEmail: `${name.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
          documentType: row.document_type || 'CEDULA_VENEZOLANA',
          idNumber: row.id_number,
          fullLegalName: row.full_legal_name,
          documentStoragePath: row.document_storage_path,
          documentBackStoragePath: row.document_back_storage_path,
          selfieStoragePath: row.selfie_storage_path,
          verificationMethod: (row.verification_method as any) || (row.document_storage_path === 'WHATSAPP_PENDING' ? 'WHATSAPP' : 'DOCUMENT_UPLOAD'),
          status: row.status,
          reviewerId: row.reviewer_id,
          reviewerNotes: row.reviewer_notes,
          submittedAt: row.submitted_at,
          reviewedAt: row.reviewed_at,
        };
      });
    } catch (err: unknown) {
      logger.error('[AdminKYCRepository] Error obteniendo expedientes KYC:', err);
      return [];
    }
  }

  /**
   * Procesa la revisión de un expediente KYC mediante la RPC segura admin_process_kyc_verification.
   */
  public static async processKYCVerification(
    verificationId: string,
    status: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW' | 'NEEDS_MORE_INFORMATION' | 'VERIFIED_WHATSAPP',
    notes: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data, error } = await supabase.rpc('admin_process_kyc_verification', {
        p_verification_id: verificationId,
        p_status: status,
        p_notes: notes,
      });

      if (error) return { success: false, error: error.message };
      return { success: Boolean(data?.success) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Genera una URL firmada de corta duración para visualizar archivos en buckets privados.
   */
  public static async getStorageSignedUrl(bucket: string, path: string, expiresInSeconds: number = 300): Promise<string | null> {
    const supabase = getSupabaseClient();
    if (!supabase || !path) return null;

    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
      if (error || !data) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }
}
