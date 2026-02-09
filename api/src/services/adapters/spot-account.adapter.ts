/**
 * 现货账户适配器
 * 将 CapitalManagerService 包装为 IAccountService
 */

import { IAccountService } from '../interfaces/i-account.service';
import { CapitalManagerService } from '../capital-manager.service';

export class SpotAccountAdapter implements IAccountService {
  private service: CapitalManagerService;

  constructor() {
    this.service = new CapitalManagerService();
  }

  async getAvailableBalance(marginCoin = 'USDT'): Promise<string> {
    return this.service.getAvailableBalance(marginCoin);
  }

  async getAccountEquity(marginCoin = 'USDT'): Promise<{
    equity: string;
    available: string;
    unrealizedPL: string;
  }> {
    // 现货没有未实现盈亏，equity = available
    const available = await this.service.getAvailableBalance(marginCoin);
    return {
      equity: available,
      available,
      unrealizedPL: '0',
    };
  }
}
