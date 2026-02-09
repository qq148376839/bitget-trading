/**
 * 自动计算服务
 * 根据简单输入（4+2 参数）自动推算完整策略配置
 */

import { InstrumentSpecService } from '../services/instrument-spec.service';
import { createTradingServices } from '../services/trading-service.factory';
import {
  RiskLevel,
  SCALPING_PRESETS,
  GRID_PRESETS,
} from './presets/risk-presets';
import {
  BaseStrategyConfig,
  ScalpingStrategyConfig,
  GridStrategyConfig,
} from '../types/strategy.types';
import {
  StrategyType,
  TradingType,
  InstrumentSpec,
  UnifiedTickerInfo,
} from '../types/trading.types';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('auto-calc');

/** 简单模式输入参数 */
export interface SimpleConfigInput {
  strategyType: StrategyType;
  tradingType: TradingType;
  symbol: string;
  orderAmountUsdt: string;
  direction?: 'long' | 'short' | 'both';
  riskLevel: RiskLevel;
}

/** 推导说明 */
export interface Derivation {
  field: string;
  value: string;
  formula: string;
  explanation: string;
}

/** 参数边界 */
export interface ParameterBounds {
  priceSpread?: { min: number; recommended: number; max: number };
  orderAmountUsdt?: { min: number; max: number };
  gridCount?: { min: number; max: number };
  upperPrice?: { min: number; max: number };
  lowerPrice?: { min: number; max: number };
}

/** 自动计算结果 */
export interface AutoCalcResult {
  fullConfig: BaseStrategyConfig;
  derivations: Derivation[];
  bounds: ParameterBounds;
}

export class AutoCalcService {
  private instrumentSpecService: InstrumentSpecService;

  constructor() {
    this.instrumentSpecService = InstrumentSpecService.getInstance();
  }

  /**
   * 根据简单输入计算完整策略配置
   */
  async calculate(input: SimpleConfigInput): Promise<AutoCalcResult> {
    this.validateInput(input);

    const { strategyType, tradingType, symbol, orderAmountUsdt, direction, riskLevel } = input;

    // 1. 获取交易对规格
    const spec = await this.instrumentSpecService.getSpec(symbol, tradingType);

    // 2. 获取当前行情
    const services = createTradingServices({
      tradingType,
      productType: tradingType === 'futures' ? 'USDT-FUTURES' : undefined,
    });
    const ticker = await services.marketDataService.getTicker(symbol);

    // 3. 获取账户余额
    const balance = await services.accountService.getAvailableBalance(
      tradingType === 'futures' ? 'USDT' : undefined
    );

    logger.info('自动计算开始', {
      strategyType,
      tradingType,
      symbol,
      orderAmountUsdt,
      riskLevel,
      currentPrice: ticker.lastPr,
      balance,
    });

    // 4. 根据策略类型分派计算
    if (strategyType === 'scalping') {
      return this.calculateScalping(input, spec, ticker, balance);
    }

    return this.calculateGrid(input, spec, ticker, balance);
  }

  /**
   * 获取参数边界（用于高级模式前端验证）
   */
  async getBounds(
    symbol: string,
    tradingType: TradingType,
    strategyType: StrategyType
  ): Promise<ParameterBounds> {
    const spec = await this.instrumentSpecService.getSpec(symbol, tradingType);

    const services = createTradingServices({
      tradingType,
      productType: tradingType === 'futures' ? 'USDT-FUTURES' : undefined,
    });
    const ticker = await services.marketDataService.getTicker(symbol);
    const balance = await services.accountService.getAvailableBalance(
      tradingType === 'futures' ? 'USDT' : undefined
    );

    const currentPrice = parseFloat(ticker.lastPr);
    const balanceNum = parseFloat(balance);
    const minSpread = this.calcMinProfitableSpread(currentPrice, spec.makerFeeRate, spec.takerFeeRate);
    const high24h = parseFloat(ticker.high24h);
    const low24h = parseFloat(ticker.low24h);
    const range24h = high24h - low24h;

    const bounds: ParameterBounds = {
      orderAmountUsdt: {
        min: Math.max(spec.minTradeNum * currentPrice * spec.sizeMultiplier, 5),
        max: Math.min(balanceNum * 0.5, 100000),
      },
    };

    if (strategyType === 'scalping') {
      bounds.priceSpread = {
        min: this.roundToPrice(minSpread, spec.pricePlace),
        recommended: this.roundToPrice(
          Math.max(minSpread * 2.0, range24h * 0.001),
          spec.pricePlace
        ),
        max: this.roundToPrice(range24h * 0.05, spec.pricePlace),
      };
    } else {
      // grid
      bounds.gridCount = { min: 3, max: 200 };
      bounds.upperPrice = {
        min: this.roundToPrice(currentPrice * 1.001, spec.pricePlace),
        max: this.roundToPrice(currentPrice * 1.5, spec.pricePlace),
      };
      bounds.lowerPrice = {
        min: this.roundToPrice(currentPrice * 0.5, spec.pricePlace),
        max: this.roundToPrice(currentPrice * 0.999, spec.pricePlace),
      };
    }

    return bounds;
  }

  /**
   * 计算剥头皮策略完整配置
   */
  private calculateScalping(
    input: SimpleConfigInput,
    spec: InstrumentSpec,
    ticker: UnifiedTickerInfo,
    balance: string
  ): AutoCalcResult {
    const { tradingType, symbol, orderAmountUsdt, direction, riskLevel } = input;
    const preset = SCALPING_PRESETS[riskLevel];
    const currentPrice = parseFloat(ticker.lastPr);
    const balanceNum = parseFloat(balance);
    const high24h = parseFloat(ticker.high24h);
    const low24h = parseFloat(ticker.low24h);
    const range24h = high24h - low24h;

    const derivations: Derivation[] = [];

    // 最小盈利价差 = currentPrice x (makerFeeRate + takerFeeRate) x spreadMultiplier
    // 买单 post_only = maker fee, 卖单可能 taker
    const totalFeeRate = spec.makerFeeRate + spec.takerFeeRate;
    const minPriceSpread = currentPrice * totalFeeRate * preset.spreadMultiplier;
    const recommendedSpread = Math.max(minPriceSpread, range24h * 0.001);
    const priceSpread = this.roundToPrice(recommendedSpread, spec.pricePlace);

    derivations.push({
      field: 'priceSpread',
      value: String(priceSpread),
      formula: `max(${currentPrice} x (${spec.makerFeeRate} + ${spec.takerFeeRate}) x ${preset.spreadMultiplier}, ${range24h.toFixed(2)} x 0.001)`,
      explanation: `价差 = max(最小盈利价差, 24h波动范围x0.001)。最小盈利价差基于当前价、maker+taker手续费、风险乘数计算`,
    });

    // 最大仓位
    const maxPositionUsdt = this.roundToUsdt(balanceNum * preset.maxPositionPercent);
    derivations.push({
      field: 'maxPositionUsdt',
      value: String(maxPositionUsdt),
      formula: `${balanceNum.toFixed(2)} x ${preset.maxPositionPercent}`,
      explanation: `最大仓位 = 可用余额 x ${riskLevel}风险等级仓位比例(${preset.maxPositionPercent * 100}%)`,
    });

    // 每日最大亏损
    const maxDailyLossUsdt = this.roundToUsdt(balanceNum * preset.dailyLossPercent);
    derivations.push({
      field: 'maxDailyLossUsdt',
      value: String(maxDailyLossUsdt),
      formula: `${balanceNum.toFixed(2)} x ${preset.dailyLossPercent}`,
      explanation: `每日亏损限额 = 可用余额 x ${riskLevel}风险等级日亏比例(${preset.dailyLossPercent * 100}%)`,
    });

    // 精度
    derivations.push({
      field: 'pricePrecision',
      value: String(spec.pricePlace),
      formula: `instrument.pricePlace`,
      explanation: `价格精度来自交易对规格`,
    });
    derivations.push({
      field: 'sizePrecision',
      value: String(spec.volumePlace),
      formula: `instrument.volumePlace`,
      explanation: `数量精度来自交易对规格`,
    });

    const fullConfig: ScalpingStrategyConfig = {
      strategyType: 'scalping',
      tradingType,
      instanceId: `auto-${symbol}-${Date.now()}`,
      symbol,
      orderAmountUsdt,
      priceSpread: String(priceSpread),
      maxPositionUsdt: String(maxPositionUsdt),
      maxPendingOrders: preset.maxPendingOrders,
      mergeThreshold: preset.mergeThreshold,
      maxDrawdownPercent: preset.maxDrawdownPercent,
      stopLossPercent: preset.stopLossPercent,
      maxDailyLossUsdt: String(maxDailyLossUsdt),
      cooldownMs: preset.cooldownMs,
      pollIntervalMs: preset.pollIntervalMs,
      orderCheckIntervalMs: preset.orderCheckIntervalMs,
      pricePrecision: spec.pricePlace,
      sizePrecision: spec.volumePlace,
      ...(tradingType === 'futures' ? {
        productType: 'USDT-FUTURES' as const,
        marginMode: 'crossed' as const,
        marginCoin: 'USDT',
        leverage: '1',
        direction: direction || 'long',
      } : {}),
    };

    // 计算边界
    const minSpread = this.calcMinProfitableSpread(currentPrice, spec.makerFeeRate, spec.takerFeeRate);
    const bounds: ParameterBounds = {
      priceSpread: {
        min: this.roundToPrice(minSpread, spec.pricePlace),
        recommended: priceSpread,
        max: this.roundToPrice(range24h * 0.05, spec.pricePlace),
      },
      orderAmountUsdt: {
        min: Math.max(spec.minTradeNum * currentPrice * spec.sizeMultiplier, 5),
        max: Math.min(balanceNum * 0.5, 100000),
      },
    };

    logger.info('剥头皮配置计算完成', {
      symbol,
      priceSpread,
      maxPositionUsdt,
      maxDailyLossUsdt,
      riskLevel,
    });

    return { fullConfig, derivations, bounds };
  }

  /**
   * 计算网格策略完整配置
   */
  private calculateGrid(
    input: SimpleConfigInput,
    spec: InstrumentSpec,
    ticker: UnifiedTickerInfo,
    balance: string
  ): AutoCalcResult {
    const { tradingType, symbol, orderAmountUsdt, direction, riskLevel } = input;
    const preset = GRID_PRESETS[riskLevel];
    const currentPrice = parseFloat(ticker.lastPr);
    const balanceNum = parseFloat(balance);

    const derivations: Derivation[] = [];

    // 网格上下界
    const upperPrice = this.roundToPrice(
      currentPrice * (1 + preset.rangePercent / 200),
      spec.pricePlace
    );
    const lowerPrice = this.roundToPrice(
      currentPrice * (1 - preset.rangePercent / 200),
      spec.pricePlace
    );

    derivations.push({
      field: 'upperPrice',
      value: String(upperPrice),
      formula: `${currentPrice} x (1 + ${preset.rangePercent}/200)`,
      explanation: `网格上界 = 当前价 x (1 + 范围百分比/200)，${riskLevel}预设范围 ${preset.rangePercent}%`,
    });
    derivations.push({
      field: 'lowerPrice',
      value: String(lowerPrice),
      formula: `${currentPrice} x (1 - ${preset.rangePercent}/200)`,
      explanation: `网格下界 = 当前价 x (1 - 范围百分比/200)`,
    });

    // 网格间距
    const gridSpacing = (upperPrice - lowerPrice) / preset.gridCount;
    const minProfitableSpread = this.calcMinProfitableSpread(currentPrice, spec.makerFeeRate, spec.takerFeeRate);

    derivations.push({
      field: 'gridSpacing',
      value: String(this.roundToPrice(gridSpacing, spec.pricePlace)),
      formula: `(${upperPrice} - ${lowerPrice}) / ${preset.gridCount}`,
      explanation: `网格间距 = (上界 - 下界) / 网格数量`,
    });

    // 验证网格间距 > 最小盈利价差
    if (gridSpacing < minProfitableSpread) {
      logger.warn('网格间距小于最小盈利价差', {
        gridSpacing,
        minProfitableSpread,
        symbol,
      });
      derivations.push({
        field: 'warning',
        value: 'gridSpacing < minProfitableSpread',
        formula: `${gridSpacing.toFixed(spec.pricePlace)} < ${minProfitableSpread.toFixed(spec.pricePlace)}`,
        explanation: `警告：当前网格间距小于最小盈利价差(含手续费)，可能导致亏损。建议减少网格数量或扩大价格范围`,
      });
    }

    // 最大仓位
    const maxPositionUsdt = this.roundToUsdt(balanceNum * preset.maxPositionPercent);
    derivations.push({
      field: 'maxPositionUsdt',
      value: String(maxPositionUsdt),
      formula: `${balanceNum.toFixed(2)} x ${preset.maxPositionPercent}`,
      explanation: `最大仓位 = 可用余额 x ${riskLevel}风险等级仓位比例(${preset.maxPositionPercent * 100}%)`,
    });

    // 每日最大亏损
    const maxDailyLossUsdt = this.roundToUsdt(balanceNum * preset.dailyLossPercent);
    derivations.push({
      field: 'maxDailyLossUsdt',
      value: String(maxDailyLossUsdt),
      formula: `${balanceNum.toFixed(2)} x ${preset.dailyLossPercent}`,
      explanation: `每日亏损限额 = 可用余额 x ${riskLevel}风险等级日亏比例(${preset.dailyLossPercent * 100}%)`,
    });

    // 精度
    derivations.push({
      field: 'pricePrecision',
      value: String(spec.pricePlace),
      formula: `instrument.pricePlace`,
      explanation: `价格精度来自交易对规格`,
    });
    derivations.push({
      field: 'sizePrecision',
      value: String(spec.volumePlace),
      formula: `instrument.volumePlace`,
      explanation: `数量精度来自交易对规格`,
    });

    const fullConfig: GridStrategyConfig = {
      strategyType: 'grid',
      tradingType,
      instanceId: `auto-${symbol}-${Date.now()}`,
      symbol,
      orderAmountUsdt,
      upperPrice: String(upperPrice),
      lowerPrice: String(lowerPrice),
      gridCount: preset.gridCount,
      gridType: 'arithmetic',
      maxPositionUsdt: String(maxPositionUsdt),
      maxDrawdownPercent: preset.maxDrawdownPercent,
      stopLossPercent: preset.stopLossPercent,
      maxDailyLossUsdt: String(maxDailyLossUsdt),
      cooldownMs: preset.cooldownMs,
      pollIntervalMs: preset.pollIntervalMs,
      orderCheckIntervalMs: preset.orderCheckIntervalMs,
      pricePrecision: spec.pricePlace,
      sizePrecision: spec.volumePlace,
      ...(tradingType === 'futures' ? {
        productType: 'USDT-FUTURES' as const,
        marginMode: 'crossed' as const,
        marginCoin: 'USDT',
        leverage: '1',
        direction: direction || 'both',
      } : {}),
    };

    // 计算边界
    const bounds: ParameterBounds = {
      orderAmountUsdt: {
        min: Math.max(spec.minTradeNum * currentPrice * spec.sizeMultiplier, 5),
        max: Math.min(balanceNum * 0.5, 100000),
      },
      gridCount: { min: 3, max: 200 },
      upperPrice: {
        min: this.roundToPrice(currentPrice * 1.001, spec.pricePlace),
        max: this.roundToPrice(currentPrice * 1.5, spec.pricePlace),
      },
      lowerPrice: {
        min: this.roundToPrice(currentPrice * 0.5, spec.pricePlace),
        max: this.roundToPrice(currentPrice * 0.999, spec.pricePlace),
      },
    };

    logger.info('网格配置计算完成', {
      symbol,
      upperPrice,
      lowerPrice,
      gridCount: preset.gridCount,
      gridSpacing: this.roundToPrice(gridSpacing, spec.pricePlace),
      maxPositionUsdt,
      riskLevel,
    });

    return { fullConfig, derivations, bounds };
  }

  /**
   * 验证输入参数
   */
  private validateInput(input: SimpleConfigInput): void {
    const { strategyType, tradingType, symbol, orderAmountUsdt, riskLevel } = input;

    if (!strategyType || !['scalping', 'grid'].includes(strategyType)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '无效的策略类型，必须为 scalping 或 grid',
        { strategyType },
        400
      );
    }

    if (!tradingType || !['futures', 'spot'].includes(tradingType)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '无效的交易类型，必须为 futures 或 spot',
        { tradingType },
        400
      );
    }

    if (!symbol || symbol.length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '交易对不能为空',
        { symbol },
        400
      );
    }

    if (!orderAmountUsdt || parseFloat(orderAmountUsdt) <= 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '单笔订单金额必须大于 0',
        { orderAmountUsdt },
        400
      );
    }

    if (!riskLevel || !['conservative', 'balanced', 'aggressive'].includes(riskLevel)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '无效的风险等级，必须为 conservative、balanced 或 aggressive',
        { riskLevel },
        400
      );
    }

    if (input.direction && !['long', 'short', 'both'].includes(input.direction)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        '无效的方向，必须为 long、short 或 both',
        { direction: input.direction },
        400
      );
    }
  }

  /**
   * 计算最小盈利价差（覆盖双边手续费）
   * 买单 post_only = maker fee, 卖单可能 taker
   * minSpread = price x (makerFeeRate + takerFeeRate)
   */
  private calcMinProfitableSpread(price: number, makerFeeRate: number, takerFeeRate?: number): number {
    const taker = takerFeeRate ?? makerFeeRate;
    return price * (makerFeeRate + taker);
  }

  /**
   * 按价格精度四舍五入
   */
  private roundToPrice(value: number, pricePlace: number): number {
    const factor = Math.pow(10, pricePlace);
    return Math.round(value * factor) / factor;
  }

  /**
   * USDT 金额保留两位小数
   */
  private roundToUsdt(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
