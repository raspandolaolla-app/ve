// ==============================================================================
// RASPANDO LA OLLA — SERVICIO CENTRAL DE PUBLICIDAD (AD SERVICE)
// ==============================================================================
// Arquitectura Centralizada de Publicidad:
//   /public/ads/ (manifest.json + videos/banners)  +  Supabase (advertising_campaigns)
//                            │
//                            ▼
//                        AdService
//                            │
//                            ▼
//          ┌─────────────────┼─────────────────┐
//          ▼                 ▼                 ▼
//        HOME              LOBBY             GAMES (PWA / Mobile / Desktop)
//
// Reglas Principales:
// - Offline-first: los assets físicos de /public/ads/ funcionan sin conexión o sin BD.
// - Respeto estricto a la disponibilidad de juegos (Sección 41): No promociona juegos deshabilitados.
// - Aislamiento absoluto: fallos en medios jamás bloquean el Game Engine ni la UI.
// - Sanitización de enlaces: prevención de javascript: o scripts maliciosos.
// ==============================================================================

import { AdvertisingAssetProvider } from './AdvertisingAssetProvider';
import { AdvertisingLibraryService } from './AdvertisingLibraryService';
import { AdvertisingRepository } from './AdvertisingRepository';
import { normalizeCanonicalGameId } from '../../context/GameAvailabilityContext';
import { getSupabaseClient } from '../../lib/supabase/client';
import type {
  AdvertisingAsset,
  AdvertisingCampaign,
  AdPlacement,
  AdDeviceType,
  AdOrientation,
  AdvertisingManifest,
} from '../../types/advertising';

export interface AdQueryOptions {
  gameType?: string | null;
  deviceType?: AdDeviceType;
  orientation?: AdOrientation;
  isGameEnabled?: (gameId: string) => boolean;
}

export type AdChangeListener = (campaigns: AdvertisingCampaign[]) => void;

export class AdService {
  private static instance: AdService | null = null;
  private manifestCache: AdvertisingManifest | null = null;
  private fallbackCampaigns: AdvertisingCampaign[] = [];
  private remoteCampaigns: AdvertisingCampaign[] = [];
  private mergedCampaigns: AdvertisingCampaign[] = [];
  private failedAdIds: Set<string> = new Set();
  private listeners: Set<AdChangeListener> = new Set();
  private isInitialized = false;
  private realtimeChannel: any = null;

  private constructor() {
    this.setupWindowListeners();
  }

  public static getInstance(): AdService {
    if (!this.instance) {
      this.instance = new AdService();
    }
    return this.instance;
  }

  /**
   * Inicializa el servicio cargando el inventario local y las campañas dinámicas
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Cargar inventario estático desde /public/ads/manifest.json (Offline-first)
    await this.loadManifestInventory();

    // 2. Cargar campañas dinámicas desde Supabase
    await this.refreshRemoteCampaigns();

    // 3. Suscribir a Realtime de Supabase
    this.subscribeRealtime();
  }

  /**
   * Carga el manifiesto estático y genera campañas base de respaldo
   */
  public async loadManifestInventory(): Promise<void> {
    try {
      const manifest = await AdvertisingLibraryService.fetchManifest();
      if (manifest && Array.isArray(manifest.assets)) {
        this.manifestCache = manifest;
        this.fallbackCampaigns = manifest.assets
          .filter((item) => item.active !== false)
          .map((item, index) => {
            const assetKey = item.asset_key || item.id;
            const publicUrl = AdvertisingAssetProvider.getAssetUrl(item.file);
            const posterUrl = item.poster ? AdvertisingAssetProvider.getAssetUrl(item.poster) : undefined;

            const asset: AdvertisingAsset = {
              id: item.id || `manifest_asset_${index}`,
              assetKey,
              filePath: item.file,
              posterPath: item.poster || null,
              assetType: item.type || 'image',
              mimeType: item.mime || null,
              title: item.title || assetKey,
              description: item.description || '',
              width: item.width || null,
              height: item.height || null,
              durationSeconds: item.duration || null,
              fileSizeBytes: item.size || null,
              active: true,
              publicUrl,
              posterUrl,
              defaultPlacement: item.defaultPlacement || 'HOME_TOP',
              gameType: item.gameType || null,
              targetUrl: item.targetUrl || 'tables',
              ctaText: item.ctaText || 'VER MÁS',
            };

            const defaultPriority = item.type === 'video' ? 20 - index : 10 - index;

            return {
              id: `fallback_${item.id}`,
              assetId: asset.id,
              asset,
              name: item.title || assetKey,
              active: true,
              priority: Math.max(1, defaultPriority),
              placement: (item.defaultPlacement || 'HOME_TOP') as AdPlacement,
              gameType: item.gameType || null,
              deviceType: 'ALL',
              orientation: 'ANY',
              displayDurationSeconds: item.duration || 10,
              targetUrl: item.targetUrl || 'tables',
              ctaText: item.ctaText || 'JUGAR AHORA',
              createdAt: manifest.updated_at || new Date().toISOString(),
            };
          });

        this.recalculateMergedCampaigns();
      }
    } catch (err) {
      console.warn('[AdService] Error leyendo manifest local de publicidad:', err);
    }
  }

  /**
   * Consulta las campañas activas de Supabase
   */
  public async refreshRemoteCampaigns(): Promise<void> {
    try {
      const campaigns = await AdvertisingRepository.getActiveCampaigns();
      this.remoteCampaigns = campaigns;
      this.recalculateMergedCampaigns();
    } catch (err) {
      console.warn('[AdService] Error refrescando campañas remotas:', err);
      // Mantiene las campañas de fallback locales activas
      this.recalculateMergedCampaigns();
    }
  }

  /**
   * Combina las campañas de Supabase con los assets base del manifest
   */
  private recalculateMergedCampaigns(): void {
    if (this.remoteCampaigns.length > 0) {
      // Usar las campañas de Supabase como fuente primaria
      this.mergedCampaigns = [...this.remoteCampaigns];

      // Añadir de respaldo los assets del manifest que no estén configurados en Supabase
      const configuredAssetPaths = new Set(
        this.remoteCampaigns
          .map((c) => c.asset?.filePath)
          .filter(Boolean)
      );

      for (const fallback of this.fallbackCampaigns) {
        if (fallback.asset?.filePath && !configuredAssetPaths.has(fallback.asset.filePath)) {
          this.mergedCampaigns.push(fallback);
        }
      }
    } else {
      // Si Supabase no tiene campañas activas o está desconectado, usar 100% el inventario local
      this.mergedCampaigns = [...this.fallbackCampaigns];
    }

    this.notifyListeners();
  }

  /**
   * Suscribe a cambios en tiempo real en Supabase
   */
  private subscribeRealtime(): void {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
    }

    this.realtimeChannel = supabase
      .channel(`ad_service_realtime_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'advertising_campaigns' }, () => {
        this.refreshRemoteCampaigns();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'advertising_assets' }, () => {
        this.refreshRemoteCampaigns();
      })
      .subscribe();
  }

  private setupWindowListeners(): void {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      this.notifyListeners();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
  }

  /**
   * Detección del tipo de dispositivo
   */
  public static getCurrentDeviceType(): AdDeviceType {
    if (typeof window === 'undefined') return 'DESKTOP';
    const width = window.innerWidth;
    if (width < 768) return 'MOBILE';
    if (width <= 1024) return 'TABLET';
    return 'DESKTOP';
  }

  /**
   * Detección de la orientación de pantalla
   */
  public static getCurrentOrientation(): AdOrientation {
    if (typeof window === 'undefined') return 'LANDSCAPE';
    if (window.innerWidth < window.innerHeight) return 'PORTRAIT';
    return 'LANDSCAPE';
  }

  /**
   * Sanitiza URLs para prevenir vulnerabilidades javascript: o datos maliciosos
   */
  public static sanitizeUrl(url?: string | null): string | null {
    if (!url || typeof url !== 'string') return null;
    const clean = url.trim();
    if (
      clean.toLowerCase().startsWith('javascript:') ||
      clean.toLowerCase().startsWith('vbscript:') ||
      clean.toLowerCase().startsWith('data:text/html')
    ) {
      console.warn('[AdService] Intento de URL maliciosa bloqueada:', clean);
      return null;
    }
    return clean;
  }

  /**
   * Evalúa si una campaña es elegible considerando contexto y disponibilidad de juegos
   */
  public isCampaignEligible(campaign: AdvertisingCampaign, options?: AdQueryOptions): boolean {
    if (!campaign || !campaign.active) return false;

    // 1. Descartar si el anuncio falló en esta sesión
    if (this.failedAdIds.has(campaign.id) || (campaign.asset?.id && this.failedAdIds.has(campaign.asset.id))) {
      return false;
    }

    // 2. Control de Disponibilidad de Juegos (Sección 41):
    // Si la campaña promociona un juego deshabilitado, NUNCA mostrarla
    if (options?.isGameEnabled) {
      if (campaign.gameType) {
        const canonical = normalizeCanonicalGameId(campaign.gameType);
        if (canonical && !options.isGameEnabled(canonical)) {
          return false;
        }
      }

      // Si el enlace de acción apunta a un juego deshabilitado (ej. 'polla', 'atrapaito', 'bingo')
      if (campaign.targetUrl) {
        const targetCanonical = normalizeCanonicalGameId(campaign.targetUrl);
        if (targetCanonical && !options.isGameEnabled(targetCanonical)) {
          return false;
        }
      }
    }

    // 3. Ventana Temporal
    const now = Date.now();
    if (campaign.startAt) {
      const startMs = new Date(campaign.startAt).getTime();
      if (!isNaN(startMs) && now < startMs) return false;
    }
    if (campaign.endAt) {
      const endMs = new Date(campaign.endAt).getTime();
      if (!isNaN(endMs) && now > endMs) return false;
    }

    // 4. Tipo de Dispositivo
    const clientDevice = options?.deviceType || AdService.getCurrentDeviceType();
    if (campaign.deviceType && campaign.deviceType !== 'ALL' && campaign.deviceType !== clientDevice) {
      return false;
    }

    // 5. Orientación de Pantalla
    const clientOrientation = options?.orientation || AdService.getCurrentOrientation();
    if (campaign.orientation && campaign.orientation !== 'ANY' && campaign.orientation !== clientOrientation) {
      return false;
    }

    // 6. Juego actual del contexto (si aplica)
    if (options?.gameType && campaign.gameType) {
      const currentCanonical = normalizeCanonicalGameId(options.gameType);
      const campCanonical = normalizeCanonicalGameId(campaign.gameType);
      if (currentCanonical && campCanonical && currentCanonical !== campCanonical && campCanonical !== 'all') {
        return false;
      }
    }

    return true;
  }

  /**
   * Obtiene la lista ordenada de anuncios elegibles para una ubicación
   */
  public getAdsForPlacement(placement: AdPlacement, options?: AdQueryOptions): AdvertisingCampaign[] {
    const targetPlacement = String(placement || '').toUpperCase();

    const matches = this.mergedCampaigns.filter((c) => {
      const campPlacement = String(c.placement || '').toUpperCase();
      // Equivalencias de ubicación para máxima cobertura
      const placementMatches =
        campPlacement === targetPlacement ||
        campPlacement === 'ALL' ||
        (targetPlacement === 'HOME_TOP' && (campPlacement === 'HOME' || campPlacement === 'LOBBY_MAIN')) ||
        (targetPlacement === 'LOBBY' && (campPlacement === 'GAMES' || campPlacement === 'HOME_MIDDLE'));

      if (!placementMatches) return false;

      return this.isCampaignEligible(c, options);
    });

    // Ordenar por prioridad DESC, luego por fecha de creación DESC
    matches.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return matches;
  }

  /**
   * Obtiene el anuncio individual de mayor prioridad para una ubicación
   */
  public getAdForPlacement(placement: AdPlacement, options?: AdQueryOptions): AdvertisingCampaign | null {
    const ads = this.getAdsForPlacement(placement, options);
    return ads.length > 0 ? ads[0] : null;
  }

  /**
   * Registra un fallo de reproducción de un anuncio para rotar al siguiente sin romper la UI
   */
  public reportAdFailure(campaignId: string): void {
    if (!campaignId) return;
    this.failedAdIds.add(campaignId);
    console.warn(`[AdService] Fallo reportado para el anuncio "${campaignId}". Rotando a respaldo.`);
    this.notifyListeners();
  }

  /**
   * Suscripción reactiva para componentes React
   */
  public subscribe(listener: AdChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.mergedCampaigns);
      } catch (err) {
        console.warn('[AdService] Error en listener:', err);
      }
    });
  }

  public cleanup(): void {
    if (this.realtimeChannel) {
      const supabase = getSupabaseClient();
      supabase?.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    this.listeners.clear();
    this.isInitialized = false;
  }
}
