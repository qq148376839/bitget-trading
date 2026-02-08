/**
 * 订单执行服务
 * 负责下单、撤单、查询订单
 */

import { BitgetClientService } from './bitget-client.service';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('order-execution');

export interface PlaceOrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  force: 'gtc' | 'post_only' | 'fok' | 'ioc';
  size: string;
  price?: string;
  clientOid?: string;
}

export interface PlaceOrderResult {
  orderId: string;
  clientOid: string;
}

export interface OrderInfo {
  userId: string;
  symbol: string;
  orderId: string;
  clientOid: string;
  price: string;
  size: string;
  orderType: string;
  side: string;
  status: string;
  priceAvg: string;
  baseVolume: string;
  quoteVolume: string;
  enterPointSource: string;
  feeDetail: Record<string, unknown>;
  orderSource: string;
  cTime: string;
  uTime: string;
}

export interface CancelOrderResult {
  orderId: string;
  clientOid: string;
}

export class OrderExecutionService {
  private client: BitgetClientService;

  constructor() {
    this.client = BitgetClientService.getInstance();
  }

  /**
   * 现货下单
   */
  async placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
    // 验证必要参数
    if (!params.symbol || !params.side || !params.orderType || !params.force || !params.size) {
      throw new AppError(
        ErrorCode.ORDER_INVALID_PARAMS,
        '下单参数不完整',
        { params },
        400
      );
    }

    // 限价单必须有价格
    if (params.orderType === 'limit' && !params.price) {
      throw new AppError(
        ErrorCode.ORDER_INVALID_PARAMS,
        '限价单必须指定价格',
        { params },
        400
      );
    }

    logger.info('提交现货订单', {
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      size: params.size,
      price: params.price,
    });

    const response = await this.client.post<PlaceOrderResult>(
      '/api/v2/spot/trade/place-order',
      params as unknown as Record<string, unknown>
    );

    logger.info('订单提交成功', {
      orderId: response.data.orderId,
      clientOid: response.data.clientOid,
    });

    return response.data;
  }

  /**
   * 撤销订单
   */
  async cancelOrder(symbol: string, orderId: string): Promise<CancelOrderResult> {
    logger.info('撤销订单', { symbol, orderId });

    const response = await this.client.post<CancelOrderResult>(
      '/api/v2/spot/trade/cancel-order',
      { symbol, orderId }
    );

    logger.info('订单撤销成功', { orderId: response.data.orderId });
    return response.data;
  }

  /**
   * 查询订单详情
   */
  async getOrderInfo(orderId?: string, clientOid?: string): Promise<OrderInfo> {
    if (!orderId && !clientOid) {
      throw new AppError(
        ErrorCode.ORDER_INVALID_PARAMS,
        '必须提供 orderId 或 clientOid',
        {},
        400
      );
    }

    const params: Record<string, string> = {};
    if (orderId) params.orderId = orderId;
    if (clientOid) params.clientOid = clientOid;

    const response = await this.client.get<OrderInfo>(
      '/api/v2/spot/trade/orderInfo',
      params
    );

    return response.data;
  }
}
