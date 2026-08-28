// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE BANNERS Y CONTENIDO MULTIMEDIA
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';

export interface ContentBannerItem {
  id: string;
  title: string;
  description?: string | null;
  imageUrl: string;
  videoUrl?: string | null;
  buttonText?: string | null;
  targetAction: string; // 'polla', 'bingo', 'games', 'wallet', etc.
  priority: number;
  isActive: boolean;
  startDate: string;
  endDate?: string | null;
  location: 'HOME' | 'GAMES' | 'POLLA' | 'BINGO' | 'PROFILE' | 'MAIN_PANEL' | 'GENERAL';
  createdAt?: string;
}

export class BannerRepository {
  /**
   * Obtiene los banners activos para una ubicación determinada.
   */
  public static async getActiveBanners(
    location: string = 'HOME'
  ): Promise<ContentBannerItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('content_banners')
        .select('*')
        .eq('is_active', true)
        .lte('start_date', nowIso)
        .or(`location.eq.${location},location.eq.GENERAL,location.eq.HOME`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[BannerRepository] Error consultando banners activos:', error.message);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        imageUrl: row.image_url,
        videoUrl: row.video_url,
        buttonText: row.button_text,
        targetAction: row.target_action || 'polla',
        priority: Number(row.priority || 1),
        isActive: Boolean(row.is_active),
        startDate: row.start_date,
        endDate: row.end_date,
        location: row.location || 'HOME',
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Obtiene la lista completa de banners para administración.
   */
  public static async getAllBannersForAdmin(): Promise<ContentBannerItem[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('content_banners')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[BannerRepository] Error listando banners admin:', error.message);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        imageUrl: row.image_url,
        videoUrl: row.video_url,
        buttonText: row.button_text,
        targetAction: row.target_action || 'polla',
        priority: Number(row.priority || 1),
        isActive: Boolean(row.is_active),
        startDate: row.start_date,
        endDate: row.end_date,
        location: row.location || 'HOME',
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Guarda o actualiza un banner de contenido.
   */
  public static async saveBanner(
    banner: Partial<ContentBannerItem>
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase no inicializado' };

    try {
      const payload = {
        title: banner.title,
        description: banner.description || null,
        image_url: banner.imageUrl,
        video_url: banner.videoUrl || null,
        button_text: banner.buttonText || null,
        target_action: banner.targetAction || 'polla',
        priority: banner.priority || 1,
        is_active: banner.isActive ?? true,
        start_date: banner.startDate || new Date().toISOString(),
        end_date: banner.endDate || null,
        location: banner.location || 'HOME',
        updated_at: new Date().toISOString(),
      };

      if (banner.id) {
        const { error } = await supabase
          .from('content_banners')
          .update(payload)
          .eq('id', banner.id);

        if (error) return { success: false, error: error.message };
        return { success: true, id: banner.id };
      } else {
        const { data, error } = await supabase
          .from('content_banners')
          .insert([payload])
          .select('id')
          .single();

        if (error) return { success: false, error: error.message };
        return { success: true, id: data.id };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Excepción al guardar banner' };
    }
  }

  /**
   * Elimina un banner.
   */
  public static async deleteBanner(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase no inicializado' };

    try {
      const { error } = await supabase.from('content_banners').delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
