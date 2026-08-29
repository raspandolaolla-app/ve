// ==============================================================================
// RASPANDO LA OLLA — ESTRUCTURA DE TIPOS DE AUDITORÍA Y TEST DEL SISTEMA
// ==============================================================================

export type AuditCategory =
  | 'AUTH'
  | 'WALLET'
  | 'SYSTEM'
  | 'MULTIPLAYER'
  | 'GAMES'
  | 'CONCURRENCY';

export type AuditTestStatus = 'PASS' | 'FAIL' | 'WARNING' | 'RUNNING' | 'PENDING';

export interface AuditLogEntry {
  id: string;
  runId: string;
  timestamp: string;
  category: AuditCategory;
  name: string;
  target: string;
  status: AuditTestStatus;
  latencyMs: number;
  expected: string;
  actual: string;
  errorDetails?: string;
  rpcUsed?: string;
  tableAffected?: string;
}

export interface GameEngineTestReport {
  gameKey: string;
  displayName: string;
  tested: boolean;
  pass: boolean;
  latencyMs: number;
  rulesVerified: string[];
  message: string;
  errorDetails?: string;
}

export interface AuditTestRun {
  id: string;
  timestamp: string;
  durationMs: number;
  totalTests: number;
  passCount: number;
  failCount: number;
  warningCount: number;
  executorEmail: string;
  executorRole: string;
  logs: AuditLogEntry[];
  gameReports: GameEngineTestReport[];
  concurrencyReport: {
    tested: boolean;
    raceConditionPrevented: boolean;
    doubleActionBlocked: boolean;
    message: string;
  };
  healthStatus: 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';
}

export interface AuditCleanupSummary {
  deletedTables: number;
  deletedActions: number;
  deletedTickets: number;
  deletedLogs: number;
  remainingRealTables: number;
  remainingRealWallets: number;
  message: string;
}
