/**
 * 健康检查路由
 */

import { Router, Request, Response } from 'express';
import { AccountTypeDetectorService } from '../services/account-type-detector.service';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const accountType = AccountTypeDetectorService.getInstance().getAccountType();
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'bitget-trading-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      accountType: accountType || 'unknown',
    },
  });
});

export default router;
