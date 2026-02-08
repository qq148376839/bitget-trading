/**
 * 策略配置管理器
 * 负责默认配置、参数验证、运行时热更新
 */

import { ScalpingStrategyConfig, DEFAULT_SCALPING_CONFIG } from '../types/strategy.types';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('config-manager');

/** Maker 手续费率（Bitget 默认 0.02%） */
const MAKER_FEE_RATE = 0.0002;

export class StrategyConfigManager {
  private config: ScalpingStrategyConfig;

  constructor(overrides?: Partial<ScalpingStrategyConfig>) {
    this.config = { ...DEFAULT_SCALPING_CONFIG, ...overrides };
    this.validate();
  }

  getConfig(): ScalpingStrategyConfig {
    return { ...this.config };
  }

  /**
   * 运行时热更新配置（部分字段）
   */
  update(changes: Partial<ScalpingStrategyConfig>): ScalpingStrategyConfig {
    // 禁止运行时更改的字段
    const immutableKeys: Array<keyof ScalpingStrategyConfig> = [
      'symbol', 'productType', 'marginMode', 'marginCoin',
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
    this.config = { ...this.config, ...changes };

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

    if (!c.symbol || c.symbol.length === 0) {
      errors.push('symbol 不能为空');
    }

    const orderAmount = parseFloat(c.orderAmountUsdt);
    if (isNaN(orderAmount) || orderAmount <= 0) {
      errors.push('orderAmountUsdt 必须大于 0');
    }

    const priceSpread = parseFloat(c.priceSpread);
    if (isNaN(priceSpread) || priceSpread <= 0) {
      errors.push('priceSpread 必须大于 0');
    }

    const maxPosition = parseFloat(c.maxPositionUsdt);
    if (isNaN(maxPosition) || maxPosition <= 0) {
      errors.push('maxPositionUsdt 必须大于 0');
    }

    const leverage = parseFloat(c.leverage);
    if (isNaN(leverage) || leverage < 1 || leverage > 125) {
      errors.push('leverage 必须在 1-125 之间');
    }

    if (c.maxPendingOrders < 1 || c.maxPendingOrders > 500) {
      errors.push('maxPendingOrders 必须在 1-500 之间');
    }

    if (c.mergeThreshold < 2 || c.mergeThreshold > c.maxPendingOrders) {
      errors.push('mergeThreshold 必须在 2 到 maxPendingOrders 之间');
    }

    if (c.pollIntervalMs < 200) {
      errors.push('pollIntervalMs 不能低于 200ms');
    }

    if (c.orderCheckIntervalMs < 500) {
      errors.push('orderCheckIntervalMs 不能低于 500ms');
    }

    // 检查 priceSpread 是否能覆盖双边手续费
    // 手续费 = 2 × orderAmount × makerFeeRate
    // spread 收入 = orderAmount × (priceSpread / price)
    // 由于无法此刻获取价格，仅做基础检查：spread > 0
    if (priceSpread <= 0) {
      errors.push('priceSpread 必须能覆盖双边手续费');
    }

    if (c.maxDrawdownPercent <= 0 || c.maxDrawdownPercent > 100) {
      errors.push('maxDrawdownPercent 必须在 (0, 100] 之间');
    }

    if (c.cooldownMs < 0) {
      errors.push('cooldownMs 不能为负');
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
