// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO DE TASA OFICIAL BCV Y CONVERSIÓN INFORMATIVA USD
// ==============================================================================

import { getSupabaseClient } from '../../lib/supabase/client';

export interface BcvRateInfo {
  rate: number;
  updatedAt: string; // ISO String
  formattedTimestamp: string;
  source: string;
  status: 'UPDATED' | 'OUTDATED' | 'ERROR';
  errorMessage?: string;
}

const LOCAL_STORAGE_KEY = 'bcv_official_rate_info_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutos
const DEFAULT_BASELINE_RATE = 791.67; // Tasa base oficial de referencia en Venezuela

let memoryCache: BcvRateInfo | null = null;
let lastFetchPromise: Promise<BcvRateInfo> | null = null;

export class BcvRepository {
  /**
   * Obtiene la tasa oficial del BCV vigente desde caché, API pública oficial o Supabase DB.
   * Auto-refresca si la tasa guardada tiene más de 60 minutos.
   */
  public static async getBcvRate(forceRefresh: boolean = false): Promise<BcvRateInfo> {
    // 1. Usar caché en memoria si es reciente y no se fuerza refresco
    if (!forceRefresh && memoryCache && (Date.now() - new Date(memoryCache.updatedAt).getTime()) < CACHE_TTL_MS) {
      return memoryCache;
    }

    // 2. Si ya hay una petición en curso, reutilizarla para evitar peticiones duplicadas
    if (lastFetchPromise) {
      return lastFetchPromise;
    }

    lastFetchPromise = this.resolveBcvRate(forceRefresh).finally(() => {
      lastFetchPromise = null;
    });

    return lastFetchPromise;
  }

  private static async resolveBcvRate(forceRefresh: boolean): Promise<BcvRateInfo> {
    // A. Verificar caché local en localStorage
    const stored = this.getStoredCache();
    const isStoredFresh = stored && (Date.now() - new Date(stored.updatedAt).getTime()) < CACHE_TTL_MS;

    if (!forceRefresh && isStoredFresh && stored) {
      memoryCache = stored;
      return stored;
    }

    // B. Intentar consultar API oficial en tiempo real (dolarapi / bcv)
    try {
      const liveRate = await this.fetchLiveBcvApi();
      if (liveRate && liveRate.rate > 0) {
        const rateInfo: BcvRateInfo = {
          rate: liveRate.rate,
          updatedAt: liveRate.updatedAt || new Date().toISOString(),
          formattedTimestamp: this.formatDate(liveRate.updatedAt || new Date().toISOString()),
          source: 'Banco Central de Venezuela',
          status: 'UPDATED',
        };

        // Guardar en memoria, localStorage y backend Supabase DB
        memoryCache = rateInfo;
        this.setStoredCache(rateInfo);
        this.saveRateToDatabase(rateInfo).catch((err) => {
          console.warn('[BcvRepository] No se pudo guardar la tasa en Supabase DB:', err);
        });

        return rateInfo;
      }
    } catch (err) {
      console.warn('[BcvRepository] Error al obtener tasa de API oficial BCV:', err);
    }

    // C. Si la API oficial no responde, consultar último valor válido en Supabase DB
    try {
      const dbRate = await this.fetchRateFromDatabase();
      if (dbRate) {
        const isDbFresh = (Date.now() - new Date(dbRate.updatedAt).getTime()) < CACHE_TTL_MS;
        const rateInfo: BcvRateInfo = {
          ...dbRate,
          status: isDbFresh ? 'UPDATED' : 'OUTDATED',
          errorMessage: isDbFresh
            ? undefined
            : `No fue posible actualizar la tasa BCV. Última tasa disponible: ${this.formatRateNumber(dbRate.rate)} Bs.`,
        };
        memoryCache = rateInfo;
        this.setStoredCache(rateInfo);
        return rateInfo;
      }
    } catch (dbErr) {
      console.warn('[BcvRepository] Error al consultar tasa guardada en Supabase DB:', dbErr);
    }

    // D. Si hay caché guardado previo (aunque esté vencido), usarlo con estado OUTDATED
    if (stored) {
      const rateInfo: BcvRateInfo = {
        ...stored,
        status: 'OUTDATED',
        errorMessage: `No fue posible actualizar la tasa BCV. Última tasa disponible: ${this.formatRateNumber(stored.rate)} Bs.`,
      };
      memoryCache = rateInfo;
      return rateInfo;
    }

    // E. Fallback seguro de referencia inicial si el sistema inicia por primera vez sin red
    const fallbackRateInfo: BcvRateInfo = {
      rate: DEFAULT_BASELINE_RATE,
      updatedAt: new Date().toISOString(),
      formattedTimestamp: this.formatDate(new Date().toISOString()),
      source: 'Banco Central de Venezuela',
      status: 'OUTDATED',
      errorMessage: `No fue posible actualizar la tasa BCV. Última tasa disponible: ${this.formatRateNumber(DEFAULT_BASELINE_RATE)} Bs.`,
    };
    memoryCache = fallbackRateInfo;
    this.setStoredCache(fallbackRateInfo);
    return fallbackRateInfo;
  }

  /**
   * Consulta el endpoint oficial de la tasa de cambio del Banco Central de Venezuela.
   */
  private static async fetchLiveBcvApi(): Promise<{ rate: number; updatedAt?: string } | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const data = await response.json();
      const numRate = Number(data.promedio || data.price || data.rate);

      if (!isNaN(numRate) && numRate > 0) {
        return {
          rate: numRate,
          updatedAt: data.fechaActualizacion || new Date().toISOString(),
        };
      }
      return null;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  }

  /**
   * Lee la tasa persistida en la tabla `system_settings` en Supabase.
   */
  private static async fetchRateFromDatabase(): Promise<BcvRateInfo | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('system_settings')
      .select('value, updated_at')
      .eq('key', 'bcv_rate')
      .maybeSingle();

    if (error || !data || !data.value) return null;

    const val = data.value;
    const rate = Number(val.rate);
    if (isNaN(rate) || rate <= 0) return null;

    const updatedAt = val.updated_at || data.updated_at || new Date().toISOString();

    return {
      rate,
      updatedAt,
      formattedTimestamp: this.formatDate(updatedAt),
      source: val.source || 'Banco Central de Venezuela',
      status: val.status || 'UPDATED',
    };
  }

  /**
   * Guarda o actualiza la tasa BCV en la tabla `system_settings` mediante RPC o upsert.
   */
  private static async saveRateToDatabase(info: BcvRateInfo): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      await supabase.rpc('update_bcv_rate', {
        p_rate: info.rate,
        p_source: info.source,
        p_status: info.status,
      });
    } catch {
      // Intento directo por si RPC no está desplegada aún
      await supabase.from('system_settings').upsert({
        key: 'bcv_rate',
        value: {
          rate: info.rate,
          updated_at: info.updatedAt,
          source: info.source,
          status: info.status,
        },
        is_public: true,
        description: 'Tasa de Cambio Oficial del Banco Central de Venezuela (BCV)',
        updated_at: new Date().toISOString(),
      });
    }
  }

  private static getStoredCache(): BcvRateInfo | null {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.rate === 'number' && parsed.rate > 0) {
        return parsed;
      }
    } catch {
      // Ignorar error de parsing
    }
    return null;
  }

  private static setStoredCache(info: BcvRateInfo): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(info));
    } catch {
      // Ignorar cuota excedida
    }
  }

  /**
   * Formatea fecha a string legible: DD/MM/YYYY HH:mm
   */
  public static formatDate(isoStr: string): string {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
      return isoStr;
    }
  }

  /**
   * Formatea un valor numérico de la tasa (ej: 791,67)
   */
  public static formatRateNumber(val: number): string {
    return val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Calcula el equivalente en USD a partir de un monto en Bolívares y una tasa BCV.
   * Retorna string formateado secundario. Ejemplo: `≈ $20,00 USD`
   */
  public static formatUsdEquivalent(amountBs: number, bcvRate?: number): string {
    const rate = bcvRate || memoryCache?.rate || DEFAULT_BASELINE_RATE;
    if (isNaN(amountBs) || amountBs < 0 || !rate || rate <= 0) {
      return '≈ $0,00 USD';
    }
    const usd = amountBs / rate;
    const formatted = usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `≈ $${formatted} USD`;
  }

  /**
   * Retorna sólo el monto USD compacto. Ejemplo: `$20.00 USD`
   */
  public static formatUsdCompact(amountBs: number, bcvRate?: number): string {
    const rate = bcvRate || memoryCache?.rate || DEFAULT_BASELINE_RATE;
    if (isNaN(amountBs) || amountBs < 0 || !rate || rate <= 0) {
      return '$0.00 USD';
    }
    const usd = amountBs / rate;
    const formatted = usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `$${formatted} USD`;
  }
}
