/**
 * 统一交易对规格 REST API
 */

import { Router, Request, Response, NextFunction } from 'express';
import { InstrumentSpecService } from '../services/instrument-spec.service';
import { TradingType } from '../types/trading.types';
import { AppError, ErrorCode } from '../utils/errors';

const router = Router();

/**
 * 校验 tradingType 查询参数
 */
function parseTradingType(raw: unknown): TradingType {
  if (raw === 'spot' || raw === 'futures') {
    return raw;
  }
  throw new AppError(
    ErrorCode.VALIDATION_ERROR,
    'tradingType 参数无效，必须为 futures 或 spot',
    { received: raw },
    400
  );
}

/**
 * GET /api/instruments
 * 搜索交易对
 * Query: tradingType=futures|spot, search=BTC
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tradingType = parseTradingType(req.query.tradingType || 'futures');
    const search = req.query.search as string | undefined;
    const service = InstrumentSpecService.getInstance();
    const specs = await service.listAvailable(tradingType, search);

    res.json({ success: true, data: specs });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/instruments/hot
 * 获取热门交易对
 * Query: tradingType=futures|spot
 */
router.get('/hot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tradingType = parseTradingType(req.query.tradingType || 'futures');
    const service = InstrumentSpecService.getInstance();
    const specs = await service.getHotPairs(tradingType);

    res.json({ success: true, data: specs });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/instruments/:symbol
 * 获取单个交易对规格
 * Query: tradingType=futures|spot
 */
router.get('/:symbol', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const tradingType = parseTradingType(req.query.tradingType || 'futures');
    const service = InstrumentSpecService.getInstance();
    const spec = await service.getSpec(symbol, tradingType);

    res.json({ success: true, data: spec });
  } catch (error) {
    next(error);
  }
});

export default router;
