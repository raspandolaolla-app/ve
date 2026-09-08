/**
 * ==============================================================================
 * RASPANDO LA OLLA — REPOSITORIO DE CONFIGURACIONES DE JUEGOS Y ANUNCIOS
 * ==============================================================================
 * Extraído de AdminRepository.ts para modularización de Fase 3.
 * Gestión de montos de entrada, parámetros de juegos, reglas y anuncios del sistema.
 * ==============================================================================
 */

import { getSupabaseClient } from '../../../lib/supabase/client';
import { SUPPORTED_GAMES_METADATA } from '../../../utils/constants';
import { logger } from '../../../utils/logger';
import { AdminAuditRepository } from './AdminAuditRepository';
import type {
  EntryFeeItem,
  GameConfigItem,
  GameManualItem,
  SystemAnnouncementItem,
} from '../../../types/admin';

export class AdminGameConfigRepository {
  /**
   * Obtiene todos los montos de entrada configurados en la plataforma.
   */
  public static async getEntryFeesList(): Promise<EntryFeeItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return [
        { id: '1', amount: 20, displayOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: '2', amount: 50, displayOrder: 2, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: '3', amount: 100, displayOrder: 3, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: '4', amount: 250, displayOrder: 4, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: '5', amount: 500, displayOrder: 5, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: '6', amount: 1000, displayOrder: 6, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: '7', amount: 2000, displayOrder: 7, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];
    }

    try {
      const { data, error } = await supabase
        .from('entry_fees')
        .select('*')
        .order('display_order', { ascending: true })
        .order('amount', { ascending: true });

      if (error || !data || data.length === 0) {
        return [
          { id: '1', amount: 10, displayOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '2', amount: 15, displayOrder: 2, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '3', amount: 20, displayOrder: 3, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '4', amount: 25, displayOrder: 4, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '5', amount: 50, displayOrder: 5, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '6', amount: 100, displayOrder: 6, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '7', amount: 250, displayOrder: 7, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '8', amount: 500, displayOrder: 8, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '9', amount: 1000, displayOrder: 9, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { id: '10', amount: 2000, displayOrder: 10, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
      }

      return data.map((row: any) => ({
        id: row.id,
        amount: Number(row.amount),
        gameType: row.game_type,
        mode: row.mode,
        displayOrder: Number(row.display_order || 0),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Crea o actualiza un monto de entrada con auditoría.
   */
  public static async saveEntryFee(payload: {
    id?: string;
    amount: number;
    gameType?: string | null;
    mode?: string | null;
    displayOrder: number;
    isActive: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const record = {
        amount: payload.amount,
        game_type: payload.gameType || null,
        mode: payload.mode || null,
        display_order: payload.displayOrder,
        is_active: payload.isActive,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (payload.id) {
        const res = await supabase.from('entry_fees').update(record).eq('id', payload.id);
        error = res.error;
      } else {
        const res = await supabase.from('entry_fees').insert(record);
        error = res.error;
      }

      if (error) return { success: false, error: error.message };

      await AdminAuditRepository.recordAdminAudit({
        action: payload.id ? 'UPDATE_ENTRY_FEE' : 'CREATE_ENTRY_FEE',
        resourceType: 'ENTRY_FEE',
        resourceId: payload.id || `amount_${payload.amount}`,
        severity: 'INFO',
        metadata: payload,
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Elimina un monto de entrada.
   */
  public static async deleteEntryFee(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { error } = await supabase.from('entry_fees').delete().eq('id', id);
      if (error) return { success: false, error: error.message };

      await AdminAuditRepository.recordAdminAudit({
        action: 'DELETE_ENTRY_FEE',
        resourceType: 'ENTRY_FEE',
        resourceId: id,
        severity: 'WARNING',
        metadata: { id },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Obtiene la configuración de todos los juegos.
   */
  public static async getGameConfigsList(): Promise<GameConfigItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return SUPPORTED_GAMES_METADATA.map((g, idx) => ({
        gameId: g.id,
        name: g.name,
        shortDescription: g.shortDescription,
        iconName: 'Gamepad2',
        isActive: g.isActive,
        minPlayers: g.minPlayers,
        maxPlayers: g.maxPlayers,
        allowedModes: g.allowedModes,
        minEntryFee: g.minEntryFee,
        maxEntryFee: g.maxEntryFee,
        config: {},
        displayOrder: idx + 1,
        updatedAt: new Date().toISOString(),
      }));
    }

    try {
      const { data, error } = await supabase
        .from('game_configurations')
        .select('*')
        .order('display_order', { ascending: true });

      if (error || !data || data.length === 0) {
        return SUPPORTED_GAMES_METADATA.map((g, idx) => ({
          gameId: g.id,
          name: g.name,
          shortDescription: g.shortDescription,
          iconName: 'Gamepad2',
          isActive: g.isActive,
          minPlayers: g.minPlayers,
          maxPlayers: g.maxPlayers,
          allowedModes: g.allowedModes,
          minEntryFee: g.minEntryFee,
          maxEntryFee: g.maxEntryFee,
          config: {},
          displayOrder: idx + 1,
          updatedAt: new Date().toISOString(),
        }));
      }

      return data.map((row: any) => ({
        gameId: row.game_id,
        name: row.name,
        shortDescription: row.short_description,
        iconName: row.icon_name || 'Gamepad2',
        isActive: Boolean(row.is_active && row.enabled !== false),
        enabled: row.enabled !== false,
        disabledReason: row.disabled_reason || null,
        disabledAt: row.disabled_at || null,
        disabledBy: row.disabled_by || null,
        maintenanceMessage: row.maintenance_message,
        minPlayers: Number(row.min_players),
        maxPlayers: Number(row.max_players),
        allowedModes: row.allowed_modes || ['1v1', '2v2'],
        minEntryFee: Number(row.min_entry_fee),
        maxEntryFee: Number(row.max_entry_fee),
        config: row.config || {},
        displayOrder: Number(row.display_order || 0),
        updatedAt: row.updated_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Habilita o deshabilita un juego mediante la RPC atómica canónica admin_set_game_enabled.
   * Si se deshabilita, el motivo (reason) es estrictamente obligatorio.
   */
  public static async setGameEnabled(
    gameId: string,
    enabled: boolean,
    reason?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data, error } = await supabase.rpc('admin_set_game_enabled', {
        p_game_id: gameId,
        p_enabled: enabled,
        p_reason: reason?.trim() || null,
      });

      if (error) {
        logger.error('[AdminGameConfigRepository] Error al modificar disponibilidad del juego:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[AdminGameConfigRepository] Excepción en setGameEnabled:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Guarda o actualiza la configuración de un juego.
   */
  public static async saveGameConfig(config: GameConfigItem): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { error } = await supabase.from('game_configurations').upsert({
        game_id: config.gameId,
        name: config.name,
        short_description: config.shortDescription,
        icon_name: config.iconName,
        is_active: config.isActive,
        maintenance_message: config.maintenanceMessage || null,
        min_players: config.minPlayers,
        max_players: config.maxPlayers,
        allowed_modes: config.allowedModes,
        min_entry_fee: config.minEntryFee,
        max_entry_fee: config.maxEntryFee,
        config: config.config || {},
        display_order: config.displayOrder,
        updated_at: new Date().toISOString(),
      });

      if (error) return { success: false, error: error.message };

      await AdminAuditRepository.recordAdminAudit({
        action: 'UPDATE_GAME_CONFIGURATION',
        resourceType: 'GAME_CONFIG',
        resourceId: config.gameId,
        severity: 'INFO',
        metadata: config,
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Obtiene la lista de manuales de todos los juegos.
   */
  public static async getGameManualsList(): Promise<GameManualItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase.from('game_manuals').select('*');
      if (error || !data) return [];

      return data.map((row: any) => ({
        gameId: row.game_id,
        title: row.title,
        objective: row.objective,
        playersInfo: row.players_info,
        preparation: row.preparation,
        turnRules: row.turn_rules,
        winningRules: row.winning_rules,
        scoringRules: row.scoring_rules,
        disconnectionRules: row.disconnection_rules,
        cancellationRules: row.cancellation_rules,
        fullContentMarkdown: row.full_content_markdown,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Guarda o actualiza el manual de un juego.
   */
  public static async saveGameManual(manual: GameManualItem): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      const { error } = await supabase.from('game_manuals').upsert({
        game_id: manual.gameId,
        title: manual.title,
        objective: manual.objective,
        players_info: manual.playersInfo,
        preparation: manual.preparation,
        turn_rules: manual.turnRules,
        winning_rules: manual.winningRules,
        scoring_rules: manual.scoringRules,
        disconnection_rules: manual.disconnectionRules,
        cancellation_rules: manual.cancellationRules,
        full_content_markdown: manual.fullContentMarkdown,
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      });

      if (error) return { success: false, error: error.message };

      await AdminAuditRepository.recordAdminAudit({
        action: 'UPDATE_GAME_MANUAL',
        resourceType: 'GAME_MANUAL',
        resourceId: manual.gameId,
        severity: 'INFO',
        metadata: { game_id: manual.gameId, title: manual.title },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Obtiene todos los anuncios del sistema.
   */
  public static async getAnnouncementsList(): Promise<SystemAnnouncementItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('system_announcements')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return data.map((row: any) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        type: row.type || 'GENERAL',
        priority: Number(row.priority || 0),
        targetAudience: row.target_audience || 'ALL',
        isActive: Boolean(row.is_active),
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Guarda o actualiza un anuncio del sistema.
   */
  public static async saveAnnouncement(announcement: Partial<SystemAnnouncementItem>): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;

      const record = {
        title: announcement.title,
        content: announcement.content,
        type: announcement.type || 'GENERAL',
        priority: announcement.priority ?? 0,
        target_audience: announcement.targetAudience || 'ALL',
        is_active: announcement.isActive ?? true,
        starts_at: announcement.startsAt || new Date().toISOString(),
        expires_at: announcement.expiresAt || null,
        created_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (announcement.id) {
        const res = await supabase.from('system_announcements').update(record).eq('id', announcement.id);
        error = res.error;
      } else {
        const res = await supabase.from('system_announcements').insert(record);
        error = res.error;
      }

      if (error) return { success: false, error: error.message };

      await AdminAuditRepository.recordAdminAudit({
        action: announcement.id ? 'UPDATE_ANNOUNCEMENT' : 'CREATE_ANNOUNCEMENT',
        resourceType: 'SYSTEM_ANNOUNCEMENT',
        resourceId: announcement.id || 'new',
        severity: 'INFO',
        metadata: record,
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Elimina un anuncio del sistema.
   */
  public static async deleteAnnouncement(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Servicio no disponible' };

    try {
      const { error } = await supabase.from('system_announcements').delete().eq('id', id);
      if (error) return { success: false, error: error.message };

      await AdminAuditRepository.recordAdminAudit({
        action: 'DELETE_ANNOUNCEMENT',
        resourceType: 'SYSTEM_ANNOUNCEMENT',
        resourceId: id,
        severity: 'WARNING',
        metadata: { id },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}
