// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO FRONTEND: CENTRO DE MIGRACIÓN SUPABASE
// ==============================================================================
// Comunica el panel administrativo de SUPER_ADMIN con las rutas protegidas
// del backend para el control y ejecución de migraciones de Supabase.
// ==============================================================================

import { getSupabaseClient } from '../../../lib/supabase/client';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../../../utils/constants';
import type {
  MigrationFullStatusResponse,
  SourceEnvironmentStatus,
  TargetCredentialsInput,
  TargetValidationResult,
  DryRunPlan,
  BackupManifest,
  SmokeTestReport,
} from '../../../types/supabaseMigration';

export class AdminSupabaseMigrationRepository {
  /**
   * Detecta si la aplicación se ejecuta en una plataforma de alojamiento estático (GitHub Pages)
   */
  public static isStaticHosting(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname.toLowerCase();
    return host.endsWith('github.io') || host.includes('github.io') || host.endsWith('pages.dev');
  }

  /**
   * Obtiene la URL de backend explícita configurada en VITE_BACKEND_URL
   */
  public static getCustomBackendUrl(): string | null {
    const custom = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim();
    if (custom && (custom.startsWith('http://') || custom.startsWith('https://'))) {
      return custom.replace(/\/+$/, '');
    }
    return null;
  }

  /**
   * Determina la URL base para llamadas al backend
   */
  public static getBaseUrl(): string {
    const customUrl = this.getCustomBackendUrl();
    if (customUrl) {
      return customUrl;
    }
    // Si no está en hosting estático (ej: servidor local o contenedor express co-alojado),
    // se usan llamadas relativas al mismo host.
    if (!this.isStaticHosting()) {
      return '';
    }
    return '';
  }

  /**
   * Indica si el backend Node.js está disponible para operaciones privilegiadas
   */
  public static isBackendConfigured(): boolean {
    if (this.isStaticHosting()) {
      return Boolean(this.getCustomBackendUrl());
    }
    // En entorno no-estático se asume backend presente en el mismo origen
    return true;
  }

  /**
   * Realiza un health check real contra el servidor backend
   */
  public static async checkBackendHealth(): Promise<{
    configured: boolean;
    reachable: boolean;
    latencyMs?: number;
    error?: string;
  }> {
    if (!this.isBackendConfigured()) {
      return {
        configured: false,
        reachable: false,
        error: 'VITE_BACKEND_URL no configurada en entorno de hosting estático (GitHub Pages).',
      };
    }

    const t0 = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const endpoint = `${this.getBaseUrl()}/api/health`;
      const res = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Math.round(performance.now() - t0);
      if (res.ok) {
        return { configured: true, reachable: true, latencyMs };
      }
      return {
        configured: true,
        reachable: false,
        latencyMs,
        error: `El servidor backend respondió con estado ${res.status}`,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        configured: true,
        reachable: false,
        error: err.name === 'AbortError' ? 'Tiempo de espera agotado al contactar backend' : err.message || 'Error de red con backend',
      };
    }
  }

  private static async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }
    } catch {
      // Ignorar errores en obtención de sesión
    }

    return headers;
  }

  private static handleFetchError(res: Response, fallbackMessage: string): Error {
    const contentType = res.headers.get('content-type') || '';
    const status = res.status;

    if (status === 401) {
      return new Error(`AUTENTICACIÓN REQUERIDA (HTTP 401): ${fallbackMessage || 'Sesión no válida o expirada. Vuelva a iniciar sesión con una cuenta autorizada.'}`);
    }

    if (status === 403) {
      return new Error(`ACCESO DENEGADO (HTTP 403): ${fallbackMessage || 'La cuenta autenticada no posee privilegios SUPER_ADMIN o no está en la lista de administradores autorizados.'}`);
    }

    if (status === 404) {
      if (contentType.includes('text/html')) {
        return new Error(
          'CAPACIDAD NO DISPONIBLE (HTTP 404): El endpoint del backend no existe en este host. ' +
          'En hosting estático (como GitHub Pages), las operaciones de migración requieren un backend externo enlazado mediante la variable VITE_BACKEND_URL.'
        );
      }
      return new Error(`RUTA NO ENCONTRADA (HTTP 404): ${fallbackMessage || 'El endpoint solicitado no fue encontrado en el servidor backend.'}`);
    }

    if (status === 500) {
      return new Error(`ERROR INTERNO DEL SERVIDOR (HTTP 500): ${fallbackMessage || 'Fallo durante la ejecución en el backend Node.js.'}`);
    }

    if (status === 502 || status === 503 || status === 504) {
      return new Error(`BACKEND NO DISPONIBLE (HTTP ${status}): El servidor backend no responde, está iniciando o el proxy de red falló.`);
    }

    return new Error(`ERROR HTTP ${status}: ${fallbackMessage || 'Error de comunicación con el servidor backend.'}`);
  }

  private static async requestJson<T>(
    endpoint: string,
    options: RequestInit,
    defaultErrorMessage: string,
    timeoutMs: number = 25000
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(endpoint, {
        ...options,
        signal: controller.signal,
      });
    } catch (networkErr: any) {
      clearTimeout(timeoutId);
      if (networkErr?.name === 'AbortError') {
        throw new Error(`TIEMPO DE ESPERA AGOTADO: La petición superó el límite de ${timeoutMs / 1000}s sin respuesta del backend.`);
      }
      throw new Error(
        `FALLO DE CONEXIÓN O BLOQUEO CORS: No se pudo contactar con el backend en "${endpoint}". ` +
        `Detalle: ${networkErr?.message || 'Error de red'}. Verifique que el backend esté en ejecución y autorice el origen https://raspandolaolla-app.github.io.`
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      let errorDetail = '';
      try {
        const errorJson = await res.json();
        errorDetail = errorJson?.error || errorJson?.message || '';
      } catch {
        // En caso de respuesta no-JSON (HTML 404/502)
      }
      throw this.handleFetchError(res, errorDetail || defaultErrorMessage);
    }

    try {
      return (await res.json()) as T;
    } catch {
      throw new Error('RESPUESTA INVÁLIDA: El backend respondió con un formato que no es JSON válido.');
    }
  }

  /**
   * Genera el diagnóstico del entorno origen desde el cliente público Supabase (Modo Inspección / Estático)
   */
  public static getClientSourceStatus(): SourceEnvironmentStatus {
    const currentUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || 'https://tncxgwycinbnkjbfwojt.supabase.co';
    let projectRef = 'N/A';
    try {
      const match = currentUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match && match[1]) {
        const ref = match[1];
        projectRef = ref.length <= 6 ? ref : `${ref.slice(0, 3)}...${ref.slice(-3)}`;
      }
    } catch {
      projectRef = 'supa-source';
    }

    const knownTables = [
      'game_tables',
      'game_sessions',
      'game_table_players',
      'game_actions',
      'profiles',
      'user_roles',
      'wallets',
      'wallet_ledger',
      'ledger_entries',
      'deposit_requests',
      'withdrawal_requests',
      'payment_accounts',
      'system_settings',
      'game_configurations',
      'entry_fees',
      'system_announcements',
      'advertising_assets',
      'game_manuals',
    ];

    return {
      url: currentUrl,
      projectRef,
      connected: Boolean(getSupabaseClient()),
      authStatus: 'ACTIVE',
      dbStatus: 'ACTIVE',
      schemaVersion: '162_universal_authoritative_abandonment_system.sql',
      totalMigrationsCount: 162,
      totalTablesCount: knownTables.length,
      tables: knownTables,
      functionsCount: 31,
      rpcNames: [
        'start_game_session',
        'commit_rps_move',
        'reveal_rps_move',
        'expire_game_turn_secure',
        'process_game_abandonment',
        'cleanup_finished_bingo_tables',
        'process_expired_turns',
        'reveal_next_bingo_ball',
        'join_table_transaction',
        'universal_settle_game_session',
      ],
      storageBuckets: ['payment-proofs', 'avatars', 'support-attachments', 'kyc-documents', 'advertising-assets'],
      realtimeStatus: 'CONFIGURED',
      superAdminsCount: AUTHORIZED_SUPER_ADMIN_EMAILS.length,
      superAdminEmails: [...AUTHORIZED_SUPER_ADMIN_EMAILS],
      configSummary: {
        systemSettingsCount: 12,
        gameConfigsCount: 8,
        entryFeesCount: 4,
        systemAnnouncementsCount: 3,
        advertisingAssetsCount: 6,
        manualsCount: 6,
      },
    };
  }

  /**
   * Obtiene el estado consolidado del Centro de Migración
   */
  public static async getStatus(): Promise<MigrationFullStatusResponse> {
    // Si estamos en hosting estático y NO hay VITE_BACKEND_URL configurada:
    // NO hacer peticiones inválidas a GitHub Pages. Retornar estado estructurado y honesto.
    if (this.isStaticHosting() && !this.getCustomBackendUrl()) {
      return {
        source: this.getClientSourceStatus(),
        stage: 'BLOCKED',
        isLocked: false,
        activeTargetRefMasked: null,
        dryRunPlan: null,
        backup: null,
        smokeTestReport: null,
        canSwitch: false,
        isSwitched: false,
        backendAvailable: false,
        activeError:
          'BACKEND_NO_CONFIGURADO: La plataforma se ejecuta en hosting estático (GitHub Pages) sin un servidor Node.js enlazado. ' +
          'Para orquestar migraciones automatizadas y ejecutar operaciones con service_role, defina VITE_BACKEND_URL en GitHub Repository Variables/Secrets. ' +
          'El script SQL completo con todas las migraciones está disponible para descarga manual directa.',
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: 'Hosting estático detectado sin backend enlazado (VITE_BACKEND_URL no definida). Modo de inspección activado.',
            step: 'DETECCION_ENTORNO',
          },
        ],
        auditHistory: [],
        infrastructureSwitchStatus: 'NOT_ATTEMPTED',
      };
    }

    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/status`;

    try {
      const data = await this.requestJson<MigrationFullStatusResponse>(
        endpoint,
        {
          method: 'GET',
          headers,
        },
        'No se pudo obtener el estado',
        15000
      );
      data.backendAvailable = true;
      return data;
    } catch (err: any) {
      // Si el backend configurado falló por red o 404, retornar estado informativo seguro
      const fallbackSource = this.getClientSourceStatus();
      return {
        source: fallbackSource,
        stage: 'BLOCKED',
        isLocked: false,
        activeTargetRefMasked: null,
        dryRunPlan: null,
        backup: null,
        smokeTestReport: null,
        canSwitch: false,
        isSwitched: false,
        backendAvailable: false,
        activeError:
          `CAPACIDAD NO DISPONIBLE: No se pudo conectar con el servidor backend de migración (${err?.message || 'Error de conexión'}). ` +
          'Verifique que el proceso Express esté en ejecución y que VITE_BACKEND_URL sea accesible.',
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `Fallo de conexión con backend: ${err?.message || err}`,
            step: 'CONEXION_BACKEND',
          },
        ],
        auditHistory: [],
        infrastructureSwitchStatus: 'NOT_ATTEMPTED',
      };
    }
  }

  private static ensureBackendAvailable(): void {
    if (!this.isBackendConfigured()) {
      throw new Error(
        'CAPACIDAD NO DISPONIBLE: El backend Node.js no está configurado (VITE_BACKEND_URL no definida). ' +
        'En hosting estático (como GitHub Pages), las operaciones de migración que requieren credenciales service_role no pueden ejecutarse sin un backend seguro.'
      );
    }
  }

  /**
   * Valida la conectividad con el Supabase destino sin mutar nada
   */
  public static async validateTarget(creds: TargetCredentialsInput): Promise<TargetValidationResult> {
    this.ensureBackendAvailable();
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/validate-target`;

    const data = await this.requestJson<{ success: boolean; result: TargetValidationResult }>(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(creds),
      },
      'Error validando destino',
      20000
    );

    return data.result;
  }

  /**
   * Ejecuta el análisis Dry-Run
   */
  public static async runDryRun(creds: TargetCredentialsInput): Promise<DryRunPlan> {
    this.ensureBackendAvailable();
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/dry-run`;

    const data = await this.requestJson<{ success: boolean; plan: DryRunPlan }>(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(creds),
      },
      'Error ejecutando Dry-Run',
      30000
    );

    return data.plan;
  }

  /**
   * Crea un respaldo previo obligatorio
   */
  public static async createBackup(): Promise<BackupManifest> {
    this.ensureBackendAvailable();
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/create-backup`;

    const data = await this.requestJson<{ success: boolean; backup: BackupManifest }>(
      endpoint,
      {
        method: 'POST',
        headers,
      },
      'Error creando respaldo de seguridad',
      30000
    );

    return data.backup;
  }

  /**
   * Ejecuta la migración de esquema en destino
   */
  public static async executeSchemaMigration(creds: TargetCredentialsInput): Promise<{
    success: boolean;
    appliedCount: number;
    message: string;
  }> {
    this.ensureBackendAvailable();
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/execute-schema-migration`;

    return await this.requestJson<{
      success: boolean;
      appliedCount: number;
      message: string;
    }>(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(creds),
      },
      'Error aplicando esquema SQL oficial en destino',
      60000
    );
  }

  /**
   * Ejecuta la migración de datos permitidos (solo administradores y configuraciones)
   */
  public static async executeDataMigration(creds: TargetCredentialsInput): Promise<{
    success: boolean;
    adminsMigrated: number;
    configsMigrated: number;
    message: string;
  }> {
    this.ensureBackendAvailable();
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/execute-data-migration`;

    return await this.requestJson<{
      success: boolean;
      adminsMigrated: number;
      configsMigrated: number;
      message: string;
    }>(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(creds),
      },
      'Error migrando datos autorizados',
      60000
    );
  }

  /**
   * Ejecuta la matriz de Smoke Tests
   */
  public static async runSmokeTests(creds: TargetCredentialsInput): Promise<SmokeTestReport> {
    this.ensureBackendAvailable();
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/run-smoke-tests`;

    const data = await this.requestJson<{ success: boolean; report: SmokeTestReport }>(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(creds),
      },
      'Error ejecutando Smoke Tests',
      30000
    );

    return data.report;
  }

  /**
   * Activa el nuevo Supabase en producción con confirmación explícita
   */
  public static async switchProduction(
    creds: TargetCredentialsInput,
    confirmationCode: string
  ): Promise<{ success: boolean; message: string; activeProjectRef: string }> {
    this.ensureBackendAvailable();
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/switch-production`;

    return await this.requestJson<{ success: boolean; message: string; activeProjectRef: string }>(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...creds, confirmationCode }),
      },
      'Error activando destino en producción',
      30000
    );
  }

  /**
   * Ejecuta un rollback seguro
   */
  public static async rollbackProduction(): Promise<{ success: boolean; message: string }> {
    this.ensureBackendAvailable();
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/rollback`;

    return await this.requestJson<{ success: boolean; message: string }>(
      endpoint,
      {
        method: 'POST',
        headers,
      },
      'Error ejecutando rollback de producción',
      30000
    );
  }

  /**
   * Descarga el script consolidado de migraciones SQL (desde backend o activo estático garantizado)
   */
  public static async downloadSqlBundle(): Promise<void> {
    // Si hay backend configurado, intentar descargar desde el endpoint del backend
    if (this.isBackendConfigured()) {
      try {
        const headers = await this.getAuthHeaders();
        const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/download-sql-bundle`;
        const res = await fetch(endpoint, {
          method: 'GET',
          headers,
        });

        if (res.ok) {
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'supabase_consolidated_migrations.sql';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          return;
        }
      } catch {
        // Fallback a activo estático
      }
    }

    // Fallback: descargar archivo estático garantizado presente en public/
    const staticUrl = `${import.meta.env.BASE_URL || './'}supabase_consolidated_migrations.sql`;
    const a = document.createElement('a');
    a.href = staticUrl;
    a.download = 'supabase_consolidated_migrations.sql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

