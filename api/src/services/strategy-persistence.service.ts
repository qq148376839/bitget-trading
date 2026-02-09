/**
 * 策略持久化服务（Singleton）
 * 异步写入队列：不阻塞交易主逻辑，失败仅打日志
 */

import { getPool } from '../config/database';
import { createLogger } from '../utils/logger';
import { TrackedOrder, BaseStrategyConfig, AnyStrategyConfig } from '../types/strategy.types';

const logger = createLogger('strategy-persistence');

export class StrategyPersistenceService {
  private static instance: StrategyPersistenceService | null = null;

  private constructor() {}

  static getInstance(): StrategyPersistenceService {
    if (!StrategyPersistenceService.instance) {
      StrategyPersistenceService.instance = new StrategyPersistenceService();
    }
    return StrategyPersistenceService.instance;
  }

  /**
   * 持久化新订单（异步，不阻塞）
   */
  persistNewOrder(
    order: TrackedOrder,
    symbol: string,
    productType: string,
    marginCoin: string
  ): void {
    this.runAsync(async () => {
      const pool = getPool();
      await pool.query(
        `INSERT INTO strategy_orders
          (order_id, client_oid, side, price, size, status, linked_order_id, direction, symbol, product_type, margin_coin, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12 / 1000.0))
         ON CONFLICT (order_id) DO NOTHING`,
        [
          order.orderId, order.clientOid, order.side, order.price, order.size,
          order.status, order.linkedOrderId, order.direction,
          symbol, productType, marginCoin, order.createdAt,
        ]
      );
    }, 'persistNewOrder');
  }

  /**
   * 持久化订单状态变更（异步，不阻塞）
   */
  persistOrderStatusChange(
    orderId: string,
    status: string,
    filledAt: number | null,
    linkedOrderId: string | null
  ): void {
    this.runAsync(async () => {
      const pool = getPool();
      const setClauses = ['status = $2', 'updated_at = NOW()'];
      const params: (string | number | null)[] = [orderId, status];
      let paramIdx = 3;

      if (filledAt !== null) {
        setClauses.push(`filled_at = to_timestamp($${paramIdx} / 1000.0)`);
        params.push(filledAt);
        paramIdx++;
      }

      if (linkedOrderId !== null) {
        setClauses.push(`linked_order_id = $${paramIdx}`);
        params.push(linkedOrderId);
        paramIdx++;
      }

      await pool.query(
        `UPDATE strategy_orders SET ${setClauses.join(', ')} WHERE order_id = $1`,
        params
      );
    }, 'persistOrderStatusChange');
  }

  /**
   * 持久化已实现盈亏（异步，UPSERT 按日期 + 策略类型聚合）
   */
  persistRealizedPnl(pnl: number, fee: number, isWin: boolean, strategyType = 'scalping'): void {
    this.runAsync(async () => {
      const pool = getPool();
      const today = new Date().toISOString().split('T')[0];

      await pool.query(
        `INSERT INTO strategy_daily_pnl (date, realized_pnl, total_trades, win_trades, loss_trades, fees, strategy_type, updated_at)
         VALUES ($1, $2, 1, $3, $4, $5, $6, NOW())
         ON CONFLICT (date, strategy_type) DO UPDATE SET
           realized_pnl = strategy_daily_pnl.realized_pnl + EXCLUDED.realized_pnl,
           total_trades = strategy_daily_pnl.total_trades + 1,
           win_trades = strategy_daily_pnl.win_trades + EXCLUDED.win_trades,
           loss_trades = strategy_daily_pnl.loss_trades + EXCLUDED.loss_trades,
           fees = strategy_daily_pnl.fees + EXCLUDED.fees,
           updated_at = NOW()`,
        [today, pnl, isWin ? 1 : 0, isWin ? 0 : 1, fee, strategyType]
      );
    }, 'persistRealizedPnl');
  }

  /**
   * 保存当前活跃配置到 DB（异步）
   */
  saveActiveConfig(config: BaseStrategyConfig | AnyStrategyConfig): void {
    this.runAsync(async () => {
      const pool = getPool();
      await pool.query(
        `INSERT INTO strategy_configs (name, config, is_active, updated_at)
         VALUES ('default', $1, true, NOW())
         ON CONFLICT (name) DO UPDATE SET
           config = EXCLUDED.config,
           is_active = true,
           updated_at = NOW()`,
        [JSON.stringify(config)]
      );
    }, 'saveActiveConfig');
  }

  /**
   * 加载上次活跃配置（重启恢复）
   */
  async loadActiveConfig(): Promise<BaseStrategyConfig | null> {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT config FROM strategy_configs WHERE name = 'default' AND is_active = true LIMIT 1`
      );
      if (rows.length === 0) return null;
      return rows[0].config as BaseStrategyConfig;
    } catch (error) {
      logger.warn('加载活跃配置失败', { error: String(error) });
      return null;
    }
  }

  /**
   * 加载 pending 订单（重启恢复）
   */
  async loadPendingOrders(symbol: string, productType: string): Promise<TrackedOrder[]> {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT order_id, client_oid, side, price, size, status,
                linked_order_id, direction, created_at, filled_at
         FROM strategy_orders
         WHERE status = 'pending' AND symbol = $1 AND product_type = $2
         ORDER BY created_at`,
        [symbol, productType]
      );

      return rows.map(row => ({
        orderId: row.order_id,
        clientOid: row.client_oid || '',
        side: row.side as 'buy' | 'sell',
        price: String(row.price),
        size: String(row.size),
        status: 'pending' as const,
        linkedOrderId: row.linked_order_id,
        direction: row.direction || 'long',
        createdAt: new Date(row.created_at).getTime(),
        filledAt: row.filled_at ? new Date(row.filled_at).getTime() : null,
      }));
    } catch (error) {
      logger.error('加载 pending 订单失败', { error: String(error) });
      return [];
    }
  }

  /**
   * 异步执行数据库操作，失败仅打日志
   */
  private runAsync(fn: () => Promise<void>, label: string): void {
    fn().catch(error => {
      logger.warn(`持久化失败 [${label}]`, { error: String(error) });
    });
  }
}
