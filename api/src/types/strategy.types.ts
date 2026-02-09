/**
 * 策略配置/状态/事件类型定义
 */

import { ProductType, MarginMode } from './futures.types';
import { StrategyType, TradingType } from './trading.types';

/** 策略方向 */
export type StrategyDirection = 'long' | 'short' | 'both';

/** 策略状态机 */
export type StrategyStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';

/** 追踪订单状态 */
export type TrackedOrderStatus = 'pending' | 'filled' | 'cancelled' | 'failed';

/** 追踪订单方向 */
export type TrackedOrderSide = 'buy' | 'sell';

/** 基础策略配置（所有策略类型共用） */
export interface BaseStrategyConfig {
  // 策略/交易类型标识
  strategyType: StrategyType;
  tradingType: TradingType;
  instanceId: string;

  // 交易对配置
  symbol: string;

  // 订单配置
  orderAmountUsdt: string;
  maxPositionUsdt: string;

  // 合约专用（现货可选/忽略）
  productType?: ProductType;
  marginMode?: MarginMode;
  marginCoin?: string;
  leverage?: string;
  direction?: StrategyDirection;

  // 通用风控
  maxDrawdownPercent: number;
  stopLossPercent: number;
  maxDailyLossUsdt: string;
  cooldownMs: number;

  // 精度配置（启动时自动填充）
  pricePrecision: number;
  sizePrecision: number;

  // 轮询间隔
  pollIntervalMs: number;
  orderCheckIntervalMs: number;
}

/** 剥头皮策略专属配置 */
export interface ScalpingStrategyConfig extends BaseStrategyConfig {
  strategyType: 'scalping';

  // 剥头皮专属
  priceSpread: string;
  maxPendingOrders: number;
  mergeThreshold: number;
}

/** 网格策略专属配置 */
export interface GridStrategyConfig extends BaseStrategyConfig {
  strategyType: 'grid';

  upperPrice: string;
  lowerPrice: string;
  gridCount: number;
  gridType: 'arithmetic' | 'geometric';
}

/** 任意策略配置联合类型 */
export type AnyStrategyConfig = ScalpingStrategyConfig | GridStrategyConfig;

/** 内存追踪订单 */
export interface TrackedOrder {
  orderId: string;
  clientOid: string;
  side: TrackedOrderSide;
  price: string;
  size: string;
  status: TrackedOrderStatus;
  linkedOrderId: string | null;
  direction: StrategyDirection;
  createdAt: number;              // timestamp ms
  filledAt: number | null;
}

/** 策略运行状态 */
export interface StrategyState {
  status: StrategyStatus;
  strategyType: StrategyType;
  tradingType: TradingType;
  instanceId: string;
  config: AnyStrategyConfig | null;
  activeBuyOrderId: string | null;
  lastBidPrice: string | null;
  pendingSellCount: number;
  totalPositionUsdt: string;
  spotAvailableUsdt: string;
  futuresAvailableUsdt: string;
  realizedPnl: string;
  unrealizedPnl: string;
  dailyPnl: string;
  tradeCount: number;
  errorCount: number;
  lastError: string | null;
  startedAt: number | null;
  uptimeMs: number;
}

/** 策略事件类型 */
export type StrategyEventType =
  | 'STRATEGY_STARTED'
  | 'STRATEGY_STOPPED'
  | 'STRATEGY_ERROR'
  | 'BUY_ORDER_PLACED'
  | 'BUY_ORDER_CANCELLED'
  | 'BUY_ORDER_FILLED'
  | 'SELL_ORDER_PLACED'
  | 'SELL_ORDER_FILLED'
  | 'SELL_ORDER_FAILED'
  | 'ORDERS_MERGED'
  | 'RISK_LIMIT_HIT'
  | 'CONFIG_UPDATED'
  | 'EMERGENCY_STOP'
  | 'GRID_BUY_FILLED'
  | 'GRID_SELL_FILLED'
  | 'GRID_LEVEL_UPDATED';

/** 策略事件 */
export interface StrategyEvent {
  type: StrategyEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

/** PnL 汇总 */
export interface PnlSummary {
  realizedPnl: string;
  unrealizedPnl: string;
  dailyPnl: string;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: string;
  avgWin: string;
  avgLoss: string;
}

/** 默认剥头皮配置 */
export const DEFAULT_SCALPING_CONFIG: ScalpingStrategyConfig = {
  strategyType: 'scalping',
  tradingType: 'futures',
  instanceId: 'default',
  symbol: 'BTCUSDT',
  productType: 'USDT-FUTURES',
  direction: 'long',
  orderAmountUsdt: '10',
  priceSpread: '2',
  maxPositionUsdt: '1500',
  leverage: '1',
  marginMode: 'crossed',
  marginCoin: 'USDT',
  maxPendingOrders: 200,
  mergeThreshold: 21,
  pollIntervalMs: 500,
  orderCheckIntervalMs: 1000,
  maxDrawdownPercent: 5,
  stopLossPercent: 3,
  maxDailyLossUsdt: '100',
  cooldownMs: 60000,
  pricePrecision: 1,
  sizePrecision: 6,
};

/** 默认网格配置 */
export const DEFAULT_GRID_CONFIG: GridStrategyConfig = {
  strategyType: 'grid',
  tradingType: 'futures',
  instanceId: 'default',
  symbol: 'BTCUSDT',
  productType: 'USDT-FUTURES',
  direction: 'long',
  orderAmountUsdt: '10',
  maxPositionUsdt: '1500',
  leverage: '1',
  marginMode: 'crossed',
  marginCoin: 'USDT',
  upperPrice: '0',
  lowerPrice: '0',
  gridCount: 10,
  gridType: 'arithmetic',
  pollIntervalMs: 2000,
  orderCheckIntervalMs: 3000,
  maxDrawdownPercent: 5,
  stopLossPercent: 3,
  maxDailyLossUsdt: '100',
  cooldownMs: 60000,
  pricePrecision: 1,
  sizePrecision: 6,
};
