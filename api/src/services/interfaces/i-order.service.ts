/**
 * 统一订单服务接口
 * 合约/现货适配器实现此接口
 */

import {
  UnifiedPlaceOrderParams,
  UnifiedPlaceOrderResult,
  UnifiedCancelOrderParams,
  UnifiedBatchCancelParams,
  UnifiedBatchCancelResult,
  UnifiedPendingOrder,
  UnifiedOrderDetail,
} from '../../types/trading.types';

export interface IOrderService {
  placeOrder(params: UnifiedPlaceOrderParams): Promise<UnifiedPlaceOrderResult>;
  cancelOrder(params: UnifiedCancelOrderParams): Promise<void>;
  batchCancelOrders(params: UnifiedBatchCancelParams): Promise<UnifiedBatchCancelResult>;
  getPendingOrders(symbol: string): Promise<UnifiedPendingOrder[]>;
  getOrderDetail(symbol: string, orderId: string): Promise<UnifiedOrderDetail>;
}
