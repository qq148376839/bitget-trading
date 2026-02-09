/**
 * 统一交易类型抽象
 * 屏蔽合约/现货差异的统一接口
 */

/** 交易类型 */
export type TradingType = 'futures' | 'spot';

/** 策略类型 */
export type StrategyType = 'scalping' | 'grid';

/** 统一下单参数（屏蔽合约/现货差异） */
export interface UnifiedPlaceOrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  price?: string;
  size: string;
  force?: string;
  clientOid?: string;
  // 合约专用（现货忽略）
  productType?: string;
  marginMode?: string;
  marginCoin?: string;
  tradeSide?: string;
}

/** 统一下单结果 */
export interface UnifiedPlaceOrderResult {
  orderId: string;
  clientOid: string;
}

/** 统一撤单参数 */
export interface UnifiedCancelOrderParams {
  symbol: string;
  orderId: string;
  productType?: string;
}

/** 统一批量撤单参数 */
export interface UnifiedBatchCancelParams {
  symbol: string;
  orderIdList: Array<{ orderId: string }>;
  productType?: string;
}

/** 统一批量撤单结果 */
export interface UnifiedBatchCancelResult {
  successList: Array<{ orderId: string; clientOid: string }>;
  failureList: Array<{ orderId: string; clientOid: string; errorMsg: string; errorCode: string }>;
}

/** 统一挂单信息 */
export interface UnifiedPendingOrder {
  symbol: string;
  orderId: string;
  clientOid: string;
  size: string;
  filledQty: string;
  price: string;
  side: 'buy' | 'sell';
  orderType: string;
  cTime: string;
}

/** 统一订单详情 */
export interface UnifiedOrderDetail {
  orderId: string;
  clientOid: string;
  symbol: string;
  size: string;
  filledQty: string;
  price: string;
  side: 'buy' | 'sell';
  state: string;  // 'live' | 'partially_filled' | 'filled' | 'cancelled'
}

/** 统一 Ticker 信息 */
export interface UnifiedTickerInfo {
  symbol: string;
  lastPr: string;
  bidPr: string;
  askPr: string;
  bidSz: string;
  askSz: string;
  high24h: string;
  low24h: string;
  change24h: string;
  baseVolume: string;
  quoteVolume: string;
  ts: string;
}

/** 统一交易对规格信息 */
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
