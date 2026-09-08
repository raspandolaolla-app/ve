// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE PUBLICIDAD (ADVERTISING ENGINE)
// ==============================================================================
// Fachada unificada con AdService para selección autoritativa de campañas:
// - Carga de assets locales (/public/ads/manifest.json) y Supabase
// - Control de prioridad, ventana temporal, dispositivo, orientación y juego
// - Respeto estricto a disponibilidad de juegos (Sección 41)
// - Fallback seguro garantizado
// ==============================================================================

import { AdService, type AdQueryOptions } from './AdService';
import type {
  AdvertisingCampaign,
  AdPlacement,
  AdDeviceType,
  AdOrientation,
} from '../../types/advertising';

export type AdEngineListener = (campaigns: AdvertisingCampaign[]) => void;

export class AdvertisingEngine {
  private static instance: AdvertisingEngine | null = null;
  private adService: AdService;

  private constructor() {
    this.adService = AdService.getInstance();
  }

  public static getInstance(): AdvertisingEngine {
    if (!this.instance) {
      this.instance = new AdvertisingEngine();
    }
    return this.instance;
  }

  public async init(): Promise<void> {
    await this.adService.init();
  }

  public async refreshCampaigns(): Promise<void> {
    await this.adService.refreshRemoteCampaigns();
  }

  public static getCurrentDeviceType(): AdDeviceType {
    return AdService.getCurrentDeviceType();
  }

  public static getCurrentOrientation(): AdOrientation {
    return AdService.getCurrentOrientation();
  }

  public getAdForPlacement(
    placement: AdPlacement,
    context?: {
      gameType?: string | null;
      deviceType?: AdDeviceType;
      orientation?: AdOrientation;
      isGameEnabled?: (gameId: string) => boolean;
    }
  ): AdvertisingCampaign | null {
    const opts: AdQueryOptions = {
      gameType: context?.gameType,
      deviceType: context?.deviceType,
      orientation: context?.orientation,
      isGameEnabled: context?.isGameEnabled,
    };
    return this.adService.getAdForPlacement(placement, opts);
  }

  public getAdsForPlacement(
    placement: AdPlacement,
    context?: {
      gameType?: string | null;
      deviceType?: AdDeviceType;
      orientation?: AdOrientation;
      isGameEnabled?: (gameId: string) => boolean;
    }
  ): AdvertisingCampaign[] {
    const opts: AdQueryOptions = {
      gameType: context?.gameType,
      deviceType: context?.deviceType,
      orientation: context?.orientation,
      isGameEnabled: context?.isGameEnabled,
    };
    return this.adService.getAdsForPlacement(placement, opts);
  }

  public subscribe(listener: AdEngineListener): () => void {
    return this.adService.subscribe(listener);
  }

  public cleanup(): void {
    this.adService.cleanup();
  }
}
