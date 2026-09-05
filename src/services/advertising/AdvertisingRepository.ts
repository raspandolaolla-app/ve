// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE PUBLICIDAD (CONFIGURACIÓN EN SUPABASE)
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { AdvertisingAssetProvider } from './AdvertisingAssetProvider';
import type {
  AdvertisingAsset,
  AdvertisingCampaign,
  AdPlacement,
  AdDeviceType,
  AdOrientation,
} from '../../types/advertising';

export class AdvertisingRepository {
  /**
   * Obtiene la lista de assets registrados en la base de datos
   */
  public static async getAssets(includeInactive = false): Promise<AdvertisingAsset[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      let query = supabase.from('advertising_assets').select('*');
      if (!includeInactive) {
        query = query.eq('active', true);
      }
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        console.warn('[AdvertisingRepository] Error consultando assets:', error.message);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        assetKey: row.asset_key,
        filePath: row.file_path,
        assetType: row.asset_type,
        mimeType: row.mime_type,
        title: row.title,
        description: row.description,
        width: row.width,
        height: row.height,
        durationSeconds: row.duration_seconds,
        fileSizeBytes: row.file_size_bytes,
        active: Boolean(row.active),
        publicUrl: AdvertisingAssetProvider.getAssetUrl(row.file_path),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Obtiene todas las campañas activas para evaluación del Advertising Engine
   */
  public static async getActiveCampaigns(): Promise<AdvertisingCampaign[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('advertising_campaigns')
        .select(`
          *,
          advertising_assets (
            id,
            asset_key,
            file_path,
            asset_type,
            mime_type,
            title,
            description,
            width,
            height,
            duration_seconds,
            file_size_bytes,
            active
          )
        `)
        .eq('active', true)
        .or(`start_at.is.null,start_at.lte.${nowIso}`)
        .or(`end_at.is.null,end_at.gte.${nowIso}`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[AdvertisingRepository] Error consultando campañas activas:', error.message);
        return [];
      }

      return (data || []).map((row) => {
        const rawAsset = row.advertising_assets;
        const asset: AdvertisingAsset | null = rawAsset
          ? {
              id: rawAsset.id,
              assetKey: rawAsset.asset_key,
              filePath: rawAsset.file_path,
              assetType: rawAsset.asset_type,
              mimeType: rawAsset.mime_type,
              title: rawAsset.title,
              description: rawAsset.description,
              width: rawAsset.width,
              height: rawAsset.height,
              durationSeconds: rawAsset.duration_seconds,
              fileSizeBytes: rawAsset.file_size_bytes,
              active: Boolean(rawAsset.active),
              publicUrl: AdvertisingAssetProvider.getAssetUrl(rawAsset.file_path),
            }
          : null;

        return {
          id: row.id,
          assetId: row.asset_id,
          asset,
          name: row.name,
          active: Boolean(row.active),
          priority: Number(row.priority || 0),
          placement: row.placement as AdPlacement,
          gameType: row.game_type || null,
          deviceType: (row.device_type || 'ALL') as AdDeviceType,
          orientation: (row.orientation || 'ANY') as AdOrientation,
          startAt: row.start_at,
          endAt: row.end_at,
          displayDurationSeconds: row.display_duration_seconds,
          frequencyLimit: row.frequency_limit,
          targetUrl: row.target_url,
          ctaText: row.cta_text,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Obtiene la lista completa de campañas para la consola administrativa
   */
  public static async getAllCampaignsForAdmin(): Promise<AdvertisingCampaign[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('advertising_campaigns')
        .select(`
          *,
          advertising_assets (
            id,
            asset_key,
            file_path,
            asset_type,
            mime_type,
            title,
            description,
            width,
            height,
            duration_seconds,
            file_size_bytes,
            active
          )
        `)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AdvertisingRepository] Error listando campañas admin:', error.message);
        return [];
      }

      return (data || []).map((row) => {
        const rawAsset = row.advertising_assets;
        const asset: AdvertisingAsset | null = rawAsset
          ? {
              id: rawAsset.id,
              assetKey: rawAsset.asset_key,
              filePath: rawAsset.file_path,
              assetType: rawAsset.asset_type,
              mimeType: rawAsset.mime_type,
              title: rawAsset.title,
              description: rawAsset.description,
              width: rawAsset.width,
              height: rawAsset.height,
              durationSeconds: rawAsset.duration_seconds,
              fileSizeBytes: rawAsset.file_size_bytes,
              active: Boolean(rawAsset.active),
              publicUrl: AdvertisingAssetProvider.getAssetUrl(rawAsset.file_path),
            }
          : null;

        return {
          id: row.id,
          assetId: row.asset_id,
          asset,
          name: row.name,
          active: Boolean(row.active),
          priority: Number(row.priority || 0),
          placement: row.placement as AdPlacement,
          gameType: row.game_type || null,
          deviceType: (row.device_type || 'ALL') as AdDeviceType,
          orientation: (row.orientation || 'ANY') as AdOrientation,
          startAt: row.start_at,
          endAt: row.end_at,
          displayDurationSeconds: row.display_duration_seconds,
          frequencyLimit: row.frequency_limit,
          targetUrl: row.target_url,
          ctaText: row.cta_text,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
    } catch (err) {
      console.error('[AdvertisingRepository] Excepción listando campañas:', err);
      return [];
    }
  }

  /**
   * Guarda o actualiza una campaña publicitaria
   */
  public static async saveCampaign(
    campaign: Partial<AdvertisingCampaign>
  ): Promise<{ success: boolean; campaign?: AdvertisingCampaign; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Sin conexión a la base de datos' };

    try {
      const payload: any = {
        name: campaign.name?.trim(),
        asset_id: campaign.assetId || null,
        active: campaign.active ?? false,
        priority: campaign.priority ?? 0,
        placement: campaign.placement,
        game_type: campaign.gameType || null,
        device_type: campaign.deviceType || 'ALL',
        orientation: campaign.orientation || 'ANY',
        start_at: campaign.startAt || null,
        end_at: campaign.endAt || null,
        display_duration_seconds: campaign.displayDurationSeconds ?? 10,
        frequency_limit: campaign.frequencyLimit || null,
        target_url: campaign.targetUrl || null,
        cta_text: campaign.ctaText || null,
        updated_at: new Date().toISOString(),
      };

      if (!payload.name) {
        return { success: false, error: 'El nombre de la campaña es obligatorio' };
      }
      if (!payload.placement) {
        return { success: false, error: 'La ubicación (placement) es obligatoria' };
      }

      let resData: any = null;
      if (campaign.id) {
        const { data, error } = await supabase
          .from('advertising_campaigns')
          .update(payload)
          .eq('id', campaign.id)
          .select()
          .single();

        if (error) return { success: false, error: error.message };
        resData = data;
      } else {
        const { data, error } = await supabase
          .from('advertising_campaigns')
          .insert([payload])
          .select()
          .single();

        if (error) return { success: false, error: error.message };
        resData = data;
      }

      return {
        success: true,
        campaign: {
          id: resData.id,
          assetId: resData.asset_id,
          name: resData.name,
          active: Boolean(resData.active),
          priority: Number(resData.priority || 0),
          placement: resData.placement,
          gameType: resData.game_type,
          deviceType: resData.device_type,
          orientation: resData.orientation,
          startAt: resData.start_at,
          endAt: resData.end_at,
          displayDurationSeconds: resData.display_duration_seconds,
          frequencyLimit: resData.frequency_limit,
          targetUrl: resData.target_url,
          ctaText: resData.cta_text,
          createdAt: resData.created_at,
          updatedAt: resData.updated_at,
        },
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error guardando campaña' };
    }
  }

  /**
   * Alterna el estado activo de una campaña
   */
  public static async toggleCampaignActive(
    id: string,
    active: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Sin conexión' };

    const { error } = await supabase
      .from('advertising_campaigns')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  /**
   * Actualiza la prioridad de una campaña
   */
  public static async updateCampaignPriority(
    id: string,
    priority: number
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Sin conexión' };

    const { error } = await supabase
      .from('advertising_campaigns')
      .update({ priority, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  /**
   * Elimina una campaña publicitaria
   */
  public static async deleteCampaign(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Sin conexión' };

    const { error } = await supabase.from('advertising_campaigns').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }
}
