/**
 * 统一账户服务接口
 */

export interface IAccountService {
  getAvailableBalance(marginCoin?: string): Promise<string>;
  getAccountEquity(marginCoin?: string): Promise<{
    equity: string;
    available: string;
    unrealizedPL: string;
  }>;
}
