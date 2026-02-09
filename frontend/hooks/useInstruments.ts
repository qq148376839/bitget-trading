import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import type { InstrumentSpec, TradingType } from '@/lib/types';

const INSTRUMENT_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useInstruments(tradingType: TradingType, search?: string) {
  const params = new URLSearchParams({ tradingType });
  if (search) params.set('search', search);

  const { data, error, isLoading } = useSWR<InstrumentSpec[]>(
    `/api/instruments?${params.toString()}`,
    swrFetcher,
    { refreshInterval: INSTRUMENT_REFRESH_INTERVAL_MS }
  );

  return { instruments: data || [], error, isLoading };
}

export function useHotInstruments(tradingType: TradingType) {
  const { data, error, isLoading } = useSWR<InstrumentSpec[]>(
    `/api/instruments/hot?tradingType=${tradingType}`,
    swrFetcher,
    { refreshInterval: INSTRUMENT_REFRESH_INTERVAL_MS }
  );

  return { hotInstruments: data || [], error, isLoading };
}
