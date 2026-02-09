/**
 * 现货交易对规格服务
 * 三层缓存：内存(1h TTL) -> DB -> API
 */

import { BitgetClientService } from './bitget-client.service';
import { getPool } from '../config/database';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { InstrumentSpec } from '../types/trading.types';

const logger = createLogger('spot-spec');
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  spec: InstrumentSpec;
  fetchedAt: number;
}

interface BitgetSpotSymbol {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  pricePrecision: string;
  quantityPrecision: string;
  minTradeAmount: string;
  maxTradeAmount: string;
  takerFeeRate: string;
  makerFeeRate: string;
  status: string;
}

export class SpotSpecService {
  private static instance: SpotSpecService | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private client: BitgetClientService;

  private constructor() {
    this.client = BitgetClientService.getInstance();
  }

  static getInstance(): SpotSpecService {
    if (!SpotSpecService.instance) {
      SpotSpecService.instance = new SpotSpecService();
    }
    return SpotSpecService.instance;
  }

  /**
   * 获取现货规格（三层缓存）
   */
  async getSpec(symbol: string): Promise<InstrumentSpec> {
    // 1. 内存缓存
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.spec;
    }

    // 2. DB 缓存
    const dbSpec = await this.loadFromDb(symbol);
    if (dbSpec) {
      this.cache.set(symbol, { spec: dbSpec, fetchedAt: Date.now() });
      return dbSpec;
    }

    // 3. API 获取
    return this.refreshSpec(symbol);
  }

  /**
   * 强制刷新规格（API -> DB -> 内存）
   */
  async refreshSpec(symbol: string): Promise<InstrumentSpec> {
    const symbols = await this.fetchAllSymbols();
    const raw = symbols.find(s => s.symbol === symbol);

    if (!raw) {
      throw new AppError(
        ErrorCode.INSTRUMENT_SPEC_NOT_FOUND,
        `未找到现货交易对规格: ${symbol}`,
        { symbol },
        404
      );
    }

    const spec = this.toInstrumentSpec(raw);
    await this.saveToDb(spec, raw);
    this.cache.set(symbol, { spec, fetchedAt: Date.now() });

    logger.info('现货规格已刷新', {
      symbol,
      pricePlace: spec.pricePlace,
      volumePlace: spec.volumePlace,
    });

    return spec;
  }

  /**
   * 从交易所获取所有现货交易对
   */
  async fetchAllSymbols(): Promise<BitgetSpotSymbol[]> {
    const response = await this.client.publicGet<BitgetSpotSymbol[]>(
      '/api/v2/spot/public/symbols'
    );
    return response.data || [];
  }

  /**
   * 列出可用的现货交易对（仅 USDT 计价，最多 50 条）
   */
  async listAvailable(search?: string): Promise<InstrumentSpec[]> {
    const symbols = await this.fetchAllSymbols();
    let filtered = symbols.filter(s => s.status === 'online' && s.quoteCoin === 'USDT');

    if (search) {
      const searchUpper = search.toUpperCase();
      filtered = filtered.filter(s =>
        s.symbol.includes(searchUpper) ||
        s.baseCoin.includes(searchUpper)
      );
    }

    return filtered.slice(0, 50).map(s => this.toInstrumentSpec(s));
  }

  private toInstrumentSpec(raw: BitgetSpotSymbol): InstrumentSpec {
    return {
      tradingType: 'spot',
      symbol: raw.symbol,
      baseCoin: raw.baseCoin,
      quoteCoin: raw.quoteCoin,
      pricePlace: parseInt(raw.pricePrecision, 10),
      volumePlace: parseInt(raw.quantityPrecision, 10),
      minTradeNum: parseFloat(raw.minTradeAmount),
      sizeMultiplier: 1,
      makerFeeRate: parseFloat(raw.makerFeeRate),
      takerFeeRate: parseFloat(raw.takerFeeRate),
    };
  }

  private async loadFromDb(symbol: string): Promise<InstrumentSpec | null> {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT symbol, base_coin, quote_coin, price_place, volume_place,
                min_trade_num, maker_fee_rate, taker_fee_rate
         FROM spot_specs WHERE symbol = $1`,
        [symbol]
      );

      if (rows.length === 0) return null;
      const row = rows[0];
      return {
        tradingType: 'spot',
        symbol: row.symbol,
        baseCoin: row.base_coin,
        quoteCoin: row.quote_coin,
        pricePlace: row.price_place,
        volumePlace: row.volume_place,
        minTradeNum: parseFloat(row.min_trade_num),
        sizeMultiplier: 1,
        makerFeeRate: parseFloat(row.maker_fee_rate),
        takerFeeRate: parseFloat(row.taker_fee_rate),
      };
    } catch (error) {
      logger.warn('从 DB 加载现货规格失败', { symbol, error: String(error) });
      return null;
    }
  }

  private async saveToDb(spec: InstrumentSpec, raw: BitgetSpotSymbol): Promise<void> {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO spot_specs (symbol, base_coin, quote_coin, price_place, volume_place,
          min_trade_num, maker_fee_rate, taker_fee_rate, raw_data, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (symbol) DO UPDATE SET
           base_coin = EXCLUDED.base_coin, quote_coin = EXCLUDED.quote_coin,
           price_place = EXCLUDED.price_place, volume_place = EXCLUDED.volume_place,
           min_trade_num = EXCLUDED.min_trade_num,
           maker_fee_rate = EXCLUDED.maker_fee_rate, taker_fee_rate = EXCLUDED.taker_fee_rate,
           raw_data = EXCLUDED.raw_data, fetched_at = NOW()`,
        [spec.symbol, spec.baseCoin, spec.quoteCoin, spec.pricePlace, spec.volumePlace,
         spec.minTradeNum, spec.makerFeeRate, spec.takerFeeRate, JSON.stringify(raw)]
      );
    } catch (error) {
      logger.warn('保存现货规格到 DB 失败', { symbol: spec.symbol, error: String(error) });
    }
  }
}
