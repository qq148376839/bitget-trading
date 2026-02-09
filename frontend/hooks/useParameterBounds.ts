'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import type { StrategyType, TradingType } from '@/lib/types';

export interface ParameterBounds {
  priceSpread?: { min: number; recommended: number; max: number };
  orderAmountUsdt?: { min: number; max: number };
  gridCount?: { min: number; max: number };
  upperPrice?: { min: number; max: number };
  lowerPrice?: { min: number; max: number };
}

export function useParameterBounds(
  symbol: string | undefined,
  tradingType: TradingType = 'futures',
  strategyType: StrategyType = 'scalping'
) {
  const { data, error } = useSWR<ParameterBounds>(
    symbol ? `/api/strategy/bounds?symbol=${symbol}&tradingType=${tradingType}&strategyType=${strategyType}` : null,
    swrFetcher,
    { refreshInterval: 60000 }
  );

  return { bounds: data || null, error };
}
