import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { POLL_INTERVAL_MS } from '@/lib/constants';
import type { StrategyState } from '@/lib/types';

export function useStrategyStatus() {
  const { data, error, isLoading, mutate } = useSWR<StrategyState>(
    '/api/strategy/status',
    swrFetcher,
    { refreshInterval: POLL_INTERVAL_MS }
  );
  return { status: data, error, isLoading, refresh: mutate };
}
