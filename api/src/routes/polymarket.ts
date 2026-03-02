/**
 * Polymarket 预测市场信号 REST API
 */

import { Router, Request, Response, NextFunction } from 'express';
import { PolymarketSignalService } from '../services/polymarket-signal.service';
import { SystemConfigService } from '../services/system-config.service';
import { AppError, ErrorCode } from '../utils/errors';
import { PolymarketSignalConfig, PolymarketWatchItem } from '../types/polymarket.types';

const router = Router();

const POLYMARKET_CONFIG_KEY = 'polymarket_signal_config';

/**
 * GET /api/polymarket/signal
 * 当前信号快照
 */
router.get('/signal', (req: Request, res: Response) => {
  const service = PolymarketSignalService.getInstance();
  res.json({
    success: true,
    data: service.getSignal(),
  });
});

/**
 * GET /api/polymarket/config
 * 当前配置
 */
router.get('/config', (req: Request, res: Response) => {
  const service = PolymarketSignalService.getInstance();
  res.json({
    success: true,
    data: service.getConfig(),
  });
});

/**
 * PUT /api/polymarket/config
 * 更新配置（持久化到 SystemConfigService）
 */
router.put('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = req.body as Partial<PolymarketSignalConfig>;

    // 基础验证
    if (updates.pollIntervalMs !== undefined && updates.pollIntervalMs < 30000) {
      throw new AppError(
        ErrorCode.POLYMARKET_CONFIG_INVALID,
        '轮询间隔不能小于 30 秒',
        { pollIntervalMs: updates.pollIntervalMs },
        400
      );
    }

    if (updates.sensitivityMultiplier !== undefined &&
        (updates.sensitivityMultiplier < 0.1 || updates.sensitivityMultiplier > 10)) {
      throw new AppError(
        ErrorCode.POLYMARKET_CONFIG_INVALID,
        '灵敏度乘数范围 0.1 - 10',
        { sensitivityMultiplier: updates.sensitivityMultiplier },
        400
      );
    }

    const service = PolymarketSignalService.getInstance();
    service.updateConfig(updates);

    // 持久化到 DB
    try {
      const configService = SystemConfigService.getInstance();
      await configService.set(
        POLYMARKET_CONFIG_KEY,
        JSON.stringify(service.getConfig()),
        { description: 'Polymarket 信号配置' }
      );
    } catch (err) {
      // 持久化失败不阻塞配置更新
    }

    res.json({
      success: true,
      data: service.getConfig(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/polymarket/poll
 * 手动触发轮询
 */
router.post('/poll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const service = PolymarketSignalService.getInstance();
    const signal = await service.pollNow();
    res.json({
      success: true,
      data: signal,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/polymarket/search?q=xxx
 * 搜索 Polymarket 市场
 */
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req.query.q as string) || '';
    const service = PolymarketSignalService.getInstance();
    const results = await service.searchMarkets(query);
    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/polymarket/watchlist
 * 添加监控市场
 */
router.post('/watchlist', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = req.body as PolymarketWatchItem;

    if (!item.conditionId || !item.label) {
      throw new AppError(
        ErrorCode.POLYMARKET_CONFIG_INVALID,
        '缺少 conditionId 或 label',
        {},
        400
      );
    }

    const service = PolymarketSignalService.getInstance();
    const config = service.getConfig();

    // 去重
    if (config.watchList.some(w => w.conditionId === item.conditionId)) {
      throw new AppError(
        ErrorCode.POLYMARKET_CONFIG_INVALID,
        '该市场已在监控列表中',
        { conditionId: item.conditionId },
        400
      );
    }

    const newWatchList = [...config.watchList, {
      conditionId: item.conditionId,
      label: item.label,
      category: item.category || 'custom',
      impactDirection: item.impactDirection || 'bearish',
      weight: item.weight ?? 0.3,
      deltaThresholdPercent: item.deltaThresholdPercent ?? 5,
    }];

    service.updateConfig({ watchList: newWatchList });

    // 持久化
    try {
      const configService = SystemConfigService.getInstance();
      await configService.set(
        POLYMARKET_CONFIG_KEY,
        JSON.stringify(service.getConfig()),
        { description: 'Polymarket 信号配置' }
      );
    } catch {
      // 不阻塞
    }

    res.json({
      success: true,
      data: service.getConfig(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/polymarket/watchlist/:conditionId
 * 移除监控市场
 */
router.delete('/watchlist/:conditionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conditionId } = req.params;
    const service = PolymarketSignalService.getInstance();
    const config = service.getConfig();

    const newWatchList = config.watchList.filter(w => w.conditionId !== conditionId);

    if (newWatchList.length === config.watchList.length) {
      throw new AppError(
        ErrorCode.POLYMARKET_CONFIG_INVALID,
        '未找到该监控市场',
        { conditionId },
        400
      );
    }

    service.updateConfig({ watchList: newWatchList });

    // 持久化
    try {
      const configService = SystemConfigService.getInstance();
      await configService.set(
        POLYMARKET_CONFIG_KEY,
        JSON.stringify(service.getConfig()),
        { description: 'Polymarket 信号配置' }
      );
    } catch {
      // 不阻塞
    }

    res.json({
      success: true,
      data: service.getConfig(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
