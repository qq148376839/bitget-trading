/**
 * 实时行情数据服务
 * 实现 IMarketDataService 接口
 * WebSocket 优先，断线时自动降级到 REST
 */

import { IMarketDataService } from './interfaces/i-market-data.service';
import { UnifiedTickerInfo } from '../types/trading.types';
import { WebSocketClientService } from './websocket-client.service';
import { BitgetClientService } from './bitget-client.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('realtime-market');

interface TickerData {
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
  timestamp: number;
}

export class RealtimeMarketDataService implements IMarketDataService {
  private wsClient: WebSocketClientService;
  private restClient: BitgetClientService;
  private tickerCache: Map<string, TickerData> = new Map();
  private instType: string;
  private productType?: string;

  constructor(instType: string, productType?: string) {
    this.wsClient = WebSocketClientService.getInstance();
    this.restClient = BitgetClientService.getInstance();
    this.instType = instType;
    this.productType = productType;
  }

  /**
   * 启动 WebSocket 订阅
   */
  subscribe(symbol: string): void {
    this.wsClient.subscribeTicker(this.instType, symbol);
    this.wsClient.on(`public:ticker:${symbol}`, (data: unknown[]) => {
      if (data && data.length > 0) {
        const d = data[0] as Record<string, string>;
        this.tickerCache.set(symbol, {
          lastPr: d.lastPr || d.last || '0',
          bidPr: d.bidPr || d.bestBid || '0',
          askPr: d.askPr || d.bestAsk || '0',
          bidSz: d.bidSz || '0',
          askSz: d.askSz || '0',
          high24h: d.high24h || '0',
          low24h: d.low24h || '0',
          change24h: d.change24h || '0',
          baseVolume: d.baseVolume || d.baseVol || '0',
          quoteVolume: d.quoteVolume || d.quoteVol || '0',
          ts: d.ts || String(Date.now()),
          timestamp: Date.now(),
        });
      }
    });
    logger.info('已订阅实时行情', { instType: this.instType, symbol });
  }

  async getTicker(symbol: string): Promise<UnifiedTickerInfo> {
    // Try WebSocket cache first (fresh within 10 seconds)
    const cached = this.tickerCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < 10000) {
      return {
        symbol,
        lastPr: cached.lastPr,
        bidPr: cached.bidPr,
        askPr: cached.askPr,
        bidSz: cached.bidSz,
        askSz: cached.askSz,
        high24h: cached.high24h,
        low24h: cached.low24h,
        change24h: cached.change24h,
        baseVolume: cached.baseVolume,
        quoteVolume: cached.quoteVolume,
        ts: cached.ts,
      };
    }

    // Fallback to REST
    return this.fetchTickerREST(symbol);
  }

  async getBestBid(symbol: string): Promise<string> {
    const ticker = await this.getTicker(symbol);
    return ticker.bidPr;
  }

  async getBestAsk(symbol: string): Promise<string> {
    const ticker = await this.getTicker(symbol);
    return ticker.askPr;
  }

  private async fetchTickerREST(symbol: string): Promise<UnifiedTickerInfo> {
    if (this.productType) {
      // Futures
      const response = await this.restClient.publicGet<Array<Record<string, string>>>(
        '/api/v2/mix/market/ticker',
        { symbol, productType: this.productType }
      );
      const data = response.data?.[0];
      return {
        symbol,
        lastPr: data?.lastPr || '0',
        bidPr: data?.bidPr || '0',
        askPr: data?.askPr || '0',
        bidSz: data?.bidSz || '0',
        askSz: data?.askSz || '0',
        high24h: data?.high24h || '0',
        low24h: data?.low24h || '0',
        change24h: data?.change24h || '0',
        baseVolume: data?.baseVolume || '0',
        quoteVolume: data?.quoteVolume || '0',
        ts: data?.ts || String(Date.now()),
      };
    }

    // Spot
    const response = await this.restClient.publicGet<Array<Record<string, string>>>(
      '/api/v2/spot/market/tickers',
      { symbol }
    );
    const data = response.data?.[0];
    return {
      symbol,
      lastPr: data?.lastPr || data?.close || '0',
      bidPr: data?.bidPr || data?.buyOne || '0',
      askPr: data?.askPr || data?.sellOne || '0',
      bidSz: data?.bidSz || '0',
      askSz: data?.askSz || '0',
      high24h: data?.high24h || '0',
      low24h: data?.low24h || '0',
      change24h: data?.change24h || '0',
      baseVolume: data?.baseVolume || '0',
      quoteVolume: data?.quoteVolume || '0',
      ts: data?.ts || String(Date.now()),
    };
  }
}
