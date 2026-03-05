/**
 * 剥头皮策略引擎
 * 状态机 + 双循环架构，支持单向/双向交易
 *
 * Loop A — 盘口追踪（每 pollIntervalMs）:
 *   对每个活跃方向 (long / short / both):
 *   1. 获取参考价格（long→bid1, short→ask1）
 *   2. 价格偏离 → 撤旧入场单，挂新入场单
 *   3. 无入场单 → 挂 post_only 限价入场
 *
 * Loop B — 成交检测（每 orderCheckIntervalMs）:
 *   1. 查询交易所挂单列表
 *   2. 对比本地状态，发现已成交
 *   3. 入场成交 → 挂出场单（long: 买价+spread, short: 卖价-spread）
 *   4. 出场成交 → 计算 PnL
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
import { OrderStateTracker, EntryDirection } from './order-state-tracker';
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
import { CandleDataService } from '../services/candle-data.service';
import { IndicatorResult } from './indicators/technical-indicators';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { PolymarketSignalService } from '../services/polymarket-signal.service';

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
  // Per-direction tracking prices: long→bid1, short→ask1
  private lastTrackingPrice: Map<EntryDirection, string | null> = new Map([
    ['long', null],
    ['short', null],
  ]);
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

  private candleDataService: CandleDataService | null = null;
  private lastDynamicSpread: string | null = null;

  private events: StrategyEvent[] = [];
  private maxEvents = 1000;
  // Per-direction post_only tracking
  private lastEntryCancelledAt: Map<EntryDirection, number> = new Map([
    ['long', 0],
    ['short', 0],
  ]);
  private holdMode: HoldMode = 'double_hold';
  private consecutivePostOnlyCancels: Map<EntryDirection, number> = new Map([
    ['long', 0],
    ['short', 0],
  ]);
  private loopCounter = 0;

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
   * 获取当前配置的活跃方向列表
   */
  private getActiveDirections(config: ScalpingStrategyConfig): EntryDirection[] {
    const dir = config.direction || 'long';
    if (dir === 'both') return ['long', 'short'];
    if (dir === 'short') return ['short'];
    return ['long'];
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
      const newTradingType = overrides?.tradingType || this.lastConfig.tradingType;
      const tradingTypeChanged = this.configLoaded && this.lastConfig.tradingType !== newTradingType;
      const baseOverrides = this.configLoaded
        ? { ...this.lastConfig, ...overrides }
        : overrides;
      if (tradingTypeChanged && newTradingType === 'spot') {
        delete (baseOverrides as Record<string, unknown>).productType;
        delete (baseOverrides as Record<string, unknown>).marginMode;
      }
      const configInput = {
        strategyType: 'scalping' as const,
        tradingType: newTradingType,
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

          this.configManager.update({
            pricePrecision: this.contractSpec.pricePlace,
            sizePrecision: this.contractSpec.volumePlace,
          });

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
          this.holdMode = 'double_hold';
          logger.warn('持仓模式检测失败，默认双向持仓', { error: String(error), fallback: this.holdMode });
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
      this.lastTrackingPrice.set('long', null);
      this.lastTrackingPrice.set('short', null);
      this.lastEntryCancelledAt.set('long', 0);
      this.lastEntryCancelledAt.set('short', 0);
      this.consecutivePostOnlyCancels.set('long', 0);
      this.consecutivePostOnlyCancels.set('short', 0);
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
      this.lastConfig = this.configManager.getScalpingConfig();
      this.configLoaded = true;
      this.persistenceService.saveActiveConfig(this.lastConfig);

      this.emitEvent('STRATEGY_STARTED', { config: this.lastConfig });
      logger.info('策略已启动', { symbol: this.lastConfig.symbol, direction: this.lastConfig.direction });

      // 初始化动态价差所需的 K线数据服务
      if (this.lastConfig.dynamicSpreadEnabled) {
        this.candleDataService = CandleDataService.getInstance();
        if (this.lastConfig.useWebSocket && this.lastConfig.productType) {
          this.candleDataService.enableWebSocket(
            this.lastConfig.tradingType === 'futures' ? 'mc' : 'sp',
            this.lastConfig.symbol
          );
        }
        logger.info('动态价差已启用', {
          volatilityMultiplier: this.lastConfig.volatilityMultiplier,
          maxDynamicSpread: this.lastConfig.maxDynamicSpread,
        });
      }

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

    if (this.loopATimer) {
      clearTimeout(this.loopATimer);
      this.loopATimer = null;
    }
    if (this.loopBTimer) {
      clearTimeout(this.loopBTimer);
      this.loopBTimer = null;
    }

    // 撤销所有方向的活跃入场单
    if (this.configManager) {
      const config = this.configManager.getScalpingConfig();
      for (const dir of this.getActiveDirections(config)) {
        const activeEntry = this.tracker.getActiveEntryOrder(dir);
        if (activeEntry) {
          try {
            await this.orderService.cancelOrder({
              symbol: config.symbol,
              orderId: activeEntry.orderId,
            });
            this.tracker.markCancelled(activeEntry.orderId);
          } catch (error) {
            logger.warn(`停止时撤 ${dir} 入场单失败`, { error: String(error) });
          }
        }
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
   * 获取策略状态（含 per-direction 信息）
   */
  getState(): StrategyState {
    const config = this.configManager?.getScalpingConfig() || this.lastConfig;
    const riskStats = this.riskController?.getStats();
    const directions = this.getActiveDirections(config);

    // Per-direction state
    const activeEntryOrders: Record<string, string | null> = {};
    const lastTrackingPrices: Record<string, string | null> = {};
    const pendingExitCounts: Record<string, number> = {};
    const positionUsdtByDirection: Record<string, string> = {};

    for (const dir of directions) {
      activeEntryOrders[dir] = this.tracker.getActiveEntryOrderId(dir);
      lastTrackingPrices[dir] = this.lastTrackingPrice.get(dir) || null;
      pendingExitCounts[dir] = this.tracker.getPendingExitOrders(dir).length;
      positionUsdtByDirection[dir] = this.tracker.getTotalPositionUsdtByDirection(dir);
    }

    return {
      status: this.status,
      strategyType: 'scalping',
      tradingType: config.tradingType,
      instanceId: this.instanceId,
      config,
      // Legacy fields (backward compatible — use long direction or first available)
      activeBuyOrderId: this.tracker.getActiveBuyOrderId(),
      lastBidPrice: this.lastTrackingPrice.get('long') || null,
      pendingSellCount: this.tracker.getPendingExitOrders().length,
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
      // Per-direction state
      activeEntryOrders,
      lastTrackingPrices,
      pendingExitCounts,
      positionUsdtByDirection,
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
  // Loop A: 盘口追踪（per-direction）
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
      const directions = this.getActiveDirections(config);

      // 风控检查（共享资金池）
      const positionUsdt = parseFloat(this.tracker.getTotalPositionUsdt());
      const riskCheck = this.riskController!.checkCanTrade(positionUsdt);
      if (!riskCheck.canTrade) {
        logger.debug('风控拒绝交易', { reason: riskCheck.reason });
        this.scheduleLoopA();
        return;
      }

      // 对每个方向执行入场逻辑
      for (const dir of directions) {
        await this.runLoopAForDirection(dir, config);
      }

      this.consecutiveErrors = 0;
    } catch (error) {
      this.handleLoopError('Loop A', error);
    }

    this.scheduleLoopA();
  }

  private async runLoopAForDirection(dir: EntryDirection, config: ScalpingStrategyConfig): Promise<void> {
    // 获取参考价格：long→bid1, short→ask1
    const refPrice = dir === 'long'
      ? await this.marketDataService.getBestBid(config.symbol)
      : await this.marketDataService.getBestAsk(config.symbol);
    const refPriceNum = parseFloat(refPrice);
    const spread = parseFloat(config.priceSpread);
    this.lastTrackingPrice.set(dir, refPrice);

    const activeEntry = this.tracker.getActiveEntryOrder(dir);
    const dirCancels = this.consecutivePostOnlyCancels.get(dir) || 0;

    if (activeEntry && activeEntry.status === 'pending') {
      const orderPrice = parseFloat(activeEntry.price);
      const orderAge = Date.now() - activeEntry.createdAt;

      const MIN_ORDER_LIFETIME_MS = 5000;
      const tickSize = Math.pow(10, -config.pricePrecision);
      const adaptiveOffset = Math.min(2 + dirCancels, 10);
      const refreshThreshold = Math.max(tickSize * adaptiveOffset * 3, spread * 0.1);

      // 价格偏离检测（方向感知）
      let overpaying: boolean;
      let tooFar: boolean;
      if (dir === 'long') {
        overpaying = orderPrice > refPriceNum + refreshThreshold;
        tooFar = refPriceNum - orderPrice > refreshThreshold;
      } else {
        // Short: 入场卖单应在 ask1 附近，price < ask1 - threshold 表示太低（overpaying/过度让利），price > ask1 + threshold 表示太远
        overpaying = orderPrice < refPriceNum - refreshThreshold;
        tooFar = orderPrice - refPriceNum > refreshThreshold;
      }

      if (orderAge >= MIN_ORDER_LIFETIME_MS && (overpaying || tooFar)) {
        logger.info(`刷新 ${dir} 入场单（价格偏离）`, {
          orderId: activeEntry.orderId,
          orderPrice: activeEntry.price,
          refPrice,
          direction: dir,
          reason: overpaying ? 'overpaying' : 'too_far',
        });
        try {
          await this.orderService.cancelOrder({
            symbol: config.symbol,
            orderId: activeEntry.orderId,
          });
          this.tracker.markCancelled(activeEntry.orderId);
          this.emitEvent('BUY_ORDER_CANCELLED', {
            orderId: activeEntry.orderId,
            oldPrice: activeEntry.price,
            direction: dir,
            reason: overpaying ? 'overpaying' : 'too_far',
          });
        } catch {
          this.tracker.clearActiveEntry(dir);
          logger.debug(`撤旧 ${dir} 入场单失败（可能已成交或已撤销）`, { orderId: activeEntry.orderId });
        }
        await this.placeEntryOrder(dir, refPrice, config);
      } else {
        this.loopCounter++;
        if (this.loopCounter % 30 === 0) {
          logger.info(`心跳：等待 ${dir} 入场单成交`, {
            orderId: activeEntry.orderId,
            orderPrice: activeEntry.price,
            refPrice,
            direction: dir,
            pendingExits: this.tracker.getPendingExitOrders(dir).length,
            totalPositionUsdt: this.tracker.getTotalPositionUsdt(),
            realizedPnl: this.realizedPnl.toFixed(4),
            tradeCount: this.tradeCount,
            dynamicSpread: this.lastDynamicSpread,
          });
        }
      }
    } else {
      // 防止 post_only 被交易所撤销后立即重新下单
      const lastCancelledAt = this.lastEntryCancelledAt.get(dir) || 0;
      const timeSinceLastCancel = Date.now() - lastCancelledAt;
      if (lastCancelledAt > 0 && timeSinceLastCancel < POST_ONLY_CANCEL_COOLDOWN_MS) {
        logger.debug(`${dir} post_only 冷却中`, {
          cooldownRemaining: POST_ONLY_CANCEL_COOLDOWN_MS - timeSinceLastCancel,
        });
      } else {
        await this.placeEntryOrder(dir, refPrice, config);
      }
    }
  }

  /**
   * 下入场单（方向感知）
   * long: buy at bid1 - offset
   * short: sell at ask1 + offset
   */
  private async placeEntryOrder(dir: EntryDirection, refPrice: string, config: ScalpingStrategyConfig): Promise<void> {
    const tickSize = Math.pow(10, -config.pricePrecision);
    const dirCancels = this.consecutivePostOnlyCancels.get(dir) || 0;

    // 自适应 force + tick offset
    let force: string;
    let adaptiveTickOffset: number;
    if (config.tradingType === 'spot') {
      force = 'gtc';
      adaptiveTickOffset = 1;
    } else {
      const baseTickOffset = 2;
      adaptiveTickOffset = Math.min(baseTickOffset + dirCancels, 10);
      const useGtc = dirCancels >= 5;
      force = useGtc ? 'gtc' : 'post_only';
    }

    // 宏观信号调整
    const macroSpread = this.getMacroSpreadAdjustment();
    if (dir === 'long' && macroSpread.direction === 'bearish' && macroSpread.riskScore > 70) {
      const extraTicks = Math.ceil((macroSpread.riskScore - 70) / 15);
      adaptiveTickOffset += extraTicks;
    }
    if (dir === 'short' && macroSpread.direction === 'bullish' && macroSpread.riskScore > 70) {
      const extraTicks = Math.ceil((macroSpread.riskScore - 70) / 15);
      adaptiveTickOffset += extraTicks;
    }

    // 计算入场价格
    const refPriceNum = parseFloat(refPrice);
    let adjustedPrice: number;
    if (dir === 'long') {
      adjustedPrice = refPriceNum - tickSize * adaptiveTickOffset;
    } else {
      adjustedPrice = refPriceNum + tickSize * adaptiveTickOffset;
    }
    const price = adjustedPrice.toFixed(config.pricePrecision);

    const size = this.calculateSize(config.orderAmountUsdt, price, config.sizePrecision);
    if (!size) {
      logger.warn(`${dir} 下单数量为零，跳过`, {
        orderAmountUsdt: config.orderAmountUsdt,
        price,
        sizePrecision: config.sizePrecision,
      });
      return;
    }

    const entrySide = dir === 'long' ? 'buy' : 'sell';
    const clientOid = `scalp_${config.symbol}_${dir}_entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      // tradeSide: 双向持仓 → 'open'; 单向持仓 → undefined
      const entryTradeSide = config.tradingType === 'futures'
        ? (this.holdMode === 'single_hold' ? undefined : 'open')
        : undefined;

      const result = await this.orderService.placeOrder({
        symbol: config.symbol,
        size,
        side: entrySide,
        orderType: 'limit',
        price,
        force,
        tradeSide: entryTradeSide,
        clientOid,
      });

      const trackedOrder: TrackedOrder = {
        orderId: result.orderId,
        clientOid,
        side: entrySide,
        price,
        size,
        status: 'pending',
        linkedOrderId: null,
        direction: dir,
        orderRole: 'entry',
        createdAt: Date.now(),
        filledAt: null,
      };
      this.tracker.addOrder(trackedOrder);
      this.persistenceService.persistNewOrder(trackedOrder, config.symbol, config.productType || '', config.marginCoin || 'USDT');

      this.emitEvent('BUY_ORDER_PLACED', {
        orderId: result.orderId,
        price,
        size,
        refPrice,
        direction: dir,
        side: entrySide,
        tickOffset: adaptiveTickOffset,
        force,
        consecutivePostOnlyCancels: dirCancels,
      });
    } catch (error) {
      logger.warn(`${dir} 挂入场单失败`, { error: String(error), price, size, refPrice, direction: dir, force });
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

      // 对账：找出消失的订单
      const disappeared = this.tracker.findDisappearedOrders(exchangePendingIds);

      const filledEntryOrders: TrackedOrder[] = [];
      const filledExitOrders: TrackedOrder[] = [];

      for (const { order } of disappeared) {
        try {
          const detail = await this.orderService.getOrderDetail(config.symbol, order.orderId);

          if (detail.state === 'filled') {
            const confirmed = this.tracker.confirmFilled(order.orderId);
            if (confirmed) {
              this.persistenceService.persistOrderStatusChange(
                order.orderId, 'filled', confirmed.filledAt || Date.now(), confirmed.linkedOrderId
              );

              const isEntry = this.isEntryOrder(confirmed);
              if (isEntry) {
                filledEntryOrders.push(confirmed);
                // 入场成交，重置该方向的 post_only 被撤计数
                const dir = this.getOrderDirection(confirmed);
                if (dir) this.consecutivePostOnlyCancels.set(dir, 0);
              } else {
                filledExitOrders.push(confirmed);
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
            // 记录入场单被交易所撤销
            if (this.isEntryOrder(order)) {
              const dir = this.getOrderDirection(order);
              if (dir) {
                this.lastEntryCancelledAt.set(dir, Date.now());
                const prevCancels = this.consecutivePostOnlyCancels.get(dir) || 0;
                this.consecutivePostOnlyCancels.set(dir, prevCancels + 1);
                logger.info(`${dir} 入场单被交易所撤销（post_only）`, {
                  consecutivePostOnlyCancels: prevCancels + 1,
                  orderId: order.orderId,
                  price: order.price,
                });
              }
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

      // 处理入场成交 → 挂出场单
      for (const entryOrder of filledEntryOrders) {
        await this.handleEntryFilled(entryOrder, config);
      }

      // 处理出场成交 → 计算 PnL
      for (const exitOrder of filledExitOrders) {
        this.handleExitFilled(exitOrder);
      }

      // 检查合并（per-direction）
      const directions = this.getActiveDirections(config);
      for (const dir of directions) {
        if (this.mergeEngine!.needsMerge(dir)) {
          logger.info(`${dir} 挂单数达到上限，触发合并`);
          const mergeResult = await this.mergeEngine!.mergeExitOrders(dir);
          if (mergeResult) {
            this.emitEvent('ORDERS_MERGED', { ...mergeResult as unknown as Record<string, unknown>, direction: dir });
          }
        }
      }

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

  /**
   * 入场成交处理（方向感知）
   */
  private async handleEntryFilled(entryOrder: TrackedOrder, config: ScalpingStrategyConfig): Promise<void> {
    const entryPrice = parseFloat(entryOrder.price);
    const dir = this.getOrderDirection(entryOrder) || 'long';

    // 动态价差
    let effectiveSpread = config.priceSpread;
    if (config.dynamicSpreadEnabled && this.candleDataService) {
      effectiveSpread = await this.calculateDynamicSpread(config, entryPrice);
      logger.info('出场单使用动态价差', {
        staticSpread: config.priceSpread,
        dynamicSpread: effectiveSpread,
        entryPrice: entryOrder.price,
        direction: dir,
      });
    }

    // 计算出场价格
    let exitPrice: string;
    if (dir === 'long') {
      exitPrice = (entryPrice + parseFloat(effectiveSpread)).toFixed(config.pricePrecision);
    } else {
      exitPrice = (entryPrice - parseFloat(effectiveSpread)).toFixed(config.pricePrecision);
    }

    // 出场 side
    const exitSide = dir === 'long' ? 'sell' : 'buy';

    // 等待仓位结算
    await this.sleep(5000);

    // 验证持仓并纠正 holdMode
    if (config.tradingType === 'futures' && config.productType) {
      try {
        const futuresAccountSvc = new FuturesAccountService();
        const positions = await futuresAccountSvc.getPositions(
          config.productType, config.marginCoin || 'USDT'
        );
        const pos = positions.find(
          p => p.symbol === config.symbol && parseFloat(p.total) > 0
        );
        if (!pos) {
          logger.warn('出场单前检查：持仓未到位，额外等待', { symbol: config.symbol, direction: dir });
          await this.sleep(3000);
        } else {
          const inferredMode: HoldMode =
            pos.posMode === 'one_way_mode' || pos.holdSide === 'net' ? 'single_hold' : 'double_hold';
          if (inferredMode !== this.holdMode) {
            logger.info('从持仓列表更新持仓模式', {
              old: this.holdMode, new: inferredMode, posMode: pos.posMode, holdSide: pos.holdSide,
            });
            this.holdMode = inferredMode;
            if (this.mergeEngine) {
              this.mergeEngine.updateHoldMode(inferredMode);
            }
          }
        }
      } catch (error) {
        logger.warn('出场单前持仓检查失败，继续使用已知 holdMode', { error: String(error) });
      }
    }

    // 重试策略（与原 handleBuyFilled 一致）
    const maxRetries = 7;
    const retryDelays = [2000, 2000, 2000, 3000, 3000, 3000];
    let effectiveHoldMode = this.holdMode;
    let holdModeSwitched = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const clientOid = `scalp_${config.symbol}_${dir}_exit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      let exitTradeSide: 'open' | 'close' | undefined;
      let useForce: string = 'post_only';
      if (config.tradingType === 'futures') {
        if (attempt <= maxRetries - 2) {
          exitTradeSide = effectiveHoldMode === 'single_hold' ? undefined : 'close';
        } else if (attempt === maxRetries - 1) {
          exitTradeSide = effectiveHoldMode === 'single_hold' ? 'close' : undefined;
        } else {
          exitTradeSide = undefined;
          useForce = 'gtc';
        }
      }

      try {
        const result = await this.orderService.placeOrder({
          symbol: config.symbol,
          size: entryOrder.size,
          side: exitSide,
          orderType: attempt === maxRetries ? 'market' : 'limit',
          price: attempt === maxRetries ? undefined : exitPrice,
          force: useForce,
          tradeSide: exitTradeSide,
          clientOid,
        });

        const exitTracked: TrackedOrder = {
          orderId: result.orderId,
          clientOid,
          side: exitSide,
          price: exitPrice,
          size: entryOrder.size,
          status: 'pending',
          linkedOrderId: entryOrder.orderId,
          direction: dir,
          orderRole: 'exit',
          createdAt: Date.now(),
          filledAt: null,
        };
        this.tracker.addOrder(exitTracked);
        this.persistenceService.persistNewOrder(exitTracked, config.symbol, config.productType || '', config.marginCoin || 'USDT');

        this.tracker.linkOrders(entryOrder.orderId, result.orderId);
        this.emitEvent('SELL_ORDER_PLACED', {
          orderId: result.orderId,
          entryOrderId: entryOrder.orderId,
          entryPrice: entryOrder.price,
          exitPrice,
          exitSide,
          direction: dir,
          size: entryOrder.size,
          attempt,
          usedTradeSide: exitTradeSide,
          orderType: attempt === maxRetries ? 'market' : 'limit',
        });

        logger.info(`${dir} 入场成交，已挂出场单`, {
          entryOrderId: entryOrder.orderId,
          entryPrice: entryOrder.price,
          exitOrderId: result.orderId,
          exitPrice,
          exitSide,
          attempt,
          holdMode: this.holdMode,
          tradeSide: exitTradeSide,
        });
        return;
      } catch (error) {
        const errMsg = String(error);
        const bitgetCode = this.extractBitgetCode(error);
        const isPositionError =
          errMsg.includes('22002') ||
          errMsg.includes('仓位') ||
          bitgetCode === '22002';
        const isModeError =
          errMsg.includes('40774') ||
          bitgetCode === '40774';

        if (attempt < maxRetries) {
          if (!holdModeSwitched && isModeError && attempt >= 2) {
            const oldMode = effectiveHoldMode;
            effectiveHoldMode = effectiveHoldMode === 'single_hold' ? 'double_hold' : 'single_hold';
            holdModeSwitched = true;
            this.holdMode = effectiveHoldMode;
            if (this.mergeEngine) {
              this.mergeEngine.updateHoldMode(effectiveHoldMode);
            }
            logger.info('动态切换持仓模式', { from: oldMode, to: effectiveHoldMode, attempt, direction: dir });
          }
          const isNetworkError = !isPositionError && !isModeError;
          const delay = isNetworkError ? 3000 : isPositionError ? 3000 : (retryDelays[attempt - 1] || 5000);
          logger.warn(`${dir} 挂出场单失败，等待重试`, {
            entryOrderId: entryOrder.orderId,
            attempt,
            maxRetries,
            nextDelayMs: delay,
            error: errMsg,
            bitgetCode,
            effectiveHoldMode,
            usedTradeSide: exitTradeSide,
          });
          await this.sleep(delay);
          continue;
        }

        logger.error(`${dir} 挂出场单最终失败`, {
          error: errMsg,
          entryOrderId: entryOrder.orderId,
          attempt,
          bitgetCode,
          holdMode: this.holdMode,
        });
        this.emitEvent('SELL_ORDER_FAILED', {
          entryOrderId: entryOrder.orderId,
          entryPrice: entryOrder.price,
          exitPrice,
          direction: dir,
          error: errMsg,
          attempts: attempt,
        });
        return;
      }
    }
  }

  /**
   * 出场成交处理（方向感知 PnL）
   */
  private handleExitFilled(exitOrder: TrackedOrder): void {
    this.tradeCount++;
    const dir = this.getOrderDirection(exitOrder) || 'long';

    const entryOrder = exitOrder.linkedOrderId
      ? this.tracker.getOrder(exitOrder.linkedOrderId)
      : null;

    if (entryOrder) {
      const entryPrice = parseFloat(entryOrder.price);
      const exitPrice = parseFloat(exitOrder.price);
      const size = parseFloat(exitOrder.size);

      // PnL: long = (exit-entry)*size, short = (entry-exit)*size
      let pnl: number;
      if (dir === 'long') {
        pnl = (exitPrice - entryPrice) * size;
      } else {
        pnl = (entryPrice - exitPrice) * size;
      }

      const fee = StrategyConfigManager.estimateFeeUsdt(
        (exitPrice * size).toFixed(2)
      ) * 2;
      const netPnl = pnl - fee;

      this.realizedPnl += netPnl;
      this.riskController?.recordPnl(netPnl);
      this.persistenceService.persistRealizedPnl(netPnl, fee, netPnl > 0);

      this.emitEvent('SELL_ORDER_FILLED', {
        exitOrderId: exitOrder.orderId,
        entryOrderId: entryOrder.orderId,
        entryPrice: entryOrder.price,
        exitPrice: exitOrder.price,
        size: exitOrder.size,
        direction: dir,
        grossPnl: pnl.toFixed(4),
        fee: fee.toFixed(4),
        netPnl: netPnl.toFixed(4),
      });

      logger.info(`${dir} 出场成交`, {
        exitOrderId: exitOrder.orderId,
        direction: dir,
        netPnl: netPnl.toFixed(4),
        totalPnl: this.realizedPnl.toFixed(4),
      });
    } else {
      this.emitEvent('SELL_ORDER_FILLED', {
        exitOrderId: exitOrder.orderId,
        exitPrice: exitOrder.price,
        size: exitOrder.size,
        direction: dir,
        note: '无法找到对应入场单',
      });
    }
  }

  // ============================================================
  // 辅助方法：判断入场/出场 + 推断方向
  // ============================================================

  /**
   * 判断订单是否为入场单
   */
  private isEntryOrder(order: TrackedOrder): boolean {
    if (order.orderRole) return order.orderRole === 'entry';
    // Legacy: long 方向 buy 是入场, short 方向 sell 是入场
    if (order.direction === 'short') return order.side === 'sell';
    return order.side === 'buy';
  }

  /**
   * 获取订单方向
   */
  private getOrderDirection(order: TrackedOrder): EntryDirection | null {
    if (order.direction === 'long' || order.direction === 'short') return order.direction;
    // Legacy: buy=long, sell exit=long
    return 'long';
  }

  // ============================================================
  // 动态价差计算
  // ============================================================

  private async calculateDynamicSpread(
    config: ScalpingStrategyConfig,
    currentPrice: number
  ): Promise<string> {
    if (!this.candleDataService) {
      return config.priceSpread;
    }

    try {
      const indicators = await this.candleDataService.getLatestIndicators(
        config.symbol,
        config.productType
      );

      const staticSpread = parseFloat(config.priceSpread);
      const multiplier = config.volatilityMultiplier ?? 1.2;
      const maxDynamic = config.maxDynamicSpread
        ? parseFloat(config.maxDynamicSpread)
        : currentPrice * 0.01;

      let dynamicSpread = indicators.atr * multiplier;

      if (indicators.rsi > 70 || indicators.rsi < 30) {
        const rsiExtremeFactor = 1 + Math.abs(indicators.rsi - 50) / 100;
        dynamicSpread *= rsiExtremeFactor;
        logger.debug('RSI 极端值调整价差', {
          rsi: indicators.rsi.toFixed(1),
          rsiExtremeFactor: rsiExtremeFactor.toFixed(3),
        });
      }

      const bbWidthPercent = indicators.bollingerWidth * 100;
      if (bbWidthPercent < 2) {
        dynamicSpread *= 0.8;
      } else if (bbWidthPercent > 4) {
        dynamicSpread *= 1.2;
      }

      const macroAdj = this.getMacroSpreadAdjustment();
      dynamicSpread *= macroAdj.multiplier;

      dynamicSpread = Math.max(dynamicSpread, staticSpread);
      dynamicSpread = Math.min(dynamicSpread, maxDynamic);

      const result = dynamicSpread.toFixed(config.pricePrecision);
      this.lastDynamicSpread = result;

      logger.debug('动态价差计算', {
        staticSpread: config.priceSpread,
        atr: indicators.atr.toFixed(config.pricePrecision),
        rsi: indicators.rsi.toFixed(1),
        bbWidth: `${bbWidthPercent.toFixed(2)}%`,
        dynamicSpread: result,
        multiplier,
      });

      return result;
    } catch (error) {
      logger.warn('动态价差计算失败，使用静态价差', { error: String(error) });
      return config.priceSpread;
    }
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private getMacroSpreadAdjustment(): { multiplier: number; direction: string; riskScore: number } {
    try {
      return PolymarketSignalService.getInstance().getSpreadAdjustment();
    } catch {
      return { multiplier: 1.0, direction: 'neutral', riskScore: 50 };
    }
  }

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

  private checkFeeCoverage(config: ScalpingStrategyConfig, spec: ContractSpecInfo): void {
    const spread = parseFloat(config.priceSpread);
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
