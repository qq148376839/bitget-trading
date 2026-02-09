import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import type { ContractSpecInfo } from '@/lib/types';

const SPEC_REFRESH_INTERVAL_MS = 60000; // 60s

export function useContractSpec(symbol: string | undefined) {
  const { data, error, isLoading } = useSWR<ContractSpecInfo>(
    symbol ? `/api/contracts/specs/${encodeURIComponent(symbol)}` : null,
    swrFetcher,
    { refreshInterval: SPEC_REFRESH_INTERVAL_MS }
  );
  return { spec: data, error, isLoading };
}
