/**
 * 合约账户适配器
 * 将 FuturesAccountService 包装为 IAccountService
 */

import { IAccountService } from '../interfaces/i-account.service';
import { FuturesAccountService } from '../futures-account.service';
import { ProductType } from '../../types/futures.types';

export class FuturesAccountAdapter implements IAccountService {
  private service: FuturesAccountService;
  private productType: ProductType;

  constructor(productType: ProductType) {
    this.service = new FuturesAccountService();
    this.productType = productType;
  }

  async getAvailableBalance(marginCoin = 'USDT'): Promise<string> {
    return this.service.getAvailableBalance(this.productType, marginCoin);
  }

  async getAccountEquity(marginCoin = 'USDT'): Promise<{
    equity: string;
    available: string;
    unrealizedPL: string;
  }> {
    return this.service.getAccountEquity(this.productType, marginCoin);
  }
}
