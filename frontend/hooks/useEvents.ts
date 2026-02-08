import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { EVENTS_POLL_INTERVAL_MS, MAX_EVENTS_DISPLAY } from '@/lib/constants';
import type { StrategyEvent } from '@/lib/types';

export function useEvents() {
  const { data, error, isLoading } = useSWR<StrategyEvent[]>(
    `/api/strategy/events?limit=${MAX_EVENTS_DISPLAY}`,
    swrFetcher,
    { refreshInterval: EVENTS_POLL_INTERVAL_MS }
  );
  return { events: data, error, isLoading };
}
