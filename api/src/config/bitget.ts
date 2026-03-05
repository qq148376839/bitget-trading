/**
 * Bitget API 配置和客户端初始化
 * 优先从 SystemConfigService（数据库）读取，env 作为 fallback
 * 支持双 Profile（simulated / real）切换
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

export type BitgetProfile = 'simulated' | 'real';

/** Profile 凭证在 DB 中的 key 前缀映射 */
const PROFILE_KEY_MAP: Record<BitgetProfile, { apiKey: string; secretKey: string; passphrase: string }> = {
  simulated: {
    apiKey: 'BITGET_SIM_API_KEY',
    secretKey: 'BITGET_SIM_SECRET_KEY',
    passphrase: 'BITGET_SIM_PASSPHRASE',
  },
  real: {
    apiKey: 'BITGET_REAL_API_KEY',
    secretKey: 'BITGET_REAL_SECRET_KEY',
    passphrase: 'BITGET_REAL_PASSPHRASE',
  },
};

const ACTIVE_PROFILE_KEY = 'BITGET_ACTIVE_PROFILE';

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
 * 获取指定 profile 的凭证 DB key 列表
 */
export function getProfileKeys(profile: BitgetProfile): { apiKey: string; secretKey: string; passphrase: string } {
  return PROFILE_KEY_MAP[profile];
}

/**
 * 切换活跃 Profile：读取目标 profile 凭证 → 写入运行时 env → 清缓存
 */
export async function switchProfile(profile: BitgetProfile): Promise<void> {
  const { SystemConfigService } = await import('../services/system-config.service');
  const configService = SystemConfigService.getInstance();
  const { BitgetClientService } = await import('../services/bitget-client.service');

  const keys = PROFILE_KEY_MAP[profile];
  const apiKey = await configService.get(keys.apiKey);
  const secretKey = await configService.get(keys.secretKey);
  const passphrase = await configService.get(keys.passphrase);

  if (!apiKey || !secretKey || !passphrase) {
    throw new Error(`Profile "${profile}" 凭证未配置完整`);
  }

  // 写入运行时 env
  process.env.BITGET_API_KEY = apiKey;
  process.env.BITGET_SECRET_KEY = secretKey;
  process.env.BITGET_PASSPHRASE = passphrase;
  process.env.BITGET_SIMULATED = profile === 'simulated' ? '1' : '0';

  // 同步写入活跃 key 到 DB
  await configService.set('BITGET_API_KEY', apiKey, { isEncrypted: true });
  await configService.set('BITGET_SECRET_KEY', secretKey, { isEncrypted: true });
  await configService.set('BITGET_PASSPHRASE', passphrase, { isEncrypted: true });
  await configService.set('BITGET_SIMULATED', profile === 'simulated' ? '1' : '0', { isEncrypted: false });
  await configService.set(ACTIVE_PROFILE_KEY, profile, { isEncrypted: false, description: '当前活跃 API Profile' });

  // 清缓存
  clearBitgetConfig();
  BitgetClientService.clearInstance();
}

/**
 * 从 SystemConfigService 异步加载配置到 process.env
 * 在 bootstrap 中调用，优先级: DB > env
 * 支持 Profile 模式：优先读取 BITGET_ACTIVE_PROFILE，按 profile 加载凭证
 */
export async function loadBitgetConfigFromDB(): Promise<void> {
  try {
    // Dynamic import to avoid circular dependency
    const { SystemConfigService } = await import('../services/system-config.service');
    const configService = SystemConfigService.getInstance();

    // 检查是否有活跃 Profile
    const activeProfile = await configService.get(ACTIVE_PROFILE_KEY);

    if (activeProfile === 'simulated' || activeProfile === 'real') {
      // Profile 模式：从 profile 专用 key 加载
      const keys = PROFILE_KEY_MAP[activeProfile];
      const apiKey = await configService.get(keys.apiKey);
      const secretKey = await configService.get(keys.secretKey);
      const passphrase = await configService.get(keys.passphrase);

      if (apiKey) process.env.BITGET_API_KEY = apiKey;
      if (secretKey) process.env.BITGET_SECRET_KEY = secretKey;
      if (passphrase) process.env.BITGET_PASSPHRASE = passphrase;
      process.env.BITGET_SIMULATED = activeProfile === 'simulated' ? '1' : '0';

      // 加载非凭证配置
      const baseUrl = await configService.get('BITGET_API_BASE_URL');
      if (baseUrl) process.env.BITGET_API_BASE_URL = baseUrl;
    } else {
      // Fallback：无 profile 时使用原有逻辑
      const keys = ['BITGET_API_KEY', 'BITGET_SECRET_KEY', 'BITGET_PASSPHRASE', 'BITGET_API_BASE_URL', 'BITGET_SIMULATED'];
      for (const key of keys) {
        const value = await configService.get(key);
        if (value) {
          process.env[key] = value;
        }
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
