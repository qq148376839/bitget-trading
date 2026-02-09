/**
 * 合约规格 REST API
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ContractSpecService } from '../services/contract-spec.service';
import { ProductType } from '../types/futures.types';

const router = Router();

/**
 * GET /api/contracts/specs/:symbol
 * 获取单个交易对规格
 */
router.get('/specs/:symbol', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol } = req.params;
    const productType = (req.query.productType as ProductType) || 'USDT-FUTURES';
    const service = ContractSpecService.getInstance();
    const spec = await service.getSpec(symbol, productType);

    res.json({ success: true, data: spec });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/contracts/specs
 * 列出已缓存规格
 */
router.get('/specs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productType = (req.query.productType as ProductType) || 'USDT-FUTURES';
    const service = ContractSpecService.getInstance();
    const contracts = await service.fetchAllContracts(productType);

    res.json({
      success: true,
      data: contracts.map(c => ({
        symbol: c.symbol,
        baseCoin: c.baseCoin,
        quoteCoin: c.quoteCoin,
        pricePlace: c.pricePlace,
        volumePlace: c.volumePlace,
        minTradeNum: c.minTradeNum,
        sizeMultiplier: c.sizeMultiplier,
      })),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
