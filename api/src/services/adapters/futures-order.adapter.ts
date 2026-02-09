/**
 * 合约订单适配器
 * 将 FuturesOrderService 包装为 IOrderService
 */

import { IOrderService } from '../interfaces/i-order.service';
import { FuturesOrderService } from '../futures-order.service';
import {
  UnifiedPlaceOrderParams,
  UnifiedPlaceOrderResult,
  UnifiedCancelOrderParams,
  UnifiedBatchCancelParams,
  UnifiedBatchCancelResult,
  UnifiedPendingOrder,
  UnifiedOrderDetail,
} from '../../types/trading.types';
import { ProductType, MarginMode } from '../../types/futures.types';

export class FuturesOrderAdapter implements IOrderService {
  private service: FuturesOrderService;
  private productType: ProductType;
  private marginMode: MarginMode;
  private marginCoin: string;

  constructor(productType: ProductType, marginMode: MarginMode, marginCoin: string) {
    this.service = new FuturesOrderService();
    this.productType = productType;
    this.marginMode = marginMode;
    this.marginCoin = marginCoin;
  }

  async placeOrder(params: UnifiedPlaceOrderParams): Promise<UnifiedPlaceOrderResult> {
    // 构建请求参数，单向持仓模式下 tradeSide 为 undefined 时不传该字段
    const orderParams: Record<string, unknown> = {
      symbol: params.symbol,
      productType: params.productType || this.productType,
      marginMode: params.marginMode || this.marginMode,
      marginCoin: params.marginCoin || this.marginCoin,
      size: params.size,
      side: params.side,
      orderType: params.orderType,
      price: params.price,
      force: params.force,
      clientOid: params.clientOid,
    };
    // 仅在有值时添加 tradeSide（避免发送 tradeSide: undefined/null）
    if (params.tradeSide) {
      orderParams.tradeSide = params.tradeSide;
    }
    return this.service.placeOrder(orderParams as unknown as import('../../types/futures.types').FuturesPlaceOrderParams);
  }

  async cancelOrder(params: UnifiedCancelOrderParams): Promise<void> {
    await this.service.cancelOrder({
      symbol: params.symbol,
      productType: params.productType as ProductType || this.productType,
      orderId: params.orderId,
    });
  }

  async batchCancelOrders(params: UnifiedBatchCancelParams): Promise<UnifiedBatchCancelResult> {
    return this.service.batchCancelOrders({
      symbol: params.symbol,
      productType: params.productType as ProductType || this.productType,
      orderIdList: params.orderIdList,
    });
  }

  async getPendingOrders(symbol: string): Promise<UnifiedPendingOrder[]> {
    const orders = await this.service.getPendingOrders(symbol, this.productType);
    return orders.map(o => ({
      symbol: o.symbol,
      orderId: o.orderId,
      clientOid: o.clientOid,
      size: o.size,
      filledQty: o.filledQty,
      price: o.price,
      side: o.side,
      orderType: o.orderType,
      cTime: o.cTime,
    }));
  }

  async getOrderDetail(symbol: string, orderId: string): Promise<UnifiedOrderDetail> {
    const detail = await this.service.getOrderDetail(symbol, this.productType, orderId);
    return {
      orderId: detail.orderId,
      clientOid: detail.clientOid,
      symbol: detail.symbol,
      size: detail.size,
      filledQty: detail.filledQty,
      price: detail.price,
      side: detail.side,
      state: detail.state,
    };
  }
}
