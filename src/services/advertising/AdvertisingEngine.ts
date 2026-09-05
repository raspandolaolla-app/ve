// ==============================================================================
// RASPANDO LA OLLA — MOTOR DE PUBLICIDAD (ADVERTISING ENGINE)
// ==============================================================================
// - Selección autoritativa de campañas por prioridad, ventana temporal, dispositivo, orientación y juego.
// - Sincronización instantánea mediante Supabase Realtime (0ms).
// - Aislamiento total: Fallos de assets nunca rompen vistas ni motores de juego.
// ==============================================================================

import { AdvertisingRepository } from './AdvertisingRepository';
import { getSupabaseClient } from '../../lib/supabase/client';
import type {
  AdvertisingCampaign,
  AdPlacement,
  AdDeviceType,
  AdOrientation,
} from '../../types/advertising';

export type AdEngineListener = (campaigns: AdvertisingCampaign[]) => void;

export class AdvertisingEngine {
  private static instance: AdvertisingEngine | null = null;
  private activeCampaigns: AdvertisingCampaign[] = [];
  private listeners: Set<AdEngineListener> = new Set();
  private isInitialized = false;
  private realtimeChannel: any = null;
  private reconcileTimer: any = null;

  private constructor() {
    this.setupWindowListeners();
  }

  public static getInstance(): AdvertisingEngine {
    if (!this.instance) {
      this.instance = new AdvertisingEngine();
    }
    return this.instance;
  }

  /**
   * Inicializa el motor de publicidad cargando campañas y suscribiéndose a Realtime
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    await this.refreshCampaigns();
    this.subscribeRealtime();
  }

  /**
   * Recarga las campañas activas desde Supabase
   */
  public async refreshCampaigns(): Promise<void> {
    try {
      const campaigns = await AdvertisingRepository.getActiveCampaigns();
      this.activeCampaigns = campaigns;
      this.notifyListeners();
    } catch (err) {
      console.warn('[AdvertisingEngine] Error refrescando campañas:', err);
    }
  }

  /**
   * Suscribe a cambios en tiempo real con debounce
   */
  private subscribeRealtime(): void {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
    }

    this.realtimeChannel = supabase
      .channel(`advertising_engine_realtime_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'advertising_campaigns' },
        () => {
          this.debouncedReconcile();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'advertising_assets' },
        () => {
          this.debouncedReconcile();
        }
      )
      .subscribe();
  }

  private debouncedReconcile(): void {
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer);
    }
    this.reconcileTimer = setTimeout(() => {
      this.refreshCampaigns();
    }, 250);
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
   * Detecta el tipo de dispositivo actual del cliente
   */
  public static getCurrentDeviceType(): AdDeviceType {
    if (typeof window === 'undefined') return 'DESKTOP';
    const width = window.innerWidth;
    if (width < 768) return 'MOBILE';
    if (width <= 1024) return 'TABLET';
    return 'DESKTOP';
  }

  /**
   * Detecta la orientación de pantalla del cliente
   */
  public static getCurrentOrientation(): AdOrientation {
    if (typeof window === 'undefined') return 'LANDSCAPE';
    if (window.innerWidth < window.innerHeight) return 'PORTRAIT';
    return 'LANDSCAPE';
  }

  /**
   * Evalúa si una campaña cumple con los criterios de visibilidad
   */
  public static isCampaignEligible(
    campaign: AdvertisingCampaign,
    params: {
      placement: AdPlacement;
      gameType?: string | null;
      deviceType?: AdDeviceType;
      orientation?: AdOrientation;
      currentTimestamp?: number;
    }
  ): boolean {
    if (!campaign || !campaign.active) return false;

    // 1. Placement Check (Normalizado)
    const targetPlacement = String(params.placement || '').toUpperCase();
    const campPlacement = String(campaign.placement || '').toUpperCase();
    if (targetPlacement !== campPlacement) {
      // Soporte para comodín 'ALL' o equivalencias
      if (campPlacement !== 'ALL') {
        return false;
      }
    }

    // 2. Ventana de Tiempo (start_at y end_at)
    const now = params.currentTimestamp || Date.now();
    if (campaign.startAt) {
      const startTime = new Date(campaign.startAt).getTime();
      if (!isNaN(startTime) && now < startTime) return false;
    }
    if (campaign.endAt) {
      const endTime = new Date(campaign.endAt).getTime();
      if (!isNaN(endTime) && now > endTime) return false;
    }

    // 3. Juego específico (si aplica)
    if (campaign.gameType) {
      const targetGame = params.gameType?.toLowerCase();
      const campGame = campaign.gameType.toLowerCase();
      if (targetGame && targetGame !== campGame && campGame !== 'all') {
        return false;
      }
    }

    // 4. Tipo de Dispositivo
    const clientDevice = params.deviceType || this.getCurrentDeviceType();
    if (campaign.deviceType && campaign.deviceType !== 'ALL') {
      if (campaign.deviceType !== clientDevice) {
        return false;
      }
    }

    // 5. Orientación de Pantalla
    const clientOrientation = params.orientation || this.getCurrentOrientation();
    if (campaign.orientation && campaign.orientation !== 'ANY') {
      if (campaign.orientation !== clientOrientation) {
        return false;
      }
    }

    return true;
  }

  /**
   * Selecciona la mejor campaña publicitaria para una ubicación y contexto específicos
   */
  public getAdForPlacement(
    placement: AdPlacement,
    context?: {
      gameType?: string | null;
      deviceType?: AdDeviceType;
      orientation?: AdOrientation;
    }
  ): AdvertisingCampaign | null {
    const deviceType = context?.deviceType || AdvertisingEngine.getCurrentDeviceType();
    const orientation = context?.orientation || AdvertisingEngine.getCurrentOrientation();
    const gameType = context?.gameType || null;
    const now = Date.now();

    const eligibleCampaigns = this.activeCampaigns.filter((c) =>
      AdvertisingEngine.isCampaignEligible(c, {
        placement,
        gameType,
        deviceType,
        orientation,
        currentTimestamp: now,
      })
    );

    if (eligibleCampaigns.length === 0) return null;

    // Ordenar estrictamente por prioridad DESC, luego por fecha de creación DESC
    eligibleCampaigns.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return eligibleCampaigns[0];
  }

  /**
   * Suscribe un componente UI a actualizaciones de campañas
   */
  public subscribe(listener: AdEngineListener): () => void {
    this.listeners.add(listener);
    listener(this.activeCampaigns);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.activeCampaigns);
      } catch (err) {
        console.warn('[AdvertisingEngine] Error en listener de anuncios:', err);
      }
    });
  }

  public cleanup(): void {
    if (this.realtimeChannel) {
      const supabase = getSupabaseClient();
      supabase?.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    if (this.reconcileTimer) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    this.listeners.clear();
    this.isInitialized = false;
  }
}
