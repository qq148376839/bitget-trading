/**
 * 系统配置路由
 * GET /api/system-config — 列出所有配置
 * GET /api/system-config/active-profile — 返回当前 Profile + 各 Profile 配置状态
 * PUT /api/system-config/profile/:profile — 保存指定 Profile 凭证
 * POST /api/system-config/switch-profile — 切换活跃 Profile
 * PUT /api/system-config/:key — 更新配置
 * POST /api/system-config/test-connection — 测试 Bitget API 连接
 * POST /api/system-config/export — 导出配置（JSON）
 */

import { Router, Request, Response, NextFunction } from 'express';
import { SystemConfigService } from '../services/system-config.service';
import { BitgetClientService } from '../services/bitget-client.service';
import { clearBitgetConfig, getProfileKeys, switchProfile, BitgetProfile } from '../config/bitget';
import { AppError, ErrorCode } from '../utils/errors';

const router = Router();

// 列出所有配置（加密值脱敏）
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const configService = SystemConfigService.getInstance();
    const configs = await configService.getAll();
    res.json({ success: true, data: configs });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Profile 端点（必须注册在 /:key 之前，避免被 catch-all 匹配）
// ============================================================

// 获取当前 Profile + 各 Profile 配置状态
router.get('/active-profile', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const configService = SystemConfigService.getInstance();
    const activeProfile = await configService.get('BITGET_ACTIVE_PROFILE') || null;

    // 检查各 profile 是否已配置
    const checkProfile = async (profile: BitgetProfile): Promise<boolean> => {
      const keys = getProfileKeys(profile);
      const apiKey = await configService.get(keys.apiKey);
      const secretKey = await configService.get(keys.secretKey);
      const passphrase = await configService.get(keys.passphrase);
      return !!(apiKey && secretKey && passphrase);
    };

    const [simConfigured, realConfigured] = await Promise.all([
      checkProfile('simulated'),
      checkProfile('real'),
    ]);

    res.json({
      success: true,
      data: {
        activeProfile,
        profiles: {
          simulated: { configured: simConfigured },
          real: { configured: realConfigured },
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// 保存指定 Profile 的凭证
router.put('/profile/:profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { profile } = req.params;
    if (profile !== 'simulated' && profile !== 'real') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Profile 必须为 simulated 或 real', undefined, 400);
    }

    const { apiKey, secretKey, passphrase } = req.body;
    if (!apiKey || !secretKey || !passphrase) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'API Key、Secret Key 和 Passphrase 不能为空', undefined, 400);
    }

    const configService = SystemConfigService.getInstance();
    const keys = getProfileKeys(profile as BitgetProfile);

    await configService.set(keys.apiKey, apiKey, {
      isEncrypted: true,
      description: `Bitget ${profile} API Key`,
      updatedBy: req.user?.username,
    });
    await configService.set(keys.secretKey, secretKey, {
      isEncrypted: true,
      description: `Bitget ${profile} Secret Key`,
      updatedBy: req.user?.username,
    });
    await configService.set(keys.passphrase, passphrase, {
      isEncrypted: true,
      description: `Bitget ${profile} Passphrase`,
      updatedBy: req.user?.username,
    });

    // 如果保存的是当前活跃 profile，自动刷新运行时凭证
    const activeProfile = await configService.get('BITGET_ACTIVE_PROFILE');
    if (activeProfile === profile) {
      process.env.BITGET_API_KEY = apiKey;
      process.env.BITGET_SECRET_KEY = secretKey;
      process.env.BITGET_PASSPHRASE = passphrase;
      // 同步运行时 key 到 DB
      await configService.set('BITGET_API_KEY', apiKey, { isEncrypted: true });
      await configService.set('BITGET_SECRET_KEY', secretKey, { isEncrypted: true });
      await configService.set('BITGET_PASSPHRASE', passphrase, { isEncrypted: true });
      clearBitgetConfig();
      BitgetClientService.clearInstance();
    }

    res.json({ success: true, data: { message: `${profile} 凭证已保存` } });
  } catch (error) {
    next(error);
  }
});

// 切换活跃 Profile（策略运行中拒绝）
router.post('/switch-profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { profile } = req.body;
    if (profile !== 'simulated' && profile !== 'real') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Profile 必须为 simulated 或 real', undefined, 400);
    }

    // 检查策略是否在运行
    const { StrategyManager } = await import('../strategy/strategy-manager');
    const strategyManager = StrategyManager.getInstance();
    const activeStrategy = strategyManager.getActiveStrategy();
    if (activeStrategy) {
      const strategyStatus = activeStrategy.getStatus();
      if (strategyStatus === 'RUNNING' || strategyStatus === 'STARTING') {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          '策略运行中，请先停止策略再切换 Profile',
          undefined,
          400
        );
      }
    }

    await switchProfile(profile as BitgetProfile);

    res.json({
      success: true,
      data: {
        message: `已切换到 ${profile === 'simulated' ? '模拟盘' : '实盘'}`,
        activeProfile: profile,
      },
    });
  } catch (error) {
    next(error);
  }
});

// 更新配置
router.put('/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const { value, isEncrypted, description } = req.body;

    if (value === undefined) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'value 不能为空', undefined, 400);
    }

    const configService = SystemConfigService.getInstance();
    await configService.set(key, value, {
      isEncrypted,
      description,
      updatedBy: req.user?.username,
    });

    // If Bitget API credentials changed, sync to process.env and clear cached config
    if (['BITGET_API_KEY', 'BITGET_SECRET_KEY', 'BITGET_PASSPHRASE', 'BITGET_API_BASE_URL', 'BITGET_SIMULATED'].includes(key)) {
      process.env[key] = value;
      clearBitgetConfig();
      BitgetClientService.clearInstance();
    }

    res.json({ success: true, data: { message: '配置已更新' } });
  } catch (error) {
    next(error);
  }
});

// 测试 Bitget API 连接
router.post('/test-connection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { apiKey, secretKey, passphrase, simulated } = req.body;

    if (!apiKey || !secretKey || !passphrase) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'API Key、Secret Key 和 Passphrase 不能为空', undefined, 400);
    }

    // Temporarily test using provided credentials
    const crypto = await import('crypto');
    const axios = (await import('axios')).default;
    const baseUrl = 'https://api.bitget.com';
    const timestamp = Date.now().toString();
    const method = 'GET';
    const requestPath = '/api/v2/spot/account/assets';
    const prehash = timestamp + method + requestPath;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(prehash)
      .digest('base64');

    const headers: Record<string, string> = {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
      'locale': 'zh-CN',
    };

    if (simulated) {
      headers['paptrading'] = '1';
    }

    const response = await axios.get(`${baseUrl}${requestPath}`, { headers, timeout: 10000 });

    if (response.data?.code === '00000') {
      res.json({ success: true, data: { connected: true, message: 'API 连接成功' } });
    } else {
      res.json({
        success: true,
        data: { connected: false, message: `API 返回错误: [${response.data?.code}] ${response.data?.msg}` },
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    res.json({ success: true, data: { connected: false, message: `连接失败: ${msg}` } });
  }
});

// 导出配置
router.post('/export', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const configService = SystemConfigService.getInstance();
    const configs = await configService.getAll();
    // Exclude encrypted values from export
    const exportData = configs
      .filter(c => !c.isEncrypted)
      .map(c => ({ key: c.key, value: c.value, description: c.description }));
    res.json({ success: true, data: exportData });
  } catch (error) {
    next(error);
  }
});

export default router;
