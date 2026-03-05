/**
 * 合约账户服务
 * 提供合约账户余额、权益查询
 */

import { BitgetClientService } from './bitget-client.service';
import { AccountTypeDetectorService } from './account-type-detector.service';
import { getBitgetConfig } from '../config/bitget';
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
      logger.warn('position-mode API 查询失败', { error: String(error) });
    }

    // 3. 从持仓列表推断
    try {
      return await this.inferHoldModeFromPositions(productType);
    } catch (error) {
      logger.warn('从持仓列表推断持仓模式失败', { error: String(error) });
    }

    // 4. position-mode API 404 且无持仓 → 尝试设置单向持仓
    //    实盘和模拟盘均适用：避免默认双向导致 40774 错误
    try {
      return await this.ensureOneWayMode(productType);
    } catch (error) {
      logger.warn('设置单向持仓模式失败', { error: String(error) });
    }

    // 5. 所有方法失败 → 默认单向持仓（实盘大多数账户为单向，避免发送 tradeSide 导致 40774）
    logger.warn('所有持仓模式检测方法失败，默认单向持仓');
    return 'single_hold';
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
   * 确保使用单向持仓模式
   * position-mode API 404 且无持仓数据时调用，适用于实盘和模拟盘
   */
  private async ensureOneWayMode(productType: ProductType): Promise<HoldMode> {
    try {
      await this.client.post<{ posMode: string }>(
        '/api/v2/mix/account/set-position-mode',
        { productType, posMode: 'one_way_mode' }
      );
      logger.info('已设置为单向持仓模式');
      return 'single_hold';
    } catch (error) {
      // 40920 = 有持仓/挂单无法切换，检查现有持仓的 posMode
      const errMsg = String(error);
      if (errMsg.includes('40920')) {
        logger.info('有持仓无法切换模式，从持仓推断');
        // 有持仓，看当前 posMode
        const response = await this.client.get<FuturesPosition[]>(
          '/api/v2/mix/position/all-position',
          { productType }
        );
        const positions = response.data || [];
        if (positions.length > 0 && positions[0].posMode === 'one_way_mode') {
          return 'single_hold';
        }
        // 已在 hedge_mode 且有持仓无法切换 — 尝试用 close-positions 平仓后再切
        logger.warn('处于 hedge_mode 且有持仓，将尝试平仓后切换模式');
        for (const pos of positions) {
          if (parseFloat(pos.total) > 0) {
            try {
              await this.client.post('/api/v2/mix/order/close-positions', {
                symbol: pos.symbol,
                productType,
                holdSide: pos.holdSide,
              });
              logger.info('平仓成功', { symbol: pos.symbol, holdSide: pos.holdSide });
            } catch (closeErr) {
              logger.warn('平仓失败', { symbol: pos.symbol, error: String(closeErr) });
            }
          }
        }
        // 等待平仓生效
        await new Promise(r => setTimeout(r, 2000));
        // 重试切换
        await this.client.post('/api/v2/mix/account/set-position-mode', {
          productType, posMode: 'one_way_mode',
        });
        logger.info('平仓后成功切换为单向持仓模式');
        return 'single_hold';
      }
      throw error;
    }
  }

  /**
   * 从持仓列表推断持仓模式
   * holdSide='net' → one_way_mode（单向持仓）
   * holdSide='long'/'short' → hedge_mode（双向持仓）
   */
  private async inferHoldModeFromPositions(productType: ProductType): Promise<HoldMode> {
    // 不传 marginCoin，获取所有币种持仓，推断更可靠
    const response = await this.client.get<FuturesPosition[]>(
      '/api/v2/mix/position/all-position',
      { productType }
    );
    const positions = response.data || [];
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
