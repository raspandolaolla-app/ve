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
import { TargetCredentialsInput } from '../types/supabaseMigration';

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
 * Middleware estricto de autorización para SUPER_ADMIN (5 capas de verificación).
 * 1. Comprobación de cabecera Authorization: Bearer <token>.
 * 2. Validación criptográfica del JWT con Supabase Auth.
 * 3. Identidad obtenida exclusivamente del token validado por el servidor.
 * 4. Comprobación autoritativa en tabla profiles: rol SUPER_ADMIN y cuenta activa.
 * 5. Verificación secundaria inmutable en AUTHORIZED_SUPER_ADMIN_EMAILS.
 * Queda PROHIBIDO confiar en cabeceras cliente como x-admin-email, body, cookies o parámetros URL.
 */
async function requireSuperAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'NO_AUTENTICADO: Se requiere un token JWT válido de Supabase (Authorization: Bearer <token>).',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token || token.trim() === '') {
      res.status(401).json({
        success: false,
        error: 'TOKEN_VACIO: Token de autorización no provisto.',
      });
      return;
    }

    const client = getAdminClient();
    if (!client) {
      res.status(500).json({
        success: false,
        error: 'ERROR_CONFIGURACION_SERVIDOR: Cliente administrativo de Supabase no disponible en el backend.',
      });
      return;
    }

    // 1 & 2. Validar token e identidad con Supabase Auth
    const { data: authData, error: authErr } = await client.auth.getUser(token);
    if (authErr || !authData || !authData.user || !authData.user.email) {
      res.status(401).json({
        success: false,
        error: 'TOKEN_INVALIDO: Sesión de Supabase inválida o expirada.',
      });
      return;
    }

    const authenticatedEmail = authData.user.email.toLowerCase().trim();
    const userId = authData.user.id;

    // 3 & 4. Comprobar perfil en base de datos autoritativa
    const { data: profile, error: profileErr } = await client
      .from('profiles')
      .select('id, email, role, is_active, account_status')
      .eq('id', userId)
      .maybeSingle();

    if (profileErr || !profile) {
      res.status(403).json({
        success: false,
        error: 'PERFIL_NO_AUTORIZADO: No se encontró un perfil registrado en el sistema para el usuario autenticado.',
      });
      return;
    }

    if (profile.role !== 'SUPER_ADMIN') {
      res.status(403).json({
        success: false,
        error: 'ACCESO_DENEGADO: La cuenta autenticada no posee el rol SUPER_ADMIN en la base de datos.',
      });
      return;
    }

    if (profile.is_active === false || profile.account_status === 'SUSPENDED') {
      res.status(403).json({
        success: false,
        error: 'CUENTA_SUSPENDIDA: La cuenta administrativa se encuentra inactiva o suspendida.',
      });
      return;
    }

    // 5. Allowlist inmutable de defensa en profundidad
    const isAllowlisted = AUTHORIZED_SUPER_ADMIN_EMAILS.some((e) => e.toLowerCase() === authenticatedEmail);
    if (!isAllowlisted) {
      res.status(403).json({
        success: false,
        error: 'CORREO_NO_AUTORIZADO: El correo electrónico verificado no pertenece a la lista inmutable de administradores.',
      });
      return;
    }

    // Adjuntar datos verificados de forma segura a la petición
    (req as any).superAdminUser = authData.user;
    (req as any).superAdminEmail = authenticatedEmail;
    next();
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Error interno validando credenciales de autorización: ${err?.message || err}`,
    });
  }
}

/**
 * GET /ping: Comprobación pública no destructiva de conectividad del router de migración
 */
supabaseMigrationRouter.get('/ping', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'supabase-migration',
    timestamp: new Date().toISOString(),
  });
});

// Aplicar middleware de autorización SUPER_ADMIN a todas las rutas operativas de migración
supabaseMigrationRouter.use(requireSuperAdminAuth);

/**
 * Función auxiliar para resolver las credenciales del Supabase destino:
 * Prioriza los valores provistos en el cuerpo de la petición (HTTPS cifrado),
 * y utiliza las variables de entorno seguras del servidor como respaldo.
 */
function resolveTargetCredentials(body: any): TargetCredentialsInput {
  const { targetUrl, targetAnonKey, targetServiceRoleKey, targetDbUrl } = body || {};
  return {
    targetUrl: String(targetUrl || process.env.TARGET_SUPABASE_URL || '').trim(),
    targetAnonKey: String(targetAnonKey || process.env.TARGET_SUPABASE_ANON_KEY || '').trim(),
    targetServiceRoleKey: String(targetServiceRoleKey || process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    targetDbUrl: targetDbUrl
      ? String(targetDbUrl).trim()
      : (process.env.TARGET_DATABASE_URL ? String(process.env.TARGET_DATABASE_URL).trim() : undefined),
  };
}

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
    const creds = resolveTargetCredentials(req.body);
    const actorEmail = (req as any).superAdminEmail;

    const result = await supabaseMigrationService.validateTarget(creds, actorEmail);

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
    const creds = resolveTargetCredentials(req.body);
    const actorEmail = (req as any).superAdminEmail;

    const plan = await supabaseMigrationService.runDryRun(creds, actorEmail);

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
    const creds = resolveTargetCredentials(req.body);
    const actorEmail = (req as any).superAdminEmail;

    const result = await supabaseMigrationService.executeSchemaMigration(creds, actorEmail);

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
    const creds = resolveTargetCredentials(req.body);
    const actorEmail = (req as any).superAdminEmail;

    const result = await supabaseMigrationService.executeDataMigration(creds, actorEmail);

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
    const creds = resolveTargetCredentials(req.body);
    const actorEmail = (req as any).superAdminEmail;

    const report = await supabaseMigrationService.runSmokeTests(creds, actorEmail);

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
    const creds = resolveTargetCredentials(req.body);
    const { confirmationCode } = req.body || {};
    const actorEmail = (req as any).superAdminEmail;

    const result = await supabaseMigrationService.switchProduction(
      creds,
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
