// ==============================================================================
// RASPANDO LA OLLA — TIPOS DEL CENTRO DE MIGRACIÓN DE SUPABASE
// ==============================================================================
// Define contratos de datos estricto para el proceso seguro de migración
// entre proyectos Supabase.
// ==============================================================================

export type MigrationStage =
  | 'IDLE'
  | 'VALIDATING_SOURCE'
  | 'VALIDATING_TARGET'
  | 'DRY_RUN'
  | 'BACKUP_READY'
  | 'SCHEMA_MIGRATION'
  | 'DATA_MIGRATION'
  | 'INTEGRITY_VALIDATION'
  | 'FUNCTIONAL_VALIDATION'
  | 'READY_TO_SWITCH'
  | 'SWITCHING'
  | 'PRODUCTION_VALIDATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLBACK';

export interface SourceEnvironmentStatus {
  url: string;
  projectRef: string;
  connected: boolean;
  authStatus: 'ACTIVE' | 'UNAVAILABLE';
  dbStatus: 'ACTIVE' | 'UNAVAILABLE';
  schemaVersion: string;
  totalMigrationsCount: number;
  totalTablesCount: number;
  tables: string[];
  functionsCount: number;
  rpcNames: string[];
  storageBuckets: string[];
  realtimeStatus: 'CONFIGURED' | 'PENDING' | 'UNAVAILABLE';
  superAdminsCount: number;
  superAdminEmails: string[];
  configSummary: {
    systemSettingsCount: number;
    gameConfigsCount: number;
    entryFeesCount: number;
    systemAnnouncementsCount: number;
    advertisingAssetsCount: number;
    manualsCount: number;
  };
}

export interface TargetCredentialsInput {
  targetUrl: string;
  targetAnonKey: string;
  targetServiceRoleKey: string;
  targetDbUrl?: string;
}

export interface TargetValidationResult {
  valid: boolean;
  projectRef: string;
  reachable: boolean;
  authWorking: boolean;
  dbDirectReachable: boolean;
  storageWorking: boolean;
  hasExistingTables: boolean;
  existingTablesCount: number;
  existingTables: string[];
  latencyMs: number;
  message: string;
  warnings: string[];
  errors: string[];
}

export interface DryRunPlan {
  id: string;
  generatedAt: string;
  sourceRef: string;
  targetRef: string;
  isCompatible: boolean;
  willCreate: {
    schemas: string[];
    extensions: string[];
    tables: string[];
    indexesCount: number;
    triggersCount: number;
    functions: string[];
    rlsPoliciesCount: number;
    storageBuckets: string[];
  };
  willMigrateData: {
    admins: Array<{ email: string; role: string }>;
    configurations: Array<{ table: string; count: number; description: string }>;
  };
  willExcludeData: Array<{
    table: string;
    category: 'CLIENT_USERS' | 'FINANCIAL_LEDGER' | 'HISTORICAL_MATCHES' | 'TEMPORARY_DATA';
    reason: string;
    estimatedRows?: number;
  }>;
  willNotTouch: string[];
  warnings: string[];
  errors: string[];
}

export interface BackupManifest {
  id: string;
  timestamp: string;
  sourceUrl: string;
  schemaVersion: string;
  sha256Hash: string;
  sizeBytes: number;
  itemsCount: number;
  configurationsSnapshot: Record<string, any[]>;
  adminProfilesSnapshot: Array<{ id: string; email: string; role: string }>;
  verified: boolean;
}

export interface SmokeTestCheck {
  id: string;
  name: string;
  category: 'database' | 'security' | 'rpc' | 'auth' | 'storage' | 'realtime' | 'gameplay';
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
  durationMs: number;
}

export interface SmokeTestReport {
  executedAt: string;
  allPassed: boolean;
  passedCount: number;
  failedCount: number;
  warnCount: number;
  checks: SmokeTestCheck[];
}

export interface MigrationLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  step?: string;
}

export interface MigrationAuditRecord {
  id: string;
  timestamp: string;
  actorEmail: string;
  action: string;
  targetRefMasked: string;
  stage: MigrationStage;
  result: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  durationMs: number;
  details?: string;
}

export interface MigrationFullStatusResponse {
  source: SourceEnvironmentStatus;
  stage: MigrationStage;
  isLocked: boolean;
  activeTargetRefMasked: string | null;
  dryRunPlan: DryRunPlan | null;
  backup: BackupManifest | null;
  smokeTestReport: SmokeTestReport | null;
  canSwitch: boolean;
  isSwitched: boolean;
  logs: MigrationLogEntry[];
  auditHistory: MigrationAuditRecord[];
  activeError: string | null;
}
