// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE PERFILES
// ==============================================================================
// Capa de abstracción de datos para perfiles de usuario.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { UserProfile, ProfileSetupPayload } from '../../types/profile';

export class ProfileRepository {
  /**
   * Asegura y sincroniza atómicamente el perfil, la billetera y el rol del usuario actual
   * mediante la función RPC segura `ensure_current_user_profile`.
   */
  public static async ensureCurrentUserProfile(): Promise<UserProfile | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase.rpc('ensure_current_user_profile');
      if (error) {
        console.warn('[ProfileRepository] RPC ensure_current_user_profile no disponible o fallo:', error.message);
        return null;
      }

      if (data?.profile) {
        const p = data.profile;
        const mappedAccountStatus = (p.account_status?.toLowerCase() === 'active' ? 'active' : 'pending_verification') as any;
        const mappedKycStatus = (p.kyc_status?.toLowerCase() === 'verified' || p.kyc_status?.toLowerCase() === 'approved' ? 'approved' : 'pending') as any;

        return {
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          email: p.email || '',
          phoneMasked: p.phone_number ? `${p.phone_number.substring(0, 4)}***${p.phone_number.slice(-3)}` : '',
          cedulaMasked: p.cedula_last4 ? `V-***${p.cedula_last4}` : '',
          state: (p.state_venezuela || 'Distrito Capital') as any,
          birthDate: p.birth_date,
          isAdult: true,
          avatarUrl: p.avatar_url,
          accountStatus: mappedAccountStatus,
          identityVerificationStatus: mappedKycStatus,
          humanVerificationStatus: 'approved',
          twoFactorEnabled: Boolean(p.is_mfa_enabled),
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        };
      }
    } catch (err) {
      console.warn('[ProfileRepository] Error en ensureCurrentUserProfile:', err);
    }
    return null;
  }

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
    }

    if (!data) {
      // Intentar auto-sincronizar y generar el perfil server-side de forma garantizada
      const ensured = await this.ensureCurrentUserProfile();
      if (ensured) return ensured;
      return null;
    }

    const mappedAccountStatus = (data.account_status?.toLowerCase() === 'active' ? 'active' : 'pending_verification') as any;
    const mappedKycStatus = (data.kyc_status?.toLowerCase() === 'verified' || data.kyc_status?.toLowerCase() === 'approved' ? 'approved' : 'pending') as any;

    return {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email || '',
      phoneMasked: data.phone_number ? `${data.phone_number.substring(0, 4)}***${data.phone_number.slice(-3)}` : (data.phone_masked || ''),
      cedulaMasked: data.cedula_last4 ? `V-***${data.cedula_last4}` : (data.cedula_masked || ''),
      state: (data.state_venezuela || data.state || 'Distrito Capital') as any,
      birthDate: data.birth_date,
      isAdult: true,
      avatarUrl: data.avatar_url,
      accountStatus: mappedAccountStatus,
      identityVerificationStatus: mappedKycStatus,
      humanVerificationStatus: 'approved',
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
