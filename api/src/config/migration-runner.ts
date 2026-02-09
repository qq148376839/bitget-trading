/**
 * 数据库迁移运行器
 * 启动时自动检测并执行未应用的迁移
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('migration-runner');

interface AppliedMigration {
  version: number;
  filename: string;
  checksum: string;
  applied_at: string;
}

/**
 * 运行数据库迁移
 * - 自建 schema_migrations 表
 * - 扫描 migrations/ 目录下 NNN_*.sql 文件
 * - 比对已应用版本，仅执行未应用的迁移
 * - 每个迁移在事务中执行，失败回滚并终止
 * - checksum 校验防止已应用文件被篡改
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../../migrations');

  // 确保 schema_migrations 表存在
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 获取已应用的迁移
  const { rows: applied } = await pool.query<AppliedMigration>(
    'SELECT version, filename, checksum FROM schema_migrations ORDER BY version'
  );
  const appliedMap = new Map(applied.map(m => [m.version, m]));

  // 扫描迁移文件
  if (!fs.existsSync(migrationsDir)) {
    logger.info('迁移目录不存在，跳过迁移', { dir: migrationsDir });
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d{3}_.*\.sql$/.test(f))
    .sort();

  if (files.length === 0) {
    logger.info('无迁移文件');
    return;
  }

  let appliedCount = 0;

  for (const filename of files) {
    const version = parseInt(filename.split('_')[0], 10);
    const filePath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');

    const existing = appliedMap.get(version);

    if (existing) {
      // 校验 checksum
      if (existing.checksum !== checksum) {
        const msg = `迁移文件 ${filename} 的内容已被修改（checksum 不匹配），拒绝启动`;
        logger.error(msg, {
          version,
          expectedChecksum: existing.checksum,
          actualChecksum: checksum,
        });
        throw new Error(msg);
      }
      continue;
    }

    // 执行未应用的迁移
    logger.info(`应用迁移: ${filename} (version ${version})`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
        [version, filename, checksum]
      );
      await client.query('COMMIT');
      appliedCount++;
      logger.info(`迁移完成: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      const msg = `迁移失败: ${filename} — ${String(error)}`;
      logger.error(msg);
      throw new Error(msg);
    } finally {
      client.release();
    }
  }

  if (appliedCount > 0) {
    logger.info(`迁移全部完成，本次应用 ${appliedCount} 个`);
  } else {
    logger.info('数据库已是最新，无需迁移');
  }
}
