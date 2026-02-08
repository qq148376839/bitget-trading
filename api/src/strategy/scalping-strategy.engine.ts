/**
 * 剥头皮策略引擎
 * 状态机 + 双循环架构
 *
 * Loop A — 盘口追踪（每 pollIntervalMs）:
 *   1. 获取深度，提取 bid1
 *   2. bid1 变化 → 撤旧买单，挂新买单
 *   3. 无买单 → 在 bid1 挂 post_only 限价买
 *
 * Loop B — 成交检测（每 orderCheckIntervalMs）:
 *   1. 查询交易所挂单列表
 *   2. 对比本地状态，发现已成交
 *   3. 买单成交 → 立刻挂卖单（买价 + priceSpread）
 *   4. 卖单成交 → 计算 PnL
 *   5. 挂单数 >= maxPendingOrders → 触发合并
 */

import { FuturesMarketDataService } from '../services/futures-market-data.service';
import { FuturesOrderService } from '../services/futures-order.service';
import { FuturesAccountService } from '../services/futures-account.service';
import { OrderStateTracker } from './order-state-tracker';
import { RiskController } from './risk-controller';
import { MergeEngine } from './merge-engine';
import { StrategyConfigManager } from './strategy-config.manager';
import {
  ScalpingStrategyConfig,
  StrategyState,
  StrategyStatus,
  StrategyEvent,
  StrategyEventType,
  TrackedOrder,
  PnlSummary,
} from '../types/strategy.types';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('scalping-engine');

const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RECOVERY_DELAY_MS = 30000;

export class ScalpingStrategyEngine {
  private static instance: ScalpingStrategyEngine | null = null;

  private status: StrategyStatus = 'STOPPED';
  private configManager: StrategyConfigManager | null = null;
  private tracker: OrderStateTracker;
  private riskController: RiskController | null = null;
  private mergeEngine: MergeEngine | null = null;

  private marketDataService: FuturesMarketDataService;
  private orderService: FuturesOrderService;
  private accountService: FuturesAccountService;

  private loopATimer: ReturnType<typeof setTimeout> | null = null;
  private loopBTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBidPrice: string | null = null;
  private consecutiveErrors = 0;
  private startedAt: number | null = null;
  private tradeCount = 0;
  private realizedPnl = 0;

  private events: StrategyEvent[] = [];
  private maxEvents = 1000;

  private constructor() {
    this.marketDataService = new FuturesMarketDataService();
    this.orderService = new FuturesOrderService();
    this.accountService = new FuturesAccountService();
    this.tracker = new OrderStateTracker();
  }

  static getInstance(): ScalpingStrategyEngine {
    if (!ScalpingStrategyEngine.instance) {
      ScalpingStrategyEngine.instance = new ScalpingStrategyEngine();
    }
    return ScalpingStrategyEngine.instance;
  }

  /**
   * 启动策略
   */
  async start(overrides?: Partial<ScalpingStrategyConfig>): Promise<void> {
    if (this.status === 'RUNNING' || this.status === 'STARTING') {
      throw new AppError(
        ErrorCode.STRATEGY_ALREADY_RUNNING,
        '策略已在运行中',
        { status: this.status },
        400
      );
    }

    this.status = 'STARTING';
    logger.info('策略启动中...');

    try {
      // 初始化配置
      this.configManager = new StrategyConfigManager(overrides);
      const config = this.configManager.getConfig();

      // 获取初始权益
      const { equity } = await this.accountService.getAccountEquity(
        config.productType,
        config.marginCoin
      );
      const initialEquity = parseFloat(equity);
      logger.info('初始权益', { equity: initialEquity, marginCoin: config.marginCoin });

      // 初始化组件
      this.riskController = new RiskController(config, initialEquity);
      this.mergeEngine = new MergeEngine(this.orderService, this.tracker, config);
      this.tracker.clear();
      this.lastBidPrice = null;
      this.consecutiveErrors = 0;
      this.startedAt = Date.now();
      this.tradeCount = 0;
      this.realizedPnl = 0;

      this.status = 'RUNNING';
      this.emitEvent('STRATEGY_STARTED', { config });
      logger.info('策略已启动', { symbol: config.symbol, direction: config.direction });

      // 启动双循环
      this.scheduleLoopA();
      this.scheduleLoopB();
    } catch (error) {
      this.status = 'STOPPED';
      logger.error('策略启动失败', { error: String(error) });
      throw error;
    }
  }

  /**
   * 停止策略
   */
  async stop(): Promise<void> {
    if (this.status === 'STOPPED' || this.status === 'STOPPING') {
      return;
    }

    this.status = 'STOPPING';
    logger.info('策略停止中...');

    // 停止循环
    if (this.loopATimer) {
      clearTimeout(this.loopATimer);
      this.loopATimer = null;
    }
    if (this.loopBTimer) {
      clearTimeout(this.loopBTimer);
      this.loopBTimer = null;
    }

    // 撤销活跃买单
    const activeBuy = this.tracker.getActiveBuyOrder();
    if (activeBuy && this.configManager) {
      try {
        const config = this.configManager.getConfig();
        await this.orderService.cancelOrder({
          symbol: config.symbol,
          productType: config.productType,
          orderId: activeBuy.orderId,
        });
        this.tracker.markCancelled(activeBuy.orderId);
      } catch (error) {
        logger.warn('停止时撤买单失败', { error: String(error) });
      }
    }

    this.status = 'STOPPED';
    this.emitEvent('STRATEGY_STOPPED', {
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      tradeCount: this.tradeCount,
      realizedPnl: this.realizedPnl,
    });
    logger.info('策略已停止');
  }

  /**
   * 紧急停止：撤销所有挂单
   */
  async emergencyStop(): Promise<void> {
    logger.warn('紧急停止触发！');
    this.emitEvent('EMERGENCY_STOP', {});

    // 先停循环
    if (this.loopATimer) {
      clearTimeout(this.loopATimer);
      this.loopATimer = null;
    }
    if (this.loopBTimer) {
      clearTimeout(this.loopBTimer);
      this.loopBTimer = null;
    }

    if (this.configManager) {
      const config = this.configManager.getConfig();
      const allPending = this.tracker.getAllOrders().filter(o => o.status === 'pending');

      // 批量撤单
      const orderIds = allPending.map(o => o.orderId);
      for (let i = 0; i < orderIds.length; i += 50) {
        const batch = orderIds.slice(i, i + 50);
        try {
          await this.orderService.batchCancelOrders({
            symbol: config.symbol,
            productType: config.productType,
            orderIdList: batch.map(id => ({ orderId: id })),
          });
          this.tracker.markBatchCancelled(batch);
        } catch (error) {
          logger.error('紧急停止：批量撤单失败', { error: String(error) });
        }
      }
    }

    this.status = 'STOPPED';
    logger.warn('紧急停止完成');
  }

  /**
   * 更新配置
   */
  updateConfig(changes: Partial<ScalpingStrategyConfig>): ScalpingStrategyConfig {
    if (!this.configManager) {
      throw new AppError(ErrorCode.STRATEGY_NOT_RUNNING, '策略未运行，无法更新配置', {}, 400);
    }
    const newConfig = this.configManager.update(changes);
    if (this.riskController) {
      this.riskController.updateConfig(newConfig);
    }
    if (this.mergeEngine) {
      this.mergeEngine.updateConfig(newConfig);
    }
    this.emitEvent('CONFIG_UPDATED', { changes });
    return newConfig;
  }

  /**
   * 获取策略状态
   */
  getState(): StrategyState {
    const config = this.configManager?.getConfig() || null;
    const riskStats = this.riskController?.getStats();

    return {
      status: this.status,
      config,
      activeBuyOrderId: this.tracker.getActiveBuyOrderId(),
      lastBidPrice: this.lastBidPrice,
      pendingSellCount: this.tracker.getPendingSellOrders().length,
      totalPositionUsdt: this.tracker.getTotalPositionUsdt(),
      realizedPnl: this.realizedPnl.toFixed(4),
      unrealizedPnl: '0', // TODO: 从交易所获取
      dailyPnl: riskStats ? riskStats.dailyPnl.toFixed(4) : '0',
      tradeCount: this.tradeCount,
      errorCount: this.consecutiveErrors,
      lastError: null,
      startedAt: this.startedAt,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  /**
   * 获取追踪的订单
   */
  getTrackedOrders(): TrackedOrder[] {
    return this.tracker.getAllOrders();
  }

  /**
   * 获取 PnL 汇总
   */
  getPnlSummary(): PnlSummary {
    const stats = this.riskController?.getStats();
    return {
      realizedPnl: this.realizedPnl.toFixed(4),
      unrealizedPnl: '0',
      dailyPnl: stats ? stats.dailyPnl.toFixed(4) : '0',
      totalTrades: stats?.totalTrades || 0,
      winTrades: stats?.winTrades || 0,
      lossTrades: stats?.lossTrades || 0,
      winRate: stats ? (stats.winRate * 100).toFixed(2) : '0',
      avgWin: stats ? stats.avgWin.toFixed(4) : '0',
      avgLoss: stats ? stats.avgLoss.toFixed(4) : '0',
    };
  }

  /**
   * 获取事件日志
   */
  getEvents(limit = 50): StrategyEvent[] {
    return this.events.slice(-limit);
  }

  // ============================================================
  // Loop A: 盘口追踪
  // ============================================================

  private scheduleLoopA(): void {
    if (this.status !== 'RUNNING') return;
    const config = this.configManager!.getConfig();
    this.loopATimer = setTimeout(() => this.runLoopA(), config.pollIntervalMs);
  }

  private async runLoopA(): Promise<void> {
    if (this.status !== 'RUNNING') return;

    try {
      const config = this.configManager!.getConfig();

      // 风控检查
      const positionUsdt = parseFloat(this.tracker.getTotalPositionUsdt());
      const riskCheck = this.riskController!.checkCanTrade(positionUsdt);
      if (!riskCheck.canTrade) {
        logger.debug('风控拒绝交易', { reason: riskCheck.reason });
        this.scheduleLoopA();
        return;
      }

      // 获取盘口 bid1
      const bid1 = await this.marketDataService.getBestBid(config.symbol, config.productType);

      if (bid1 !== this.lastBidPrice) {
        // bid1 变化
        const activeBuy = this.tracker.getActiveBuyOrder();

        if (activeBuy) {
          // 撤旧买单
          try {
            await this.orderService.cancelOrder({
              symbol: config.symbol,
              productType: config.productType,
              orderId: activeBuy.orderId,
            });
            this.tracker.markCancelled(activeBuy.orderId);
            this.emitEvent('BUY_ORDER_CANCELLED', { orderId: activeBuy.orderId, oldPrice: activeBuy.price });
          } catch (error) {
            logger.warn('撤旧买单失败', { error: String(error) });
          }
        }

        // 挂新买单
        await this.placeBuyOrder(bid1, config);
        this.lastBidPrice = bid1;
      } else if (!this.tracker.getActiveBuyOrderId()) {
        // bid1 未变但无活跃买单
        await this.placeBuyOrder(bid1, config);
      }

      this.consecutiveErrors = 0;
    } catch (error) {
      this.handleLoopError('Loop A', error);
    }

    this.scheduleLoopA();
  }

  /**
   * 在 bid1 挂买单
   */
  private async placeBuyOrder(bidPrice: string, config: ScalpingStrategyConfig): Promise<void> {
    const price = bidPrice;
    const size = this.calculateSize(config.orderAmountUsdt, price, config.sizePrecision);

    const clientOid = `scalp_${config.symbol}_${config.direction}_buy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const result = await this.orderService.placeOrder({
        symbol: config.symbol,
        productType: config.productType,
        marginMode: config.marginMode,
        marginCoin: config.marginCoin,
        size,
        side: 'buy',
        orderType: 'limit',
        price,
        force: 'post_only',
        tradeSide: 'open',
        clientOid,
      });

      this.tracker.addOrder({
        orderId: result.orderId,
        clientOid,
        side: 'buy',
        price,
        size,
        status: 'pending',
        linkedOrderId: null,
        direction: config.direction,
        createdAt: Date.now(),
        filledAt: null,
      });

      this.emitEvent('BUY_ORDER_PLACED', { orderId: result.orderId, price, size });
    } catch (error) {
      logger.warn('挂买单失败', { error: String(error), price, size });
    }
  }

  // ============================================================
  // Loop B: 成交检测
  // ============================================================

  private scheduleLoopB(): void {
    if (this.status !== 'RUNNING') return;
    const config = this.configManager!.getConfig();
    this.loopBTimer = setTimeout(() => this.runLoopB(), config.orderCheckIntervalMs);
  }

  private async runLoopB(): Promise<void> {
    if (this.status !== 'RUNNING') return;

    try {
      const config = this.configManager!.getConfig();

      // 查询交易所挂单
      const exchangePending = await this.orderService.getPendingOrders(
        config.symbol,
        config.productType
      );
      const exchangePendingIds = new Set(exchangePending.map(o => o.orderId));

      // 对账
      const { filledBuyOrders, filledSellOrders } = this.tracker.reconcile(exchangePendingIds);

      // 处理买单成交 → 挂卖单
      for (const buyOrder of filledBuyOrders) {
        await this.handleBuyFilled(buyOrder, config);
      }

      // 处理卖单成交 → 计算 PnL
      for (const sellOrder of filledSellOrders) {
        this.handleSellFilled(sellOrder);
      }

      // 检查是否需要合并
      if (this.mergeEngine!.needsMerge()) {
        logger.info('挂单数达到上限，触发合并');
        const mergeResult = await this.mergeEngine!.mergeSellOrders();
        if (mergeResult) {
          this.emitEvent('ORDERS_MERGED', mergeResult as unknown as Record<string, unknown>);
        }
      }

      // 定期清理历史订单
      this.tracker.cleanup();

      this.consecutiveErrors = 0;
    } catch (error) {
      this.handleLoopError('Loop B', error);
    }

    this.scheduleLoopB();
  }

  /**
   * 买单成交后挂卖单
   */
  private async handleBuyFilled(buyOrder: TrackedOrder, config: ScalpingStrategyConfig): Promise<void> {
    const buyPrice = parseFloat(buyOrder.price);
    const sellPrice = (buyPrice + parseFloat(config.priceSpread)).toFixed(config.pricePrecision);

    const clientOid = `scalp_${config.symbol}_${config.direction}_sell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const result = await this.orderService.placeOrder({
        symbol: config.symbol,
        productType: config.productType,
        marginMode: config.marginMode,
        marginCoin: config.marginCoin,
        size: buyOrder.size,
        side: 'sell',
        orderType: 'limit',
        price: sellPrice,
        force: 'post_only',
        tradeSide: 'close',
        clientOid,
      });

      this.tracker.addOrder({
        orderId: result.orderId,
        clientOid,
        side: 'sell',
        price: sellPrice,
        size: buyOrder.size,
        status: 'pending',
        linkedOrderId: buyOrder.orderId,
        direction: config.direction,
        createdAt: Date.now(),
        filledAt: null,
      });

      this.tracker.linkOrders(buyOrder.orderId, result.orderId);
      this.emitEvent('SELL_ORDER_PLACED', {
        orderId: result.orderId,
        buyOrderId: buyOrder.orderId,
        buyPrice: buyOrder.price,
        sellPrice,
        size: buyOrder.size,
      });

      logger.info('买单成交，已挂卖单', {
        buyOrderId: buyOrder.orderId,
        buyPrice: buyOrder.price,
        sellOrderId: result.orderId,
        sellPrice,
      });
    } catch (error) {
      logger.error('挂卖单失败', { error: String(error), buyOrderId: buyOrder.orderId });
    }
  }

  /**
   * 卖单成交，计算 PnL
   */
  private handleSellFilled(sellOrder: TrackedOrder): void {
    this.tradeCount++;

    // 查找对应的买单
    const buyOrder = sellOrder.linkedOrderId
      ? this.tracker.getOrder(sellOrder.linkedOrderId)
      : null;

    if (buyOrder) {
      const buyPrice = parseFloat(buyOrder.price);
      const sellPrice = parseFloat(sellOrder.price);
      const size = parseFloat(sellOrder.size);
      const pnl = (sellPrice - buyPrice) * size;

      // 扣除双边手续费
      const fee = StrategyConfigManager.estimateFeeUsdt(
        (sellPrice * size).toFixed(2)
      ) * 2;
      const netPnl = pnl - fee;

      this.realizedPnl += netPnl;
      this.riskController?.recordPnl(netPnl);

      this.emitEvent('SELL_ORDER_FILLED', {
        sellOrderId: sellOrder.orderId,
        buyOrderId: buyOrder.orderId,
        buyPrice: buyOrder.price,
        sellPrice: sellOrder.price,
        size: sellOrder.size,
        grossPnl: pnl.toFixed(4),
        fee: fee.toFixed(4),
        netPnl: netPnl.toFixed(4),
      });

      logger.info('卖单成交', {
        sellOrderId: sellOrder.orderId,
        netPnl: netPnl.toFixed(4),
        totalPnl: this.realizedPnl.toFixed(4),
      });
    } else {
      this.emitEvent('SELL_ORDER_FILLED', {
        sellOrderId: sellOrder.orderId,
        sellPrice: sellOrder.price,
        size: sellOrder.size,
        note: '无法找到对应买单',
      });
    }
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 根据 USDT 金额和当前价格计算下单数量
   */
  private calculateSize(amountUsdt: string, price: string, precision: number): string {
    const amount = parseFloat(amountUsdt);
    const priceNum = parseFloat(price);
    if (priceNum <= 0) return '0';
    const size = amount / priceNum;
    return size.toFixed(precision);
  }

  /**
   * 处理循环错误
   */
  private handleLoopError(loopName: string, error: unknown): void {
    this.consecutiveErrors++;
    logger.error(`${loopName} 错误 (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`, {
      error: String(error),
    });

    if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      this.status = 'ERROR';
      this.emitEvent('STRATEGY_ERROR', {
        loop: loopName,
        consecutiveErrors: this.consecutiveErrors,
        error: String(error),
      });
      logger.error('连续错误达到上限，进入 ERROR 状态', {
        consecutiveErrors: this.consecutiveErrors,
      });

      // 冷却后自动恢复
      setTimeout(() => {
        if (this.status === 'ERROR') {
          logger.info('尝试从 ERROR 状态恢复');
          this.status = 'RUNNING';
          this.consecutiveErrors = 0;
          this.scheduleLoopA();
          this.scheduleLoopB();
        }
      }, ERROR_RECOVERY_DELAY_MS);
    }
  }

  /**
   * 发布事件
   */
  private emitEvent(type: StrategyEventType, data: Record<string, unknown>): void {
    const event: StrategyEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    this.events.push(event);

    // 清理旧事件
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }
}
