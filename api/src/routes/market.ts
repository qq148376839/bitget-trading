/**
 * 市场数据路由
 */

import { Router, Request, Response, NextFunction } from 'express';
import { MarketDataService, Granularity } from '../services/market-data.service';

const router = Router();

/**
 * GET /api/market/tickers
 * 获取行情数据
 * 可选参数: ?symbol=BTCUSDT
 */
router.get('/tickers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbol = req.query.symbol as string | undefined;
    const service = new MarketDataService();
    const tickers = await service.getTickers(symbol);

    res.json({
      success: true,
      data: tickers,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/market/candles
 * 获取 K 线数据
 * 必选参数: ?symbol=BTCUSDT&granularity=1h
 * 可选参数: &startTime=xxx&endTime=xxx&limit=100
 */
router.get('/candles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol, granularity, startTime, endTime, limit } = req.query;

    if (!symbol || !granularity) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '必须提供 symbol 和 granularity 参数',
        },
      });
      return;
    }

    const service = new MarketDataService();
    const candles = await service.getCandles(
      symbol as string,
      granularity as Granularity,
      {
        startTime: startTime as string | undefined,
        endTime: endTime as string | undefined,
        limit: limit as string | undefined,
      }
    );

    res.json({
      success: true,
      data: candles,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
