/**
 * 系统配置服务
 * 单例模式，启动时加载所有配置到内存缓存
 * 支持 AES-256-GCM 加密敏感字段
 */

import crypto from 'crypto';
import { Pool } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('system-config');

interface ConfigRow {
  config_key: string;
  config_value: string;
  is_encrypted: boolean;
  description: string | null;
  updated_by: string | null;
}

export class SystemConfigService {
  private static instance: SystemConfigService | null = null;
  private pool: Pool;
  private cache: Map<string, string> = new Map();
  private encryptionKey: Buffer | null = null;

  private constructor(pool: Pool) {
    this.pool = pool;
    const key = process.env.ENCRYPTION_KEY;
    if (key) {
      // Derive a 32-byte key from the provided string
      this.encryptionKey = crypto.scryptSync(key, 'bitget-trading-salt', 32);
    }
  }

  static init(pool: Pool): SystemConfigService {
    if (!SystemConfigService.instance) {
      SystemConfigService.instance = new SystemConfigService(pool);
    }
    return SystemConfigService.instance;
  }

  static getInstance(): SystemConfigService {
    if (!SystemConfigService.instance) {
      throw new Error('SystemConfigService not initialized. Call init(pool) first.');
    }
    return SystemConfigService.instance;
  }

  /**
   * 启动时加载所有配置到内存
   */
  async loadAll(): Promise<void> {
    try {
      const result = await this.pool.query<ConfigRow>(
        'SELECT config_key, config_value, is_encrypted FROM system_configs'
      );
      this.cache.clear();
      for (const row of result.rows) {
        const value = row.is_encrypted ? this.decrypt(row.config_value) : row.config_value;
        this.cache.set(row.config_key, value);
      }
      logger.info('系统配置已加载', { count: result.rows.length });
    } catch (error) {
      logger.warn('加载系统配置失败，将使用环境变量', { error: String(error) });
    }
  }

  /**
   * 获取配置值: 内存缓存 → DB → env fallback
   */
  async get(key: string, envFallback?: string): Promise<string | undefined> {
    // 1. Memory cache
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // 2. DB
    try {
      const result = await this.pool.query<ConfigRow>(
        'SELECT config_value, is_encrypted FROM system_configs WHERE config_key = $1',
        [key]
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const value = row.is_encrypted ? this.decrypt(row.config_value) : row.config_value;
        this.cache.set(key, value);
        return value;
      }
    } catch (error) {
      logger.warn('从 DB 读取配置失败', { key, error: String(error) });
    }

    // 3. Env fallback
    return envFallback ?? process.env[key];
  }

  /**
   * 设置配置值: 写DB + 更新缓存
   */
  async set(
    key: string,
    value: string,
    options?: { isEncrypted?: boolean; description?: string; updatedBy?: string }
  ): Promise<void> {
    const isEncrypted = options?.isEncrypted ?? false;
    const storedValue = isEncrypted ? this.encrypt(value) : value;

    await this.pool.query(
      `INSERT INTO system_configs (config_key, config_value, is_encrypted, description, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (config_key) DO UPDATE SET
         config_value = $2,
         is_encrypted = $3,
         description = COALESCE($4, system_configs.description),
         updated_by = $5,
         updated_at = NOW()`,
      [key, storedValue, isEncrypted, options?.description ?? null, options?.updatedBy ?? null]
    );

    this.cache.set(key, value);
    logger.info('配置已更新', { key, isEncrypted });
  }

  /**
   * 获取所有配置（加密值脱敏）
   */
  async getAll(): Promise<Array<{
    key: string;
    value: string;
    isEncrypted: boolean;
    description: string | null;
    updatedBy: string | null;
  }>> {
    const result = await this.pool.query<ConfigRow>(
      'SELECT config_key, config_value, is_encrypted, description, updated_by FROM system_configs ORDER BY config_key'
    );
    return result.rows.map(row => ({
      key: row.config_key,
      value: row.is_encrypted ? '••••••••' : row.config_value,
      isEncrypted: row.is_encrypted,
      description: row.description,
      updatedBy: row.updated_by,
    }));
  }

  /**
   * 删除配置
   */
  async delete(key: string): Promise<void> {
    await this.pool.query('DELETE FROM system_configs WHERE config_key = $1', [key]);
    this.cache.delete(key);
  }

  /**
   * AES-256-GCM 加密
   */
  private encrypt(text: string): string {
    if (!this.encryptionKey) {
      logger.warn('ENCRYPTION_KEY 未设置，敏感配置将以明文存储');
      return text;
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // format: iv:authTag:encrypted (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /**
   * AES-256-GCM 解密
   */
  private decrypt(cipherText: string): string {
    if (!this.encryptionKey) {
      return cipherText;
    }
    try {
      const parts = cipherText.split(':');
      if (parts.length !== 3) return cipherText; // Not encrypted format
      const iv = Buffer.from(parts[0], 'base64');
      const authTag = Buffer.from(parts[1], 'base64');
      const encrypted = Buffer.from(parts[2], 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      // If decryption fails, return as-is (may be plain text from before encryption was enabled)
      return cipherText;
    }
  }
}
