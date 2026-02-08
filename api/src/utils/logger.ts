/**
 * 日志工具模块
 */

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

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level}] [${module}] ${message}${dataStr}`;
}

export function createLogger(module: string) {
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
