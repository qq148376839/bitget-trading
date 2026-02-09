/**
 * 合约账户服务
 * 提供合约账户余额、权益查询
 */

import { BitgetClientService } from './bitget-client.service';
import { FuturesAccount, ProductType } from '../types/futures.types';
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
   * 注意：返回值沿用内部类型 single_hold / double_hold 便于向后兼容
   */
  async getHoldMode(productType: ProductType): Promise<HoldMode> {
    try {
      const response = await this.client.get<{ posMode: string }>(
        '/api/v2/mix/account/position-mode',
        { productType }
      );
      const posMode = response.data?.posMode;
      logger.info('持仓模式 API 原始返回', { posMode, rawData: JSON.stringify(response.data) });
      if (posMode === 'hedge_mode') return 'double_hold';
      if (posMode === 'one_way_mode') return 'single_hold';
      // 兼容旧字段格式
      const raw = response.data as unknown as Record<string, string>;
      if (raw?.holdMode === 'double_hold') return 'double_hold';
      logger.warn('无法识别持仓模式，默认双向持仓（更安全，确保 tradeSide 始终发送）', { rawData: JSON.stringify(response.data) });
      return 'double_hold';
    } catch (error) {
      logger.warn('持仓模式查询失败，默认双向持仓', { error: String(error) });
      // 默认双向持仓（更安全，确保 tradeSide 始终发送 — 因为历史测试中 tradeSide:'open' 是可用的）
      return 'double_hold';
    }
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
