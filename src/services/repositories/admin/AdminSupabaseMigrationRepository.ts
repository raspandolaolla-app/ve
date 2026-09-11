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
        if (session?.user?.email) {
          headers['x-admin-email'] = session.user.email;
        }
      }
    } catch {
      // Ignorar errores en obtención de sesión
    }

    return headers;
  }

  /**
   * Obtiene el estado consolidado del Centro de Migración
   */
  public static async getStatus(): Promise<MigrationFullStatusResponse> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/supabase-migration/status', {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status}: No se pudo obtener el estado`);
    }

    return await res.json();
  }

  /**
   * Valida la conectividad con el Supabase destino sin mutar nada
   */
  public static async validateTarget(creds: TargetCredentialsInput): Promise<TargetValidationResult> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/supabase-migration/validate-target', {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.result) {
      throw new Error(data.error || `Error ${res.status} validando destino`);
    }

    return data.result;
  }

  /**
   * Ejecuta el análisis Dry-Run
   */
  public static async runDryRun(creds: TargetCredentialsInput): Promise<DryRunPlan> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/supabase-migration/dry-run', {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status} ejecutando Dry-Run`);
    }

    const data = await res.json();
    return data.plan;
  }

  /**
   * Crea un respaldo previo obligatorio
   */
  public static async createBackup(): Promise<BackupManifest> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/supabase-migration/create-backup', {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error ${res.status} creando respaldo`);
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
    const res = await fetch('/api/admin/supabase-migration/execute-schema-migration', {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Error ${res.status} aplicando esquema`);
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
    const res = await fetch('/api/admin/supabase-migration/execute-data-migration', {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Error ${res.status} migrando datos`);
    }

    return data;
  }

  /**
   * Ejecuta la matriz de Smoke Tests
   */
  public static async runSmokeTests(creds: TargetCredentialsInput): Promise<SmokeTestReport> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/supabase-migration/run-smoke-tests', {
      method: 'POST',
      headers,
      body: JSON.stringify(creds),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.report) {
      throw new Error(data.error || `Error ${res.status} ejecutando Smoke Tests`);
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
    const res = await fetch('/api/admin/supabase-migration/switch-production', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...creds, confirmationCode }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Error ${res.status} activando producción`);
    }

    return data;
  }

  /**
   * Ejecuta un rollback seguro
   */
  public static async rollbackProduction(): Promise<{ success: boolean; message: string }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/supabase-migration/rollback', {
      method: 'POST',
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Error ${res.status} ejecutando rollback`);
    }

    return data;
  }

  /**
   * Descarga el script consolidado de migraciones SQL
   */
  public static async downloadSqlBundle(): Promise<void> {
    const headers = await this.getAuthHeaders();
    const res = await fetch('/api/admin/supabase-migration/download-sql-bundle', {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      throw new Error('Error al descargar script SQL de migraciones');
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
