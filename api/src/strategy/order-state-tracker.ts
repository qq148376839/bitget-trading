/**
 * 订单状态追踪器
 * 内存管理所有策略挂单，通过对账发现成交
 */

import { TrackedOrder, TrackedOrderSide, TrackedOrderStatus } from '../types/strategy.types';
import { createLogger } from '../utils/logger';

const logger = createLogger('order-tracker');

export interface ReconcileResult {
  filledBuyOrders: TrackedOrder[];
  filledSellOrders: TrackedOrder[];
  cancelledOrders: TrackedOrder[];
}

/** 对账时发现从交易所消失的订单（需进一步确认状态） */
export interface DisappearedOrder {
  order: TrackedOrder;
}

export class OrderStateTracker {
  private orders: Map<string, TrackedOrder> = new Map();
  private activeBuyOrderId: string | null = null;

  /**
   * 添加追踪订单
   */
  addOrder(order: TrackedOrder): void {
    this.orders.set(order.orderId, order);
    if (order.side === 'buy' && order.status === 'pending') {
      this.activeBuyOrderId = order.orderId;
    }
    logger.debug('追踪新订单', { orderId: order.orderId, side: order.side, price: order.price });
  }

  /**
   * 获取订单
   */
  getOrder(orderId: string): TrackedOrder | undefined {
    return this.orders.get(orderId);
  }

  /**
   * 获取当前活跃买单 ID
   */
  getActiveBuyOrderId(): string | null {
    return this.activeBuyOrderId;
  }

  /**
   * 获取活跃买单
   */
  getActiveBuyOrder(): TrackedOrder | null {
    if (!this.activeBuyOrderId) return null;
    return this.orders.get(this.activeBuyOrderId) || null;
  }

  /**
   * 清除活跃买单
   */
  clearActiveBuy(): void {
    this.activeBuyOrderId = null;
  }

  /**
   * 设置活跃买单
   */
  setActiveBuy(orderId: string): void {
    this.activeBuyOrderId = orderId;
  }

  /**
   * 获取所有挂起的卖单（按创建时间排序）
   */
  getPendingSellOrders(): TrackedOrder[] {
    const sells: TrackedOrder[] = [];
    for (const order of this.orders.values()) {
      if (order.side === 'sell' && order.status === 'pending') {
        sells.push(order);
      }
    }
    return sells.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * 获取所有挂起订单数量
   */
  getPendingOrderCount(): number {
    let count = 0;
    for (const order of this.orders.values()) {
      if (order.status === 'pending') {
        count++;
      }
    }
    return count;
  }

  /**
   * 计算当前持仓总 USDT 值（所有挂起卖单的 size × price）
   */
  getTotalPositionUsdt(): string {
    let total = 0;
    for (const order of this.orders.values()) {
      if (order.side === 'sell' && order.status === 'pending') {
        total += parseFloat(order.price) * parseFloat(order.size);
      }
    }
    return total.toFixed(2);
  }

  /**
   * 对账第一步：找出从交易所消失的订单（不立即判定状态）
   */
  findDisappearedOrders(exchangePendingIds: Set<string>): DisappearedOrder[] {
    const disappeared: DisappearedOrder[] = [];

    for (const order of this.orders.values()) {
      if (order.status !== 'pending') continue;

      if (!exchangePendingIds.has(order.orderId)) {
        disappeared.push({ order });
      }
    }

    return disappeared;
  }

  /**
   * 对账第二步：根据已确认的状态标记订单
   */
  confirmFilled(orderId: string): TrackedOrder | null {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'pending') return null;

    order.status = 'filled';
    order.filledAt = Date.now();

    if (order.side === 'buy' && this.activeBuyOrderId === orderId) {
      this.activeBuyOrderId = null;
    }

    logger.info('确认成交订单', {
      orderId: order.orderId,
      side: order.side,
      price: order.price,
      size: order.size,
    });

    return order;
  }

  /**
   * 标记订单为交易所自动撤销（如 post_only 被拒）
   */
  markExchangeCancelled(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order && order.status === 'pending') {
      order.status = 'cancelled';
      if (this.activeBuyOrderId === orderId) {
        this.activeBuyOrderId = null;
      }
      logger.info('订单被交易所撤销', {
        orderId: order.orderId,
        side: order.side,
        price: order.price,
      });
    }
  }

  /**
   * 标记订单为已撤单
   */
  markCancelled(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'cancelled';
      if (this.activeBuyOrderId === orderId) {
        this.activeBuyOrderId = null;
      }
    }
  }

  /**
   * 批量标记订单为已撤单
   */
  markBatchCancelled(orderIds: string[]): void {
    for (const id of orderIds) {
      this.markCancelled(id);
    }
  }

  /**
   * 关联买单和卖单
   */
  linkOrders(buyOrderId: string, sellOrderId: string): void {
    const buyOrder = this.orders.get(buyOrderId);
    if (buyOrder) {
      buyOrder.linkedOrderId = sellOrderId;
    }
  }

  /**
   * 获取所有订单快照
   */
  getAllOrders(): TrackedOrder[] {
    return Array.from(this.orders.values());
  }

  /**
   * 清空所有追踪数据
   */
  clear(): void {
    this.orders.clear();
    this.activeBuyOrderId = null;
  }

  /**
   * 清理已完成订单（保留最近 N 个）
   */
  cleanup(keepRecent = 500): void {
    const completed = Array.from(this.orders.entries())
      .filter(([, o]) => o.status !== 'pending')
      .sort((a, b) => (b[1].filledAt || b[1].createdAt) - (a[1].filledAt || a[1].createdAt));

    if (completed.length > keepRecent) {
      for (let i = keepRecent; i < completed.length; i++) {
        this.orders.delete(completed[i][0]);
      }
    }
  }
}
