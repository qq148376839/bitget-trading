/**
 * 订单状态追踪器
 * 内存管理所有策略挂单，通过对账发现成交
 * 支持方向感知的入场/出场追踪（bidirectional scalping）
 */

import { TrackedOrder } from '../types/strategy.types';
import { createLogger } from '../utils/logger';

const logger = createLogger('order-tracker');

export type EntryDirection = 'long' | 'short';

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
  private activeEntryOrderIds: Map<EntryDirection, string | null> = new Map([
    ['long', null],
    ['short', null],
  ]);

  /**
   * 添加追踪订单
   */
  addOrder(order: TrackedOrder): void {
    this.orders.set(order.orderId, order);
    // 如果是入场单，自动设置 activeEntry
    if (order.orderRole === 'entry' && order.status === 'pending') {
      const dir = this.inferEntryDirection(order);
      if (dir) {
        this.activeEntryOrderIds.set(dir, order.orderId);
      }
    }
    // Legacy: 向后兼容无 orderRole 的买单（网格引擎等）
    if (!order.orderRole && order.side === 'buy' && order.status === 'pending') {
      const dir = (order.direction === 'short') ? 'short' : 'long';
      this.activeEntryOrderIds.set(dir, order.orderId);
    }
    logger.debug('追踪新订单', { orderId: order.orderId, side: order.side, price: order.price, role: order.orderRole, direction: order.direction });
  }

  /**
   * 获取订单
   */
  getOrder(orderId: string): TrackedOrder | undefined {
    return this.orders.get(orderId);
  }

  // ============================================================
  // 方向感知的入场追踪 (bidirectional)
  // ============================================================

  /**
   * 获取指定方向的活跃入场单 ID
   */
  getActiveEntryOrderId(direction: EntryDirection): string | null {
    return this.activeEntryOrderIds.get(direction) || null;
  }

  /**
   * 获取指定方向的活跃入场单
   */
  getActiveEntryOrder(direction: EntryDirection): TrackedOrder | null {
    const id = this.activeEntryOrderIds.get(direction);
    if (!id) return null;
    return this.orders.get(id) || null;
  }

  /**
   * 设置指定方向的活跃入场单
   */
  setActiveEntry(direction: EntryDirection, orderId: string): void {
    this.activeEntryOrderIds.set(direction, orderId);
  }

  /**
   * 清除指定方向的活跃入场单
   */
  clearActiveEntry(direction: EntryDirection): void {
    this.activeEntryOrderIds.set(direction, null);
  }

  /**
   * 获取挂起的出场单（按方向过滤）
   */
  getPendingExitOrders(direction?: EntryDirection): TrackedOrder[] {
    const exits: TrackedOrder[] = [];
    for (const order of this.orders.values()) {
      if (order.status !== 'pending') continue;
      if (order.orderRole === 'exit') {
        if (!direction || this.inferExitDirection(order) === direction) {
          exits.push(order);
        }
      } else if (!order.orderRole && order.side === 'sell') {
        // Legacy: 无 orderRole 的卖单视为出场单
        if (!direction || order.direction === direction || order.direction === 'both') {
          exits.push(order);
        }
      }
    }
    return exits.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * 按方向计算持仓 USDT
   */
  getTotalPositionUsdtByDirection(direction: EntryDirection): string {
    let total = 0;
    const exits = this.getPendingExitOrders(direction);
    for (const order of exits) {
      total += parseFloat(order.price) * parseFloat(order.size);
    }
    return total.toFixed(2);
  }

  // ============================================================
  // 向后兼容包装器（网格引擎 + 旧代码）
  // ============================================================

  /**
   * 获取当前活跃买单 ID（向后兼容 — 返回 long 方向的入场单）
   */
  getActiveBuyOrderId(): string | null {
    return this.activeEntryOrderIds.get('long') || null;
  }

  /**
   * 获取活跃买单（向后兼容）
   */
  getActiveBuyOrder(): TrackedOrder | null {
    const id = this.getActiveBuyOrderId();
    if (!id) return null;
    return this.orders.get(id) || null;
  }

  /**
   * 清除活跃买单（向后兼容）
   */
  clearActiveBuy(): void {
    this.activeEntryOrderIds.set('long', null);
  }

  /**
   * 设置活跃买单（向后兼容）
   */
  setActiveBuy(orderId: string): void {
    this.activeEntryOrderIds.set('long', orderId);
  }

  /**
   * 获取所有挂起的卖单（向后兼容 — 返回所有出场挂单）
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
   * 计算当前持仓总 USDT 值（所有挂起出场单的 size x price）
   */
  getTotalPositionUsdt(): string {
    let total = 0;
    for (const order of this.orders.values()) {
      if (order.status !== 'pending') continue;
      // 出场单代表持仓
      if (order.orderRole === 'exit' || (!order.orderRole && order.side === 'sell')) {
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

    // 清除该订单在 activeEntryOrderIds 中的引用
    for (const [dir, id] of this.activeEntryOrderIds.entries()) {
      if (id === orderId) {
        this.activeEntryOrderIds.set(dir, null);
      }
    }

    logger.info('确认成交订单', {
      orderId: order.orderId,
      side: order.side,
      price: order.price,
      size: order.size,
      role: order.orderRole,
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
      for (const [dir, id] of this.activeEntryOrderIds.entries()) {
        if (id === orderId) {
          this.activeEntryOrderIds.set(dir, null);
        }
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
      for (const [dir, id] of this.activeEntryOrderIds.entries()) {
        if (id === orderId) {
          this.activeEntryOrderIds.set(dir, null);
        }
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
   * 关联入场单和出场单
   */
  linkOrders(entryOrderId: string, exitOrderId: string): void {
    const entryOrder = this.orders.get(entryOrderId);
    if (entryOrder) {
      entryOrder.linkedOrderId = exitOrderId;
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
    this.activeEntryOrderIds.set('long', null);
    this.activeEntryOrderIds.set('short', null);
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

  // ============================================================
  // 内部辅助
  // ============================================================

  /**
   * 从订单推断入场方向：buy+long/both=long, sell+short=short
   */
  private inferEntryDirection(order: TrackedOrder): EntryDirection | null {
    if (order.side === 'buy' && (order.direction === 'long' || order.direction === 'both')) return 'long';
    if (order.side === 'sell' && order.direction === 'short') return 'short';
    // Legacy fallback
    if (order.side === 'buy') return 'long';
    return null;
  }

  /**
   * 从出场单推断其方向
   */
  private inferExitDirection(order: TrackedOrder): EntryDirection | null {
    // 出场单的 direction 字段直接标记了方向
    if (order.direction === 'long' || order.direction === 'short') {
      return order.direction;
    }
    // Legacy: sell=long exit, buy=short exit
    if (order.side === 'sell') return 'long';
    if (order.side === 'buy') return 'short';
    return null;
  }
}
