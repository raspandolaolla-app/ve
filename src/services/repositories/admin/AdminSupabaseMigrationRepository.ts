// ==============================================================================
// RASPANDO LA OLLA — REPOSITORIO FRONTEND: CENTRO DE MIGRACIÓN SUPABASE
// ==============================================================================
// Comunica el panel administrativo de SUPER_ADMIN con las rutas protegidas
// del backend para el control y ejecución de migraciones de Supabase.
// ==============================================================================

import { getSupabaseClient } from '../../../lib/supabase/client';
import type {
  MigrationFullStatusResponse,
  TargetCredentialsInput,
  TargetValidationResult,
  DryRunPlan,
  BackupManifest,
  SmokeTestReport,
} from '../../../types/supabaseMigration';

export class AdminSupabaseMigrationRepository {
  private static getBaseUrl(): string {
    const customBackendUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim();
    if (customBackendUrl && customBackendUrl.startsWith('http')) {
      return customBackendUrl.replace(/\/+$/, '');
    }
    return '';
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

  private static handleFetchError(res: Response, fallbackMessage: string, responseText?: string): Error {
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 404 && contentType.includes('text/html')) {
      return new Error(
        'CAPACIDAD NO DISPONIBLE: El servidor backend no se encuentra activo o la ruta no existe en este host. ' +
        'En hosting estático (como GitHub Pages), las operaciones de migración requieren un backend Node.js enlazado (VITE_BACKEND_URL).'
      );
    }
    return new Error(fallbackMessage);
  }

  /**
   * Obtiene el estado consolidado del Centro de Migración
   */
  public static async getStatus(): Promise<MigrationFullStatusResponse> {
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/status`;

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw this.handleFetchError(res, errData.error || `Error ${res.status}: No se pudo obtener el estado`);
      }

      return await res.json();
    } catch (err: any) {
      if (err.message && err.message.includes('CAPACIDAD NO DISPONIBLE')) {
        throw err;
      }
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error(
          'CAPACIDAD NO DISPONIBLE: No se pudo establecer conexión de red con el backend de migración. ' +
          'Verifique si el servidor Node.js está corriendo o configure VITE_BACKEND_URL.'
        );
      }
      throw err;
    }
  }

  /**
   * Valida la conectividad con el Supabase destino sin mutar nada
   */
  public static async validateTarget(creds: TargetCredentialsInput): Promise<TargetValidationResult> {
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/validate-target`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.result) {
      throw this.handleFetchError(res, data.error || `Error ${res.status} validando destino`);
    }

    return data.result;
  }

  /**
   * Ejecuta el análisis Dry-Run
   */
  public static async runDryRun(creds: TargetCredentialsInput): Promise<DryRunPlan> {
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/dry-run`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw this.handleFetchError(res, errData.error || `Error ${res.status} ejecutando Dry-Run`);
    }

    const data = await res.json();
    return data.plan;
  }

  /**
   * Crea un respaldo previo obligatorio
   */
  public static async createBackup(): Promise<BackupManifest> {
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/create-backup`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw this.handleFetchError(res, errData.error || `Error ${res.status} creando respaldo`);
    }

    const data = await res.json();
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
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/execute-schema-migration`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw this.handleFetchError(res, data.error || data.message || `Error ${res.status} aplicando esquema`);
    }

    return data;
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
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/execute-data-migration`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw this.handleFetchError(res, data.error || data.message || `Error ${res.status} migrando datos`);
    }

    return data;
  }

  /**
   * Ejecuta la matriz de Smoke Tests
   */
  public static async runSmokeTests(creds: TargetCredentialsInput): Promise<SmokeTestReport> {
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/run-smoke-tests`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.report) {
      throw this.handleFetchError(res, data.error || `Error ${res.status} ejecutando Smoke Tests`);
    }

    return data.report;
  }

  /**
   * Activa el nuevo Supabase en producción con confirmación explícita
   */
  public static async switchProduction(
    creds: TargetCredentialsInput,
    confirmationCode: string
  ): Promise<{ success: boolean; message: string; activeProjectRef: string }> {
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/switch-production`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...creds, confirmationCode }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw this.handleFetchError(res, data.error || `Error ${res.status} activando producción`);
    }

    return data;
  }

  /**
   * Ejecuta un rollback seguro
   */
  public static async rollbackProduction(): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/rollback`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw this.handleFetchError(res, data.error || `Error ${res.status} ejecutando rollback`);
    }

    return data;
  }

  /**
   * Descarga el script consolidado de migraciones SQL
   */
  public static async downloadSqlBundle(): Promise<void> {
    const headers = await this.getAuthHeaders();
    const endpoint = `${this.getBaseUrl()}/api/admin/supabase-migration/download-sql-bundle`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      throw this.handleFetchError(res, 'Error al descargar script SQL de migraciones');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supabase_consolidated_migrations.sql';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}
