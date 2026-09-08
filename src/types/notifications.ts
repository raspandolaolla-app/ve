// ==============================================================================
// RASPANDO LA OLLA — TIPOS OFICIALES DEL SISTEMA DE NOTIFICACIONES
// Principio: Notificaciones basadas en eventos reales del sistema
// ==============================================================================

export type NotificationType =
  // Finanzas y Billetera
  | 'DEPOSIT_APPROVED'
  | 'DEPOSIT_REJECTED'
  | 'WITHDRAWAL_APPROVED'
  | 'WITHDRAWAL_REJECTED'
  | 'BALANCE_UPDATE'
  // Soporte y Atención al Cliente
  | 'SUPPORT_MESSAGE'
  | 'SUPPORT_TICKET_CREATED'
  | 'SUPPORT_TICKET_UPDATED'
  | 'SUPPORT_TICKET_RESOLVED'
  // Anuncios y Avisos
  | 'SYSTEM_ANNOUNCEMENT'
  | 'GAME_ANNOUNCEMENT'
  | 'MAINTENANCE_ANNOUNCEMENT'
  // Juegos y Disponibilidad
  | 'GAME_ENABLED'
  | 'GAME_DISABLED'
  | 'GAME_RULE_CHANGED'
  // Administración y Operadores
  | 'ADMIN_BROADCAST'
  | 'OPERATOR_BROADCAST'
  | 'ADMIN_MESSAGE'
  | 'SECURITY_ALERT';

export type NotificationCategory = 'finance' | 'support' | 'game' | 'system' | 'admin';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
  sourceType?: string | null;
  sourceId?: string | null;
  readAt?: string | null;
  expiresAt?: string | null;
  archivedAt?: string | null;
}

export interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}
