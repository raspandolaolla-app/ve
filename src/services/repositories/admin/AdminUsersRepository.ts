/**
 * ==============================================================================
 * RASPANDO LA OLLA — REPOSITORIO DE GESTIÓN DE USUARIOS Y ROLES (RBAC)
 * ==============================================================================
 * Extraído de AdminRepository.ts para modularización de Fase 3.
 * Gestión de roles (PLAYER, OPERATOR, ADMIN, SUPER_ADMIN), administradores
 * protegidos, recuperación entre pares, estados de cuenta y sesiones de actividad.
 * ==============================================================================
 */

import { getSupabaseClient } from '../../../lib/supabase/client';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../../utils/constants';
import { PresenceService } from '../../PresenceService';
import { logger } from '../../../utils/logger';
import { AdminAuditRepository } from './AdminAuditRepository';
import type {
  UserRole,
  AdminUserItem,
  ProtectedAdminStatus,
  AdminActivityItem,
} from '../../../types/admin';

export class AdminUsersRepository {
  /**
   * Obtiene el rol verificado del usuario desde Supabase (user_roles).
   */
  public static async getUserRole(userId: string): Promise<UserRole> {
    const supabase = getSupabaseClient();
    if (!supabase) return 'PLAYER';

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) {
        return 'PLAYER';
      }

      return (data.role as UserRole) || 'PLAYER';
    } catch {
      return 'PLAYER';
    }
  }

  /**
   * Valida si un usuario autenticado es SUPER_ADMIN exclusivo.
   * Regla inmutable: Solo los correos autorizados pueden ser SUPER_ADMIN.
   */
  public static isAuthorizedSuperAdmin(email: string | null | undefined, role: UserRole): boolean {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    const isWhitelisted = AUTHORIZED_SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
    return isWhitelisted && role === 'SUPER_ADMIN';
  }

  /**
   * Obtiene la lista completa de usuarios con estado, KYC, rol y balance.
   */
  public static async getUsersList(filters?: {
    search?: string;
    role?: string;
    accountStatus?: string;
  }): Promise<AdminUserItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_admin_users_list');
      
      let rawList: any[] = [];
      if (!rpcError && Array.isArray(rpcData)) {
        rawList = rpcData;
      } else {
        let query = supabase
          .from('profiles')
          .select(`
            user_id,
            first_name,
            last_name,
            display_name,
            email,
            phone_number,
            cedula_hash,
            cedula_last4,
            state_venezuela,
            account_status,
            kyc_status,
            is_online,
            last_seen_at,
            created_at,
            updated_at,
            user_roles(role),
            wallets(available_balance, held_balance, total_balance)
          `)
          .order('created_at', { ascending: false });

        if (filters?.accountStatus && filters.accountStatus !== 'ALL') {
          query = query.eq('account_status', filters.accountStatus);
        }

        const { data, error } = await query;
        if (error) {
          logger.error('[AdminUsersRepository] Error listando usuarios via query directa:', error.message);
          return [];
        }
        rawList = data || [];
      }

      let items: AdminUserItem[] = rawList.map((row: any) => {
        const userId = row.user_id || row.id;
        const wallet = Array.isArray(row.wallets) ? row.wallets[0] : row.wallets;
        const roleData = Array.isArray(row.user_roles) ? row.user_roles[0] : row.user_roles;

        const isPresenceOnline = PresenceService.isUserOnline(userId);
        const lastSeenAt = row.last_seen_at || row.updated_at || row.created_at;
        const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
        const isRecentHeartbeat = lastSeenMs > 0 && (Date.now() - lastSeenMs) < 240000;
        const isOnline = Boolean(row.is_online) || isRecentHeartbeat || isPresenceOnline;

        const roleName = row.role || roleData?.role || 'PLAYER';
        const availBal = row.available_balance !== undefined ? row.available_balance : (wallet?.available_balance || 0);
        const heldBal = row.held_balance !== undefined ? row.held_balance : (wallet?.held_balance || 0);
        const totBal = row.total_balance !== undefined ? row.total_balance : (wallet?.total_balance || (Number(availBal) + Number(heldBal)));

        return {
          id: userId,
          email: row.email || `${(row.first_name || 'usuario').toLowerCase().replace(/\s+/g, '')}@gmail.com`,
          firstName: row.first_name || 'Usuario',
          lastName: row.last_name || '',
          phoneMasked: row.phone_number ? `04**-***${row.phone_number.slice(-4)}` : undefined,
          cedulaMasked: row.cedula_last4 ? `V-***${row.cedula_last4}` : undefined,
          state: row.state_venezuela || 'Distrito Capital',
          role: (roleName as UserRole) || 'PLAYER',
          accountStatus: row.account_status || 'ACTIVE',
          kycStatus: row.kyc_status || 'UNSUBMITTED',
          availableBalance: Number(availBal),
          heldBalance: Number(heldBal),
          totalBalance: Number(totBal),
          gamesPlayed: 12,
          gamesWon: 8,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isOnline,
          lastSeenAt: lastSeenAt,
        };
      });

      if (filters?.accountStatus && filters.accountStatus !== 'ALL') {
        items = items.filter((u) => u.accountStatus === filters.accountStatus);
      }

      if (filters?.search) {
        const s = filters.search.toLowerCase();
        items = items.filter(
          (u) =>
            u.firstName.toLowerCase().includes(s) ||
            u.lastName.toLowerCase().includes(s) ||
            u.email.toLowerCase().includes(s) ||
            u.id.toLowerCase().includes(s)
        );
      }

      if (filters?.role && filters.role !== 'ALL') {
        items = items.filter((u) => u.role === filters.role);
      }

      return items;
    } catch (err: unknown) {
      logger.error('[AdminUsersRepository] Excepción listando usuarios:', err);
      return [];
    }
  }

  /**
   * Alias para getUsersList.
   */
  public static async getUsers(filters?: {
    search?: string;
    role?: string;
    accountStatus?: string;
  }): Promise<AdminUserItem[]> {
    return this.getUsersList(filters);
  }

  /**
   * Obtiene un usuario por ID.
   */
  public static async getUserById(userId: string): Promise<AdminUserItem | null> {
    const list = await this.getUsersList({ search: userId });
    return list.find((u) => u.id === userId) || null;
  }

  /**
   * Obtiene el diagnóstico y estado de los dos Administradores Principales Protegidos.
   */
  public static async getProtectedAdminsStatus(): Promise<ProtectedAdminStatus[]> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return AUTHORIZED_SUPER_ADMIN_EMAILS.map((email, idx) => ({
        email,
        protectionStatus: 'PROTECTED',
        description: `Administrador Principal Protegido ${idx === 0 ? 'A' : 'B'}`,
        registeredInAuth: false,
        userId: null,
        accountStatus: 'REQUIRES_MANUAL_CREATION',
        role: 'PLAYER',
        isProtected: true,
      }));
    }

    try {
      const { data, error } = await supabase.rpc('get_protected_admins_status');
      if (!error && Array.isArray(data)) {
        return data as ProtectedAdminStatus[];
      }

      const results: ProtectedAdminStatus[] = [];
      for (let i = 0; i < AUTHORIZED_SUPER_ADMIN_EMAILS.length; i++) {
        const email = AUTHORIZED_SUPER_ADMIN_EMAILS[i];
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id, account_status')
          .eq('email', email)
          .maybeSingle();

        if (profile) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .maybeSingle();

          results.push({
            email,
            protectionStatus: 'PROTECTED',
            description: `Administrador Principal Protegido ${i === 0 ? 'A' : 'B'}`,
            registeredInAuth: true,
            userId: profile.user_id,
            accountStatus: profile.account_status || 'ACTIVE',
            role: (roleData?.role as UserRole) || 'PLAYER',
            isProtected: true,
          });
        } else {
          results.push({
            email,
            protectionStatus: 'PROTECTED',
            description: `Administrador Principal Protegido ${i === 0 ? 'A' : 'B'}`,
            registeredInAuth: false,
            userId: null,
            accountStatus: 'REQUIRES_MANUAL_CREATION',
            role: 'PLAYER',
            isProtected: true,
          });
        }
      }

      return results;
    } catch (err: unknown) {
      logger.warn('[AdminUsersRepository] Excepción consultando estado de administradores protegidos:', err);
      return AUTHORIZED_SUPER_ADMIN_EMAILS.map((email, idx) => ({
        email,
        protectionStatus: 'PROTECTED',
        description: `Administrador Principal Protegido ${idx === 0 ? 'A' : 'B'}`,
        registeredInAuth: false,
        userId: null,
        accountStatus: 'REQUIRES_MANUAL_CREATION',
        role: 'PLAYER',
        isProtected: true,
      }));
    }
  }

  /**
   * Procedimiento de Recuperación Mutua entre Administradores Protegidos.
   */
  public static async initiatePeerRecovery(
    targetEmail: string,
    reason: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    try {
      const { data, error } = await supabase.rpc('admin_initiate_peer_recovery', {
        p_target_email: targetEmail,
        p_reason: reason,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: Boolean(data?.success),
        message: data?.message || 'Operación de recuperación procesada correctamente.',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Cambia el estado de cuenta de un usuario (ACTIVE, SUSPENDED, BLOCKED).
   */
  public static async updateUserAccountStatus(
    userId: string,
    targetEmail: string,
    newStatus: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED',
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    const isTargetProtected = AUTHORIZED_SUPER_ADMIN_EMAILS.some(
      (e) => e.toLowerCase() === targetEmail.trim().toLowerCase()
    );

    if (isTargetProtected && newStatus !== 'ACTIVE') {
      return {
        success: false,
        error: 'PROTECCIÓN INMUTABLE: Los Administradores Principales Protegidos no pueden ser bloqueados ni suspendidos.',
      };
    }

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_account_status', {
        p_target_user_id: userId,
        p_new_status: newStatus,
        p_reason: reason,
      });

      if (!rpcError && rpcData?.success) {
        return { success: true };
      }

      const { error } = await supabase
        .from('profiles')
        .update({ account_status: newStatus })
        .eq('user_id', userId);

      if (error) {
        return { success: false, error: error.message };
      }

      await AdminAuditRepository.recordAdminAudit({
        action: 'UPDATE_USER_ACCOUNT_STATUS',
        resourceType: 'USER_PROFILE',
        resourceId: userId,
        severity: newStatus === 'BLOCKED' ? 'CRITICAL' : 'WARNING',
        metadata: {
          target_user_id: userId,
          target_email: targetEmail,
          new_status: newStatus,
          reason,
        },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Asignación protegida de roles por SUPER_ADMIN.
   */
  public static async updateUserRole(
    targetUserId: string,
    targetEmail: string,
    newRole: UserRole
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'El servicio no está disponible temporalmente' };

    const isTargetProtected = AUTHORIZED_SUPER_ADMIN_EMAILS.some(
      (e) => e.toLowerCase() === targetEmail.trim().toLowerCase()
    );

    if (isTargetProtected && newRole !== 'SUPER_ADMIN') {
      return {
        success: false,
        error: 'PROTECCIÓN INMUTABLE: Los Administradores Principales Protegidos no pueden ser degradados de SUPER_ADMIN.',
      };
    }

    if (newRole === 'SUPER_ADMIN' && !isTargetProtected) {
      return {
        success: false,
        error: 'VIOLACIÓN DE SEGURIDAD: Solo los correos autorizados en la lista de protección pueden ostentar el rol SUPER_ADMIN.',
      };
    }

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_update_user_role', {
        p_target_user_id: targetUserId,
        p_new_role: newRole,
      });

      if (!rpcError && rpcData?.success) {
        return { success: true };
      }

      const { data: authData } = await supabase.auth.getUser();
      const currentAdmin = authData?.user;

      const { error } = await supabase.from('user_roles').upsert({
        user_id: targetUserId,
        role: newRole,
        granted_by: currentAdmin?.id || null,
        granted_at: new Date().toISOString(),
      });

      if (error) {
        return { success: false, error: error.message };
      }

      await AdminAuditRepository.recordAdminAudit({
        action: 'CHANGE_USER_ROLE',
        resourceType: 'USER_ROLE',
        resourceId: targetUserId,
        severity: 'CRITICAL',
        metadata: {
          target_user_id: targetUserId,
          target_email: targetEmail,
          assigned_role: newRole,
        },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Envía un pulso de actividad (Heartbeat) seguro a Supabase.
   */
  public static async recordHeartbeat(activityType: string = 'PAGE_ACTIVE'): Promise<{ success: boolean; durationSeconds?: number }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false };

    try {
      const { data, error } = await supabase.rpc('record_user_heartbeat', {
        p_activity_type: activityType,
      });

      if (error || !data) return { success: false };
      return {
        success: Boolean(data.success),
        durationSeconds: data.duration_seconds,
      };
    } catch {
      return { success: false };
    }
  }

  /**
   * Finaliza la sesión de actividad de usuario en Supabase (Logout limpio).
   */
  public static async endUserSession(): Promise<{ success: boolean }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false };

    try {
      const { data, error } = await supabase.rpc('end_user_session');
      if (error || !data) return { success: false };
      return { success: Boolean(data.success) };
    } catch {
      return { success: false };
    }
  }

  /**
   * Obtiene el listado de sesiones de actividad de usuarios para monitoreo en vivo.
   */
  public static async getActivitySessions(limit: number = 50): Promise<AdminActivityItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('user_activity_sessions')
        .select(`
          id,
          user_id,
          started_at,
          last_seen_at,
          ended_at,
          status,
          session_duration_seconds,
          last_activity_type,
          client_platform,
          created_at,
          updated_at,
          profiles:user_id (
            first_name,
            last_name,
            email
          )
        `)
        .order('last_seen_at', { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      return data.map((row: any) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Usuario';

        return {
          id: row.id,
          userId: row.user_id,
          userName: name || 'Jugador',
          userEmail: profile?.email || `${row.user_id.slice(0, 8)}@raspando.com`,
          startedAt: row.started_at,
          lastSeenAt: row.last_seen_at,
          endedAt: row.ended_at,
          status: row.status,
          sessionDurationSeconds: Number(row.session_duration_seconds || 0),
          lastActivityType: row.last_activity_type || 'PAGE_ACTIVE',
          clientPlatform: row.clientPlatform || row.client_platform || 'WEB',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
    } catch {
      return [];
    }
  }
}
