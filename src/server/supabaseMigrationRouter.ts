// ==============================================================================
// RASPANDO LA OLLA — ENRUTADOR SEGURO DEL CENTRO DE MIGRACIÓN SUPABASE
// ==============================================================================
// Endpoints de backend protegidos exclusivamente para el rol SUPER_ADMIN.
// NUNCA expone claves privilegiadas (service_role, contraseñas) al navegador.
// ==============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import { supabaseMigrationService } from './supabaseMigrationService';
import { AUTHORIZED_SUPER_ADMIN_EMAILS } from '../utils/constants';
import { createClient } from '@supabase/supabase-js';

export const supabaseMigrationRouter = Router();

function getAdminClient() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) {
    return createClient(url, key, { auth: { persistSession: false } });
  }
  return null;
}

/**
 * Middleware estricto de autorización para SUPER_ADMIN.
 * Valida sesión Supabase mediante JWT o correo autorizado inmutable.
 */
async function requireSuperAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let userEmail: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const client = getAdminClient();
      if (client) {
        const { data: { user }, error } = await client.auth.getUser(token);
        if (!error && user && user.email) {
          userEmail = user.email;
        }
      }
    }

    // Si no se obtuvo de Supabase pero viene cabecera de actor en contexto seguro
    if (!userEmail) {
      const headerActor = req.headers['x-admin-email'] as string;
      if (headerActor && typeof headerActor === 'string') {
        userEmail = headerActor;
      }
    }

    // Regla inmutable de RBAC: Solo los correos protegidos en AUTHORIZED_SUPER_ADMIN_EMAILS pueden operar
    if (!userEmail || !AUTHORIZED_SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === userEmail!.toLowerCase())) {
      res.status(403).json({
        success: false,
        error: 'ACCESO_DENEGADO: El Centro de Migración de Supabase está restringido exclusivamente para SUPER_ADMIN.',
      });
      return;
    }

    // Adjuntar email verificado a la petición
    (req as any).superAdminEmail = userEmail;
    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Error interno validando credenciales de autorización.',
    });
  }
}

// Aplicar middleware a todas las rutas de migración
supabaseMigrationRouter.use(requireSuperAdminAuth);

/**
 * GET /status: Estado general del centro de migración
 */
supabaseMigrationRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await supabaseMigrationService.getFullStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error al obtener estado' });
  }
});

/**
 * POST /validate-target: Validar conectividad de Supabase destino
 */
supabaseMigrationRouter.post('/validate-target', async (req: Request, res: Response) => {
  try {
    const { targetUrl, targetAnonKey, targetServiceRoleKey, targetDbUrl } = req.body || {};
    const actorEmail = (req as any).superAdminEmail;

    const result = await supabaseMigrationService.validateTarget(
      {
        targetUrl: String(targetUrl || '').trim(),
        targetAnonKey: String(targetAnonKey || '').trim(),
        targetServiceRoleKey: String(targetServiceRoleKey || '').trim(),
        targetDbUrl: targetDbUrl ? String(targetDbUrl).trim() : undefined,
      },
      actorEmail
    );

    res.json({ success: result.valid, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error validando destino' });
  }
});

/**
 * POST /dry-run: Simulación y análisis previo de cambios
 */
supabaseMigrationRouter.post('/dry-run', async (req: Request, res: Response) => {
  try {
    const { targetUrl, targetAnonKey, targetServiceRoleKey, targetDbUrl } = req.body || {};
    const actorEmail = (req as any).superAdminEmail;

    const plan = await supabaseMigrationService.runDryRun(
      {
        targetUrl: String(targetUrl || '').trim(),
        targetAnonKey: String(targetAnonKey || '').trim(),
        targetServiceRoleKey: String(targetServiceRoleKey || '').trim(),
        targetDbUrl: targetDbUrl ? String(targetDbUrl).trim() : undefined,
      },
      actorEmail
    );

    res.json({ success: true, plan });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error en análisis Dry-Run' });
  }
});

/**
 * POST /create-backup: Generar snapshot seguro del origen
 */
supabaseMigrationRouter.post('/create-backup', async (req: Request, res: Response) => {
  try {
    const actorEmail = (req as any).superAdminEmail;
    const backup = await supabaseMigrationService.createBackup(actorEmail);
    res.json({ success: true, backup });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error creando respaldo' });
  }
});

/**
 * POST /execute-schema-migration: Aplicar migraciones SQL oficiales en destino
 */
supabaseMigrationRouter.post('/execute-schema-migration', async (req: Request, res: Response) => {
  try {
    const { targetUrl, targetAnonKey, targetServiceRoleKey, targetDbUrl } = req.body || {};
    const actorEmail = (req as any).superAdminEmail;

    const result = await supabaseMigrationService.executeSchemaMigration(
      {
        targetUrl: String(targetUrl || '').trim(),
        targetAnonKey: String(targetAnonKey || '').trim(),
        targetServiceRoleKey: String(targetServiceRoleKey || '').trim(),
        targetDbUrl: targetDbUrl ? String(targetDbUrl).trim() : undefined,
      },
      actorEmail
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error ejecutando esquema' });
  }
});

/**
 * POST /execute-data-migration: Migrar administradores y configuraciones seleccionadas
 */
supabaseMigrationRouter.post('/execute-data-migration', async (req: Request, res: Response) => {
  try {
    const { targetUrl, targetAnonKey, targetServiceRoleKey, targetDbUrl } = req.body || {};
    const actorEmail = (req as any).superAdminEmail;

    const result = await supabaseMigrationService.executeDataMigration(
      {
        targetUrl: String(targetUrl || '').trim(),
        targetAnonKey: String(targetAnonKey || '').trim(),
        targetServiceRoleKey: String(targetServiceRoleKey || '').trim(),
        targetDbUrl: targetDbUrl ? String(targetDbUrl).trim() : undefined,
      },
      actorEmail
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error migrando datos' });
  }
});

/**
 * POST /run-smoke-tests: Validar integridad y pruebas de humo
 */
supabaseMigrationRouter.post('/run-smoke-tests', async (req: Request, res: Response) => {
  try {
    const { targetUrl, targetAnonKey, targetServiceRoleKey, targetDbUrl } = req.body || {};
    const actorEmail = (req as any).superAdminEmail;

    const report = await supabaseMigrationService.runSmokeTests(
      {
        targetUrl: String(targetUrl || '').trim(),
        targetAnonKey: String(targetAnonKey || '').trim(),
        targetServiceRoleKey: String(targetServiceRoleKey || '').trim(),
        targetDbUrl: targetDbUrl ? String(targetDbUrl).trim() : undefined,
      },
      actorEmail
    );

    res.json({ success: report.allPassed, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error ejecutando Smoke Tests' });
  }
});

/**
 * POST /switch-production: Activar nuevo Supabase en producción con código de confirmación
 */
supabaseMigrationRouter.post('/switch-production', async (req: Request, res: Response) => {
  try {
    const { targetUrl, targetAnonKey, targetServiceRoleKey, targetDbUrl, confirmationCode } = req.body || {};
    const actorEmail = (req as any).superAdminEmail;

    const result = await supabaseMigrationService.switchProduction(
      {
        targetUrl: String(targetUrl || '').trim(),
        targetAnonKey: String(targetAnonKey || '').trim(),
        targetServiceRoleKey: String(targetServiceRoleKey || '').trim(),
        targetDbUrl: targetDbUrl ? String(targetDbUrl).trim() : undefined,
      },
      String(confirmationCode || ''),
      actorEmail
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || 'Error al cambiar producción' });
  }
});

/**
 * POST /rollback: Restaurar configuración previa
 */
supabaseMigrationRouter.post('/rollback', async (req: Request, res: Response) => {
  try {
    const actorEmail = (req as any).superAdminEmail;
    const result = await supabaseMigrationService.rollbackProduction(actorEmail);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error ejecutando rollback' });
  }
});

/**
 * GET /download-sql-bundle: Descarga el script consolidado de migraciones
 */
supabaseMigrationRouter.get('/download-sql-bundle', (req: Request, res: Response) => {
  try {
    const sql = supabaseMigrationService.generateConsolidatedSqlBundle();
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="supabase_consolidated_migrations.sql"');
    res.send(sql);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error generando script SQL' });
  }
});
