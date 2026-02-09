/**
 * 现货订单适配器
 * 将 OrderExecutionService 包装为 IOrderService
 */

import { IOrderService } from '../interfaces/i-order.service';
import { OrderExecutionService } from '../order-execution.service';
import { BitgetClientService } from '../bitget-client.service';
import {
  UnifiedPlaceOrderParams,
  UnifiedPlaceOrderResult,
  UnifiedCancelOrderParams,
  UnifiedBatchCancelParams,
  UnifiedBatchCancelResult,
  UnifiedPendingOrder,
  UnifiedOrderDetail,
} from '../../types/trading.types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('spot-order-adapter');

export class SpotOrderAdapter implements IOrderService {
  private service: OrderExecutionService;
  private client: BitgetClientService;

  constructor() {
    this.service = new OrderExecutionService();
    this.client = BitgetClientService.getInstance();
  }

  async placeOrder(params: UnifiedPlaceOrderParams): Promise<UnifiedPlaceOrderResult> {
    // 现货忽略 tradeSide, marginMode, marginCoin 等合约参数
    return this.service.placeOrder({
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      size: params.size,
      price: params.price,
      force: (params.force || 'gtc') as 'gtc' | 'post_only' | 'fok' | 'ioc',
      clientOid: params.clientOid,
    });
  }

  async cancelOrder(params: UnifiedCancelOrderParams): Promise<void> {
    await this.service.cancelOrder(params.symbol, params.orderId);
  }

  async batchCancelOrders(params: UnifiedBatchCancelParams): Promise<UnifiedBatchCancelResult> {
    // 现货批量撤单通过 Bitget batch API
    if (params.orderIdList.length === 0) {
      return { successList: [], failureList: [] };
    }

    try {
      const response = await this.client.post<{
        successList: Array<{ orderId: string; clientOid: string }>;
        failureList: Array<{ orderId: string; clientOid: string; errorMsg: string; errorCode: string }>;
      }>('/api/v2/spot/trade/batch-cancel-order', {
        symbol: params.symbol,
        orderList: params.orderIdList,
      });
      return response.data;
    } catch (error) {
      // 降级：逐个撤单
      logger.warn('现货批量撤单失败，降级为逐个撤单', { error: String(error) });
      const successList: Array<{ orderId: string; clientOid: string }> = [];
      const failureList: Array<{ orderId: string; clientOid: string; errorMsg: string; errorCode: string }> = [];

      for (const item of params.orderIdList) {
        try {
          await this.service.cancelOrder(params.symbol, item.orderId);
          successList.push({ orderId: item.orderId, clientOid: '' });
        } catch (err) {
          failureList.push({
            orderId: item.orderId,
            clientOid: '',
            errorMsg: String(err),
            errorCode: 'CANCEL_FAILED',
          });
        }
      }

      return { successList, failureList };
    }
  }

  async getPendingOrders(symbol: string): Promise<UnifiedPendingOrder[]> {
    // 现货挂单查询
    const response = await this.client.get<{
      orderList?: Array<{
        symbol: string;
        orderId: string;
        clientOid: string;
        size: string;
        baseVolume: string;
        price: string;
        side: string;
        orderType: string;
        cTime: string;
      }>;
    }>('/api/v2/spot/trade/unfilled-orders', { symbol });

    const orders = response.data.orderList || [];
    return orders.map(o => ({
      symbol: o.symbol,
      orderId: o.orderId,
      clientOid: o.clientOid,
      size: o.size,
      filledQty: o.baseVolume || '0',
      price: o.price,
      side: o.side as 'buy' | 'sell',
      orderType: o.orderType,
      cTime: o.cTime,
    }));
  }

  async getOrderDetail(symbol: string, orderId: string): Promise<UnifiedOrderDetail> {
    const info = await this.service.getOrderInfo(orderId);

    // 现货状态映射到统一状态
    const stateMap: Record<string, string> = {
      live: 'live',
      new: 'live',
      partially_filled: 'partially_filled',
      filled: 'filled',
      cancelled: 'cancelled',
      canceled: 'cancelled',
    };

    return {
      orderId: info.orderId,
      clientOid: info.clientOid,
      symbol: info.symbol,
      size: info.size,
      filledQty: info.baseVolume || '0',
      price: info.price,
      side: info.side as 'buy' | 'sell',
      state: stateMap[info.status] || info.status,
    };
  }
}
