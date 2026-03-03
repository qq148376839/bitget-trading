/**
 * 合约账户服务
 * 提供合约账户余额、权益查询
 */

import { BitgetClientService } from './bitget-client.service';
import { AccountTypeDetectorService } from './account-type-detector.service';
import { FuturesAccount, FuturesPosition, ProductType } from '../types/futures.types';
import { createLogger } from '../utils/logger';

const logger = createLogger('futures-account');

/** 持仓模式: single_hold = 单向持仓, double_hold = 双向持仓 */
export type HoldMode = 'single_hold' | 'double_hold';

export class FuturesAccountService {
  private client: BitgetClientService;

  constructor() {
    this.client = BitgetClientService.getInstance();
  }

  /**
   * 获取合约账户信息列表
   */
  async getAccountInfo(productType: ProductType): Promise<FuturesAccount[]> {
    const response = await this.client.get<FuturesAccount[]>(
      '/api/v2/mix/account/accounts',
      { productType }
    );
    return response.data || [];
  }

  /**
   * 查询持仓模式
   * one_way_mode = 单向持仓（不需要 tradeSide）
   * hedge_mode = 双向持仓（需要 tradeSide: open/close）
   *
   * 检测策略（实盘 + 模拟盘通用）：
   * 1. UTA 账户 → single_hold
   * 2. GET /api/v2/mix/account/position-mode → 解析 posMode
   * 3. 若步骤 2 失败 → 从持仓列表 holdSide 推断
   * 4. 所有方法失败 → 默认 double_hold（安全策略）
   *
   * 注意：返回值沿用内部类型 single_hold / double_hold 便于向后兼容
   */
  async getHoldMode(productType: ProductType): Promise<HoldMode> {
    // 1. UTA 账户持仓模式处理
    const detector = AccountTypeDetectorService.getInstance();
    if (detector.isUTA()) {
      logger.info('UTA 账户，使用单向持仓模式');
      return 'single_hold';
    }

    // 2. 通过 position-mode API 查询（实盘 + 模拟盘通用）
    try {
      return await this.queryPositionModeAPI(productType);
    } catch (error) {
      logger.warn('position-mode API 查询失败，尝试从持仓列表推断', { error: String(error) });
    }

    // 3. 从持仓列表推断
    try {
      return await this.inferHoldModeFromPositions(productType);
    } catch (error) {
      logger.warn('从持仓列表推断持仓模式失败', { error: String(error) });
    }

    // 4. 所有方法失败 → 默认双向持仓（更安全，确保 tradeSide 始终发送，避免 40774 错误）
    logger.warn('所有持仓模式检测方法失败，默认双向持仓');
    return 'double_hold';
  }

  /**
   * 查询所有持仓（公开方法，策略引擎也可调用）
   */
  async getPositions(productType: ProductType, marginCoin = 'USDT'): Promise<FuturesPosition[]> {
    const response = await this.client.get<FuturesPosition[]>(
      '/api/v2/mix/position/all-position',
      { productType, marginCoin }
    );
    return response.data || [];
  }

  /**
   * 通过 position-mode API 查询持仓模式
   */
  private async queryPositionModeAPI(productType: ProductType): Promise<HoldMode> {
    const response = await this.client.get<{ posMode: string }>(
      '/api/v2/mix/account/position-mode',
      { productType }
    );
    const posMode = response.data?.posMode;
    logger.info('持仓模式 API 返回', { posMode, rawData: JSON.stringify(response.data) });
    if (posMode === 'hedge_mode') return 'double_hold';
    if (posMode === 'one_way_mode') return 'single_hold';
    // 兼容旧字段格式
    const raw = response.data as unknown as Record<string, string>;
    if (raw?.holdMode === 'double_hold') return 'double_hold';
    // 无法识别 → 抛出让上层 fallback
    throw new Error(`无法识别 posMode: ${posMode}`);
  }

  /**
   * 从持仓列表推断持仓模式
   * holdSide='net' → one_way_mode（单向持仓）
   * holdSide='long'/'short' → hedge_mode（双向持仓）
   */
  private async inferHoldModeFromPositions(productType: ProductType): Promise<HoldMode> {
    const positions = await this.getPositions(productType);
    if (positions.length === 0) {
      // 无持仓，无法推断 → 抛出让上层使用默认值
      throw new Error('无持仓数据，无法推断持仓模式');
    }

    // 检查 posMode 字段（部分 API 返回中包含）
    const firstPosMode = positions[0].posMode;
    if (firstPosMode === 'one_way_mode') {
      logger.info('从持仓列表 posMode 字段推断：单向持仓', { posMode: firstPosMode });
      return 'single_hold';
    }
    if (firstPosMode === 'hedge_mode') {
      logger.info('从持仓列表 posMode 字段推断：双向持仓', { posMode: firstPosMode });
      return 'double_hold';
    }

    // 从 holdSide 推断
    const holdSides = positions.map(p => p.holdSide);
    if (holdSides.includes('net')) {
      logger.info('从持仓列表 holdSide 推断：单向持仓', { holdSides });
      return 'single_hold';
    }
    if (holdSides.includes('long') || holdSides.includes('short')) {
      logger.info('从持仓列表 holdSide 推断：双向持仓', { holdSides });
      return 'double_hold';
    }

    throw new Error(`无法从持仓 holdSide 推断持仓模式: ${JSON.stringify(holdSides)}`);
  }

  /**
   * 获取指定币种的可用余额
   */
  async getAvailableBalance(
    productType: ProductType,
    marginCoin = 'USDT'
  ): Promise<string> {
    const accounts = await this.getAccountInfo(productType);
    const account = accounts.find(a => a.marginCoin === marginCoin);
    if (!account) {
      return '0';
    }
    return account.available;
  }

  /**
   * 获取账户权益
   */
  async getAccountEquity(
    productType: ProductType,
    marginCoin = 'USDT'
  ): Promise<{ equity: string; available: string; unrealizedPL: string }> {
    const accounts = await this.getAccountInfo(productType);
    const account = accounts.find(a => a.marginCoin === marginCoin);
    if (!account) {
      return { equity: '0', available: '0', unrealizedPL: '0' };
    }
    return {
      equity: account.accountEquity,
      available: account.available,
      unrealizedPL: account.unrealizedPL,
    };
  }
}
