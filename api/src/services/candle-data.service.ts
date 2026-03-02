/**
 * K线数据服务
 * REST 初始加载 + WebSocket 增量更新
 * 多时间周期缓存 + 指标计算
 */

import { BitgetClientService } from './bitget-client.service';
import { WebSocketClientService } from './websocket-client.service';
import { Candle, calcAllIndicators, IndicatorResult } from '../strategy/indicators/technical-indicators';
import { detectMarketRegime, MarketRegimeResult } from '../strategy/indicators/market-regime-detector';
import { createLogger } from '../utils/logger';

const logger = createLogger('candle-data');

interface CandleCache {
  candles: Candle[];
  lastUpdate: number;
}

const MAX_CANDLES = 200;

export class CandleDataService {
  private static instance: CandleDataService | null = null;
  private client: BitgetClientService;
  private wsClient: WebSocketClientService | null = null;
  private cache: Map<string, CandleCache> = new Map();
  private indicatorCache: Map<string, { result: IndicatorResult; timestamp: number }> = new Map();

  private constructor() {
    this.client = BitgetClientService.getInstance();
  }

  static getInstance(): CandleDataService {
    if (!CandleDataService.instance) {
      CandleDataService.instance = new CandleDataService();
    }
    return CandleDataService.instance;
  }

  /**
   * 启用 WebSocket 增量更新
   */
  enableWebSocket(instType: string, instId: string): void {
    this.wsClient = WebSocketClientService.getInstance();

    // Subscribe to candle updates
    this.wsClient.subscribeCandles(instType, instId, '1m');
    this.wsClient.subscribeCandles(instType, instId, '5m');

    // Listen for candle updates
    this.wsClient.on(`public:candle1m`, (data: unknown[], instIdFromWs: string) => {
      if (instIdFromWs === instId) {
        this.handleCandleUpdate(`${instId}:1m`, data);
      }
    });

    this.wsClient.on(`public:candle5m`, (data: unknown[], instIdFromWs: string) => {
      if (instIdFromWs === instId) {
        this.handleCandleUpdate(`${instId}:5m`, data);
      }
    });
  }

  /**
   * 获取 K线数据（内存缓存 → REST API）
   */
  async getCandles(
    symbol: string,
    interval: '1m' | '5m' | '15m' = '1m',
    limit = 100,
    productType?: string
  ): Promise<Candle[]> {
    const cacheKey = `${symbol}:${interval}`;
    const cached = this.cache.get(cacheKey);

    // Return cache if fresh (within 30 seconds for 1m candles)
    const maxAge = interval === '1m' ? 30000 : interval === '5m' ? 60000 : 120000;
    if (cached && Date.now() - cached.lastUpdate < maxAge) {
      return cached.candles;
    }

    // Fetch from REST API
    try {
      const granularity = interval === '1m' ? '1m' : interval === '5m' ? '5m' : '15m';
      const path = productType
        ? '/api/v2/mix/market/candles'
        : '/api/v2/spot/market/candles';

      const params: Record<string, string> = {
        symbol,
        granularity,
        limit: String(limit),
      };
      if (productType) {
        params.productType = productType;
      }

      const response = await this.client.publicGet<string[][]>(path, params);
      const candles: Candle[] = (response.data || []).map(this.parseCandle).reverse();

      this.cache.set(cacheKey, { candles, lastUpdate: Date.now() });
      return candles;
    } catch (error) {
      logger.warn('获取 K线失败', { symbol, interval, error: String(error) });
      return cached?.candles || [];
    }
  }

  /**
   * 获取最新指标
   */
  async getLatestIndicators(
    symbol: string,
    productType?: string
  ): Promise<IndicatorResult> {
    const cacheKey = `indicators:${symbol}`;
    const cached = this.indicatorCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 15000) {
      return cached.result;
    }

    const candles = await this.getCandles(symbol, '5m', 100, productType);
    const result = calcAllIndicators(candles);

    this.indicatorCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }

  /**
   * 获取市场状态
   */
  async getMarketRegime(
    symbol: string,
    productType?: string
  ): Promise<MarketRegimeResult> {
    const candles = await this.getCandles(symbol, '5m', 100, productType);
    return detectMarketRegime(candles);
  }

  private parseCandle(raw: string[]): Candle {
    return {
      timestamp: parseInt(raw[0]),
      open: parseFloat(raw[1]),
      high: parseFloat(raw[2]),
      low: parseFloat(raw[3]),
      close: parseFloat(raw[4]),
      volume: parseFloat(raw[5]),
    };
  }

  private handleCandleUpdate(cacheKey: string, data: unknown[]): void {
    const cached = this.cache.get(cacheKey);
    if (!cached) return;

    for (const item of data) {
      const raw = item as string[];
      const candle = this.parseCandle(raw);

      // Update or append
      const lastIdx = cached.candles.length - 1;
      if (lastIdx >= 0 && cached.candles[lastIdx].timestamp === candle.timestamp) {
        cached.candles[lastIdx] = candle;
      } else {
        cached.candles.push(candle);
        if (cached.candles.length > MAX_CANDLES) {
          cached.candles.shift();
        }
      }
    }
    cached.lastUpdate = Date.now();
  }
}
