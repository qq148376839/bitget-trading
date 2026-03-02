/**
 * 账户类型检测服务
 * 检测用户账户是 UTA（统一交易账户）还是经典账户
 * 缓存结果，会话生命周期内不重复检测
 */

import { BitgetClientService } from './bitget-client.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('account-type-detector');

export type AccountType = 'uta' | 'classic';

export class AccountTypeDetectorService {
  private static instance: AccountTypeDetectorService | null = null;
  private accountType: AccountType | null = null;
  private detecting = false;

  private constructor() {}

  static getInstance(): AccountTypeDetectorService {
    if (!AccountTypeDetectorService.instance) {
      AccountTypeDetectorService.instance = new AccountTypeDetectorService();
    }
    return AccountTypeDetectorService.instance;
  }

  /**
   * 检测账户类型
   * 尝试 UTA 端点，成功=UTA，失败=经典
   */
  async detect(): Promise<AccountType> {
    if (this.accountType) return this.accountType;
    if (this.detecting) {
      // Wait for ongoing detection
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.accountType || 'classic';
    }

    this.detecting = true;
    try {
      const client = BitgetClientService.getInstance();

      // Try UTA unified account info endpoint
      // UTA accounts support /api/v2/account/info
      try {
        await client.get('/api/v2/account/info');
        this.accountType = 'uta';
        logger.info('账户类型检测结果: UTA（统一交易账户）');
      } catch {
        // If UTA endpoint fails, it's a classic account
        this.accountType = 'classic';
        logger.info('账户类型检测结果: 经典账户');
      }
    } catch (error) {
      logger.warn('账户类型检测失败，默认经典账户', { error: String(error) });
      this.accountType = 'classic';
    } finally {
      this.detecting = false;
    }

    return this.accountType;
  }

  /**
   * 获取已检测的账户类型（不触发检测）
   */
  getAccountType(): AccountType | null {
    return this.accountType;
  }

  /**
   * 是否为 UTA 账户
   */
  isUTA(): boolean {
    return this.accountType === 'uta';
  }

  /**
   * 重置缓存（用于凭证变更后重新检测）
   */
  reset(): void {
    this.accountType = null;
  }
}
