import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { POLL_INTERVAL_MS } from '@/lib/constants';
import type { PnlSummary } from '@/lib/types';

export function usePnl() {
  const { data, error, isLoading } = useSWR<PnlSummary>(
    '/api/strategy/pnl',
    swrFetcher,
    { refreshInterval: POLL_INTERVAL_MS }
  );
  return { pnl: data, error, isLoading };
}
