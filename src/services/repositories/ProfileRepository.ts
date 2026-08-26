// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE PERFILES
// ==============================================================================
// Capa de abstracción de datos para perfiles de usuario.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { UserProfile, ProfileSetupPayload } from '../../types/profile';

export class ProfileRepository {
  /**
   * Obtiene el perfil del usuario autenticado actual desde Supabase.
   */
  public static async getCurrentProfile(userId: string): Promise<UserProfile | null> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[ProfileRepository] Error al obtener perfil:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email || '',
      phoneMasked: data.phone_number ? `${data.phone_number.substring(0, 4)}***${data.phone_number.slice(-3)}` : (data.phone_masked || ''),
      cedulaMasked: data.cedula_last4 ? `V-***${data.cedula_last4}` : (data.cedula_masked || ''),
      state: data.state_venezuela || data.state || '',
      birthDate: data.birth_date,
      isAdult: true,
      avatarUrl: data.avatar_url,
      accountStatus: data.account_status,
      identityVerificationStatus: data.kyc_status || data.identity_verification_status,
      humanVerificationStatus: data.human_verification_status || 'VERIFIED',
      twoFactorEnabled: Boolean(data.is_mfa_enabled ?? data.two_factor_enabled),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Guarda o actualiza los datos iniciales de perfil.
   */
  public static async createProfile(userId: string, email: string, payload: ProfileSetupPayload): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return false;
    }

    const { error } = await supabase.from('profiles').insert({
      id: userId,
      email,
      first_name: payload.firstName,
      last_name: payload.lastName,
      state: payload.state,
      birth_date: payload.birthDate,
      avatar_url: payload.avatarUrl || null,
      account_status: 'pending_verification',
    });

    if (error) {
      console.error('[ProfileRepository] Error al crear perfil:', error.message);
      return false;
    }

    return true;
  }

  /**
   * Actualiza los datos del perfil del usuario.
   */
  public static async updateProfile(
    userId: string,
    updates: Partial<{
      firstName: string;
      lastName: string;
      state: string;
      avatarUrl: string;
      birthDate: string;
    }>
  ): Promise<boolean> {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const dataToUpdate: Record<string, any> = {};
    if (updates.firstName !== undefined) dataToUpdate.first_name = updates.firstName;
    if (updates.lastName !== undefined) dataToUpdate.last_name = updates.lastName;
    if (updates.state !== undefined) dataToUpdate.state_venezuela = updates.state;
    if (updates.avatarUrl !== undefined) dataToUpdate.avatar_url = updates.avatarUrl;
    if (updates.birthDate !== undefined) dataToUpdate.birth_date = updates.birthDate;

    const { error } = await supabase
      .from('profiles')
      .update(dataToUpdate)
      .eq('user_id', userId);

    if (error) {
      console.error('[ProfileRepository] Error actualizando perfil:', error.message);
      return false;
    }

    return true;
  }
}
