/**
 * 统一行情数据服务接口
 */

import { UnifiedTickerInfo } from '../../types/trading.types';

export interface IMarketDataService {
  getTicker(symbol: string): Promise<UnifiedTickerInfo>;
  getBestBid(symbol: string): Promise<string>;
  getBestAsk(symbol: string): Promise<string>;
}
