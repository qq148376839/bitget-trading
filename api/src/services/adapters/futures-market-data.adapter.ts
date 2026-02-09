/**
 * 合约行情数据适配器
 * 将 FuturesMarketDataService 包装为 IMarketDataService
 */

import { IMarketDataService } from '../interfaces/i-market-data.service';
import { FuturesMarketDataService } from '../futures-market-data.service';
import { UnifiedTickerInfo } from '../../types/trading.types';
import { ProductType } from '../../types/futures.types';

export class FuturesMarketDataAdapter implements IMarketDataService {
  private service: FuturesMarketDataService;
  private productType: ProductType;

  constructor(productType: ProductType) {
    this.service = new FuturesMarketDataService();
    this.productType = productType;
  }

  async getTicker(symbol: string): Promise<UnifiedTickerInfo> {
    const ticker = await this.service.getTicker(symbol, this.productType);
    return {
      symbol: ticker.symbol,
      lastPr: ticker.lastPr,
      bidPr: ticker.bidPr,
      askPr: ticker.askPr,
      bidSz: ticker.bidSz,
      askSz: ticker.askSz,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      change24h: ticker.change24h,
      baseVolume: ticker.baseVolume,
      quoteVolume: ticker.quoteVolume,
      ts: ticker.ts,
    };
  }

  async getBestBid(symbol: string): Promise<string> {
    return this.service.getBestBid(symbol, this.productType);
  }

  async getBestAsk(symbol: string): Promise<string> {
    return this.service.getBestAsk(symbol, this.productType);
  }
}
