/**
 * 策略配置管理器
 * 负责默认配置、参数验证、运行时热更新
 * 支持 BaseStrategyConfig 和各策略专属配置
 */

import {
  BaseStrategyConfig,
  ScalpingStrategyConfig,
  GridStrategyConfig,
  AnyStrategyConfig,
  DEFAULT_SCALPING_CONFIG,
  DEFAULT_GRID_CONFIG,
} from '../types/strategy.types';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('config-manager');

/** Maker 手续费率（Bitget 默认 0.02%） */
const MAKER_FEE_RATE = 0.0002;

export class StrategyConfigManager {
  private config: AnyStrategyConfig;

  constructor(overrides?: Partial<AnyStrategyConfig>) {
    const strategyType = overrides?.strategyType || 'scalping';
    const defaults = strategyType === 'grid' ? DEFAULT_GRID_CONFIG : DEFAULT_SCALPING_CONFIG;
    this.config = { ...defaults, ...overrides } as AnyStrategyConfig;
    this.validate();
  }

  getConfig(): AnyStrategyConfig {
    return { ...this.config };
  }

  getScalpingConfig(): ScalpingStrategyConfig {
    if (this.config.strategyType !== 'scalping') {
      throw new AppError(
        ErrorCode.STRATEGY_CONFIG_INVALID,
        '当前策略不是剥头皮类型',
        { actual: this.config.strategyType },
        400
      );
    }
    return { ...this.config } as ScalpingStrategyConfig;
  }

  getGridConfig(): GridStrategyConfig {
    if (this.config.strategyType !== 'grid') {
      throw new AppError(
        ErrorCode.STRATEGY_CONFIG_INVALID,
        '当前策略不是网格类型',
        { actual: this.config.strategyType },
        400
      );
    }
    return { ...this.config } as GridStrategyConfig;
  }

  /**
   * 运行时热更新配置（部分字段）
   */
  update(changes: Partial<AnyStrategyConfig>): AnyStrategyConfig {
    // 禁止运行时更改的字段
    const immutableKeys: Array<keyof BaseStrategyConfig> = [
      'symbol', 'productType', 'marginMode', 'marginCoin', 'strategyType', 'tradingType', 'instanceId',
    ];
    for (const key of immutableKeys) {
      if (key in changes) {
        throw new AppError(
          ErrorCode.STRATEGY_CONFIG_INVALID,
          `运行时不可更改 ${key}，请先停止策略`,
          { key },
          400
        );
      }
    }

    const previous = { ...this.config };
    this.config = { ...this.config, ...changes } as AnyStrategyConfig;

    try {
      this.validate();
    } catch (error) {
      this.config = previous;
      throw error;
    }

    logger.info('策略配置已更新', { changes });
    return this.getConfig();
  }

  /**
   * 参数验证
   */
  private validate(): void {
    const c = this.config;
    const errors: string[] = [];

    // 基础验证
    if (!c.symbol || c.symbol.length === 0) {
      errors.push('symbol 不能为空');
    }

    const orderAmount = parseFloat(c.orderAmountUsdt);
    if (isNaN(orderAmount) || orderAmount <= 0) {
      errors.push('orderAmountUsdt 必须大于 0');
    }

    const maxPosition = parseFloat(c.maxPositionUsdt);
    if (isNaN(maxPosition) || maxPosition <= 0) {
      errors.push('maxPositionUsdt 必须大于 0');
    }

    if (c.tradingType === 'futures') {
      const leverage = parseFloat(c.leverage || '1');
      if (isNaN(leverage) || leverage < 1 || leverage > 125) {
        errors.push('leverage 必须在 1-125 之间');
      }
    }

    if (c.pollIntervalMs < 200) {
      errors.push('pollIntervalMs 不能低于 200ms');
    }

    if (c.orderCheckIntervalMs < 500) {
      errors.push('orderCheckIntervalMs 不能低于 500ms');
    }

    if (c.maxDrawdownPercent <= 0 || c.maxDrawdownPercent > 100) {
      errors.push('maxDrawdownPercent 必须在 (0, 100] 之间');
    }

    if (c.cooldownMs < 0) {
      errors.push('cooldownMs 不能为负');
    }

    if (c.sizePrecision < 0 || c.sizePrecision > 8) {
      errors.push('sizePrecision 必须在 0-8 之间');
    }

    if (c.pricePrecision < 0 || c.pricePrecision > 8) {
      errors.push('pricePrecision 必须在 0-8 之间');
    }

    // 剥头皮专属验证
    if (c.strategyType === 'scalping') {
      const sc = c as ScalpingStrategyConfig;
      const priceSpread = parseFloat(sc.priceSpread);
      if (isNaN(priceSpread) || priceSpread <= 0) {
        errors.push('priceSpread 必须大于 0');
      }
      if (sc.maxPendingOrders < 1 || sc.maxPendingOrders > 500) {
        errors.push('maxPendingOrders 必须在 1-500 之间');
      }
      if (sc.mergeThreshold < 2 || sc.mergeThreshold > sc.maxPendingOrders) {
        errors.push('mergeThreshold 必须在 2 到 maxPendingOrders 之间');
      }
    }

    // 网格专属验证
    if (c.strategyType === 'grid') {
      const gc = c as GridStrategyConfig;
      if (gc.gridCount < 2 || gc.gridCount > 200) {
        errors.push('gridCount 必须在 2-200 之间');
      }
      // upperPrice/lowerPrice 可以在启动时自动计算，此处只做基础校验
      const upper = parseFloat(gc.upperPrice);
      const lower = parseFloat(gc.lowerPrice);
      if (upper !== 0 && lower !== 0) {
        if (upper <= lower) {
          errors.push('upperPrice 必须大于 lowerPrice');
        }
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        ErrorCode.STRATEGY_CONFIG_INVALID,
        `策略配置无效: ${errors.join('; ')}`,
        { errors },
        400
      );
    }
  }

  /**
   * 根据价格估算单笔手续费
   */
  static estimateFeeUsdt(orderAmountUsdt: string): number {
    return parseFloat(orderAmountUsdt) * MAKER_FEE_RATE;
  }
}
