// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE BANNERS Y CONTENIDO MULTIMEDIA
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';
import { getAssetUrl } from '../../utils/assetUtils';

export type ContentBannerLocation =
  | 'HOME'
  | 'LOBBY_MAIN'
  | 'GAMES'
  | 'ATRAPAITO'
  | 'BINGO'
  | 'POLLA'
  | 'PROMOTIONS'
  | 'INFO'
  | 'PROFILE'
  | 'MAIN_PANEL'
  | 'GENERAL';

export interface ContentBannerItem {
  id: string;
  title: string;
  description?: string | null;
  imageUrl: string;
  videoUrl?: string | null;
  mediaType?: 'image' | 'video';
  buttonText?: string | null;
  targetAction: string; // 'polla', 'bingo', 'atrapaito', 'games', 'wallet', 'promotions', 'info', etc.
  priority: number;
  isActive: boolean;
  startDate: string;
  endDate?: string | null;
  location: ContentBannerLocation;
  createdAt?: string;
  updatedAt?: string;
}

function cleanBannerImageUrl(rawUrl?: string | null): string {
  return getAssetUrl(rawUrl);
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
      // Mapear alias comunes de ubicaciones
      const targetLoc = location.toUpperCase();
      let locationQuery = `location.eq.${targetLoc},location.eq.GENERAL`;
      if (targetLoc === 'HOME' || targetLoc === 'LOBBY_MAIN') {
        locationQuery = `location.eq.HOME,location.eq.LOBBY_MAIN,location.eq.GENERAL`;
      }

      const { data, error } = await supabase
        .from('content_banners')
        .select('*')
        .eq('is_active', true)
        .lte('start_date', nowIso)
        .or(locationQuery)
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
        imageUrl: cleanBannerImageUrl(row.image_url),
        videoUrl: row.video_url,
        mediaType: row.video_url ? 'video' : 'image',
        buttonText: row.button_text,
        targetAction: row.target_action || 'polla',
        priority: Number(row.priority || 1),
        isActive: Boolean(row.is_active),
        startDate: row.start_date,
        endDate: row.end_date,
        location: (row.location || 'HOME') as ContentBannerLocation,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
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
        imageUrl: cleanBannerImageUrl(row.image_url),
        videoUrl: row.video_url,
        mediaType: row.video_url ? 'video' : 'image',
        buttonText: row.button_text,
        targetAction: row.target_action || 'polla',
        priority: Number(row.priority || 1),
        isActive: Boolean(row.is_active),
        startDate: row.start_date,
        endDate: row.end_date,
        location: (row.location || 'HOME') as ContentBannerLocation,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Guarda o actualiza un banner de contenido multimedia.
   */
  public static async saveBanner(
    banner: Partial<ContentBannerItem>
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase no inicializado' };

    try {
      const payload = {
        title: banner.title || 'Sin Título',
        description: banner.description || null,
        image_url: cleanBannerImageUrl(banner.imageUrl),
        video_url: banner.videoUrl || null,
        button_text: banner.buttonText || null,
        target_action: banner.targetAction || 'polla',
        priority: banner.priority !== undefined ? Number(banner.priority) : 1,
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
   * Cambia el estado activo/inactivo de un banner.
   */
  public static async toggleBannerActive(
    id: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase no inicializado' };

    try {
      const { error } = await supabase
        .from('content_banners')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Actualiza el orden / prioridad de un banner.
   */
  public static async updateBannerPriority(
    id: string,
    priority: number
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase no inicializado' };

    try {
      const { error } = await supabase
        .from('content_banners')
        .update({ priority: Number(priority), updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Elimina un banner por ID.
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

  /**
   * Carga un archivo de imagen o video en Supabase Storage (bucket: 'lobby-content')
   * y devuelve la URL pública.
   */
  public static async uploadMediaFile(
    file: File
  ): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
    const supabase = getSupabaseClient();
    if (!supabase) return { success: false, error: 'Supabase no inicializado' };

    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const cleanFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const bucketName = 'lobby-content';
      const filePath = `media/${cleanFileName}`;

      // Intentar subir al bucket 'lobby-content'
      let { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      // Si el bucket no existe, intentar con bucket alternativo 'payment-proofs'
      if (uploadError && (uploadError.message.includes('bucket not found') || uploadError.message.includes('Bucket'))) {
        const altBucket = 'payment-proofs';
        const altRes = await supabase.storage
          .from(altBucket)
          .upload(`banners/${cleanFileName}`, file, { cacheControl: '3600', upsert: true });

        if (!altRes.error) {
          const { data: urlData } = supabase.storage.from(altBucket).getPublicUrl(`banners/${cleanFileName}`);
          if (urlData?.publicUrl) {
            return { success: true, publicUrl: urlData.publicUrl };
          }
        }
      }

      if (uploadError) {
        console.warn('[BannerRepository] Storage upload warning:', uploadError.message);
        // Fallback: Si la carga al storage falla o no hay bucket, convertimos a Data URL para previsualización inmediata
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({ success: true, publicUrl: reader.result as string });
          };
          reader.onerror = () => {
            resolve({ success: false, error: uploadError.message });
          };
          reader.readAsDataURL(file);
        });
      }

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      return { success: true, publicUrl: urlData.publicUrl };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error durante la carga de medios' };
    }
  }
}

