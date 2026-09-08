import { getSupabaseClient } from '../../lib/supabase/client';

export interface FinancialRuleConfig {
  winnerPercentage: number;
  platformFeePercentage: number;
  ruleName: string;
  description?: string;
}

const DEFAULT_FINANCIAL_RULES: FinancialRuleConfig = {
  winnerPercentage: 90.0,
  platformFeePercentage: 10.0,
  ruleName: 'GLOBAL_FINANCIAL_RULE',
  description: 'Regla financiera global de comisiones (90% ganador / 10% plataforma)',
};

let cachedRules: FinancialRuleConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60000; // 1 minuto de caché

export class FinancialRepository {
  /**
   * Obtiene la configuración financiera activa desde la base de datos (Fuente única de verdad).
   */
  public static async getActiveRules(forceRefresh = false): Promise<FinancialRuleConfig> {
    const now = Date.now();
    if (!forceRefresh && cachedRules && now - lastFetchTime < CACHE_TTL_MS) {
      return cachedRules;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return cachedRules || DEFAULT_FINANCIAL_RULES;
    }

    try {
      // Intentar primero por la RPC dedicada
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_financial_rules');
      if (!rpcErr && rpcData) {
        cachedRules = {
          winnerPercentage: Number(rpcData.winner_percentage ?? DEFAULT_FINANCIAL_RULES.winnerPercentage),
          platformFeePercentage: Number(rpcData.platform_fee_percentage ?? DEFAULT_FINANCIAL_RULES.platformFeePercentage),
          ruleName: String(rpcData.rule_name || DEFAULT_FINANCIAL_RULES.ruleName),
          description: rpcData.description,
        };
        lastFetchTime = now;
        return cachedRules;
      }

      // Fallback: consulta directa a la tabla financial_rules
      const { data: tableData, error: tableErr } = await supabase
        .from('financial_rules')
        .select('winner_percentage, platform_fee_percentage, rule_name, description')
        .eq('is_active', true)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tableErr && tableData) {
        cachedRules = {
          winnerPercentage: Number(tableData.winner_percentage ?? DEFAULT_FINANCIAL_RULES.winnerPercentage),
          platformFeePercentage: Number(tableData.platform_fee_percentage ?? DEFAULT_FINANCIAL_RULES.platformFeePercentage),
          ruleName: String(tableData.rule_name || DEFAULT_FINANCIAL_RULES.ruleName),
          description: tableData.description,
        };
        lastFetchTime = now;
        return cachedRules;
      }
    } catch (err) {
      console.warn('[FinancialRepository] Error obteniendo reglas financieras:', err);
    }

    return cachedRules || DEFAULT_FINANCIAL_RULES;
  }

  /**
   * Calcula el pozo ganador y la comisión según las reglas financieras centralizadas.
   */
  public static calculatePoolBreakdown(
    grossPool: number,
    rules: FinancialRuleConfig = DEFAULT_FINANCIAL_RULES
  ): { prizePool: number; platformFee: number } {
    const platformFee = Math.round((grossPool * (rules.platformFeePercentage / 100)) * 100) / 100;
    const prizePool = Math.round((grossPool - platformFee) * 100) / 100;
    return { prizePool, platformFee };
  }
}
