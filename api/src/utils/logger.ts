/**
 * 日志工具模块
 * JSON 结构化输出 + AsyncLocalStorage correlationId 传播
 */

import { AsyncLocalStorage } from 'async_hooks';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

let currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

// AsyncLocalStorage for request-scoped correlationId
interface LogContext {
  correlationId?: string;
}

export const logContext = new AsyncLocalStorage<LogContext>();

export function getCorrelationId(): string | undefined {
  return logContext.getStore()?.correlationId;
}

function formatMessage(level: LogLevel, module: string, message: string, data?: unknown): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    correlationId: getCorrelationId(),
    ...(data !== undefined ? { data } : {}),
  };
  return JSON.stringify(entry);
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(module: string): Logger {
  return {
    debug(message: string, data?: unknown): void {
      if (shouldLog(LogLevel.DEBUG)) {
        console.debug(formatMessage(LogLevel.DEBUG, module, message, data));
      }
    },
    info(message: string, data?: unknown): void {
      if (shouldLog(LogLevel.INFO)) {
        console.info(formatMessage(LogLevel.INFO, module, message, data));
      }
    },
    warn(message: string, data?: unknown): void {
      if (shouldLog(LogLevel.WARN)) {
        console.warn(formatMessage(LogLevel.WARN, module, message, data));
      }
    },
    error(message: string, data?: unknown): void {
      if (shouldLog(LogLevel.ERROR)) {
        console.error(formatMessage(LogLevel.ERROR, module, message, data));
      }
    },
  };
}
