import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { POLYMARKET_SIGNAL_POLL_MS } from '@/lib/constants';
import type { MacroSignalSnapshot, PolymarketSignalConfig } from '@/lib/types';

export function usePolymarketSignal() {
  const { data, error, isLoading, mutate } = useSWR<MacroSignalSnapshot>(
    '/api/polymarket/signal',
    swrFetcher,
    { refreshInterval: POLYMARKET_SIGNAL_POLL_MS }
  );
  return { signal: data, error, isLoading, refresh: mutate };
}

export function usePolymarketConfig() {
  const { data, error, isLoading, mutate } = useSWR<PolymarketSignalConfig>(
    '/api/polymarket/config',
    swrFetcher
  );
  return { config: data, error, isLoading, refresh: mutate };
}
