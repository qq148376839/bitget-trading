/** API 响应包装 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: { code: string; message: string; details?: unknown };
}

/** 交易类型 */
export type TradingType = 'futures' | 'spot';

/** 策略类型 */
export type StrategyType = 'scalping' | 'grid';

/** 策略状态机 */
export type StrategyStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR';

/** 策略方向 */
export type StrategyDirection = 'long' | 'short' | 'both';

/** 追踪订单状态 */
export type TrackedOrderStatus = 'pending' | 'filled' | 'cancelled' | 'failed';

/** 产品类型 */
export type ProductType = 'USDT-FUTURES' | 'SUSDT-FUTURES';

/** 保证金模式 */
export type MarginMode = 'crossed' | 'isolated';

/** 基础策略配置 */
export interface BaseStrategyConfig {
  strategyType: StrategyType;
  tradingType: TradingType;
  instanceId: string;
  symbol: string;
  orderAmountUsdt: string;
  maxPositionUsdt: string;
  productType?: ProductType;
  marginMode?: MarginMode;
  marginCoin?: string;
  leverage?: string;
  direction?: StrategyDirection;
  maxDrawdownPercent: number;
  stopLossPercent: number;
  maxDailyLossUsdt: string;
  cooldownMs: number;
  pricePrecision: number;
  sizePrecision: number;
  pollIntervalMs: number;
  orderCheckIntervalMs: number;
}

/** 剥头皮策略配置 */
export interface ScalpingStrategyConfig extends BaseStrategyConfig {
  strategyType: 'scalping';
  priceSpread: string;
  maxPendingOrders: number;
  mergeThreshold: number;
}

/** 网格策略配置 */
export interface GridStrategyConfig extends BaseStrategyConfig {
  strategyType: 'grid';
  upperPrice: string;
  lowerPrice: string;
  gridCount: number;
  gridType: 'arithmetic' | 'geometric';
}

/** 任意策略配置 */
export type AnyStrategyConfig = ScalpingStrategyConfig | GridStrategyConfig;

/** 内存追踪订单 */
export interface TrackedOrder {
  orderId: string;
  clientOid: string;
  side: 'buy' | 'sell';
  price: string;
  size: string;
  status: TrackedOrderStatus;
  linkedOrderId: string | null;
  direction: StrategyDirection;
  createdAt: number;
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

/** 合约规格信息 */
export interface ContractSpecInfo {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  pricePlace: number;
  volumePlace: number;
  minTradeNum: number;
  sizeMultiplier: number;
  makerFeeRate: number;
  takerFeeRate: number;
}

/** 交易对规格信息 */
export interface InstrumentSpec {
  tradingType: TradingType;
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  pricePlace: number;
  volumePlace: number;
  minTradeNum: number;
  sizeMultiplier: number;
  makerFeeRate: number;
  takerFeeRate: number;
}

/** 订单列表响应 */
export interface OrdersResponse {
  total: number;
  pending: number;
  filled: number;
  cancelled: number;
  orders: TrackedOrder[];
}
