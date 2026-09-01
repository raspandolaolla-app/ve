// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE KYC Y VERIFICACIÓN DE IDENTIDAD
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';

export interface UserKYCStatus {
  status: 'UNSUBMITTED' | 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_MORE_INFORMATION';
  idNumber?: string;
  fullLegalName?: string;
  documentStoragePath?: string;
  selfieStoragePath?: string;
  verificationMethod?: 'DOCUMENT_UPLOAD' | 'WHATSAPP';
  reviewerNotes?: string;
  submittedAt?: string;
  reviewedAt?: string;
}

export class KYCRepository {
  /**
   * Obtiene la solicitud de verificación KYC actual del usuario.
   */
  public static async getUserKYCStatus(userId: string): Promise<UserKYCStatus | null> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return null;

    try {
      const { data, error } = await supabase
        .from('kyc_verifications')
        .select('*')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return {
        status: data.status as any,
        idNumber: data.id_number,
        fullLegalName: data.full_legal_name,
        documentStoragePath: data.document_storage_path,
        selfieStoragePath: data.selfie_storage_path,
        verificationMethod: data.verification_method || 'DOCUMENT_UPLOAD',
        reviewerNotes: data.reviewer_notes,
        submittedAt: data.submitted_at,
        reviewedAt: data.reviewed_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Sube un archivo a Supabase Storage en el bucket especificado.
   */
  public static async uploadKYCFile(
    bucket: 'kyc-documents' | 'kyc-selfies',
    userId: string,
    file: File,
    prefix: string
  ): Promise<{ success: boolean; storagePath?: string; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const storagePath = `${userId}/${prefix}_${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
        upsert: true,
        contentType: file.type,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, storagePath };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error al subir documento' };
    }
  }

  /**
   * Envía la solicitud de verificación KYC mediante el RPC seguro `submit_kyc_verification`.
   */
  public static async submitKYC(params: {
    idNumber: string;
    fullLegalName: string;
    documentStoragePath?: string;
    selfieStoragePath?: string;
    verificationMethod?: 'DOCUMENT_UPLOAD' | 'WHATSAPP';
  }): Promise<{ success: boolean; message?: string; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data, error } = await supabase.rpc('submit_kyc_verification', {
        p_id_number: params.idNumber,
        p_full_legal_name: params.fullLegalName,
        p_document_storage_path: params.documentStoragePath || null,
        p_selfie_storage_path: params.selfieStoragePath || null,
        p_verification_method: params.verificationMethod || 'DOCUMENT_UPLOAD',
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: Boolean(data?.success),
        message: data?.message || 'Solicitud KYC enviada con éxito',
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error al procesar solicitud' };
    }
  }
}
