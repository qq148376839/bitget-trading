/**
 * Bitget API 配置和客户端初始化
 * 优先从 SystemConfigService（数据库）读取，env 作为 fallback
 */

import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export interface BitgetConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  baseUrl: string;
  simulated: boolean;
}

let cachedConfig: BitgetConfig | null = null;

/**
 * 获取 Bitget API 配置（同步 — 使用环境变量或已预加载的缓存）
 * 验证所有必要的配置存在
 */
export function getBitgetConfig(): BitgetConfig {
  if (cachedConfig) return cachedConfig;

  const apiKey = process.env.BITGET_API_KEY;
  const secretKey = process.env.BITGET_SECRET_KEY;
  const passphrase = process.env.BITGET_PASSPHRASE;
  const baseUrl = process.env.BITGET_API_BASE_URL || 'https://api.bitget.com';
  const simulated = process.env.BITGET_SIMULATED === '1';

  if (!apiKey || !secretKey || !passphrase) {
    const missing: string[] = [];
    if (!apiKey) missing.push('BITGET_API_KEY');
    if (!secretKey) missing.push('BITGET_SECRET_KEY');
    if (!passphrase) missing.push('BITGET_PASSPHRASE');
    throw new Error(
      `Bitget API 配置缺失: ${missing.join(', ')}。请在 .env 文件或系统配置中设置。`
    );
  }

  cachedConfig = { apiKey, secretKey, passphrase, baseUrl, simulated };
  return cachedConfig;
}

/**
 * 从 SystemConfigService 异步加载配置到 process.env
 * 在 bootstrap 中调用，优先级: DB > env
 */
export async function loadBitgetConfigFromDB(): Promise<void> {
  try {
    // Dynamic import to avoid circular dependency
    const { SystemConfigService } = await import('../services/system-config.service');
    const configService = SystemConfigService.getInstance();

    const keys = ['BITGET_API_KEY', 'BITGET_SECRET_KEY', 'BITGET_PASSPHRASE', 'BITGET_API_BASE_URL', 'BITGET_SIMULATED'];
    for (const key of keys) {
      const value = await configService.get(key);
      if (value) {
        process.env[key] = value;
      }
    }

    // Clear cached config so next call to getBitgetConfig() picks up DB values
    clearBitgetConfig();
  } catch {
    // DB config not available yet, use env vars
  }
}

/**
 * 清除缓存的配置（用于测试或重新加载）
 */
export function clearBitgetConfig(): void {
  cachedConfig = null;
}
