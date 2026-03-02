/**
 * 现货账户适配器
 * 将 CapitalManagerService 包装为 IAccountService
 * 支持 UTA/经典账户自动路由
 */

import { IAccountService } from '../interfaces/i-account.service';
import { CapitalManagerService } from '../capital-manager.service';
import { AccountTypeDetectorService } from '../account-type-detector.service';
import { BitgetClientService } from '../bitget-client.service';
import { createLogger } from '../../utils/logger';

const logger = createLogger('spot-account-adapter');

export class SpotAccountAdapter implements IAccountService {
  private service: CapitalManagerService;

  constructor() {
    this.service = new CapitalManagerService();
  }

  async getAvailableBalance(marginCoin = 'USDT'): Promise<string> {
    const detector = AccountTypeDetectorService.getInstance();
    if (detector.isUTA()) {
      return this.getUTABalance(marginCoin);
    }
    return this.service.getAvailableBalance(marginCoin);
  }

  async getAccountEquity(marginCoin = 'USDT'): Promise<{
    equity: string;
    available: string;
    unrealizedPL: string;
  }> {
    const detector = AccountTypeDetectorService.getInstance();
    if (detector.isUTA()) {
      const available = await this.getUTABalance(marginCoin);
      return { equity: available, available, unrealizedPL: '0' };
    }
    // 现货没有未实现盈亏，equity = available
    const available = await this.service.getAvailableBalance(marginCoin);
    return {
      equity: available,
      available,
      unrealizedPL: '0',
    };
  }

  private async getUTABalance(marginCoin: string): Promise<string> {
    try {
      const client = BitgetClientService.getInstance();
      const response = await client.get<Array<Record<string, string>>>(
        '/api/v2/account/funding-assets',
        { coin: marginCoin }
      );
      const asset = response.data?.[0];
      return asset?.available || '0';
    } catch (error) {
      logger.warn('UTA 现货余额查询失败，回退到经典接口', { error: String(error) });
      return this.service.getAvailableBalance(marginCoin);
    }
  }
}
