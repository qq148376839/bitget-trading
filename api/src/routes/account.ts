/**
 * 账户资产路由
 */

import { Router, Request, Response, NextFunction } from 'express';
import { CapitalManagerService } from '../services/capital-manager.service';

const router = Router();

/**
 * GET /api/account/assets
 * 获取账户资产
 * 可选参数: ?coin=USDT
 */
router.get('/assets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const coin = req.query.coin as string | undefined;
    const service = new CapitalManagerService();
    const assets = await service.getAccountAssets(coin);

    res.json({
      success: true,
      data: assets,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/account/balance/:coin
 * 获取指定币种的可用余额
 */
router.get('/balance/:coin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { coin } = req.params;
    const service = new CapitalManagerService();
    const available = await service.getAvailableBalance(coin);

    res.json({
      success: true,
      data: { coin, available },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
