// ==============================================================================
// RASPANDO LA OLLA — SERVICIO DE ESCÁNER DE BIBLIOTECA MULTIMEDIA (ADS GITHUB)
// ==============================================================================

import { AdvertisingAssetProvider } from './AdvertisingAssetProvider';
import { getSupabaseClient } from '../../lib/supabase/client';
import type {
  AdAssetType,
  AdvertisingAsset,
  AdvertisingManifest,
  AdvertisingLibraryScanResult,
  ManifestAssetItem,
} from '../../types/advertising';

const ALLOWED_EXTENSIONS_MAP: Record<string, { type: AdAssetType; mime: string }> = {
  // IMAGES
  webp: { type: 'image', mime: 'image/webp' },
  png: { type: 'image', mime: 'image/png' },
  jpg: { type: 'image', mime: 'image/jpeg' },
  jpeg: { type: 'image', mime: 'image/jpeg' },
  avif: { type: 'image', mime: 'image/avif' },
  svg: { type: 'image', mime: 'image/svg+xml' },

  // ANIMATIONS
  gif: { type: 'animation', mime: 'image/gif' },

  // VIDEOS
  mp4: { type: 'video', mime: 'video/mp4' },
  webm: { type: 'video', mime: 'video/webm' },
};

const FORBIDDEN_EXTENSIONS = new Set([
  'html', 'htm', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
  'exe', 'sh', 'bat', 'cmd', 'ps1', 'php', 'py', 'rb',
  'sql', 'dll', 'bin', 'vbs', 'scr', 'apk', 'com',
]);

export class AdvertisingLibraryService {
  /**
   * Obtiene la extensión limpia de un archivo
   */
  public static getFileExtension(path: string): string {
    if (!path || !path.includes('.')) return '';
    const parts = path.split('.');
    return parts[parts.length - 1].toLowerCase().split('?')[0].split('#')[0];
  }

  /**
   * Valida si un archivo es permitido y seguro para publicidad
   */
  public static validateAssetPath(filePath: string): {
    isValid: boolean;
    type?: AdAssetType;
    mime?: string;
    reason?: string;
  } {
    if (!filePath || typeof filePath !== 'string') {
      return { isValid: false, reason: 'Ruta de archivo vacía o inválida.' };
    }

    const clean = filePath.trim();

    // Detección de protocolos inseguros o scripts
    if (
      clean.toLowerCase().startsWith('javascript:') ||
      clean.toLowerCase().startsWith('data:text/html') ||
      clean.toLowerCase().startsWith('vbscript:')
    ) {
      return { isValid: false, reason: 'Protocolo o esquema no permitido.' };
    }

    const ext = this.getFileExtension(clean);
    if (!ext) {
      return { isValid: false, reason: 'El archivo no posee extensión reconocible.' };
    }

    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      return { isValid: false, reason: `Extensión peligrosa bloqueada por seguridad (.${ext}).` };
    }

    const allowed = ALLOWED_EXTENSIONS_MAP[ext];
    if (!allowed) {
      return { isValid: false, reason: `Tipo de medio no soportado (.${ext}).` };
    }

    return {
      isValid: true,
      type: allowed.type,
      mime: allowed.mime,
    };
  }

  /**
   * Carga y parsea el archivo public/ads/manifest.json
   */
  public static async fetchManifest(): Promise<AdvertisingManifest | null> {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      // Cache buster suave para obtener siempre el catálogo más fresco
      const manifestUrl = `${normalizedBase}ads/manifest.json?t=${Date.now()}`;

      const res = await fetch(manifestUrl);
      if (!res.ok) {
        console.warn(`[AdvertisingLibraryService] No se pudo descargar manifest.json (${res.status})`);
        return null;
      }

      const manifestData = (await res.json()) as AdvertisingManifest;
      if (!manifestData || !Array.isArray(manifestData.assets)) {
        console.warn('[AdvertisingLibraryService] manifest.json con estructura inválida.');
        return null;
      }

      return manifestData;
    } catch (err) {
      console.error('[AdvertisingLibraryService] Error leyendo manifest.json:', err);
      return null;
    }
  }

  /**
   * Escanea la biblioteca desde el manifest y normaliza todos los assets
   */
  public static async scanLibrary(): Promise<AdvertisingLibraryScanResult> {
    const timestamp = new Date().toISOString();
    const manifest = await this.fetchManifest();

    if (!manifest) {
      return {
        success: false,
        timestamp,
        version: 0,
        totalFound: 0,
        validAssetsCount: 0,
        invalidAssetsCount: 0,
        assets: [],
        errors: ['No se encontró el archivo public/ads/manifest.json en el repositorio.'],
      };
    }

    const validAssets: AdvertisingAsset[] = [];
    const errors: string[] = [];

    for (const item of manifest.assets) {
      const validation = this.validateAssetPath(item.file);
      if (!validation.isValid) {
        errors.push(`Asset "${item.id || item.file}": ${validation.reason}`);
        continue;
      }

      const assetKey = item.asset_key || item.id || `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const publicUrl = AdvertisingAssetProvider.getAssetUrl(item.file);

      validAssets.push({
        id: item.id || assetKey,
        assetKey,
        filePath: item.file,
        assetType: item.type || validation.type || 'image',
        mimeType: item.mime || validation.mime,
        title: item.title || item.id,
        description: item.description || '',
        width: item.width || null,
        height: item.height || null,
        durationSeconds: item.duration || null,
        fileSizeBytes: item.size || null,
        active: item.active !== false,
        publicUrl,
      });
    }

    return {
      success: true,
      timestamp,
      version: manifest.version || 1,
      totalFound: manifest.assets.length,
      validAssetsCount: validAssets.length,
      invalidAssetsCount: errors.length,
      assets: validAssets,
      errors,
    };
  }

  /**
   * Sincroniza los assets escaneados con la tabla advertising_assets en Supabase
   */
  public static async syncScanWithSupabase(scanResult: AdvertisingLibraryScanResult): Promise<{
    syncedCount: number;
    error?: string;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { syncedCount: 0, error: 'Cliente de base de datos no disponible.' };
    }

    if (!scanResult.assets || scanResult.assets.length === 0) {
      return { syncedCount: 0 };
    }

    try {
      const payload = scanResult.assets.map((a) => ({
        asset_key: a.assetKey,
        file_path: a.filePath,
        asset_type: a.assetType,
        mime_type: a.mimeType || null,
        title: a.title || a.assetKey,
        description: a.description || null,
        width: a.width || null,
        height: a.height || null,
        duration_seconds: a.durationSeconds || null,
        file_size_bytes: a.fileSizeBytes || null,
        active: a.active,
        updated_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from('advertising_assets')
        .upsert(payload, { onConflict: 'asset_key' })
        .select();

      if (error) {
        console.error('[AdvertisingLibraryService] Error sincronizando assets en Supabase:', error.message);
        return { syncedCount: 0, error: error.message };
      }

      return { syncedCount: data ? data.length : scanResult.assets.length };
    } catch (err: any) {
      console.error('[AdvertisingLibraryService] Excepción sincronizando assets:', err);
      return { syncedCount: 0, error: err?.message || 'Error desconocido al guardar en base de datos.' };
    }
  }
}
