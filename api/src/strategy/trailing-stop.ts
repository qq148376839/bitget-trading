/**
 * 追踪止损
 * 跟踪最高收益水位，收益达到激活阈值后启动
 * 回撤超过设定百分比触发止损
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('trailing-stop');

export interface TrailingStopConfig {
  /** 激活阈值（收益百分比，达到后启动追踪） */
  activationPercent: number;
  /** 回撤百分比（从最高收益回撤多少触发止损） */
  trailingPercent: number;
}

export class TrailingStop {
  private config: TrailingStopConfig;
  private initialEquity: number;
  private peakProfit = 0;
  private isActivated = false;

  constructor(config: TrailingStopConfig, initialEquity: number) {
    this.config = config;
    this.initialEquity = initialEquity;
  }

  /**
   * 更新配置
   */
  updateConfig(config: TrailingStopConfig): void {
    this.config = config;
  }

  /**
   * 检查是否应触发止损
   * @param currentEquity 当前权益
   * @returns true 表示应止损
   */
  check(currentEquity: number): { shouldStop: boolean; reason: string | null } {
    const profitPercent = this.initialEquity > 0
      ? ((currentEquity - this.initialEquity) / this.initialEquity) * 100
      : 0;

    // Update peak profit
    if (profitPercent > this.peakProfit) {
      this.peakProfit = profitPercent;
    }

    // Check activation
    if (!this.isActivated) {
      if (profitPercent >= this.config.activationPercent) {
        this.isActivated = true;
        logger.info('追踪止损已激活', {
          profitPercent: profitPercent.toFixed(2),
          activationPercent: this.config.activationPercent,
          peakProfit: this.peakProfit.toFixed(2),
        });
      }
      return { shouldStop: false, reason: null };
    }

    // Check trailing drawdown
    const drawdownFromPeak = this.peakProfit - profitPercent;
    if (drawdownFromPeak >= this.config.trailingPercent) {
      const reason = `追踪止损触发: 收益从最高 ${this.peakProfit.toFixed(2)}% 回撤 ${drawdownFromPeak.toFixed(2)}% (阈值 ${this.config.trailingPercent}%)`;
      logger.warn(reason);
      return { shouldStop: true, reason };
    }

    return { shouldStop: false, reason: null };
  }

  /**
   * 重置
   */
  reset(newEquity: number): void {
    this.initialEquity = newEquity;
    this.peakProfit = 0;
    this.isActivated = false;
  }

  /**
   * 获取状态
   */
  getStatus(): {
    isActivated: boolean;
    peakProfit: number;
    activationPercent: number;
    trailingPercent: number;
  } {
    return {
      isActivated: this.isActivated,
      peakProfit: this.peakProfit,
      activationPercent: this.config.activationPercent,
      trailingPercent: this.config.trailingPercent,
    };
  }
}
