/**
 * Bitget API 配置和客户端初始化
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
 * 获取 Bitget API 配置
 * 验证所有必要的环境变量存在
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
      `Bitget API 配置缺失: ${missing.join(', ')}。请在 .env 文件中配置。`
    );
  }

  cachedConfig = { apiKey, secretKey, passphrase, baseUrl, simulated };
  return cachedConfig;
}

/**
 * 清除缓存的配置（用于测试或重新加载）
 */
export function clearBitgetConfig(): void {
  cachedConfig = null;
}
