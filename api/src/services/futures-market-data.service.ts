/**
 * 合约行情数据服务
 * 提供盘口深度、Ticker 等合约市场数据查询
 */

import { BitgetClientService } from './bitget-client.service';
import { FuturesTickerInfo, FuturesOrderBook, ProductType } from '../types/futures.types';

export class FuturesMarketDataService {
  private client: BitgetClientService;

  constructor() {
    this.client = BitgetClientService.getInstance();
  }

  /**
   * 获取合约 Ticker
   */
  async getTicker(symbol: string, productType: ProductType): Promise<FuturesTickerInfo> {
    const response = await this.client.publicGet<FuturesTickerInfo[]>(
      '/api/v2/mix/market/ticker',
      { symbol, productType }
    );
    if (!response.data || response.data.length === 0) {
      throw new Error(`No ticker data for ${symbol}`);
    }
    return response.data[0];
  }

  /**
   * 获取合约盘口深度
   */
  async getOrderBookDepth(
    symbol: string,
    productType: ProductType,
    limit = '5'
  ): Promise<FuturesOrderBook> {
    const response = await this.client.publicGet<FuturesOrderBook>(
      '/api/v2/mix/market/merge-depth',
      { symbol, productType, limit }
    );
    return response.data;
  }

  /**
   * 提取盘口 bid1 价格
   */
  async getBestBid(symbol: string, productType: ProductType): Promise<string> {
    const depth = await this.getOrderBookDepth(symbol, productType, '1');
    if (!depth.bids || depth.bids.length === 0) {
      throw new Error(`No bid data for ${symbol}`);
    }
    return depth.bids[0][0];
  }

  /**
   * 提取盘口 ask1 价格
   */
  async getBestAsk(symbol: string, productType: ProductType): Promise<string> {
    const depth = await this.getOrderBookDepth(symbol, productType, '1');
    if (!depth.asks || depth.asks.length === 0) {
      throw new Error(`No ask data for ${symbol}`);
    }
    return depth.asks[0][0];
  }
}
