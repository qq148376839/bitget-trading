/**
 * 合约规格服务
 * 三层缓存：内存(1h TTL) -> DB -> API
 */

import { BitgetClientService } from './bitget-client.service';
import { getPool } from '../config/database';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';
import {
  BitgetContractSpec,
  ContractSpecInfo,
  ProductType,
} from '../types/futures.types';

const logger = createLogger('contract-spec');

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  spec: ContractSpecInfo;
  fetchedAt: number;
}

export class ContractSpecService {
  private static instance: ContractSpecService | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private client: BitgetClientService;

  private constructor() {
    this.client = BitgetClientService.getInstance();
  }

  static getInstance(): ContractSpecService {
    if (!ContractSpecService.instance) {
      ContractSpecService.instance = new ContractSpecService();
    }
    return ContractSpecService.instance;
  }

  private cacheKey(symbol: string, productType: ProductType): string {
    return `${symbol}:${productType}`;
  }

  /**
   * 获取合约规格（三层缓存）
   */
  async getSpec(symbol: string, productType: ProductType): Promise<ContractSpecInfo> {
    const key = this.cacheKey(symbol, productType);

    // 1. 内存缓存
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.spec;
    }

    // 2. DB 缓存
    const dbSpec = await this.loadFromDb(symbol, productType);
    if (dbSpec) {
      this.cache.set(key, { spec: dbSpec, fetchedAt: Date.now() });
      return dbSpec;
    }

    // 3. API 获取
    return this.refreshSpec(symbol, productType);
  }

  /**
   * 强制刷新规格（API -> DB -> 内存）
   */
  async refreshSpec(symbol: string, productType: ProductType): Promise<ContractSpecInfo> {
    const contracts = await this.fetchAllContracts(productType);
    const raw = contracts.find(c => c.symbol === symbol);

    if (!raw) {
      throw new AppError(
        ErrorCode.CONTRACT_SPEC_NOT_FOUND,
        `未找到合约规格: ${symbol} (${productType})`,
        { symbol, productType },
        404
      );
    }

    const spec = this.toSpecInfo(raw);
    await this.saveToDb(spec, productType, raw);
    this.cache.set(this.cacheKey(symbol, productType), { spec, fetchedAt: Date.now() });

    logger.info('合约规格已刷新', {
      symbol,
      pricePlace: spec.pricePlace,
      volumePlace: spec.volumePlace,
      minTradeNum: spec.minTradeNum,
    });

    return spec;
  }

  /**
   * 从交易所获取所有合约
   */
  async fetchAllContracts(productType: ProductType): Promise<BitgetContractSpec[]> {
    const response = await this.client.publicGet<BitgetContractSpec[]>(
      '/api/v2/mix/market/contracts',
      { productType }
    );
    return response.data || [];
  }

  private toSpecInfo(raw: BitgetContractSpec): ContractSpecInfo {
    return {
      symbol: raw.symbol,
      baseCoin: raw.baseCoin,
      quoteCoin: raw.quoteCoin,
      pricePlace: parseInt(raw.pricePlace, 10),
      volumePlace: parseInt(raw.volumePlace, 10),
      minTradeNum: parseFloat(raw.minTradeNum),
      sizeMultiplier: parseFloat(raw.sizeMultiplier),
      makerFeeRate: parseFloat(raw.makerFeeRate),
      takerFeeRate: parseFloat(raw.takerFeeRate),
    };
  }

  private async loadFromDb(symbol: string, productType: ProductType): Promise<ContractSpecInfo | null> {
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT symbol, base_coin, quote_coin, price_place, volume_place,
                min_trade_num, size_multiplier, maker_fee_rate, taker_fee_rate
         FROM contract_specs
         WHERE symbol = $1 AND product_type = $2`,
        [symbol, productType]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        symbol: row.symbol,
        baseCoin: row.base_coin,
        quoteCoin: row.quote_coin,
        pricePlace: row.price_place,
        volumePlace: row.volume_place,
        minTradeNum: parseFloat(row.min_trade_num),
        sizeMultiplier: parseFloat(row.size_multiplier),
        makerFeeRate: parseFloat(row.maker_fee_rate),
        takerFeeRate: parseFloat(row.taker_fee_rate),
      };
    } catch (error) {
      logger.warn('从 DB 加载合约规格失败', { symbol, error: String(error) });
      return null;
    }
  }

  private async saveToDb(
    spec: ContractSpecInfo,
    productType: ProductType,
    raw: BitgetContractSpec
  ): Promise<void> {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO contract_specs (symbol, product_type, base_coin, quote_coin,
          price_place, volume_place, min_trade_num, size_multiplier,
          maker_fee_rate, taker_fee_rate, raw_data, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (symbol, product_type)
         DO UPDATE SET
           base_coin = EXCLUDED.base_coin,
           quote_coin = EXCLUDED.quote_coin,
           price_place = EXCLUDED.price_place,
           volume_place = EXCLUDED.volume_place,
           min_trade_num = EXCLUDED.min_trade_num,
           size_multiplier = EXCLUDED.size_multiplier,
           maker_fee_rate = EXCLUDED.maker_fee_rate,
           taker_fee_rate = EXCLUDED.taker_fee_rate,
           raw_data = EXCLUDED.raw_data,
           fetched_at = NOW()`,
        [
          spec.symbol, productType, spec.baseCoin, spec.quoteCoin,
          spec.pricePlace, spec.volumePlace, spec.minTradeNum, spec.sizeMultiplier,
          spec.makerFeeRate, spec.takerFeeRate, JSON.stringify(raw),
        ]
      );
    } catch (error) {
      logger.warn('保存合约规格到 DB 失败', { symbol: spec.symbol, error: String(error) });
    }
  }
}
