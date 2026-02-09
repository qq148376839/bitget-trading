/**
 * 策略控制 REST API
 * 使用 StrategyManager 管理策略生命周期
 */

import { Router, Request, Response, NextFunction } from 'express';
import { StrategyManager } from '../strategy/strategy-manager';
import { AnyStrategyConfig } from '../types/strategy.types';
import { CapitalManagerService } from '../services/capital-manager.service';
import { FuturesAccountService } from '../services/futures-account.service';
import { AutoCalcService } from '../strategy/auto-calc.service';

const router = Router();

/**
 * POST /api/strategy/start
 * 启动策略
 * Body: 可选的配置覆盖参数（含 strategyType, tradingType）
 */
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const overrides = req.body as Partial<AnyStrategyConfig> | undefined;
    const manager = StrategyManager.getInstance();
    await manager.createAndStart(overrides);

    res.json({
      success: true,
      message: '策略已启动',
      data: manager.getState(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/strategy/stop
 * 停止策略
 */
router.post('/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const manager = StrategyManager.getInstance();
    await manager.stopActive();

    res.json({
      success: true,
      message: '策略已停止',
      data: manager.getState(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategy/status
 * 获取策略状态
 */
router.get('/status', async (req: Request, res: Response) => {
  const manager = StrategyManager.getInstance();
  const state = manager.getState();

  // 并行获取现货余额和合约余额
  const [spotResult, futuresResult] = await Promise.allSettled([
    new CapitalManagerService().getAvailableBalance('USDT'),
    new FuturesAccountService().getAvailableBalance('USDT-FUTURES', 'USDT'),
  ]);

  if (spotResult.status === 'fulfilled') {
    state.spotAvailableUsdt = spotResult.value;
  }
  if (futuresResult.status === 'fulfilled') {
    state.futuresAvailableUsdt = futuresResult.value;
  }

  res.json({
    success: true,
    data: state,
  });
});

/**
 * PUT /api/strategy/config
 * 运行时更新配置
 */
router.put('/config', (req: Request, res: Response, next: NextFunction) => {
  try {
    const changes = req.body as Record<string, unknown>;
    const manager = StrategyManager.getInstance();
    const strategy = manager.getActiveStrategy();

    if (!strategy) {
      // No active strategy, still allow config update via creating a temporary start
      res.status(400).json({
        success: false,
        error: { code: 'STRATEGY_NOT_RUNNING', message: '没有活跃的策略实例' },
      });
      return;
    }

    const newConfig = strategy.updateConfig(changes);

    res.json({
      success: true,
      message: '配置已更新',
      data: newConfig,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategy/orders
 * 查看追踪的订单
 */
router.get('/orders', (req: Request, res: Response) => {
  const manager = StrategyManager.getInstance();
  const strategy = manager.getActiveStrategy();
  const orders = strategy?.getTrackedOrders() || [];

  res.json({
    success: true,
    data: {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      filled: orders.filter(o => o.status === 'filled').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
      orders,
    },
  });
});

/**
 * POST /api/strategy/emergency-stop
 * 紧急停止（撤所有单）
 */
router.post('/emergency-stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const manager = StrategyManager.getInstance();
    await manager.emergencyStopActive();

    res.json({
      success: true,
      message: '紧急停止完成，所有挂单已撤销',
      data: manager.getState(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategy/pnl
 * 盈亏汇总
 */
router.get('/pnl', (req: Request, res: Response) => {
  const manager = StrategyManager.getInstance();
  const strategy = manager.getActiveStrategy();

  if (!strategy) {
    res.json({
      success: true,
      data: {
        realizedPnl: '0',
        unrealizedPnl: '0',
        dailyPnl: '0',
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: '0',
        avgWin: '0',
        avgLoss: '0',
      },
    });
    return;
  }

  res.json({
    success: true,
    data: strategy.getPnlSummary(),
  });
});

/**
 * GET /api/strategy/events
 * 策略事件日志
 */
router.get('/events', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const manager = StrategyManager.getInstance();
  const strategy = manager.getActiveStrategy();

  res.json({
    success: true,
    data: strategy?.getEvents(limit) || [],
  });
});

/**
 * POST /api/strategy/auto-calc
 * Simple mode: auto-calculate full config
 */
router.post('/auto-calc', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = req.body;
    const autoCalcService = new AutoCalcService();
    const result = await autoCalcService.calculate(input);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategy/bounds
 * Advanced mode: get dynamic parameter bounds
 */
router.get('/bounds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol, tradingType, strategyType } = req.query;
    const autoCalcService = new AutoCalcService();
    const bounds = await autoCalcService.getBounds(
      symbol as string || 'BTCUSDT',
      (tradingType as string || 'futures') as 'futures' | 'spot',
      (strategyType as string || 'scalping') as 'scalping' | 'grid'
    );

    res.json({
      success: true,
      data: bounds,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
