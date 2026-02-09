/**
 * 网格策略引擎
 * 单循环架构：统一主循环处理挂单、成交检测、PnL 计算
 *
 * 主循环（每 pollIntervalMs）:
 *   1. 获取当前价格
 *   2. 对账：查询交易所挂单，检测已成交订单
 *   3. 买单成交（level N）→ 状态改为 buy_filled，在 level N+1 挂卖单
 *   4. 卖单成交（level N）→ 状态改为 empty，计算 PnL，可在 level N-1 挂买单
 *   5. 空位（below current price, state=empty）→ 挂买单
 *   6. 风控检查
 */

import { IStrategy } from './interfaces/i-strategy';
import { IOrderService } from '../services/interfaces/i-order.service';
import { IMarketDataService } from '../services/interfaces/i-market-data.service';
import { IAccountService } from '../services/interfaces/i-account.service';
import { TradingServices } from '../services/trading-service.factory';
import { ContractSpecService } from '../services/contract-spec.service';
import { FuturesAccountService, HoldMode } from '../services/futures-account.service';
import { GridLevelManager, GridLevel } from './grid-level-manager';
import { RiskController } from './risk-controller';
import { StrategyConfigManager } from './strategy-config.manager';
import { StrategyPersistenceService } from '../services/strategy-persistence.service';
import {
  GridStrategyConfig,
  DEFAULT_GRID_CONFIG,
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
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('grid-engine');

const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RECOVERY_DELAY_MS = 30000;

export class GridStrategyEngine implements IStrategy {
  readonly strategyType: StrategyType = 'grid';
  readonly instanceId: string;

  private status: StrategyStatus = 'STOPPED';
  private configManager: StrategyConfigManager | null = null;
  private gridManager: GridLevelManager | null = null;
  private riskController: RiskController | null = null;

  private orderService: IOrderService;
  private marketDataService: IMarketDataService;
  private accountService: IAccountService;

  private mainLoopTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors = 0;
  private startedAt: number | null = null;
  private tradeCount = 0;
  private realizedPnl = 0;

  private contractSpec: ContractSpecInfo | null = null;
  private unrealizedPnl = '0';
  private persistenceService: StrategyPersistenceService;
  private lastConfig: GridStrategyConfig = DEFAULT_GRID_CONFIG;

  /** Order tracking map: orderId -> TrackedOrder */
  private trackedOrders: Map<string, TrackedOrder> = new Map();

  private holdMode: HoldMode = 'double_hold';
  private events: StrategyEvent[] = [];
  private maxEvents = 1000;

  /** Last known price for state reporting */
  private lastPrice: string | null = null;

  constructor(services: TradingServices, instanceId = 'default') {
    this.orderService = services.orderService;
    this.marketDataService = services.marketDataService;
    this.accountService = services.accountService;
    this.persistenceService = StrategyPersistenceService.getInstance();
    this.instanceId = instanceId;
  }

  // ============================================================
  // IStrategy interface implementation
  // ============================================================

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
    logger.info('网格策略启动中...');

    try {
      // 初始化配置
      const configInput = {
        strategyType: 'grid' as const,
        tradingType: overrides?.tradingType || this.lastConfig.tradingType,
        instanceId: this.instanceId,
        ...overrides,
      };
      this.configManager = new StrategyConfigManager(configInput);
      const config = this.configManager.getGridConfig();

      // 验证网格价格范围
      const upperPrice = parseFloat(config.upperPrice);
      const lowerPrice = parseFloat(config.lowerPrice);
      if (upperPrice <= 0 || lowerPrice <= 0 || upperPrice <= lowerPrice) {
        throw new AppError(
          ErrorCode.GRID_CONFIG_INVALID,
          '网格价格范围无效：upperPrice 和 lowerPrice 必须大于 0 且 upperPrice > lowerPrice',
          { upperPrice: config.upperPrice, lowerPrice: config.lowerPrice },
          400
        );
      }

      // 获取合约规格并自动覆盖精度
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
        } catch (error) {
          logger.warn('获取合约规格失败，使用手动配置的精度', { error: String(error) });
        }
      }

      // 检测持仓模式（单向/双向）
      if (config.tradingType === 'futures' && config.productType) {
        try {
          const futuresAccountService = new FuturesAccountService();
          this.holdMode = await futuresAccountService.getHoldMode(config.productType);
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
      const finalConfig = this.configManager.getGridConfig();
      this.riskController = new RiskController(finalConfig, initialEquity);

      // 创建网格位管理器
      this.gridManager = new GridLevelManager({
        upperPrice: finalConfig.upperPrice,
        lowerPrice: finalConfig.lowerPrice,
        gridCount: finalConfig.gridCount,
        gridType: finalConfig.gridType,
        orderAmountUsdt: finalConfig.orderAmountUsdt,
        pricePrecision: finalConfig.pricePrecision,
        sizePrecision: finalConfig.sizePrecision,
      });

      // 重置状态
      this.trackedOrders.clear();
      this.consecutiveErrors = 0;
      this.startedAt = Date.now();
      this.tradeCount = 0;
      this.realizedPnl = 0;
      this.lastPrice = null;

      this.status = 'RUNNING';
      this.lastConfig = finalConfig;

      // 保存配置到 DB
      this.persistenceService.saveActiveConfig(this.lastConfig);
      this.emitEvent('STRATEGY_STARTED', { config: this.lastConfig });
      logger.info('网格策略已启动', {
        symbol: finalConfig.symbol,
        upperPrice: finalConfig.upperPrice,
        lowerPrice: finalConfig.lowerPrice,
        gridCount: finalConfig.gridCount,
        gridType: finalConfig.gridType,
        gridSpacing: this.gridManager.getGridSpacing(),
      });

      // 启动主循环
      this.scheduleMainLoop();
    } catch (error) {
      this.status = 'STOPPED';
      logger.error('网格策略启动失败', { error: String(error) });
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
    logger.info('网格策略停止中...');

    // 停止主循环
    if (this.mainLoopTimer) {
      clearTimeout(this.mainLoopTimer);
      this.mainLoopTimer = null;
    }

    // 撤销所有挂单
    await this.cancelAllPendingOrders();

    this.status = 'STOPPED';
    this.emitEvent('STRATEGY_STOPPED', {
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      tradeCount: this.tradeCount,
      realizedPnl: this.realizedPnl,
    });
    logger.info('网格策略已停止');
  }

  /**
   * 紧急停止：撤销所有挂单
   */
  async emergencyStop(): Promise<void> {
    logger.warn('网格策略紧急停止触发！');
    this.emitEvent('EMERGENCY_STOP', {});

    // 先停循环
    if (this.mainLoopTimer) {
      clearTimeout(this.mainLoopTimer);
      this.mainLoopTimer = null;
    }

    // 批量撤单
    await this.cancelAllPendingOrders();

    this.status = 'STOPPED';
    logger.warn('网格策略紧急停止完成');
  }

  /**
   * 更新配置
   */
  updateConfig(changes: Record<string, unknown>): BaseStrategyConfig {
    if (this.configManager) {
      const newConfig = this.configManager.update(changes as Partial<AnyStrategyConfig>);
      const gridConfig = newConfig as GridStrategyConfig;
      if (this.riskController) {
        this.riskController.updateConfig(gridConfig);
      }
      this.lastConfig = gridConfig;
      this.persistenceService.saveActiveConfig(gridConfig);
      this.emitEvent('CONFIG_UPDATED', { changes, state: 'running' });
      return gridConfig;
    }

    // 停止状态
    const tempManager = new StrategyConfigManager({ ...this.lastConfig, ...changes });
    const newConfig = tempManager.getGridConfig();
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
    const config = this.configManager?.getGridConfig() || this.lastConfig;
    const riskStats = this.riskController?.getStats();

    const pendingSellCount = this.gridManager
      ? this.gridManager.getLevels().filter(l => l.state === 'sell_pending').length
      : 0;

    const totalPositionUsdt = this.calculateTotalPositionUsdt();

    return {
      status: this.status,
      strategyType: 'grid',
      tradingType: config.tradingType,
      instanceId: this.instanceId,
      config,
      activeBuyOrderId: null, // Grid does not track a single active buy
      lastBidPrice: this.lastPrice,
      pendingSellCount,
      totalPositionUsdt,
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
    return Array.from(this.trackedOrders.values());
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
  // Main Loop
  // ============================================================

  private scheduleMainLoop(): void {
    if (this.status !== 'RUNNING') return;
    const config = this.configManager!.getGridConfig();
    this.mainLoopTimer = setTimeout(() => this.runMainLoop(), config.pollIntervalMs);
  }

  private async runMainLoop(): Promise<void> {
    if (this.status !== 'RUNNING') return;

    try {
      const config = this.configManager!.getGridConfig();

      // 1. 获取当前价格
      const ticker = await this.marketDataService.getTicker(config.symbol);
      const currentPrice = parseFloat(ticker.lastPr);
      this.lastPrice = ticker.lastPr;

      // 2. 风控检查
      const positionUsdt = parseFloat(this.calculateTotalPositionUsdt());
      const riskCheck = this.riskController!.checkCanTrade(positionUsdt);

      // 3. 对账：检测已成交订单
      await this.reconcileOrders(config, currentPrice);

      // 4. 挂新的买单（仅在风控允许时）
      if (riskCheck.canTrade) {
        await this.placeBuyOrders(config, currentPrice);
      } else {
        logger.debug('风控拒绝交易', { reason: riskCheck.reason });
      }

      // 5. 定期同步权益
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
      this.handleLoopError(error);
    }

    this.scheduleMainLoop();
  }

  // ============================================================
  // Order reconciliation
  // ============================================================

  /**
   * 对账：查询交易所挂单，检测已成交/已撤销的订单
   */
  private async reconcileOrders(config: GridStrategyConfig, currentPrice: number): Promise<void> {
    if (!this.gridManager) return;

    const pendingOrderIds = this.gridManager.getPendingOrderIds();
    if (pendingOrderIds.length === 0) return;

    // 查询交易所当前挂单
    const exchangePending = await this.orderService.getPendingOrders(config.symbol);
    const exchangePendingIds = new Set(exchangePending.map(o => o.orderId));

    // 找出不在交易所挂单列表中的订单（已成交或已撤销）
    const disappeared = pendingOrderIds.filter(id => !exchangePendingIds.has(id));

    for (const orderId of disappeared) {
      try {
        const detail = await this.orderService.getOrderDetail(config.symbol, orderId);
        const level = this.gridManager.findLevelByOrderId(orderId);

        if (!level) {
          logger.warn('找不到订单对应的网格位', { orderId });
          continue;
        }

        if (detail.state === 'filled') {
          if (level.state === 'buy_pending' && level.buyOrderId === orderId) {
            await this.handleBuyFilled(level, config, currentPrice);
          } else if (level.state === 'sell_pending' && level.sellOrderId === orderId) {
            this.handleSellFilled(level, config);
          }
        } else if (detail.state === 'live' || detail.state === 'partially_filled') {
          // 仍在交易所活跃，可能是查询延迟，跳过
          logger.debug('订单仍在交易所活跃', { orderId, state: detail.state });
        } else {
          // 被交易所撤销（cancelled 或其他终态）
          logger.info('订单被交易所撤销，重置网格位', {
            orderId,
            levelIndex: level.index,
            state: detail.state,
          });
          this.gridManager.updateLevelState(level.index, 'empty');
          this.updateTrackedOrderStatus(orderId, 'cancelled');
          this.persistenceService.persistOrderStatusChange(orderId, 'cancelled', null, null);
        }
      } catch (error) {
        logger.warn('查询订单详情失败，跳过', { orderId, error: String(error) });
      }
    }
  }

  // ============================================================
  // Buy order placement
  // ============================================================

  /**
   * 为空位网格位挂买单（价格低于当前价的空位）
   */
  private async placeBuyOrders(config: GridStrategyConfig, currentPrice: number): Promise<void> {
    if (!this.gridManager) return;

    const levelsNeedingBuy = this.gridManager.getLevelsNeedingBuy(currentPrice);

    for (const level of levelsNeedingBuy) {
      // 检查仓位上限
      const positionUsdt = parseFloat(this.calculateTotalPositionUsdt());
      const riskCheck = this.riskController!.checkCanTrade(positionUsdt);
      if (!riskCheck.canTrade) {
        logger.debug('风控拒绝继续挂买单', { reason: riskCheck.reason, levelIndex: level.index });
        break;
      }

      await this.placeBuyAtLevel(level, config);
    }
  }

  /**
   * 在指定网格位挂买单
   */
  private async placeBuyAtLevel(level: GridLevel, config: GridStrategyConfig): Promise<void> {
    if (!this.gridManager) return;

    const size = this.validateSize(level.size, level.price);
    if (!size) {
      logger.warn('网格位下单数量不足', { levelIndex: level.index, price: level.price, size: level.size });
      return;
    }

    const clientOid = `grid_${config.symbol}_buy_${level.index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const result = await this.orderService.placeOrder({
        symbol: config.symbol,
        size,
        side: 'buy',
        orderType: 'limit',
        price: level.price,
        force: 'gtc',
        tradeSide: config.tradingType === 'futures'
          ? (this.holdMode === 'single_hold' ? undefined : 'open')
          : undefined,
        clientOid,
      });

      // 更新网格位状态
      this.gridManager.updateLevelState(level.index, 'buy_pending', result.orderId);

      // 追踪订单
      const trackedOrder: TrackedOrder = {
        orderId: result.orderId,
        clientOid,
        side: 'buy',
        price: level.price,
        size,
        status: 'pending',
        linkedOrderId: null,
        direction: config.direction || 'long',
        createdAt: Date.now(),
        filledAt: null,
      };
      this.trackedOrders.set(result.orderId, trackedOrder);
      this.persistenceService.persistNewOrder(
        trackedOrder,
        config.symbol,
        config.productType || '',
        config.marginCoin || 'USDT'
      );

      this.emitEvent('BUY_ORDER_PLACED', {
        orderId: result.orderId,
        levelIndex: level.index,
        price: level.price,
        size,
      });

      logger.info('网格买单已挂', {
        orderId: result.orderId,
        levelIndex: level.index,
        price: level.price,
        size,
      });
    } catch (error) {
      logger.warn('网格挂买单失败', {
        levelIndex: level.index,
        price: level.price,
        error: String(error),
      });
    }
  }

  // ============================================================
  // Buy filled handler
  // ============================================================

  /**
   * 买单成交处理：更新状态，在上一级挂卖单
   */
  private async handleBuyFilled(
    level: GridLevel,
    config: GridStrategyConfig,
    currentPrice: number
  ): Promise<void> {
    if (!this.gridManager) return;

    const buyOrderId = level.buyOrderId;
    logger.info('网格买单成交', {
      levelIndex: level.index,
      buyOrderId,
      price: level.price,
    });

    // 更新买单追踪状态
    this.updateTrackedOrderStatus(buyOrderId || '', 'filled');
    this.persistenceService.persistOrderStatusChange(
      buyOrderId || '',
      'filled',
      Date.now(),
      null
    );

    // 更新网格位为 buy_filled
    this.gridManager.updateLevelState(level.index, 'buy_filled');

    this.emitEvent('GRID_BUY_FILLED', {
      levelIndex: level.index,
      buyOrderId,
      price: level.price,
      size: level.size,
    });

    // 在上一级挂卖单（level N+1 的价格）
    const sellLevelIndex = level.index + 1;
    const sellLevel = this.gridManager.getLevel(sellLevelIndex);

    if (!sellLevel) {
      // 已经在最高网格位，使用网格间距计算卖出价
      const gridSpacing = parseFloat(this.gridManager.getGridSpacing());
      const sellPrice = (parseFloat(level.price) + gridSpacing).toFixed(
        this.configManager!.getGridConfig().pricePrecision
      );
      await this.placeSellForLevel(level, sellPrice, config);
    } else {
      await this.placeSellForLevel(level, sellLevel.price, config);
    }
  }

  /**
   * 为已成交买单挂卖单
   */
  private async placeSellForLevel(
    buyLevel: GridLevel,
    sellPrice: string,
    config: GridStrategyConfig
  ): Promise<void> {
    if (!this.gridManager) return;

    const size = this.validateSize(buyLevel.size, sellPrice);
    if (!size) {
      logger.warn('卖单数量不足', {
        levelIndex: buyLevel.index,
        sellPrice,
        size: buyLevel.size,
      });
      return;
    }

    // 等待仓位在交易所结算
    await this.sleep(800);

    const clientOid = `grid_${config.symbol}_sell_${buyLevel.index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 合约模式：按持仓模式决定 tradeSide，最后一次反转策略
      const sellTradeSide = config.tradingType === 'futures'
        ? (attempt < maxRetries
            ? (this.holdMode === 'single_hold' ? undefined : 'close')
            : (this.holdMode === 'single_hold' ? 'close' : undefined))
        : undefined;

      try {
        const result = await this.orderService.placeOrder({
          symbol: config.symbol,
          size,
          side: 'sell',
          orderType: 'limit',
          price: sellPrice,
          force: 'gtc',
          tradeSide: sellTradeSide as 'open' | 'close' | undefined,
          clientOid,
        });

        // 更新网格位状态为 sell_pending
        this.gridManager.updateLevelState(buyLevel.index, 'sell_pending', result.orderId);

        // 追踪卖单
        const sellTracked: TrackedOrder = {
          orderId: result.orderId,
          clientOid,
          side: 'sell',
          price: sellPrice,
          size,
          status: 'pending',
          linkedOrderId: buyLevel.buyOrderId,
          direction: config.direction || 'long',
          createdAt: Date.now(),
          filledAt: null,
        };
        this.trackedOrders.set(result.orderId, sellTracked);
        this.persistenceService.persistNewOrder(
          sellTracked,
          config.symbol,
          config.productType || '',
          config.marginCoin || 'USDT'
        );

        this.emitEvent('SELL_ORDER_PLACED', {
          orderId: result.orderId,
          levelIndex: buyLevel.index,
          buyOrderId: buyLevel.buyOrderId,
          buyPrice: buyLevel.price,
          sellPrice,
          size,
          attempt,
        });

        logger.info('网格卖单已挂', {
          orderId: result.orderId,
          levelIndex: buyLevel.index,
          buyPrice: buyLevel.price,
          sellPrice,
          attempt,
        });
        return;
      } catch (error) {
        const errMsg = String(error);
        const isPositionError = errMsg.includes('22002') || errMsg.includes('仓位');

        if (isPositionError && attempt < maxRetries) {
          logger.warn('挂卖单失败（仓位未结算），等待重试', {
            levelIndex: buyLevel.index,
            attempt,
            error: errMsg,
          });
          await this.sleep(1000 * attempt);
          continue;
        }

        logger.error('挂卖单最终失败', {
          error: errMsg,
          levelIndex: buyLevel.index,
          attempt,
        });
        // 回退到 buy_filled 状态，下一轮再尝试
        this.gridManager.updateLevelState(buyLevel.index, 'buy_filled');
        this.emitEvent('SELL_ORDER_FAILED', {
          levelIndex: buyLevel.index,
          buyOrderId: buyLevel.buyOrderId,
          buyPrice: buyLevel.price,
          sellPrice,
          error: errMsg,
          attempts: attempt,
        });
        return;
      }
    }
  }

  // ============================================================
  // Sell filled handler
  // ============================================================

  /**
   * 卖单成交处理：计算 PnL，重置网格位
   */
  private handleSellFilled(level: GridLevel, config: GridStrategyConfig): void {
    if (!this.gridManager) return;

    const sellOrderId = level.sellOrderId;
    const sellOrder = sellOrderId ? this.trackedOrders.get(sellOrderId) : undefined;
    const buyOrderId = sellOrder?.linkedOrderId;
    const buyOrder = buyOrderId ? this.trackedOrders.get(buyOrderId) : undefined;

    this.tradeCount++;

    // 更新卖单追踪状态
    this.updateTrackedOrderStatus(sellOrderId || '', 'filled');
    this.persistenceService.persistOrderStatusChange(
      sellOrderId || '',
      'filled',
      Date.now(),
      buyOrderId || null
    );

    // 计算 PnL
    if (buyOrder && sellOrder) {
      const buyPrice = parseFloat(buyOrder.price);
      const sellPrice = parseFloat(sellOrder.price);
      const size = parseFloat(sellOrder.size);
      const grossPnl = (sellPrice - buyPrice) * size;

      const fee = StrategyConfigManager.estimateFeeUsdt(
        (sellPrice * size).toFixed(2)
      ) * 2;
      const netPnl = grossPnl - fee;

      this.realizedPnl += netPnl;
      this.riskController?.recordPnl(netPnl);
      this.persistenceService.persistRealizedPnl(netPnl, fee, netPnl > 0, 'grid');

      this.emitEvent('GRID_SELL_FILLED', {
        levelIndex: level.index,
        sellOrderId,
        buyOrderId,
        buyPrice: buyOrder.price,
        sellPrice: sellOrder.price,
        size: sellOrder.size,
        grossPnl: grossPnl.toFixed(4),
        fee: fee.toFixed(4),
        netPnl: netPnl.toFixed(4),
      });

      logger.info('网格卖单成交', {
        levelIndex: level.index,
        sellOrderId,
        netPnl: netPnl.toFixed(4),
        totalPnl: this.realizedPnl.toFixed(4),
      });
    } else {
      this.emitEvent('GRID_SELL_FILLED', {
        levelIndex: level.index,
        sellOrderId,
        sellPrice: sellOrder?.price,
        size: sellOrder?.size,
        note: '无法找到对应买单，PnL 未计算',
      });

      logger.warn('卖单成交但找不到对应买单', {
        levelIndex: level.index,
        sellOrderId,
        buyOrderId,
      });
    }

    // 重置网格位为 empty（下一轮循环会重新挂买单）
    this.gridManager.updateLevelState(level.index, 'empty');

    this.emitEvent('GRID_LEVEL_UPDATED', {
      levelIndex: level.index,
      newState: 'empty',
      price: level.price,
    });
  }

  // ============================================================
  // Helper methods
  // ============================================================

  /**
   * 撤销所有挂单
   */
  private async cancelAllPendingOrders(): Promise<void> {
    if (!this.gridManager || !this.configManager) return;

    const config = this.configManager.getGridConfig();
    const pendingOrderIds = this.gridManager.getPendingOrderIds();

    if (pendingOrderIds.length === 0) return;

    // 分批撤单（每批最多 50 个）
    for (let i = 0; i < pendingOrderIds.length; i += 50) {
      const batch = pendingOrderIds.slice(i, i + 50);
      try {
        await this.orderService.batchCancelOrders({
          symbol: config.symbol,
          orderIdList: batch.map(id => ({ orderId: id })),
        });

        // 更新网格位和追踪状态
        for (const orderId of batch) {
          const level = this.gridManager.findLevelByOrderId(orderId);
          if (level) {
            this.gridManager.updateLevelState(level.index, 'empty');
          }
          this.updateTrackedOrderStatus(orderId, 'cancelled');
          this.persistenceService.persistOrderStatusChange(orderId, 'cancelled', null, null);
        }

        logger.info('批量撤单成功', { count: batch.length });
      } catch (error) {
        logger.error('批量撤单失败', { error: String(error), count: batch.length });
      }
    }
  }

  /**
   * 验证下单数量是否满足最小要求
   */
  private validateSize(size: string, price: string): string {
    const sizeNum = parseFloat(size);
    if (sizeNum <= 0) return '';

    if (this.contractSpec && sizeNum < this.contractSpec.minTradeNum) {
      logger.warn('下单数量不足交易所最小下单量', {
        size,
        price,
        minTradeNum: this.contractSpec.minTradeNum,
      });
      return '';
    }

    return size;
  }

  /**
   * 计算当前总仓位（USDT）
   */
  private calculateTotalPositionUsdt(): string {
    if (!this.gridManager) return '0';

    let total = 0;
    const levels = this.gridManager.getLevels();
    for (const level of levels) {
      if (level.state === 'buy_filled' || level.state === 'sell_pending') {
        total += parseFloat(level.size) * parseFloat(level.price);
      }
    }
    return total.toFixed(2);
  }

  /**
   * 更新追踪订单状态
   */
  private updateTrackedOrderStatus(orderId: string, status: 'filled' | 'cancelled'): void {
    const order = this.trackedOrders.get(orderId);
    if (order) {
      order.status = status;
      if (status === 'filled') {
        order.filledAt = Date.now();
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private handleLoopError(error: unknown): void {
    this.consecutiveErrors++;
    logger.error(`主循环错误 (${this.consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`, {
      error: String(error),
    });

    if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      this.status = 'ERROR';
      this.emitEvent('STRATEGY_ERROR', {
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
          this.scheduleMainLoop();
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
