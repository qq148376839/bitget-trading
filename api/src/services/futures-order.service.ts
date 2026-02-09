/**
 * 合约订单服务
 * 提供下单、撤单、批量撤单、挂单查询
 */

import { BitgetClientService } from './bitget-client.service';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';
import {
  FuturesPlaceOrderParams,
  FuturesPlaceOrderResult,
  FuturesCancelOrderParams,
  FuturesBatchCancelParams,
  FuturesBatchCancelResult,
  FuturesPendingOrder,
  FuturesOrderDetail,
  ProductType,
} from '../types/futures.types';

const logger = createLogger('futures-order');

export class FuturesOrderService {
  private client: BitgetClientService;

  constructor() {
    this.client = BitgetClientService.getInstance();
  }

  /**
   * 合约下单
   */
  async placeOrder(params: FuturesPlaceOrderParams): Promise<FuturesPlaceOrderResult> {
    const sizeNum = parseFloat(params.size);
    if (!params.size || isNaN(sizeNum) || sizeNum <= 0) {
      throw new AppError(
        ErrorCode.ORDER_INVALID_PARAMS,
        `下单数量无效: size=${params.size}，请检查 orderAmountUsdt 和 sizePrecision 配置`,
        { size: params.size },
        400
      );
    }

    logger.info('合约下单', {
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      price: params.price,
      size: params.size,
      force: params.force,
      tradeSide: (params as unknown as Record<string, unknown>).tradeSide,
      requestBody: JSON.stringify(params),
    });

    try {
      const response = await this.client.post<FuturesPlaceOrderResult>(
        '/api/v2/mix/order/place-order',
        params as unknown as Record<string, unknown>
      );
      logger.info('合约下单成功', { orderId: response.data.orderId, clientOid: response.data.clientOid });
      return response.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        ErrorCode.FUTURES_ORDER_FAILED,
        `合约下单失败: ${String(error)}`,
        { params },
        500
      );
    }
  }

  /**
   * 合约撤单
   */
  async cancelOrder(params: FuturesCancelOrderParams): Promise<void> {
    logger.info('合约撤单', { symbol: params.symbol, orderId: params.orderId });

    try {
      await this.client.post(
        '/api/v2/mix/order/cancel-order',
        params as unknown as Record<string, unknown>
      );
      logger.info('合约撤单成功', { orderId: params.orderId });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        ErrorCode.FUTURES_CANCEL_FAILED,
        `合约撤单失败: ${String(error)}`,
        { params },
        500
      );
    }
  }

  /**
   * 批量撤单（最多 50 单）
   */
  async batchCancelOrders(params: FuturesBatchCancelParams): Promise<FuturesBatchCancelResult> {
    const orderCount = params.orderIdList.length;
    if (orderCount === 0) {
      return { successList: [], failureList: [] };
    }
    if (orderCount > 50) {
      throw new AppError(
        ErrorCode.FUTURES_BATCH_CANCEL_FAILED,
        '批量撤单最多 50 单',
        { count: orderCount },
        400
      );
    }

    logger.info('合约批量撤单', { symbol: params.symbol, count: orderCount });

    try {
      const response = await this.client.post<FuturesBatchCancelResult>(
        '/api/v2/mix/order/batch-cancel-orders',
        params as unknown as Record<string, unknown>
      );
      const result = response.data;
      logger.info('合约批量撤单完成', {
        success: result.successList.length,
        failure: result.failureList.length,
      });
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        ErrorCode.FUTURES_BATCH_CANCEL_FAILED,
        `合约批量撤单失败: ${String(error)}`,
        { params },
        500
      );
    }
  }

  /**
   * 查询当前挂单
   */
  async getPendingOrders(
    symbol: string,
    productType: ProductType
  ): Promise<FuturesPendingOrder[]> {
    const response = await this.client.get<{ entrustedList: FuturesPendingOrder[] }>(
      '/api/v2/mix/order/orders-pending',
      { symbol, productType }
    );
    return response.data.entrustedList || [];
  }

  /**
   * 查询订单详情（用于确认订单真实状态：filled / cancelled）
   */
  async getOrderDetail(
    symbol: string,
    productType: ProductType,
    orderId: string
  ): Promise<FuturesOrderDetail> {
    const response = await this.client.get<FuturesOrderDetail>(
      '/api/v2/mix/order/detail',
      { symbol, productType, orderId }
    );
    return response.data;
  }
}
