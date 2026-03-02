/**
 * 日志服务
 * 异步日志队列，支持级别门控、节流、数据库持久化
 * INFO+ 级别入库，DEBUG 仅控制台
 */

import { Pool } from 'pg';
import { createLogger, LogLevel, getCorrelationId } from '../utils/logger';

const logger = createLogger('log-service');

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
  correlationId?: string;
  timestamp: Date;
}

const DB_LOG_LEVELS = new Set([LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]);

export class LogService {
  private static instance: LogService | null = null;
  private queue: LogEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxQueueSize = 100;
  private readonly flushIntervalMs = 5000;
  private pool: Pool | null = null;

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
   * 设置数据库连接池（启动时调用）
   */
  setPool(pool: Pool): void {
    this.pool = pool;
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
      correlationId: getCorrelationId(),
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

    // Console output for all entries
    for (const entry of entries) {
      const logFn = logger[entry.level.toLowerCase() as 'info' | 'warn' | 'error' | 'debug'];
      if (logFn) {
        logFn.call(logger, `[${entry.module}] ${entry.message}`, entry.data);
      }
    }

    // DB persistence for INFO+ only
    if (this.pool) {
      const dbEntries = entries.filter(e => DB_LOG_LEVELS.has(e.level));
      if (dbEntries.length > 0) {
        this.batchInsert(dbEntries).catch(err => {
          // Avoid recursive logging — just console
          console.error('日志入库失败:', err.message);
        });
      }
    }
  }

  /**
   * 批量写入日志到数据库
   */
  private async batchInsert(entries: LogEntry[]): Promise<void> {
    if (!this.pool || entries.length === 0) return;

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const entry of entries) {
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
      values.push(
        entry.level,
        entry.module,
        entry.message,
        entry.data ? JSON.stringify(entry.data) : null,
        entry.correlationId || null,
        entry.timestamp
      );
      idx += 6;
    }

    await this.pool.query(
      `INSERT INTO system_logs (level, module, message, data, correlation_id, created_at) VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  /**
   * 查询日志
   */
  async queryLogs(params: {
    level?: string;
    module?: string;
    keyword?: string;
    correlationId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: LogEntry[]; total: number }> {
    if (!this.pool) return { logs: [], total: 0 };

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.level) {
      conditions.push(`level = $${idx++}`);
      values.push(params.level);
    }
    if (params.module) {
      conditions.push(`module = $${idx++}`);
      values.push(params.module);
    }
    if (params.keyword) {
      conditions.push(`message ILIKE $${idx++}`);
      values.push(`%${params.keyword}%`);
    }
    if (params.correlationId) {
      conditions.push(`correlation_id = $${idx++}`);
      values.push(params.correlationId);
    }
    if (params.startTime) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(params.startTime);
    }
    if (params.endTime) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(params.endTime);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM system_logs ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    const logResult = await this.pool.query(
      `SELECT level, module, message, data, correlation_id, created_at FROM system_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return {
      logs: logResult.rows.map(r => ({
        level: r.level,
        module: r.module,
        message: r.message,
        data: r.data,
        correlationId: r.correlation_id,
        timestamp: r.created_at,
      })),
      total,
    };
  }

  /**
   * 清理旧日志
   */
  async cleanup(daysToKeep = 7): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query(
      `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [daysToKeep]
    );
    return result.rowCount || 0;
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
