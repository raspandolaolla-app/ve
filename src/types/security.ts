// ==============================================================================
// RASPANDO LA OLLA — DEFINICIONES DE TIPOS GLOBALES: SEGURIDAD Y AUDITORÍA
// ==============================================================================

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditLogEntry {
  id: string;
  actorUserId?: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
  ipAddressMasked?: string;
  userAgentSnippet?: string;
  metadata?: Record<string, unknown>;
  status: 'success' | 'failure';
}

export interface SecurityEvent {
  id: string;
  userId?: string;
  eventType: string;
  severity: SecuritySeverity;
  details: Record<string, unknown>;
  timestamp: string;
  resolved: boolean;
}

export interface MfaEnrollmentState {
  isEnrolled: boolean;
  factorId?: string;
  qrCodeUri?: string;
  secret?: string;
}
