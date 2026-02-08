/**
 * 订单管理路由
 */

import { Router, Request, Response, NextFunction } from 'express';
import { OrderExecutionService, PlaceOrderParams } from '../services/order-execution.service';

const router = Router();

/**
 * POST /api/orders/place
 * 现货下单
 */
router.post('/place', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params: PlaceOrderParams = req.body;
    const service = new OrderExecutionService();
    const result = await service.placeOrder(params);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/orders/cancel
 * 撤销订单
 */
router.post('/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol, orderId } = req.body;
    const service = new OrderExecutionService();
    const result = await service.cancelOrder(symbol, orderId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/:orderId
 * 查询订单详情
 */
router.get('/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params;
    const service = new OrderExecutionService();
    const result = await service.getOrderInfo(orderId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
