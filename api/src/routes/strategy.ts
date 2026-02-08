/**
 * 策略控制 REST API
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ScalpingStrategyEngine } from '../strategy/scalping-strategy.engine';
import { ScalpingStrategyConfig } from '../types/strategy.types';

const router = Router();

/**
 * POST /api/strategy/start
 * 启动策略
 * Body: 可选的配置覆盖参数
 */
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const overrides = req.body as Partial<ScalpingStrategyConfig> | undefined;
    const engine = ScalpingStrategyEngine.getInstance();
    await engine.start(overrides);

    res.json({
      success: true,
      message: '策略已启动',
      data: engine.getState(),
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
    const engine = ScalpingStrategyEngine.getInstance();
    await engine.stop();

    res.json({
      success: true,
      message: '策略已停止',
      data: engine.getState(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strategy/status
 * 获取策略状态
 */
router.get('/status', (req: Request, res: Response) => {
  const engine = ScalpingStrategyEngine.getInstance();
  res.json({
    success: true,
    data: engine.getState(),
  });
});

/**
 * PUT /api/strategy/config
 * 运行时更新配置
 */
router.put('/config', (req: Request, res: Response, next: NextFunction) => {
  try {
    const changes = req.body as Partial<ScalpingStrategyConfig>;
    const engine = ScalpingStrategyEngine.getInstance();
    const newConfig = engine.updateConfig(changes);

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
  const engine = ScalpingStrategyEngine.getInstance();
  const orders = engine.getTrackedOrders();

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
    const engine = ScalpingStrategyEngine.getInstance();
    await engine.emergencyStop();

    res.json({
      success: true,
      message: '紧急停止完成，所有挂单已撤销',
      data: engine.getState(),
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
  const engine = ScalpingStrategyEngine.getInstance();
  res.json({
    success: true,
    data: engine.getPnlSummary(),
  });
});

/**
 * GET /api/strategy/events
 * 策略事件日志
 */
router.get('/events', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const engine = ScalpingStrategyEngine.getInstance();
  res.json({
    success: true,
    data: engine.getEvents(limit),
  });
});

export default router;
