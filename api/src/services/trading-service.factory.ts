/**
 * 交易服务工厂
 * 根据 tradingType 创建对应的服务组合
 * 支持 WebSocket 或 REST 行情源
 */

import { TradingType } from '../types/trading.types';
import { ProductType, MarginMode } from '../types/futures.types';
import { IOrderService } from './interfaces/i-order.service';
import { IMarketDataService } from './interfaces/i-market-data.service';
import { IAccountService } from './interfaces/i-account.service';
import { FuturesOrderAdapter } from './adapters/futures-order.adapter';
import { FuturesMarketDataAdapter } from './adapters/futures-market-data.adapter';
import { FuturesAccountAdapter } from './adapters/futures-account.adapter';
import { SpotOrderAdapter } from './adapters/spot-order.adapter';
import { SpotMarketDataAdapter } from './adapters/spot-market-data.adapter';
import { SpotAccountAdapter } from './adapters/spot-account.adapter';
import { RealtimeMarketDataService } from './realtime-market-data.service';

export interface TradingServices {
  orderService: IOrderService;
  marketDataService: IMarketDataService;
  accountService: IAccountService;
}

export interface TradingServiceFactoryConfig {
  tradingType: TradingType;
  productType?: ProductType;
  marginMode?: MarginMode;
  marginCoin?: string;
  useWebSocket?: boolean;
  symbol?: string;
}

export function createTradingServices(config: TradingServiceFactoryConfig): TradingServices {
  if (config.tradingType === 'futures') {
    const productType = config.productType || 'USDT-FUTURES';
    const marginMode = config.marginMode || 'crossed';
    const marginCoin = config.marginCoin || 'USDT';

    let marketDataService: IMarketDataService;
    if (config.useWebSocket && config.symbol) {
      const rtService = new RealtimeMarketDataService('USDT-FUTURES', productType);
      rtService.subscribe(config.symbol);
      marketDataService = rtService;
    } else {
      marketDataService = new FuturesMarketDataAdapter(productType);
    }

    return {
      orderService: new FuturesOrderAdapter(productType, marginMode, marginCoin),
      marketDataService,
      accountService: new FuturesAccountAdapter(productType),
    };
  }

  // spot
  let marketDataService: IMarketDataService;
  if (config.useWebSocket && config.symbol) {
    const rtService = new RealtimeMarketDataService('SPOT');
    rtService.subscribe(config.symbol);
    marketDataService = rtService;
  } else {
    marketDataService = new SpotMarketDataAdapter();
  }

  return {
    orderService: new SpotOrderAdapter(),
    marketDataService,
    accountService: new SpotAccountAdapter(),
  };
}
