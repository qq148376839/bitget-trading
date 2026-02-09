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

import { IStrategy } from './interfaces/i-strategy';
import { IOrderService } from '../services/interfaces/i-order.service';
import { IMarketDataService } from '../services/interfaces/i-market-data.service';
import { IAccountService } from '../services/interfaces/i-account.service';
import { TradingServices } from '../services/trading-service.factory';
import { ContractSpecService } from '../services/contract-spec.service';
import { FuturesAccountService, HoldMode } from '../services/futures-account.service';
import { StrategyPersistenceService } from '../services/strategy-persistence.service';
import { OrderStateTracker } from './order-state-tracker';
import { RiskController } from './risk-controller';
import { MergeEngine } from './merge-engine';
import { StrategyConfigManager } from './strategy-config.manager';
import {
  ScalpingStrategyConfig,
  DEFAULT_SCALPING_CONFIG,
  BaseStrategyConfig,
  AnyStrategyConfig,
  StrategyState,
  StrategyStatus,
  StrategyEvent,
  StrategyEventType,
  TrackedOrder,
  PnlSummary,
} from '../types/strategy.types';
import { StrategyType } from '../types/trading.types';
import { ContractSpecInfo } from '../types/futures.types';
import { InstrumentSpec } from '../types/trading.types';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('scalping-engine');

const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RECOVERY_DELAY_MS = 30000;
const POST_ONLY_CANCEL_COOLDOWN_MS = 3000;

export class ScalpingStrategyEngine implements IStrategy {
  readonly strategyType: StrategyType = 'scalping';
  readonly instanceId: string;

  private status: StrategyStatus = 'STOPPED';
  private configManager: StrategyConfigManager | null = null;
  private tracker: OrderStateTracker;
  private riskController: RiskController | null = null;
  private mergeEngine: MergeEngine | null = null;

  private orderService: IOrderService;
  private marketDataService: IMarketDataService;
  private accountService: IAccountService;

  private loopATimer: ReturnType<typeof setTimeout> | null = null;
  private loopBTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBidPrice: string | null = null;
  private consecutiveErrors = 0;
  private startedAt: number | null = null;
  private tradeCount = 0;
  private realizedPnl = 0;

  private contractSpec: ContractSpecInfo | null = null;
  private instrumentSpec: InstrumentSpec | null = null;
  private unrealizedPnl = '0';
  private persistenceService: StrategyPersistenceService;
  private lastConfig: ScalpingStrategyConfig = DEFAULT_SCALPING_CONFIG;
  private configLoaded = false;

  private events: StrategyEvent[] = [];
  private maxEvents = 1000;
  private lastBuyCancelledAt = 0; // 上次买单被交易所撤销的时间（用于防止 post_only 快速循环）
  private holdMode: HoldMode = 'double_hold'; // 持仓模式：single_hold=单向, double_hold=双向（默认双向更安全）
  private consecutivePostOnlyCancels = 0; // 连续 post_only 被撤次数（用于自适应调整）

  constructor(services: TradingServices, instanceId = 'default') {
    this.orderService = services.orderService;
    this.marketDataService = services.marketDataService;
    this.accountService = services.accountService;
    this.tracker = new OrderStateTracker();
    this.persistenceService = StrategyPersistenceService.getInstance();
    this.instanceId = instanceId;
  }

  /**
   * 从 DB 加载上次活跃配置
   */
  async loadLastConfig(): Promise<void> {
    try {
      const config = await this.persistenceService.loadActiveConfig();
      if (config && !this.configLoaded) {
        // Ensure backwards compatibility: old configs without strategyType/tradingType
        this.lastConfig = {
          ...DEFAULT_SCALPING_CONFIG,
          ...config,
          strategyType: 'scalping',
          tradingType: config.tradingType || 'futures',
          instanceId: config.instanceId || this.instanceId,
        } as ScalpingStrategyConfig;
        this.configLoaded = true;
        logger.info('已从 DB 恢复上次策略配置', { symbol: config.symbol });
      }
    } catch (error) {
      logger.warn('加载上次配置失败', { error: String(error) });
    }
  }

  /**
   * 启动策略
   */
  async start(overrides?: Partial<BaseStrategyConfig>): Promise<void> {
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
      // 初始化配置：优先使用 overrides，其次 DB 恢复的上次配置
      const baseOverrides = this.configLoaded
        ? { ...this.lastConfig, ...overrides }
        : overrides;
      const configInput = {
        strategyType: 'scalping' as const,
        tradingType: baseOverrides?.tradingType || this.lastConfig.tradingType,
        instanceId: this.instanceId,
        ...baseOverrides,
      };
      this.configManager = new StrategyConfigManager(configInput);
      const config = this.configManager.getScalpingConfig();

      // 获取合约/现货规格并自动覆盖精度
      if (config.tradingType === 'futures' && config.productType) {
        try {
          const specService = ContractSpecService.getInstance();
          this.contractSpec = await specService.refreshSpec(config.symbol, config.productType);
          logger.info('Contract spec fetched', {
            symbol: config.symbol,
            pricePlace: this.contractSpec.pricePlace,
            volumePlace: this.contractSpec.volumePlace,
            minTradeNum: this.contractSpec.minTradeNum,
            makerFeeRate: this.contractSpec.makerFeeRate,
            takerFeeRate: this.contractSpec.takerFeeRate,
          });

          // 自动覆盖精度配置
          this.configManager.update({
            pricePrecision: this.contractSpec.pricePlace,
            sizePrecision: this.contractSpec.volumePlace,
          });

          // 手续费覆盖检查
          this.checkFeeCoverage(config, this.contractSpec);
        } catch (error) {
          logger.warn('获取合约规格失败，使用手动配置的精度', { error: String(error) });
        }
      }

      // 检测持仓模式（单向/双向）
      if (config.tradingType === 'futures' && config.productType) {
        try {
          const accountService = new FuturesAccountService();
          this.holdMode = await accountService.getHoldMode(config.productType);
          logger.info('持仓模式检测', { holdMode: this.holdMode });
        } catch (error) {
          logger.warn('持仓模式检测失败，默认双向持仓', { error: String(error) });
          this.holdMode = 'double_hold';
        }
      }

      // 获取初始权益
      const { equity, unrealizedPL } = await this.accountService.getAccountEquity(
        config.marginCoin || 'USDT'
      );
      const initialEquity = parseFloat(equity);
      this.unrealizedPnl = unrealizedPL;
      logger.info('初始权益', { equity: initialEquity, marginCoin: config.marginCoin, unrealizedPL });

      // 初始化组件
      const finalConfig = this.configManager.getScalpingConfig();
      this.riskController = new RiskController(finalConfig, initialEquity);
      this.mergeEngine = new MergeEngine(this.orderService, this.tracker, finalConfig, this.holdMode);
      this.tracker.clear();
      this.lastBidPrice = null;
      this.consecutiveErrors = 0;
      this.startedAt = Date.now();
      this.tradeCount = 0;
      this.realizedPnl = 0;

      // 尝试从 DB 恢复 pending 订单
      try {
        const pendingOrders = await this.persistenceService.loadPendingOrders(
          finalConfig.symbol,
          finalConfig.productType || ''
        );
        if (pendingOrders.length > 0) {
          for (const order of pendingOrders) {
            this.tracker.addOrder(order);
          }
          logger.info('Recovering pending orders', { count: pendingOrders.length });
        }
      } catch (error) {
        logger.warn('恢复 pending 订单失败', { error: String(error) });
      }

      this.status = 'RUNNING';
      // 保存配置到 DB 并缓存
      this.lastConfig = this.configManager.getScalpingConfig();
      this.configLoaded = true;
      this.persistenceService.saveActiveConfig(this.lastConfig);

      this.emitEvent('STRATEGY_STARTED', { config: this.lastConfig });
      logger.info('策略已启动', { symbol: this.lastConfig.symbol, direction: this.lastConfig.direction });

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
        const config = this.configManager.getScalpingConfig();
        await this.orderService.cancelOrder({
          symbol: config.symbol,
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
      const config = this.configManager.getScalpingConfig();
      const allPending = this.tracker.getAllOrders().filter(o => o.status === 'pending');

      // 批量撤单
      const orderIds = allPending.map(o => o.orderId);
      for (let i = 0; i < orderIds.length; i += 50) {
        const batch = orderIds.slice(i, i + 50);
        try {
          await this.orderService.batchCancelOrders({
            symbol: config.symbol,
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
  updateConfig(changes: Record<string, unknown>): BaseStrategyConfig {
    if (this.configManager) {
      const newConfig = this.configManager.update(changes as Partial<AnyStrategyConfig>);
      const scalpingConfig = newConfig as ScalpingStrategyConfig;
      if (this.riskController) {
        this.riskController.updateConfig(scalpingConfig);
      }
      if (this.mergeEngine) {
        this.mergeEngine.updateConfig(scalpingConfig);
      }
      this.lastConfig = scalpingConfig;
      this.persistenceService.saveActiveConfig(scalpingConfig);
      this.emitEvent('CONFIG_UPDATED', { changes, state: 'running' });
      return scalpingConfig;
    }

    // 停止状态
    const tempManager = new StrategyConfigManager({ ...this.lastConfig, ...changes });
    const newConfig = tempManager.getScalpingConfig();
    this.lastConfig = newConfig;
    this.persistenceService.saveActiveConfig(newConfig);
    this.emitEvent('CONFIG_UPDATED', { changes, state: 'stopped' });
    logger.info('已更新停止态配置', { changes });
    return newConfig;
  }

  getStatus(): StrategyStatus {
    return this.status;
  }

  /**
   * 获取策略状态
   */
  getState(): StrategyState {
    const config = this.configManager?.getScalpingConfig() || this.lastConfig;
    const riskStats = this.riskController?.getStats();

    return {
      status: this.status,
      strategyType: 'scalping',
      tradingType: config.tradingType,
      instanceId: this.instanceId,
      config,
      activeBuyOrderId: this.tracker.getActiveBuyOrderId(),
      lastBidPrice: this.lastBidPrice,
      pendingSellCount: this.tracker.getPendingSellOrders().length,
      totalPositionUsdt: this.tracker.getTotalPositionUsdt(),
      spotAvailableUsdt: '0',
      futuresAvailableUsdt: '0',
      realizedPnl: this.realizedPnl.toFixed(4),
      unrealizedPnl: this.unrealizedPnl,
      dailyPnl: riskStats ? riskStats.dailyPnl.toFixed(4) : '0',
      tradeCount: this.tradeCount,
      errorCount: this.consecutiveErrors,
      lastError: null,
      startedAt: this.startedAt,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  getTrackedOrders(): TrackedOrder[] {
    return this.tracker.getAllOrders();
  }

  getPnlSummary(): PnlSummary {
    const stats = this.riskController?.getStats();
    return {
      realizedPnl: this.realizedPnl.toFixed(4),
      unrealizedPnl: this.unrealizedPnl,
      dailyPnl: stats ? stats.dailyPnl.toFixed(4) : '0',
      totalTrades: stats?.totalTrades || 0,
      winTrades: stats?.winTrades || 0,
      lossTrades: stats?.lossTrades || 0,
      winRate: stats ? (stats.winRate * 100).toFixed(2) : '0',
      avgWin: stats ? stats.avgWin.toFixed(4) : '0',
      avgLoss: stats ? stats.avgLoss.toFixed(4) : '0',
    };
  }

  getEvents(limit = 50): StrategyEvent[] {
    return this.events.slice(-limit);
  }

  // ============================================================
  // Loop A: 盘口追踪
  // ============================================================

  private scheduleLoopA(): void {
    if (this.status !== 'RUNNING') return;
    const config = this.configManager!.getScalpingConfig();
    this.loopATimer = setTimeout(() => this.runLoopA(), config.pollIntervalMs);
  }

  private async runLoopA(): Promise<void> {
    if (this.status !== 'RUNNING') return;

    try {
      const config = this.configManager!.getScalpingConfig();

      // 风控检查
      const positionUsdt = parseFloat(this.tracker.getTotalPositionUsdt());
      const riskCheck = this.riskController!.checkCanTrade(positionUsdt);
      if (!riskCheck.canTrade) {
        logger.debug('风控拒绝交易', { reason: riskCheck.reason });
        this.scheduleLoopA();
        return;
      }

      // 获取盘口 bid1
      const bid1 = await this.marketDataService.getBestBid(config.symbol);
      const bid1Num = parseFloat(bid1);
      const spread = parseFloat(config.priceSpread);
      this.lastBidPrice = bid1;

      const activeBuy = this.tracker.getActiveBuyOrder();

      if (activeBuy && activeBuy.status === 'pending') {
        const orderPrice = parseFloat(activeBuy.price);
        const orderAge = Date.now() - activeBuy.createdAt;

        const MIN_ORDER_LIFETIME_MS = 3000;
        const overpaying = orderPrice > bid1Num + spread * 2;
        const tooFarBelowBid = bid1Num - orderPrice > spread * 5;

        if (orderAge >= MIN_ORDER_LIFETIME_MS && (overpaying || tooFarBelowBid)) {
          try {
            await this.orderService.cancelOrder({
              symbol: config.symbol,
              orderId: activeBuy.orderId,
            });
            this.tracker.markCancelled(activeBuy.orderId);
            this.emitEvent('BUY_ORDER_CANCELLED', {
              orderId: activeBuy.orderId,
              oldPrice: activeBuy.price,
              reason: overpaying ? 'overpaying' : 'too_far_below_bid',
              priceDiff: (orderPrice - bid1Num).toFixed(2),
            });
          } catch (error) {
            this.tracker.clearActiveBuy();
            logger.debug('撤旧买单失败（可能已成交或已撤销）', { orderId: activeBuy.orderId });
          }
          await this.placeBuyOrder(bid1, config);
        }
      } else {
        // 防止 post_only 被交易所撤销后立即重新下单造成快速循环
        const timeSinceLastCancel = Date.now() - this.lastBuyCancelledAt;
        if (this.lastBuyCancelledAt > 0 && timeSinceLastCancel < POST_ONLY_CANCEL_COOLDOWN_MS) {
          logger.debug('post_only 冷却中，跳过本轮挂单', {
            cooldownRemaining: POST_ONLY_CANCEL_COOLDOWN_MS - timeSinceLastCancel,
          });
        } else {
          await this.placeBuyOrder(bid1, config);
        }
      }

      this.consecutiveErrors = 0;
    } catch (error) {
      this.handleLoopError('Loop A', error);
    }

    this.scheduleLoopA();
  }

  private async placeBuyOrder(bidPrice: string, config: ScalpingStrategyConfig): Promise<void> {
    const tickSize = Math.pow(10, -config.pricePrecision);

    // 自适应价格偏移：连续 post_only 被撤越多，偏移越大
    // 基础偏移 2 tick，每连续被撤一次多偏移 1 tick，最大 10 tick
    const baseTickOffset = 2;
    const adaptiveTickOffset = Math.min(baseTickOffset + this.consecutivePostOnlyCancels, 10);
    const adjustedPrice = parseFloat(bidPrice) - tickSize * adaptiveTickOffset;
    const price = adjustedPrice.toFixed(config.pricePrecision);

    // 如果连续被撤超过 5 次，改用 GTC（normal）模式 — 接受 taker 成交
    const useGtc = this.consecutivePostOnlyCancels >= 5;
    const force = useGtc ? 'normal' : 'post_only';

    // 获取 ask1 用于诊断日志
    let ask1: string | null = null;
    try {
      ask1 = await this.marketDataService.getBestAsk(config.symbol);
    } catch {
      // 非关键信息，忽略错误
    }

    const size = this.calculateSize(config.orderAmountUsdt, price, config.sizePrecision);

    if (!size) {
      logger.warn('下单数量为零，跳过挂单', {
        orderAmountUsdt: config.orderAmountUsdt,
        price,
        sizePrecision: config.sizePrecision,
      });
      return;
    }

    const clientOid = `scalp_${config.symbol}_${config.direction}_buy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      // 合约模式下始终发送 tradeSide
      // 双向持仓 → 'open'; 单向持仓 → 不发（但默认 double_hold 以确保安全）
      const buyTradeSide = config.tradingType === 'futures'
        ? (this.holdMode === 'single_hold' ? undefined : 'open')
        : undefined;

      const result = await this.orderService.placeOrder({
        symbol: config.symbol,
        size,
        side: 'buy',
        orderType: 'limit',
        price,
        force,
        tradeSide: buyTradeSide,
        clientOid,
      });

      const trackedOrder: TrackedOrder = {
        orderId: result.orderId,
        clientOid,
        side: 'buy',
        price,
        size,
        status: 'pending',
        linkedOrderId: null,
        direction: config.direction || 'long',
        createdAt: Date.now(),
        filledAt: null,
      };
      this.tracker.addOrder(trackedOrder);
      this.persistenceService.persistNewOrder(trackedOrder, config.symbol, config.productType || '', config.marginCoin || 'USDT');

      this.emitEvent('BUY_ORDER_PLACED', {
        orderId: result.orderId,
        price,
        size,
        bid1: bidPrice,
        ask1,
        tickOffset: adaptiveTickOffset,
        force,
        consecutivePostOnlyCancels: this.consecutivePostOnlyCancels,
      });
    } catch (error) {
      logger.warn('挂买单失败', { error: String(error), price, size, bid1: bidPrice, ask1, force });
    }
  }

  // ============================================================
  // Loop B: 成交检测
  // ============================================================

  private scheduleLoopB(): void {
    if (this.status !== 'RUNNING') return;
    const config = this.configManager!.getScalpingConfig();
    this.loopBTimer = setTimeout(() => this.runLoopB(), config.orderCheckIntervalMs);
  }

  private async runLoopB(): Promise<void> {
    if (this.status !== 'RUNNING') return;

    try {
      const config = this.configManager!.getScalpingConfig();

      // 查询交易所挂单
      const exchangePending = await this.orderService.getPendingOrders(config.symbol);
      const exchangePendingIds = new Set(exchangePending.map(o => o.orderId));

      // 对账第一步：找出消失的订单
      const disappeared = this.tracker.findDisappearedOrders(exchangePendingIds);

      // 对账第二步：通过订单详情 API 确认真实状态
      const filledBuyOrders: TrackedOrder[] = [];
      const filledSellOrders: TrackedOrder[] = [];

      for (const { order } of disappeared) {
        try {
          const detail = await this.orderService.getOrderDetail(config.symbol, order.orderId);

          if (detail.state === 'filled') {
            const confirmed = this.tracker.confirmFilled(order.orderId);
            if (confirmed) {
              this.persistenceService.persistOrderStatusChange(
                order.orderId, 'filled', confirmed.filledAt || Date.now(), confirmed.linkedOrderId
              );
              if (confirmed.side === 'buy') {
                filledBuyOrders.push(confirmed);
                // 买单成交，重置 post_only 连续被撤计数
                this.consecutivePostOnlyCancels = 0;
              } else {
                filledSellOrders.push(confirmed);
              }
            }
          } else if (detail.state === 'live' || detail.state === 'partially_filled') {
            logger.debug('订单仍在交易所活跃，跳过', {
              orderId: order.orderId,
              side: order.side,
              state: detail.state,
            });
          } else {
            this.tracker.markExchangeCancelled(order.orderId);
            this.persistenceService.persistOrderStatusChange(order.orderId, 'cancelled', null, null);
            // 记录买单被交易所撤销的时间和连续被撤次数
            if (order.side === 'buy') {
              this.lastBuyCancelledAt = Date.now();
              this.consecutivePostOnlyCancels++;
              logger.info('买单被交易所撤销（post_only）', {
                consecutivePostOnlyCancels: this.consecutivePostOnlyCancels,
                orderId: order.orderId,
                price: order.price,
              });
            }
            logger.info('订单被交易所撤销', {
              orderId: order.orderId,
              side: order.side,
              state: detail.state,
              filledQty: detail.filledQty,
            });
          }
        } catch (error) {
          logger.warn('查询订单详情失败，跳过本轮', {
            orderId: order.orderId,
            error: String(error),
          });
        }
      }

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

      // 同步未实现盈亏和权益
      try {
        const { equity, unrealizedPL } = await this.accountService.getAccountEquity(
          config.marginCoin || 'USDT'
        );
        this.unrealizedPnl = unrealizedPL;
        this.riskController!.updateEquity(parseFloat(equity));
      } catch (error) {
        logger.debug('同步权益失败', { error: String(error) });
      }

      this.consecutiveErrors = 0;
    } catch (error) {
      this.handleLoopError('Loop B', error);
    }

    this.scheduleLoopB();
  }

  private async handleBuyFilled(buyOrder: TrackedOrder, config: ScalpingStrategyConfig): Promise<void> {
    const buyPrice = parseFloat(buyOrder.price);
    const sellPrice = (buyPrice + parseFloat(config.priceSpread)).toFixed(config.pricePrecision);

    // 等待仓位在交易所结算（Bitget 模拟盘结算较慢，需要 3-5 秒）
    await this.sleep(3000);

    // 重试策略：
    // 合约模式下：tradeSide 跟随 holdMode（默认 double_hold → 'close'）
    // Attempts 1-5: 使用 tradeSide:'close'（双向持仓模式），递增等待
    // Attempt 6: 反转策略 — 万一持仓模式检测有误
    // Attempt 7: 使用 market 单强制平仓
    const maxRetries = 7;
    const retryDelays = [2000, 3000, 4000, 5000, 5000, 3000]; // attempt 1..6 失败后的等待时间

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const clientOid = `scalp_${config.symbol}_${config.direction}_sell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // 确定 tradeSide
      let sellTradeSide: 'open' | 'close' | undefined;
      let useForce: string = 'post_only';
      if (config.tradingType === 'futures') {
        if (attempt <= maxRetries - 2) {
          // 前 N-2 次：按检测到的持仓模式
          sellTradeSide = this.holdMode === 'single_hold' ? undefined : 'close';
        } else if (attempt === maxRetries - 1) {
          // 倒数第二次：反转策略（万一检测有误）
          sellTradeSide = this.holdMode === 'single_hold' ? 'close' : undefined;
        } else {
          // 最后一次：用 market 单 + close 强制平仓
          sellTradeSide = 'close';
          useForce = 'normal';
        }
      }

      try {
        const result = await this.orderService.placeOrder({
          symbol: config.symbol,
          size: buyOrder.size,
          side: 'sell',
          orderType: attempt === maxRetries ? 'market' : 'limit',
          price: attempt === maxRetries ? undefined : sellPrice,
          force: useForce,
          tradeSide: sellTradeSide,
          clientOid,
        });

        const sellTracked: TrackedOrder = {
          orderId: result.orderId,
          clientOid,
          side: 'sell',
          price: sellPrice,
          size: buyOrder.size,
          status: 'pending',
          linkedOrderId: buyOrder.orderId,
          direction: config.direction || 'long',
          createdAt: Date.now(),
          filledAt: null,
        };
        this.tracker.addOrder(sellTracked);
        this.persistenceService.persistNewOrder(sellTracked, config.symbol, config.productType || '', config.marginCoin || 'USDT');

        this.tracker.linkOrders(buyOrder.orderId, result.orderId);
        this.emitEvent('SELL_ORDER_PLACED', {
          orderId: result.orderId,
          buyOrderId: buyOrder.orderId,
          buyPrice: buyOrder.price,
          sellPrice,
          size: buyOrder.size,
          attempt,
          usedTradeSide: sellTradeSide,
          orderType: attempt === maxRetries ? 'market' : 'limit',
        });

        logger.info('买单成交，已挂卖单', {
          buyOrderId: buyOrder.orderId,
          buyPrice: buyOrder.price,
          sellOrderId: result.orderId,
          sellPrice,
          attempt,
          holdMode: this.holdMode,
          tradeSide: sellTradeSide,
        });
        return;
      } catch (error) {
        const errMsg = String(error);
        // 检查 AppError.details 中的 Bitget 错误码（String(error) 不包含 details）
        const bitgetCode = this.extractBitgetCode(error);
        const isPositionError =
          errMsg.includes('22002') ||
          errMsg.includes('仓位') ||
          bitgetCode === '22002';
        const isModeError =
          errMsg.includes('40774') ||
          bitgetCode === '40774';

        if ((isPositionError || isModeError) && attempt < maxRetries) {
          const delay = retryDelays[attempt - 1] || 5000;
          logger.warn('挂卖单失败，等待重试', {
            buyOrderId: buyOrder.orderId,
            attempt,
            maxRetries,
            nextDelayMs: delay,
            error: errMsg,
            bitgetCode,
            holdMode: this.holdMode,
            usedTradeSide: sellTradeSide,
            isPositionError,
            isModeError,
          });
          await this.sleep(delay);
          continue;
        }

        logger.error('挂卖单最终失败', {
          error: errMsg,
          buyOrderId: buyOrder.orderId,
          attempt,
          bitgetCode,
          holdMode: this.holdMode,
        });
        this.emitEvent('SELL_ORDER_FAILED', {
          buyOrderId: buyOrder.orderId,
          buyPrice: buyOrder.price,
          sellPrice,
          error: errMsg,
          attempts: attempt,
        });
        return;
      }
    }
  }

  /**
   * 从 AppError 中提取 Bitget 错误码
   */
  private extractBitgetCode(error: unknown): string {
    if (error instanceof AppError && error.details) {
      const details = error.details as Record<string, unknown>;
      const data = details.data as Record<string, unknown> | undefined;
      return data?.code ? String(data.code) : '';
    }
    return '';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private handleSellFilled(sellOrder: TrackedOrder): void {
    this.tradeCount++;

    const buyOrder = sellOrder.linkedOrderId
      ? this.tracker.getOrder(sellOrder.linkedOrderId)
      : null;

    if (buyOrder) {
      const buyPrice = parseFloat(buyOrder.price);
      const sellPrice = parseFloat(sellOrder.price);
      const size = parseFloat(sellOrder.size);
      const pnl = (sellPrice - buyPrice) * size;

      const fee = StrategyConfigManager.estimateFeeUsdt(
        (sellPrice * size).toFixed(2)
      ) * 2;
      const netPnl = pnl - fee;

      this.realizedPnl += netPnl;
      this.riskController?.recordPnl(netPnl);
      this.persistenceService.persistRealizedPnl(netPnl, fee, netPnl > 0);

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

  private checkFeeCoverage(config: ScalpingStrategyConfig, spec: ContractSpecInfo): void {
    const spread = parseFloat(config.priceSpread);
    // 买单 post_only = maker fee, 卖单可能成交为 taker
    const totalFeeRate = spec.makerFeeRate + spec.takerFeeRate;

    const breakevenPrice = spread / totalFeeRate;
    const suggestSpread = (price: number) =>
      (price * totalFeeRate * 1.5).toFixed(1);

    logger.info('手续费覆盖分析', {
      priceSpread: config.priceSpread,
      makerFeeRate: `${(spec.makerFeeRate * 100).toFixed(4)}%`,
      takerFeeRate: `${(spec.takerFeeRate * 100).toFixed(4)}%`,
      totalFeeRate: `${(totalFeeRate * 100).toFixed(4)}%`,
      breakevenPrice: breakevenPrice.toFixed(0),
      suggestedSpreadForBTC: suggestSpread(70000),
      suggestedSpreadForETH: suggestSpread(3000),
    });

    if (breakevenPrice < 200000) {
      const estPrice = 70000;
      const orderAmount = parseFloat(config.orderAmountUsdt);
      const size = orderAmount / estPrice;
      const profit = size * spread;
      const fee = orderAmount * totalFeeRate;
      const netLoss = fee - profit;

      if (netLoss > 0) {
        logger.warn(
          `priceSpread=${config.priceSpread} 无法覆盖手续费！` +
          ` BTC ~${estPrice}: 每笔利润 ${profit.toFixed(6)} < 手续费 ${fee.toFixed(6)}，净亏 ${netLoss.toFixed(6)} USDT。` +
          ` 建议: priceSpread >= ${suggestSpread(estPrice)} 或换低价币种`,
          {
            breakevenPrice: breakevenPrice.toFixed(0),
            currentSpread: config.priceSpread,
            suggestedSpread: suggestSpread(estPrice),
            estimatedLossPerTrade: netLoss.toFixed(6),
          }
        );
      }
    }
  }

  private calculateSize(amountUsdt: string, price: string, precision: number): string {
    const amount = parseFloat(amountUsdt);
    const priceNum = parseFloat(price);
    if (priceNum <= 0) return '';
    const size = amount / priceNum;
    const minSize = Math.pow(10, -precision);
    if (size < minSize) {
      logger.warn('计算数量不足最小精度', {
        amountUsdt,
        price,
        calculatedSize: size,
        minSize,
        precision,
        minRequiredUsdt: (minSize * priceNum).toFixed(2),
      });
      return '';
    }
    const result = parseFloat(size.toFixed(precision));

    if (this.contractSpec && result < this.contractSpec.minTradeNum) {
      logger.warn('计算数量不足交易所最小下单量', {
        amountUsdt,
        price,
        calculatedSize: result,
        minTradeNum: this.contractSpec.minTradeNum,
      });
      return '';
    }

    return result.toString();
  }

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

  private emitEvent(type: StrategyEventType, data: Record<string, unknown>): void {
    const event: StrategyEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    this.events.push(event);

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }
}
