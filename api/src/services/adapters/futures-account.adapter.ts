/**
 * 合约账户适配器
 * 将 FuturesAccountService 包装为 IAccountService
 * 支持 UTA/经典账户自动路由
 */

import { IAccountService } from '../interfaces/i-account.service';
import { FuturesAccountService } from '../futures-account.service';
import { AccountTypeDetectorService } from '../account-type-detector.service';
import { BitgetClientService } from '../bitget-client.service';
import { ProductType } from '../../types/futures.types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('futures-account-adapter');

export class FuturesAccountAdapter implements IAccountService {
  private service: FuturesAccountService;
  private productType: ProductType;

  constructor(productType: ProductType) {
    this.service = new FuturesAccountService();
    this.productType = productType;
  }

  async getAvailableBalance(marginCoin = 'USDT'): Promise<string> {
    const detector = AccountTypeDetectorService.getInstance();
    if (detector.isUTA()) {
      return this.getUTABalance(marginCoin);
    }
    return this.service.getAvailableBalance(this.productType, marginCoin);
  }

  async getAccountEquity(marginCoin = 'USDT'): Promise<{
    equity: string;
    available: string;
    unrealizedPL: string;
  }> {
    const detector = AccountTypeDetectorService.getInstance();
    if (detector.isUTA()) {
      return this.getUTAEquity(marginCoin);
    }
    return this.service.getAccountEquity(this.productType, marginCoin);
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
      logger.warn('UTA 余额查询失败，回退到经典接口', { error: String(error) });
      return this.service.getAvailableBalance(this.productType, marginCoin);
    }
  }

  private async getUTAEquity(marginCoin: string): Promise<{
    equity: string;
    available: string;
    unrealizedPL: string;
  }> {
    try {
      const client = BitgetClientService.getInstance();
      const response = await client.get<Array<Record<string, string>>>(
        '/api/v2/account/funding-assets',
        { coin: marginCoin }
      );
      const asset = response.data?.[0];
      if (asset) {
        return {
          equity: asset.equity || asset.available || '0',
          available: asset.available || '0',
          unrealizedPL: asset.unrealizedPL || '0',
        };
      }
    } catch (error) {
      logger.warn('UTA 权益查询失败，回退到经典接口', { error: String(error) });
    }
    return this.service.getAccountEquity(this.productType, marginCoin);
  }
}
