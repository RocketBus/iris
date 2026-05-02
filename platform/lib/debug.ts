// Debug utilities for development and production debugging
// Factor 14: Full-Spectrum Observability — structured JSON in prod, human-readable in dev

import { randomUUID } from 'crypto';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

interface LogContext {
  requestId?: string;
  tenant?: string;
  userId?: string;
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.level = this.getLogLevel();
    this.context = context;
  }

  private getLogLevel(): LogLevel {
    const envLevel = process.env.DEBUG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'ERROR': return LogLevel.ERROR;
      case 'WARN': return LogLevel.WARN;
      case 'INFO': return LogLevel.INFO;
      case 'DEBUG': return LogLevel.DEBUG;
      case 'TRACE': return LogLevel.TRACE;
      default: return this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private levelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return 'error';
      case LogLevel.WARN: return 'warn';
      case LogLevel.INFO: return 'info';
      case LogLevel.DEBUG: return 'debug';
      case LogLevel.TRACE: return 'trace';
    }
  }

  private emit(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    if (this.isDevelopment) {
      // Human-readable format for development
      const timestamp = new Date().toISOString();
      const levelLabel = this.levelName(level).toUpperCase();
      const prefix = `[${timestamp}] [${levelLabel}]`;
      const ctxStr = this.context.requestId ? ` [${this.context.requestId.slice(0, 8)}]` : '';

      const formatted = data
        ? `${prefix}${ctxStr} ${message} ${JSON.stringify(data, null, 2)}`
        : `${prefix}${ctxStr} ${message}`;

      if (level === LogLevel.ERROR) {
        // eslint-disable-next-line no-console
        console.error(formatted);
      } else if (level === LogLevel.WARN) {
        // eslint-disable-next-line no-console
        console.warn(formatted);
      } else {
        // eslint-disable-next-line no-console
        console.log(formatted);
      }
    } else {
      // Structured JSON for production (Factor 14)
      const entry: Record<string, unknown> = {
        level: this.levelName(level),
        message,
        timestamp: new Date().toISOString(),
        ...this.context,
      };
      if (data !== undefined) {
        entry.data = data;
      }

      const json = JSON.stringify(entry);
      if (level === LogLevel.ERROR) {
        // eslint-disable-next-line no-console
        console.error(json);
      } else if (level === LogLevel.WARN) {
        // eslint-disable-next-line no-console
        console.warn(json);
      } else {
        // eslint-disable-next-line no-console
        console.log(json);
      }
    }
  }

  /**
   * Create a child logger with additional context (requestId, tenant, userId).
   * The child inherits the parent's context and merges new values.
   */
  withContext(ctx: LogContext): Logger {
    return new Logger({ ...this.context, ...ctx });
  }

  error(message: string, data?: unknown): void {
    this.emit(LogLevel.ERROR, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.emit(LogLevel.WARN, message, data);
  }

  info(message: string, data?: unknown): void {
    this.emit(LogLevel.INFO, message, data);
  }

  debug(message: string, data?: unknown): void {
    this.emit(LogLevel.DEBUG, message, data);
  }

  trace(message: string, data?: unknown): void {
    this.emit(LogLevel.TRACE, message, data);
  }

  // Specialized logging methods
  auth(message: string, data?: unknown): void {
    this.debug(`[AUTH] ${message}`, data);
  }

  email(message: string, data?: unknown): void {
    this.debug(`[EMAIL] ${message}`, data);
  }

  database(message: string, data?: unknown): void {
    this.debug(`[DATABASE] ${message}`, data);
  }

  api(message: string, data?: unknown): void {
    this.debug(`[API] ${message}`, data);
  }

  security(message: string, data?: unknown): void {
    this.warn(`[SECURITY] ${message}`, data);
  }

  performance(message: string, data?: unknown): void {
    this.info(`[PERFORMANCE] ${message}`, data);
  }
}

// Export singleton instance
export const logger = new Logger();

/**
 * Generate a unique request ID for correlation across logs.
 */
export function generateRequestId(): string {
  return randomUUID();
}

// Helper functions for common debugging scenarios
export const debugAuth = (message: string, data?: unknown) => logger.auth(message, data);
export const debugEmail = (message: string, data?: unknown) => logger.email(message, data);
export const debugDatabase = (message: string, data?: unknown) => logger.database(message, data);
export const debugApi = (message: string, data?: unknown) => logger.api(message, data);
export const debugSecurity = (message: string, data?: unknown) => logger.security(message, data);
export const debugPerformance = (message: string, data?: unknown) => logger.performance(message, data);

// Request timing utility
export class RequestTimer {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = performance.now();
    logger.trace(`[TIMER] Started: ${operation}`);
  }

  checkpoint(label: string, data?: Record<string, unknown>): void {
    const duration = performance.now() - this.startTime;
    logger.performance(`[TIMER] Checkpoint: ${this.operation} - ${label}`, {
      duration: `${duration.toFixed(2)}ms`,
      ...data,
    });
  }

  end(data?: Record<string, unknown>): void {
    const duration = performance.now() - this.startTime;
    logger.performance(`[TIMER] Completed: ${this.operation}`, {
      duration: `${duration.toFixed(2)}ms`,
      ...data
    });
  }
}

// Error context helper
export const logError = (error: unknown, context?: string) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error(`Error${context ? ` in ${context}` : ''}`, {
    message: errorMessage,
    stack: errorStack,
  });
};
