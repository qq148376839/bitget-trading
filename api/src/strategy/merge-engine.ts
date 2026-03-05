/**
 * 挂单合并引擎
 * 当挂单数超过阈值时，合并最早的出场单为一个加权平均价的合并单
 * 支持方向感知：只合并同方向的出场单
 */

import { TrackedOrder, ScalpingStrategyConfig } from '../types/strategy.types';
import { IOrderService } from '../services/interfaces/i-order.service';
import { OrderStateTracker, EntryDirection } from './order-state-tracker';
import { HoldMode } from '../services/futures-account.service';
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
  private orderService: IOrderService;
  private tracker: OrderStateTracker;
  private config: ScalpingStrategyConfig;
  private holdMode: HoldMode;
  private merging = false;

  constructor(
    orderService: IOrderService,
    tracker: OrderStateTracker,
    config: ScalpingStrategyConfig,
    holdMode: HoldMode = 'single_hold'
  ) {
    this.orderService = orderService;
    this.tracker = tracker;
    this.config = config;
    this.holdMode = holdMode;
  }

  updateConfig(config: ScalpingStrategyConfig): void {
    this.config = config;
  }

  updateHoldMode(holdMode: HoldMode): void {
    this.holdMode = holdMode;
  }

  /**
   * 检查指定方向是否需要合并
   * 无方向参数时检查所有出场单（向后兼容）
   */
  needsMerge(direction?: EntryDirection): boolean {
    const pendingExits = direction
      ? this.tracker.getPendingExitOrders(direction)
      : this.tracker.getPendingSellOrders();
    return pendingExits.length >= this.config.maxPendingOrders;
  }

  /**
   * 执行合并（方向感知）
   * 取指定方向最早 mergeThreshold 个出场单 → 批量撤单 → 加权平均价 → 挂一个合并单
   */
  async mergeExitOrders(direction?: EntryDirection): Promise<MergeResult | null> {
    if (this.merging) {
      logger.warn('正在合并中，跳过');
      return null;
    }

    this.merging = true;

    try {
      const pendingExits = direction
        ? this.tracker.getPendingExitOrders(direction)
        : this.tracker.getPendingSellOrders();
      if (pendingExits.length < this.config.mergeThreshold) {
        return null;
      }

      const toMerge = pendingExits.slice(0, this.config.mergeThreshold);

      // 从被合并订单推断方向和出场 side
      const mergeDirection: EntryDirection = direction
        || (toMerge[0].direction === 'short' ? 'short' : 'long');
      const exitSide = mergeDirection === 'short' ? 'buy' : 'sell';

      logger.info('开始合并出场单', {
        count: toMerge.length,
        direction: mergeDirection,
        exitSide,
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

      const avgPriceStr = avgPrice.toFixed(this.config.pricePrecision);
      const totalSizeStr = totalSize.toFixed(this.config.sizePrecision);

      // 批量撤单
      const orderIds = toMerge.map(o => o.orderId);
      const cancelledIds: string[] = [];

      for (let i = 0; i < orderIds.length; i += 50) {
        const batch = orderIds.slice(i, i + 50);
        const result = await this.orderService.batchCancelOrders({
          symbol: this.config.symbol,
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

      // 挂合并后的出场单
      const clientOid = `scalp_${this.config.symbol}_${mergeDirection}_merge_${exitSide}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const placeResult = await this.orderService.placeOrder({
        symbol: this.config.symbol,
        size: totalSizeStr,
        side: exitSide,
        orderType: 'limit',
        price: avgPriceStr,
        force: 'post_only',
        tradeSide: (this.config.tradingType === 'futures' && this.holdMode === 'double_hold') ? 'close' : undefined,
        clientOid,
      });

      // 追踪合并后的新订单
      this.tracker.addOrder({
        orderId: placeResult.orderId,
        clientOid,
        side: exitSide,
        price: avgPriceStr,
        size: totalSizeStr,
        status: 'pending',
        linkedOrderId: null,
        direction: mergeDirection,
        orderRole: 'exit',
        createdAt: Date.now(),
        filledAt: null,
      });

      logger.info('出场单合并完成', {
        mergedCount: cancelledIds.length,
        direction: mergeDirection,
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

  /**
   * 向后兼容：mergeSellOrders
   */
  async mergeSellOrders(): Promise<MergeResult | null> {
    return this.mergeExitOrders();
  }
}
