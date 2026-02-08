import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { ORDERS_POLL_INTERVAL_MS } from '@/lib/constants';
import type { OrdersResponse } from '@/lib/types';

export function useOrders() {
  const { data, error, isLoading } = useSWR<OrdersResponse>(
    '/api/strategy/orders',
    swrFetcher,
    { refreshInterval: ORDERS_POLL_INTERVAL_MS }
  );
  return { orders: data, error, isLoading };
}
