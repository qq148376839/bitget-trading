/**
 * 挂单合并引擎
 * 当挂单数超过阈值时，合并最早的卖单为一个加权平均价的合并单
 */

import { TrackedOrder, ScalpingStrategyConfig } from '../types/strategy.types';
import { FuturesOrderService } from '../services/futures-order.service';
import { OrderStateTracker } from './order-state-tracker';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('merge-engine');

export interface MergeResult {
  mergedCount: number;
  cancelledOrderIds: string[];
  newOrderId: string | null;
  avgPrice: string;
  totalSize: string;
}

export class MergeEngine {
  private orderService: FuturesOrderService;
  private tracker: OrderStateTracker;
  private config: ScalpingStrategyConfig;
  private merging = false;

  constructor(
    orderService: FuturesOrderService,
    tracker: OrderStateTracker,
    config: ScalpingStrategyConfig
  ) {
    this.orderService = orderService;
    this.tracker = tracker;
    this.config = config;
  }

  updateConfig(config: ScalpingStrategyConfig): void {
    this.config = config;
  }

  /**
   * 检查是否需要合并
   */
  needsMerge(): boolean {
    const pendingSells = this.tracker.getPendingSellOrders();
    return pendingSells.length >= this.config.maxPendingOrders;
  }

  /**
   * 执行合并：取最早 mergeThreshold 个卖单 → 批量撤单 → 加权平均价 → 挂一个合并单
   */
  async mergeSellOrders(): Promise<MergeResult | null> {
    if (this.merging) {
      logger.warn('正在合并中，跳过');
      return null;
    }

    this.merging = true;

    try {
      const pendingSells = this.tracker.getPendingSellOrders();
      if (pendingSells.length < this.config.mergeThreshold) {
        return null;
      }

      // 取最早的 mergeThreshold 个卖单
      const toMerge = pendingSells.slice(0, this.config.mergeThreshold);

      logger.info('开始合并卖单', {
        count: toMerge.length,
        firstOrderId: toMerge[0].orderId,
        lastOrderId: toMerge[toMerge.length - 1].orderId,
      });

      // 计算加权平均价和总数量
      let totalValue = 0;
      let totalSize = 0;
      for (const order of toMerge) {
        const price = parseFloat(order.price);
        const size = parseFloat(order.size);
        totalValue += price * size;
        totalSize += size;
      }
      const avgPrice = totalSize > 0 ? totalValue / totalSize : 0;

      // 按精度截断
      const avgPriceStr = avgPrice.toFixed(this.config.pricePrecision);
      const totalSizeStr = totalSize.toFixed(this.config.sizePrecision);

      // 批量撤单（每批最多 50 单）
      const orderIds = toMerge.map(o => o.orderId);
      const cancelledIds: string[] = [];

      for (let i = 0; i < orderIds.length; i += 50) {
        const batch = orderIds.slice(i, i + 50);
        const result = await this.orderService.batchCancelOrders({
          symbol: this.config.symbol,
          productType: this.config.productType,
          orderIdList: batch.map(id => ({ orderId: id })),
        });

        for (const s of result.successList) {
          cancelledIds.push(s.orderId);
          this.tracker.markCancelled(s.orderId);
        }

        if (result.failureList.length > 0) {
          logger.warn('部分撤单失败', { failures: result.failureList });
        }
      }

      if (cancelledIds.length === 0) {
        throw new AppError(
          ErrorCode.STRATEGY_MERGE_FAILED,
          '合并失败：所有撤单请求都失败了',
          { orderIds },
          500
        );
      }

      // 挂合并后的卖单
      const clientOid = `scalp_${this.config.symbol}_merge_sell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const placeResult = await this.orderService.placeOrder({
        symbol: this.config.symbol,
        productType: this.config.productType,
        marginMode: this.config.marginMode,
        marginCoin: this.config.marginCoin,
        size: totalSizeStr,
        side: 'sell',
        orderType: 'limit',
        price: avgPriceStr,
        force: 'post_only',
        tradeSide: 'close',
        clientOid,
      });

      // 追踪合并后的新订单
      this.tracker.addOrder({
        orderId: placeResult.orderId,
        clientOid,
        side: 'sell',
        price: avgPriceStr,
        size: totalSizeStr,
        status: 'pending',
        linkedOrderId: null,
        direction: this.config.direction,
        createdAt: Date.now(),
        filledAt: null,
      });

      logger.info('卖单合并完成', {
        mergedCount: cancelledIds.length,
        newOrderId: placeResult.orderId,
        avgPrice: avgPriceStr,
        totalSize: totalSizeStr,
      });

      return {
        mergedCount: cancelledIds.length,
        cancelledOrderIds: cancelledIds,
        newOrderId: placeResult.orderId,
        avgPrice: avgPriceStr,
        totalSize: totalSizeStr,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        ErrorCode.STRATEGY_MERGE_FAILED,
        `挂单合并失败: ${String(error)}`,
        {},
        500
      );
    } finally {
      this.merging = false;
    }
  }
}
