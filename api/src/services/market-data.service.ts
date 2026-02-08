/**
 * 市场数据服务
 * 获取行情、K线等市场数据
 */

import { BitgetClientService, BitgetResponse } from './bitget-client.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('market-data');

export interface TickerInfo {
  symbol: string;
  high24h: string;
  low24h: string;
  lastPr: string;
  bidPr: string;
  askPr: string;
  bidSz: string;
  askSz: string;
  open: string;
  baseVolume: string;
  quoteVolume: string;
  usdtVolume: string;
  change24h: string;
  changeUtc24h: string;
  ts: string;
  openUtc: string;
}

export interface CandleData {
  ts: string;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVolume: string;
  quoteVolume: string;
  usdtVolume: string;
}

export type Granularity =
  | '1min' | '5min' | '15min' | '30min'
  | '1h' | '4h' | '6h' | '12h'
  | '1day' | '3day' | '1week' | '1M';

export class MarketDataService {
  private client: BitgetClientService;

  constructor() {
    this.client = BitgetClientService.getInstance();
  }

  /**
   * 获取单个或全部交易对行情
   */
  async getTickers(symbol?: string): Promise<TickerInfo[]> {
    const params: Record<string, string> = {};
    if (symbol) params.symbol = symbol;

    const response = await this.client.publicGet<TickerInfo[]>(
      '/api/v2/spot/market/tickers',
      Object.keys(params).length > 0 ? params : undefined
    );

    logger.debug('获取行情数据', { symbol, count: response.data.length });
    return response.data;
  }

  /**
   * 获取 K 线数据
   */
  async getCandles(
    symbol: string,
    granularity: Granularity,
    options?: {
      startTime?: string;
      endTime?: string;
      limit?: string;
    }
  ): Promise<CandleData[]> {
    const params: Record<string, string> = { symbol, granularity };
    if (options?.startTime) params.startTime = options.startTime;
    if (options?.endTime) params.endTime = options.endTime;
    if (options?.limit) params.limit = options.limit;

    const response = await this.client.publicGet<string[][]>(
      '/api/v2/spot/market/candles',
      params
    );

    const candles: CandleData[] = response.data.map((item) => ({
      ts: item[0],
      open: item[1],
      high: item[2],
      low: item[3],
      close: item[4],
      baseVolume: item[5],
      quoteVolume: item[6],
      usdtVolume: item[7],
    }));

    logger.debug('获取K线数据', { symbol, granularity, count: candles.length });
    return candles;
  }
}
