// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE PERFILES
// ==============================================================================
// Capa de abstracción de datos para perfiles de usuario.
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import type { UserProfile, ProfileSetupPayload } from '../../types/profile';

export class ProfileRepository {
  /**
   * Garantiza la existencia y sincronización completa del perfil, billetera y rol en Supabase
   * para cualquier usuario recién registrado o autenticado.
   */
  public static async ensureProfileExists(
    userId: string,
    email: string,
    metadata?: { firstName?: string; lastName?: string; avatarUrl?: string }
  ): Promise<UserProfile | null> {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return null;

    try {
      // 1. Verificar si el perfil existe
      const { data: existing, error: selectErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const firstName = metadata?.firstName || 'Jugador';
      const lastName = metadata?.lastName || '';
      const avatarUrl = metadata?.avatarUrl || null;
      const displayName = `${firstName} ${lastName}`.trim() || 'Jugador';
      const now = new Date().toISOString();

      let profileData = existing;

      if (!existing || selectErr) {
        // Crear perfil nuevo en DB
        const { data: inserted, error: insertErr } = await supabase
          .from('profiles')
          .upsert(
            {
              user_id: userId,
              email: email,
              first_name: firstName,
              last_name: lastName,
              display_name: displayName,
              avatar_url: avatarUrl,
              state_venezuela: 'Distrito Capital',
              account_status: 'ACTIVE',
              kyc_status: 'UNSUBMITTED',
              is_online: true,
              last_seen_at: now,
              created_at: now,
              updated_at: now,
            },
            { onConflict: 'user_id' }
          )
          .select('*')
          .maybeSingle();

        if (!insertErr && inserted) {
          profileData = inserted;
        }
      } else {
        // Actualizar datos de presencia y metadatos de Google
        const updates: Record<string, any> = {
          is_online: true,
          last_seen_at: now,
          updated_at: now,
        };
        if (email && !existing.email) updates.email = email;
        if (firstName && firstName !== 'Jugador' && (!existing.first_name || existing.first_name === 'Jugador')) {
          updates.first_name = firstName;
        }
        if (lastName && !existing.last_name) updates.last_name = lastName;
        if (avatarUrl && !existing.avatar_url) updates.avatar_url = avatarUrl;

        await supabase.from('profiles').update(updates).eq('user_id', userId);
        profileData = { ...existing, ...updates };
      }

      // 2. Garantizar que tenga registro en `wallets`
      try {
        const { data: walletData } = await supabase
          .from('wallets')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!walletData) {
          await supabase.from('wallets').upsert(
            {
              user_id: userId,
              available_balance: 0,
              held_balance: 0,
              created_at: now,
              updated_at: now,
            },
            { onConflict: 'user_id' }
          );
        }
      } catch (wErr) {
        console.warn('[ProfileRepository] Error creando wallet inicial:', wErr);
      }

      // 3. Garantizar que tenga registro en `user_roles`
      try {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        if (!roleData) {
          await supabase.from('user_roles').upsert(
            {
              user_id: userId,
              role: 'PLAYER',
              created_at: now,
              updated_at: now,
            },
            { onConflict: 'user_id' }
          );
        }
      } catch (rErr) {
        console.warn('[ProfileRepository] Error creando rol inicial:', rErr);
      }

      if (profileData) {
        return {
          id: profileData.user_id || userId,
          firstName: profileData.first_name || firstName,
          lastName: profileData.last_name || lastName,
          email: profileData.email || email,
          phoneMasked: profileData.phone_number ? `04**-***${profileData.phone_number.slice(-4)}` : '',
          cedulaMasked: profileData.cedula_last4 ? `V-***${profileData.cedula_last4}` : '',
          state: (profileData.state_venezuela || 'Distrito Capital') as any,
          birthDate: profileData.birth_date,
          isAdult: true,
          avatarUrl: profileData.avatar_url || avatarUrl,
          accountStatus: (profileData.account_status?.toLowerCase() === 'active' ? 'active' : 'pending_verification') as any,
          identityVerificationStatus: (profileData.kyc_status?.toLowerCase() === 'verified' ? 'approved' : 'pending') as any,
          humanVerificationStatus: 'approved',
          hasClaimedTestBonus: Boolean(profileData.has_claimed_test_bonus),
          cedula: profileData.cedula,
          telefono: profileData.telefono || profileData.phone_number,
          nombreReal: profileData.nombre_real,
          fechaNacimiento: profileData.fecha_nacimiento || profileData.birth_date,
          estadoResidencia: profileData.estado_residencia || profileData.state_venezuela,
          isProfileLocked: Boolean(profileData.is_profile_locked),
          createdAt: profileData.created_at || now,
          updatedAt: profileData.updated_at || now,
        };
      }
    } catch (err) {
      console.error('[ProfileRepository] Error en ensureProfileExists:', err);
    }
    return null;
  }

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
      hasClaimedTestBonus: Boolean(data.has_claimed_test_bonus),
      cedula: data.cedula,
      telefono: data.telefono || data.phone_number,
      nombreReal: data.nombre_real,
      fechaNacimiento: data.fecha_nacimiento || data.birth_date,
      estadoResidencia: data.estado_residencia || data.state_venezuela,
      isProfileLocked: Boolean(data.is_profile_locked),
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

    // Asegurar que el perfil sea auto-sincronizado atómicamente si es posible
    const ensured = await this.ensureCurrentUserProfile();
    if (ensured) {
      if (payload.state || payload.birthDate) {
        await this.updateProfile(userId, {
          firstName: payload.firstName,
          lastName: payload.lastName,
          state: payload.state,
          birthDate: payload.birthDate,
          avatarUrl: payload.avatarUrl,
        });
      }
      return true;
    }

    const { error } = await supabase.from('profiles').insert({
      user_id: userId,
      first_name: payload.firstName,
      last_name: payload.lastName,
      display_name: `${payload.firstName} ${payload.lastName}`.trim().substring(0, 50),
      state_venezuela: payload.state || 'Distrito Capital',
      birth_date: payload.birthDate || '2000-01-01',
      cedula_hash: '0000000000000000000000000000000000000000000000000000000000000000',
      cedula_last4: '0000',
      phone_number: '04120000000',
      avatar_url: payload.avatarUrl || null,
      account_status: 'PENDING_VERIFICATION',
      kyc_status: 'UNSUBMITTED',
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
      cedula: string;
      telefono: string;
      nombreReal: string;
      fechaNacimiento: string;
      estadoResidencia: string;
      isProfileLocked: boolean;
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
    if (updates.cedula !== undefined) dataToUpdate.cedula = updates.cedula;
    if (updates.telefono !== undefined) {
      dataToUpdate.telefono = updates.telefono;
      dataToUpdate.phone_number = updates.telefono;
    }
    if (updates.nombreReal !== undefined) dataToUpdate.nombre_real = updates.nombreReal;
    if (updates.fechaNacimiento !== undefined) dataToUpdate.fecha_nacimiento = updates.fechaNacimiento;
    if (updates.estadoResidencia !== undefined) dataToUpdate.estado_residencia = updates.estadoResidencia;
    if (updates.isProfileLocked !== undefined) dataToUpdate.is_profile_locked = updates.isProfileLocked;

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
