/**
 * 风控控制器
 * 管理回撤、止损、日亏限制、冷却机制
 */

import { BaseStrategyConfig } from '../types/strategy.types';
import { TrailingStop } from './trailing-stop';
import { createLogger } from '../utils/logger';
import { PolymarketSignalService } from '../services/polymarket-signal.service';
import type { RiskAdjustment } from '../types/polymarket.types';

const logger = createLogger('risk-controller');

export interface RiskCheckResult {
  canTrade: boolean;
  reason: string | null;
}

export class RiskController {
  private config: BaseStrategyConfig;

  // PnL 追踪
  private dailyPnl = 0;
  private peakEquity = 0;
  private currentEquity = 0;
  private dailyResetDate: string;

  // 冷却
  private coolingUntil: number | null = null;

  // 追踪止损
  private trailingStop: TrailingStop | null = null;

  // 统计
  private totalTrades = 0;
  private winTrades = 0;
  private lossTrades = 0;
  private totalWin = 0;
  private totalLoss = 0;

  constructor(config: BaseStrategyConfig, initialEquity: number) {
    this.config = config;
    this.peakEquity = initialEquity;
    this.currentEquity = initialEquity;
    this.dailyResetDate = this.getTodayKey();

    // Initialize trailing stop if configured
    if (config.trailingStopEnabled) {
      this.trailingStop = new TrailingStop(
        {
          activationPercent: config.trailingStopActivationPercent || 1,
          trailingPercent: config.trailingStopPercent || 0.5,
        },
        initialEquity
      );
    }
  }

  /**
   * 更新配置（热更新时调用）
   */
  updateConfig(config: BaseStrategyConfig): void {
    this.config = config;
  }

  /**
   * 综合检查是否允许交易
   */
  checkCanTrade(currentPositionUsdt: number): RiskCheckResult {
    // 检查日期变更，重置每日 PnL
    const today = this.getTodayKey();
    if (today !== this.dailyResetDate) {
      logger.info('新的交易日，重置每日 PnL', { previous: this.dailyPnl });
      this.dailyPnl = 0;
      this.dailyResetDate = today;
    }

    // 获取宏观风控调整
    const macroAdj = this.getMacroRiskAdjustment();

    // 检查冷却期（宏观调整冷却时间）
    if (this.coolingUntil !== null) {
      const adjustedCoolingEnd = this.coolingUntil;
      if (Date.now() < adjustedCoolingEnd) {
        const remaining = Math.ceil((adjustedCoolingEnd - Date.now()) / 1000);
        return { canTrade: false, reason: `风控冷却中，剩余 ${remaining} 秒` };
      }
      this.coolingUntil = null;
      logger.info('冷却期结束，恢复交易');
    }

    // 检查每日亏损限制（宏观调整限额）
    const baseDailyLoss = parseFloat(this.config.maxDailyLossUsdt);
    const maxDailyLoss = baseDailyLoss / macroAdj.dailyLossMultiplier;
    if (this.dailyPnl < 0 && Math.abs(this.dailyPnl) >= maxDailyLoss) {
      this.triggerCooldown('每日亏损达到限制', macroAdj.cooldownMultiplier);
      return { canTrade: false, reason: `每日亏损已达 ${Math.abs(this.dailyPnl).toFixed(2)} USDT，限制 ${maxDailyLoss.toFixed(2)} USDT` };
    }

    // 检查最大回撤
    if (this.peakEquity > 0) {
      const drawdown = ((this.peakEquity - this.currentEquity) / this.peakEquity) * 100;
      if (drawdown >= this.config.maxDrawdownPercent) {
        this.triggerCooldown('回撤达到限制', macroAdj.cooldownMultiplier);
        return { canTrade: false, reason: `回撤 ${drawdown.toFixed(2)}%，限制 ${this.config.maxDrawdownPercent}%` };
      }
    }

    // 检查追踪止损
    if (this.trailingStop) {
      const tsResult = this.trailingStop.check(this.currentEquity);
      if (tsResult.shouldStop) {
        this.triggerCooldown('追踪止损触发', macroAdj.cooldownMultiplier);
        return { canTrade: false, reason: tsResult.reason };
      }
    }

    // 检查仓位上限（宏观调整上限）
    const baseMaxPosition = parseFloat(this.config.maxPositionUsdt);
    const maxPosition = baseMaxPosition * macroAdj.positionMultiplier;
    if (currentPositionUsdt >= maxPosition) {
      return { canTrade: false, reason: `仓位 ${currentPositionUsdt.toFixed(2)} USDT 已达上限 ${maxPosition.toFixed(2)} USDT` };
    }

    return { canTrade: true, reason: null };
  }

  /**
   * 获取宏观风控调整乘数
   * 服务未初始化时安全降级返回中性值
   */
  private getMacroRiskAdjustment(): RiskAdjustment {
    try {
      return PolymarketSignalService.getInstance().getRiskAdjustment();
    } catch {
      return {
        dailyLossMultiplier: 1.0,
        drawdownMultiplier: 1.0,
        positionMultiplier: 1.0,
        cooldownMultiplier: 1.0,
      };
    }
  }

  /**
   * 记录盈亏
   */
  recordPnl(pnl: number): void {
    this.dailyPnl += pnl;
    this.currentEquity += pnl;
    this.totalTrades++;

    if (pnl > 0) {
      this.winTrades++;
      this.totalWin += pnl;
    } else if (pnl < 0) {
      this.lossTrades++;
      this.totalLoss += Math.abs(pnl);
    }

    if (this.currentEquity > this.peakEquity) {
      this.peakEquity = this.currentEquity;
    }

    logger.debug('PnL 记录', {
      pnl: pnl.toFixed(4),
      dailyPnl: this.dailyPnl.toFixed(4),
      equity: this.currentEquity.toFixed(2),
    });
  }

  /**
   * 更新当前权益（从交易所同步）
   */
  updateEquity(equity: number): void {
    this.currentEquity = equity;
    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }
  }

  /**
   * 获取 PnL 统计
   */
  getStats(): {
    dailyPnl: number;
    peakEquity: number;
    currentEquity: number;
    totalTrades: number;
    winTrades: number;
    lossTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
  } {
    return {
      dailyPnl: this.dailyPnl,
      peakEquity: this.peakEquity,
      currentEquity: this.currentEquity,
      totalTrades: this.totalTrades,
      winTrades: this.winTrades,
      lossTrades: this.lossTrades,
      winRate: this.totalTrades > 0 ? this.winTrades / this.totalTrades : 0,
      avgWin: this.winTrades > 0 ? this.totalWin / this.winTrades : 0,
      avgLoss: this.lossTrades > 0 ? this.totalLoss / this.lossTrades : 0,
    };
  }

  /**
   * 触发冷却
   */
  private triggerCooldown(reason: string, cooldownMultiplier = 1.0): void {
    const adjustedCooldown = Math.round(this.config.cooldownMs * cooldownMultiplier);
    this.coolingUntil = Date.now() + adjustedCooldown;
    logger.warn('触发风控冷却', {
      reason,
      cooldownMs: adjustedCooldown,
      cooldownMultiplier,
      resumeAt: new Date(this.coolingUntil).toISOString(),
    });
  }

  /**
   * 是否在冷却中
   */
  isCooling(): boolean {
    return this.coolingUntil !== null && Date.now() < this.coolingUntil;
  }

  /**
   * 重置所有状态
   */
  reset(equity: number): void {
    this.dailyPnl = 0;
    this.peakEquity = equity;
    this.currentEquity = equity;
    this.coolingUntil = null;
    this.totalTrades = 0;
    this.winTrades = 0;
    this.lossTrades = 0;
    this.totalWin = 0;
    this.totalLoss = 0;
    this.dailyResetDate = this.getTodayKey();
  }

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }
}
