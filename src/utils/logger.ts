/**
 * Sistema de logging estructurado para RASPANDO LA OLLA
 * Reemplaza console.log/error/warn con sanitización y niveles
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  timestamp: string;
}

// Sanitizador: remueve JWTs, emails, teléfonos, cédulas
const sanitize = (data: unknown): unknown => {
  if (typeof data === 'string') {
    return data
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
      .replace(/\b\d{7,9}\b/g, '[ID_REDACTED]')
      .replace(/\b\+?\d{10,15}\b/g, '[PHONE_REDACTED]');
  }
  if (typeof data === 'object' && data !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (['password', 'secret', 'token', 'apiKey', 'api_key'].some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitize(value);
      }
    }
    return sanitized;
  }
  return data;
};

const shouldLog = (level: LogLevel): boolean => {
  if (import.meta.env.PROD && level === 'debug') return false;
  return true;
};

const formatEntry = (entry: LogEntry): string => {
  const prefix = `[${entry.level.toUpperCase()}]${entry.context ? `[${entry.context}]` : ''}`;
  return `${prefix} ${entry.message}`;
};

export const logger = {
  debug: (message: string, data?: unknown, context?: string) => {
    if (!shouldLog('debug')) return;
    const entry: LogEntry = { level: 'debug', message, data: sanitize(data), context, timestamp: new Date().toISOString() };
    console.debug(formatEntry(entry), data ? sanitize(data) : '');
  },

  info: (message: string, data?: unknown, context?: string) => {
    if (!shouldLog('info')) return;
    const entry: LogEntry = { level: 'info', message, data: sanitize(data), context, timestamp: new Date().toISOString() };
    console.info(formatEntry(entry), data ? sanitize(data) : '');
  },

  warn: (message: string, data?: unknown, context?: string) => {
    if (!shouldLog('warn')) return;
    const entry: LogEntry = { level: 'warn', message, data: sanitize(data), context, timestamp: new Date().toISOString() };
    console.warn(formatEntry(entry), data ? sanitize(data) : '');
  },

  error: (message: string, error?: unknown, context?: string) => {
    const entry: LogEntry = { level: 'error', message, data: sanitize(error), context, timestamp: new Date().toISOString() };
    console.error(formatEntry(entry), error instanceof Error ? { message: error.message, stack: error.stack } : sanitize(error));
    // Futuro: enviar a Sentry/LogRocket
    // if (import.meta.env.PROD) { sendToMonitoringService(entry); }
  },

  // Alias para migración progresiva
  log: (message: string, data?: unknown, context?: string) => logger.info(message, data, context),
};

export default logger;
