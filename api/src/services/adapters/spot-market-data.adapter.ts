/**
 * 现货行情数据适配器
 * 将 MarketDataService 包装为 IMarketDataService
 */

import { IMarketDataService } from '../interfaces/i-market-data.service';
import { MarketDataService } from '../market-data.service';
import { UnifiedTickerInfo } from '../../types/trading.types';

export class SpotMarketDataAdapter implements IMarketDataService {
  private service: MarketDataService;

  constructor() {
    this.service = new MarketDataService();
  }

  async getTicker(symbol: string): Promise<UnifiedTickerInfo> {
    const tickers = await this.service.getTickers(symbol);
    if (!tickers || tickers.length === 0) {
      throw new Error(`No spot ticker data for ${symbol}`);
    }
    const t = tickers[0];
    return {
      symbol: t.symbol,
      lastPr: t.lastPr,
      bidPr: t.bidPr,
      askPr: t.askPr,
      bidSz: t.bidSz,
      askSz: t.askSz,
      high24h: t.high24h,
      low24h: t.low24h,
      change24h: t.change24h,
      baseVolume: t.baseVolume,
      quoteVolume: t.quoteVolume,
      ts: t.ts,
    };
  }

  async getBestBid(symbol: string): Promise<string> {
    const ticker = await this.getTicker(symbol);
    return ticker.bidPr;
  }

  async getBestAsk(symbol: string): Promise<string> {
    const ticker = await this.getTicker(symbol);
    return ticker.askPr;
  }
}
