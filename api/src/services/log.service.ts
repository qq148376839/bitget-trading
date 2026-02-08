/**
 * 日志服务
 * 异步日志队列，支持级别门控和节流
 */

import { createLogger, LogLevel } from '../utils/logger';

const logger = createLogger('log-service');

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  timestamp: Date;
}

export class LogService {
  private static instance: LogService | null = null;
  private queue: LogEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxQueueSize = 100;
  private readonly flushIntervalMs = 5000;

  private constructor() {
    this.startFlushTimer();
  }

  static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  /**
   * 记录日志
   */
  log(level: LogLevel, module: string, message: string, data?: unknown): void {
    this.queue.push({
      level,
      module,
      message,
      data,
      timestamp: new Date(),
    });

    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }

  info(module: string, message: string, data?: unknown): void {
    this.log(LogLevel.INFO, module, message, data);
  }

  warn(module: string, message: string, data?: unknown): void {
    this.log(LogLevel.WARN, module, message, data);
  }

  error(module: string, message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, module, message, data);
  }

  debug(module: string, message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, module, message, data);
  }

  /**
   * 刷新日志队列
   */
  flush(): void {
    if (this.queue.length === 0) return;

    const entries = this.queue.splice(0);
    for (const entry of entries) {
      const logFn = logger[entry.level.toLowerCase() as 'info' | 'warn' | 'error' | 'debug'];
      if (logFn) {
        logFn.call(logger, `[${entry.module}] ${entry.message}`, entry.data);
      }
    }
  }

  /**
   * 启动定时刷新
   */
  private startFlushTimer(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}
