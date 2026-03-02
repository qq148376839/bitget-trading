/**
 * 合约账户服务
 * 提供合约账户余额、权益查询
 */

import { BitgetClientService } from './bitget-client.service';
import { AccountTypeDetectorService } from './account-type-detector.service';
import { getBitgetConfig } from '../config/bitget';
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
    // UTA 账户持仓模式处理
    const detector = AccountTypeDetectorService.getInstance();
    if (detector.isUTA()) {
      // UTA 账户默认使用单向持仓
      logger.info('UTA 账户，使用单向持仓模式');
      return 'single_hold';
    }

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
      // 无法识别时默认双向持仓（更安全，确保 tradeSide 始终发送）
      logger.warn('无法识别持仓模式，默认双向持仓', { rawData: JSON.stringify(response.data) });
      return 'double_hold';
    } catch (error) {
      // 模拟盘 position-mode GET API 返回 404，但 SET API 可用
      const { simulated } = getBitgetConfig();
      if (simulated) {
        return this.detectSimulatedHoldMode(productType);
      }
      // 实盘查询失败时默认双向持仓（更安全，确保 tradeSide 始终发送，避免 40774 错误）
      logger.warn('持仓模式查询失败，默认双向持仓', { error: String(error) });
      return 'double_hold';
    }
  }

  /**
   * 模拟盘持仓模式检测（GET API 返回 404，通过 SET API 探测）
   *
   * 策略：尝试设置 one_way_mode（最多重试 2 次应对 502）
   * - 成功 → 使用 single_hold（无 tradeSide）
   * - 失败 40920（有持仓/订单无法切换）→ 使用 double_hold（保守策略，带 tradeSide）
   * - 网络错误（502 等）→ 默认 double_hold（更安全）
   */
  private async detectSimulatedHoldMode(productType: ProductType): Promise<HoldMode> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.client.post('/api/v2/mix/account/set-position-mode', {
          productType,
          posMode: 'one_way_mode',
        });
        logger.info('模拟盘持仓模式已设置为单向持仓（one_way_mode）');
        return 'single_hold';
      } catch (setError) {
        const errMsg = String(setError);
        if (errMsg.includes('40920')) {
          // 有持仓/订单无法切换 → 当前处于某种模式且有仓位
          // 保守使用 double_hold（带 tradeSide），因为：
          // - 如果实际是 hedge_mode，不带 tradeSide 会报 40774
          // - 如果实际是 one_way_mode，带 tradeSide 时 buy+open 被忽略，sell+close 可能 22002 但重试能恢复
          logger.info('模拟盘有持仓无法切换模式，使用双向持仓（保守策略）', { attempt });
          return 'double_hold';
        }
        // 502 等网络错误，重试
        if (attempt < 3) {
          logger.warn('模拟盘设置持仓模式网络错误，重试', { attempt, error: errMsg });
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        // 重试耗尽，默认双向持仓（更安全）
        logger.warn('模拟盘持仓模式检测失败，默认双向持仓', { error: errMsg });
        return 'double_hold';
      }
    }
    return 'double_hold';
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
