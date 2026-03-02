/**
 * 系统配置路由
 * GET /api/system-config — 列出所有配置
 * PUT /api/system-config/:key — 更新配置
 * POST /api/system-config/test-connection — 测试 Bitget API 连接
 * POST /api/system-config/export — 导出配置（JSON）
 */

import { Router, Request, Response, NextFunction } from 'express';
import { SystemConfigService } from '../services/system-config.service';
import { BitgetClientService } from '../services/bitget-client.service';
import { clearBitgetConfig } from '../config/bitget';
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

    // If Bitget API credentials changed, clear cached config
    if (['BITGET_API_KEY', 'BITGET_SECRET_KEY', 'BITGET_PASSPHRASE', 'BITGET_SIMULATED'].includes(key)) {
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
