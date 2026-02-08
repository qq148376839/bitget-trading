/**
 * 合约 API 类型定义
 */

/** 产品类型：USDT-FUTURES（实盘）/ SUSDT-FUTURES（模拟仓） */
export type ProductType = 'USDT-FUTURES' | 'SUSDT-FUTURES';

/** 保证金模式 */
export type MarginMode = 'crossed' | 'isolated';

/** 订单方向 */
export type FuturesSide = 'buy' | 'sell';

/** 订单类型 */
export type FuturesOrderType = 'limit' | 'market';

/** 持仓方向 */
export type TradeSide = 'open' | 'close';

/** 有效方式 */
export type TimeInForce = 'normal' | 'post_only' | 'fok' | 'ioc';

/** 合约下单参数 */
export interface FuturesPlaceOrderParams {
  symbol: string;
  productType: ProductType;
  marginMode: MarginMode;
  marginCoin: string;
  size: string;
  side: FuturesSide;
  orderType: FuturesOrderType;
  price?: string;
  force?: TimeInForce;
  tradeSide?: TradeSide;
  clientOid?: string;
}

/** 合约下单返回 */
export interface FuturesPlaceOrderResult {
  orderId: string;
  clientOid: string;
}

/** 合约撤单参数 */
export interface FuturesCancelOrderParams {
  symbol: string;
  productType: ProductType;
  orderId?: string;
  clientOid?: string;
}

/** 批量撤单参数 */
export interface FuturesBatchCancelParams {
  symbol: string;
  productType: ProductType;
  orderIdList: Array<{ orderId: string }>;
}

/** 批量撤单返回 */
export interface FuturesBatchCancelResult {
  successList: Array<{ orderId: string; clientOid: string }>;
  failureList: Array<{ orderId: string; clientOid: string; errorMsg: string; errorCode: string }>;
}

/** 挂单查询返回的单个订单 */
export interface FuturesPendingOrder {
  symbol: string;
  orderId: string;
  clientOid: string;
  size: string;
  filledQty: string;
  fee: string;
  price: string;
  side: FuturesSide;
  orderType: FuturesOrderType;
  force: TimeInForce;
  tradeSide: TradeSide;
  marginCoin: string;
  marginMode: MarginMode;
  cTime: string;
  uTime: string;
}

/** 盘口深度 */
export interface FuturesOrderBook {
  asks: Array<[string, string]>;  // [price, size]
  bids: Array<[string, string]>;  // [price, size]
  ts: string;
}

/** 合约 Ticker 信息 */
export interface FuturesTickerInfo {
  symbol: string;
  lastPr: string;
  bidPr: string;
  askPr: string;
  bidSz: string;
  askSz: string;
  high24h: string;
  low24h: string;
  ts: string;
  change24h: string;
  baseVolume: string;
  quoteVolume: string;
  usdtVolume: string;
  openUtc: string;
  fundingRate: string;
  markPrice: string;
  indexPrice: string;
}

/** 合约账户信息 */
export interface FuturesAccount {
  marginCoin: string;
  locked: string;
  available: string;
  crossedMaxAvailable: string;
  isolatedMaxAvailable: string;
  maxTransferOut: string;
  accountEquity: string;
  usdtEquity: string;
  btcEquity: string;
  crossedRiskRate: string;
  unrealizedPL: string;
  bonus: string;
}
