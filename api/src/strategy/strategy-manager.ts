/**
 * 策略管理器（Singleton）
 * 维护策略实例注册表，管理生命周期
 * 初期限制：仅一个活跃实例
 */

import { IStrategy } from './interfaces/i-strategy';
import { ScalpingStrategyEngine } from './scalping-strategy.engine';
import { GridStrategyEngine } from './grid-strategy.engine';
import { StrategyType, TradingType } from '../types/trading.types';
import { BaseStrategyConfig, AnyStrategyConfig, StrategyState } from '../types/strategy.types';
import { createTradingServices, TradingServices } from '../services/trading-service.factory';
import { ProductType, MarginMode } from '../types/futures.types';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('strategy-manager');

export class StrategyManager {
  private static instance: StrategyManager | null = null;
  private activeStrategy: IStrategy | null = null;

  private constructor() {}

  static getInstance(): StrategyManager {
    if (!StrategyManager.instance) {
      StrategyManager.instance = new StrategyManager();
    }
    return StrategyManager.instance;
  }

  /**
   * 创建并启动策略
   */
  async createAndStart(config?: Partial<AnyStrategyConfig>): Promise<IStrategy> {
    if (this.activeStrategy) {
      const status = this.activeStrategy.getStatus();
      if (status === 'RUNNING' || status === 'STARTING') {
        throw new AppError(
          ErrorCode.STRATEGY_ALREADY_RUNNING,
          '已有策略在运行中，请先停止',
          { currentType: this.activeStrategy.strategyType, status },
          400
        );
      }
    }

    const strategyType: StrategyType = config?.strategyType || 'scalping';
    const tradingType: TradingType = config?.tradingType || 'futures';
    const instanceId = config?.instanceId || `${strategyType}_${tradingType}_${Date.now()}`;

    logger.info('创建策略', { strategyType, tradingType, instanceId });

    // 创建交易服务组合
    const services = createTradingServices({
      tradingType,
      productType: config?.productType as ProductType,
      marginMode: config?.marginMode as MarginMode,
      marginCoin: config?.marginCoin,
    });

    // 创建策略实例
    const strategy = this.createStrategyInstance(strategyType, services, instanceId);

    // 加载上次配置（仅剥头皮）
    if (strategy instanceof ScalpingStrategyEngine) {
      await strategy.loadLastConfig();
    }

    // 启动
    await strategy.start({
      ...config,
      strategyType,
      tradingType,
      instanceId,
    } as BaseStrategyConfig);

    this.activeStrategy = strategy;
    return strategy;
  }

  /**
   * 获取当前活跃策略
   */
  getActiveStrategy(): IStrategy | null {
    return this.activeStrategy;
  }

  /**
   * 停止当前策略
   */
  async stopActive(): Promise<void> {
    if (!this.activeStrategy) {
      return;
    }
    await this.activeStrategy.stop();
  }

  /**
   * 紧急停止当前策略
   */
  async emergencyStopActive(): Promise<void> {
    if (!this.activeStrategy) {
      return;
    }
    await this.activeStrategy.emergencyStop();
  }

  /**
   * 获取当前策略状态（如果没有活跃策略，返回默认状态）
   */
  getState(): StrategyState {
    if (this.activeStrategy) {
      return this.activeStrategy.getState();
    }

    return {
      status: 'STOPPED',
      strategyType: 'scalping',
      tradingType: 'futures',
      instanceId: 'none',
      config: null,
      activeBuyOrderId: null,
      lastBidPrice: null,
      pendingSellCount: 0,
      totalPositionUsdt: '0',
      spotAvailableUsdt: '0',
      futuresAvailableUsdt: '0',
      realizedPnl: '0',
      unrealizedPnl: '0',
      dailyPnl: '0',
      tradeCount: 0,
      errorCount: 0,
      lastError: null,
      startedAt: null,
      uptimeMs: 0,
    };
  }

  private createStrategyInstance(
    type: StrategyType,
    services: TradingServices,
    instanceId: string
  ): IStrategy {
    switch (type) {
      case 'scalping':
        return new ScalpingStrategyEngine(services, instanceId);
      case 'grid':
        return new GridStrategyEngine(services, instanceId);
      default:
        throw new AppError(
          ErrorCode.STRATEGY_NOT_FOUND,
          `未知策略类型: ${type}`,
          { type },
          400
        );
    }
  }
}
