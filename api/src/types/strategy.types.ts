/**
 * 策略配置/状态/事件类型定义
 */

import { ProductType, MarginMode } from './futures.types';

/** 策略方向 */
export type StrategyDirection = 'long' | 'short' | 'both';

/** 策略状态机 */
export type StrategyStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';

/** 追踪订单状态 */
export type TrackedOrderStatus = 'pending' | 'filled' | 'cancelled' | 'failed';

/** 追踪订单方向 */
export type TrackedOrderSide = 'buy' | 'sell';

/** 剥头皮策略配置 */
export interface ScalpingStrategyConfig {
  // 交易对配置
  symbol: string;
  productType: ProductType;
  direction: StrategyDirection;

  // 订单配置
  orderAmountUsdt: string;
  priceSpread: string;
  maxPositionUsdt: string;
  leverage: string;
  marginMode: MarginMode;
  marginCoin: string;

  // 挂单管理
  maxPendingOrders: number;
  mergeThreshold: number;

  // 轮询间隔
  pollIntervalMs: number;
  orderCheckIntervalMs: number;

  // 风控参数
  maxDrawdownPercent: number;
  stopLossPercent: number;
  maxDailyLossUsdt: string;
  cooldownMs: number;

  // 精度配置
  pricePrecision: number;
  sizePrecision: number;
}

/** 内存追踪订单 */
export interface TrackedOrder {
  orderId: string;
  clientOid: string;
  side: TrackedOrderSide;
  price: string;
  size: string;
  status: TrackedOrderStatus;
  linkedOrderId: string | null;   // 买单成交后挂的卖单 ID
  direction: StrategyDirection;
  createdAt: number;              // timestamp ms
  filledAt: number | null;
}

/** 策略运行状态 */
export interface StrategyState {
  status: StrategyStatus;
  config: ScalpingStrategyConfig | null;
  activeBuyOrderId: string | null;
  lastBidPrice: string | null;
  pendingSellCount: number;
  totalPositionUsdt: string;
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
  | 'ORDERS_MERGED'
  | 'RISK_LIMIT_HIT'
  | 'CONFIG_UPDATED'
  | 'EMERGENCY_STOP';

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

/** 默认配置 */
export const DEFAULT_SCALPING_CONFIG: ScalpingStrategyConfig = {
  symbol: 'BTCUSDT',
  productType: 'SUSDT-FUTURES',
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
  sizePrecision: 3,
};
