/**
 * 资金管理服务
 * 负责账户资产查询和资金分配
 */

import { BitgetClientService } from './bitget-client.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('capital-manager');

export interface AccountAsset {
  coin: string;
  available: string;
  frozen: string;
  locked: string;
  limitAvailable: string;
  uTime: string;
}

export class CapitalManagerService {
  private client: BitgetClientService;

  constructor() {
    this.client = BitgetClientService.getInstance();
  }

  /**
   * 获取账户资产
   */
  async getAccountAssets(coin?: string): Promise<AccountAsset[]> {
    const params: Record<string, string> = {};
    if (coin) params.coin = coin;

    const response = await this.client.get<AccountAsset[]>(
      '/api/v2/spot/account/assets',
      Object.keys(params).length > 0 ? params : undefined
    );

    logger.debug('获取账户资产', {
      coin,
      count: response.data.length,
    });

    return response.data;
  }

  /**
   * 获取指定币种的可用余额
   */
  async getAvailableBalance(coin: string): Promise<string> {
    const assets = await this.getAccountAssets(coin);
    const asset = assets.find((a) => a.coin === coin);
    return asset?.available || '0';
  }

  /**
   * 检查资金是否充足
   */
  async checkFundsAvailable(
    coin: string,
    requiredAmount: string
  ): Promise<boolean> {
    const available = await this.getAvailableBalance(coin);
    return Number(available) >= Number(requiredAmount);
  }
}
