/**
 * 统一交易对规格服务（门面模式）
 * 根据 tradingType 委派到 ContractSpecService 或 SpotSpecService
 */

import { ContractSpecService } from './contract-spec.service';
import { SpotSpecService } from './spot-spec.service';
import { InstrumentSpec, TradingType } from '../types/trading.types';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('instrument-spec');

/** 热门交易对预设 */
const HOT_PAIRS: Record<TradingType, string[]> = {
  futures: [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'BNBUSDT', 'ADAUSDT', 'AVAXUSDT',
  ],
  spot: [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT',
  ],
};

export class InstrumentSpecService {
  private static instance: InstrumentSpecService | null = null;
  private contractSpec: ContractSpecService;
  private spotSpec: SpotSpecService;

  private constructor() {
    this.contractSpec = ContractSpecService.getInstance();
    this.spotSpec = SpotSpecService.getInstance();
  }

  static getInstance(): InstrumentSpecService {
    if (!InstrumentSpecService.instance) {
      InstrumentSpecService.instance = new InstrumentSpecService();
    }
    return InstrumentSpecService.instance;
  }

  /**
   * 获取单个交易对规格
   */
  async getSpec(symbol: string, tradingType: TradingType): Promise<InstrumentSpec> {
    if (tradingType === 'spot') {
      return this.spotSpec.getSpec(symbol);
    }

    const contractInfo = await this.contractSpec.getSpec(symbol, 'USDT-FUTURES');
    return this.contractToInstrument(contractInfo);
  }

  /**
   * 搜索可用交易对
   */
  async listAvailable(tradingType: TradingType, search?: string): Promise<InstrumentSpec[]> {
    if (tradingType === 'spot') {
      return this.spotSpec.listAvailable(search);
    }

    const contracts = await this.contractSpec.fetchAllContracts('USDT-FUTURES');
    let filtered = contracts.filter(c => c.symbolStatus === 'normal');

    if (search) {
      const searchUpper = search.toUpperCase();
      filtered = filtered.filter(c =>
        c.symbol.includes(searchUpper) ||
        c.baseCoin.includes(searchUpper)
      );
    }

    return filtered.slice(0, 50).map(c => ({
      tradingType: 'futures' as TradingType,
      symbol: c.symbol,
      baseCoin: c.baseCoin,
      quoteCoin: c.quoteCoin,
      pricePlace: parseInt(c.pricePlace, 10),
      volumePlace: parseInt(c.volumePlace, 10),
      minTradeNum: parseFloat(c.minTradeNum),
      sizeMultiplier: parseFloat(c.sizeMultiplier),
      makerFeeRate: parseFloat(c.makerFeeRate),
      takerFeeRate: parseFloat(c.takerFeeRate),
    }));
  }

  /**
   * 获取热门交易对规格
   */
  async getHotPairs(tradingType: TradingType): Promise<InstrumentSpec[]> {
    const symbols = HOT_PAIRS[tradingType];
    if (!symbols || symbols.length === 0) {
      return [];
    }

    const results: InstrumentSpec[] = [];

    for (const symbol of symbols) {
      try {
        const spec = await this.getSpec(symbol, tradingType);
        results.push(spec);
      } catch (error) {
        logger.warn('获取热门交易对规格失败，跳过', {
          symbol,
          tradingType,
          error: String(error),
        });
      }
    }

    return results;
  }

  /**
   * 将 ContractSpecInfo 转换为统一 InstrumentSpec
   */
  private contractToInstrument(
    info: { symbol: string; baseCoin: string; quoteCoin: string; pricePlace: number; volumePlace: number; minTradeNum: number; sizeMultiplier: number; makerFeeRate: number; takerFeeRate: number }
  ): InstrumentSpec {
    return {
      tradingType: 'futures',
      symbol: info.symbol,
      baseCoin: info.baseCoin,
      quoteCoin: info.quoteCoin,
      pricePlace: info.pricePlace,
      volumePlace: info.volumePlace,
      minTradeNum: info.minTradeNum,
      sizeMultiplier: info.sizeMultiplier,
      makerFeeRate: info.makerFeeRate,
      takerFeeRate: info.takerFeeRate,
    };
  }
}
